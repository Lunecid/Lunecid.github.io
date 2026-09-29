import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { DOCUMENTS, SITE } from '../../src/config';
import { ACHIEVEMENT_TRIGGERS, CERTIFICATE_IDS, CHARACTER_IDS } from '../../src/types';
import { PROJECT_PAGE_SLUGS, PROJECT_SLUGS, STORY_SLUGS, isKnownInternalHref } from '../../src/lib/routes';
import { achievementSchema, awardSchema, favoriteGameSchema, jobfitSchema, resumeSchema } from '../../src/content/schemas';
import { parseYamlDocument, parseYamlList } from '../../src/content/yaml-loader';
import { findDates, readFrontmatter } from './helpers';
import { researchPage } from '../../src/data/research-page';
import { resolveLocalizedDeep } from '../../src/lib/facts';
import { loadFactSource } from '../helpers/fact-source';
import { resolveIdentity } from '../../src/variants';
import { gameVariant } from '../../src/variants/game';

const ROOT = process.cwd();
const DATA = join(ROOT, 'src', 'data');
const FILES = {
  resume: 'resume.yaml',
  jobfit: 'jobfit.game.yaml',
  awards: 'awards.yaml',
  favorites: 'favorites.yaml',
  achievements: 'achievements.yaml',
} as const;

const text = (name: string): string => readFileSync(join(DATA, name), 'utf8').replace(/\r\n/g, '\n');
const rel = (path: string): string => relative(ROOT, path).split(sep).join('/');

const resume = () => resumeSchema.parse(parseYamlDocument(text(FILES.resume), 'resume'));
const rawJobfit = () => jobfitSchema.parse(parseYamlDocument(text(FILES.jobfit), 'game'));
/** The game table as the page shows it: tokens resolved per language ({table.*} from its own sample). */
const jobfit = () => {
  const data = rawJobfit();
  return resolveLocalizedDeep(data, loadFactSource(), { table: data.sample });
};
const awards = () => parseYamlList(text(FILES.awards)).map((item) => awardSchema.parse(item));
const favorites = () => parseYamlList(text(FILES.favorites), 'games').map((item) => favoriteGameSchema.parse(item));
const achievements = () => parseYamlList(text(FILES.achievements)).map((item) => achievementSchema.parse(item));

function listDataFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (full === join(DATA, 'generated')) continue; // fetched at build time, gitignored
      out.push(...listDataFiles(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

function globalGitEmail(): string {
  try {
    return execFileSync('git', ['config', '--global', 'user.email'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}
const GLOBAL_EMAIL = globalGitEmail();

const PHONE = [/\b01[016789][-. ]?\d{3,4}[-. ]?\d{4}\b/, /\b0[2-6]\d?[-. ]\d{3,4}[-. ]\d{4}\b/, /\+82[-. ]?\d/];
const BIRTHDATE = [
  /\b(?:19[4-9]\d|200\d)[-./](?:0[1-9]|1[0-2])[-./](?:0[1-9]|[12]\d|3[01])\b/,
  /(?:19[4-9]\d|200\d)년\s*\d{1,2}월\s*\d{1,2}일/,
  /\b\d{6}-[1-4]\d{6}\b/,
];
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;

describe('records data files', () => {
  it('all five YAML files exist and parse with js-yaml 4 without Date objects', () => {
    for (const name of Object.values(FILES)) {
      expect(existsSync(join(DATA, name)), name).toBe(true);
      expect(findDates(load(text(name))), name).toEqual([]);
    }
  });

  it('no YAML value was cut at an unquoted comma (every mapping key is a plain identifier)', () => {
    // In a flow mapping `{ ko: …, en: CoG 2026 paper (LightGBM, PyTorch) }` the comma ends the value: en becomes
    // "CoG 2026 paper (LightGBM" plus a stray key "PyTorch)". zod strips unknown keys, so only this check sees it.
    const strayKeys = (value: unknown, path: string): string[] => {
      if (Array.isArray(value)) return value.flatMap((item, i) => strayKeys(item, `${path}[${i}]`));
      if (value === null || typeof value !== 'object') return [];
      return Object.entries(value).flatMap(([key, item]) => [
        ...(/^[A-Za-z][A-Za-z0-9-]*$/.test(key) ? [] : [`${path}.${key}`]),
        ...strayKeys(item, `${path}.${key}`),
      ]);
    };
    for (const name of Object.values(FILES)) expect(strayKeys(load(text(name)), name), name).toEqual([]);
  });

  it('each file validates against its schema through the loader parsers', () => {
    const issues = (result: { error?: { issues: unknown[] } }) => result.error?.issues ?? [];
    expect(issues(resumeSchema.safeParse(parseYamlDocument(text(FILES.resume), 'resume')))).toEqual([]);
    expect(issues(jobfitSchema.safeParse(parseYamlDocument(text(FILES.jobfit), 'game')))).toEqual([]);
    for (const item of parseYamlList(text(FILES.awards))) expect(issues(awardSchema.safeParse(item)), item.id).toEqual([]);
    for (const item of parseYamlList(text(FILES.favorites), 'games')) expect(issues(favoriteGameSchema.safeParse(item)), item.id).toEqual([]);
    for (const item of parseYamlList(text(FILES.achievements))) expect(issues(achievementSchema.safeParse(item)), item.id).toEqual([]);
  });

  it('resume documents equal config DOCUMENTS', () => {
    const docs = Object.fromEntries(resume().documents.map((d) => [d.id, d.href]));
    expect(docs).toEqual(DOCUMENTS);
  });

  it("resume project refs are exactly PROJECT_SLUGS (order is the versions' business, A-17)", () => {
    expect(new Set(resume().projects.map((p) => p.ref))).toEqual(new Set(PROJECT_SLUGS));
    expect(resume().projects).toHaveLength(PROJECT_SLUGS.length);
  });

  it('resume award refs and skill evidence ids resolve', () => {
    const data = resume();
    expect([...data.awards.map((a) => a.ref)].sort()).toEqual([...CERTIFICATE_IDS].sort());
    for (const pub of data.publications) {
      expect(existsSync(join(ROOT, 'src/content/publications', `${pub.ref}.md`)), pub.ref).toBe(true);
    }
    const skills = [...data.skills.primary, ...data.skills.familiar];
    expect(skills.length).toBeGreaterThan(0);
    for (const skill of skills) {
      for (const ev of skill.evidence) {
        if (ev.kind === 'code') {
          // a publication with a public code link (the paper page shows the abstract only, D-15)
          const fm = readFrontmatter(join(ROOT, 'src/content/publications', `${ev.id}.md`)) as { code: string | null };
          expect(fm.code, `${skill.name} → code:${ev.id}`).toMatch(/^https:\/\/github\.com\/Lunecid\//);
          continue;
        }
        const known: readonly string[] = ev.kind === 'project' ? PROJECT_PAGE_SLUGS : STORY_SLUGS; // only projects with a page
        expect(known, `${skill.name} → ${ev.kind}:${ev.id}`).toContain(ev.id);
      }
    }
  });

  it('resume keeps the spec §9.1 facts', () => {
    const data = resume();
    expect(data.profile.name).toEqual({ ko: '백성은', en: 'Seongeun Baek' });
    expect(data.profile.email).toBe(SITE.email);
    expect(data.profile.github).toBe('Lunecid');
    expect(resolveIdentity(gameVariant, 'ko', loadFactSource()).tagline).toBe('플레이어를 예측하는 데서 멈추지 않고, 이해하는 데이터를 만듭니다.');
    expect(resolveIdentity(gameVariant, 'ko', loadFactSource()).status).toContain('2027년 2월 석사 졸업 예정');
    expect(data.profile.location).toEqual({ ko: '부산', en: 'Busan, South Korea' });
    const ms = data.education.find((e) => e.id === 'ms-pnu');
    const bs = data.education.find((e) => e.id === 'bs-pnu');
    expect(ms?.gpa).toEqual({ value: '4.0', scale: '4.5' });
    expect(ms?.expected).toBe(true);
    expect(ms?.end).toBe('2027-02');
    expect(bs?.gpa).toEqual({ value: '3.18', scale: '4.5' });
    expect(bs?.end).toBe('2025-02');
    for (const lang of data.languages) {
      if (lang.validUntil !== undefined) {
        expect(lang.onExpire, lang.id).toBe('mark');
        expect(lang.date, lang.id).toBeDefined();
      }
    }
    expect(data.languages.find((l) => l.id === 'korean')?.records).toBe(false);
  });

  it('LG Aimers activity cites the DACON team rank without claiming a final or award', () => {
    const aimers = resume().activities.find((a) => a.id === 'lg-aimers-7');
    expect(aimers).toMatchObject({
      date: '2025-08',
      href: 'https://dacon.io/myprofile/530929/competition',
      text: {
        ko: 'LG Aimers 7기 온라인 해커톤(리조트 식음업장 메뉴 수요 예측) 817팀 중 32위 · 상위 4%',
        en: 'LG Aimers (7th cohort) online hackathon, resort menu demand forecasting — 32nd of 817 teams (top 4%)',
      },
    });
    for (const lang of ['ko', 'en'] as const) {
      expect(aimers?.text[lang], lang).not.toMatch(/본선|수상|\bfinal\b|\baward\b/i);
    }
    expect(SITE.daconUrl).toBe('https://dacon.io/myprofile/530929/home');
  });

  it('awards.project is null or a project with a page', () => {
    for (const award of awards()) {
      if (award.project !== null) expect(PROJECT_PAGE_SLUGS as readonly string[], award.id).toContain(award.project);
    }
  });

  it('awards.yaml project ↔ project frontmatter award.certificate agree in both directions (ko and en)', () => {
    const list = awards();
    for (const lang of ['ko', 'en'] as const) {
      for (const slug of PROJECT_SLUGS) {
        const fm = readFrontmatter(join(ROOT, 'src/content/projects', lang, `${slug}.md`)) as {
          award?: { certificate: string; date: string };
        };
        const linked = list.filter((a) => a.project === slug);
        if (fm.award) {
          expect(linked.map((a) => a.id), `${lang}/${slug}`).toEqual([fm.award.certificate]);
          expect(linked[0]?.date, `${lang}/${slug} date`).toBe(fm.award.date);
        } else {
          expect(linked.map((a) => a.id), `${lang}/${slug}`).toEqual([]);
        }
      }
    }
  });

  it('awards keep only the certificate alt and use the D10e English names', () => {
    const raw = parseYamlList(text(FILES.awards));
    for (const item of raw) {
      expect(Object.keys(item.certificate as Record<string, unknown>), item.id).toEqual(['alt']);
    }
    const names = Object.fromEntries(awards().map((a) => [a.id, a.name.en]));
    expect(names).toEqual({
      'busan-mayor-award': 'Top Excellence Award (Mayor of Busan Award)',
      'cds-encouragement-award': 'Honorable Mention (Encouragement Award)', // P2-29
      'multicampus-grand-award': 'Top Excellence Award',
    });
    expect(text(FILES.awards)).not.toMatch(/Grand Prize/i); // D10e: 최우수상 is never "Grand Prize"
  });

  it('jobfit has 13 rows and requirement/frequency piece counts match', () => {
    const rows = jobfit().rows;
    expect(rows).toHaveLength(13);
    expect(new Set(rows.map((r) => r.id)).size).toBe(13);
    for (const row of rows) {
      const pieces = row.frequency.split(' · ').length;
      expect(row.requirement.ko.split(' · ').length, `${row.id} ko`).toBe(pieces);
      expect(row.requirement.en.split(' · ').length, `${row.id} en`).toBe(pieces);
    }
  });

  it('A-13: the game table declares its sample (13 postings, 2024–2026) and its intro/sources use {table.*}, not literals', () => {
    const data = rawJobfit();
    expect(data.id).toBe('game');
    expect(data.sample).toEqual({ count: 13, years: '2024–2026' });
    for (const lang of ['ko', 'en'] as const) {
      expect(data.intro[lang]).toContain('{table.count}');
      expect(data.sources.note[lang]).toContain('{table.count}');
      expect(data.sources.note[lang]).toContain('{table.years}');
      expect(data.intro[lang]).not.toMatch(/\d/);
      expect(data.sources.note[lang]).not.toMatch(/\d/);
    }
  });

  it('every jobfit evidence href is a known route or an https URL', () => {
    const data = jobfit();
    for (const row of data.rows) {
      for (const ev of row.evidence) {
        const ok = isKnownInternalHref(ev.href, 'game') || /^https:\/\//.test(ev.href);
        expect(ok, `${row.id}: ${ev.href}`).toBe(true);
      }
    }
  });

  it('game-metrics-logs evidence names only what the paper page shows, the plan is the spec §9.2 retention/cohort step, no leakage claim', () => {
    const row = jobfit().rows.find((r) => r.id === 'game-metrics-logs');
    // Final review fix 1 item 12: the paper page is abstract-only (D-15) and never says "Match-V5"; the label uses the
    // abstract's own terms (public Riot API, event logs, chronological patch holdout).
    expect(row?.evidence).toMatchObject([
      {
        label: { ko: 'Riot API 사건 기록 · 패치 단위 시간순 홀드아웃', en: 'Riot API event logs · chronological patch holdout' },
        short: { ko: 'Riot API 사건 기록', en: 'Riot API event logs' },
        href: '/research/cog-2026-engagement/', // D-15: the paper page itself (the story anchor is gone)
      },
    ]);
    const paper = readFrontmatter(join(ROOT, 'src/content/publications/cog-2026-engagement.md')) as { abstract: string; abstractKo: string };
    const flat = (s: string) => s.replace(/\s+/g, ' ');
    expect(text(FILES.jobfit)).not.toContain('Match-V5');
    for (const term of ['Riot API', 'event logs', 'chronological patch-holdout']) expect(flat(paper.abstract), term).toContain(term);
    for (const term of ['Riot API', '사건 기록', '패치 단위 시간순 홀드아웃']) expect(flat(paper.abstractKo), term).toContain(term);
    // D-6: the old plan ("frame the CoG case study as …") was a site to-do; the genuine step is the mini analysis.
    expect(row?.plan).toEqual({ ko: '리텐션·코호트 미니 분석', en: 'A small retention/cohort analysis' });
    expect(text(FILES.jobfit)).not.toMatch(/누수|leakage|정합성 검증/i);
  });

  it('jobfit statuses follow spec §9.2', () => {
    const statuses = Object.fromEntries(jobfit().rows.map((r) => [r.id, r.status]));
    expect(statuses).toEqual({
      'python-ml': 'met',
      'game-literacy': 'met',
      degree: 'met',
      statistics: 'partial',
      communication: 'partial',
      'scale-cloud': 'partial',
      'game-metrics-logs': 'partial',
      'bi-tableau': 'partial',
      sql: 'in-progress',
      'take-home': 'in-progress',
      'ai-llm': 'in-progress', // D-9: no evidence yet
      'bm-anomaly': 'later',
      'certs-languages': 'n-a',
    });
  });

  it('jobfit next steps are genuine skill steps only: empty for met rows, no dates, no site to-dos (D-6)', () => {
    const rows = jobfit().rows;
    const plans = Object.fromEntries(rows.map((r) => [r.id, r.plan]));
    for (const row of rows.filter((r) => r.status === 'met')) expect(row.plan, row.id).toBeNull();
    expect(plans).toEqual({
      'python-ml': null,
      'game-literacy': null,
      degree: null,
      statistics: { ko: '패치 전후 영향 비교 리포트 샘플', en: 'A before/after patch-impact report sample' },
      communication: null,
      'scale-cloud': { ko: '장기 과제(Airflow·Spark·BigQuery)', en: 'Long-term: Airflow, Spark, BigQuery' },
      'game-metrics-logs': { ko: '리텐션·코호트 미니 분석', en: 'A small retention/cohort analysis' },
      'bi-tableau': { ko: 'Tableau Public 게임 KPI 대시보드', en: 'A game KPI dashboard on Tableau Public' },
      sql: { ko: 'SQL 자격증 취득 예정', en: 'Planning to earn an SQL certification' },
      'take-home': {
        ko: '패치 전후 영향 비교 리포트 샘플(문제 → 분석 → 해석 → 1쪽 리포트)',
        en: 'A before/after patch-impact report sample (problem → analysis → interpretation → one-page report)',
      },
      'ai-llm': { ko: 'LLM으로 검증·리포트를 자동화한 사례', en: 'An example of automating validation and reporting with an LLM' },
      'bm-anomaly': null,
      'certs-languages': null,
    });
    const planText = rows.flatMap((r) => (r.plan ? [r.plan.ko, r.plan.en] : [])).join(' | ');
    // No dates, no "(later)" markers and no site-building to-dos (README, "on the Records page", "update this row" …).
    expect(planText).not.toMatch(/\d{4}\.\d{2}|20\d\d|나중에|\(planned\)|README|페이지|사이트|this site|Records page|명시|이 행|this row/i);
  });

  it('jobfit sources are one anonymized line with no company names or URLs (D-6)', () => {
    expect(jobfit().sources).toEqual({
      note: { ko: '국내 게임사 데이터 분석가 공고 13건 (2024–2026)', en: '13 Korean game-company data-analyst postings (2024–2026)' },
    });
    // Every value (comments aside: the header cites the NEXON Open API terms, a rule, not a source).
    const values = JSON.stringify(load(text(FILES.jobfit)));
    // The only external link is the owner's own CoG code (evidence), never a job posting.
    expect(values.match(/https?:\/\/[^"\s]+/g) ?? []).toEqual(['https://github.com/Lunecid/LOL_teamfight_Lab/tree/v1.0-cog2026']);
    expect(values).not.toMatch(/넥슨|NEXON|크래프톤|KRAFTON|컴투스|Com2uS|엔씨|NCSOFT|넷마블|Netmarble/i);
  });

  it("jobfit and skill evidence cite only the owner's own, page-supported work (D-9)", () => {
    const rows = Object.fromEntries(jobfit().rows.map((r) => [r.id, r]));
    const hrefs = (id: string) => rows[id].evidence.map((e) => e.href);
    expect(hrefs('statistics')).toEqual(['/projects/school-zone-blindspots/']);
    expect(hrefs('python-ml')).not.toContain('/projects/kickick-park/');
    // Owner, 2026-09-28: my part of the youth start-up case was data exploration and data engineering, so its models,
    // K-Means and Streamlit dashboard are the team's and back no row.
    expect(jobfit().rows.flatMap((r) => r.evidence).map((e) => e.href)).not.toContain('/projects/youth-startup-location/');
    // fix round 1: PyTorch is shown where it is visible, the tagged code; the paper page (abstract) shows LightGBM.
    expect(rows['python-ml'].evidence.slice(0, 2)).toMatchObject([
      { label: { ko: 'CoG 2026 논문(LightGBM)', en: 'CoG 2026 paper (LightGBM)' }, href: '/research/cog-2026-engagement/' },
      { label: { ko: 'CoG 2026 코드(PyTorch)', en: 'CoG 2026 code (PyTorch)' }, href: 'https://github.com/Lunecid/LOL_teamfight_Lab/tree/v1.0-cog2026' },
    ]);
    expect(hrefs('game-literacy')).not.toContain('/player-log/'); // D-13: no play-log pipeline yet
    expect(hrefs('bi-tableau')).toEqual(['/projects/kickick-park/']);
    expect(rows['bi-tableau'].evidence[0].label.ko).toContain('Tableau');
    expect(rows['ai-llm'].evidence).toEqual([]);
    expect(rows['communication'].evidence.map((e) => e.label.ko).join(' ')).not.toContain('수상 발표');
    // fix round 1: a page that shows a PM paragraph, not the /projects/ index
    expect(rows['communication'].evidence[1]).toMatchObject({
      label: { ko: '사각지대 사례 연구의 기획자·PM 관점', en: 'Planner/PM perspective in the school-zone case study' },
      href: '/projects/school-zone-blindspots/',
    });
    const all = jobfit().rows.flatMap((r) => r.evidence);
    expect(all.map((e) => e.href).filter((h) => /kbo-attendance|seoul-apartment-automl/.test(h))).toEqual([]);
    expect(all.map((e) => `${e.label.ko} ${e.label.en}`).join(' ')).not.toMatch(/YOLO|KBO/);

    const skills = [...resume().skills.primary, ...resume().skills.familiar];
    const evidence = Object.fromEntries(skills.map((s) => [s.name, s.evidence.map((e) => `${e.kind}:${e.id}`)]));
    expect(Object.keys(evidence)).not.toContain('YOLOv8'); // team tool on KickKick Park, not the owner's skill
    expect(Object.keys(evidence)).not.toContain('Streamlit'); // team tool on the youth start-up case
    expect(evidence['QGIS']).toEqual(['project:school-zone-blindspots']);
    expect(evidence['LightGBM · XGBoost']).not.toContain('project:youth-startup-location');
    // fix round 1: evidence must be visible at the link target. The v1.0-cog2026 code imports torch (requirements.txt)
    // and pandas; the paper page shows neither, and the youth start-up page never names pandas.
    expect(evidence['PyTorch']).toEqual(['code:cog-2026-engagement']);
    expect(evidence['pandas']).toEqual(['code:cog-2026-engagement']);
    expect(evidence['Python']?.[0]).toBe('code:cog-2026-engagement');
    expect(evidence['Tableau']).toEqual(['project:kickick-park']);
    expect(Object.values(evidence).flat().filter((e) => /kbo-attendance|seoul-apartment-automl/.test(e))).toEqual([]);
  });

  it('P1-16/P2-29: one form for the paper topic, the award names and the Korean contest name in all site data', () => {
    const files = [
      ...listDataFiles(DATA).filter((f) => /\.(ya?ml|ts)$/.test(f)),
      ...['news', 'projects/ko', 'projects/en', 'publications'].flatMap((dir) =>
        readdirSync(join(ROOT, 'src/content', dir)).map((name) => join(ROOT, 'src/content', dir, name)),
      ),
      join(ROOT, 'src/i18n/ui.ts'),
    ];
    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      expect(content, `${rel(file)}: the paper is about engagement outcomes`).not.toMatch(/team-fight/i);
      expect(content, `${rel(file)}: Busan award English name`).not.toMatch(/Busan Mayor/);
      expect(content, `${rel(file)}: Korean contest name`).not.toMatch(/2025년 Big Data|부산 Big Data|Big Data 활용대회/);
      expect(content, `${rel(file)}: CDS award English name`).not.toMatch(/(?<!\()Encouragement Award(?!\))/);
    }
    const busan = awards().find((a) => a.id === 'busan-mayor-award');
    expect(busan?.name.en).toBe('Top Excellence Award (Mayor of Busan Award)');
    expect(busan?.contest.ko).toContain('2025 Big Data 활용 대회');
    expect(resolveIdentity(gameVariant, 'en', loadFactSource()).about).toContain('kill-conditioned engagements');
  });

  it('P2-28: one form per term in the site copy (석사 학위논문, Ph.D., public match records (Riot API), lab full name first)', () => {
    const copyFiles = ['src/data/resume.yaml', 'src/data/jobfit.game.yaml', 'src/data/research-page.ts', 'src/data/copy/pages.ts', 'src/data/copy/home.ts', 'src/data/copy/hero.ts'];
    for (const file of copyFiles) {
      const content = readFileSync(join(ROOT, file), 'utf8');
      expect(content, file).not.toMatch(/석사학위|석사 학위 논문/);
      expect(content, file).not.toMatch(/\bPhD\b/);
      expect(content, file).not.toMatch(/공개 텔레메트리|공개 Riot 기록|public (League of Legends |Riot )?telemetry/i);
      expect(content, file).not.toMatch(/Master’s thesis|Master's thesis/);
    }
    const pub = readFileSync(join(ROOT, 'src/content/publications/cog-2026-engagement.md'), 'utf8');
    expect(pub).toContain('ko: "교전 직전 30초의 공개 경기 기록(Riot API)만으로');
    expect(pub).toContain('public match records (Riot API)');
    const data = resume();
    expect(resolveIdentity(gameVariant, 'ko', loadFactSource()).about).toContain('공개 경기 기록(Riot API)');
    expect(resolveIdentity(gameVariant, 'en', loadFactSource()).about).toContain('public match records (Riot API)');
    // /records/ names the lab first in the education timeline: full name, then the short "DataLab".
    const ms = data.education.find((e) => e.id === 'ms-pnu');
    expect(ms?.lab?.ko.startsWith('데이터사이언스연구실(DataLab)')).toBe(true);
    expect(ms?.lab?.en.startsWith('Data Science Lab (DataLab)')).toBe(true);
    expect(ms?.thesis?.ko.startsWith('석사 학위논문')).toBe(true);
  });

  it('achievements: 8 unique ids and triggers, all in ACHIEVEMENT_TRIGGERS', () => {
    const list = achievements();
    expect(list).toHaveLength(8);
    expect(new Set(list.map((a) => a.id)).size).toBe(8);
    expect(list.map((a) => a.trigger).sort()).toEqual([...ACHIEVEMENT_TRIGGERS].sort());
    expect(list.filter((a) => a.hidden).map((a) => a.id).sort()).toEqual(['game-over', 'konami']);
  });

  it('P1-19: the Academic CV research interests are the three research-page interest titles (interests, not skills)', () => {
    const items = resume().profile.researchInterests.items;
    expect(items).toEqual(researchPage.interests.map((i) => ({ ko: i.title.ko, en: i.title.en })));
    expect(items.map((i) => i.en).join(' ')).not.toMatch(/Graph neural networks|Big data analysis|Data visualization/);
  });

  it('P1-18/P2-34: achievement hints point where the controls really are', () => {
    const byId = Object.fromEntries(achievements().map((a) => [a.id, a]));
    // Language switch: the top bar from 734px, the menu panel on phones (HudNav).
    expect(byId['bilingual']?.hint.ko).toContain('메뉴 → English');
    expect(byId['bilingual']?.hint.en).toContain('Menu → 한국어');
    // the bar shows the current language first: 'KO / EN' on Korean pages, 'EN / KO' on English pages
    expect(byId['bilingual']?.hint.ko).toContain('KO / EN');
    expect(byId['bilingual']?.hint.en).toContain('EN / KO');
    expect(byId['konami']?.hint.ko).toBe('고전 게임의 비밀 커맨드가 여기서도 통합니다.');
  });

  it('favorites order is zzz, genshin, lol, dnf, steam, locked games have reasons, accounts are null', () => {
    const games = favorites();
    expect(games.map((g) => g.id)).toEqual(['zzz', 'genshin', 'lol', 'dnf', 'steam']);
    for (const game of games) {
      if (game.locked) expect(game.reason, game.id).toBeDefined();
      expect(game.account, game.id).toBeNull();
    }
    expect(games.filter((g) => !g.locked).map((g) => g.id)).toEqual(['zzz', 'genshin']);
  });

  it('favorite characters carry no image paths and use CHARACTER_IDS', () => {
    const raw = parseYamlList(text(FILES.favorites), 'games');
    const ids: string[] = [];
    for (const game of raw) {
      for (const character of game.characters as Array<Record<string, unknown>>) {
        expect(character.image, `${game.id}`).toBeUndefined();
        expect(character.width, `${game.id}`).toBeUndefined();
        expect(character.height, `${game.id}`).toBeUndefined();
        ids.push(String(character.id));
      }
    }
    expect(ids).toEqual([...CHARACTER_IDS]);
    expect(text(FILES.favorites)).not.toContain('/images/characters/');
    expect(text(FILES.favorites)).not.toContain('src/data/accounts/');
  });

  it('favorite character tints equal the tokens.css tint RGB', () => {
    const tokens = readFileSync(join(ROOT, 'src/styles/tokens.css'), 'utf8');
    let checked = 0;
    for (const game of favorites()) {
      for (const character of game.characters) {
        const match = new RegExp(`--tint-${character.id}:\\s*rgba\\(\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)`).exec(tokens);
        expect(match, character.id).not.toBeNull();
        const fromHex = [1, 3, 5].map((i) => parseInt(character.tint.slice(i, i + 2), 16));
        expect(fromHex, character.id).toEqual([Number(match?.[1]), Number(match?.[2]), Number(match?.[3])]);
        checked += 1;
      }
    }
    expect(checked).toBe(3);
  });

  it('no phone, birthdate-like date or e-mail other than the school address anywhere in src/data (src/data/generated/** excluded)', () => {
    const files = listDataFiles(DATA);
    expect(files.map(rel)).toEqual(expect.arrayContaining(Object.values(FILES).map((f) => `src/data/${f}`)));
    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      for (const re of PHONE) expect(content, `${rel(file)} phone`).not.toMatch(re);
      for (const re of BIRTHDATE) expect(content, `${rel(file)} birthdate`).not.toMatch(re);
      const emails = content.match(EMAIL) ?? [];
      expect(emails.filter((e) => e !== SITE.email), rel(file)).toEqual([]);
    }
  });

  it.skipIf(GLOBAL_EMAIL === '')("the machine's global git e-mail appears nowhere in src/data", () => {
    const files = listDataFiles(DATA);
    expect(files.map(rel)).toEqual(expect.arrayContaining(Object.values(FILES).map((f) => `src/data/${f}`)));
    for (const file of files) {
      const found = readFileSync(file, 'utf8').toLowerCase().includes(GLOBAL_EMAIL.toLowerCase());
      expect(found, rel(file)).toBe(false);
    }
  });
});
