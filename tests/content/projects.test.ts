import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { z } from 'astro/zod';
import { describe, expect, it } from 'vitest';
import { projectSchema, type ProjectFrontmatter } from '../../src/content/schemas';
import { tagKey } from '../../src/content/tags';
import { PROJECT_PAGE_SLUGS, PROJECT_SLUGS } from '../../src/lib/routes';
import { VARIANT_IDS, getVariant } from '../../src/variants';
import { listMarkdown, readBody, readFrontmatter, resolveFromFile } from './helpers';

const schema = projectSchema(z.string());
const DIR = 'src/content/projects';
const LANGS = ['ko', 'en'] as const;
const NUMBER_WORDS: Record<number, string> = { 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six' };

function fileOf(lang: 'ko' | 'en', slug: string): string {
  return `${DIR}/${lang}/${slug}.md`;
}

function data(lang: 'ko' | 'en', slug: string): ProjectFrontmatter {
  return schema.parse(readFrontmatter(fileOf(lang, slug)));
}

function teamSize(team: string): number {
  const match = /^(\d+)(인 팀|-person team)$/.exec(team);
  if (!match) throw new Error(`bad team value: ${team}`);
  return Number(match[1]);
}

describe('project case-study files', () => {
  it('every project file validates against projectSchema(z.string())', () => {
    for (const lang of LANGS) {
      for (const path of listMarkdown(`${DIR}/${lang}`)) {
        const result = schema.safeParse(readFrontmatter(path));
        expect(result.error?.issues ?? [], path).toEqual([]);
        expect(Object.keys(readFrontmatter(path) as object), `${path} must not declare slug`).not.toContain('slug');
      }
    }
  });

  it('ko and en folders hold exactly PROJECT_SLUGS', () => {
    for (const lang of LANGS) {
      const slugs = listMarkdown(`${DIR}/${lang}`).map((p) => basename(p, '.md')).sort();
      expect(slugs, lang).toEqual([...PROJECT_SLUGS].sort());
    }
  });

  it('paired files share period, facts, status, links, tools, award date/certificate and cover/figure paths', () => {
    for (const slug of PROJECT_SLUGS) {
      const ko = data('ko', slug);
      const en = data('en', slug);
      expect(en.period, slug).toEqual(ko.period);
      expect(en.facts, slug).toEqual(ko.facts);
      expect(en.status, slug).toBe(ko.status);
      expect(en.links, slug).toEqual(ko.links);
      expect(en.tools, slug).toEqual(ko.tools);
      expect(en.teamTools, slug).toEqual(ko.teamTools);
      expect(en.award?.date, slug).toBe(ko.award?.date);
      expect(en.award?.certificate, slug).toBe(ko.award?.certificate);
      expect(en.cover?.src, slug).toBe(ko.cover?.src);
      expect(en.cover?.label, slug).toBe(ko.cover?.label); // P2-21 HUD caption: English in both languages
      expect(en.figures.map((f) => f.src), slug).toEqual(ko.figures.map((f) => f.src));
    }
  });

  it('P-06 F-007 step 2: the ranking and heatmap tables transcribe their figures, the same rows in both languages', () => {
    const table = (lang: 'ko' | 'en', slug: string, src: RegExp) => data(lang, slug).figures?.find((f) => src.test(String(f.src)))?.table;
    const ranking = { ko: table('ko', 'kickick-park', /dong-ranking/), en: table('en', 'kickick-park', /dong-ranking/) };
    for (const lang of ['ko', 'en'] as const) {
      expect(ranking[lang]?.rows.map((r) => r[0]), lang).toEqual(Array.from({ length: 22 }, (_, i) => String(i + 1)));
      expect(ranking[lang]?.rows.every((r) => r.length === 2), lang).toBe(true); // rank and dong only: the figure prints no values
    }
    expect(ranking.ko?.rows[8]?.[1]).toBe('역삼2동'); // the 9th, highlighted in the figure and named in its caption
    expect(ranking.en?.rows[8]?.[1]).toBe('Yeoksam 2-dong');
    const heat = { ko: table('ko', 'youth-startup-location', /cluster-zscore-heatmap/), en: table('en', 'youth-startup-location', /cluster-zscore-heatmap/) };
    expect(heat.ko?.columns).toHaveLength(5);
    expect(heat.ko?.rows).toHaveLength(7);
    expect(heat.en?.rows).toEqual(heat.ko?.rows);
    expect(heat.ko?.rows.find((r) => r[0] === 'floating_pop_22_01')?.slice(1)).toEqual(['-0.08', '2.39', '-0.09', '-0.62']);
  });

  it('P2-21: every cover names its figure for the "FIG · <label>" strip, with no digits (no number headline)', () => {
    const labels = PROJECT_SLUGS.map((slug) => data('ko', slug).cover?.label).filter((l): l is string => l !== undefined);
    expect(labels.sort()).toEqual(['CLUSTER PROFILES', 'PARKING DETECTION', 'RISK HEATMAP']);
    for (const label of labels) expect(label).not.toMatch(/\d/);
  });

  it('paired tags map to the same tag keys', () => {
    for (const slug of PROJECT_SLUGS) {
      expect(data('en', slug).tags.map(tagKey), slug).toEqual(data('ko', slug).tags.map(tagKey));
    }
  });

  it('paired bodies have the same number of H2 sections', () => {
    for (const slug of PROJECT_PAGE_SLUGS) {
      const count = (lang: 'ko' | 'en') => (readBody(fileOf(lang, slug)).match(/^## /gm) ?? []).length;
      expect(count('ko'), slug).toBeGreaterThanOrEqual(3);
      expect(count('en'), slug).toBe(count('ko'));
    }
  });

  it("status 'card' ⇔ no page (D-4): card files are exactly the slugs outside PROJECT_PAGE_SLUGS and have no body", () => {
    const cards = PROJECT_SLUGS.filter((slug) => data('ko', slug).status === 'card');
    expect(cards).toEqual(['kbo-attendance', 'seoul-apartment-automl']);
    expect(PROJECT_SLUGS.filter((slug) => !(PROJECT_PAGE_SLUGS as readonly string[]).includes(slug))).toEqual(cards);
    for (const slug of cards) {
      for (const lang of LANGS) {
        const d = data(lang, slug);
        expect(readBody(fileOf(lang, slug)).trim(), `${lang}/${slug} body`).toBe('');
        for (const v of VARIANT_IDS) expect(getVariant(v).orders.homeFeatured, `${v} ${slug}`).not.toContain(`project:${slug}`);
        expect(d.award, `${lang}/${slug}`).toBeUndefined();
        expect(d.figures, `${lang}/${slug}`).toEqual([]);
        expect(d.links, `${lang}/${slug}`).toEqual({});
      }
    }
  });

  it("team values are 'N인 팀'/'N-person team' with the same N", () => {
    for (const slug of PROJECT_SLUGS) {
      const ko = data('ko', slug);
      const en = data('en', slug);
      expect(ko.team, slug).toMatch(/^\d+인 팀$/);
      expect(en.team, slug).toMatch(/^\d+-person team$/);
      const n = teamSize(ko.team);
      expect(teamSize(en.team), slug).toBe(n);
      // The "내 역할" / "My role" sentence repeats the team size (Task 0 Q4 changes both places).
      const koLine = /(\d+)인 팀에서/.exec(readBody(fileOf('ko', slug)));
      if (koLine) expect(Number(koLine[1]), `${slug} ko role line`).toBe(n);
      const enLine = /In a team of (\w+)/.exec(readBody(fileOf('en', slug)));
      if (enLine) expect(enLine[1], `${slug} en role line`).toBe(NUMBER_WORDS[n]);
    }
  });

  it('every cover/figure path resolves to an existing file', () => {
    for (const lang of LANGS) {
      for (const slug of PROJECT_SLUGS) {
        const path = fileOf(lang, slug);
        const d = data(lang, slug);
        const images = [d.cover?.src, ...d.figures.map((f) => f.src)].filter((s): s is string => s !== undefined);
        for (const src of images) {
          expect(src, path).toMatch(/^\.\.\/\.\.\/\.\.\/assets\/projects\/[a-z0-9-]+\/[a-z0-9-]+\.webp$/);
          expect(existsSync(resolveFromFile(path, src)), `${path} -> ${src}`).toBe(true);
        }
      }
    }
  });

  it('D-3: the game home row is CoG + school-zone-blindspots + kickick-park, both projects published', () => {
    expect(getVariant('game').orders.homeFeatured).toEqual(['pub:cog-2026-engagement', 'project:school-zone-blindspots', 'project:kickick-park']);
    for (const slug of ['school-zone-blindspots', 'kickick-park'] as const) expect(data('ko', slug).status, slug).toBe('published');
  });

  it('no body contains a phone number or e-mail address', () => {
    const phone = /(?:\+82[-\s]?|\b0)(?:1[016789]|2|[3-6][1-5])[-.\s)]?\d{3,4}[-.\s]?\d{4}\b/;
    const email = /[\w.+-]+@[\w-]+\.[\w.-]+/;
    for (const lang of LANGS) {
      for (const path of listMarkdown(`${DIR}/${lang}`)) {
        const text = readFileSync(path, 'utf8');
        expect(phone.exec(text)?.[0], path).toBeUndefined();
        expect(email.exec(text)?.[0], path).toBeUndefined();
      }
    }
  });

  it('P1-8: every project with a page has audience {game?, research}; the game translation left the PM paragraph', () => {
    for (const slug of PROJECT_SLUGS) {
      for (const lang of LANGS) {
        const d = data(lang, slug);
        if ((PROJECT_PAGE_SLUGS as readonly string[]).includes(slug)) {
          expect(d.audience?.research?.trim(), `${lang}/${slug} research`).toBeTruthy();
          expect(d.audience?.game?.trim(), `${lang}/${slug} game`).toBeTruthy();
        } else {
          expect(d.audience, `${lang}/${slug}`).toBeUndefined();
        }
      }
    }
    // The three main cases moved their "in a game …" sentence out of the PM paragraph into audience.game.
    const moved: Record<string, { ko: string; en: string }> = {
      'school-zone-blindspots': { ko: '게임으로 옮기면', en: 'In a game' },
      'youth-startup-location': { ko: '게임으로 옮기면', en: 'In a game' },
      'kickick-park': { ko: '게임의 보상 설계', en: "a game's reward design" },
    };
    for (const [slug, marker] of Object.entries(moved)) {
      for (const lang of LANGS) {
        expect(data(lang, slug).audience?.game, `${lang}/${slug}`).toContain(marker[lang]);
        expect(readBody(fileOf(lang, slug)), `${lang}/${slug} body`).not.toContain(marker[lang]);
      }
    }
  });

  it('P2-27/D-5: Korean project copy is 합니다체 (no 해라체 sentence endings in body, summary, role, audience, captions, alt)', () => {
    // "…했다." / "…이다)" / "…한다(그림 1)" at a sentence end; "…습니다." / "…니다" never match. Titles are exempt.
    const haera = /[가-힣](?<!니)다(?=[.)(]|$)/;
    const offenders: string[] = [];
    for (const slug of PROJECT_SLUGS) {
      const d = data('ko', slug);
      const texts = [
        d.summary,
        d.role,
        d.audience?.game,
        d.audience?.research,
        d.cover?.alt,
        ...d.figures.flatMap((f) => [f.alt, f.caption]),
        ...readBody(fileOf('ko', slug)).split('\n'),
      ].filter((text): text is string => typeof text === 'string');
      for (const text of texts) if (haera.test(text)) offenders.push(`${slug}: ${text.slice(0, 60)}`);
    }
    expect(offenders).toEqual([]);
  });

  it('fix round 1: wording matches the pages (blind-spot candidates, suggested businesses, division name, KBO role)', () => {
    // Only the high-risk points outside a school zone are policy blind-spot candidates.
    expect(data('ko', 'school-zone-blindspots').audience?.research).toContain('보호구역이 아닌 곳을 정책 사각지대 후보로');
    expect(data('en', 'school-zone-blindspots').audience?.research).toContain('those outside a school zone became policy blind-spot candidates');
    // The youth start-up table suggests businesses, not support policies.
    const pmKo = /## 기획자·PM 관점\n\n([^\n]+)/.exec(readBody(fileOf('ko', 'youth-startup-location')))?.[1] ?? '';
    const pmEn = /## For product & planning teams\n\n([^\n]+)/.exec(readBody(fileOf('en', 'youth-startup-location')))?.[1] ?? '';
    expect(pmKo).not.toContain('지원 정책');
    expect(pmKo).toContain('결과 표의 네 유형마다 맞는 업종도 제안했습니다');
    expect(pmEn).not.toMatch(/support polic/i);
    // One name for the award division (awards.yaml, news).
    expect(readBody(fileOf('en', 'school-zone-blindspots'))).toContain('Big Data Analysis Division of the 2025 Big Data Utilization Contest');
    expect(readBody(fileOf('en', 'school-zone-blindspots'))).not.toMatch(/analysis track/i);
    // The KBO card reads as a team analysis with the owner's part (D-9), not as the owner's statistics.
    expect(data('ko', 'kbo-attendance').summary).toMatch(/4인 팀.*저는 KBO 정규 시즌 데이터를 웹 크롤링으로 수집하고 전처리했습니다/);
    expect(data('en', 'kbo-attendance').summary).toMatch(/four-person course project.*I crawled and cleaned the KBO regular-season data/);
  });

  it('final review fix 1 item 1: the KickKick summary credits the team with the photo-judgment model and me only with my role parts', () => {
    // The page body: the public repo's web service adds fixed points per upload, the judgment model was trained
    // separately by the team (teamTools, D-9); my role is the district (gu) Tableau visualisation and building the
    // website (owner, 2026-09-28: no data cleaning).
    // The summary feeds the page lede, meta/OG descriptions, the OG image and /records/.
    const ko = data('ko', 'kickick-park');
    const en = data('en', 'kickick-park');
    const [koTeam, koMine] = ko.summary.split('저는');
    const [enTeam, enMine] = en.summary.split(/\bI\b/);
    expect(koMine, 'ko summary has an "저는 …" clause for my part').toBeDefined();
    expect(enMine, 'en summary has an "I …" clause for my part').toBeDefined();
    expect(koTeam).toMatch(/5인 팀이[^,]*판정 모델을 학습/);
    expect(enTeam).toMatch(/five-person/i);
    expect(enTeam).toMatch(/the team trained a parking-judgment model/);
    expect(koMine).not.toMatch(/판정|판단/);
    expect(enMine).not.toMatch(/judg/i);
    for (const part of ['Tableau', '자치구별', '웹사이트 구축']) expect(koMine, `ko: ${part}`).toContain(part);
    for (const part of ['Tableau', '(gu)', 'website']) expect(enMine, `en: ${part}`).toContain(part);
    expect(koMine).not.toMatch(/정제|전처리/);
    expect(enMine).not.toMatch(/clean/i);
    expect(ko.role).toBe('자치구별 Tableau 시각화와 웹사이트 구축을 맡았습니다.');
    expect(en.role).toBe('Made Tableau visualizations of Seoul district (gu) data and built the website.');
    expect(readBody(fileOf('ko', 'kickick-park'))).not.toMatch(/데이터 전처리|정제했습니다/);
    expect(readBody(fileOf('en', 'kickick-park'))).not.toMatch(/Data preparation|cleaned Seoul/);
    expect(en.summary).not.toMatch(/Built a web service that judges/);
    expect(ko.summary).not.toMatch(/판정하고, 바르게 세운 사용자에게 점수를 주는 웹 서비스를 만들었습니다/);
  });

  it('final review fix 1 round 2 item 5: every project summary fits a search snippet (it is the meta/og description)', () => {
    // EN at most 160 characters; Korean glyphs are about twice as wide, so KO at most 85.
    for (const slug of PROJECT_SLUGS) {
      expect([...data('en', slug).summary].length, `en/${slug}`).toBeLessThanOrEqual(160);
      expect([...data('ko', slug).summary].length, `ko/${slug}`).toBeLessThanOrEqual(85);
    }
    expect([...data('ko', 'kickick-park').summary].length).toBeLessThanOrEqual(80);
  });

  it('final review fix 1 round 2 items 2–4: the KickKick body claims nothing the page itself does not support', () => {
    const ko = readBody(fileOf('ko', 'kickick-park'));
    const en = readBody(fileOf('en', 'kickick-park'));
    const section = (body: string, heading: string) => (body.split(`${heading}\n`)[1]?.split('\n## ')[0] ?? '').trim();
    // Item 2: the public web service adds fixed points per photo, the model was trained separately and the scoring
    // rule was only proposed in the final presentation — so no "completed the full flow from judgment to points".
    const enResult = section(en, '## Result');
    const koResult = section(ko, '## 결과');
    expect(enResult).not.toMatch(/completed the full flow/);
    expect(koResult).not.toMatch(/흐름을 완성/);
    expect(enResult).toMatch(/^The team trained the judgment model, built the photo-upload and ranking web service, and designed a scoring rule to link the two, implemented in a local prototype\./);
    expect(koResult).toMatch(/^팀은 판정 모델을 학습하고 사진 업로드·랭킹 웹 서비스를 만들었으며, 둘을 잇는 점수 규칙을 설계해 로컬 프로토타입에 구현했습니다\./);
    expect(enResult).toContain('The web service in the public repository adds a fixed number of points per uploaded photo.');
    // Item 3: whether the rewards changed parking habits was never measured, so no claim of a behaviour-changing service.
    expect(en).toContain('We did not measure whether the rewards actually changed parking habits.');
    expect(ko).toContain('보상이 실제 주차 습관을 바꿨는지는 측정하지 못했습니다.');
    expect(en).not.toMatch(/service that changes rider behavior/);
    expect(ko).not.toMatch(/행동을 바꾸는 서비스/);
    // Item 4: the rule was only proposed, so the reward structure was designed, not built.
    expect(en).not.toMatch(/We built the reward structure/);
    expect(en).toContain('We designed the reward structure but not the experiment that would show whether it worked.');
    expect(ko).not.toMatch(/보상 구조는 만들었지만/);
    expect(ko).toContain('보상 구조는 설계했지만, 효과를 확인할 실험은 설계하지 못했습니다.');
  });

  it('final review fix 1 item 18: KO and EN both credit the school-zone field survey to the team (it is not in my role list)', () => {
    const ko = readBody(fileOf('ko', 'school-zone-blindspots'));
    const en = readBody(fileOf('en', 'school-zone-blindspots'));
    const koSurvey = ko.split('\n').find((line) => line.includes('장전동')) ?? '';
    const enSurvey = en.split('\n').find((line) => line.includes('Jangjeon')) ?? '';
    expect(koSurvey).toMatch(/^팀이 [^.]*현장답사/);
    expect(enSurvey).toMatch(/^The team surveyed/);
    const role = (body: string, heading: string) => body.split(heading)[1]?.split('\n## ')[0] ?? '';
    expect(role(ko, '## 내 역할과 기여')).not.toMatch(/현장/);
    expect(role(en, '## My role')).not.toMatch(/survey/i);
  });

  it('drive survey 2.6: the school-zone label is the 300 m accident indicator, and recall comes with precision and F1', () => {
    const ko = readBody(fileOf('ko', 'school-zone-blindspots'));
    const en = readBody(fileOf('en', 'school-zone-blindspots'));
    expect(ko).not.toContain('4분의 1');
    expect(en).not.toMatch(/a quarter of the data/);
    expect(ko).toContain('240,064개 지점 중 61,848개');
    expect(en).toContain('61,848 of the 240,064 points');
    expect(ko).toContain('재현율은 0.87, 정밀도는 0.62, F1은 0.72');
    expect(en).toContain('recall on accident areas was 0.87, with precision 0.62 and F1 0.72');
    // Owner, 2026-09-28: the field visits are real (photos), so the survey sentence stays (item 18 above).
  });

  it('KickKick figure 1 caption/alt name the dashboard total only (no "점수" / score composition claim)', () => {
    const ko = data('ko', 'kickick-park');
    const en = data('en', 'kickick-park');
    const fig1Ko = ko.figures[0];
    const fig1En = en.figures[0];
    expect(fig1Ko.caption).not.toContain('점수');
    expect(fig1Ko.alt).not.toContain('점수');
    expect(fig1Ko.caption).toMatch(/합계/);
    expect(fig1Ko.caption).toMatch(/역삼2동/);
    expect(fig1Ko.caption).toMatch(/M\s*=\s*백만|M=백만/);
    expect(fig1En.caption).not.toMatch(/\bscore\b/i);
    expect(fig1En.alt).not.toMatch(/\bscore\b/i);
    expect(fig1En.caption).toMatch(/total|합계/i);
    expect(fig1En.caption).toMatch(/Yeoksam 2-dong/);
    expect(fig1En.caption).toMatch(/M\s*=\s*million/i);
    // Figure 2: "합계 점수" → "합계"
    expect(ko.figures[1].caption).not.toContain('합계 점수');
    expect(ko.figures[1].alt).not.toContain('합계 점수');
    expect(en.figures[1].caption).not.toMatch(/total score/i);
    expect(en.figures[1].alt).not.toMatch(/total score/i);
  });

  it("KickKick Park and the youth start-up case split the team's tools from mine (D-9)", () => {
    for (const lang of LANGS) {
      const d = data(lang, 'kickick-park');
      expect(d.tools, lang).toEqual(['Python', 'Tableau', 'Django', 'MySQL']);
      expect(d.teamTools, lang).toEqual(['YOLOv8', 'PyTorch']);
      // Owner, 2026-09-28: my part of the youth start-up case was data exploration and data engineering; QGIS was
      // used by the team, not by me, and the models and the Streamlit dashboard are the team's.
      const y = data(lang, 'youth-startup-location');
      expect(y.tools, lang).toEqual(['Python']);
      expect(y.teamTools, lang).toEqual(['scikit-learn', 'LightGBM', 'XGBoost', 'QGIS', 'Streamlit']);
    }
    for (const slug of PROJECT_SLUGS) {
      if (slug === 'kickick-park' || slug === 'youth-startup-location') continue;
      expect(data('ko', slug).teamTools, slug).toBeUndefined();
    }
  });

  it('owner 2026-09-28: the youth start-up case credits me with data exploration and data engineering only', () => {
    const ko = data('ko', 'youth-startup-location');
    const en = data('en', 'youth-startup-location');
    expect(ko.org).toBe('부산대학교 데이터사이언스전문대학원 · DatoryLab');
    expect(en.org).toBe('Pusan National University Graduate School of Data Science · DatoryLab');
    expect(ko.type).toBe('부산시 요청 과제');
    expect(en.type).toBe('Project requested by the City of Busan');
    expect(ko.summary).toMatch(/^4인 팀이.*저는 데이터 탐색과 엔지니어링을 맡았습니다\.$/);
    expect(en.summary).toMatch(/^A four-person team .*; I did the data exploration and data engineering\.$/);
    expect(ko.role).not.toMatch(/군집|모델|대시보드|포스터|보고서/);
    expect(en.role).not.toMatch(/cluster|model|dashboard|poster|report/i);
    const koBody = readBody(fileOf('ko', 'youth-startup-location'));
    const enBody = readBody(fileOf('en', 'youth-startup-location'));
    const bullets = (body: string, heading: string) =>
      (body.split(`${heading}\n`)[1]?.split('\n## ')[0] ?? '').split('\n').filter((line) => line.startsWith('- ')).join(' ');
    expect(bullets(koBody, '## 내 역할과 기여')).not.toMatch(/군집|모델|대시보드|포스터|보고서/);
    expect(bullets(enBody, '## My role')).not.toMatch(/cluster|model|dashboard|poster|report/i);
    expect(koBody).toContain('## 후속: BUSAN DATA WEEK 2025 출품');
    expect(enBody).toContain('## Follow-up: BUSAN DATA WEEK 2025 entry');
    expect(koBody).toContain("팀 '부산한 부산'");
    expect(enBody).toContain('Busanhan Busan');
    for (const body of [koBody, enBody]) {
      expect(body).not.toMatch(/0\.832|0\.809/);
    }
  });

  it('owner-confirmed: the youth start-up period is 2025-05 to 2025-11', () => {
    expect(data('ko', 'youth-startup-location').period.start).toBe('2025-05');
    expect(data('ko', 'youth-startup-location').period.end).toBe('2025-11');
    expect(data('en', 'youth-startup-location').period.start).toBe('2025-05');
    expect(data('en', 'youth-startup-location').period.end).toBe('2025-11');
  });

  it('P1-15: the KickKick Park plan is a real A/B test (random split at the same time), not a before/after comparison', () => {
    const ko = readBody(fileOf('ko', 'kickick-park'));
    const en = readBody(fileOf('en', 'kickick-park'));
    expect(ko).toContain('같은 기간에 사용자를 무작위로 나눠 점수를 켠 집단과 끈 집단의 주차 품질을 비교하는 A/B 테스트');
    expect(ko).not.toMatch(/전후[^.]*A\/B/);
    expect(en).toContain('randomly split riders into a points-on group and a points-off group over the same period');
    expect(en).not.toMatch(/before and after points/);
  });

  it('P2-31: youth start-up names the four result clusters and drops the unsourced closure statistic', () => {
    const ko = readBody(fileOf('ko', 'youth-startup-location'));
    const en = readBody(fileOf('en', 'youth-startup-location'));
    expect(ko).not.toContain('다섯 곳 중 네 곳');
    expect(en).not.toMatch(/four in five/i);
    const pmKo = /## 기획자·PM 관점\n\n([^\n]+)/.exec(ko)?.[1] ?? '';
    for (const cluster of ['일반 주거지역 상권', '번화가·야간 상권', '중장년층 중심 상권', '주거·교통 허브 상권']) {
      expect(ko, `result table: ${cluster}`).toContain(`| ${cluster} |`);
      expect(pmKo, `PM paragraph: ${cluster}`).toContain(cluster);
    }
    expect(pmKo).not.toMatch(/대학가|오피스/);
    const pmEn = /## For product & planning teams\n\n([^\n]+)/.exec(en)?.[1] ?? '';
    expect(pmEn).not.toMatch(/universit|office/i);
  });

  it('the youth start-up R² appears only as a held-out figure (Task 0 Q6)', () => {
    const ko = readBody(fileOf('ko', 'youth-startup-location'));
    const en = readBody(fileOf('en', 'youth-startup-location'));
    expect(ko.replace('(검증 데이터 R² 0.897)', '')).not.toMatch(/R²|0\.897/);
    expect(en.replace('(held-out R² 0.897)', '')).not.toMatch(/R²|0\.897/);
    expect(ko.includes('0.897')).toBe(en.includes('0.897'));
  });
});
