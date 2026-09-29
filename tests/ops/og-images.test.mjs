// P2-36 (batch 5): the built OG cards carry a real artifact in a bracket frame on the HUD grid, and each stays a
// reasonable size. Run after `npm run build`: npm run test:ops.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import sharp from 'sharp';
import { allRoutes } from '../../src/lib/routes.ts';

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

test('home and records show the photo, project pages their figure, the paper page its white title sheet', async () => {
  const at = (k) => artifactArea(join(OG, `${k}.png`));
  const [home, records, paper, project] = await Promise.all([at('home'), at('game/records'), at('game/research/cog-2026-engagement'), at('game/projects/school-zone-blindspots')]);
  assert.ok(Math.abs(home.mean - records.mean) < 1, 'home and records share the ID photo');
  assert.ok(paper.mean > 150, `the paper title block is a white sheet (mean ${paper.mean.toFixed(0)})`);
  assert.ok(Math.abs(project.mean - home.mean) > 5, 'a project card shows its own figure, not the photo');
});

/**
 * The text lines of a card's left column (x 60–580): runs of pixel rows that hold light text on the dark grid, each
 * with its horizontal extent. A lone "." or "," on a line of its own is a band a few pixels wide.
 * @param {string} file
 */
async function textLines(file) {
  const left = 60;
  const { data, info } = await sharp(file).extract({ left, top: 0, width: 520, height: 630 }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const lines = [];
  let line = null;
  for (let y = 0; y < info.height; y++) {
    let min = Infinity;
    let max = -Infinity;
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 3;
      if (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2] > 70) {
        min = Math.min(min, x);
        max = Math.max(max, x);
      }
    }
    if (min !== Infinity) {
      line ??= { top: y, min, max };
      line.min = Math.min(line.min, min);
      line.max = Math.max(line.max, max);
    } else if (line) {
      lines.push({ top: line.top, x: line.min + left, width: line.max - line.min + 1 });
      line = null;
    }
  }
  return lines;
}

test('final fix 2 item 22: no card leaves a punctuation mark alone on a text line', async () => {
  const orphans = [];
  for (const file of cards()) {
    for (const line of await textLines(file)) {
      if (line.width < 24) orphans.push(`${key(file)}: a ${line.width}px-wide line at y ${line.top}`);
    }
  }
  assert.deepEqual(orphans, [], orphans.join('\n'));
});
