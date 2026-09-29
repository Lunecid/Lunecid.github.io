// P1-3 (R-5, A-5): Markdown internal links are localized by rehype-base-links. Only the rendered Markdown body (the
// legal article) is read, so the footer's link to the same page cannot mask a miss. Run after `npm run build`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIST = process.env.DIST_DIR ?? 'dist';

/** The inner HTML of the legal article of a built route. @param {string} route @returns {string} */
function article(route) {
  const file = join(DIST, ...route.split('/').filter(Boolean), 'index.html');
  assert.ok(existsSync(file), `${file} missing: run npm run build first`);
  const match = /<article\b[^>]*\bclass="[^"]*\blegal\b[^"]*"[^>]*>([\s\S]*?)<\/article>/.exec(readFileSync(file, 'utf8'));
  assert.ok(match, `${route}: no legal <article>`);
  return match[1];
}

test('the privacy policy body links the stats page in its own language', () => {
  const ko = article('/privacy/');
  const en = article('/en/privacy/');
  assert.match(en, /href="\/en\/stats\/"/);
  assert.doesNotMatch(en, /href="\/stats\/"/);
  assert.match(ko, /href="\/stats\/"/);
  assert.doesNotMatch(ko, /href="\/en\/stats\/"/);
});
