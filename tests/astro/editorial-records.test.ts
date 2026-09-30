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
  it('RecordsHead: serif greeting, the page-language data résumé as the one filled button, underlined jumps', async () => {
    const documents = [
      { id: 'resume-data-ko', label: '국문 이력서 (2쪽)', href: '/cv/seongeun-baek-resume-data-ko.pdf' },
      { id: 'resume-data-en', label: '영문 이력서 (1쪽)', href: '/cv/seongeun-baek-resume-data-en.pdf' },
      { id: 'cv-academic', label: 'Academic CV', href: '/cv/seongeun-baek-cv-academic.pdf' },
    ];
    const html = await renderAstro(RecordsHead, {
      props: { variant: 'data', lang: 'ko', name: '백성은', status: '2027년 2월 석사 졸업 예정', tagline: '질문을 데이터로 바꾸고, 결과를 결정으로 잇습니다.', documents, contact: { email: 'todtjddms104204@pusan.ac.kr', github: 'https://github.com/Lunecid', dacon: 'https://dacon.io/myprofile/530929/home' } },
    });
    expect(html).toMatch(/<section id="profile" class="rhead-ed ed-sec"/);
    expect(html).toMatch(/<h2 id="profile-title" class="rhead-ed__hello" data-serif[^>]*>안녕하세요!<\/h2>/);
    expect(html).toMatch(/<li data-document="resume-data-ko"[^>]*>\s*<a class="ed-btn ed-btn--fill ed-docs__link"/); // DocButtons (P2-4) breaks the line after <li>
    expect(html.match(/ed-btn--fill/g)).toHaveLength(1);
    expect(html).toMatch(/<nav class="rnav-ed"[^>]*aria-label="기록 바로 가기"/);
    // e40655f: the DACON profile; F-098: the sixth jump, '#publications'.
    expect(html).toMatch(/<a class="ed-link" href="https:\/\/dacon\.io\/myprofile\/530929\/home"/);
    expect([...html.matchAll(/<nav class="rnav-ed"[\s\S]*?<\/nav>/g)][0]?.[0].match(/href="#[a-z-]+"/g)).toEqual(['href="#education"', 'href="#publications"', 'href="#awards"', 'href="#skills"', 'href="#job-fit"', 'href="#documents"']);
    expect(html).not.toMatch(HUD);
    expect(html).not.toMatch(/ghost-art/); // the game's Miku watermark (GhostArt) stays in the game branch
  });

  it('EducationTimeline and ProjectSummaryList: list rows without mono columns or index numbers', async () => {
    const edu = await renderAstro(EducationTimeline, { props: { variant: 'data', lang: 'ko', items: resume.education } });
    expect(edu).toMatch(/<section id="education" class="rec ed-sec"/);
    expect(edu.match(/<li class="ed-item"/g)).toHaveLength(resume.education.length);
    expect(edu.match(/<h3 class="ed-item__title" data-serif/g)).toHaveLength(resume.education.length);
    expect(edu.match(/· <a class="hit" href=/g)?.length ?? 0).toBe(resume.education.filter((e) => e.lab).length); // lab links: 44px hit area
    expect(edu).not.toMatch(HUD);
    const psum = await renderAstro(ProjectSummaryList, {
      props: { variant: 'data', lang: 'ko', items: [{ href: '/data/projects/kickick-park/', title: '킥킥파크', period: '2024.01 – 2024.03', org: '멀티캠퍼스', team: '5인 팀', summary: '요약입니다.' }] },
    });
    expect(psum).toMatch(/<section id="projects" class="rec ed-sec"/);
    expect(psum).toMatch(/<h3 class="ed-item__title" data-serif[^>]*><a class="hit" href="\/data\/projects\/kickick-park\/"[^>]*>킥킥파크<\/a>/);
    expect(psum).not.toMatch(HUD);
  });

  it('AwardList: the level as text (no medal chip), underlined certificate and project links', async () => {
    const html = await renderAstro(AwardList, {
      props: {
        variant: 'data', lang: 'ko',
        awards: [{ id: 'busan-mayor-award', title: '최우수상(부산광역시장상)', contest: '2025 Big Data 활용 대회', org: '부산광역시', date: '2025.07.11', dateIso: '2025-07-11', medal: { tier: 'gold', label: '최우수' }, certHref: '/_astro/c.webp', certWidth: 1280, certHeight: 1810, certSrcSet: null, certSizes: null, certAlt: '상장', certCaption: null, redactionNote: null, projectHref: '/data/projects/school-zone-blindspots/' }],
      },
    });
    expect(html).toMatch(/<li class="ed-item award-ed" data-award="busan-mayor-award"/);
    expect(html).toMatch(/<p class="ed-tag"[^>]*>최우수<\/p>/);
    expect(html).toMatch(/<h3 class="ed-item__title" data-serif[^>]*>최우수상\(부산광역시장상\)<\/h3>/);
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
    // F-059 (P-08): the meta renders as nowrap segments.
    expect(creds).toMatch(/<td class="creds-ed__meta num"[^>]*><span class="creds-ed__seg"[^>]*>2024\.09\.06<\/span><\/td>/);
    // e40655f: the activity evidence link (DACON record).
    expect(creds).toMatch(/<a class="ed-link creds-ed__ev" href="https:\/\/dacon\.io\/myprofile\/530929\/competition"[^>]*>DACON 기록/);
    expect(creds).not.toMatch(HUD);
    const skills = await renderAstro(SkillList, {
      props: { variant: 'data', lang: 'ko', primary: [{ name: 'Python', evidence: [{ label: '사각지대를 예측하다', href: '/data/projects/school-zone-blindspots/' }, { label: '논문 코드', href: 'https://github.com/Lunecid/x' }] }], familiar: [] },
    });
    expect(skills).toMatch(/<table class="ed-table skills-ed"/);
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
  });
});
