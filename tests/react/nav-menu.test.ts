import { beforeEach, describe, expect, it } from 'vitest';
import { initLangHashSync, initNavMenus } from '../../src/scripts/nav-menu';

function mount(): void {
  document.documentElement.className = '';
  document.body.innerHTML = `
    <header data-test-nav data-open="false">
      <div>
        <a class="brand" href="/data/">brand</a>
        <nav id="test-menu"><a href="/data/research/">A</a><a href="/data/projects/">B</a>
          <p class="lang"><a href="/en/data/" hreflang="en">English</a></p></nav>
        <div><button type="button" aria-expanded="false" aria-controls="test-menu" data-nav-toggle data-label-closed="메뉴" data-label-open="닫기 ×">메뉴</button></div>
      </div>
      <div data-nav-scrim></div>
    </header>
    <p id="outside">outside</p>`;
}
const button = (): HTMLButtonElement => document.querySelector('[data-nav-toggle]')!;
const nav = (): HTMLElement => document.querySelector('[data-test-nav]')!;

describe('initNavMenus (P2-2: extracted from HudNav, shared with DataNav)', () => {
  beforeEach(() => {
    mount();
    initNavMenus('[data-test-nav]');
  });

  it('opens and closes from the toggle, with the open label, aria-expanded and the scroll lock', () => {
    button().click();
    expect(nav().dataset.open).toBe('true');
    expect(button().getAttribute('aria-expanded')).toBe('true');
    // G-017/N01 (site-v1 29c19b8): a fixed-width "×" plus a visually hidden 닫기.
    expect(button().querySelector('[aria-hidden="true"]')?.textContent).toBe('×');
    expect(button().querySelector('.sr-only')?.textContent).toBe('닫기');
    expect(button().getAttribute('aria-label')).toBe('닫기');
    expect(document.documentElement.classList.contains('is-scroll-locked')).toBe(true);
    button().click();
    expect(nav().dataset.open).toBe('false');
    expect(button().textContent).toBe('메뉴');
    expect(document.documentElement.classList.contains('is-scroll-locked')).toBe(false);
  });

  it('Escape anywhere closes the open menu and returns focus to the toggle', () => {
    button().click();
    (document.getElementById('outside') as HTMLElement).focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(nav().dataset.open).toBe('false');
    expect(document.activeElement).toBe(button());
  });

  it('traps Tab inside [toggle, …panel links] while open', () => {
    button().click();
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('#test-menu a'));
    links.at(-1)!.focus();
    nav().dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(button());
    button().focus();
    nav().dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
    expect(document.activeElement).toBe(links.at(-1));
  });

  it('closes when a panel link is followed or when the visitor clicks outside', () => {
    button().click();
    const link = document.querySelector<HTMLAnchorElement>('#test-menu a')!;
    link.addEventListener('click', (event) => event.preventDefault()); // jsdom cannot navigate
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(nav().dataset.open).toBe('false');
    button().click();
    document.getElementById('outside')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(nav().dataset.open).toBe('false');
  });
});

describe('initLangHashSync', () => {
  it('appends the current hash to each language link and follows hashchange', () => {
    mount();
    const link = document.querySelector<HTMLAnchorElement>('.lang a')!;
    history.replaceState(null, '', '#job-fit');
    initLangHashSync('[data-test-nav] .lang a[hreflang]');
    expect(link.getAttribute('href')).toBe('/en/data/#job-fit');
    history.replaceState(null, '', '#education');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(link.getAttribute('href')).toBe('/en/data/#education');
  });
});
