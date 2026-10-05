// Character-card art (dev time only; never imported by the build, never fetches): crops each card's source to a
// head-and-shoulders window and writes a 256×280 WebP (2× the cards' 128×140 art box) into src/assets/account-cards/,
// with a provenance manifest (sources.json). Sources are the committed HoYoverse PNGs and three files that
// scripts/download-external-assets.mjs stages under ASSET_STAGING; the staged files are never committed.
//   node scripts/assets/account-cards.mjs --build    writes the cards and sources.json (every source must be present)
//   node scripts/assets/account-cards.mjs --verify   re-derives every card whose source is present and compares hashes
// File names are neutral (card-<n>): no character or game name reaches a URL.
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { DEFAULT_STAGING, ITEMS } from '../download-external-assets.mjs';

export const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const OUT_DIR = 'src/assets/account-cards';
export const SIZE = { width: 256, height: 280 };
export const RETRIEVED = '2026-10-04';

/**
 * Each crop keeps the art box's 128:140 aspect; the card shows it in a 128×140 box. Eula and Remielle are cropped from
 * the committed 1600px-wide PNGs, Ezreal from the splash (head and shoulders without heavy upscaling), Pengu from the
 * tactician tooltip, and the innkeeper from the news header (a 0.71× downscale).
 */
export const CARDS = [
  { out: 'card-1.webp', tile: 'genshin', character: 'Eula', from: { repo: 'src/assets/characters/eula.png' }, crop: { left: 725, top: 125, width: 421, height: 460 } },
  { out: 'card-2.webp', tile: 'zzz', character: 'Remielle', from: { repo: 'src/assets/characters/remielle.png' }, crop: { left: 830, top: 140, width: 210, height: 230 } },
  { out: 'card-3.webp', tile: 'lol', character: 'Ezreal', from: { staging: 'account-cards/ezreal-splash.jpg', item: 'card-source-ezreal' }, crop: { left: 650, top: 90, width: 230, height: 252 } },
  { out: 'card-4.webp', tile: 'tft', character: 'Pengu', from: { staging: 'account-cards/pengu.png', item: 'card-source-pengu' }, crop: { left: 140, top: 30, width: 260, height: 284 } },
  {
    out: 'card-5.webp',
    tile: 'hearthstone',
    character: 'Harth Stonebrew',
    from: { staging: 'account-cards/innkeeper-header.jpg', item: 'card-source-innkeeper', page: 'https://hearthstone.blizzard.com/en-us/news/24008694' },
    crop: { left: 1104, top: 146, width: 360, height: 394 },
  },
];

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

export function sourcePath(card, { staging, repoRoot = REPO_ROOT }) {
  return card.from.repo ? join(repoRoot, card.from.repo) : join(staging, card.from.staging);
}

/** The manifest's source block: the repo path, or the downloader item with its URL (+ Data Dragon version, page). */
export function describeSource(card) {
  if (card.from.repo) return { kind: 'repo', path: card.from.repo };
  const item = ITEMS.find((i) => i.id === card.from.item);
  if (!item?.source) throw new Error(`${card.out}: no downloader item ${card.from.item}`);
  const ddVersion = /\/cdn\/(\d+\.\d+\.\d+)\//.exec(item.source)?.[1];
  return { kind: 'download', item: item.id, url: item.source, ...(ddVersion ? { ddVersion } : {}), ...(card.from.page ? { page: card.from.page } : {}) };
}

/** The card's WebP bytes: crop, lanczos3 to 256×280, q80 / alpha q85; sharp writes no EXIF, XMP, IPTC or ICC. */
export function renderCard(card, sourceBuf) {
  return sharp(sourceBuf)
    .extract(card.crop)
    .resize(SIZE.width, SIZE.height, { kernel: 'lanczos3' })
    .webp({ quality: 80, alphaQuality: 85 })
    .toBuffer();
}

export async function build({ staging, repoRoot = REPO_ROOT }) {
  const missing = CARDS.map((c) => sourcePath(c, { staging, repoRoot })).filter((p) => !existsSync(p));
  if (missing.length) throw new Error(`missing sources (download them first): ${missing.join(', ')}`);
  await mkdir(join(repoRoot, OUT_DIR), { recursive: true });
  const entries = [];
  for (const card of CARDS) {
    const src = await readFile(sourcePath(card, { staging, repoRoot }));
    const out = await renderCard(card, src);
    await writeFile(join(repoRoot, OUT_DIR, card.out), out);
    entries.push({
      file: card.out,
      tile: card.tile,
      character: card.character,
      source: describeSource(card),
      sourceSha256: sha256(src),
      crop: card.crop,
      width: SIZE.width,
      height: SIZE.height,
      outputSha256: sha256(out),
      retrieved: RETRIEVED,
    });
  }
  await writeFile(join(repoRoot, OUT_DIR, 'sources.json'), `${JSON.stringify(entries, null, 2)}\n`);
  return entries;
}

/** Re-derives every manifest entry whose source is present; a staged source missing on this machine is skipped. */
export async function verify({ staging, repoRoot = REPO_ROOT }) {
  const manifest = JSON.parse(await readFile(join(repoRoot, OUT_DIR, 'sources.json'), 'utf8'));
  const checked = [];
  const skipped = [];
  const mismatches = [];
  for (const card of CARDS) {
    const entry = manifest.find((e) => e.file === card.out);
    if (!entry) {
      mismatches.push(`${card.out}: no manifest entry`);
      continue;
    }
    const path = sourcePath(card, { staging, repoRoot });
    if (!existsSync(path)) {
      skipped.push(card.out);
      continue;
    }
    checked.push(card.out);
    const src = await readFile(path);
    const committed = await readFile(join(repoRoot, OUT_DIR, card.out));
    if (sha256(src) !== entry.sourceSha256) mismatches.push(`${card.out}: source sha256 ${sha256(src)} != ${entry.sourceSha256}`);
    if (sha256(committed) !== entry.outputSha256) mismatches.push(`${card.out}: committed file differs from the manifest`);
    const out = await renderCard(card, src);
    if (sha256(out) !== entry.outputSha256) mismatches.push(`${card.out}: re-derived ${sha256(out)} != ${entry.outputSha256}`);
  }
  return { checked, skipped, mismatches };
}

async function main() {
  const mode = process.argv[2];
  const ctx = { staging: process.env.ASSET_STAGING ?? DEFAULT_STAGING, repoRoot: REPO_ROOT };
  if (mode === '--build') {
    for (const e of await build(ctx)) console.log(`${e.file}: ${e.character} ${JSON.stringify(e.crop)} -> sha256 ${e.outputSha256}`);
  } else if (mode === '--verify') {
    const { checked, skipped, mismatches } = await verify(ctx);
    console.log(`checked: ${checked.join(', ') || 'none'}`);
    if (skipped.length) console.log(`skipped (staged source not on this machine): ${skipped.join(', ')}`);
    for (const m of mismatches) console.error(m);
    if (mismatches.length) process.exitCode = 1;
  } else {
    console.error('usage: node scripts/assets/account-cards.mjs --build|--verify');
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
