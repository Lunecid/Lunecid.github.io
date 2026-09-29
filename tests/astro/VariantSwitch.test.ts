import { describe, expect, it } from 'vitest';
import VariantSwitch from '../../src/components/common/VariantSwitch.astro';
import { readSource, renderAstro } from './helpers';

const tag = (html: string) => html.match(/<a[^>]*class="variant-switch[^"]*"[^>]*>/)?.[0] ?? '';

describe('VariantSwitch (§5.5)', () => {
  it('same page in the other version when it exists, with the full label as name and title', async () => {
    const html = await renderAstro(VariantSwitch, { props: { lang: 'ko', variant: 'game', base: '/records/', placement: 'bar' } });
    const a = tag(html);
    expect(a).toContain('href="/data/records/"');
    expect(a).toContain('data-switch-variant="data"');
    expect(a).toContain('data-same-page="true"');
    expect(a).toContain('data-base-href="/data/records/"');
    expect(a).toContain('aria-label="일반 버전으로 보기"');
    expect(a).toContain('title="일반 버전으로 보기"');
    expect(a).toContain('variant-switch--bar');
    expect(html).toMatch(/<span class="variant-switch__short" aria-hidden="true"[^>]*>일반<\/span><span class="variant-switch__full"[^>]*>일반 버전으로 보기<\/span>/);
  });

  it('falls back to the other version home when the page does not exist there; English labels', async () => {
    const html = await renderAstro(VariantSwitch, { props: { lang: 'en', variant: 'game', base: '/player-log/', placement: 'panel' } });
    expect(tag(html)).toContain('href="/en/data/"');
    expect(tag(html)).toContain('data-same-page="false"');
    expect(tag(html)).toContain('aria-label="View general version"');
    const back = await renderAstro(VariantSwitch, { props: { lang: 'en', variant: 'data', base: '/', placement: 'bar' } });
    expect(tag(back)).toContain('href="/en/game/"');
    expect(tag(back)).toContain('aria-label="View game version"');
  });

  it('placement CSS: the bar copy only from 734px, the panel copy only below; the short label only at 734–1067px', () => {
    const src = readSource('src/components/common/VariantSwitch.astro');
    expect(src).toMatch(/@media \(max-width: 733\.98px\) \{\s*\.variant-switch--bar \{ display: none; \}/);
    expect(src).toMatch(/@media \(min-width: 734px\) \{\s*\.variant-switch--panel \{ display: none; \}/);
    expect(src).toMatch(/@media \(min-width: 734px\) and \(max-width: 1067\.98px\) \{[\s\S]*?\.variant-switch--bar \.variant-switch__short \{ display: inline; \}/);
    expect(src).toMatch(/min-height: var\(--tap\)/);
  });
});
