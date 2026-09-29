import { afterEach, describe, expect, it } from 'vitest';
import { ui } from '../../src/i18n/ui';
import { EN_404_SCRIPT } from '../../src/lib/en-404';

const SKELETON = `
  <a class="skip-link" href="#main">본문으로 건너뛰기</a>
  <a class="nt-header__brand" href="/" data-nt-brand>백성은</a>
  <a href="/en/" hreflang="en" lang="en" data-nt-lang>English</a>
  <h1 data-nf-title>페이지를 찾을 수 없습니다.</h1><p data-nf-message>…</p>
  <a href="/game/" data-nf-home="game">게임 버전 홈</a><a href="/data/" data-nf-home="data">일반 버전 홈</a>
  <nav class="nt-footer__nav" aria-label="사이트 정보">
    <a href="/stats/" data-nt-footer-link="stats">방문 통계</a><a href="/privacy/" data-nt-footer-link="privacy">개인정보 처리방침</a>
    <a href="/credits/" data-nt-footer-link="credits">출처·고지</a><a href="/?choose" data-nt-footer-link="chooser">선택 화면으로</a>
  </nav>
  <p class="nt-footer__copy" data-year="2026">© 2026 백성은</p>`;

afterEach(() => {
  document.body.innerHTML = '';
  document.documentElement.lang = '';
  window.history.replaceState(null, '', '/');
});

describe('EN_404_SCRIPT (§7: built from ui.en and the link builders)', () => {
  it('is a self-contained classic script', () => {
    expect(EN_404_SCRIPT).not.toMatch(/\b(import|export|require)\b/);
    expect(EN_404_SCRIPT.trim().startsWith('(function')).toBe(true);
  });

  for (const path of ['/en/zzz-missing/', '/en/game/zzz/', '/en/data/zzz/']) {
    it(`${path}: English texts, English version homes, the switch back to Korean`, () => {
      document.body.innerHTML = SKELETON;
      window.history.replaceState(null, '', path);
      new Function(EN_404_SCRIPT)();
      const $ = (s: string) => document.querySelector(s) as HTMLElement;
      expect(document.documentElement.lang).toBe('en');
      expect(document.title).toBe('Page not found · Seongeun Baek');
      expect($('.skip-link').textContent).toBe(ui.en['site.skipToContent']);
      expect($('[data-nf-title]').textContent).toBe(ui.en['404.title']);
      expect($('[data-nf-message]').textContent).toBe(ui.en['404.message']);
      expect($('[data-nf-home="game"]').getAttribute('href')).toBe('/en/game/');
      expect($('[data-nf-home="game"]').textContent).toBe(ui.en['404.gameHome']);
      expect($('[data-nf-home="data"]').getAttribute('href')).toBe('/en/data/');
      expect($('[data-nf-home="data"]').textContent).toBe(ui.en['404.dataHome']);
      expect($('[data-nt-brand]').getAttribute('href')).toBe('/en/');
      expect($('[data-nt-brand]').textContent).toBe('Seongeun Baek');
      const lang = $('[data-nt-lang]');
      expect([lang.getAttribute('href'), lang.getAttribute('hreflang'), lang.getAttribute('lang'), lang.textContent]).toEqual(['/', 'ko', 'ko', '한국어']);
      expect($('.nt-footer__nav').getAttribute('aria-label')).toBe(ui.en['footer.siteInfo']);
      expect([...document.querySelectorAll('[data-nt-footer-link]')].map((a) => [a.getAttribute('href'), a.textContent])).toEqual([
        ['/en/stats/', ui.en['nav.stats']], ['/en/privacy/', ui.en['nav.privacy']], ['/en/credits/', ui.en['nav.credits']], ['/en/?choose', ui.en['nav.chooser']],
      ]);
      expect($('.nt-footer__copy').textContent).toBe('© 2026 Seongeun Baek');
    });
  }

  it('leaves a Korean-path 404 alone', () => {
    document.body.innerHTML = SKELETON;
    window.history.replaceState(null, '', '/data/zzz/');
    new Function(EN_404_SCRIPT)();
    expect((document.querySelector('[data-nf-title]') as HTMLElement).textContent).toBe('페이지를 찾을 수 없습니다.');
    expect((document.querySelector('[data-nf-home="game"]') as HTMLElement).getAttribute('href')).toBe('/game/');
  });
});
