// Review Focus 3: pre-paint order. On the chooser the chooser-init script is the FIRST <script>, right after
// <meta charset> and the CSP meta (AL-1, C0), before the motion init; no counter tag is in the static markup (the loader waits for the redirect
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
  test(`${route}: charset, then the CSP meta, then the chooser-init script, then the motion init; no static counter tag`, () => {
    const h = head(route);
    assert.match(h, /^\s*<meta charset="utf-8"\s*\/?>\s*<meta http-equiv="content-security-policy"[^>]*>\s*<script>/);
    assert.equal(h.match(/http-equiv="content-security-policy"/g)?.length, 1, 'exactly one CSP meta');
    const list = scripts(h);
    assert.ok(list[0]?.body.includes(JSON.stringify(STORAGE_KEYS.variant)), 'first script is chooser-init');
    assert.ok(list[0]?.body.includes('location.replace'), 'first script redirects');
    assert.ok(list[1]?.body.includes('sb:motion'), 'second script is the motion init');
    assert.ok(!list.some((s) => /data-goatcounter/.test(s.attrs)), 'no static counter tag before the redirect decision');
  });
}

test('a version page has no chooser script; the CSP meta, then the motion init is first', () => {
  for (const route of ['/game/', '/en/data/records/']) {
    assert.match(head(route), /^\s*<meta charset="utf-8"\s*\/?>\s*<meta http-equiv="content-security-policy"[^>]*>/, route);
    const list = scripts(head(route));
    assert.ok(list[0]?.body.includes('sb:motion'), route);
    assert.ok(!list.some((s) => s.body.includes(JSON.stringify(STORAGE_KEYS.variant))), route);
  }
});

test('a stub forwards first: charset → CSP meta → location.replace → meta refresh → canonical', () => {
  const h = head('/records/');
  assert.match(h, /^\s*<meta charset="utf-8"\s*\/?>\s*<meta http-equiv="content-security-policy"[^>]*>\s*<script>location\.replace\(/);
  const at = ['<meta charset="utf-8">', 'http-equiv="content-security-policy"', 'location.replace(', 'http-equiv="refresh"', 'rel="canonical"'].map((n) => h.indexOf(n));
  assert.ok(at.every((i, k) => i >= 0 && (k === 0 || i > at[k - 1])), at.join(','));
});
