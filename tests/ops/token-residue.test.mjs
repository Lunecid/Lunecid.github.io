// Review Focus 2: no fact token survives in the built site or the PDFs (titles, meta, JSON-LD, island props, alt text…).
// Run after `npm run build` (+ `npm run build:pdf` for the PDF part): npm run test:ops.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { DOCUMENTS } from '../../src/config.ts';

const DIST = process.env.DIST_DIR ?? 'dist';
/** Fact-token namespaces only (so minified JS such as `{a.b}` never matches). */
const TOKEN = /\{(?:person|edu|awards|award|pub|project|cert|table)\.[A-Za-z0-9.:-]+\}/g;
const TEXT = /\.(html|xml|json|txt|js|webmanifest)$/i;
const POPPLER = !spawnSync('pdftotext', ['-v'], { encoding: 'utf8' }).error;
const popplerSkip = !POPPLER && !process.env.CI ? 'poppler not installed locally; runs in CI' : false;

/** @param {string} dir @returns {string[]} */
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));

test('no fact token in any built text file', () => {
  assert.ok(existsSync(DIST), `${DIST} missing: run npm run build first`);
  const hits = [];
  for (const file of walk(DIST).filter((f) => TEXT.test(f))) {
    for (const m of readFileSync(file, 'utf8').matchAll(TOKEN)) hits.push(`${relative(DIST, file).split(sep).join('/')}: ${m[0]}`);
  }
  assert.deepEqual(hits, [], hits.join('\n'));
});

test('no fact token in PDF text', { skip: popplerSkip }, () => {
  const hits = [];
  for (const href of Object.values(DOCUMENTS)) {
    const file = join(DIST, ...href.split('/').filter(Boolean));
    assert.ok(existsSync(file), `${file} missing: run npm run build:pdf first`);
    const text = execFileSync('pdftotext', ['-enc', 'UTF-8', file, '-'], { encoding: 'utf8' });
    for (const m of text.matchAll(TOKEN)) hits.push(`${href}: ${m[0]}`);
  }
  assert.deepEqual(hits, [], hits.join('\n'));
});

test('the scanner catches a planted token', () => {
  assert.equal([...'x {awards.count:top} {a.b} y'.matchAll(TOKEN)].length, 1);
});
