// src/lib/stats-hygiene.ts — final review fix 1 item 8. Import-free, erasable TypeScript: scripts/fetch-goatcounter.mjs
// imports it with plain Node (type stripping), and the /stats/ view uses it again at build time.
//
// GoatCounter's "top pages" and "referrers" are text any visitor controls: the count script also runs on the 404 page
// (GitHub Pages serves it for every unknown URL), and anyone can call the public /count endpoint with their own path
// and referrer. So /stats/ publishes only
// - paths that are real site routes (the route table, src/lib/routes.ts allRoutes(); query string and hash dropped),
// - referrers reduced to a lowercase hostname,
// each under a length cap, and drops everything else. Duplicates left after the reduction are merged (counts added).

export const MAX_PATH_LENGTH = 100;
const MAX_REFERRER_INPUT_LENGTH = 512;
export const MAX_HOST_LENGTH = 64;
export const MAX_TITLE_LENGTH = 120;
export const MAX_ROWS = 10;

export interface CleanPage {
  path: string;
  title: string;
  count: number;
}

export interface CleanReferrer {
  /** null = direct visit (the view shows its "direct" label). */
  name: string | null;
  count: number;
}

/** Labels of letters/digits/hyphens, at least one dot, a top-level label that starts with a letter (no bare IPs). */
const HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const UNSAFE = /[\s<>"'`\\{}|^]/;

/** A non-negative whole count; anything else counts as 0. */
function countOf(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** '/records/?utm_source=x#top' → '/records/' when that is one of `routes`; anything else (or too long) → null. */
export function sitePath(path: unknown, routes: readonly string[]): string | null {
  if (typeof path !== 'string' || path.length === 0 || path.length > MAX_PATH_LENGTH) return null;
  const bare = path.split(/[?#]/, 1)[0] ?? '';
  return routes.includes(bare) ? bare : null;
}

/**
 * A referrer reduced to its lowercase hostname ('github.com/Lunecid' → 'github.com'). Empty or missing → null (a direct
 * visit). Anything that is not a plain hostname (a campaign name, script-like text, an IP, an over-long value) →
 * undefined, i.e. dropped.
 */
export function referrerHost(name: unknown): string | null | undefined {
  if (name === null || name === undefined) return null;
  if (typeof name !== 'string') return undefined;
  const raw = name.trim();
  if (raw === '') return null;
  if (raw.length > MAX_REFERRER_INPUT_LENGTH || UNSAFE.test(raw)) return undefined;
  let host: string;
  try {
    host = new URL(SCHEME.test(raw) ? raw : `https://${raw}`).hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return undefined;
  }
  return host.length <= MAX_HOST_LENGTH && HOSTNAME.test(host) ? host : undefined;
}

/** Title text without control characters, trimmed and capped (GoatCounter reports it; the view does not show it). */
function cleanTitle(value: unknown): string {
  if (typeof value !== 'string') return '';
  return Array.from(value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()).slice(0, MAX_TITLE_LENGTH).join('');
}

/** Real site routes only, merged by route, most visited first, at most `limit` rows. */
export function cleanPages(pages: readonly { path?: unknown; title?: unknown; count?: unknown }[], routes: readonly string[], limit: number = MAX_ROWS): CleanPage[] {
  const byPath = new Map<string, CleanPage>();
  for (const page of pages) {
    const path = sitePath(page.path, routes);
    if (path === null) continue;
    const count = countOf(page.count);
    const seen = byPath.get(path);
    if (seen) seen.count += count;
    else byPath.set(path, { path, title: cleanTitle(page.title), count });
  }
  return [...byPath.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}

/** Hostnames (or null for direct visits) only, merged by host, most frequent first, at most `limit` rows. */
export function cleanReferrers(referrers: readonly { name?: unknown; count?: unknown }[], limit: number = MAX_ROWS): CleanReferrer[] {
  const byHost = new Map<string | null, CleanReferrer>();
  for (const referrer of referrers) {
    const name = referrerHost(referrer.name);
    if (name === undefined) continue;
    const count = countOf(referrer.count);
    const seen = byHost.get(name);
    if (seen) seen.count += count;
    else byHost.set(name, { name, count });
  }
  return [...byHost.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}
