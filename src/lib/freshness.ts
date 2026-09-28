// src/lib/freshness.ts — the ONLY freshness rule for build-time data (spec §7.1).
// Side-effect free and import-free: used by server code, React islands and src/scripts/stale-guard.ts.

const DAY_MS = 86_400_000;
const FUTURE_TOLERANCE_MS = 5 * 60_000;
const DEFAULT_MAX_AGE_DAYS = 7;

/**
 * false when d is missing, fetchedAt is missing/unparseable/in the future (more than 5 minutes ahead),
 * or now - fetchedAt > maxAgeDays (default 7) days; exactly maxAgeDays is still fresh.
 */
export function isFresh(d: { fetchedAt?: string; maxAgeDays?: number } | undefined, now: number = Date.now()): boolean {
  if (!d || typeof d.fetchedAt !== 'string') return false;
  const fetched = Date.parse(d.fetchedAt);
  if (Number.isNaN(fetched)) return false;
  if (fetched - now > FUTURE_TOLERANCE_MS) return false;
  const maxAgeDays =
    typeof d.maxAgeDays === 'number' && Number.isFinite(d.maxAgeDays) && d.maxAgeDays >= 0 ? d.maxAgeDays : DEFAULT_MAX_AGE_DAYS;
  return now - fetched <= maxAgeDays * DAY_MS;
}
