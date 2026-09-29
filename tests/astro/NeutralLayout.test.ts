import { describe, expect, it } from 'vitest';
import NeutralFooter from '../../src/components/neutral/NeutralFooter.astro';
import NeutralLayout from '../../src/layouts/NeutralLayout.astro';
import { HEAD_INIT_SCRIPT } from '../../src/lib/head-init';
import { renderAstro } from './helpers';

const render = (props: Record<string, unknown> = {}, url = '/privacy/') =>
  renderAstro(NeutralLayout, {
    props: { lang: 'ko', title: '개인정보 처리방침 · 백성은', description: '이 사이트가 모으는 정보.', page: 'privacy', ...props },
    slots: { default: '<h1>본문</h1>' },
    url,
  });

describe('NeutralLayout (§7, contract §4.1)', () => {
  it('html is neutral; the head starts with charset and the motion init; only the sans face is preloaded', async () => {
    const html = await render();
    const root = html.match(/<html[^>]*>/)?.[0] ?? '';
    expect(root).toContain('data-variant="neutral"');
    expect(root).toContain('data-page="privacy"');
    expect(root).toContain('lang="ko"');
    const head = html.match(/<head[^>]*>([\s\S]*?)<\/head>/)?.[1] ?? '';
    expect(head).toMatch(/^\s*<meta charset="utf-8"\s*\/?>\s*<script>/);
    expect(head).toContain(HEAD_INIT_SCRIPT.trim().slice(0, 24));
    expect(head).toMatch(/<link rel="preload" href="\/_fonts\/sb-sans\.woff2" as="font" type="font\/woff2" crossorigin/);
    expect(head).not.toContain('jetbrains-mono');
    expect(head).toContain('<meta property="og:site_name" content="백성은"');
    expect(head).toContain('<link rel="canonical" href="https://lunecid.github.io/privacy/"');
    expect([...head.matchAll(/<link rel="alternate" hreflang="([^"]+)"/g)].map((m) => m[1])).toEqual(['ko', 'en', 'x-default']);
  });

  it('no game module and no HUD chrome', async () => {
    const html = await render();
    for (const needle of ['hud-nav', 'class="crt"', 'astro-island', 'AchievementHost', 'class="bgm"', 'site-footer', 'data-sfx']) expect(html, needle).not.toContain(needle);
  });

  it('header: the brand and the language switch; footer: shared pages and the chooser link (/?choose)', async () => {
    const ko = await render();
    expect(ko).toMatch(/<a[^>]*class="nt-header__brand"[^>]*href="\/"[^>]*data-nt-brand/);
    expect(ko).toMatch(/<a href="\/en\/privacy\/" hreflang="en" lang="en" data-nt-lang[^>]*>English<\/a>/);
    const links = [...ko.matchAll(/<a href="([^"]+)" data-nt-footer-link="([^"]+)"[^>]*>([^<]+)<\/a>/g)].map((m) => [m[2], m[1], m[3]]);
    expect(links).toEqual([
      ['stats', '/stats/', '방문 통계'], ['privacy', '/privacy/', '개인정보 처리방침'], ['credits', '/credits/', '출처·고지'], ['chooser', '/?choose', '선택 화면으로'],
    ]);
    expect(ko).toMatch(/<nav class="nt-footer__nav" aria-label="사이트 정보"/);
    expect(ko).toMatch(/<p class="nt-footer__copy" data-year="\d{4}"[^>]*>© \d{4} 백성은<\/p>/);
    const en = await render({ lang: 'en', title: 'Privacy Policy · Seongeun Baek' }, '/en/privacy/');
    expect(en).toMatch(/<a href="\/privacy\/" hreflang="ko" lang="ko" data-nt-lang[^>]*>한국어<\/a>/);
    expect(en).toContain('href="/en/?choose"');
    expect(en).toContain('Choose a portfolio');
    expect(en).toMatch(/<a[^>]*class="nt-header__brand"[^>]*href="\/en\/"/);
  });

  it('noindex drops canonical and hreflang links but keeps a header language switch when one is given', async () => {
    const html = await render({ noindex: true, page: 'not-found', altLangHref: '/en/' }, '/404/');
    expect(html).toContain('<meta name="robots" content="noindex"');
    expect(html).not.toContain('rel="canonical"');
    expect(html).not.toMatch(/<link rel="alternate"/);
    expect(html).toMatch(/<a href="\/en\/" hreflang="en" lang="en" data-nt-lang/);
    const none = await render({ altLangHref: null });
    expect(none).not.toContain('data-nt-lang');
  });
});

describe('NeutralFooter — P-04 contact row (not on the 404, R-1, decision 19)', () => {
  it('shows the contact row on shared pages and marks the current footer link', async () => {
    const stats = await renderAstro(NeutralFooter, { props: { lang: 'ko' }, url: '/stats/' });
    expect(stats).toMatch(/<ul class="nt-footer__contact"[\s\S]*mailto:[\s\S]*href="https:\/\/github\.com\/Lunecid"/);
    expect(stats).toMatch(/data-nt-footer-link="stats" aria-current="page"/);
  });
  it('has no contact row on the 404', async () => {
    const nf = await renderAstro(NeutralFooter, { props: { lang: 'ko', contact: false }, url: '/404.html' });
    expect(nf).not.toContain('mailto:');
  });
});
