// P2-36 (batch 5) and P2-12: the built OG cards carry a real artifact (in a bracket frame on the HUD grid on game
// cards, under a heavy ink rule on the white editorial and neutral cards), and each stays a reasonable size. Run after
// `npm run build`: npm run test:ops.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import sharp from 'sharp';
import { allRoutes, parseRoute } from '../../src/lib/routes.ts';

/** ogSlugFor (src/lib/seo.ts): '/' → home, '/en/' → en/home, else the path without slashes. */
const slugOf = (route) => {
  const path = route.replace(/^\/+|\/+$/g, '');
  return path === '' ? 'home' : path === 'en' ? 'en/home' : path;
};
/** ogTemplateFor (src/lib/og-pages.ts): general pages editorial, game pages HUD, chooser and shared pages neutral. */
const templateOf = (route) => {
  const info = parseRoute(route);
  if (!info) throw new Error(`${route} is not a route`);
  return info.kind === 'variant' ? (info.variant === 'data' ? 'editorial' : 'hud') : 'neutral';
};
const TEMPLATE = new Map(allRoutes().map((route) => [slugOf(route), templateOf(route)]));

const DIST = process.env.DIST_DIR ?? 'dist';
const OG = join(DIST, 'og');
const MAX_BYTES = 300 * 1024;

/** @param {string} dir @returns {string[]} */
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
const cards = () => {
  assert.ok(existsSync(OG), `${OG} missing: run npm run build first`);
  return walk(OG).filter((f) => f.endsWith('.png'));
};
const key = (file) => relative(OG, file).split(sep).join('/').replace(/\.png$/, '');

/** Mean and standard deviation of the luminance inside every artifact frame (x 840–1110, y 120–500; text ends left of it). */
async function artifactArea(file) {
  const px = await sharp(file).extract({ left: 840, top: 120, width: 270, height: 380 }).removeAlpha().raw().toBuffer();
  const lum = [];
  for (let i = 0; i < px.length; i += 3) lum.push(0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]);
  const mean = lum.reduce((a, b) => a + b, 0) / lum.length;
  const stdev = Math.sqrt(lum.reduce((a, b) => a + (b - mean) ** 2, 0) / lum.length);
  return { mean, stdev };
}

test('every OG card is a 1200×630 PNG under 300 KB', async () => {
  const files = cards();
  assert.equal(files.length, allRoutes().length, 'one card per route');
  const heavy = [];
  for (const file of files) {
    const meta = await sharp(file).metadata();
    assert.equal(`${meta.format} ${meta.width}x${meta.height}`, 'png 1200x630', key(file));
    const bytes = statSync(file).size;
    if (bytes >= MAX_BYTES) heavy.push(`${key(file)}: ${Math.round(bytes / 1024)} KB`);
  }
  assert.deepEqual(heavy, [], heavy.join('\n'));
});

test('each card shows an artifact on its right, not a text-only card (P2-36)', async () => {
  const flat = [];
  for (const file of cards()) {
    const { stdev } = await artifactArea(file);
    // the empty grid is almost flat (stdev < 3); a photo, figure, paper sheet or plate is not
    if (stdev < 12) flat.push(`${key(file)}: stdev ${stdev.toFixed(1)}`);
  }
  assert.deepEqual(flat, [], flat.join('\n'));
});

test('P2-12 fixed cards: the game home and records share the photo, the paper card is white, the general home shows the heatmap, the chooser shows both versions', async () => {
  const luminance = async (k, left, top, width, height) => {
    const px = await sharp(join(OG, `${k}.png`)).extract({ left, top, width, height }).removeAlpha().raw().toBuffer();
    let sum = 0;
    for (let i = 0; i < px.length; i += 3) sum += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
    return sum / (px.length / 3);
  };
  const area = (k) => luminance(k, 840, 120, 270, 380);
  assert.ok(Math.abs((await area('game')) - (await area('game/records'))) < 1, 'game home and records show the same photo');
  assert.ok((await area('game/research/cog-2026-engagement')) > 150, 'the paper card is a white sheet');
  assert.ok(Math.abs((await area('data')) - (await area('game'))) > 5, 'the general home shows the heatmap, not the photo');
  assert.ok((await luminance('home', 650, 440, 20, 20)) < 60, 'chooser card: the game half is dark');
  assert.ok((await luminance('home', 1080, 440, 20, 20)) > 200, 'chooser card: the general half is white');
  for (const [slug, template] of TEMPLATE) {
    if (template === 'hud') continue;
    assert.ok((await luminance(slug, 10, 10, 20, 20)) > 245, `${slug}: a ${template} card is white`);
  }
});

/**
 * The text lines of a card's left column (x 60–580): runs of pixel rows that hold text (light on the HUD grid, dark on
 * the white editorial and neutral cards; `light` = a white card), each with its horizontal extent. A lone "." or ","
 * on a line of its own is a band a few pixels wide. Up to 2 blank rows do not end a line (P2-12): a descender cut by
 * the window's right edge (the tail of a "g" at x 576–579 under "Seongeun" on en/stats) sits one blank row below its
 * line and is part of it, while the gap between two text lines is far wider.
 * @param {string} file
 * @param {boolean} light
 */
async function textLines(file, light) {
  const left = 60;
  const { data, info } = await sharp(file).extract({ left, top: 0, width: 520, height: 630 }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const lines = [];
  let line = null;
  let blank = 0;
  for (let y = 0; y < info.height; y++) {
    let min = Infinity;
    let max = -Infinity;
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 3;
      const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      if (light ? lum < 150 : lum > 70) {
        min = Math.min(min, x);
        max = Math.max(max, x);
      }
    }
    if (min !== Infinity) {
      line ??= { top: y, min, max, bottom: y };
      line.bottom = y;
      line.min = Math.min(line.min, min);
      line.max = Math.max(line.max, max);
      blank = 0;
    } else if (line && ++blank > 2) {
      lines.push({ top: line.top, bottom: line.bottom, x: line.min + left, width: line.max - line.min + 1 });
      line = null;
      blank = 0;
    }
  }
  if (line) lines.push({ top: line.top, bottom: line.bottom, x: line.min + left, width: line.max - line.min + 1 });
  return lines;
}

test('final fix 2 item 22: no card leaves a punctuation mark alone on a text line', async () => {
  const orphans = [];
  for (const file of cards()) {
    for (const line of await textLines(file, TEMPLATE.get(key(file)) !== 'hud')) {
      if (line.width < 24) orphans.push(`${key(file)}: a ${line.width}px-wide line at y ${line.top}`);
    }
  }
  assert.deepEqual(orphans, [], orphans.join('\n'));
});

test('P2-12 review: on the white cards the eyebrow stands alone (a long title never runs into it)', async () => {
  const merged = [];
  for (const file of cards()) {
    if (TEMPLATE.get(key(file)) === 'hud') continue;
    const [eyebrow] = await textLines(file, true);
    if (!eyebrow || eyebrow.bottom - eyebrow.top > 40) merged.push(`${key(file)}: first text band ${eyebrow ? eyebrow.bottom - eyebrow.top + 1 : 0}px tall`);
  }
  assert.deepEqual(merged, [], merged.join('\n'));
});

/** Count of pixels near an RGB colour (sum of channel distances ≤ tol), in the whole card. */
async function pixelsNear(file, [r, g, b], tol = 24, width = 1200) {
  const px = await sharp(file).extract({ left: 0, top: 0, width, height: 630 }).removeAlpha().raw().toBuffer();
  let n = 0;
  for (let i = 0; i < px.length; i += 3) if (Math.abs(px[i] - r) + Math.abs(px[i + 1] - g) + Math.abs(px[i + 2] - b) <= tol) n += 1;
  return n;
}

// GP-10 (game palette v4, GP-OQ10): the game cards and the chooser card's game half are yellow on black, never lime; the
// general (data) cards keep their editorial white and carry neither the game yellow nor lime. (Their bytes against the
// GP-0 build were compared by the controller: identical.)
test('GP-10: /og/game*.png has yellow and no lime pixels; /og/data*.png has neither', async () => {
  const all = cards();
  const game = all.filter((f) => TEMPLATE.get(key(f)) === 'hud');
  const data = all.filter((f) => TEMPLATE.get(key(f)) === 'editorial');
  assert.ok(game.length >= 9 && data.length >= 9, `${game.length} game, ${data.length} data cards`);
  const YELLOW = [255, 230, 0];
  const LIME = [200, 240, 60];
  for (const f of game) {
    assert.ok((await pixelsNear(f, YELLOW)) > 50, `${key(f)}: yellow marks`);
    // the card's own marks (the artifact on the right is content: the school-zone maps hold yellow-green map data)
    assert.equal(await pixelsNear(f, LIME, 24, 700), 0, `${key(f)}: lime`);
  }
  for (const f of data) {
    assert.equal(await pixelsNear(f, YELLOW, 12), 0, `${key(f)}: game yellow on a data card`);
    assert.equal(await pixelsNear(f, LIME, 24, 700), 0, `${key(f)}: lime on a data card`);
  }
  const home = join(OG, 'home.png');
  assert.ok((await pixelsNear(home, YELLOW)) > 20, 'the chooser card shows the game half in yellow');
  assert.equal(await pixelsNear(home, LIME), 0, 'the chooser card has no lime');
});
