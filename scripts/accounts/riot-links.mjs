// scripts/accounts/riot-links.mjs — the two outbound profile links from ACCOUNT_RIOT_ID (account-link spec §3.4, §6.6).
// No Riot API: parseRiotId → riotLinks → HREF_ALLOW, then the existence check the owner switched on (Q7 "켬"). LoL and
// TFT are separate tiles (OWNER 2026-10-01 OQ-2, plan DV-27), so each link is checked and dropped on its own:
//   - op.gg GET that answers a clear 404 → no `lol`;
//   - lolchess.gg GET, not followed, whose Location contains `/search?` → no `tft`;
//   - a network error, 403, 5xx, a timeout or anything else keeps the link (CI IPs may be blocked; a link that passed
//     the rules does no harm). Both dropped → no file.
// There is no identity value to compare (the management section asks for the Riot ID twice instead). Nothing here logs.
import { safeFetch } from './safe-fetch.mjs';
import { HREF_ALLOW, normalize, parseRiotId, riotLinks } from '../../src/lib/account-ids.ts';

/** @typedef {import('./reasons.mjs').AccountFailReason} AccountFailReason */
/**
 * @typedef {{ schemaVersion: 1; platform: 'riot'; status: 'ok'; fetchedAt: string; riotId: string;
 *   links: { lol?: string; tft?: string } }} RiotLinks
 * @typedef {{ platform: 'riot'; state: 'skipped'; reason?: AccountFailReason }
 *   | { platform: 'riot'; state: 'written'; links: RiotLinks }} RiotResult
 *   `reason` on a skipped result says why no file was written although the variable is set (step summary only).
 * @typedef {{ fetchImpl: typeof fetch; now: () => Date; timeoutMs?: number }} RiotDeps
 */

const PLATFORM = 'riot';

/** @param {string} href @param {RiotDeps} deps @returns {Promise<boolean>} false only on a clear 404 */
async function lolExists(href, deps) {
  const res = await safeFetch(href, { kind: 'json', budget: { used: 0 }, fetchImpl: deps.fetchImpl, timeoutMs: deps.timeoutMs });
  return !(!res.ok && res.error === 'http' && res.status === 404);
}

/** @param {string} href @param {RiotDeps} deps @returns {Promise<boolean>} false only on a redirect to a search page */
async function tftExists(href, deps) {
  const res = await safeFetch(href, { kind: 'json', followRedirects: false, budget: { used: 0 }, fetchImpl: deps.fetchImpl, timeoutMs: deps.timeoutMs });
  return !(res.ok && res.status >= 300 && res.status <= 399 && typeof res.location === 'string' && res.location.includes('/search?'));
}

/**
 * @param {Record<string, string | undefined>} env ACCOUNT_RIOT_ID
 * @param {RiotDeps} deps
 * @returns {Promise<RiotResult>}
 */
export async function fetchRiotLinks(env, deps) {
  const raw = env.ACCOUNT_RIOT_ID;
  if (typeof raw !== 'string' || raw.trim() === '') return { platform: PLATFORM, state: 'skipped' };
  // Invalid ID → no file and zero requests.
  const riotId = parseRiotId(raw) ? normalize(raw) : null;
  const built = riotId === null ? null : riotLinks(riotId);
  if (riotId === null || built === null || !HREF_ALLOW.lol.test(built.lol) || !HREF_ALLOW.tft.test(built.tft)) {
    return { platform: PLATFORM, state: 'skipped', reason: 'invalid-id' };
  }
  try {
    const now = deps.now();
    /** @type {{ lol?: string; tft?: string }} */
    const links = {};
    if (await lolExists(built.lol, deps).catch(() => true)) links.lol = built.lol;
    if (await tftExists(built.tft, deps).catch(() => true)) links.tft = built.tft;
    // Both sites said "no such player": nothing to link (reported like a missing account).
    if (!links.lol && !links.tft) return { platform: PLATFORM, state: 'skipped', reason: 'http-404' };
    return { platform: PLATFORM, state: 'written', links: { schemaVersion: 1, platform: PLATFORM, status: 'ok', fetchedAt: now.toISOString(), riotId, links } };
  } catch {
    return { platform: PLATFORM, state: 'skipped', reason: 'bad-response' };
  }
}
