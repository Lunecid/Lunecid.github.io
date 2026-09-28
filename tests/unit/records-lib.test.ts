import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { awardSchema, resumeSchema, type ResumeData } from '../../src/content/schemas';
import { parseYamlDocument, parseYamlList } from '../../src/content/yaml-loader';
import {
  AWARD_MEDAL,
  activityDate,
  awardItems,
  credentialItems,
  educationLine,
  evidenceHref,
  evidenceLabel,
  isExpired,
  projectSummaryItems,
  skillGroups,
  todayIso,
  visibleOnRecords,
} from '../../src/lib/records';
import { PROJECT_SLUGS } from '../../src/lib/routes';
import { CERTIFICATE_IDS } from '../../src/types';

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8');
const resume = resumeSchema.parse(parseYamlDocument(read('src/data/resume.yaml'), 'resume'));
const awards = parseYamlList(read('src/data/awards.yaml')).map((item) => awardSchema.parse(item));

// Explicit language fixture so the expiry logic does not depend on Task 0 Q21c.
const LANGUAGES: ResumeData['languages'] = [
  { id: 'korean', name: { ko: '한국어', en: 'Korean' }, level: { ko: '모국어', en: 'Native' }, records: false, pdf: { ko: false, en: true, academic: true } },
  {
    id: 'toeic',
    name: { ko: 'TOEIC', en: 'TOEIC' },
    level: { ko: '775점', en: '775' },
    date: '2024-12-15',
    validUntil: '2026-12-15',
    onExpire: 'mark',
    records: true,
    pdf: { ko: true, en: true, academic: true },
  },
];

describe('records helpers', () => {
  it('isExpired is false on validUntil and true the day after', () => {
    expect(isExpired('2026-12-15', '2026-12-15')).toBe(false);
    expect(isExpired('2026-12-15', '2026-12-16')).toBe(true);
    expect(isExpired('2026-12-15', '2026-11-30')).toBe(false);
    expect(isExpired(undefined, '2099-01-01')).toBe(false);
  });

  it('visibleOnRecords drops records:false', () => {
    const items = [{ id: 'a', records: false }, { id: 'b', records: true }, { id: 'c' }];
    expect(visibleOnRecords(items).map((item) => item.id)).toEqual(['b', 'c']);
    expect(visibleOnRecords(LANGUAGES).map((item) => item.id)).toEqual(['toeic']);
  });

  it('evidenceHref localizes project and research links', () => {
    expect(evidenceHref('project', 'kickick-park', 'ko')).toBe('/projects/kickick-park/');
    expect(evidenceHref('project', 'kickick-park', 'en')).toBe('/en/projects/kickick-park/');
    expect(evidenceHref('research', 'cog-2026-engagement', 'ko')).toBe('/research/cog-2026-engagement/');
    expect(evidenceHref('research', 'cog-2026-engagement', 'en')).toBe('/en/research/cog-2026-engagement/');
  });

  it('evidenceLabel uses the project title or the paper short title per language', () => {
    const ko = { projects: { 'kickick-park': '킥킥파크' }, stories: { 'cog-2026-engagement': '리그 오브 레전드 교전 결과 예측' } };
    const en = { projects: { 'kickick-park': 'KickKick Park' }, stories: { 'cog-2026-engagement': 'Predicting League of Legends engagement outcomes' } };
    expect(evidenceLabel('project', 'kickick-park', 'ko', ko)).toBe('킥킥파크');
    expect(evidenceLabel('project', 'kickick-park', 'en', en)).toBe('KickKick Park');
    expect(evidenceLabel('research', 'cog-2026-engagement', 'en', en)).toBe('Predicting League of Legends engagement outcomes');
    expect(() => evidenceLabel('project', 'missing', 'ko', ko)).toThrow('records: no title for project "missing" (ko)');
    // The kind picks the map: a project id is never looked up among the stories.
    expect(() => evidenceLabel('research', 'kickick-park', 'ko', ko)).toThrow(/no title for research "kickick-park"/);
  });

  it('projectSummaryItems keeps resume.yaml order, localizes hrefs and throws on an unknown ref', () => {
    const projects = [
      { id: 'ko/beta', data: { title: '베타', summary: '베타 요약', period: { start: '2024-01', end: '2024-03' }, org: '멀티캠퍼스', team: '3인 팀', status: 'published' as const } },
      { id: 'ko/alpha', data: { title: '알파', summary: '알파 요약', period: { start: '2025-04', end: '2025-07' }, org: '부산광역시', team: '4인 팀', status: 'published' as const } },
      { id: 'en/alpha', data: { title: 'Alpha', summary: 'Alpha summary', period: { start: '2025-04', end: '2025-07' }, org: 'Busan', team: '4-person team', status: 'published' as const } },
      { id: 'ko/gamma', data: { title: '감마', summary: '감마 요약', period: { start: '2023-09', end: '2024-01' }, org: '멀티캠퍼스', team: '4인 팀', status: 'card' as const } },
    ];
    const ko = projectSummaryItems([{ ref: 'alpha' }, { ref: 'beta' }], projects, 'ko');
    expect(ko.map((item) => item.href)).toEqual(['/projects/alpha/', '/projects/beta/']);
    // D-4: a 'card' project has no page, so its row is not a link.
    expect(projectSummaryItems([{ ref: 'gamma' }], projects, 'ko')[0]?.href).toBeNull();
    expect(ko[0]).toEqual({ href: '/projects/alpha/', title: '알파', period: '2025.04 – 2025.07', org: '부산광역시', team: '4인 팀', summary: '알파 요약' });
    const en = projectSummaryItems([{ ref: 'alpha' }], projects, 'en');
    expect(en[0]).toMatchObject({ href: '/en/projects/alpha/', title: 'Alpha', period: 'Apr 2025 – Jul 2025', team: '4-person team' });
    expect(() => projectSummaryItems([{ ref: 'beta' }], projects, 'en')).toThrow('records: unknown project ref "beta" (en)');
    expect(() => projectSummaryItems([{ ref: 'nope' }], projects, 'ko')).toThrow(/unknown project ref "nope"/);
  });

  it('todayIso uses Asia/Seoul', () => {
    expect(todayIso(new Date('2026-12-15T14:59:59Z'))).toBe('2026-12-15'); // 23:59:59 KST
    expect(todayIso(new Date('2026-12-15T15:00:00Z'))).toBe('2026-12-16'); // 00:00 KST next day
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('AWARD_MEDAL tiers', () => {
    expect(Object.keys(AWARD_MEDAL).sort()).toEqual([...CERTIFICATE_IDS].sort());
    expect(AWARD_MEDAL['busan-mayor-award']).toEqual({ tier: 'gold', label: { ko: '최우수', en: 'Top Excellence' } });
    expect(AWARD_MEDAL['multicampus-grand-award']).toEqual({ tier: 'gold', label: { ko: '최우수', en: 'Top Excellence' } });
    expect(AWARD_MEDAL['cds-encouragement-award']).toEqual({ tier: 'silver', label: { ko: '장려', en: 'Honorable Mention' } }); // P2-29
  });

  it('educationLine separates school, degree and period (P2-29)', () => {
    const ms = resume.education.find((e) => e.id === 'ms-pnu');
    if (!ms) throw new Error('ms-pnu missing');
    expect(educationLine(ms, 'en')).toBe('Graduate School of Data Science, Pusan National University · M.S. in Data Science · Mar 2025 – Feb 2027 (expected)');
    expect(educationLine(ms, 'ko')).toBe('부산대학교 데이터사이언스전문대학원 · 데이터사이언스학과 석사과정 · 2025.03 – 2027.02 (졸업 예정)');
  });

  it('activityDate shows a year, a month or a month range', () => {
    expect(activityDate({ date: '2025' }, 'ko')).toBe('2025');
    expect(activityDate({ date: '2025-07' }, 'ko')).toBe('2025.07');
    expect(activityDate({ date: '2025-07' }, 'en')).toBe('Jul 2025');
    expect(activityDate({ date: '2025-07', end: '2025-09' }, 'ko')).toBe('2025.07 – 2025.09');
    expect(activityDate({ date: '2025-07', end: '2025-09' }, 'en')).toBe('Jul 2025 – Sep 2025');
  });

  it('credentialItems marks TOEIC expired only after validUntil and hides PDF-only languages', () => {
    const fixture = { ...resume, languages: LANGUAGES };
    const lastDay = credentialItems(fixture, 'ko', '2026-12-15');
    expect(lastDay.languages).toHaveLength(1);
    expect(lastDay.languages[0]).toEqual({ primary: 'TOEIC', secondary: '775점', meta: '2024.12.15 · 2026.12.15까지 유효', badge: undefined });
    expect(credentialItems(fixture, 'ko', '2026-12-16').languages[0].badge).toBe('만료');
    expect(credentialItems(fixture, 'en', '2027-01-01').languages[0]).toMatchObject({
      secondary: '775',
      meta: 'Dec 15, 2024 · Valid until Dec 15, 2026',
      badge: 'Expired',
    });
  });

  it('credentialItems formats certifications and training with hours', () => {
    const ko = credentialItems(resume, 'ko', '2026-01-01');
    expect(ko.certifications.map((item) => item.primary)).toEqual(resume.certifications.map((c) => c.name.ko));
    expect(ko.certifications[0]).toEqual({ primary: '데이터분석 준전문가(ADsP)', secondary: '한국데이터산업진흥원', meta: '2024.09.06' });
    expect(ko.training.find((item) => item.primary.startsWith('참여연구원'))?.meta).toBe('2025.10 · 2시간');
    const en = credentialItems(resume, 'en', '2026-01-01');
    expect(en.training.find((item) => item.primary.startsWith('Multi-IT'))?.meta).toBe('Sep 2023 – Mar 2024 · 956 hours');
    expect(en.training.find((item) => item.primary.startsWith('OxML'))?.meta).toBe('Aug 2025 · 25 hours');
    expect(en.activities).toHaveLength(resume.activities.length);
  });

  it('awardItems keeps resume order and links certificates and projects', () => {
    const certHrefs = {
      'busan-mayor-award': '/_astro/busan-mayor-award_1280.webp',
      'multicampus-grand-award': '/_astro/multicampus-grand-award_1280.webp',
    };
    const ko = awardItems(resume.awards, awards, 'ko', certHrefs);
    expect(ko.map((item) => item.id)).toEqual(resume.awards.map((r) => r.ref));
    expect(ko.find((item) => item.id === 'busan-mayor-award')).toEqual({
      id: 'busan-mayor-award',
      title: '최우수상(부산광역시장상)',
      contest: '2025 Big Data 활용 대회 · 빅데이터 분석 부문',
      org: '부산광역시',
      date: '2025.07.11',
      dateIso: '2025-07-11',
      medal: { tier: 'gold', label: '최우수' },
      certHref: '/_astro/busan-mayor-award_1280.webp',
      redactionNote: null, // nothing hidden: no caption (P2-19)
      projectHref: '/projects/school-zone-blindspots/',
    });
    expect(ko.find((item) => item.id === 'cds-encouragement-award')?.certHref).toBeNull();
    const en = awardItems(resume.awards, awards, 'en', {});
    expect(en.find((item) => item.id === 'multicampus-grand-award')).toMatchObject({
      title: 'Top Excellence Award',
      date: 'Mar 12, 2024',
      medal: { tier: 'gold', label: 'Top Excellence' },
      certHref: null,
      projectHref: '/en/projects/kickick-park/',
    });
    expect(() => awardItems([{ ref: 'busan-mayor-award' }], [], 'ko', {})).toThrow('records: unknown award ref "busan-mayor-award"');
  });

  it('skillGroups labels evidence with titles and localizes hrefs', () => {
    const titles = {
      projects: Object.fromEntries(PROJECT_SLUGS.map((slug) => [slug, `Project ${slug}`])),
      stories: { 'cog-2026-engagement': 'Predicting League of Legends engagement outcomes' },
      codes: { 'cog-2026-engagement': { href: 'https://example.com/code', label: 'IEEE CoG 2026 paper code' } },
    };
    const groups = skillGroups(resume.skills, 'en', titles);
    expect(groups.primary.map((skill) => skill.name)).toEqual(resume.skills.primary.map((skill) => skill.name));
    expect(groups.familiar.map((skill) => skill.name)).toEqual(resume.skills.familiar.map((skill) => skill.name));
    const lgbm = groups.primary.find((skill) => skill.name === 'LightGBM · XGBoost');
    expect(lgbm?.evidence[0]).toEqual({ label: 'Predicting League of Legends engagement outcomes', href: '/en/research/cog-2026-engagement/' });
    const python = groups.primary.find((skill) => skill.name === 'Python');
    expect(python?.evidence.slice(0, 2)).toEqual([
      { label: 'IEEE CoG 2026 paper code', href: 'https://example.com/code' }, // kind 'code': external, not localized
      { label: 'Project school-zone-blindspots', href: '/en/projects/school-zone-blindspots/' },
    ]);
    expect(() => skillGroups(resume.skills, 'en', { projects: {}, stories: {} })).toThrow(/no code link for "cog-2026-engagement"/);
    expect(() => skillGroups(resume.skills, 'en', { ...titles, projects: {} })).toThrow(/no title for/);
  });
});
