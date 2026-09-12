import 'server-only';

/**
 * Per-user burst limit.
 *
 * Best effort only: serverless instances do not share memory, so this smooths
 * a single client hammering one instance. The ceiling that actually protects
 * against provider charges is the database budget in
 * public.consume_itinerary_budget().
 */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;

const hits = new Map<string, number[]>();

export function withinBurstLimit(userId: string): boolean {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((at) => now - at < WINDOW_MS);

  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(userId, recent);
    return false;
  }

  recent.push(now);
  hits.set(userId, recent);

  // Keep the map from growing without bound on a long-lived instance.
  if (hits.size > 500) {
    for (const [key, stamps] of hits) {
      if (stamps.every((at) => now - at >= WINDOW_MS)) hits.delete(key);
    }
  }
  return true;
}

/** Daily ceiling on outbound provider calls, 0 disables routing entirely. */
export function dailyRouteBudget(): number {
  const configured = Number(process.env.ITINERARY_DAILY_ROUTE_BUDGET ?? '500');
  return Number.isFinite(configured) && configured >= 0 ? Math.floor(configured) : 500;
}
