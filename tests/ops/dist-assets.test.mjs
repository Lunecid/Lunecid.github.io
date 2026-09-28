// Final fix 2: what the built site publishes besides its pages — only images something references (item 14), raster
// icons next to the SVG one (item 21), and one hreflang scheme in the sitemap and the page heads (item 20).
// Run after `npm run build`: npm run test:ops.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';
import sharp from 'sharp';

const DIST = process.env.DIST_DIR ?? 'dist';
const IMAGE = /\.(png|jpe?g|webp|avif|gif|svg|ico)$/i;
const TEXT = /\.(html|js|mjs|css|json|xml|txt|webmanifest|svg)$/i;

/** @param {string} dir @returns {string[]} */
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
const files = () => {
  assert.ok(existsSync(DIST), `${DIST} missing: run npm run build first`);
  return walk(DIST);
};
const rel = (file) => relative(DIST, file).split(sep).join('/');

test('item 14: every published image is referenced by a page, script, style sheet or feed', () => {
  const all = files();
  const text = all.filter((f) => TEXT.test(f)).map((f) => readFileSync(f, 'utf8')).join('\n');
  // /favicon.ico is also probed by browsers and crawlers on their own, but it is linked too (BaseLayout).
  const unreferenced = all.filter((f) => IMAGE.test(f) && !text.includes(basename(f))).map(rel);
  // The full-size source PNGs of the character art (about 2.7 MB) were published although nothing linked them.
  assert.deepEqual(unreferenced, [], unreferenced.join('\n'));
});

test('item 21: favicon.ico holds the 16 and 32 px mark; apple-touch-icon.png is an opaque 180 px square', async () => {
  const ico = readFileSync(join(DIST, 'favicon.ico'));
  assert.deepEqual([ico.readUInt16LE(0), ico.readUInt16LE(2), ico.readUInt16LE(4)], [0, 1, 2]);
  const sizes = [];
  for (let i = 0; i < 2; i += 1) {
    const entry = 6 + 16 * i;
    const [length, offset] = [ico.readUInt32LE(entry + 8), ico.readUInt32LE(entry + 12)];
    const meta = await sharp(ico.subarray(offset, offset + length)).metadata();
    assert.equal(meta.format, 'png');
    sizes.push(meta.width);
  }
  assert.deepEqual(sizes, [16, 32]);
  const apple = join(DIST, 'apple-touch-icon.png');
  const meta = await sharp(apple).metadata();
  assert.deepEqual([meta.width, meta.height], [180, 180]);
  assert.equal((await sharp(apple).stats()).isOpaque, true, 'iOS shows transparent corners as black');
});

test('item 21: every page links the SVG icon, the .ico fallback and the apple-touch-icon', () => {
  const pages = files().filter((f) => f.endsWith('.html') && !rel(f).startsWith('print/'));
  assert.ok(pages.length >= 25, `${pages.length} pages`);
  const missing = [];
  for (const page of pages) {
    const html = readFileSync(page, 'utf8');
    for (const link of ['<link rel="icon" href="/favicon.ico" sizes="32x32"', '<link rel="icon" type="image/svg+xml" href="/favicon.svg"', '<link rel="apple-touch-icon" href="/apple-touch-icon.png"']) {
      if (!html.includes(link)) missing.push(`${rel(page)}: ${link}`);
    }
  }
  assert.deepEqual(missing, [], missing.join('\n'));
});

test('item 20: the sitemap and the page heads use one hreflang scheme: ko, en and x-default = the Korean page', () => {
  const sitemap = readFileSync(join(DIST, 'sitemap-0.xml'), 'utf8');
  const urls = [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1]);
  assert.ok(urls.length >= 24, `${urls.length} sitemap urls`);
  const wrong = [];
  for (const url of urls) {
    const loc = /<loc>([^<]+)<\/loc>/.exec(url)?.[1] ?? '';
    const links = Object.fromEntries([...url.matchAll(/hreflang="([^"]+)" href="([^"]+)"/g)].map((m) => [m[1], m[2]]));
    if (Object.keys(links).sort().join(' ') !== 'en ko x-default' || links['x-default'] !== links.ko) wrong.push(`${loc}: ${JSON.stringify(links)}`);
    // the page's own head says the same
    const path = new URL(loc).pathname;
    const html = readFileSync(join(DIST, path, 'index.html'), 'utf8');
    const head = Object.fromEntries([...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)].map((m) => [m[1], m[2]]));
    if (JSON.stringify(head) !== JSON.stringify(Object.fromEntries(Object.entries(links).sort(([a], [b]) => ['ko', 'en', 'x-default'].indexOf(a) - ['ko', 'en', 'x-default'].indexOf(b))))) {
      wrong.push(`${path}: head ${JSON.stringify(head)} vs sitemap ${JSON.stringify(links)}`);
    }
  }
  assert.deepEqual(wrong, [], wrong.join('\n'));
});
