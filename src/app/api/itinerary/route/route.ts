import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getTripContext } from '@/lib/queries/trips';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getRouteProvider } from '@/lib/itinerary/providers';
import { ROUTE_STATUS_MESSAGES, type RouteResult } from '@/lib/itinerary/providers/types';
import { dailyRouteBudget, withinBurstLimit } from '@/lib/itinerary/rate-limit';
import { TRANSPORT_MODES } from '@/lib/itinerary/schedule';

const coordinate = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
});

const requestSchema = z.object({
  tripId: z.string().uuid(),
  mode: z.enum(TRANSPORT_MODES),
  origin: coordinate,
  destination: coordinate,
  departureIso: z.string().datetime().nullable().optional(),
});

function deny(status: RouteResult['status'], httpStatus = 200) {
  return NextResponse.json(
    {
      status,
      provider: getRouteProvider().id,
      alternatives: [],
      attribution: null,
      message: ROUTE_STATUS_MESSAGES[status],
    } satisfies RouteResult,
    { status: httpStatus },
  );
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid request' }, { status: 400 });

  // Membership, not just authentication: a signed-in stranger gets nothing.
  const context = await getTripContext(parsed.data.tripId);
  if (!context) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  if (!withinBurstLimit(user.id)) return deny('rate_limited', 429);

  const provider = getRouteProvider();
  if (provider.id === 'none') return deny('not_configured');
  if (parsed.data.mode === 'transit' && !provider.supportsTransit) {
    return deny('unsupported_mode');
  }

  // Hard ceiling before the outbound call, so the budget cannot be overshot.
  const limit = dailyRouteBudget();
  if (limit === 0) return deny('quota_exhausted');
  const { data: allowed } = await supabase.rpc('consume_itinerary_budget', {
    p_daily_limit: limit,
  });
  if (!allowed) return deny('quota_exhausted');

  try {
    const result = await provider.route({
      mode: parsed.data.mode,
      origin: parsed.data.origin,
      destination: parsed.data.destination,
      departureIso: parsed.data.departureIso ?? null,
    });
    return NextResponse.json(result);
  } catch {
    return deny('provider_error');
  }
}
