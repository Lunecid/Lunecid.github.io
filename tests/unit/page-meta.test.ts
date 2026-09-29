import { describe, expect, it } from 'vitest';
import { PAGE_META, STATS_META, projectPageMeta, statsMetaFor, type CommonPageKey } from '../../src/data/copy/pages';
import { GOATCOUNTER } from '../../src/config';
import { containsTrademark } from '../../src/lib/seo';
import { ui } from '../../src/i18n/ui';
import { PROJECT_PAGE_SLUGS } from '../../src/lib/routes';
import { readFrontmatter } from '../content/helpers';
import { loadFactSource } from '../helpers/fact-source';
import type { Localized } from '../../src/i18n/utils';
import { pageMetaFor, type PageMetaText } from '../../src/variants';
import { dataVariant } from '../../src/variants/data';
import { gameVariant } from '../../src/variants/game';

const KEYS: CommonPageKey[] = ['chooser', 'research', 'research-story', 'projects', 'player-log', 'stats', 'privacy', 'credits', 'not-found'];
const LANGS = ['ko', 'en'] as const;
type MetaText = Localized<{ title: string; description: string }>;
/** P1-7a: home and records moved to the versions; every per-key check also runs over the version meta. */
const dataProjects = dataVariant.pageMeta.projects;
if (!dataProjects) throw new Error('dataVariant.pageMeta.projects is missing');
const VARIANT_META: [string, MetaText][] = [
  ['game.home', gameVariant.pageMeta.home],
  ['game.records', gameVariant.pageMeta.records],
  ['data.home', dataVariant.pageMeta.home],
  ['data.records', dataVariant.pageMeta.records],
  ['data.projects', dataProjects],
];
const ALL_META: [string, MetaText][] = [...KEYS.map((key): [string, MetaText] => [key, PAGE_META[key]]), ...VARIANT_META];
/** P1-8: what the pages emit, tokens resolved: common keys neutral and on each version, version keys per version. */
const facts = loadFactSource();
const RESOLVED_META: [string, Localized<PageMetaText>][] = [
  ...KEYS.flatMap((key) => ([null, 'game', 'data'] as const).map((variant): [string, Localized<PageMetaText>] => [
    `${variant ?? 'neutral'}.${key}`,
    { ko: pageMetaFor(key, 'ko', variant, facts), en: pageMetaFor(key, 'en', variant, facts) },
  ])),
  ...(['home', 'records'] as const).flatMap((key) => (['game', 'data'] as const).map((variant): [string, Localized<PageMetaText>] => [
    `${variant}.${key}`,
    { ko: pageMetaFor(key, 'ko', variant, facts), en: pageMetaFor(key, 'en', variant, facts) },
  ])),
];

describe('PAGE_META', () => {
  it('every PageKey has ko/en title and description', () => {
    expect(Object.keys(PAGE_META).sort()).toEqual([...KEYS].sort());
    for (const [key, meta] of ALL_META) {
      for (const lang of LANGS) {
        expect(meta[lang].title.trim().length, `${key}.${lang}.title`).toBeGreaterThan(0);
        expect(meta[lang].description.trim().length, `${key}.${lang}.description`).toBeGreaterThan(0);
      }
    }
    expect(gameVariant.pageMeta.home.ko.title).toBe('백성은 · 게임 데이터 분석가·연구자');
    expect(gameVariant.pageMeta.home.en.title).toBe('Seongeun Baek · Game Data Analyst & Researcher');
    expect(PAGE_META['research-story'].ko.title).toBe('교전 결과 예측 논문 · 백성은');
    expect(PAGE_META['not-found']).toEqual({ ko: { title: '페이지를 찾을 수 없습니다 · 백성은', description: '페이지를 찾을 수 없습니다. Page not found.' }, en: { title: 'Page not found · Seongeun Baek', description: 'Page not found. 페이지를 찾을 수 없습니다.' } });
  });

  it('no title contains a trademark', () => {
    for (const [key, meta] of RESOLVED_META) {
      for (const lang of LANGS) expect(containsTrademark(meta[lang].title), `${key}.${lang}`).toBe(false);
    }
  });

  it('no meta description (also og:description and the OG card subtitle) contains a trademark', () => {
    // Every description a page can emit: PAGE_META (both /stats/ states) and the project pages' summaries.
    const descriptions: [string, string][] = [];
    for (const [key, meta] of RESOLVED_META) for (const lang of LANGS) descriptions.push([`${key}.${lang}`, meta[lang].description]);
    for (const state of ['offline', 'collecting'] as const) {
      for (const lang of LANGS) descriptions.push([`stats.${state}.${lang}`, STATS_META[state][lang].description]);
    }
    for (const lang of LANGS) {
      for (const slug of PROJECT_PAGE_SLUGS) {
        const summary = String((readFrontmatter(`src/content/projects/${lang}/${slug}.md`) as { summary: string }).summary);
        descriptions.push([`${lang}/${slug}`, projectPageMeta('x', summary, lang).description]);
      }
    }
    expect(descriptions.filter(([, text]) => containsTrademark(text)).map(([where, text]) => `${where}: ${text}`)).toEqual([]);
    // The check really catches a Riot mention in a description (fix round 1: "(Riot API)" had slipped in).
    expect(containsTrademark('공개 경기 기록(Riot API)으로 교전 뒤 이득을 예측')).toBe(true);
    expect(containsTrademark('from 30 seconds of public match records (Riot API).')).toBe(true);
  });

  it('descriptions are at most 160 characters', () => {
    for (const [key, meta] of RESOLVED_META) {
      for (const lang of LANGS) expect(meta[lang].description.length, `${key}.${lang}`).toBeLessThanOrEqual(160);
    }
  });

  it('D-13/P1-18: the Player Log intro and description promise no data pipeline, only what the page shows', () => {
    for (const lang of LANGS) {
      for (const text of [PAGE_META['player-log'][lang].description, ui[lang]['playerLog.intro']]) {
        expect(text, lang).not.toMatch(/파이프라인|pipeline|게임 이해도 기록|game literacy/i);
      }
    }
    expect(ui.ko['playerLog.intro']).toContain('좋아하는 게임');
    expect(ui.en['playerLog.intro']).toContain('achievements');
  });

  it('P2-30: the /projects/ lead (also its meta description) names the game log research', () => {
    expect(PAGE_META.projects.ko.description).toBe('게임 로그 연구와 공공데이터 경진대회에서 한 데이터 분석 사례 연구입니다. 질문·데이터·방법·결과와 제 역할을 적었습니다.');
    expect(PAGE_META.projects.en.description).toMatch(/^Data analysis case studies from game log research and public-data competitions/);
  });

  it('P2-33: the /stats/ description matches the GoatCounter state', () => {
    const state = GOATCOUNTER.code === null ? 'offline' : 'collecting';
    expect(PAGE_META.stats).toEqual(STATS_META[state]);
    // both selections (fix round 1: the collecting path was untested while the code is null)
    expect(statsMetaFor(null)).toBe(STATS_META.offline);
    expect(statsMetaFor('lunecid')).toBe(STATS_META.collecting);
    expect(statsMetaFor('lunecid').ko.description).toBe('쿠키 없이 모은 이 사이트의 방문 수, 인기 페이지, 유입 경로.');
    expect(statsMetaFor('lunecid').en.description).toBe('Visits, top pages, and referrers for this site, collected without cookies.');
    for (const lang of LANGS) {
      expect(STATS_META.offline[lang].description, lang).toMatch(/GoatCounter/);
      expect(STATS_META.offline[lang].description, lang).not.toMatch(/인기 페이지|top pages|referrers/i);
      expect(STATS_META.offline[lang].title).toBe(STATS_META.collecting[lang].title);
    }
  });

  it('projectPageMeta appends the name', () => {
    expect(projectPageMeta('킥킥파크', '킥보드 주차 요약', 'ko')).toEqual({ title: '킥킥파크 · 백성은', description: '킥보드 주차 요약' });
    expect(projectPageMeta('KickKick Park', 'Scooter parking summary', 'en')).toEqual({
      title: 'KickKick Park · Seongeun Baek',
      description: 'Scooter parking summary',
    });
  });
});
