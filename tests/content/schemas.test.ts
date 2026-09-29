import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { load } from 'js-yaml';
import { z } from 'astro/zod';
import { describe, expect, it } from 'vitest';
import {
  awardSchema,
  favoriteGameSchema,
  jobfitSchema,
  newsSchema,
  projectSchema,
  publicationSchema,
  resumeSchema,
} from '../../src/content/schemas';
import { TAG_KEYS, TAGS_EN, TAGS_KO, tagKey, tagLabel } from '../../src/content/tags';
import { findDates, listMarkdown, readBody, readFrontmatter, resolveFromFile } from './helpers';

// In tests a plain string stands in for image().
const project = projectSchema(z.string());
const publication = publicationSchema(z.string());

const L = (ko: string, en: string) => ({ ko, en });
const flags = { ko: true, en: true, academic: true };
/** What js-yaml 4 (Astro's parser) returns for an unquoted date. */
const unquotedDate = (load('d: 2025-07-11') as { d: unknown }).d;

const validProject = {
  title: '사각지대를 예측하다',
  summary: '부산 도로망 전체에서 어린이 보행자 사고 위험을 예측했다.',
  period: { start: '2025-05', end: '2025-07' },
  org: '부산광역시',
  type: '경진대회',
  team: '4인 팀',
  role: '문제 정의와 분석 방향을 주도했다.',
  tools: ['Python', 'QGIS'],
  tags: ['공간 분석', '머신러닝'],
  featured: true,
  order: 1,
  status: 'published',
};

const validPublication = {
  title: 'A paper',
  authors: [{ name: 'Seongeun Baek', nameKo: '백성은', me: true }],
  venue: 'IEEE Conference on Games (CoG 2026)',
  venueShort: 'IEEE CoG 2026',
  year: 2026,
  format: 'Oral',
  status: 'presented',
  doi: null,
  pdf: null,
  code: 'https://github.com/Lunecid/LOL_teamfight_Lab/tree/v1.0-cog2026',
  tldr: L('요약', 'Summary'),
  bibtex: '@inproceedings{x, title = {A paper}}',
  abstract: 'Abstract.',
  abstractKo: '초록.',
  thumbnail: { src: '../../assets/research/cog-2026/label-horizon.webp', alt: 'Figure', altKo: '그림' },
};

const validResume = {
  id: 'resume',
  profile: {
    name: L('백성은', 'Seongeun Baek'), affiliation: L('소속', 'Affiliation'), advisor: L('권준호 교수', 'Prof. Joonho Kwon'),
    location: L('부산', 'Busan, South Korea'),
    email: 'todtjddms104204@pusan.ac.kr',
    github: 'Lunecid',
    site: 'https://lunecid.github.io',
    researchInterests: { pdf: flags, items: [L('게임 데이터 분석', 'Game analytics')] },
  },
  documents: [
    { id: 'resume-ko', label: L('국문 이력서', 'Korean résumé'), href: '/cv/seongeun-baek-resume-ko.pdf' },
    { id: 'resume-en', label: L('영문 Resume', 'Résumé'), href: '/cv/seongeun-baek-resume-en.pdf' },
    { id: 'cv-academic', label: L('Academic CV', 'Academic CV'), href: '/cv/seongeun-baek-cv-academic.pdf' },
  ],
  education: [{ id: 'ms-pnu', school: L('부산대학교', 'Pusan National University'), degree: L('석사', 'M.S.'), start: '2025-03', end: '2027-02', expected: true, gpa: { value: '4.0', scale: '4.5' }, pdf: flags }],
  publications: [{ ref: 'cog-2026-engagement', pdf: flags }],
  researchInProgress: [],
  projects: [{ ref: 'kickick-park', pdf: flags }],
  awards: [{ ref: 'busan-mayor-award', pdf: flags }],
  activities: [{ id: 'lg-aimers-7', text: L('LG Aimers 7기', 'LG Aimers 7th cohort'), date: '2025', pdf: flags }],
  certifications: [],
  languages: [],
  training: [],
  skills: { pdf: flags, primary: [{ name: 'Python', evidence: [{ kind: 'project', id: 'kickick-park' }] }], familiar: [] },
  researchIds: { scholar: null, orcid: null },
};

const jobfitRow = (i: number) => ({
  id: `row-${i}`,
  requirement: L('요건', 'Requirement'),
  frequency: '12/13',
  evidence: [{ label: L('근거', 'Evidence'), href: '/records/#job-fit' }],
  status: 'met',
  plan: L('계획', 'Plan'),
});
const validJobfit = {
  id: 'game',
  asOf: '2026-09-25',
  sample: { count: 13, years: '2024–2026' },
  intro: L('공고 {table.count}건', '{table.count} postings'),
  rows: Array.from({ length: 13 }, (_, i) => jobfitRow(i)),
  sources: { note: L('국내 게임사 데이터 분석가 공고 {table.count}건 ({table.years})', '{table.count} Korean game-company data-analyst postings ({table.years})') },
};

const validGame = {
  id: 'zzz',
  locked: false,
  title: L('젠레스 존 제로', 'Zenless Zone Zero'),
  studio: 'HoYoverse',
  characters: [{ id: 'remielle', name: L('레미엘', 'Remielle'), position: '58% 14%', tint: '#FF4F8B' }],
  why: L('이유', 'Why'),
  meta: [{ label: L('플레이', 'Playing since'), value: L('2024', '2024') }],
  notices: ['cognosphere', 'zzz-fan-guide', 'fan-content'],
  integration: { platform: 'enka-zzz', enabled: false },
  account: null,
};

describe('projectSchema', () => {
  it('projectSchema accepts a valid fixture and applies figures/links defaults', () => {
    const parsed = project.parse(validProject);
    expect(parsed.figures).toEqual([]);
    expect(parsed.links).toEqual({});
    expect(parsed.cover).toBeUndefined();
    expect(project.safeParse({ ...validProject, team: '4-person team', tags: ['Geospatial'] }).success).toBe(true);
  });

  it("projectSchema rejects a team with a person's name, 5 tags, an unknown tag, and an unquoted date", () => {
    expect(project.safeParse({ ...validProject, team: '백성은 외 3인' }).success).toBe(false);
    expect(project.safeParse({ ...validProject, team: '4인 팀(백성은, 홍길동)' }).success).toBe(false);
    expect(project.safeParse({ ...validProject, tags: ['공간 분석', '머신러닝', '공공데이터', '통계', '시각화'] }).success).toBe(false);
    expect(project.safeParse({ ...validProject, tags: ['AI'] }).success).toBe(false);
    const award = { name: '최우수상', org: '부산광역시', date: unquotedDate, certificate: 'busan-mayor-award' };
    expect(unquotedDate).toBeInstanceOf(Date);
    expect(project.safeParse({ ...validProject, award }).success).toBe(false);
    expect(project.safeParse({ ...validProject, award: { ...award, date: '2025-07-11' } }).success).toBe(true);
    expect(project.safeParse({ ...validProject, period: { start: '2025-5', end: '2025-07' } }).success).toBe(false);
  });
});

describe('publicationSchema', () => {
  it("projectSchema: audience parts are optional but at least one is required; status 'card' is allowed", () => {
    expect(project.safeParse({ ...validProject, audience: { research: '방법' } }).success).toBe(true);
    expect(project.safeParse({ ...validProject, audience: { game: '게임', research: '방법' } }).success).toBe(true);
    expect(project.safeParse({ ...validProject, audience: {} }).success).toBe(false);
    expect(project.safeParse({ ...validProject, audience: { game: '' } }).success).toBe(false);
    expect(project.safeParse({ ...validProject, status: 'card' }).success).toBe(true);
  });

  it('publicationSchema rejects a pdf without a doi', () => {
    expect(publication.safeParse(validPublication).success).toBe(true);
    const bad = publication.safeParse({ ...validPublication, pdf: '/papers/cog-2026.pdf' });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues.map((i) => i.message)).toContain('pdf requires doi (spec §8)');
    expect(publication.safeParse({ ...validPublication, pdf: '/papers/cog-2026.pdf', doi: '10.1109/CoG.2026.0001' }).success).toBe(true);
    expect(publication.parse(validPublication).highlight).toBe(false);
  });
});

describe('newsSchema', () => {
  it('newsSchema rejects Date objects and relative hrefs', () => {
    const note = { date: '2026-09-01', dateEnd: '2026-09-04', kind: 'research', title: L('발표', 'Talk'), href: '/research/cog-2026-engagement/' };
    expect(newsSchema.safeParse(note).success).toBe(true);
    expect(newsSchema.safeParse({ ...note, href: null }).success).toBe(true);
    expect(newsSchema.safeParse({ ...note, date: unquotedDate }).success).toBe(false);
    expect(newsSchema.safeParse({ ...note, href: 'research/' }).success).toBe(false);
    expect(newsSchema.safeParse({ ...note, kind: 'release' }).success).toBe(false);
  });
});

describe('awardSchema', () => {
  it('awardSchema requires a known level and rejects an unknown certificate id', () => {
    const award = {
      id: 'busan-mayor-award', level: 'top', name: L('최우수상', 'Top Excellence Award'), contest: L('대회', 'Contest'), org: L('부산광역시', 'Busan Metropolitan City'),
      date: '2025-07-11', project: 'school-zone-blindspots', certificate: { alt: L('상장', 'Certificate') }, redactionNote: L('없음', 'None'),
    };
    expect(awardSchema.safeParse(award).success).toBe(true);
    expect(awardSchema.safeParse({ ...award, project: null }).success).toBe(true);
    expect(awardSchema.safeParse({ ...award, id: 'busan-2025' }).success).toBe(false);
    expect(awardSchema.safeParse({ ...award, project: 'ko/school-zone-blindspots' }).success).toBe(false);
    const { level: _level, ...noLevel } = award;
    expect(awardSchema.safeParse(noLevel).success).toBe(false);
    expect(awardSchema.safeParse({ ...award, level: 'grand' }).success).toBe(false);
  });
});

describe('common-frame fields for fact tokens (P1-4)', () => {
  it('publication card is strict (tags ≤ 4 known keys, ≥ 1 tool) and facts are localized per key', () => {
    const card = { tags: ['ml', 'collection'], tools: ['Python'] };
    expect(publication.safeParse({ ...validPublication, card, facts: { window: L('30초', '30 seconds') } }).success).toBe(true);
    expect(publication.safeParse({ ...validPublication, card: { ...card, tools: [] } }).success).toBe(false);
    expect(publication.safeParse({ ...validPublication, card: { ...card, tags: ['ml', 'nope'] } }).success).toBe(false);
    expect(publication.safeParse({ ...validPublication, card: { ...card, extra: 1 } }).success).toBe(false);
    expect(publication.safeParse({ ...validPublication, facts: { 'bad key': L('a', 'b') } }).success).toBe(false);
    expect(publication.safeParse({ ...validPublication, facts: { window: '30초' } }).success).toBe(false);
    expect(project.safeParse({ ...validProject, facts: { tableauFigures: L('그림 1·2', 'Figures 1–2') } }).success).toBe(true);
  });

  it('certifications may carry a short localized name', () => {
    const cert = { id: 'adsp', name: L('데이터분석 준전문가(ADsP)', 'ADsP'), issuer: L('한국데이터산업진흥원', 'Korea Data Agency'), date: '2024-09-06', pdf: flags };
    expect(resumeSchema.safeParse({ ...validResume, certifications: [cert] }).success).toBe(true);
    expect(resumeSchema.safeParse({ ...validResume, certifications: [{ ...cert, short: L('ADsP', 'ADsP') }] }).success).toBe(true);
    expect(resumeSchema.safeParse({ ...validResume, certifications: [{ ...cert, short: 'ADsP' }] }).success).toBe(false);
  });
});

describe('favoriteGameSchema', () => {
  it("favoriteGameSchema rejects character id 'remiel' and a locked game without reason", () => {
    expect(favoriteGameSchema.safeParse(validGame).success).toBe(true);
    const remiel = { ...validGame, characters: [{ ...validGame.characters[0], id: 'remiel' }] };
    expect(favoriteGameSchema.safeParse(remiel).success).toBe(false);
    expect(favoriteGameSchema.safeParse({ ...validGame, locked: true }).success).toBe(false);
    expect(favoriteGameSchema.safeParse({ ...validGame, locked: true, reason: L('연동 전', 'Not linked') }).success).toBe(true);
    expect(favoriteGameSchema.safeParse({ ...validGame, account: { level: 60 } }).success).toBe(false);
  });
});

describe('resumeSchema', () => {
  it('resumeSchema requires school email and 3 documents with /cv/*.pdf hrefs', () => {
    expect(resumeSchema.safeParse(validResume).success).toBe(true);
    expect(resumeSchema.safeParse({ ...validResume, profile: { ...validResume.profile, email: 'someone@example.com' } }).success).toBe(false);
    expect(resumeSchema.safeParse({ ...validResume, documents: validResume.documents.slice(0, 2) }).success).toBe(false);
    const wrongHref = validResume.documents.map((d) => (d.id === 'resume-en' ? { ...d, href: '/files/resume.pdf' } : d));
    expect(resumeSchema.safeParse({ ...validResume, documents: wrongHref }).success).toBe(false);
    expect(resumeSchema.parse({ ...validResume, profile: { ...validResume.profile, tagline: L('x', 'y') } }).profile).not.toHaveProperty('tagline');
  });

  it('resumeSchema accepts an activity end month only with a YYYY-MM date', () => {
    const withActivity = (activity: Record<string, unknown>) => ({ ...validResume, activities: [{ id: 'lg-aimers-7', text: L('LG Aimers', 'LG Aimers'), pdf: flags, ...activity }] });
    expect(resumeSchema.safeParse(withActivity({ date: '2025-07', end: '2025-09' })).success).toBe(true);
    expect(resumeSchema.safeParse(withActivity({ date: '2025' })).success).toBe(true);
    expect(resumeSchema.safeParse(withActivity({ date: '2025-08', href: 'https://dacon.io/myprofile/530929/competition' })).success).toBe(true);
    expect(resumeSchema.safeParse(withActivity({ date: '2025-08', href: 'not-a-url' })).success).toBe(false);
    const bad = resumeSchema.safeParse(withActivity({ date: '2025', end: '2025-09' }));
    expect(bad.success).toBe(false);
    expect(bad.error?.issues.map((i) => i.message)).toContain('end requires date YYYY-MM');
    expect(resumeSchema.safeParse(withActivity({ date: '2025.07' })).success).toBe(false);
  });
});

describe('jobfitSchema', () => {
  it('jobfitSchema takes the ids game/data, a sample, at least one row and known statuses', () => {
    expect(jobfitSchema.safeParse(validJobfit).success).toBe(true);
    expect(jobfitSchema.safeParse({ ...validJobfit, id: 'data' }).success).toBe(true);
    expect(jobfitSchema.safeParse({ ...validJobfit, id: 'jobfit' }).success).toBe(false);
    // the 13-row pin moved to tests/content/records.test.ts (game table); the schema only needs one row now
    expect(jobfitSchema.safeParse({ ...validJobfit, rows: validJobfit.rows.slice(0, 12) }).success).toBe(true);
    expect(jobfitSchema.safeParse({ ...validJobfit, rows: [] }).success).toBe(false);
    const badStatus = validJobfit.rows.map((r, i) => (i === 0 ? { ...r, status: 'done' } : r));
    expect(jobfitSchema.safeParse({ ...validJobfit, rows: badStatus }).success).toBe(false);
    const twoPart = validJobfit.rows.map((r, i) => (i === 0 ? { ...r, frequency: '8/13 · 4/13' } : r));
    expect(jobfitSchema.safeParse({ ...validJobfit, rows: twoPart }).success).toBe(true);
    const badFrequency = validJobfit.rows.map((r, i) => (i === 0 ? { ...r, frequency: '8 of 13' } : r));
    expect(jobfitSchema.safeParse({ ...validJobfit, rows: badFrequency }).success).toBe(false);
  });

  it('every frequency denominator equals sample.count and no numerator exceeds it (A-13)', () => {
    const wrongDenominator = validJobfit.rows.map((r, i) => (i === 0 ? { ...r, frequency: '5/12' } : r));
    const result = jobfitSchema.safeParse({ ...validJobfit, rows: wrongDenominator });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message).join(' ')).toMatch(/denominator 12 is not sample\.count 13/);
    const tooMany = validJobfit.rows.map((r, i) => (i === 0 ? { ...r, frequency: '14/13' } : r));
    expect(jobfitSchema.safeParse({ ...validJobfit, rows: tooMany }).success).toBe(false);
    expect(jobfitSchema.safeParse({ ...validJobfit, sample: { count: 13, years: '2024-2026' } }).success).toBe(false); // en dash only
    expect(jobfitSchema.safeParse({ ...validJobfit, sample: { count: 13, years: '2024–2026', note: 'x' } }).success).toBe(false);
  });

  it('jobfitSchema: plan may be null (empty next step), sources is one note without posting links (D-6)', () => {
    const noPlan = validJobfit.rows.map((r, i) => (i === 0 ? { ...r, plan: null } : r));
    expect(jobfitSchema.safeParse({ ...validJobfit, rows: noPlan }).success).toBe(true);
    const postings = [{ label: L('공고', 'Posting'), href: 'https://example.com/job' }];
    expect(jobfitSchema.safeParse({ ...validJobfit, sources: { ...validJobfit.sources, postings } }).success).toBe(false);
  });
});

describe('content test helpers', () => {
  it('content test helpers parse frontmatter like Astro (CRLF, dates, relative paths)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'content-helpers-'));
    try {
      writeFileSync(join(dir, 'b.md'), "---\r\ntitle: 'B'\r\ndate: 2025-07-11\r\nperiod:\r\n  start: '2025-05'\r\n---\r\n\r\n## 질문\r\n\r\n본문\r\n");
      writeFileSync(join(dir, 'a.md'), "---\ntitle: 'A'\n---\n");
      writeFileSync(join(dir, 'notes.txt'), 'ignored');
      expect(listMarkdown(dir)).toEqual([join(dir, 'a.md'), join(dir, 'b.md')]);
      const fm = readFrontmatter(join(dir, 'b.md')) as { title: string; date: unknown; period: { start: string } };
      expect(fm.title).toBe('B');
      expect(fm.period.start).toBe('2025-05');
      expect(findDates(fm)).toEqual(['$.date']);
      expect(findDates({ list: [{ d: new Date(0) }], ok: '2025-07-11' })).toEqual(['$.list[0].d']);
      expect(readBody(join(dir, 'b.md'))).toBe('\n## 질문\n\n본문\n');
      expect(resolveFromFile(join(dir, 'b.md'), '../x/y.webp')).toBe(join(dir, '..', 'x', 'y.webp'));
      expect(() => readFrontmatter(join(dir, 'notes.txt'))).toThrow(/No frontmatter/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('tags', () => {
  it('tagKey/tagLabel are index-aligned in both languages', () => {
    expect(TAGS_KO).toHaveLength(TAG_KEYS.length);
    expect(TAGS_EN).toHaveLength(TAG_KEYS.length);
    TAG_KEYS.forEach((key, i) => {
      expect(tagKey(TAGS_KO[i] as (typeof TAGS_KO)[number])).toBe(key);
      expect(tagKey(TAGS_EN[i] as (typeof TAGS_EN)[number])).toBe(key);
      expect(tagLabel(key, 'ko')).toBe(TAGS_KO[i]);
      expect(tagLabel(key, 'en')).toBe(TAGS_EN[i]);
    });
    expect(tagKey('공간 분석')).toBe('geospatial');
    expect(tagLabel('nlp', 'en')).toBe('NLP');
    expect(() => tagKey('AI' as never)).toThrow(/Unknown tag/);
  });
});
