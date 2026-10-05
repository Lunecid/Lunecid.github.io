import { describe, expect, it } from 'vitest';
import KeyFigures from '../../src/components/data/KeyFigures.astro';
import { resolveKeyFigures } from '../../src/lib/key-figures';
import { renderAstro } from './helpers';

const L = (v: string) => ({ ko: v, en: v });
const facts = { points: L('240,064'), positives: L('61,848'), sources: L('16'), features: L('32'), blocks: L('10'), recall: L('0.87'), precision: L('0.62'), f1: L('0.72') };
const keyFigures = [
  { value: '{fact.points}', unit: '개 지점', label: '중 {fact.positives}개에 사고 라벨', bar: ['positives', 'points'] as [string, string] },
  { label: '공공데이터', value: '{fact.sources}', unit: '종', labelFirst: true },
  { label: '피처', value: '{fact.features}', unit: '개', labelFirst: true },
  { value: '{fact.blocks}', unit: '개', label: '지리 블록' },
];
const metrics = {
  title: '공간 블록 교차검증',
  label: '공간 블록 교차검증에서 사고 지역의 재현율은 0.87, 정밀도는 0.62, F1은 0.72였습니다.',
  rows: [{ key: '재현율', fact: 'recall' }, { key: '정밀도', fact: 'precision' }, { key: 'F1', fact: 'f1', highlight: true }],
};
const resolved = resolveKeyFigures({ facts, keyFigures, metrics }, 'ko');

describe('KeyFigures.astro (DS-6)', () => {
  it('resolves {fact.x} inside the project; the bar width is positives / points from the parsed facts', () => {
    expect(resolved?.tiles.map((t) => [t.value, t.unit, t.label])).toEqual([
      ['240,064', '개 지점', '중 61,848개에 사고 라벨'], ['16', '종', '공공데이터'], ['32', '개', '피처'], ['10', '개', '지리 블록'],
    ]);
    expect(resolved?.tiles[0]?.bar).toBeCloseTo(61848 / 240064, 6);
    expect(resolved?.metrics?.rows.map((r) => [r.key, r.value, r.share, r.highlight])).toEqual([['재현율', '0.87', 0.87, false], ['정밀도', '0.62', 0.62, false], ['F1', '0.72', 0.72, true]]);
    expect(() => resolveKeyFigures({ facts, keyFigures: [{ value: '{fact.nope}', label: 'x' }] }, 'ko')).toThrow(/nope/);
    expect(resolveKeyFigures({ facts }, 'ko')).toBeNull();
  });

  it('tiles, bar width from facts, metric rows, highlight row, the aria-label sentence', async () => {
    const html = await renderAstro(KeyFigures, { props: { figures: resolved } });
    expect(html).toMatch(/<div class="ed-band"/);
    expect(html).toMatch(/<ul class="ed-stats ed-stats--band" role="list"/);
    expect(html.match(/<li class="ed-stat"/g)).toHaveLength(4);
    expect(html).toMatch(/<span class="ed-stat__v"[^>]*>240,064<small[^>]*>개 지점<\/small><\/span><span class="ed-stat__k"[^>]*>중 61,848개에 사고 라벨<\/span><span class="ed-stat__bar" aria-hidden="true"[^>]*><i style="--ed-p: ?25\.76%;?"[^>]*><\/i><\/span>/);
    expect(html).toMatch(/<span class="ed-stat__k"[^>]*>공공데이터<\/span><span class="ed-stat__v"[^>]*>16<small[^>]*>종<\/small>/);
    expect(html).toMatch(/<div class="ed-metric" role="img" aria-label="공간 블록 교차검증에서 사고 지역의 재현율은 0\.87, 정밀도는 0\.62, F1은 0\.72였습니다\."/);
    expect(html).toMatch(/<p class="ed-metric__title" aria-hidden="true"[^>]*>공간 블록 교차검증<\/p>/);
    const rows = html.match(/<li class="ed-metric__row[^"]*"[\s\S]*?<\/li>/g) ?? [];
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatch(/<span class="ed-metric__k"[^>]*>재현율<\/span><span class="ed-metric__bar"[^>]*><i style="--ed-p: ?87%;?"[^>]*><\/i><\/span><span class="ed-metric__v"[^>]*>0\.87<\/span>/);
    expect(rows[2]).toMatch(/^<li class="ed-metric__row ed-metric__row--hl"/);
    expect(rows.slice(0, 2).join('')).not.toMatch(/--hl/);
  });

  it('renders nothing without key figures', async () => {
    const html = await renderAstro(KeyFigures, { props: { figures: null } });
    expect(html.trim()).toBe('');
  });
});
