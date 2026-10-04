// Task 2 gate helper: shows (--info) or downloads (--only) ONE external file per call.
// Run only by the controller, and --only only after the user approved that exact item in chat.
// Final review fix 1 item 9: the SFX items (a sound-pack zip and a program downloaded and executed to convert it) were
// never approved (the site ships without sound effects) and are removed; this script only downloads and verifies files,
// it never runs anything it downloads.
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { GOATCOUNTER } from '../src/config.ts';

export const DEFAULT_STAGING = 'C:/Users/todtj/PycharmProjects/Portpolio/.superpowers/assets';
export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const UA = 'Mozilla/5.0 (compatible; Lunecid.github.io asset gate; +https://github.com/Lunecid)';

/** @typedef {{ id: string; kind: 'png' | 'jpg' | 'mp3' | 'js'; source?: string; page?: string; target: { root: 'staging' | 'repo'; path: string }; note: string }} Item */

/** @type {Item[]} */
export const ITEMS = [
  {
    id: 'character-remielle',
    kind: 'png',
    source: 'https://fastcdn.hoyoverse.com/content-v2/nap/164866/1dfdd503fd531512cbd3ba6f35d681ec_3901922974272680255.png',
    target: { root: 'staging', path: 'characters/remielle.png' },
    note: 'Remielle (Zenless Zone Zero) official art, 2347x1253 transparent PNG from the zenless.hoyoverse.com character list',
  },
  {
    id: 'character-eula',
    kind: 'png',
    source: 'https://act-webstatic.hoyoverse.com/upload/contentweb/2022/07/22/4c4b8babc68ffedce9bd5766b60e1ae5_9107021726085564898.png',
    target: { root: 'staging', path: 'characters/eula.png' },
    note: 'Eula (Genshin Impact) official art, 2254x1320 transparent PNG from genshin.hoyoverse.com (Mondstadt)',
  },
  {
    id: 'character-mona',
    kind: 'png',
    source: 'https://act-webstatic.hoyoverse.com/upload/contentweb/2022/07/22/9e4203089ad086d328973adf3f6e8c7b_528836259048237760.png',
    target: { root: 'staging', path: 'characters/mona.png' },
    note: 'Mona (Genshin Impact) official art, 2154x1320 transparent PNG from genshin.hoyoverse.com (Mondstadt)',
  },
  {
    id: 'bgm',
    kind: 'mp3',
    page: 'https://freemusicarchive.org/music/holiznacc0/lo-fi-and-chill/everything-you-ever-dreamed/',
    target: { root: 'repo', path: 'public/audio/bgm/everything-you-ever-dreamed.mp3' },
    note: '"Everything You Ever Dreamed." by HoliznaCC0 (Free Music Archive), CC0 1.0; the MP3 URL is read from the track page',
  },
  {
    id: 'goatcounter-script',
    kind: 'js',
    source: GOATCOUNTER.cdnSrc,
    target: { root: 'repo', path: 'public/js/count.v5.js' },
    note: 'GoatCounter count.v5.js (self-hosted copy); must hash to GOATCOUNTER.sri in src/config.ts',
  },
  // Character-card sources, cropped by scripts/assets/account-cards.mjs into src/assets/account-cards/ (dev time only).
  {
    id: 'card-source-ezreal',
    kind: 'jpg',
    source: 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Ezreal_0.jpg',
    target: { root: 'staging', path: 'account-cards/ezreal-splash.jpg' },
    note: 'Ezreal (League of Legends) splash art, 1215x717, from Riot Data Dragon; Legal Jibber Jabber, notice required',
  },
  {
    id: 'card-source-pengu',
    kind: 'png',
    // 16.19.1: the Data Dragon version read from api/versions.json on the download day (2026-10-04), written literally
    source: 'https://ddragon.leagueoflegends.com/cdn/16.19.1/img/tft-tactician/Tooltip_PenguKnight_Classic_Tier1.png',
    target: { root: 'staging', path: 'account-cards/pengu.png' },
    note: 'Pengu (Teamfight Tactics tactician), 512x344, from Riot Data Dragon 16.19.1; Legal Jibber Jabber, notice required',
  },
  {
    id: 'card-source-innkeeper',
    kind: 'jpg',
    source: 'https://bnetcmsus-a.akamaihd.net/cms/blog_header/r6/R6XIUXOQB0IT1698251687641.jpg',
    target: { root: 'staging', path: 'account-cards/innkeeper-header.jpg' },
    note: 'the innkeeper Harth Stonebrew (Hearthstone), 1520x540 header image of https://hearthstone.blizzard.com/en-us/news/24008694; official Blizzard art used with a source credit in the Blizzard notice',
  },
];

export function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

export function sri384(buf) {
  return `sha384-${createHash('sha384').update(buf).digest('base64')}`;
}

export function isPng(buf) {
  return buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
}

/** JPEG start of image and the first marker's prefix (FF D8 FF). */
export function isJpeg(buf) {
  return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}

/** ID3v2 tag ("ID3") or an MPEG audio frame sync (11 set bits). */
export function isMp3(buf) {
  if (buf.length < 3) return false;
  return (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0);
}

/** null when the bytes fit the item kind, else the reason. */
export function checkBytes(kind, buf) {
  if (kind === 'png') return isPng(buf) ? null : 'not a PNG file';
  if (kind === 'jpg') return isJpeg(buf) ? null : 'not a JPEG file';
  if (kind === 'mp3') return isMp3(buf) ? null : 'not an MP3 file (no ID3 tag or MPEG frame sync)';
  if (kind === 'js') {
    const got = sri384(buf);
    return got === GOATCOUNTER.sri ? null : `SRI mismatch: got ${got}, expected ${GOATCOUNTER.sri}`;
  }
  return `unknown kind ${kind}`;
}

/** The track page embeds the player JSON in data-track-info with a "fileUrl" (verified 2026-09-26). */
export function findFmaMp3(html) {
  const text = html.replace(/&quot;/g, '"').replace(/\\\//g, '/');
  const m = /"fileUrl":"(https:\/\/[^"]+\.mp3)"/.exec(text) ?? /(https:\/\/files\.freemusicarchive\.org\/[^"'\s<>]+\.mp3)/.exec(text);
  if (!m) throw new Error('no MP3 link on the FMA page (it may require sign-in): the user downloads the track and saves it as public/audio/bgm/everything-you-ever-dreamed.mp3');
  return m[1];
}

const CC0 = /publicdomain\/zero\/1\.0|\bCC0\b/;

async function getOk(url, fetchImpl, init = {}) {
  const res = await fetchImpl(url, { redirect: 'follow', ...init, headers: { 'user-agent': UA, ...(init.headers ?? {}) } });
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${url} -> HTTP ${res.status}`);
  return res;
}

/** Resolves the file URL of an item (page items must state CC0). */
export async function resolveSource(item, fetchImpl = fetch) {
  if (item.source) return item.source;
  const html = await (await getOk(item.page, fetchImpl)).text();
  if (!CC0.test(html)) throw new Error(`${item.page} does not state CC0: stop and ask the user`);
  if (item.kind === 'mp3') return findFmaMp3(html);
  throw new Error(`cannot resolve ${item.id}`);
}

export function targetPath(item, { staging, repoRoot = REPO_ROOT }) {
  return join(item.target.root === 'staging' ? staging : repoRoot, item.target.path);
}

/** HEAD request: what the controller shows before asking. bytes = null when the server sends no Content-Length. */
export async function describeItem(item, { fetchImpl = fetch, ...ctx }) {
  const url = await resolveSource(item, fetchImpl);
  const res = await getOk(url, fetchImpl, { method: 'HEAD' });
  const length = res.headers.get('content-length');
  return {
    id: item.id,
    url,
    target: targetPath(item, ctx),
    bytes: length === null || length === '0' ? null : Number(length),
    note: item.note,
  };
}

async function writeChecked(item, path, buf) {
  const problem = checkBytes(item.kind, buf);
  if (problem) throw new Error(`${item.id}: ${problem} (nothing written)`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, buf);
  return { path, bytes: buf.length, sha256: sha256(buf) };
}

/** Downloads, verifies and writes one item. Returns the written file and notes. */
export async function downloadItem(item, { fetchImpl = fetch, ...ctx }) {
  const url = await resolveSource(item, fetchImpl);
  const buf = Buffer.from(await (await getOk(url, fetchImpl)).arrayBuffer());
  const file = await writeChecked(item, targetPath(item, { ...ctx, repoRoot: ctx.repoRoot ?? REPO_ROOT }), buf);
  return { id: item.id, url, files: [file], notes: [] };
}

async function main() {
  const [mode, id] = process.argv.slice(2);
  const item = ITEMS.find((i) => i.id === id);
  if (!item || (mode !== '--info' && mode !== '--only')) {
    console.error(`usage: node scripts/download-external-assets.mjs --info|--only <${ITEMS.map((i) => i.id).join('|')}>`);
    process.exitCode = 1;
    return;
  }
  const ctx = { staging: process.env.ASSET_STAGING ?? DEFAULT_STAGING, repoRoot: REPO_ROOT };
  try {
    if (mode === '--info') {
      const info = await describeItem(item, { ...ctx, fetchImpl: fetch });
      const size = info.bytes === null ? 'unknown (the server sends no Content-Length)' : `${info.bytes} bytes (${(info.bytes / 1048576).toFixed(2)} MiB)`;
      console.log(`${info.id}\n  source:  ${info.url}\n  target:  ${info.target}\n  size:    ${size}\n  note:    ${info.note}`);
    } else {
      const result = await downloadItem(item, { ...ctx, fetchImpl: fetch });
      for (const f of result.files) console.log(`${result.id}: wrote ${f.path} (${f.bytes} bytes, sha256 ${f.sha256})`);
      for (const n of result.notes) console.log(`${result.id}: ${n}`);
    }
  } catch (err) {
    console.error(`${item.id}: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
