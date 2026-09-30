import { describe, expect, it } from 'vitest';
import NeutralHeader from '../../src/components/neutral/NeutralHeader.astro';
import { renderAstro } from './helpers';

describe('NeutralHeader.astro (P2-11)', () => {
  it('the name to the chooser and the language switch, with the CA-24 hooks', async () => {
    const ko = await renderAstro(NeutralHeader, { props: { lang: 'ko', altLangHref: '/en/privacy/' }, url: '/privacy/' });
    expect(ko).toMatch(/<header class="nt-header"/);
    expect(ko).toMatch(/<div class="container nt-header__bar"/); // P2-11: the page container (P1-10's bar had its own width)
    expect(ko).toMatch(/<a class="nt-header__brand" href="\/" data-nt-brand[^>]*>백성은<\/a>/);
    expect(ko).toMatch(/<p class="nt-header__lang"[^>]*><a href="\/en\/privacy\/" hreflang="en" lang="en" data-nt-lang[^>]*>English<\/a><\/p>/);
    const en = await renderAstro(NeutralHeader, { props: { lang: 'en', altLangHref: '/privacy/' }, url: '/en/privacy/' });
    expect(en).toMatch(/<a class="nt-header__brand" href="\/en\/" data-nt-brand[^>]*>Seongeun Baek<\/a>/);
  });

  it('brand false (the chooser) leaves the language switch alone; no twin, no switch', async () => {
    const chooser = await renderAstro(NeutralHeader, { props: { lang: 'ko', altLangHref: '/en/', brand: false }, url: '/' });
    expect(chooser).not.toContain('nt-header__brand');
    expect(chooser).toMatch(/hreflang="en"/);
    const alone = await renderAstro(NeutralHeader, { props: { lang: 'ko', altLangHref: null }, url: '/' });
    expect(alone).not.toContain('hreflang');
  });
});
