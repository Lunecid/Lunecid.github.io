import { describe, expect, it } from 'vitest';
import { PAGE_META } from '../../src/data/copy/pages';
import {
  CAPTION_KEYS, NEUTRAL_IDENTITY, VARIANTS, VARIANT_IDS, VARIANT_MODULES, VARIANT_PREFIX, captionFor, getVariant, navBase,
  pageMetaFor, resolveIdentity,
} from '../../src/variants';
import { dataVariant } from '../../src/variants/data';
import { gameVariant } from '../../src/variants/game';
import { resolveFacts } from '../../src/lib/facts';
import { loadFactSource } from '../helpers/fact-source';

const facts = loadFactSource();

describe('versions (spec §4.2, contract §1.6–§1.7)', () => {
  it('NEUTRAL_IDENTITY.siteTitle is the resume.yaml name (the neutral header, DataNav and the footers show it without reading the collection)', () => {
    const src = loadFactSource();
    for (const lang of ['ko', 'en'] as const) expect(NEUTRAL_IDENTITY.siteTitle[lang], lang).toBe(resolveFacts('{person.name}', lang, src));
  });

  it('registry, prefixes, modules, layout, theme, job-fit ids, nav', () => {
    expect(Object.keys(VARIANTS)).toEqual([...VARIANT_IDS]);
    for (const id of VARIANT_IDS) {
      const v = getVariant(id);
      expect(v.id).toBe(id);
      expect(v.prefix).toBe(VARIANT_PREFIX[id]);
      expect(v.modules).toBe(VARIANT_MODULES[id]); // the same array, never a copy
      expect(v.layout).toBe(id === 'data' ? 'data' : 'base'); // P2-2 flipped data → 'data' (with the layout flip, contract §8.1 F-3)
      expect(v.jobfit).toBe(id);
    }
    expect(gameVariant.theme).toBe('hud');
    expect(dataVariant.theme).toBe('editorial');
    expect(gameVariant.nav).toEqual([
      { key: 'research', base: '/research/' }, { key: 'projects', base: '/projects/' },
      { key: 'records', base: '/records/' }, { key: 'player-log', base: '/player-log/' },
    ]);
    expect(dataVariant.nav).toEqual(gameVariant.nav.slice(0, 3));
    expect(navBase(dataVariant, 'projects')).toBe('/projects/');
    expect(() => navBase(dataVariant, 'player-log')).toThrow(/no player-log/);
  });

  it('game identity resolves to exactly the strings the site shows today', () => {
    const ko = resolveIdentity(gameVariant, 'ko', facts);
    const en = resolveIdentity(gameVariant, 'en', facts);
    expect(ko.headline).toBe('게임 데이터 분석가 · 연구자');
    expect(en.headline).toBe('Game Data Analyst · Researcher');
    expect(ko.siteTitle).toBe('백성은 · 게임 데이터 분석가·연구자');
    expect(en.siteTitle).toBe('Seongeun Baek · Game Data Analyst & Researcher');
    expect(ko.tagline).toBe('플레이어를 예측하는 데서 멈추지 않고, 이해하는 데이터를 만듭니다.');
    expect(en.tagline).toBe('Beyond predicting players: building data that explains them.');
    expect(ko.status).toBe('2027년 2월 석사 졸업 예정 · 게임 데이터 분석가 채용과 박사과정 진학을 함께 준비하고 있습니다.');
    expect(en.status).toBe('M.S. expected February 2027 · Pursuing game data analyst roles and Ph.D. programs in parallel.');
    expect(ko.about).toBe(
      '부산대학교 데이터사이언스전문대학원 석사과정에서 게임 데이터를 연구하고 있습니다. 리그 오브 레전드의 공개 경기 기록(Riot API)으로 교전 결과를 예측한 연구를 IEEE CoG 2026에서 구두 발표했습니다. 공공데이터 경진대회와 팀 프로젝트에서는 공간 데이터 분석과 예측 모델을 맡았습니다.',
    );
    expect(en.about).toBe(
      'I am an M.S. student at the Graduate School of Data Science, Pusan National University, working on game data. I presented a study that predicts the outcome of kill-conditioned engagements in League of Legends from public match records (Riot API) as an oral paper at IEEE CoG 2026. In public-data competitions and team projects, I worked on spatial data analysis and predictive models.',
    );
    expect(ko.labNote.title).toBe('게임 연구실 교수님께');
    expect(en.labNote.title).toBe('For game research labs');
    expect(ko.labNote.body).toBe(
      '공개 게임 데이터로 재현할 수 있는 벤치마크를 만들고, 무엇을 예측할 수 있고 무엇은 할 수 없는지까지 재는 연구를 이어 가고 싶습니다. 대규모 경기 로그의 수집과 정제, 시간 순서를 지킨 평가, 결과의 한계를 글로 정리하는 일을 직접 해 왔고, 그 결과를 IEEE CoG 2026에서 구두 발표했습니다. 2027년 2월 석사 졸업 예정이며 박사과정 진학을 준비하고 있습니다. 연구 주제나 면담에 관해서는 이메일로 연락해 주세요.',
    );
    expect(en.labNote.body).toBe(
      'I want to keep building reproducible benchmarks from public game data and measuring what can be predicted and what cannot. I have done the large-scale match log collection and cleaning, the time-ordered evaluation, and the write-up of limitations myself, and gave an oral presentation of the results at IEEE CoG 2026. I expect to finish my master’s in February 2027 and am preparing to apply to Ph.D. programs. Please email me about research topics or a meeting.',
    );
  });

  it('data identity follows B-10, B-12, A-31 and the P1 about draft', () => {
    const ko = resolveIdentity(dataVariant, 'ko', facts);
    const en = resolveIdentity(dataVariant, 'en', facts);
    expect([ko.headline, en.headline]).toEqual(['데이터 분석가', 'Data Analyst']);
    expect([ko.siteTitle, en.siteTitle]).toEqual(['백성은 · 데이터 분석가', 'Seongeun Baek · Data Analyst']);
    expect([ko.tagline, en.tagline]).toEqual(['질문을 데이터로 바꾸고, 결과를 결정으로 잇습니다.', 'I turn questions into data, and results into decisions.']);
    expect([ko.status, en.status]).toEqual(['2027년 2월 석사 졸업 예정', 'M.S. expected February 2027']);
    expect(ko.status).not.toMatch(/박사/);
    expect(ko.about).toContain('IEEE CoG 2026에서 구두 발표했습니다.');
    expect(en.about).toContain('as an oral paper at IEEE CoG 2026.');
    expect([ko.labNote.title, en.labNote.title]).toEqual(['연구실 안내', 'For research labs']);
    expect(dataVariant.identity.labNote.body).toBe(gameVariant.identity.labNote.body);
    expect(dataVariant.captions).toBe(gameVariant.captions); // A-30: P2-4 replaces
    expect(Object.keys(gameVariant.captions)).toEqual([...CAPTION_KEYS]);
    expect(captionFor(gameVariant, 'selectProject', 'ko')).toBe('SELECT YOUR PROJECT');
  });

  it('neutral identity (B-11, B-13)', () => {
    expect(NEUTRAL_IDENTITY.headline).toEqual({ ko: '연구자 · 데이터 분석가', en: 'Researcher · Data Analyst' });
    expect(NEUTRAL_IDENTITY.siteTitle).toEqual({ ko: '백성은', en: 'Seongeun Baek' });
    expect(NEUTRAL_IDENTITY.oneLiner).toEqual({
      ko: '데이터로 사람의 행동을 읽는 분석가입니다. 보고 싶은 포트폴리오를 고르세요.',
      en: 'I read human behaviour from data. Choose the portfolio you want to see.',
    });
  });

  it('pageMetaFor: version override first, else the common PAGE_META; tokens resolved', () => {
    expect(pageMetaFor('home', 'ko', 'game', facts)).toEqual({ title: '백성은 · 게임 데이터 분석가·연구자', description: '게임 데이터 분석가·연구자 백성은의 포트폴리오. 연구, 프로젝트, 이력서, 플레이 로그.' });
    expect(pageMetaFor('home', 'en', 'game', facts).title).toBe('Seongeun Baek · Game Data Analyst & Researcher');
    expect(pageMetaFor('records', 'ko', 'game', facts).description).toBe('학력, 수상, 자격, 기술, 게임사 데이터 분석가 지원 요건 대응표와 이력서 PDF.');
    expect(pageMetaFor('home', 'ko', 'data', facts)).toEqual({ title: '백성은 · 데이터 분석가', description: '데이터 분석가 백성은의 포트폴리오. 연구, 프로젝트, 이력서.' });
    expect(pageMetaFor('home', 'en', 'data', facts)).toEqual({ title: 'Seongeun Baek · Data Analyst', description: 'Portfolio of Seongeun Baek, data analyst. Research, projects, and résumé.' });
    expect(pageMetaFor('records', 'ko', 'data', facts)).toEqual({ title: '기록·이력서 · 백성은', description: '학력, 수상, 자격, 기술, 데이터 분석가 지원 요건 대응표와 이력서 PDF.' });
    expect(pageMetaFor('records', 'en', 'data', facts)).toEqual(pageMetaFor('records', 'en', 'game', facts));
    expect(pageMetaFor('projects', 'ko', 'data', facts).description).toBe('공공데이터 경진대회와 연구에서 한 데이터 분석 사례 연구입니다. 질문·데이터·방법·결과와 제 역할을 적었습니다.');
    expect(pageMetaFor('projects', 'en', 'data', facts)).toEqual({ title: 'Projects · Seongeun Baek', description: 'Data analysis case studies from public-data competitions and research, with the question, data, method, results and my role in each.' });
    expect(pageMetaFor('projects', 'ko', 'game', facts)).toEqual(PAGE_META.projects.ko);
    expect(pageMetaFor('research', 'en', 'data', facts)).toEqual(PAGE_META.research.en);
    expect(pageMetaFor('chooser', 'ko', null, facts)).toEqual({ title: '백성은 · 포트폴리오', description: NEUTRAL_IDENTITY.oneLiner.ko });
    expect(pageMetaFor('chooser', 'en', null, facts).title).toBe('Seongeun Baek · Portfolio');
    expect(() => pageMetaFor('home', 'ko', null, facts)).toThrow(/no meta for 'home'/);
    expect(Object.keys(PAGE_META)).not.toContain('home');
    expect(Object.keys(PAGE_META)).not.toContain('records');
  });
});
