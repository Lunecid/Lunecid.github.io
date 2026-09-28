import { describe, expect, it } from 'vitest';
import AucLabel from '../../src/components/research/AucLabel.astro';
import ProjectCartridge from '../../src/components/projects/ProjectCartridge.astro';
import { figureCopy, overallAuc } from '../../src/data/research/cog-2026';
import { readSource, renderAstro } from './helpers';

// Fix round 1: the CoG cartridge label is the paper's own result, drawn from the AUC chart's data.
describe('AucLabel.astro', () => {
  it('two layouts (card, strip) of the same three rows from overallAuc, with the chart caption and alt', async () => {
    const ko = await renderAstro(AucLabel, { props: { lang: 'ko' } });
    expect(ko.match(/<svg\b/g)).toHaveLength(2);
    expect(ko).toMatch(/class="auc-label__svg auc-label__svg--card" viewBox="0 0 300 132"/);
    expect(ko).toMatch(/class="auc-label__svg auc-label__svg--strip" viewBox="0 0 480 112"/);
    for (const layout of ['card', 'strip']) {
      const title = new RegExp(`<title id="auc-label-${layout}-title"[^>]*>([^<]*)</title>`).exec(ko)?.[1];
      const desc = new RegExp(`<desc id="auc-label-${layout}-desc"[^>]*>([^<]*)</desc>`).exec(ko)?.[1];
      expect(title).toBe(figureCopy.aucOverall.caption.ko);
      expect(desc).toBe(figureCopy.aucOverall.alt.ko);
    }
    const neural = overallAuc.filter((r) => r.group === 'neural').map((r) => r.auc);
    const values = [...ko.matchAll(/<text class="auc-label__value"[^>]*>([^<]+)<\/text>/g)].map((m) => m[1]);
    const range = `${Math.min(...neural).toFixed(3)}–${Math.max(...neural).toFixed(3)}`;
    expect(values).toEqual(['0.675', '0.626', range, '0.675', '0.626', range]);
    expect(range).toBe('0.569–0.581');
    const names = [...ko.matchAll(/<text class="auc-label__name"[^>]*>([^<]+)<\/text>/g)].map((m) => m[1]);
    expect(names).toEqual(['LightGBM', 'MLP', '신경망 6종', 'LightGBM', 'MLP', '신경망 6종']);
    expect(ko.match(/auc-label__dot--hl/g)).toHaveLength(2); // LightGBM, once per layout
    const en = await renderAstro(AucLabel, { props: { lang: 'en' } });
    expect(en).toContain('6 neural');
    expect(en).toContain(figureCopy.aucOverall.alt.en);
  });

  it('the card layout on phones, the strip from 734px; text sized for its smallest box', () => {
    const src = readSource('src/components/research/AucLabel.astro');
    expect(src).toMatch(/\.auc-label__svg--strip \{ display: none; \}/);
    expect(src).toMatch(/@media \(min-width: 734px\) \{\s*\.auc-label__svg--card \{ display: none; \}\s*\.auc-label__svg--strip \{ display: block; \}/);
    expect(src).toMatch(/const card: Layout = \{ w: 300, h: 132,[^}]*font: 15\.5/);
    expect(src).toMatch(/const strip: Layout = \{ w: 480, h: 112,[^}]*font: 14,/);
  });

  it('ProjectCartridge draws it as the label of a chart card, with no image', async () => {
    const html = await renderAstro(ProjectCartridge, {
      props: { href: '/research/cog-2026-engagement/', title: 'CoG', meta: 'm', tagKeys: [], tags: [], wide: true, chart: { kind: 'auc-overall', lang: 'ko' }, sticker: { text: 'ORAL', sr: '구두 발표', kind: 'oral' } },
    });
    expect(html).toMatch(/<div class="cart__chart cart__chart--stickered"/);
    expect(html).toContain('auc-label');
    expect(html).not.toMatch(/<img\b/);
    expect(html).not.toContain('cart__label--text');
  });
});
