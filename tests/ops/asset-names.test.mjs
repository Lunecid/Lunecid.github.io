// AL-8 (account-link spec §5.4, §11.1; plan DV-32): the built site's file names and the fixture guard.
// 1. No path segment under dist/ (so no /_astro/ asset URL either) contains a game trademark: account images are named
//    sha1(sourceUrl).slice(0, 12) by the fetch job, and Astro adds only its own hash.
// 2. The deployed build never contains the test-only fixtures (tests/fixtures/generated, reached only through the
//    @generated alias under SB_E2E_ACCOUNTS=1): no path or file content names `e2efixture`, `e2e-fixture` or
//    `E2E Fixture`.
// Reads dist/ (DIST_DIR to override); skips when the site is not built. Run after `npm run build`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const DIST = process.env.DIST_DIR ?? 'dist';
const notBuilt = !existsSync(join(DIST, 'index.html')) && `${DIST}/ not built: run npm run build first`;
const FIXTURE_MARKS = ['e2efixture', 'e2e-fixture', 'E2E Fixture'];

/** Every file and directory under `dir`, as paths relative to DIST. */
function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    out.push({ path, dir: entry.isDirectory() });
    if (entry.isDirectory()) walk(path, out);
  }
  return out;
}

/**
 * TRADEMARK_TERMS read from src/lib/seo.ts as text (seo.ts imports the extensionless site config, which plain Node
 * cannot load; tests/ops/fetch-accounts.test.mjs does the same). containsTrademark repeats seo.ts's rule: case-
 * insensitive, the separators . - _ / # count as spaces, Latin terms must stand alone.
 */
function trademarkTerms() {
  const src = readFileSync(new URL('../../src/lib/seo.ts', import.meta.url), 'utf8');
  const block = /export const TRADEMARK_TERMS[^=]*=\s*\[([\s\S]*?)\];/.exec(src);
  assert.ok(block, 'TRADEMARK_TERMS found in seo.ts');
  return [...block[1].matchAll(/'([^']*)'/g)].map((m) => m[1]);
}
const TERMS = trademarkTerms();
function containsTrademark(text) {
  const haystack = text.toLowerCase().replace(/[-_./#]+/g, ' ');
  return TERMS.some((term) => {
    const needle = term.toLowerCase();
    if (!/^[\x20-\x7e]+$/.test(term)) return haystack.includes(needle);
    return new RegExp(`(^|[^a-z0-9])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(haystack);
  });
}

test('the trademark check reads seo.ts and treats . - _ as separators (runs without dist)', () => {
  assert.ok(TERMS.length >= 30, `${TERMS.length} terms`);
  for (const term of ['Genshin', 'ZZZ', 'Steam', 'TFT', 'LoL', 'Riot']) assert.ok(TERMS.includes(term), term);
  for (const name of ['Genshin.Dk3x_a9.webp', 'enka-zzz.json', 'steam_avatar.jpg', 'x.LoL.png', 'tft-icon.B3a.png', '원신.png']) {
    assert.equal(containsTrademark(name), true, name);
  }
  for (const name of ['PlayerLog.Dk3x_a9.css', '3fa2c1d09b7e.Bq9-Zx1a.webp', 'AccountLinks.C0ffee12.js', 'index.html', 'steamy.png']) {
    assert.equal(containsTrademark(name), false, name);
  }
});

test('no path segment under dist/ (including every /_astro/ asset name) contains a game trademark', { skip: notBuilt }, () => {
  const entries = walk(DIST);
  assert.ok(entries.some((e) => relative(DIST, e.path).startsWith(`_astro${sep}`)), 'dist/_astro has files');
  const hits = entries.map((e) => relative(DIST, e.path)).filter((rel) => rel.split(sep).some((segment) => containsTrademark(segment)));
  assert.deepEqual(hits, []);
});

test('no path under dist/ names an e2e fixture', { skip: notBuilt }, () => {
  const hits = walk(DIST)
    .map((e) => relative(DIST, e.path))
    .filter((rel) => FIXTURE_MARKS.some((mark) => rel.toLowerCase().includes(mark.toLowerCase())));
  assert.deepEqual(hits, []);
});

test('no file content under dist/ names an e2e fixture (e2efixture, e2e-fixture, E2E Fixture)', { skip: notBuilt }, () => {
  const needles = FIXTURE_MARKS.map((mark) => Buffer.from(mark, 'utf8'));
  const files = walk(DIST).filter((e) => !e.dir);
  assert.ok(files.length > 50, `${files.length} files`);
  const hits = files.filter((e) => {
    const bytes = readFileSync(e.path);
    return needles.some((needle) => bytes.includes(needle));
  });
  assert.deepEqual(hits.map((e) => relative(DIST, e.path)), []);
});
