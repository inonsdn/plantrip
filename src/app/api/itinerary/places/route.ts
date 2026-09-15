import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getTripContext } from '@/lib/queries/trips';
import { getCurrentUser } from '@/lib/auth';
import { getRouteProvider } from '@/lib/itinerary/providers';
import { ROUTE_STATUS_MESSAGES, type PlaceSearchResult } from '@/lib/itinerary/providers/types';
import { withinBurstLimit } from '@/lib/itinerary/rate-limit';

const searchSchema = z.object({
  tripId: z.string().uuid(),
  query: z.string().trim().min(1).max(120),
  near: z
    .object({
      latitude: z.number().finite().min(-90).max(90),
      longitude: z.number().finite().min(-180).max(180),
    })
    .nullable()
    .optional(),
});

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = searchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid request' }, { status: 400 });

  const context = await getTripContext(parsed.data.tripId);
  if (!context) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const provider = getRouteProvider();

  if (!withinBurstLimit(user.id)) {
    return NextResponse.json({
      status: 'rate_limited',
      provider: provider.id,
      results: [],
      attribution: null,
      message: ROUTE_STATUS_MESSAGES.rate_limited,
    } satisfies PlaceSearchResult);
  }

  try {
    return NextResponse.json(await provider.searchPlaces(parsed.data.query, parsed.data.near ?? undefined));
  } catch {
    return NextResponse.json({
      status: 'provider_error',
      provider: provider.id,
      results: [],
      attribution: null,
      message: ROUTE_STATUS_MESSAGES.provider_error,
    } satisfies PlaceSearchResult);
  }
}
