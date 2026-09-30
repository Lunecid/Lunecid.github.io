// AL-1 (C0, account-link spec §8.2): every built HTML file carries exactly one hash-based CSP meta, directly after
// <meta charset>, whose script/style hashes match the file's inline blocks AFTER the font rewrite (csp-finalize), with
// the pinned directive set; legacy stubs carry their own minimal policy. Run after npm run build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ACCOUNT_ADMIN } from '../../src/config.ts';

const DIST = process.env.DIST_DIR ?? 'dist';
const notBuilt = !existsSync(join(DIST, 'index.html')) && `${DIST}/ not built: run npm run build first`;
const STUB_MARKER = 'data-legacy-redirect';
const GC = 'https://lunecid.goatcounter.com';

/** @param {string} dir @returns {string[]} */
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
const htmlFiles = () => walk(DIST).filter((f) => f.endsWith('.html'));
const sha256 = (s) => `'sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}'`;
const decode = (s) => s.replace(/&#39;|&#x27;/g, "'").replace(/&quot;|&#34;/g, '"').replace(/&amp;/g, '&');
const META_RE = /<meta http-equiv="content-security-policy" content="([^"]*)"\s*\/?>/gi;
const EXEC_TYPES = new Set(['', 'module', 'text/javascript', 'application/javascript']);

/** @param {string} html @returns {Map<string, string[]>} directive name → sources */
function policy(html) {
  const m = [...html.matchAll(META_RE)][0];
  const map = new Map();
  for (const part of decode(m?.[1] ?? '').split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name) map.set(name.toLowerCase(), sources);
  }
  return map;
}
/** @param {string} attrs @param {string} name */
const attr = (attrs, name) => new RegExp(`(?:^|\\s)${name}(?:\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+)))?(?=\\s|$)`, 'i').exec(attrs);
// Both raw-text elements in one left-to-right scan, as the parser reads them: "<style>" text inside a script body is
// part of that script, not a style element.
const blocks = (html) => [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>|<style\b[^>]*>([\s\S]*?)<\/style>/gi)];
const inlineScripts = (html) =>
  blocks(html)
    .filter((m) => m[3] === undefined && !attr(m[1], 'src') && EXEC_TYPES.has(((t) => (t ? (t[1] ?? t[2] ?? t[3] ?? '') : ''))(attr(m[1], 'type')).trim().toLowerCase()))
    .map((m) => m[2]);
const inlineStyles = (html) => blocks(html).filter((m) => m[3] !== undefined).map((m) => m[3]);
const governing = (p, kind) => p.get(`${kind}-src-elem`) ?? p.get(`${kind}-src`) ?? p.get('default-src') ?? [];

test('every built HTML file has exactly one CSP meta, directly after <meta charset="utf-8">', { skip: notBuilt }, () => {
  const problems = [];
  const files = htmlFiles();
  assert.ok(files.some((f) => f.endsWith(join('print', 'resume-ko', 'index.html'))), 'print pages are walked');
  assert.ok(files.some((f) => f.endsWith('404.html')), '404.html is walked');
  for (const file of files) {
    const html = readFileSync(file, 'utf8');
    const count = [...html.matchAll(META_RE)].length;
    if (count !== 1) { problems.push(`${relative(DIST, file)}: ${count} CSP metas`); continue; }
    if (!/<meta charset="utf-8"\s*\/?>\s*<meta http-equiv="content-security-policy"/i.test(html)) problems.push(`${relative(DIST, file)}: CSP meta is not directly after <meta charset>`);
    const before = html.slice(0, html.search(META_RE));
    if (/<script|<style|<link/i.test(before)) problems.push(`${relative(DIST, file)}: a script/style/link comes before the CSP meta`);
  }
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('every executable inline <script> and every <style> is allowed by its hash in the governing directive', { skip: notBuilt }, () => {
  const problems = [];
  let checked = 0;
  for (const file of htmlFiles()) {
    const html = readFileSync(file, 'utf8');
    const p = policy(html);
    const scriptSrc = governing(p, 'script');
    const styleSrc = governing(p, 'style');
    for (const body of inlineScripts(html)) { checked++; if (!scriptSrc.includes(sha256(body))) problems.push(`${relative(DIST, file)}: script ${JSON.stringify(body.slice(0, 40))} not hashed`); }
    for (const body of inlineStyles(html)) { checked++; if (!styleSrc.includes(sha256(body))) problems.push(`${relative(DIST, file)}: style ${JSON.stringify(body.slice(0, 40))} not hashed`); }
  }
  assert.ok(checked > 0, 'no inline block was found at all');
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('script-src keeps self and never unsafe-inline/unsafe-eval/strict-dynamic; style attributes only as style-src-attr', { skip: notBuilt }, () => {
  const problems = [];
  for (const file of htmlFiles()) {
    const html = readFileSync(file, 'utf8');
    const p = policy(html);
    const name = relative(DIST, file);
    for (const d of ['script-src', 'script-src-elem', 'script-src-attr', 'style-src', 'style-src-elem']) {
      for (const bad of ["'unsafe-inline'", "'unsafe-eval'", "'strict-dynamic'", "'unsafe-hashes'"]) if (p.get(d)?.includes(bad)) problems.push(`${name}: ${d} has ${bad}`);
    }
    if (html.includes(STUB_MARKER)) continue;
    if (!governing(p, 'script').includes("'self'")) problems.push(`${name}: script-src lacks 'self'`);
    if ((p.get('style-src-attr') ?? []).join(' ') !== "'unsafe-inline'") problems.push(`${name}: style-src-attr is ${p.get('style-src-attr')?.join(' ')}`);
  }
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('non-stub pages: exactly the pinned directive set; connect-src names the relay only when ACCOUNT_ADMIN.relay is set', { skip: notBuilt }, () => {
  const connect = ACCOUNT_ADMIN.relay === null ? `'self' ${GC}` : `'self' ${ACCOUNT_ADMIN.relay} ${GC}`;
  const expected = {
    'default-src': "'self'",
    'connect-src': connect,
    'img-src': `'self' data: ${GC}`,
    'media-src': "'self'",
    'object-src': "'none'",
    'base-uri': "'self'",
    'form-action': "'none'",
  };
  // The full directive set: a directive Astro adds later (or one that goes missing) fails here.
  const names = [...Object.keys(expected), 'font-src', 'script-src', 'style-src', 'style-src-attr'].sort();
  const problems = [];
  for (const file of htmlFiles()) {
    const html = readFileSync(file, 'utf8');
    if (html.includes(STUB_MARKER)) continue;
    const p = policy(html);
    if (JSON.stringify([...p.keys()].sort()) !== JSON.stringify(names)) problems.push(`${relative(DIST, file)}: directives ${[...p.keys()].join(', ')}`);
    if ((p.get('font-src') ?? []).join(' ') !== "'self'") problems.push(`${relative(DIST, file)}: font-src is "${p.get('font-src')?.join(' ')}"`);
    for (const [d, v] of Object.entries(expected)) if ((p.get(d) ?? []).join(' ') !== v) problems.push(`${relative(DIST, file)}: ${d} is "${p.get(d)?.join(' ')}"`);
    const cs = (p.get('connect-src') ?? []).join(' ');
    if (cs.includes('api.github.com')) problems.push(`${relative(DIST, file)}: connect-src opens api.github.com`);
    const workers = (cs.match(/workers\.dev/g) ?? []).length;
    if (workers !== (ACCOUNT_ADMIN.relay === null ? 0 : 1)) problems.push(`${relative(DIST, file)}: ${workers} workers.dev origins`);
  }
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('legacy stubs: default-src none, script-src = the hash of their one script, img-src self', { skip: notBuilt }, () => {
  const problems = [];
  let stubs = 0;
  for (const file of htmlFiles()) {
    const html = readFileSync(file, 'utf8');
    if (!html.includes(STUB_MARKER)) continue;
    stubs++;
    const p = policy(html);
    const scripts = inlineScripts(html);
    const name = relative(DIST, file);
    if (scripts.length !== 1) problems.push(`${name}: ${scripts.length} scripts`);
    if ((p.get('default-src') ?? []).join(' ') !== "'none'") problems.push(`${name}: default-src`);
    if ((p.get('script-src') ?? []).join(' ') !== sha256(scripts[0] ?? '')) problems.push(`${name}: script-src`);
    if ((p.get('img-src') ?? []).join(' ') !== "'self'") problems.push(`${name}: img-src`);
  }
  assert.ok(stubs > 0, 'no legacy stub found');
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('no built text file names the e2e fixture relay', { skip: notBuilt }, () => {
  const hits = walk(DIST).filter((f) => /\.(html|js|mjs|json|xml)$/i.test(f) && readFileSync(f, 'utf8').includes('e2e-fixture'));
  assert.deepEqual(hits.map((f) => relative(DIST, f)), []);
});

test('no page has an inline event handler or a javascript: URL (script-src-attr stays closed)', { skip: notBuilt }, () => {
  const problems = [];
  for (const file of htmlFiles()) {
    // Outside script/style bodies only: code or CSS text is not markup.
    const markup = readFileSync(file, 'utf8').replace(/<script\b([^>]*)>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
    const handler = /<[a-z][^>]*\son[a-z]+\s*=/i.exec(markup);
    if (handler) problems.push(`${relative(DIST, file)}: inline handler ${handler[0].slice(0, 60)}`);
    if (/javascript:/i.test(markup)) problems.push(`${relative(DIST, file)}: javascript: URL`);
  }
  assert.deepEqual(problems, [], problems.join('\n'));
});
