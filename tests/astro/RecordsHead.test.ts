import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import RecordsHead from '../../src/components/records/RecordsHead.astro';
import { DOCUMENTS, SITE } from '../../src/config';
import { resumeSchema } from '../../src/content/schemas';
import { parseYamlDocument } from '../../src/content/yaml-loader';
import type { Lang } from '../../src/i18n/ui';
import { readSource, renderAstro } from './helpers';
import { resolveIdentity } from '../../src/variants';
import { gameVariant } from '../../src/variants/game';
import { loadFactSource } from '../helpers/fact-source';

const resume = resumeSchema.parse(parseYamlDocument(readFileSync(resolve(process.cwd(), 'src/data/resume.yaml'), 'utf8'), 'resume'));
const identity = (lang: Lang) => resolveIdentity(gameVariant, lang, loadFactSource());
const render = (lang: Lang) =>
  renderAstro(RecordsHead, {
    props: {
      lang,
      name: resume.profile.name[lang],
      headline: identity(lang).headline,
      status: identity(lang).status,
      tagline: identity(lang).tagline,
      documents: resume.documents.map((d) => ({ id: d.id, label: d.label[lang], href: DOCUMENTS[d.id] })),
      contact: { email: SITE.email, github: SITE.githubUrl, dacon: SITE.daconUrl },
      ids: resume.researchIds,
    },
  });

describe('RecordsHead.astro (P2-19: a short head, not the home profile again)', () => {
  it('#profile: photo, greeting, name, role line, status, the one-line intro, contact; no education or skills list', async () => {
    const ko = await render('ko');
    expect(ko).toMatch(/<section id="profile" class="rhead read"/);
    expect(ko).toMatch(/<img(?=[^>]*class="rhead__photo")(?=[^>]*fetchpriority="high")[^>]*>/);
    expect(ko).toMatch(/<h2 id="profile-title"[^>]*>안녕하세요!<\/h2>/);
    expect(ko).toContain(resume.profile.name.ko);
    expect(ko).toMatch(new RegExp(`<p class="rhead__role"[^>]*>${identity('ko').headline.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}<\\/p>`));
    expect(ko).toContain(identity('ko').status);
    expect(ko).toContain(identity('ko').tagline);
    expect(ko).toContain(`mailto:${SITE.email}`);
    expect(ko).toContain(`href="${SITE.githubUrl}"`);
    expect(ko).toContain(`href="${SITE.daconUrl}"`);
    expect(ko).toMatch(/<a[^>]*href="https:\/\/dacon\.io\/myprofile\/530929\/home"[^>]*>DACON<\/a>/);
    for (const e of resume.education) expect(ko).not.toContain(e.school.ko);
    expect(ko).not.toContain('hello__chips');
  });

  it('the three PDFs as cut-corner buttons with D-7 labels, the page-language résumé filled', async () => {
    const ko = await render('ko');
    const buttons = [...ko.matchAll(/<a class="([^"]+)" href="([^"]+)" type="application\/pdf" title="([^"]+)"/g)];
    expect(buttons.map((m) => m[2])).toEqual(Object.values(DOCUMENTS));
    for (const [, cls] of buttons) expect(cls).toMatch(/\bbtn\b.*\bcut\b/);
    expect(buttons.map((m) => m[1].includes('btn--fill'))).toEqual([true, false, false]);
    expect(buttons.slice(1).every((m) => m[1].includes('btn--line'))).toBe(true);
    const en = await render('en');
    expect([...en.matchAll(/<a class="([^"]+)" href="[^"]+" type="application\/pdf"/g)].map((m) => m[1].includes('btn--fill'))).toEqual([false, true, false]);
    expect(buttons.map((m) => m[3])).toEqual(resume.documents.map((d) => `${d.label.ko} · PDF`));
  });

  it('an in-page bar: 학력 · 논문 · 수상 · 기술 · 지원 요건 대응 · PDF', async () => {
    const ko = await render('ko');
    const jumps = [...ko.matchAll(/<a class="rnav__link" href="([^"]+)"[^>]*>([^<]+)<\/a>/g)].map((m) => [m[1], m[2]]);
    expect(jumps).toEqual([
      ['#education', '학력'],
      ['#publications', '논문'],
      ['#awards', '수상'],
      ['#skills', '기술'],
      ['#job-fit', '지원 요건 대응'],
      ['#documents', 'PDF'],
    ]);
    expect(ko).toMatch(/<nav class="rnav" aria-label="기록 바로 가기"/);
    const en = await render('en');
    expect([...en.matchAll(/class="rnav__link"[^>]*>([^<]+)</g)].map((m) => m[1])).toEqual([
      'Education',
      'Publications',
      'Awards',
      'Skills',
      'Job requirements fit',
      'PDF',
    ]);
  });

  it('the photo is 112px beside the greeting on phones (P2-19), with a hairline border (P2-22)', () => {
    const src = readSource('src/components/records/RecordsHead.astro');
    expect(src).toMatch(/grid-template-columns: 112px minmax\(0, 1fr\); grid-template-areas: "photo intro" "more more"/);
    expect(src).toMatch(/\.rhead__photo\) \{[^}]*width: 112px;[^}]*border: 1px solid var\(--read-line\)/);
  });
});
