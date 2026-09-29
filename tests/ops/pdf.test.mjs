import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import yaml from 'js-yaml';
import { PDFDocument, PDFName } from 'pdf-lib';
import { DOCUMENTS, PRINT_ROUTES, SITE } from '../../src/config.ts';

const IDS = /** @type {(keyof typeof DOCUMENTS)[]} */ (Object.keys(DOCUMENTS));
const pdfPath = (id) => join('dist', ...DOCUMENTS[id].split('/').filter(Boolean));
const available = (bin) => !spawnSync(bin, ['-v'], { encoding: 'utf8' }).error;
const POPPLER = available('pdfinfo') && available('pdftotext') && available('pdffonts');
const popplerSkip = !POPPLER && !process.env.CI ? 'poppler (pdfinfo/pdftotext/pdffonts) not installed locally; runs in CI' : false;

/** pdfinfo when present, else count /Type /Page objects (Skia writes page dictionaries uncompressed). */
function pageCount(file) {
  if (POPPLER) return Number(/^Pages:\s+(\d+)/m.exec(execFileSync('pdfinfo', [file], { encoding: 'utf8' }))?.[1]);
  return (readFileSync(file, 'latin1').match(/\/Type\s*\/Page(?![A-Za-z])/g) ?? []).length;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ym = (s, lang) => {
  const [y, m] = s.split('-');
  return lang === 'ko' ? `${y}.${m}` : `${MONTHS[Number(m) - 1]} ${y}`;
};
/** Same output as formatPeriod(start, end, lang, { expected: true }) (contract §5.3). */
const expectedPeriod = (e, lang) => `${ym(e.start, lang)} – ${ym(e.end, lang)}${lang === 'ko' ? ' (졸업 예정)' : ' (expected)'}`;
const squash = (s) => s.replace(/\s+/g, '');
const DOC = {
  'resume-ko': { lang: 'ko', flag: 'ko', records: 'dist/game/records/index.html' },
  'resume-en': { lang: 'en', flag: 'en', records: 'dist/en/game/records/index.html' },
  'cv-academic': { lang: 'en', flag: 'academic', records: 'dist/en/game/records/index.html' },
  'resume-data-ko': { lang: 'ko', flag: 'ko', records: 'dist/data/records/index.html' },
  'resume-data-en': { lang: 'en', flag: 'en', records: 'dist/en/data/records/index.html' },
};

/** Every /URI action of every /Link annotation on every page, in reading order (pdf-lib low-level API). */
async function extractLinks(file) {
  const doc = await PDFDocument.load(await readFile(file));
  const links = [];
  for (const page of doc.getPages()) {
    const annotsRef = page.node.get(PDFName.of('Annots'));
    const annots = annotsRef && doc.context.lookup(annotsRef);
    if (!annots) continue;
    for (let i = 0; i < annots.size(); i += 1) {
      const annot = doc.context.lookup(annots.get(i));
      if (!annot || annot.get(PDFName.of('Subtype'))?.toString() !== '/Link') continue;
      const aRef = annot.get(PDFName.of('A'));
      const action = aRef && doc.context.lookup(aRef);
      const uri = action?.get(PDFName.of('URI'));
      if (uri) links.push(uri.decodeText ? uri.decodeText() : uri.toString());
    }
  }
  return links;
}

test('importing build-pdfs performs no work', async () => {
  const mtimes = () => IDS.map((id) => (existsSync(pdfPath(id)) ? statSync(pdfPath(id)).mtimeMs : null));
  const before = mtimes();
  const started = Date.now();
  const mod = await import('../../scripts/build-pdfs.mjs');
  assert.ok(Date.now() - started < 5000, 'import must not start a server or a browser');
  assert.deepEqual(mtimes(), before);
  assert.deepEqual(mod.pdfJobs('dist').map((j) => j.route), Object.keys(DOCUMENTS).map((id) => PRINT_ROUTES[id]));
  assert.deepEqual(
    mod.pdfJobs('dist').map((j) => j.out.replace(/\\/g, '/')),
    Object.values(DOCUMENTS).map((h) => `dist${h}`),
  );
  assert.equal(mod.pdfJobs('dist').length, Object.keys(DOCUMENTS).length);
});

test('every document PDF exists after build:pdf', () => {
  for (const id of IDS) {
    const file = pdfPath(id);
    assert.ok(existsSync(file), `${file} missing: run npm run build && npm run build:pdf first`);
    assert.equal(readFileSync(file).subarray(0, 5).toString('latin1'), '%PDF-', `${file} is not a PDF`);
  }
});

test('page counts: both Korean résumés 2 pages, both English résumés 1 page, the Academic CV 1–4', () => {
  for (const id of ['resume-ko', 'resume-data-ko']) assert.equal(pageCount(pdfPath(id)), 2, `${id} has ${pageCount(pdfPath(id))} pages`);
  for (const id of ['resume-en', 'resume-data-en']) assert.equal(pageCount(pdfPath(id)), 1, `${id} has ${pageCount(pdfPath(id))} pages`);
  const cv = pageCount(pdfPath('cv-academic'));
  assert.ok(cv >= 1 && cv <= 4, `cv-academic has ${cv} pages`);
});

test('PDF metadata: Author is set, Creator/Producer do not advertise HeadlessChrome (batch 3b P2-32)', { skip: popplerSkip }, () => {
  for (const id of IDS) {
    const info = execFileSync('pdfinfo', [pdfPath(id)], { encoding: 'utf8' });
    assert.match(info, /^Author:\s+Seongeun Baek$/m, `${id}: ${info}`);
    assert.doesNotMatch(info, /HeadlessChrome/, `${id}: Creator/Producer still names HeadlessChrome`);
    assert.match(info, /^Title:\s+\S.+$/m, `${id}: no PDF Title`);
  }
});

test('no "team-fight", ambiguous "Korean Native", or an Encouragement Award missing "Honorable Mention"', { skip: popplerSkip }, () => {
  for (const id of IDS) {
    const text = execFileSync('pdftotext', ['-enc', 'UTF-8', pdfPath(id), '-'], { encoding: 'utf8' });
    assert.doesNotMatch(text, /team-fight/i, `${id}: "team-fight"`);
    assert.doesNotMatch(text, /Korean Native/, `${id}: ambiguous "Korean Native" (want "Korean (native)")`);
    assert.doesNotMatch(text, /(?<!Honorable Mention \()Encouragement Award/, `${id}: "Encouragement Award" without "Honorable Mention"`);
  }
});

test('the CoG paper is the first project in resume-ko and resume-en', { skip: popplerSkip }, () => {
  const cases = [
    { id: 'resume-ko', cog: '리그 오브 레전드 교전 결과 예측', next: '청년 창업가를 위한 부산 상권 입지 제안' },
    { id: 'resume-en', cog: 'Predicting League of Legends engagement outcomes', next: 'Restaurant Locations for Young Founders in Busan' },
  ];
  for (const { id, cog, next } of cases) {
    const text = squash(execFileSync('pdftotext', ['-enc', 'UTF-8', pdfPath(id), '-'], { encoding: 'utf8' }));
    const cogAt = text.indexOf(squash(cog));
    const nextAt = text.indexOf(squash(next));
    assert.ok(cogAt >= 0, `${id}: CoG project title "${cog}" not found`);
    assert.ok(nextAt >= 0, `${id}: next project title "${next}" not found`);
    assert.ok(cogAt < nextAt, `${id}: CoG project (at ${cogAt}) is not before the next project (at ${nextAt})`);
  }
  // cv-academic deliberately has no CoG "project" entry (it already covers the paper via Publications/Presentations).
  const cvText = squash(execFileSync('pdftotext', ['-enc', 'UTF-8', pdfPath('cv-academic'), '-'], { encoding: 'utf8' }));
  assert.equal(cvText.includes(squash('Predicting League of Legends engagement outcomes')), false, 'cv-academic should not have a CoG project entry');
});

test('↗ page links (paper page, case study, project summary; resume-en, cv-academic) are absolute SITE URLs that resolve to real built routes', async () => {
  const en = await extractLinks(pdfPath('resume-en'));
  const academic = await extractLinks(pdfPath('cv-academic'));
  const ko = await extractLinks(pdfPath('resume-ko'));
  const caseStudyLinks = [...en, ...academic].filter((href) => href.startsWith(SITE.url) && !href.includes('/records/') && !/^https:\/\/lunecid\.github\.io\/(en\/)?(game|data)\/$/.test(href) && !href.endsWith('/game/research/'));
  assert.ok(caseStudyLinks.length >= 6, `expected several case-study links, got ${caseStudyLinks.length}`);
  for (const href of caseStudyLinks) {
    const pathname = href.slice(SITE.url.length);
    const file = join('dist', ...pathname.split('/').filter(Boolean), 'index.html');
    assert.ok(existsSync(file), `${href} -> ${file} does not exist; run npm run build first`);
  }
  // resume-ko never renders a case-study link (P2-32 scopes it to English résumé + Academic CV).
  assert.ok(ko.every((href) => !href.startsWith(`${SITE.url}/en/`) && !href.startsWith(`${SITE.url}/game/projects/`) && !href.startsWith(`${SITE.url}/game/research/`)));
});

test('§1.10 / A-12: the header site link of every PDF goes to its version (the Academic CV to the game research page)', async () => {
  const expected = {
    'resume-ko': `${SITE.url}/game/`, 'resume-en': `${SITE.url}/en/game/`, 'cv-academic': `${SITE.url}/en/game/research/`,
    'resume-data-ko': `${SITE.url}/data/`, 'resume-data-en': `${SITE.url}/en/data/`,
  };
  for (const [id, href] of Object.entries(expected)) {
    const links = await extractLinks(pdfPath(id));
    assert.ok(links.includes(href), `${id}: header link ${href} missing (${links.join(', ')})`);
    assert.ok(!links.includes(`${SITE.url}/`), `${id}: still links the site root`);
  }
});

test('case-study links resolve to built pages and stay in the document version', async () => {
  const version = { 'resume-en': 'game', 'cv-academic': 'game', 'resume-data-en': 'data' };
  for (const [id, v] of Object.entries(version)) {
    for (const href of (await extractLinks(pdfPath(id))).filter((h) => h.startsWith(SITE.url) && /\/(projects|research)\/[a-z0-9-]+\/$/.test(h))) {
      assert.match(href, new RegExp(`^${SITE.url.replace(/[.]/g, '\\.')}/(en/)?${v}/`), `${id}: ${href} leaves the ${v} version`);
      const file = join('dist', ...href.slice(SITE.url.length).split('/').filter(Boolean), 'index.html');
      assert.ok(existsSync(file), `${id}: ${href} -> ${file} missing`);
    }
  }
});

test('A4 page size', { skip: popplerSkip }, () => {
  for (const id of IDS) {
    const info = execFileSync('pdfinfo', [pdfPath(id)], { encoding: 'utf8' });
    assert.match(info, /^Page size:.*\(A4\)/m, `${id}: ${/^Page size:.*$/m.exec(info)?.[0]}`);
  }
});

test('fonts are embedded Pretendard CID TrueType, no Type 3', { skip: popplerSkip }, () => {
  for (const id of IDS) {
    const out = execFileSync('pdffonts', [pdfPath(id)], { encoding: 'utf8' });
    assert.doesNotMatch(out, /Type 3/, `${id}: Type 3 font found\n${out}`);
    const rows = out.split(/\r?\n/).slice(2).filter((l) => l.trim() !== '');
    assert.ok(rows.length > 0, `${id}: no fonts listed`);
    for (const row of rows) {
      assert.match(row, /Pretendard/, `${id}: non-Pretendard font: ${row}`);
      assert.match(row, /CID TrueType/, `${id}: ${row}`);
      assert.match(row, /\byes\s+yes\s+yes\b/, `${id}: not embedded/subset/unicode: ${row}`);
    }
  }
});

test('PDF text matches /records/ (GPA, graduation date, award names)', { skip: popplerSkip }, () => {
  const resume = /** @type {any} */ (yaml.load(readFileSync('src/data/resume.yaml', 'utf8')));
  const awards = /** @type {any[]} */ (yaml.load(readFileSync('src/data/awards.yaml', 'utf8')));
  for (const [id, d] of Object.entries(DOC)) {
    const text = squash(execFileSync('pdftotext', ['-enc', 'UTF-8', pdfPath(id), '-'], { encoding: 'utf8' }));
    const html = squash(readFileSync(d.records, 'utf8').replace(/<[^>]+>/g, ' '));
    const needles = [];
    for (const e of resume.education.filter((x) => x.pdf[d.flag])) {
      needles.push(`${e.gpa.value}/${e.gpa.scale}`);
      if (e.expected) needles.push(expectedPeriod(e, d.lang));
    }
    for (const r of resume.awards.filter((x) => x.pdf[d.flag])) needles.push(awards.find((a) => a.id === r.ref).name[d.lang]);
    assert.ok(needles.length >= 4, `${id}: expected GPA, graduation and award strings`);
    for (const n of needles) {
      assert.ok(text.includes(squash(n)), `${id} PDF lacks "${n}"`);
      assert.ok(html.includes(squash(n)), `${d.records} lacks "${n}"`);
    }
    assert.ok(text.includes(SITE.email), `${id} PDF lacks the school e-mail`);
  }
});
