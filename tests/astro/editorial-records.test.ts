import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import AwardList from '../../src/components/records/AwardList.astro';
import CredentialList from '../../src/components/records/CredentialList.astro';
import EducationTimeline from '../../src/components/records/EducationTimeline.astro';
import JobFitTable from '../../src/components/records/JobFitTable.astro';
import ProjectSummaryList from '../../src/components/records/ProjectSummaryList.astro';
import RecordsHead from '../../src/components/records/RecordsHead.astro';
import SkillList from '../../src/components/records/SkillList.astro';
import { jobfitSchema, resumeSchema } from '../../src/content/schemas';
import { parseYamlDocument } from '../../src/content/yaml-loader';
import { loadFactSource } from '../helpers/fact-source';
import { renderAstro } from './helpers';

const HUD = /(?<![\w-])(read-sec|read|lh-rows|lh-row|lh-idx|lh-chips|lh-chip|lh-tag|lh-table|lh-frame|bracket|btn|cut|badge|hud-label|award__medal)(?![\w-])/;
const yaml = (rel: string): string => readFileSync(resolve(process.cwd(), rel), 'utf8');
const resume = resumeSchema.parse(parseYamlDocument(yaml('src/data/resume.yaml'), 'resume'));
const jobfit = jobfitSchema.parse(parseYamlDocument(yaml('src/data/jobfit.game.yaml'), 'game'));

describe('records components on the general version (P2-8)', () => {
  // DS-7 (named rewrite of the P2-8 test): the v5 CV head — the photo in a white frame with the painted composition
  // below it, the section opener (rail number + chip) and the greeting, name, status, tagline and the documents row;
  // the jump list and the contacts moved to the page's sidebar (RecordsView).
  it('RecordsHead: v5 CV head — photo frame with the painted composition below, opener, greeting, the page-language résumé as the one filled button', async () => {
    const documents = [
      { id: 'resume-data-ko', label: '국문 이력서 (2쪽)', href: '/cv/seongeun-baek-resume-data-ko.pdf' },
      { id: 'resume-data-en', label: '영문 이력서 (1쪽)', href: '/cv/seongeun-baek-resume-data-en.pdf' },
      { id: 'cv-academic', label: 'Academic CV', href: '/cv/seongeun-baek-cv-academic.pdf' },
    ];
    const html = await renderAstro(RecordsHead, {
      props: { variant: 'data', lang: 'ko', name: '백성은', status: '2027년 2월 석사 졸업 예정', tagline: '질문을 데이터로 바꾸고, 결과를 결정으로 잇습니다.', documents, contact: { email: 'todtjddms104204@pusan.ac.kr', github: 'https://github.com/Lunecid', dacon: 'https://dacon.io/myprofile/530929/home' } },
    });
    expect(html).toMatch(/<section id="profile" class="rhead-ed ed-sec"/);
    expect(html).toMatch(/<div class="rhead-ed__photo"[^>]*><picture[\s\S]*?<\/picture><span class="ed-mc ed-mc--cv" aria-hidden="true"/);
    expect(html).toMatch(/<header class="ed-head ed-sh"[\s\S]*?<p class="ed-label ed-chip"[^>]*>프로필<\/p>[\s\S]*?<h2 id="profile-title" class="ed-head__title"[^>]*>안녕하세요!<\/h2>/);
    expect(html).not.toMatch(/data-serif/);
    for (const text of ['백성은', '2027년 2월 석사 졸업 예정', '질문을 데이터로 바꾸고, 결과를 결정으로 잇습니다.']) expect(html).toContain(text);
    expect(html).toMatch(/<li data-document="resume-data-ko"[^>]*>\s*<a class="ed-btn ed-btn--fill ed-docs__link"/); // DocButtons (P2-4) breaks the line after <li>
    expect(html.match(/ed-btn--fill/g)).toHaveLength(1);
    expect(html).not.toMatch(/rnav-ed|mailto:/); // DS-7: in the sidebar now
    expect(html).not.toMatch(HUD);
    expect(html).not.toMatch(/ghost-art/); // the game's Miku watermark (GhostArt) stays in the game branch
  });

  it('DS-7: the jump list keeps its six targets (recordJumps, shared by the game bar and the general sidebar)', async () => {
    const { recordJumps } = await import('../../src/lib/records');
    expect(recordJumps('ko').map((j) => j.href)).toEqual(['#education', '#publications', '#awards', '#skills', '#job-fit', '#documents']);
    expect(recordJumps('en').map((j) => j.label)).toEqual(['Education', 'Publications', 'Awards', 'Skills', 'Job requirements fit', 'PDF']);
  });

  it('EducationTimeline and ProjectSummaryList: list rows without mono columns or index numbers', async () => {
    const edu = await renderAstro(EducationTimeline, { props: { variant: 'data', lang: 'ko', items: resume.education } });
    // DS-7 (named): a timeline with square marks (ed-tl), titles in SB Sans
    expect(edu).toMatch(/<section id="education" class="rec ed-sec"/);
    expect(edu).toMatch(/<ol class="ed-tl" role="list"/);
    expect(edu.match(/<li class="ed-tl__item"/g)).toHaveLength(resume.education.length);
    expect(edu.match(/<h3 class="ed-tl__title"/g)).toHaveLength(resume.education.length);
    expect(edu).not.toMatch(/data-serif/);
    expect(edu.match(/· <a class="hit" href=/g)?.length ?? 0).toBe(resume.education.filter((e) => e.lab).length); // lab links: 44px hit area
    expect(edu).not.toMatch(HUD);
    const psum = await renderAstro(ProjectSummaryList, {
      props: { variant: 'data', lang: 'ko', items: [{ href: '/data/projects/kickick-park/', title: '킥킥파크', period: '2024.01 – 2024.03', org: '멀티캠퍼스', team: '5인 팀', summary: '요약입니다.' }] },
    });
    expect(psum).toMatch(/<section id="projects" class="rec ed-sec"/);
    expect(psum).toMatch(/<ol class="ed-tl ed-tl--links" role="list"/);
    expect(psum).toMatch(/<h3 class="ed-tl__title"[^>]*><a class="hit" href="\/data\/projects\/kickick-park\/"[^>]*>킥킥파크<\/a>/);
    expect(psum).toMatch(/<p class="ed-tl__when"[^>]*><span class="tnum"[^>]*>2024\.01 – 2024\.03<\/span> · 멀티캠퍼스 · 5인 팀<\/p>/);
    expect(psum).not.toMatch(HUD);
  });

  it('AwardList: the level as text (no medal chip), underlined certificate and project links', async () => {
    const html = await renderAstro(AwardList, {
      props: {
        variant: 'data', lang: 'ko',
        awards: [{ id: 'busan-mayor-award', title: '최우수상(부산광역시장상)', contest: '2025 Big Data 활용 대회', org: '부산광역시', date: '2025.07.11', dateIso: '2025-07-11', medal: { tier: 'gold', label: '최우수' }, certHref: '/_astro/c.webp', certWidth: 1280, certHeight: 1810, certSrcSet: null, certSizes: null, certAlt: '상장', certCaption: null, redactionNote: null, projectHref: '/data/projects/school-zone-blindspots/' }],
      },
    });
    // DS-7 (named): certificates — corner marks (CSS), the level in an ink box, the name large
    expect(html).toMatch(/<ul class="ed-certs" role="list"/);
    expect(html).toMatch(/<li class="ed-cert award-ed" data-award="busan-mayor-award"/);
    expect(html).toMatch(/<p class="ed-cert__top"[^>]*><span class="ed-tbox"[^>]*>최우수<\/span><span[^>]*>부산광역시 · <time datetime="2025-07-11"[^>]*>2025\.07\.11<\/time><\/span><\/p>/);
    expect(html).toMatch(/<h3 class="ed-cert__name"[^>]*>최우수상\(부산광역시장상\)<\/h3>/);
    // The viewer trigger contract (0b2d199) and F-058's sr-only contest suffix (P-08).
    expect(html).toMatch(/<a class="ed-link award__cert" href="\/_astro\/c\.webp"[^>]*data-cert-id="busan-mayor-award"[^>]*data-viewer="certificates"[^>]*aria-haspopup="dialog"/);
    expect(html).toMatch(/<span class="sr-only"[^>]*> · 2025 Big Data 활용 대회<\/span>/); // scoped attribute: AwardList has a style block
    expect(html).not.toMatch(HUD);
  });

  it('CredentialList and SkillList: editorial tables that keep the row-group ids and the evidence links', async () => {
    const creds = await renderAstro(CredentialList, {
      props: {
        variant: 'data', lang: 'ko',
        groups: [
          { id: 'activities', title: '활동', items: [{ primary: 'LG Aimers 7기', meta: '2025.08', href: 'https://dacon.io/myprofile/530929/competition' }] },
          { id: 'certifications', title: '자격', items: [{ primary: 'ADsP', secondary: '한국데이터산업진흥원', meta: '2024.09.06' }] },
        ],
      },
    });
    expect(creds).toMatch(/<table class="ed-table creds-ed"/);
    expect(creds).toMatch(/<tbody id="certifications"/);
    expect(creds).toMatch(/<th colspan="2" scope="rowgroup" class="creds-ed__group"[^>]*><span class="ed-chip"[^>]*>자격<\/span><\/th>/); // DS-7: group rows as black chips
    // F-059 (P-08): the meta renders as nowrap segments.
    expect(creds).toMatch(/<td class="creds-ed__meta num"[^>]*><span class="creds-ed__seg"[^>]*>2024\.09\.06<\/span><\/td>/);
    // e40655f: the activity evidence link (DACON record).
    expect(creds).toMatch(/<a class="ed-link creds-ed__ev" href="https:\/\/dacon\.io\/myprofile\/530929\/competition"[^>]*>DACON 기록/);
    expect(creds).not.toMatch(HUD);
    const skills = await renderAstro(SkillList, {
      props: { variant: 'data', lang: 'ko', primary: [{ name: 'Python', evidence: [{ label: '사각지대를 예측하다', href: '/data/projects/school-zone-blindspots/' }, { label: '논문 코드', href: 'https://github.com/Lunecid/x' }] }], familiar: [] },
    });
    expect(skills).toMatch(/<table class="ed-table skills-ed"/);
    expect(skills).toMatch(/<th colspan="2" scope="rowgroup" class="skills-ed__group"[^>]*><span class="ed-chip"[^>]*>/); // DS-7
    expect(skills).toMatch(/<a class="ed-link" href="https:\/\/github\.com\/Lunecid\/x"[^>]*>논문 코드 <span aria-hidden="true"[^>]*>↗<\/span><\/a>/);
    expect(skills).not.toMatch(HUD);
  });

  it('JobFitTable: the same table in editorial colours, frequencies right-aligned; the pending state on white', async () => {
    // facts (CA-12): the component resolves the {table.*} and label tokens of jobfit.game.yaml itself.
    const html = await renderAstro(JobFitTable, { props: { variant: 'data', lang: 'ko', data: jobfit, facts: loadFactSource() } });
    expect(html).toMatch(/<section id="job-fit" class="jobfit jobfit--ed ed-sec"/);
    expect(html.match(/role="rowheader"/g)).toHaveLength(jobfit.rows.length);
    expect(html).not.toMatch(/read-sec|\{table\./);
    expect(html).toMatch(/class="jobfit__ev-note"[^>]*>[^<]*진행 중/); // P-09 (G-022): the qualifier is visible, not only in a tooltip
    const pending = await renderAstro(JobFitTable, { props: { variant: 'data', lang: 'ko', data: null, facts: loadFactSource() } });
    expect(pending).toMatch(/<section id="job-fit" class="jobfit jobfit--ed ed-sec"/);
    expect(pending).toContain('공고 조사를 마친 뒤 이 표를 채웁니다.');
    expect(pending).toMatch(/<p class="jobfit__pending ed-pending"[^>]*>공고 조사를 마친 뒤 이 표를 채웁니다\.<\/p>/); // DS-7: the yellow painted strip
  });

  it('DS-7: sidebar stats come from award counts and the publication format only', async () => {
    const { dataRecordsCopy } = await import('../../src/data/copy/data/records');
    const { resolveDeep, tokensIn } = await import('../../src/lib/facts');
    const facts = loadFactSource();
    for (const lang of ['ko', 'en'] as const) {
      const stats = dataRecordsCopy[lang].sidebarStats;
      expect(stats).toHaveLength(3);
      expect(JSON.stringify(stats).replace(/\{[^}]*\}/g, '')).not.toMatch(/\d/);
      expect(stats.flatMap((s) => [...tokensIn(s.label), ...tokensIn(s.value)]).sort()).toEqual(
        ['awards.count:encouragement', 'awards.count:top', 'awards.name:encouragement', 'awards.name:top', 'pub.cog-2026-engagement.format', 'pub.cog-2026-engagement.venueShort'].sort(),
      );
    }
    expect(resolveDeep(dataRecordsCopy.ko.sidebarStats, 'ko', facts).map((s) => `${s.label} ${s.value}`)).toEqual(['최우수상 ×2', '장려상 ×1', 'IEEE CoG 2026 구두 발표']);
    expect(resolveDeep(dataRecordsCopy.en.sidebarStats, 'en', facts).map((s) => `${s.label} ${s.value}`)).toEqual(['Top Excellence Award ×2', 'Honorable Mention (Encouragement Award) ×1', 'IEEE CoG 2026 oral presentation']);
  });
});
