import { describe, expect, it } from 'vitest';
import StatTiles from '../../src/components/data/StatTiles.astro';
import { renderAstro } from './helpers';

const items = [
  { label: '한국 서버 마스터 이상 솔로 랭크', value: '206,442', unit: '경기', labelFirst: true },
  { label: 'LightGBM', prefix: 'AUC', value: '0.675', labelFirst: true },
  { value: '2027년 2월', label: '석사 졸업 예정' },
];

describe('StatTiles.astro (DS-4)', () => {
  it('renders value/label pairs in the given DOM order; numbers tabular; first tile painted in tone figure; no text outside the pairs', async () => {
    const html = await renderAstro(StatTiles, { props: { items, tone: 'figure' } });
    expect(html).toMatch(/^<ul class="ed-stats ed-stats--figure" role="list"/);
    const tiles = html.match(/<li\b[\s\S]*?<\/li>/g) ?? [];
    expect(tiles).toHaveLength(3);
    // DOM order = the sentence's order: label first where the site's sentence names it first
    expect(tiles[0]).toMatch(/<span class="ed-stat__k"[^>]*>한국 서버 마스터 이상 솔로 랭크<\/span><span class="ed-stat__v"[^>]*>206,442<small[^>]*>경기<\/small><\/span>/);
    expect(tiles[1]).toMatch(/<span class="ed-stat__k"[^>]*>LightGBM<\/span><span class="ed-stat__v"[^>]*><small[^>]*>AUC<\/small>0\.675<\/span>/);
    expect(tiles[2]).toMatch(/<span class="ed-stat__v"[^>]*>2027년 2월<\/span><span class="ed-stat__k"[^>]*>석사 졸업 예정<\/span>/);
    // tone figure: only the first tile sits on paint, and it says so
    expect(tiles[0]).toMatch(/data-paint-text/);
    expect(tiles.slice(1).join('')).not.toMatch(/data-paint-text/);
    const pieces = [...html.matchAll(/>([^<]+)</g)].map((m) => (m[1] ?? '').trim()).filter(Boolean);
    expect(pieces).toEqual(['한국 서버 마스터 이상 솔로 랭크', '206,442', '경기', 'LightGBM', 'AUC', '0.675', '2027년 2월', '석사 졸업 예정']);
  });

  it('plain and band tones paint nothing; the numbers are set tabular in editorial.css', async () => {
    for (const tone of ['plain', 'band'] as const) {
      const html = await renderAstro(StatTiles, { props: { items, tone } });
      expect(html).toMatch(new RegExp(`^<ul class="ed-stats ed-stats--${tone}" role="list"`));
      expect(html).not.toMatch(/data-paint-text/);
    }
    const css = (await import('node:fs')).readFileSync('src/styles/editorial.css', 'utf8');
    expect(css).toMatch(/\.ed-stat__v \{[^}]*font-variant-numeric: tabular-nums/);
    expect(css).toMatch(/\.ed-stats--figure > \.ed-stat:first-child \{[^}]*background: var\(--ed-paint-bh\)/);
  });
});
