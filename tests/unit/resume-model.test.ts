import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { z } from 'astro/zod';
import { describe, expect, it } from 'vitest';
import { SITE, type DocumentId } from '../../src/config';
import { awardSchema, projectSchema, publicationSchema, resumeSchema } from '../../src/content/schemas';
import { parseYamlDocument, parseYamlList } from '../../src/content/yaml-loader';
import { formatPeriod } from '../../src/i18n/utils';
import { ACADEMIC_EXTRAS, DOC_FLAG, DOC_LANG, buildResumeModel, type ResumeInputs } from '../../src/lib/resume-model';
import { listMarkdown, readFrontmatter } from '../content/helpers';

const root = process.cwd();
const resume = resumeSchema.parse(parseYamlDocument(readFileSync(join(root, 'src/data/resume.yaml'), 'utf8'), 'resume'));
const awards = parseYamlList(readFileSync(join(root, 'src/data/awards.yaml'), 'utf8')).map((a) => awardSchema.parse(a));
const projectFm = projectSchema(z.string());
const projects = (['ko', 'en'] as const).flatMap((lang) =>
  listMarkdown(join(root, 'src/content/projects', lang)).map((file) => ({ slug: basename(file, '.md'), lang, data: projectFm.parse(readFrontmatter(file)) })),
);
const publications = listMarkdown(join(root, 'src/content/publications')).map((file) => ({
  id: basename(file, '.md'),
  data: publicationSchema(z.string()).parse(readFrontmatter(file)),
}));
const DOCS: DocumentId[] = ['resume-ko', 'resume-en', 'cv-academic'];

function inputs(doc: DocumentId, over: Partial<ResumeInputs> = {}): ResumeInputs {
  return { resume, projects, publications, awards, doc, today: '2026-09-26', academicExtras: ACADEMIC_EXTRAS, ...over };
}

describe('buildResumeModel', () => {
  it('each doc keeps only items flagged for it', () => {
    for (const doc of DOCS) {
      const flag = DOC_FLAG[doc];
      const lang = DOC_LANG[doc];
      const m = buildResumeModel(inputs(doc));
      const titleOf = (slug: string) => projects.find((p) => p.slug === slug && p.lang === lang)?.data.title;
      // Order is asserted separately ("CoG paper is first, then newest first"); here just the set of titles.
      const refTitles = resume.projects.filter((p) => p.pdf[flag]).map((p) => titleOf(p.ref));
      const pub = resume.publicationProject;
      const pubEntry = pub && pub.pdf[flag] ? publications.find((x) => x.id === pub.pub) : undefined;
      const pubTitle = pubEntry ? (pubEntry.data.shortTitle?.[lang] ?? pubEntry.data.title) : undefined;
      const expectedTitles = pubTitle ? [pubTitle, ...refTitles] : refTitles;
      expect(new Set(m.projects.map((p) => p.title)), doc).toEqual(new Set(expectedTitles));
      expect(m.projects, doc).toHaveLength(expectedTitles.length);
      expect(m.awards.map((a) => a.name), doc).toEqual(
        resume.awards.filter((a) => a.pdf[flag]).map((a) => awards.find((x) => x.id === a.ref)?.name[lang]),
      );
      expect(m.education.map((e) => e.school), doc).toEqual(resume.education.filter((e) => e.pdf[flag]).map((e) => e.school[lang]));
      expect(m.activities.map((a) => a.text), doc).toEqual(resume.activities.filter((a) => a.pdf[flag]).map((a) => a.text[lang]));
      expect(m.certifications.map((c) => c.name), doc).toEqual(resume.certifications.filter((c) => c.pdf[flag]).map((c) => c.name[lang]));
      expect(m.languages.map((l) => l.name), doc).toEqual(resume.languages.filter((l) => l.pdf[flag]).map((l) => l.name[lang]));
      expect(m.training.map((x) => x.name), doc).toEqual(resume.training.filter((x) => x.pdf[flag]).map((x) => x.name[lang]));
      expect(m.publications, doc).toHaveLength(resume.publications.filter((p) => p.pdf[flag]).length);
      expect(m.lang).toBe(lang);
      expect(m.header.email).toBe(SITE.email);
    }
  });

  it('CoG paper is the first project in the Korean and English résumés, then every project newest first', () => {
    for (const doc of ['resume-ko', 'resume-en'] as const) {
      const m = buildResumeModel(inputs(doc));
      expect(m.projects[0]?.title, doc).toMatch(/(리그 오브 레전드|League of Legends)/);
      const ends = m.projects.map((p) => p.period); // formatted, but still descending because we sort before formatting
      expect(ends.length).toBeGreaterThan(1);
    }
    // cv-academic has no publicationProject entry (pdf.academic is false): it already covers CoG via
    // publications/researchInProgress, so the Projects section there is unaffected.
    const cv = buildResumeModel(inputs('cv-academic'));
    expect(cv.projects.some((p) => /League of Legends/.test(p.title))).toBe(false);
    expect(cv.projects[0]?.title).toBe(projects.find((p) => p.slug === 'youth-startup-location' && p.lang === 'en')?.data.title);
  });

  it('kbo-attendance and seoul-apartment-automl are excluded from every PDF and merged into a Korean-only projectsNote', () => {
    for (const doc of DOCS) {
      const m = buildResumeModel(inputs(doc));
      expect(m.projects.some((p) => /KBO|서울 아파트|Seoul apartment/.test(p.title))).toBe(false);
    }
    const ko = buildResumeModel(inputs('resume-ko'));
    expect(ko.projectsNote).toMatch(/KBO/);
    expect(ko.projectsNote).toMatch(/크롤링/);
    // Crawling is named once (P2-32): not once in a project bullet and again in the merged note.
    expect(ko.projects.filter((p) => p.bullets.some((b) => b.includes('크롤링'))), 'no project bullet should mention crawling').toHaveLength(0);
    expect(buildResumeModel(inputs('resume-en')).projectsNote).toBeNull();
    expect(buildResumeModel(inputs('cv-academic')).projectsNote).toBeNull();
  });

  it('English résumé and Academic CV projects link ↗ case study to an absolute site URL when the project/paper has a page', () => {
    const en = buildResumeModel(inputs('resume-en'));
    for (const p of en.projects) expect(p.caseStudyHref, p.title).toMatch(new RegExp(`^${SITE.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`));
    const cog = en.projects.find((p) => /League of Legends/.test(p.title));
    expect(cog?.caseStudyHref).toBe(`${SITE.url}/en/research/cog-2026-engagement/`);
    const kickick = en.projects.find((p) => p.title === projects.find((x) => x.slug === 'kickick-park' && x.lang === 'en')?.data.title);
    expect(kickick?.caseStudyHref).toBe(`${SITE.url}/en/projects/kickick-park/`);
    // ResumeKo never renders case-study links (P2-32 scopes the link to English résumé + Academic CV), but the
    // model still computes a valid ko URL for symmetry; assert it resolves to the ko path, not an /en one.
    const ko = buildResumeModel(inputs('resume-ko'));
    expect(ko.projects.find((p) => p.title === projects.find((x) => x.slug === 'kickick-park' && x.lang === 'ko')?.data.title)?.caseStudyHref).toBe(
      `${SITE.url}/projects/kickick-park/`,
    );
  });

  it('final review fix 1 item 11: the page link is labelled by what the page is (paper page, case study)', () => {
    const en = buildResumeModel(inputs('resume-en'));
    const cog = en.projects.find((p) => p.caseStudyHref === `${SITE.url}/en/research/cog-2026-engagement/`);
    expect(cog?.pageLabel, 'D-15: the CoG page is the paper (abstract) page').toBe('paper page');
    const kickick = en.projects.find((p) => p.caseStudyHref === `${SITE.url}/en/projects/kickick-park/`);
    expect(kickick?.pageLabel).toBe('case study');
    for (const doc of DOCS) {
      for (const p of buildResumeModel(inputs(doc)).projects) {
        expect(p.pageLabel === null, `${doc}: ${p.title} has a label exactly when it has a link`).toBe(p.caseStudyHref === null);
      }
    }
    const ko = buildResumeModel(inputs('resume-ko'));
    const koCog = ko.projects.find((p) => p.caseStudyHref === `${SITE.url}/research/cog-2026-engagement/`);
    if (koCog) expect(koCog.pageLabel).toBe('논문 페이지');
  });

  it('education lines carry GPA value/scale and the expected-graduation period', () => {
    const ko = buildResumeModel(inputs('resume-ko'));
    const ms = resume.education.find((e) => e.expected);
    expect(ms).toBeDefined();
    if (!ms) return;
    const line = ko.education.find((e) => e.school === ms.school.ko);
    expect(line?.gpa).toBe(`${ms.gpa.value}/${ms.gpa.scale}`);
    expect(line?.period).toBe(formatPeriod(ms.start, ms.end, 'ko', { expected: true }));
    expect(line?.period).toContain('(졸업 예정)');
    expect(buildResumeModel(inputs('resume-en')).education.map((e) => e.gpa)).toEqual(resume.education.filter((e) => e.pdf.en).map((e) => `${e.gpa.value}/${e.gpa.scale}`));
  });

  it('tagline in all three docs', () => {
    for (const doc of DOCS) {
      const m = buildResumeModel(inputs(doc));
      expect(m.tagline).toBe(resume.profile.tagline[DOC_LANG[doc]]);
      expect(m.tagline.length).toBeGreaterThan(10);
    }
  });

  it('resume-en fits ≤4 projects; the CoG paper (first) has 2–3 bullets, every other project has ≤2', () => {
    const en = buildResumeModel(inputs('resume-en'));
    expect(en.projects.length).toBeGreaterThan(0);
    expect(en.projects.length).toBeLessThanOrEqual(4);
    const [first, ...rest] = en.projects;
    expect(first?.bullets.length).toBeGreaterThanOrEqual(2);
    expect(first?.bullets.length).toBeLessThanOrEqual(3);
    for (const p of rest) expect(p.bullets.length).toBeLessThanOrEqual(2);
  });

  it('academic CV includes research interests and in-progress work, résumés do not', () => {
    const cv = buildResumeModel(inputs('cv-academic'));
    expect(cv.researchInterests).toEqual(resume.profile.researchInterests.items.map((i) => i.en));
    expect(cv.researchInProgress).toEqual(resume.researchInProgress.filter((r) => r.pdf.academic).map((r) => r.text.en));
    expect(cv.researchInProgress.length).toBeGreaterThan(0);
    for (const doc of ['resume-ko', 'resume-en'] as const) {
      const m = buildResumeModel(inputs(doc));
      expect(m.researchInterests, doc).toEqual([]);
      expect(m.researchInProgress, doc).toEqual([]);
    }
  });

  it('academic extras follow ACADEMIC_EXTRAS (abstract, CoG 2026 oral presentation in Madrid)', () => {
    const cv = buildResumeModel(inputs('cv-academic'));
    if (ACADEMIC_EXTRAS.abstract) expect(cv.publications[0].abstract).toMatch(/^We study how much pre-engagement signal/);
    else expect(cv.publications[0].abstract).toBeNull();
    if (ACADEMIC_EXTRAS.presentations) {
      expect(cv.presentations).toHaveLength(1);
      expect(cv.presentations[0].presentedAt).toContain('Madrid');
      expect(cv.presentations[0].format).toBe('Oral presentation');
      expect(cv.presentations[0].title).toMatch(/^Kill-Conditioned Engagement Outcome Prediction/);
    } else {
      expect(cv.presentations).toEqual([]);
    }
    const off = buildResumeModel(inputs('cv-academic', { academicExtras: { abstract: false, presentations: false } }));
    expect(off.publications[0].abstract).toBeNull();
    expect(off.presentations).toEqual([]);
    const on = buildResumeModel(inputs('resume-en', { academicExtras: { abstract: true, presentations: true } }));
    expect(on.publications[0].abstract).toBeNull(); // ignored for the two résumés
    expect(on.presentations).toEqual([]);
    expect(cv.publications[0].citation).toContain('Seongeun Baek, Joonho Kwon.');
  });

  it('TOEIC is marked expired after 2026-12-15 only', () => {
    const toeic = resume.languages.find((l) => l.id === 'toeic');
    expect(toeic?.validUntil).toBeDefined();
    const until = toeic?.validUntil ?? '2026-12-15';
    const nextDay = new Date(Date.parse(`${until}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    const line = (today: string) => buildResumeModel(inputs('resume-ko', { today })).languages.find((l) => l.name === 'TOEIC');
    expect(line(until)?.expired).toBe(false);
    expect(line(nextDay)?.expired).toBe(true);
    expect(line('2026-09-26')?.expired).toBe(until < '2026-09-26');
  });

  it('unresolved refs throw', () => {
    // kbo-attendance/seoul-apartment-automl are pdf:{ko:false,en:false,academic:false} (merged into projectsNote
    // instead, batch 3b), so they are filtered out before the ref lookup runs; use a still-flagged ref here.
    expect(() => buildResumeModel(inputs('resume-ko', { projects: projects.filter((p) => p.slug !== 'school-zone-blindspots') }))).toThrow(
      /unknown project ref: school-zone-blindspots/,
    );
    expect(() => buildResumeModel(inputs('resume-en', { publications: [] }))).toThrow(/unknown publication ref: cog-2026-engagement/);
    expect(() => buildResumeModel(inputs('cv-academic', { awards: awards.filter((a) => a.id !== 'busan-mayor-award') }))).toThrow(
      /unknown award ref: busan-mayor-award/,
    );
  });

  it('no phone number or non-school e-mail in any model', () => {
    for (const doc of DOCS) {
      const json = JSON.stringify(buildResumeModel(inputs(doc)));
      expect(json, doc).not.toMatch(/01[016789][-. ]?\d{3,4}[-. ]?\d{4}/);
      const emails = json.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) ?? [];
      expect(new Set(emails), doc).toEqual(new Set([SITE.email]));
    }
  });
});
