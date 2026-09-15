import 'server-only';
import { cache } from 'react';
import { createSupabaseServerClient } from '../supabase/server';
import { getCurrentUser } from '../auth';
import { numericToString, toMinorUnits } from '../money';
import type { TripContext, TripMemberView, TripSummaryView } from '../types';
import type { TripMemberRow } from '../supabase/database.types';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

async function attachProfiles(
  members: TripMemberRow[],
  currentUserId: string,
): Promise<TripMemberView[]> {
  const supabase = await createSupabaseServerClient();
  const userIds = [...new Set(members.map((member) => member.user_id).filter(Boolean))] as string[];

  const avatarByUser = new Map<string, string | null>();
  if (userIds.length > 0) {
    const { data } = await supabase.from('profiles').select('id, avatar_url').in('id', userIds);
    for (const profile of data ?? []) {
      avatarByUser.set(profile.id, profile.avatar_url);
    }
  }

  return members.map((member) => ({
    id: member.id,
    userId: member.user_id,
    displayName: member.display_name,
    role: member.role,
    removedAt: member.removed_at,
    avatarUrl: member.user_id ? avatarByUser.get(member.user_id) ?? null : null,
    isMe: member.user_id === currentUserId,
  }));
}

/**
 * Loads a trip the current user is an active member of.
 * Returns null when the trip does not exist or the user has no access — RLS
 * makes both cases look identical, which is exactly what we want.
 */
export const getTripContext = cache(async function getTripContext(
  tripId: string,
): Promise<TripContext | null> {
  if (!isUuid(tripId)) return null;

  const supabase = await createSupabaseServerClient();
  const user = await getCurrentUser();
  if (!user) return null;

  const { data: trip } = await supabase
    .from('trips')
    .select('*')
    .eq('id', tripId)
    .maybeSingle();

  if (!trip) return null;

  const [{ data: memberRows }, { data: currencyRows }] = await Promise.all([
    supabase.from('trip_members').select('*').eq('trip_id', tripId).order('joined_at'),
    supabase.from('trip_currencies').select('*').eq('trip_id', tripId).order('currency_code'),
  ]);

  const allMembers = await attachProfiles(memberRows ?? [], user.id);
  const members = allMembers.filter((member) => member.removedAt === null);
  const currentMember = members.find((member) => member.isMe);
  if (!currentMember) return null;

  const currencies = (currencyRows ?? []).map((currency) => ({
    code: currency.currency_code,
    rate: numericToString(currency.default_exchange_rate),
  }));

  if (!currencies.some((currency) => currency.code === trip.base_currency)) {
    currencies.unshift({ code: trip.base_currency, rate: '1' });
  }

  return {
    trip: {
      id: trip.id,
      ownerId: trip.owner_id,
      name: trip.name,
      destination: trip.destination,
      startDate: trip.start_date,
      endDate: trip.end_date,
      baseCurrency: trip.base_currency,
      inviteToken: trip.invite_token,
      inviteTokenCreatedAt: trip.invite_token_created_at,
    },
    members,
    allMembers,
    currentMember,
    isOwner: trip.owner_id === user.id,
    currencies,
  };
});

/** Every trip the signed-in user owns or has joined, newest first. */
export async function listTripSummaries(): Promise<TripSummaryView[]> {
  const supabase = await createSupabaseServerClient();
  const user = await getCurrentUser();
  if (!user) return [];

  // Start from the user's own memberships rather than from every trip that
  // exists. Without this the query asked for the whole trips table and let row
  // level security discard the rest, which meant the work grew with the number
  // of trips *everybody* had: with 403 trips in the table it read 1,416 pages
  // and ran the membership check 403 times to return 12 rows.
  const { data: myMemberships, error: membershipError } = await supabase
    .from('trip_members')
    .select('trip_id')
    .eq('user_id', user.id)
    .is('removed_at', null);

  if (membershipError) throw new Error(membershipError.message);

  const myTripIds = [...new Set((myMemberships ?? []).map((row) => row.trip_id))];
  if (myTripIds.length === 0) return [];

  const { data: trips, error } = await supabase
    .from('trips')
    .select('id, name, destination, start_date, end_date, base_currency, owner_id, created_at')
    .in('id', myTripIds)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  if (!trips || trips.length === 0) return [];

  const tripIds = trips.map((trip) => trip.id);

  const [{ data: memberRows }, { data: expenseRows }] = await Promise.all([
    supabase.from('trip_members').select('trip_id, removed_at').in('trip_id', tripIds),
    supabase.from('expenses').select('trip_id, base_amount').in('trip_id', tripIds).is('deleted_at', null),
  ]);

  const memberCounts = new Map<string, number>();
  for (const member of memberRows ?? []) {
    if (member.removed_at !== null) continue;
    memberCounts.set(member.trip_id, (memberCounts.get(member.trip_id) ?? 0) + 1);
  }

  const totals = new Map<string, number>();
  const currencyByTrip = new Map(trips.map((trip) => [trip.id, trip.base_currency]));
  for (const expense of expenseRows ?? []) {
    const currency = currencyByTrip.get(expense.trip_id) ?? 'THB';
    totals.set(
      expense.trip_id,
      (totals.get(expense.trip_id) ?? 0) + toMinorUnits(expense.base_amount, currency),
    );
  }

  return trips.map((trip) => ({
    id: trip.id,
    name: trip.name,
    destination: trip.destination,
    startDate: trip.start_date,
    endDate: trip.end_date,
    baseCurrency: trip.base_currency,
    memberCount: memberCounts.get(trip.id) ?? 0,
    totalMinor: totals.get(trip.id) ?? 0,
    role: trip.owner_id === user.id ? ('owner' as const) : ('member' as const),
  }));
}

/** Invitation preview: name, dates and member count only — never the roster. */
export async function getTripPreview(inviteToken: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('trip_preview_by_token', { p_token: inviteToken });
  if (error) return null;
  const preview = Array.isArray(data) ? data[0] : null;
  return preview ?? null;
}
