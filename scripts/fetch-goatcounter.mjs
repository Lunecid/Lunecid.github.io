// GoatCounter API v0 → src/data/generated/stats.json (spec §7; contract §5.7).
// The site code comes only from src/config.ts; env GOATCOUNTER_CODE is a local override that must equal it.
// Never exits non-zero: a failed fetch hides the stats sections instead of blocking a deploy.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { GOATCOUNTER } from '../src/config.ts';
import { allRoutes } from '../src/lib/routes.ts';
import { cleanPages, cleanReferrers } from '../src/lib/stats-hygiene.ts';

const MAX_AGE_DAYS = 7;
const DAY_MS = 86_400_000;
/** Rows asked for per list (fix round 2 item 6): more than the published top 10 (stats-hygiene MAX_ROWS), so spam
 *  paths or referrers at the top cannot crowd the real routes out before the cleaning drops them. */
const FETCH_ROWS = 50;

/** @typedef {import('../src/lib/generated').StatsData} StatsData */
/** @typedef {{ ok: boolean; status: number; json(): Promise<any> }} FetchResponse */
/** @typedef {(url: URL, init: { headers: Record<string, string>; signal?: AbortSignal }) => Promise<FetchResponse>} FetchImpl */

/**
 * @param {string | undefined} envCode
 * @param {string | null} configCode
 * @returns {{ code: string | null; error: string | null }}
 */
export function resolveCode(envCode, configCode) {
  const env = (envCode ?? '').trim();
  if (env === '') return { code: configCode, error: null };
  if (env !== configCode) return { code: null, error: 'GOATCOUNTER_CODE differs from src/config.ts' };
  return { code: env, error: null };
}

/**
 * Pure: GoatCounter API responses → StatsData. Final review fix 1 item 8: pages are only real site routes (`routes`,
 * default allRoutes()) and referrers only hostnames, both length-capped (src/lib/stats-hygiene.ts); the rest is dropped.
 * @param {{ status: 'ok' | 'skipped' | 'error'; total?: any; hits?: any; refs?: any; range?: { start: string; end: string } | null; errors?: string[]; authFailed?: boolean; now?: Date; routes?: readonly string[] }} input
 * @returns {StatsData}
 */
export function shapeStats({ status, total = null, hits = null, refs = null, range = null, errors = [], authFailed = false, now = new Date(), routes = allRoutes() }) {
  const ok = status === 'ok';
  return {
    schemaVersion: 1,
    source: 'goatcounter',
    status,
    fetchedAt: now.toISOString(),
    maxAgeDays: MAX_AGE_DAYS,
    authFailed,
    range,
    total: ok && total ? Number(total.total ?? 0) : null,
    daily: ok && total ? (total.stats ?? []).map((s) => ({ day: String(s.day).slice(0, 10), count: Number(s.daily ?? 0) })) : [],
    pages: ok && hits && Array.isArray(hits.hits) ? cleanPages(hits.hits.filter((h) => h && !h.event), routes) : [],
    referrers: ok && refs && Array.isArray(refs.stats) ? cleanReferrers(refs.stats.filter(Boolean)) : [],
    errors,
  };
}

/**
 * Three calls (/stats/total, /stats/hits, /stats/toprefs) over the last `days` days, rounded to the hour.
 * @param {{ code: string | null; token: string; fetchImpl?: FetchImpl; now?: Date; days?: number; pauseMs?: number }} opts
 * @returns {Promise<StatsData>}
 */
export async function fetchStats({ code, token, fetchImpl = fetch, now = new Date(), days = 30, pauseMs = 300 }) {
  if (!code) return shapeStats({ status: 'skipped', errors: ['no GoatCounter site code in src/config.ts'], now });
  if (!token) return shapeStats({ status: 'skipped', errors: ['GOATCOUNTER_TOKEN not set'], now });

  const end = new Date(now.getTime());
  end.setUTCMinutes(0, 0, 0);
  const start = new Date(end.getTime() - days * DAY_MS);
  const range = { start: start.toISOString(), end: end.toISOString() };
  let authFailed = false;

  /** @param {string} path @param {Record<string, string | number>} params */
  const api = async (path, params) => {
    const url = new URL(`https://${code}.goatcounter.com/api/v0${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    const res = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    if (pauseMs > 0) await new Promise((r) => setTimeout(r, pauseMs)); // API limit: 4 requests/second
    if (res.status === 401 || res.status === 403) authFailed = true;
    if (!res.ok) throw new Error(`GoatCounter ${path} -> ${res.status}`);
    return res.json();
  };

  try {
    const total = await api('/stats/total', range);
    const hits = await api('/stats/hits', { ...range, limit: FETCH_ROWS });
    const refs = await api('/stats/toprefs', { ...range, limit: FETCH_ROWS });
    return shapeStats({ status: 'ok', total, hits, refs, range, now });
  } catch (e) {
    return shapeStats({ status: 'error', range, errors: [e instanceof Error ? e.message : String(e)], authFailed, now });
  }
}

/**
 * @param {StatsData} data
 * @param {string} outDir
 * @returns {Promise<string>} the written file path
 */
export async function writeStats(data, outDir) {
  await mkdir(outDir, { recursive: true });
  const file = join(outDir, 'stats.json');
  await writeFile(file, JSON.stringify(data, null, 2) + '\n');
  return file;
}

async function main() {
  try {
    const { code, error } = resolveCode(process.env.GOATCOUNTER_CODE, GOATCOUNTER.code);
    const data = error
      ? shapeStats({ status: 'error', errors: [error] })
      : await fetchStats({ code, token: process.env.GOATCOUNTER_TOKEN ?? '' });
    await writeStats(data, 'src/data/generated');
    console.log(`stats.json status=${data.status} total=${data.total} pages=${data.pages.length} refs=${data.referrers.length} authFailed=${data.authFailed}`);
  } catch (err) {
    console.error('fetch-goatcounter: could not write stats.json', err);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
