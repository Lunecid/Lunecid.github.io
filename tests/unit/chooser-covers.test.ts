// The chooser covers (v6.2) show only the file's title and CTA, the version's tagline, its contents line and the foot
// line — no evidence, award, AUC, chart or stat (owner rulings after v3/v4).
import { describe, expect, it } from 'vitest';
import { chooserCopy } from '../../src/data/copy/chooser';
import { buildCover, COVER_ORDER, type CoverData, type CoverId } from '../../src/lib/chooser-covers';
import { dataVariant } from '../../src/variants/data';
import { gameVariant } from '../../src/variants/game';

const TODAY = '2026-10-05';
const LANGS = ['ko', 'en'] as const;
const IDS: CoverId[] = ['game', 'data'];
const VARIANT = { game: gameVariant, data: dataVariant };

/** Every string in the cover with its path ('contents[0].num', 'foot.year', …). */
function strings(value: unknown, path = ''): [string, string][] {
  if (typeof value === 'string') return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((v, i) => strings(v, `${path}[${i}]`));
  if (value !== null && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => strings(v, path ? `${path}.${k}` : k));
  return [];
}

describe('chooser covers', () => {
  it('title and CTA equal chooserCopy verbatim; tagline equals the variant identity tagline (ko, en)', () => {
    for (const lang of LANGS) {
      for (const id of IDS) {
        const cover = buildCover(id, lang, TODAY);
        expect(cover.id).toBe(id);
        expect(cover.lang).toBe(lang);
        expect(cover.title, `${lang} ${id}`).toBe(chooserCopy[lang][id].title);
        expect(cover.cta, `${lang} ${id}`).toBe(chooserCopy[lang][id].cta);
        expect(cover.tagline, `${lang} ${id}`).toBe(VARIANT[id].identity.tagline[lang]);
      }
    }
    // not vacuous: the strings themselves
    expect(buildCover('game', 'ko', TODAY)).toMatchObject({ href: '/game/', title: '게임 데이터 분석가', cta: '게임 버전 보기', tagline: '플레이어를 예측하는 데서 멈추지 않고, 이해하는 데이터를 만듭니다.' });
    expect(buildCover('data', 'en', TODAY)).toMatchObject({ href: '/en/data/', title: 'Data Analyst', cta: 'View general version', tagline: 'I turn questions into data, and results into decisions.' });
    expect(buildCover('data', 'ko', TODAY).href).toBe('/data/');
    expect(buildCover('game', 'en', TODAY).href).toBe('/en/game/');
  });

  it('contents follow the variant nav order with nav labels: game four entries incl. player log, data three', () => {
    expect(buildCover('game', 'ko', TODAY).contents).toEqual([
      { num: '01', label: '연구' }, { num: '02', label: '프로젝트' }, { num: '03', label: '기록' }, { num: '04', label: '플레이 로그' },
    ]);
    expect(buildCover('data', 'ko', TODAY).contents).toEqual([{ num: '01', label: '연구' }, { num: '02', label: '프로젝트' }, { num: '03', label: '기록' }]);
    expect(buildCover('game', 'en', TODAY).contents.map((c) => c.label)).toEqual(['Research', 'Projects', 'Records', 'Player Log']);
    expect(buildCover('data', 'en', TODAY).contents.map((c) => c.label)).toEqual(['Research', 'Projects', 'Records']);
    for (const id of IDS) expect(buildCover(id, 'ko', TODAY).contents).toHaveLength(VARIANT[id].nav.length);
  });

  it('the cover carries no evidence, award, AUC, chart or stat field and no digit outside contents numbers and the year', () => {
    for (const lang of LANGS) {
      for (const id of IDS) {
        const cover: CoverData = buildCover(id, lang, TODAY);
        expect(Object.keys(cover).sort(), `${lang} ${id}`).toEqual(['contents', 'cta', 'foot', 'href', 'id', 'lang', 'tagline', 'title']);
        expect(Object.keys(cover.foot).sort()).toEqual(['host', 'year']);
        expect(cover.foot).toEqual({ year: '2026', host: 'lunecid.github.io' });
        const text = JSON.stringify(cover);
        const copy = chooserCopy[lang][id];
        expect(text).not.toContain(copy.evidence);
        if ('chartCaption' in copy) expect(text).not.toContain(copy.chartCaption);
        expect(text).not.toMatch(/AUC|evidence|award|chart|stat/i);
        for (const [path, value] of strings(cover)) {
          if (/^contents\[\d+\]\.num$/.test(path) || path === 'foot.year') continue;
          expect(value, `${lang} ${id} ${path}`).not.toMatch(/[0-9]/);
        }
      }
    }
    expect(buildCover('game', 'ko', '2031-01-01').foot.year).toBe('2031');
  });

  it('COVER_ORDER is data then game', () => {
    expect(COVER_ORDER).toEqual(['data', 'game']);
  });

  it('en covers contain no Hangul', () => {
    for (const id of IDS) {
      for (const [path, value] of strings(buildCover(id, 'en', TODAY))) expect(value, `${id} ${path}`).not.toMatch(/[ᄀ-ᇿ㄰-㆏가-힯]/);
    }
    // the Korean covers do carry Hangul (the check is not vacuous)
    expect(JSON.stringify(buildCover('game', 'ko', TODAY))).toMatch(/[가-힯]/);
  });
});
