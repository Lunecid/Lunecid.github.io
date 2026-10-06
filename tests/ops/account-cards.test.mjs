// The character-card art: five 256×280 WebP crops (2× the cards' 128×140 art box) made by
// scripts/assets/account-cards.mjs from the committed HoYoverse PNGs and three staged downloads, with a provenance
// manifest. The script runs at dev time only; nothing fetches an image at build or run time.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { pruneCardOriginals } from '../../scripts/assets/prune-card-originals.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const STAGING = process.env.ASSET_STAGING ?? 'C:/Users/todtj/PycharmProjects/Portpolio/.superpowers/assets';
const SCRIPT = '../../scripts/assets/account-cards.mjs';
const DIR = 'src/assets/account-cards';
const FILES = ['card-1.webp', 'card-2.webp', 'card-3.webp', 'card-4.webp', 'card-5.webp'];
const PAGE = 'https://hearthstone.blizzard.com/en-us/news/24008694';

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const manifest = () => JSON.parse(readFileSync(join(ROOT, DIR, 'sources.json'), 'utf8'));
const byFile = () => Object.fromEntries(manifest().map((e) => [e.file, e]));

/** Repo-relative files under dir matching re (an empty list when dir is missing). */
function walk(dir, re) {
  const abs = join(ROOT, dir);
  return existsSync(abs)
    ? readdirSync(abs, { recursive: true }).map((f) => `${dir}/${String(f).replace(/\\/g, '/')}`).filter((f) => re.test(f) && statSync(join(ROOT, f)).isFile())
    : [];
}

/** TRADEMARK_TERMS read from src/lib/seo.ts as text (seo.ts imports extensionless modules plain Node cannot load). */
function trademarkTerms() {
  const block = /export const TRADEMARK_TERMS[^=]*=\s*\[([\s\S]*?)\];/.exec(readFileSync(join(ROOT, 'src/lib/seo.ts'), 'utf8'));
  assert.ok(block, 'TRADEMARK_TERMS found in seo.ts');
  return [...block[1].matchAll(/'([^']*)'/g)].map((m) => m[1]);
}
/** seo.ts's rule: URL separators count as spaces, Latin terms match whole words. */
function containsTrademark(text, terms) {
  const haystack = text.toLowerCase().replace(/[-_./#]+/g, ' ');
  return terms.some((term) => {
    const needle = term.toLowerCase().replace(/[-_./#]+/g, ' ');
    if (!/^[\x20-\x7e]+$/.test(term)) return haystack.includes(needle);
    return new RegExp(`(^|[^a-z0-9])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(haystack);
  });
}

/**
 * needles appear only in the allowed files: in src only in the manifest, in scripts only in the two asset scripts, and
 * never in src/**\/*.{ts,tsx,astro}, astro.config.mjs or dist/** (dist is checked when a build is present).
 */
function assertConfined(needles, links = []) {
  // src/assets/characters/sources.json is the provenance manifest of the Player Log showcase art (owner ruling
  // 2026-10-06): like the account-card manifest it records where a committed file came from; nothing fetches it.
  const ALLOWED = [
    'scripts/download-external-assets.mjs',
    'scripts/assets/account-cards.mjs',
    'src/assets/account-cards/sources.json',
    'src/assets/characters/sources.json',
  ];
  const hit = (file) => {
    // an outbound link the credits cite is text, not a fetch: it is taken out before the needles are looked for
    const text = links.reduce((t, url) => t.split(url).join(''), readFileSync(join(ROOT, file), 'latin1'));
    return needles.some((n) => text.includes(n));
  };
  const scanned = [...walk('src', /./), ...walk('scripts', /./), 'astro.config.mjs', ...walk('dist', /./)];
  assert.ok(scanned.some((f) => f.endsWith('.astro')) && scanned.includes('astro.config.mjs'));
  assert.deepEqual(scanned.filter((f) => !ALLOWED.includes(f) && hit(f)), []);
  // the manifest and the downloader do name them (the check above is not vacuous)
  assert.ok(hit('src/assets/account-cards/sources.json') && hit('scripts/download-external-assets.mjs'));
}

test('the card table: five cards, the controller-approved sources and crops, all inside their sources', async () => {
  const { CARDS, SIZE } = await import(SCRIPT);
  assert.deepEqual(SIZE, { width: 256, height: 280 });
  assert.deepEqual(CARDS, [
    { out: 'card-1.webp', tile: 'genshin', character: 'Eula', from: { repo: 'src/assets/characters/eula.png' }, crop: { left: 725, top: 125, width: 421, height: 460 } },
    { out: 'card-2.webp', tile: 'zzz', character: 'Remielle', from: { repo: 'src/assets/characters/remielle.png' }, crop: { left: 830, top: 140, width: 210, height: 230 } },
    { out: 'card-3.webp', tile: 'lol', character: 'Ezreal', from: { staging: 'account-cards/ezreal-splash.jpg', item: 'card-source-ezreal' }, crop: { left: 650, top: 90, width: 230, height: 252 } },
    { out: 'card-4.webp', tile: 'tft', character: 'Pengu', from: { staging: 'account-cards/pengu.png', item: 'card-source-pengu' }, crop: { left: 140, top: 30, width: 260, height: 284 } },
    { out: 'card-5.webp', tile: 'hearthstone', character: 'Harth Stonebrew', from: { staging: 'account-cards/innkeeper-header.jpg', item: 'card-source-innkeeper', page: PAGE }, crop: { left: 1104, top: 146, width: 360, height: 394 } },
  ]);
  // every crop has the art box's aspect (128:140) within 0.5%, so the resize squeezes nothing
  for (const c of CARDS) assert.ok(Math.abs(c.crop.width / c.crop.height / (128 / 140) - 1) < 0.005, `${c.out} aspect ${c.crop.width}x${c.crop.height}`);
  // the staged download of each item is the file the downloader writes, at the source sizes the crops were chosen on
  const { ITEMS } = await import('../../scripts/download-external-assets.mjs');
  const SOURCE_SIZE = { 'card-1.webp': [1600, 937], 'card-2.webp': [1600, 854], 'card-3.webp': [1215, 717], 'card-4.webp': [512, 344], 'card-5.webp': [1520, 540] };
  for (const c of CARDS) {
    const [w, h] = SOURCE_SIZE[c.out];
    assert.ok(c.crop.left >= 0 && c.crop.top >= 0 && c.crop.left + c.crop.width <= w && c.crop.top + c.crop.height <= h, `${c.out} crop inside ${w}x${h}`);
    if (c.from.item) assert.equal(ITEMS.find((i) => i.id === c.from.item)?.target.path, c.from.staging, c.out);
  }
  // the innkeeper is a downscale (0.71x), never an upscale
  const inn = CARDS.find((c) => c.out === 'card-5.webp');
  assert.ok(inn.crop.width >= 256 && inn.crop.height >= 280);
});

test('every card file has one manifest entry with source, crop, size 256×280 and output sha256; no extra file', async () => {
  const { CARDS } = await import(SCRIPT);
  assert.deepEqual(readdirSync(join(ROOT, DIR)).sort(), [...FILES, 'sources.json']);
  const entries = manifest();
  assert.deepEqual(entries.map((e) => e.file), FILES);
  for (const [i, e] of entries.entries()) {
    const card = CARDS[i];
    assert.deepEqual(Object.keys(e), ['file', 'tile', 'character', 'source', 'sourceSha256', 'crop', 'width', 'height', 'outputSha256', 'retrieved'], e.file);
    assert.equal(e.tile, card.tile, e.file);
    assert.equal(e.character, card.character, e.file);
    assert.deepEqual(e.crop, card.crop, e.file);
    assert.equal(`${e.width}x${e.height}`, '256x280', e.file);
    assert.equal(e.retrieved, '2026-10-04', e.file);
    assert.match(e.sourceSha256, /^[0-9a-f]{64}$/, e.file);
    const buf = readFileSync(join(ROOT, DIR, e.file));
    assert.equal(sha256(buf), e.outputSha256, `${e.file}: run node scripts/assets/account-cards.mjs --build`);
    const m = await sharp(buf).metadata();
    assert.equal(`${m.format} ${m.width}x${m.height}`, 'webp 256x280', e.file);
    const blocks = ['exif', 'xmp', 'iptc', 'icc'].filter((k) => m[k] !== undefined);
    assert.deepEqual(blocks, [], `${e.file} carries ${blocks.join('+')}`);
    assert.ok(buf.length < 40_000, `${e.file} is ${buf.length} bytes`);
  }
});

test('Riot entries cite their Data Dragon URL and version; HoYoverse entries cite the committed character PNG', () => {
  const e = byFile();
  for (const [file, name] of [['card-1.webp', 'eula'], ['card-2.webp', 'remielle']]) {
    assert.deepEqual(e[file].source, { kind: 'repo', path: `src/assets/characters/${name}.png` });
    assert.equal(e[file].sourceSha256, sha256(readFileSync(join(ROOT, `src/assets/characters/${name}.png`))), file);
  }
  // the splash URL carries no version; the tactician URL carries the realm version read from versions.json that day
  assert.deepEqual(e['card-3.webp'].source, { kind: 'download', item: 'card-source-ezreal', url: 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Ezreal_0.jpg' });
  assert.deepEqual(e['card-4.webp'].source, { kind: 'download', item: 'card-source-pengu', url: 'https://ddragon.leagueoflegends.com/cdn/16.19.1/img/tft-tactician/Tooltip_PenguKnight_Classic_Tier1.png', ddVersion: '16.19.1' });
  // the files the controller fetched on 2026-10-04
  assert.equal(e['card-3.webp'].sourceSha256, '447e6acac61e08312324c4c07c59cb9352bfe9637af60807697d62ee6fe9d33c');
  assert.equal(e['card-4.webp'].sourceSha256, '329add6131ac577d7d3f54105071d6e0bc066d70844f5be2fa2b039a1bbc2145');
});

test('the innkeeper entry cites its image URL and names its news page', () => {
  const inn = byFile()['card-5.webp'];
  assert.equal(inn.character, 'Harth Stonebrew');
  assert.deepEqual(inn.source, { kind: 'download', item: 'card-source-innkeeper', url: 'https://bnetcmsus-a.akamaihd.net/cms/blog_header/r6/R6XIUXOQB0IT1698251687641.jpg', page: PAGE });
  assert.equal(inn.sourceSha256, '98cff188e88e754504229c5e34a2b620ab24437f07c89638c6f1458490aeee5a');
});

test('download entries cite exactly the downloader item URLs', async () => {
  const { ITEMS } = await import('../../scripts/download-external-assets.mjs');
  for (const e of manifest().filter((x) => x.source.kind === 'download')) {
    assert.equal(e.source.url, ITEMS.find((i) => i.id === e.source.item)?.source, e.file);
  }
});

test('nothing fetches Data Dragon at build or run time', () => {
  assertConfined(['ddragon']);
});

test('nothing fetches a Blizzard host at build or run time', () => {
  assertConfined(['akamaihd', 'blizzard.com'], [PAGE]);
});

test('the credits cite the innkeeper news page only as a link (Markdown autolink; in dist an <a href> and its text)', () => {
  for (const lang of ['ko', 'en']) {
    const md = readFileSync(join(ROOT, `src/content/legal/${lang}/credits.md`), 'utf8');
    assert.equal(md.split(PAGE).length - 1, 1, lang);
    assert.ok(md.includes(`(<${PAGE}>)`), lang);
  }
  for (const page of ['dist/credits/index.html', 'dist/en/credits/index.html']) {
    if (!existsSync(join(ROOT, page))) continue;
    const html = readFileSync(join(ROOT, page), 'utf8');
    const rest = html.split(`href="${PAGE}"`).join('').split(`>${PAGE}</a>`).join('');
    assert.equal(rest.includes(PAGE), false, page);
    assert.doesNotMatch(html, /<img[^>]+blizzard\.com/, page);
  }
});

/**
 * Whether source text loads the card script: an import/export … from, a bare or dynamic import(), a require() of a
 * specifier ending in account-cards.mjs, or an import.meta.glob over scripts/assets. A comment that names the file is
 * not a load.
 */
function importsCardScript(text) {
  const specifier = String.raw`\s*['"\x60][^'"\x60]*account-cards\.mjs['"\x60]`;
  return (
    new RegExp(String.raw`\bfrom${specifier}|\bimport\s*\(?${specifier}|\brequire\s*\(${specifier}`).test(text) ||
    /\bimport\.meta\.glob(?:<[^>]*>)?\s*\([^)]*scripts\/assets\//.test(text)
  );
}

test('the card script is dev-time only: no fetch, never imported by the site, importing it writes nothing', async () => {
  const src = readFileSync(join(ROOT, 'scripts/assets/account-cards.mjs'), 'utf8');
  assert.doesNotMatch(src, /\bfetch\s*\(|node:https?\b|node:child_process/);
  // the detector finds every import form and ignores a comment that names the script (src/lib/account-cards.ts does)
  for (const real of [
    "import { CARDS } from '../../scripts/assets/account-cards.mjs';",
    "import '../scripts/assets/account-cards.mjs'",
    "const m = await import(\n  '../../scripts/assets/account-cards.mjs');",
    'const m = require("../scripts/assets/account-cards.mjs");',
    "export { CARDS } from '../../scripts/assets/account-cards.mjs';",
    "import.meta.glob('../../scripts/assets/*.mjs')",
  ]) {
    assert.equal(importsCardScript(real), true, real);
  }
  for (const comment of ['// made at dev time by scripts/assets/account-cards.mjs', '/* see scripts/assets/account-cards.mjs */', ' * scripts/assets/account-cards.mjs runs at dev time']) {
    assert.equal(importsCardScript(comment), false, comment);
  }
  const importers = [...walk('src', /\.(ts|tsx|astro|mjs|js)$/), 'astro.config.mjs'].filter((f) => importsCardScript(readFileSync(join(ROOT, f), 'utf8')));
  assert.deepEqual(importers, []);
  const before = readdirSync(join(ROOT, DIR)).map((f) => `${f}:${sha256(readFileSync(join(ROOT, DIR, f)))}`);
  const realFetch = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error('fetch must not run');
  };
  try {
    await import(SCRIPT);
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.deepEqual(readdirSync(join(ROOT, DIR)).map((f) => `${f}:${sha256(readFileSync(join(ROOT, DIR, f)))}`), before);
});

test('card file names carry no trademark term', () => {
  const terms = trademarkTerms();
  assert.ok(terms.includes('Hearthstone') && terms.includes('LoL'));
  for (const f of readdirSync(join(ROOT, DIR))) assert.equal(containsTrademark(`${DIR}/${f}`, terms), false, f);
  for (const e of manifest()) {
    assert.match(e.file, /^card-\d\.webp$/);
    assert.equal(containsTrademark(e.file, terms), false, e.file);
  }
});

test('the HoYoverse crops re-derive byte for byte from src/assets/characters (verify mode)', async () => {
  const { verify } = await import(SCRIPT);
  const result = await verify({ staging: '/nonexistent-staging', repoRoot: ROOT });
  assert.deepEqual(result.mismatches, []);
  assert.deepEqual(result.checked, ['card-1.webp', 'card-2.webp']);
  assert.deepEqual(result.skipped, ['card-3.webp', 'card-4.webp', 'card-5.webp']);
});

test('the downloaded crops re-derive byte for byte when the staged sources are present (verify mode)', async (t) => {
  if (!['ezreal-splash.jpg', 'pengu.png', 'innkeeper-header.jpg'].every((f) => existsSync(join(STAGING, 'account-cards', f)))) {
    t.skip('staged card sources not on this machine (e.g. CI)');
    return;
  }
  const { verify } = await import(SCRIPT);
  const result = await verify({ staging: STAGING, repoRoot: ROOT });
  assert.deepEqual(result.mismatches, []);
  assert.deepEqual(result.checked, FILES);
  assert.deepEqual(result.skipped, []);
});

test('the build prunes card files no page names and keeps the ones a page uses', () => {
  const dist = mkdtempSync(join(tmpdir(), 'card-originals-'));
  try {
    mkdirSync(join(dist, '_astro'));
    mkdirSync(join(dist, 'player-log'));
    for (const f of ['card-1.AbCd-12_.webp', 'card-1.AbCd-12__Z1x2.webp', 'card-3.Xy_9zzzz.webp', 'card-5.CEMSqRXN.webp', 'eula.Qq1.webp']) {
      writeFileSync(join(dist, '_astro', f), 'x');
    }
    writeFileSync(join(dist, 'player-log/index.html'), '<img srcset="/_astro/card-1.AbCd-12__Z1x2.webp 128w"><img src="/_astro/card-3.Xy_9zzzz.webp">');
    assert.deepEqual(pruneCardOriginals(dist).sort(), ['card-1.AbCd-12_.webp', 'card-5.CEMSqRXN.webp']);
    // the resized copy and the original a page links stay; a non-card image is not this step's business
    assert.deepEqual(readdirSync(join(dist, '_astro')).sort(), ['card-1.AbCd-12__Z1x2.webp', 'card-3.Xy_9zzzz.webp', 'eula.Qq1.webp']);
    assert.deepEqual(pruneCardOriginals(join(dist, 'missing')), []);
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
});

test('dist ships no card file a page does not name, and nothing of card-5 (the innkeeper waits for PL-8)', (t) => {
  if (!existsSync(join(ROOT, 'dist/_astro'))) {
    t.skip('no build in dist/');
    return;
  }
  const files = walk('dist', /./);
  const text = files.filter((f) => /\.(html|js|mjs|css|json|xml|txt|webmanifest|svg)$/i.test(f)).map((f) => readFileSync(join(ROOT, f), 'utf8')).join('\n');
  const cards = files.filter((f) => /^dist\/_astro\/card-\d+\./.test(f));
  assert.deepEqual(cards.filter((f) => !text.includes(f.split('/').pop())), []);
  assert.deepEqual(cards.filter((f) => f.startsWith('dist/_astro/card-5.')), []);
  // by content too: the innkeeper crop under no name at all
  const innkeeper = sha256(readFileSync(join(ROOT, DIR, 'card-5.webp')));
  assert.deepEqual(files.filter((f) => /\.webp$/.test(f) && sha256(readFileSync(join(ROOT, f))) === innkeeper), []);
});
