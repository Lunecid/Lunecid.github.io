// Contract §2.2 / §6.1 P1-18: every built page that contains an ImageViewer trigger (data-viewer="…", site-v1 2ad74ff)
// also carries an <astro-island> whose component-url names ImageViewer; no other page contains a trigger.
// Reads dist HTML only (no PDF). Run after `npm run build`: npm run test:ops.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const DIST = process.env.DIST_DIR ?? 'dist';
/** @param {string} dir @returns {string[]} */
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
const rel = (file) => relative(DIST, file).split(sep).join('/');
const TRIGGER = /\sdata-viewer="/; // data-viewer-w / data-viewer-h do not match
const ISLAND = /<astro-island\b[^>]*\bcomponent-url="[^"]*ImageViewer[^"]*"/;

test('§2.2: every page with a data-viewer trigger hydrates ImageViewer, and no other page has a trigger', () => {
  assert.ok(existsSync(DIST), `${DIST} missing: run npm run build first`);
  const pages = walk(DIST).filter((f) => f.endsWith('.html'));
  const withTrigger = pages.filter((f) => TRIGGER.test(readFileSync(f, 'utf8')));
  const orphaned = withTrigger.filter((f) => !ISLAND.test(readFileSync(f, 'utf8'))).map(rel);
  assert.deepEqual(orphaned, [], `data-viewer= without an ImageViewer island:\n${orphaned.join('\n')}`);
  // Sanity: the invariant is not vacuous (records and research carry triggers on both versions).
  for (const page of ['game/records/index.html', 'data/records/index.html', 'game/research/index.html', 'data/research/index.html']) {
    assert.ok(withTrigger.map(rel).includes(page), `${page} has no data-viewer trigger`);
  }
});
