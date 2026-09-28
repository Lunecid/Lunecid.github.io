// Scans the built site (dist/, including text extracted from dist/cv/*.pdf) for secrets and private data that
// must never be published (spec §8, §9.1, §10). Run after build + PDFs: npm run test:ops.
// Matches are reported by file and label with at most 3 characters of the value, because CI logs are public.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { glob, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { DOCUMENTS, SITE } from '../../src/config.ts';

const DIST = process.env.DIST_DIR ?? 'dist';
const TEXT_EXT = /\.(html|js|mjs|css|json|xml|txt|svg|webmanifest|map)$/i;

// Private values are NOT hard-coded (the repo is public). CI passes them as the optional secret
// PII_DENYLIST="<phone>|<birthdate>|<student id>"; each entry is matched literally.
const denylist = (process.env.PII_DENYLIST ?? '').split('|').map((s) => s.trim()).filter(Boolean);

const PATTERNS = [
  ['KR mobile number', /(?<![\d.])01[016789][-. ]?\d{3,4}[-. ]?\d{4}(?!\d)/],
  ['KR landline or +82 number', /(?<![\d.])(?:\+82[-. ]?|0)\d{1,2}[-. )]\d{3,4}[-. ]\d{4}(?!\d)/],
  ['birthdate-like date (19xx.MM.DD)', /\b19\d{2}[.\-/]\s?(0[1-9]|1[0-2])[.\-/]\s?(0[1-9]|[12]\d|3[01])\b/],
  ['resident registration number', /\b\d{6}-[1-4]\d{6}\b/],
  ['GitHub token', /\b(gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b/],
  ['Riot API key', /\bRGAPI-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i],
  ['NEXON Open API key', /\b(test|live)_[0-9a-f]{64,}\b/i],
  ['Steam Web API key (32 hex)', /\b(?:key|apikey|steam)[^\n]{0,20}[=:"' ]\b[0-9A-F]{32}\b/i],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['generic bearer header', /Authorization["']?\s*[:=]\s*["']?Bearer\s+[A-Za-z0-9._-]{20,}/],
];
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

/** Labels of every pattern found in `text`, each with at most the first 3 characters of the match. */
function scanText(text) {
  const hits = [];
  for (const [label, re] of PATTERNS) {
    const match = text.match(re);
    if (match) hits.push(`${label} -> "${match[0].slice(0, 3)}…"`);
  }
  return hits;
}

function maskEmail(address) {
  const [local, domain] = address.split('@');
  return `${local.slice(0, 1)}***@${domain}`;
}

function globalGitEmail() {
  try {
    return execFileSync('git', ['config', '--global', 'user.email'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return ''; // not set (e.g. CI)
  }
}

let warnedNoPdftotext = false;
function pdfText(file) {
  // pdftotext (poppler-utils) is installed in CI; on Windows it may be missing.
  try {
    return execFileSync('pdftotext', ['-enc', 'UTF-8', file, '-'], { encoding: 'utf8' });
  } catch (error) {
    if (process.env.CI) throw new Error(`pdftotext failed on ${file} (install poppler-utils): ${error.message}`);
    if (!warnedNoPdftotext) console.warn('pdftotext not available: PDF text is not scanned locally');
    warnedNoPdftotext = true;
    return '';
  }
}

let textsPromise = null;
/** [path, text] for every text file in dist plus the extracted text of every PDF (cached per run). */
function collectTexts() {
  textsPromise ??= (async () => {
    const texts = [];
    for await (const rel of glob('**/*', { cwd: DIST })) {
      const file = join(DIST, rel);
      if (TEXT_EXT.test(file)) texts.push([file, await readFile(file, 'utf8')]);
      else if (file.endsWith('.pdf')) texts.push([file, pdfText(file)]);
    }
    return texts;
  })();
  return textsPromise;
}

const notBuilt = !existsSync(DIST) && 'dist/ not built';

test('dist text and PDF text contain no secrets or private data', { skip: notBuilt }, async () => {
  const texts = await collectTexts();
  const gitEmail = globalGitEmail().toLowerCase();
  const hits = [];
  for (const [file, text] of texts) {
    for (const hit of scanText(text)) hits.push(`${file}: ${hit}`);
    for (const value of denylist) if (text.includes(value)) hits.push(`${file}: a PII_DENYLIST value`);
    if (gitEmail && text.toLowerCase().includes(gitEmail)) hits.push(`${file}: the machine's global git e-mail`);
  }
  assert.deepEqual(hits, [], hits.join('\n'));
  // Count only PDFs whose text was extracted (pdfText returns '' when pdftotext is missing locally).
  const pdfs = texts.filter(([file, text]) => file.endsWith('.pdf') && text !== '').length;
  console.log(
    `scanned ${texts.length} files (${pdfs} of ${Object.keys(DOCUMENTS).length} résumé PDFs), ${PATTERNS.length} patterns, ` +
      `${denylist.length} denylist entries, global git e-mail ${gitEmail ? 'checked' : 'not set'}`,
  );
});

test('only the school e-mail address appears', { skip: notBuilt }, async () => {
  const texts = await collectTexts();
  const others = new Set();
  let school = 0;
  for (const [file, text] of texts) {
    for (const match of text.matchAll(EMAIL)) {
      if (match[0].toLowerCase() === SITE.email) school += 1;
      else others.add(`${file}: ${maskEmail(match[0])}`);
    }
  }
  assert.deepEqual([...others], [], [...others].join('\n'));
  assert.ok(school > 0, `${SITE.email} should appear at least once (contact links)`);
});

test('the scanner flags a landline and a +82 number', () => {
  assert.ok(scanText('대표번호 ' + '051' + '-123-4567').some((hit) => hit.startsWith('KR landline or +82 number')));
  assert.ok(scanText('call ' + '+82' + ' 10-1234-5678').some((hit) => hit.startsWith('KR landline or +82 number')));
  assert.ok(scanText('mobile ' + '010' + '-1234-5678').some((hit) => hit.startsWith('KR mobile number')));
});

test('the scanner flags a GitHub token', () => {
  assert.ok(scanText('token=' + 'ghp' + '_' + 'A'.repeat(36)).some((hit) => hit.startsWith('GitHub token')));
  assert.ok(scanText('github' + '_pat_' + 'B'.repeat(70)).some((hit) => hit.startsWith('GitHub token')));
});

test('the scanner ignores dates, grades and version strings', () => {
  assert.deepEqual(scanText('2025-07-11 · 2024.12.15 · 2026.09.01–04 · 4.0/4.5 · 3.18/4.5 · v1.0-cog2026 · 0.669 · 206,442'), []);
});
