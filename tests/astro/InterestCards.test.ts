import { describe, expect, it } from 'vitest';
import InterestCards from '../../src/components/research/InterestCards.astro';
import { researchPage } from '../../src/data/research-page';
import { figureCopy } from '../../src/data/research/cog-2026';
import { resolveLocalizedDeep } from '../../src/lib/facts';
import { loadFactSource } from '../helpers/fact-source';
import { readSource, renderAstro } from './helpers';

describe('InterestCards.astro (P1-9: indexed light-HUD rows, one real figure each)', () => {
  it('section#interests: the section head and three indexed rows, no rounded cards', async () => {
    const ko = await renderAstro(InterestCards, { props: { variant: 'game', lang: 'ko', interests: resolveLocalizedDeep(researchPage.interests, loadFactSource()) } });
    expect(ko).toMatch(/<section(?=[^>]*\bid="interests")[^>]*>/);
    expect(ko).toMatch(/<h2[^>]*>연구 관심사<\/h2>/);
    expect(ko).toContain('INTERESTS');
    expect(ko.match(/class="interests__row lh-row"/g)).toHaveLength(3);
    for (const item of researchPage.interests) {
      expect(ko).toContain(item.title.ko);
      expect(ko).toContain(item.body.ko);
    }
    const idx = [...ko.matchAll(/<span class="lh-idx" aria-hidden="true"[^>]*>(\d{2})<\/span>/g)].map((m) => m[1]);
    expect(idx).toEqual(['01', '02', '03']);

    const en = await renderAstro(InterestCards, { props: { variant: 'game', lang: 'en', interests: resolveLocalizedDeep(researchPage.interests, loadFactSource()) } });
    expect(en).toMatch(/<h2[^>]*>Research interests<\/h2>/);
    for (const item of researchPage.interests) expect(en).toContain(item.title.en);
    expect(en).not.toContain(researchPage.interests[0].title.ko);
    expect(readSource('src/components/research/InterestCards.astro')).not.toMatch(/border-radius/);
  });

  it('each row carries one real figure: the kill-gap KDE, the paper Fig. 1 and the AUC chart; never the telemetry JSON', async () => {
    const html = await renderAstro(InterestCards, { props: { variant: 'game', lang: 'ko', interests: resolveLocalizedDeep(researchPage.interests, loadFactSource()) } });
    const rows = html.split(/<li\b/).slice(1);
    const row = (id: string) => rows.find((chunk) => chunk.includes(`data-interest="${id}"`)) ?? '';
    expect(row('logs')).toMatch(/<img[^>]*kill-gap-kde[^>]*>/);
    expect(row('logs')).toContain(figureCopy.killGap.alt.ko);
    expect(row('logs')).toContain('FIG</span> · KILL-GAP KDE');
    expect(row('graphs')).toMatch(/<img[^>]*label-horizon[^>]*>/);
    expect(row('graphs')).toContain(figureCopy.labelHorizon.alt.ko);
    expect(row('readable')).toMatch(/class="chart chart--overall"/);
    expect(row('readable')).toContain('id="interests-auc-title-wide"');
    expect(row('readable')).toContain(figureCopy.aucOverall.alt.ko);
    for (const id of ['logs', 'graphs', 'readable']) expect(row(id), id).toMatch(/class="interests__fig[^"]*bracket bracket--sm"/);
    expect(html).not.toMatch(/telemetry|participantFrames/);
    // "크게 보기" links go to the full-size WebP of the two image figures and act as ImageViewer triggers
    expect(html.match(/class="interests__full"/g)).toHaveLength(2);
    expect(html.match(/data-viewer="figures"/g)).toHaveLength(2);
  });

  it('F-066/F-081: phone chart caption inset and a 400-wide ladder step', () => {
    const src = readSource('src/components/research/InterestCards.astro');
    expect(src).toMatch(/@media \(max-width: 733\.98px\) \{[\s\S]*?\.chart__caption[\s\S]*?padding-inline:\s*12px/);
    expect(src).toMatch(/fitWidths\(\[360,\s*400,\s*540,\s*720\]/);
  });
});
