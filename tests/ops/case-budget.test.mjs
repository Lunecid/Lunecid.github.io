// CS-9 guard: the case-study overlay's bytes in the built site (plan budgets). Run after `npm run build`: npm run test:ops.
// The trigger a page ships stays tiny; the lazy chunk, its stylesheet and each language's sheet stay within budget; the
// pages that render a trigger carry no overlay code, CSS or sheet markup of their own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST = process.env.DIST_DIR ?? 'dist';
const astro = join(DIST, '_astro');
const gz = (/** @type {string} */ file) => gzipSync(readFileSync(file)).length;
const one = (/** @type {RegExp} */ re) => {
  const files = readdirSync(astro).filter((f) => re.test(f));
  assert.equal(files.length, 1, `${re}: ${files.join(', ')}`);
  return join(astro, files[0]);
};

test('trigger ≤ 1.5 KB gz, lazy JS ≤ 25 KB gz, lazy CSS ≤ 10 KB gz, each sheet ≤ 20 KB gz', () => {
  const sizes = {
    trigger: gz(one(/^CaseTrigger\.astro_astro_type_script_index_0_lang\..+\.js$/)),
    js: gz(one(/^overlay\..+\.js$/)),
    css: gz(one(/^overlay\..+\.css$/)),
    ko: gz(join(DIST, 'case/cog-2026-engagement/ko.json')),
    en: gz(join(DIST, 'case/cog-2026-engagement/en.json')),
  };
  console.log(`case budget (gzip bytes): ${JSON.stringify(sizes)}`);
  assert.ok(sizes.trigger <= 1536, `trigger ${sizes.trigger}`);
  assert.ok(sizes.js <= 25 * 1024, `lazy JS ${sizes.js}`);
  assert.ok(sizes.css <= 10 * 1024, `lazy CSS ${sizes.css}`);
  assert.ok(sizes.ko <= 20 * 1024 && sizes.en <= 20 * 1024, `sheets ${sizes.ko} / ${sizes.en}`);
});

test('trigger pages carry only the attribute and the trigger: no overlay CSS, markup or font', () => {
  for (const route of ['game', 'en/game', 'data', 'en/data', 'game/research', 'data/research', 'game/projects', 'data/projects', 'game/research/cog-2026-engagement', 'en/data/research/cog-2026-engagement']) {
    const html = readFileSync(join(DIST, route, 'index.html'), 'utf8');
    assert.match(html, /data-case="cog-2026-engagement"/, route);
    assert.match(html, /CaseTrigger\.astro_astro_type_script_index_0_lang\.[\w-]+\.js/, route);
    assert.doesNotMatch(html, /cs__sheet|cs-ch__title|sb-case-|overlay\.[\w-]+\.(?:css|js)/, route);
  }
});
