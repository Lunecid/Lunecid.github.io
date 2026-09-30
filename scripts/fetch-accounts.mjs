// scripts/fetch-accounts.mjs — the fetch-accounts job's entry (account-link spec §5.1, §5.3, §5.4, R-3, R-10).
// `node scripts/fetch-accounts.mjs --out <dir>`: reads the seven ACCOUNT_* variables and STEAM_API_KEY from the
// environment, runs the four platforms in a fixed order, writes accounts/{enka-genshin,enka-zzz,steam}.json,
// accounts/img/* and links/riot.json under <dir>, and appends the "Account fetch" table to $GITHUB_STEP_SUMMARY.
// Node built-ins and scripts/accounts/* only (no npm ci in this job; fetch-accounts-deps.test.mjs). Never exits with a
// non-zero code: missing account data never fails a build.
// Output rule: the only log lines are `accounts: <platform> <ok|error:<reason>|skipped>`; no value, URL, response
// body or header is ever printed, here or in the summary (the key is masked by the runner, the IDs are not: R-14).
import { appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fetchGenshin } from './accounts/enka-genshin.mjs';
import { fetchZzz } from './accounts/enka-zzz.mjs';
import { fetchSteam } from './accounts/steam.mjs';
import { fetchRiotLinks } from './accounts/riot-links.mjs';
import { REASON_TEXT } from './accounts/reasons.mjs';
import { writeAtomic } from './accounts/safe-fetch.mjs';

/** @typedef {import('./accounts/reasons.mjs').AccountFailReason} AccountFailReason */
/** @typedef {import('./accounts/enka-common.mjs').PlatformResult | import('./accounts/steam.mjs').SteamResult | import('./accounts/riot-links.mjs').RiotResult} PlatformResult */

/** The eight names the job passes in (spec §7); nothing else is read from the environment. */
export const ENV_NAMES = /** @type {const} */ (['ACCOUNT_GENSHIN_UID', 'ACCOUNT_GENSHIN_NAME', 'ACCOUNT_ZZZ_UID', 'ACCOUNT_ZZZ_NAME', 'ACCOUNT_STEAM_ID64', 'ACCOUNT_STEAM_NAME', 'ACCOUNT_RIOT_ID', 'STEAM_API_KEY']);

/** Output files are fixed paths; nothing in a path comes from a variable or a response (spec §6.1). */
const FEED_FILES = Object.freeze({ 'enka-genshin': 'accounts/enka-genshin.json', 'enka-zzz': 'accounts/enka-zzz.json', steam: 'accounts/steam.json' });
const RIOT_FILE = 'links/riot.json';
const IMG_DIR = 'accounts/img';
const IMG_NAME = /^[0-9a-f]{12}\.(png|jpg|webp)$/;
const PLATFORMS = /** @type {const} */ (['enka-genshin', 'enka-zzz', 'steam', 'riot']);

/**
 * Runs the four platforms one after another (Enka asks for no bulk requests). Each fetcher catches its own errors; a
 * throw that still escapes becomes a skipped result with `bad-response`.
 * @param {Record<string, string | undefined>} env
 * @param {typeof fetch} fetchImpl
 * @param {() => Date} [now]
 * @returns {Promise<PlatformResult[]>}
 */
export async function fetchAccounts(env, fetchImpl, now = () => new Date()) {
  const deps = { fetchImpl, now };
  const runs = { 'enka-genshin': fetchGenshin, 'enka-zzz': fetchZzz, steam: fetchSteam, riot: fetchRiotLinks };
  /** @type {PlatformResult[]} */
  const results = [];
  for (const platform of PLATFORMS) {
    try {
      results.push(/** @type {PlatformResult} */ (await runs[platform](env, deps)));
    } catch {
      results.push(/** @type {PlatformResult} */ ({ platform, state: 'skipped', reason: 'bad-response' }));
    }
  }
  return results;
}

/**
 * Writes every result: all images first, then the feed JSON files (spec §5.4: a feed never names an image that is not
 * on disk yet), each through writeAtomic. Unknown platforms and malformed image names are never written.
 * @param {string} outDir @param {PlatformResult[]} results
 */
export async function writeAccounts(outDir, results) {
  /** @type {[string, string][]} */
  const json = [];
  for (const r of results) {
    if (r.state !== 'written') continue;
    if ('links' in r) {
      if (r.platform === 'riot') json.push([RIOT_FILE, `${JSON.stringify(r.links, null, 2)}\n`]);
      continue;
    }
    const file = Object.hasOwn(FEED_FILES, r.platform) ? FEED_FILES[/** @type {keyof typeof FEED_FILES} */ (r.platform)] : null;
    if (file === null || r.feed.platform !== r.platform) continue;
    for (const img of r.images) if (IMG_NAME.test(img.name)) await writeAtomic(join(outDir, IMG_DIR, img.name), img.bytes);
    json.push([file, `${JSON.stringify(r.feed, null, 2)}\n`]);
  }
  for (const [file, text] of json) await writeAtomic(join(outDir, file), text);
}

/**
 * Status and reason of one result, for the log line and the summary row.
 * @param {PlatformResult} r @returns {{ status: 'ok' | 'error' | 'skipped'; reason: AccountFailReason | null }}
 */
function outcome(r) {
  if (r.state === 'written') {
    if ('links' in r) return { status: 'ok', reason: null };
    return r.feed.status === 'ok' ? { status: 'ok', reason: null } : { status: 'error', reason: r.feed.reason ?? 'bad-response' };
  }
  return 'reason' in r && r.reason ? { status: 'error', reason: r.reason } : { status: 'skipped', reason: null };
}

/** @param {PlatformResult} r @returns {string} `accounts: <platform> <ok|error:<reason>|skipped>` */
export function logLine(r) {
  const o = outcome(r);
  return `accounts: ${r.platform} ${o.status === 'error' ? `error:${o.reason}` : o.status}`;
}

/** Table cells never break the table. @param {string} s */
const cell = (s) => s.replace(/\|/g, '\\|').replace(/\s+/g, ' ');

/**
 * The step summary (spec §5.3): heading "Account fetch", one row per platform with the reason code and the owner's
 * next step in Korean and English. No value, URL, response body or header.
 * @param {PlatformResult[]} results @returns {string}
 */
export function summaryMarkdown(results) {
  const rows = results.map((r) => {
    const o = outcome(r);
    const text = o.reason ? REASON_TEXT[o.reason] : null;
    return `| ${cell(r.platform)} | ${o.status} | ${o.reason ?? '-'} | ${text ? cell(text.ko) : '-'} | ${text ? cell(text.en) : '-'} |`;
  });
  return ['### Account fetch', '', '| platform | status | reason | 조치 | Action |', '|---|---|---|---|---|', ...rows, ''].join('\n');
}

/**
 * The whole job step, injectable for tests: fetch, write, one log line per platform, the summary.
 * @param {{ env: Record<string, string | undefined>; fetchImpl: typeof fetch; now?: () => Date; outDir: string;
 *   summaryFile?: string }} opts
 * @returns {Promise<PlatformResult[]>}
 */
export async function runFetchAccounts({ env, fetchImpl, now, outDir, summaryFile }) {
  const results = await fetchAccounts(env, fetchImpl, now);
  await writeAccounts(outDir, results);
  for (const r of results) console.log(logLine(r));
  if (summaryFile) await appendFile(summaryFile, summaryMarkdown(results));
  return results;
}

/** @param {string[]} argv @returns {string} */
function outArg(argv) {
  const i = argv.indexOf('--out');
  const v = i >= 0 ? argv[i + 1] : undefined;
  return v && !v.startsWith('--') ? v : 'account-feeds';
}

async function main() {
  try {
    /** @type {Record<string, string | undefined>} */
    const env = {};
    for (const name of ENV_NAMES) env[name] = process.env[name];
    await runFetchAccounts({ env, fetchImpl: globalThis.fetch, outDir: outArg(process.argv.slice(2)), summaryFile: process.env.GITHUB_STEP_SUMMARY || undefined });
  } catch {
    // Never block the build and never print the error (it could quote a path or a value): the cards stay hidden.
    console.log('accounts: run error:bad-response');
  }
  process.exitCode = 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
