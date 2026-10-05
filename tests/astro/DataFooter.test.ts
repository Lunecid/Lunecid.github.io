import { describe, expect, it } from 'vitest';
import DataFooter from '../../src/components/data/DataFooter.astro';
import { t } from '../../src/i18n/utils';
import { renderAstro } from './helpers';

// 2026-09-25 16:30 UTC = 2026-09-26 01:30 in Asia/Seoul
const builtAt = new Date('2026-09-25T16:30:00Z');
const hrefs = (html: string): string[] => {
  const list = html.match(/<ul class="data-footer__links"[\s\S]*?<\/ul>/)?.[0] ?? '';
  return [...list.matchAll(/href="([^"]+)"/g)].map((m) => m[1] ?? '');
};

describe('DataFooter.astro (P2-1)', () => {
  it('links the shared pages (SHARED_NAV order, as SiteFooter and NeutralFooter) and the chooser (?choose) in the page language', async () => {
    const ko = await renderAstro(DataFooter, { props: { lang: 'ko', notices: [], builtAt }, url: '/data/' });
    expect(hrefs(ko)).toEqual(['/stats/', '/privacy/', '/credits/', '/?choose']);
    for (const key of ['nav.stats', 'nav.privacy', 'nav.credits', 'nav.chooser'] as const) expect(ko).toContain(t('ko', key));
    expect(ko).toMatch(/<nav[^>]*aria-label="사이트 정보"/);
    const en = await renderAstro(DataFooter, { props: { lang: 'en', notices: [], builtAt }, url: '/en/data/' });
    expect(hrefs(en)).toEqual(['/en/stats/', '/en/privacy/', '/en/credits/', '/en/?choose']);
  });

  it('shows the build date in Asia/Seoul and the copyright year', async () => {
    const ko = await renderAstro(DataFooter, { props: { lang: 'ko', notices: [], builtAt } });
    expect(ko).toMatch(/마지막 업데이트\s*<time datetime="2026-09-26"[^>]*>2026\.09\.26<\/time>/);
    expect(ko).toContain('© 2026 백성은');
  });

  it('keeps the motion toggle (constant label, aria-pressed false, hidden OS note)', async () => {
    const ko = await renderAstro(DataFooter, { props: { lang: 'ko', notices: [], builtAt } });
    const button = ko.match(/<button[^>]*data-motion-toggle[^>]*>/)?.[0] ?? '';
    expect(button).toContain('type="button"');
    expect(button).toContain('aria-pressed="false"');
    expect(ko).toMatch(/<p id="motion-os-note"[^>]*hidden/);
  });

  it('renders a notice only when given, and no HUD class', async () => {
    const plain = await renderAstro(DataFooter, { props: { lang: 'ko', notices: [], builtAt } });
    expect(plain).not.toContain('data-footer__notice');
    expect(plain).not.toMatch(/class="[^"]*\b(site-footer|container--hud|cut|hud-[a-z-]+)\b/);
    const riot = await renderAstro(DataFooter, { props: { lang: 'ko', notices: ['riot'], builtAt } });
    expect(riot).toMatch(/<p class="data-footer__notice" lang="en"[^>]*>/);
  });

  it('DS-3: folio, painted sign-off (aria-hidden), contact, motion switch, shared links, update line — same order and texts as before', async () => {
    const ko = await renderAstro(DataFooter, { props: { lang: 'ko', notices: [], builtAt }, url: '/data/' });
    expect(ko).toMatch(/<div class="container data-footer__inner"[^>]*>\s*<div class="ed-folio" aria-hidden="true"/);
    expect(ko).toMatch(/<p class="data-footer__copy"[^>]*><span class="ed-mc ed-mc--fmark" aria-hidden="true"[^>]*>(<i class="ed-mc__[rby]"[^>]*><\/i>){3}<\/span>© 2026 백성은<\/p>/);
    const order = ['ed-folio', 'data-footer__copy', 'data-footer__contact', 'data-footer__links', 'data-footer__updated', 'data-footer__motion"', 'motion-os-note', 'data-footer__canonical'].map((c) => ko.indexOf(c));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    const text = ko.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
    for (const s of ['© 2026 백성은', '방문 통계', '개인정보 처리방침', '출처·고지', '선택 화면으로', '마지막 업데이트 2026.09.26', '모션 줄이기 OFF']) expect(text).toContain(s);
    expect(ko).not.toMatch(/var\(--ed-accent\)/);
  });

  it('P-04: a contact row (mailto + GitHub profile) outside the links list, and aria-current on the current footer link', async () => {
    const ko = await renderAstro(DataFooter, { props: { lang: 'ko', notices: [], builtAt }, url: '/data/' });
    expect(hrefs(ko)).toEqual(['/stats/', '/privacy/', '/credits/', '/?choose']);
    expect(ko).toMatch(/<ul class="data-footer__contact"[\s\S]*href="mailto:[^"]+"[\s\S]*href="https:\/\/github\.com\/Lunecid"/);
    expect(ko).not.toContain('aria-current');
    const stats = await renderAstro(DataFooter, { props: { lang: 'ko', notices: [], builtAt }, url: '/stats/' });
    expect(stats).toMatch(/<a href="\/stats\/" aria-current="page"/);
  });
});
