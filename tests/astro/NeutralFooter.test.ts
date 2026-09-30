import { describe, expect, it } from 'vitest';
import NeutralFooter from '../../src/components/neutral/NeutralFooter.astro';
import { renderAstro } from './helpers';

const hrefs = (html: string): string[] =>
  [...(html.match(/<ul class="nt-footer__links"[\s\S]*?<\/ul>/)?.[0] ?? '').matchAll(/href="([^"]+)"/g)].map((m) => m[1] ?? '');

describe('NeutralFooter.astro (P2-11)', () => {
  it('the shared pages (CA-21 order) and the chooser link in the page language, with the CA-24 hooks; no motion toggle', async () => {
    const ko = await renderAstro(NeutralFooter, { props: { lang: 'ko' }, url: '/privacy/' });
    expect(ko).toMatch(/<div class="container nt-footer__inner"/); // P2-11: the page container
    expect(hrefs(ko)).toEqual(['/stats/', '/privacy/', '/credits/', '/?choose']);
    expect([...ko.matchAll(/data-nt-footer-link="([^"]+)"/g)].map((m) => m[1])).toEqual(['stats', 'privacy', 'credits', 'chooser']);
    expect(ko).toMatch(/<nav class="nt-footer__nav" aria-label="사이트 정보"/);
    expect(ko).toMatch(/<p class="nt-footer__copy" data-year="\d{4}"[^>]*>© \d{4} 백성은<\/p>/);
    expect(ko).not.toContain('data-motion-toggle');
    const en = await renderAstro(NeutralFooter, { props: { lang: 'en' }, url: '/en/privacy/' });
    expect(hrefs(en)).toEqual(['/en/stats/', '/en/privacy/', '/en/credits/', '/en/?choose']);
  });

  it('keeps P-04 (Task 1): the contact row, aria-current on the current link, and no contact row on the 404', async () => {
    const ko = await renderAstro(NeutralFooter, { props: { lang: 'ko' }, url: '/privacy/' });
    expect(ko).toMatch(/<ul class="nt-footer__contact"[\s\S]*mailto:/);
    const stats = await renderAstro(NeutralFooter, { props: { lang: 'ko' }, url: '/stats/' });
    expect(stats).toMatch(/data-nt-footer-link="stats" aria-current="page"/);
    const nf = await renderAstro(NeutralFooter, { props: { lang: 'ko', contact: false }, url: '/404.html' });
    expect(nf).not.toContain('mailto:');
  });
});
