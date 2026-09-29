// Review Focus 3: pre-paint order. On the chooser the chooser-init script is the FIRST <script>, right after
// <meta charset>, before the motion init; no counter tag is in the static markup (the loader waits for the redirect
// decision); a version page carries no chooser script; a stub forwards before anything else. Run after npm run build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { STORAGE_KEYS } from '../../src/config.ts';

const DIST = process.env.DIST_DIR ?? 'dist';
const head = (route) => {
  const html = readFileSync(join(DIST, ...route.split('/').filter(Boolean), 'index.html'), 'utf8');
  return /<head[^>]*>([\s\S]*?)<\/head>/.exec(html)?.[1] ?? '';
};
const scripts = (h) => [...h.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].map((m) => ({ attrs: m[1], body: m[2] }));

for (const route of ['/', '/en/']) {
  test(`${route}: charset, then the chooser-init script, then the motion init; no static counter tag`, () => {
    const h = head(route);
    assert.match(h, /^\s*<meta charset="utf-8"\s*\/?>\s*<script>/);
    const list = scripts(h);
    assert.ok(list[0]?.body.includes(JSON.stringify(STORAGE_KEYS.variant)), 'first script is chooser-init');
    assert.ok(list[0]?.body.includes('location.replace'), 'first script redirects');
    assert.ok(list[1]?.body.includes('sb:motion'), 'second script is the motion init');
    assert.ok(!list.some((s) => /data-goatcounter/.test(s.attrs)), 'no static counter tag before the redirect decision');
  });
}

test('a version page has no chooser script; the motion init is first', () => {
  for (const route of ['/game/', '/en/data/records/']) {
    const list = scripts(head(route));
    assert.ok(list[0]?.body.includes('sb:motion'), route);
    assert.ok(!list.some((s) => s.body.includes(JSON.stringify(STORAGE_KEYS.variant))), route);
  }
});

test('a stub forwards first: charset → location.replace → meta refresh → canonical', () => {
  const h = head('/records/');
  const at = ['<meta charset="utf-8">', 'location.replace(', 'http-equiv="refresh"', 'rel="canonical"'].map((n) => h.indexOf(n));
  assert.ok(at.every((i, k) => i >= 0 && (k === 0 || i > at[k - 1])), at.join(','));
});
