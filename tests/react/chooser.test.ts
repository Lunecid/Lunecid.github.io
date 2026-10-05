// The chooser desk's script (MO-24): memory, arrows on both axes (the two files overlap at every width, so the old
// isStacked layout test is gone: its two tests are merged into the arrows test), the slide-aside geometry, the touch
// first-tap reveal, tap-outside and Escape, and the touch hint.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { asideGeometry, initChooser, initDesk } from '../../src/scripts/chooser';

let navigations: string[] = [];
// jsdom would try to navigate: count the default actions instead (bubble phase on the document: after every listener
// on the link has had its say)
document.addEventListener('click', (e) => {
  const a = e.target instanceof Element ? e.target.closest('a') : null;
  if (!a) return;
  if (!e.defaultPrevented) navigations.push(a.getAttribute('href')!);
  e.preventDefault();
});
function mount() {
  document.body.innerHTML = `
    <div class="desk" data-chooser data-desk>
      <article class="file file--data"><div class="face"><a class="cta" href="/data/" data-choose-variant="data">D<span class="cta__hit"></span></a></div></article>
      <article class="file file--game"><div class="face"><a class="cta" href="/game/" data-choose-variant="game">G<span class="cta__hit"></span></a></div></article>
    </div>
    <p class="desk__hint" aria-live="polite" data-rest="REST" data-aside="ASIDE"></p>
    <button id="elsewhere">x</button>`;
  const desk = document.querySelector<HTMLElement>('.desk')!;
  const [data, game] = Array.from(document.querySelectorAll<HTMLAnchorElement>('a'));
  return { desk, hint: document.querySelector<HTMLElement>('.desk__hint')!, game: game!, data: data!, gameFile: desk.querySelector<HTMLElement>('.file--game')!, dataFile: desk.querySelector<HTMLElement>('.file--data')! };
}
const key = (el: Element, k: string, init: KeyboardEventInit = {}): boolean => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }));
const pointerdown = (el: Element, pointerType: string): void => {
  const ev = new MouseEvent('pointerdown', { bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'pointerType', { value: pointerType });
  el.dispatchEvent(ev);
};
const click = (el: Element, detail = 1): boolean => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail }));
const coarse = (on: boolean) => {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({ matches: on && /hover: none|pointer: coarse/.test(q), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
};

describe('chooser desk (MO-24)', () => {
  let m: ReturnType<typeof mount>;
  let cleanup: () => void;
  beforeEach(() => {
    navigations = [];
    localStorage.clear();
    coarse(true);
    m = mount();
    initChooser();
    cleanup = initDesk(m.desk, m.hint);
  });
  afterEach(() => cleanup());

  it('asideGeometry: side-by-side clears the game cover by the gap incl. the turned spill; stacked drops below', () => {
    const game = { x: 0, y: 0, w: 618, h: 593 };
    const sheet = { x: 240, y: 28, w: 600, h: 600 };
    const side = asideGeometry(game, sheet, 3, 6, 24);
    expect(side.side).toBe(true);
    const th = (9 * Math.PI) / 180;
    const spill = (600 / 2) * Math.sin(th) - (600 / 2) * (1 - Math.cos(th));
    expect(side.ax).toBe(Math.round(618 + 24 + spill - 240));
    expect(side.ay).toBe(18);
    expect(side.cx).toBe(Math.round((240 + 600 - 618) / 2));
    // the turned sheet's left edge clears the game cover's right edge
    expect(sheet.x + side.ax - spill).toBeGreaterThanOrEqual(game.x + game.w + 24 - 1);
    const stacked = asideGeometry({ x: 0, y: 0, w: 343, h: 520 }, { x: 10, y: 96, w: 323, h: 460 }, 1.5, 4, 24);
    expect(stacked.side).toBe(false);
    expect(stacked.ax).toBe(12);
    expect(stacked.ay).toBeGreaterThan(520 + 24 - 96);
    expect(stacked.cx).toBe(0);
  });

  it('arrows move between the two links on both axes (data → game forward, game → data back)', () => {
    m.data.focus();
    expect(key(m.data, 'ArrowRight')).toBe(false);
    expect(document.activeElement).toBe(m.game);
    key(m.game, 'ArrowUp');
    expect(document.activeElement).toBe(m.data);
    key(m.data, 'ArrowDown');
    expect(document.activeElement).toBe(m.game);
    key(m.game, 'ArrowLeft');
    expect(document.activeElement).toBe(m.data);
    expect(key(m.data, 'ArrowRight', { shiftKey: true })).toBe(true); // modified: left to the browser
  });

  it('a choice is remembered before the navigation', () => {
    click(m.data);
    expect(localStorage.getItem('sb:variant')).toBe('data');
    click(m.game, 0);
    expect(localStorage.getItem('sb:variant')).toBe('game');
  });

  it('touch: first tap on the game link reveals without navigating; the second activates', () => {
    pointerdown(m.gameFile, 'touch');
    click(m.game);
    expect(m.desk.classList.contains('is-aside')).toBe(true);
    expect(navigations).toEqual([]);
    expect(localStorage.getItem('sb:variant')).toBeNull(); // a reveal is not a choice
    pointerdown(m.gameFile, 'touch');
    click(m.game);
    expect(navigations).toEqual(['/game/']);
  });

  it('touch: a tap outside or on the aside sheet puts it back and does not navigate', () => {
    pointerdown(m.gameFile, 'touch');
    click(m.game);
    expect(m.desk.classList.contains('is-aside')).toBe(true);
    click(document.getElementById('elsewhere')!);
    expect(m.desk.classList.contains('is-aside')).toBe(false);
    pointerdown(m.gameFile, 'touch');
    click(m.game);
    expect(m.desk.classList.contains('is-aside')).toBe(true);
    pointerdown(m.dataFile, 'touch');
    click(m.data);
    expect(m.desk.classList.contains('is-aside')).toBe(false);
    expect(navigations).toEqual([]);
  });

  it('Escape puts it back', () => {
    pointerdown(m.gameFile, 'touch');
    click(m.game);
    key(document.body, 'Escape');
    expect(m.desk.classList.contains('is-aside')).toBe(false);
    expect(m.hint.textContent).toBe('REST');
  });

  it('keyboard Enter and a click without a touch pointerdown never take the first-tap path', () => {
    click(m.game, 0); // keyboard / AT activation
    expect(navigations).toEqual(['/game/']);
    pointerdown(m.gameFile, 'mouse');
    click(m.game);
    expect(navigations).toEqual(['/game/', '/game/']);
    click(m.game); // synthetic, no pointerdown at all
    expect(navigations).toHaveLength(3);
    // a touch pointerdown on the other file does not arm the game link
    pointerdown(m.dataFile, 'touch');
    click(m.game);
    expect(navigations).toHaveLength(4);
    expect(m.desk.classList.contains('is-aside')).toBe(false);
  });

  it('a stale touch pointerdown (over 600 ms) does not arm the first tap', () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(1000);
    try {
      pointerdown(m.gameFile, 'touch');
      now.mockReturnValue(1700);
      click(m.game);
      expect(navigations).toEqual(['/game/']);
    } finally {
      now.mockRestore();
    }
  });

  it('the hint swaps text with the state and stays empty on hover-capable pointers', () => {
    expect(m.hint.textContent).toBe('REST');
    expect(m.hint.hasAttribute('tabindex')).toBe(false);
    pointerdown(m.gameFile, 'touch');
    click(m.game);
    expect(m.hint.textContent).toBe('ASIDE');
    cleanup();
    coarse(false);
    m = mount();
    cleanup = initDesk(m.desk, m.hint);
    expect(m.hint.textContent).toBe('');
  });

  it('measures the aside offsets on the desk from the outer file boxes', () => {
    const geo = (el: HTMLElement, x: number, y: number, w: number, h: number) => {
      Object.defineProperties(el, { offsetLeft: { value: x, configurable: true }, offsetTop: { value: y, configurable: true }, offsetWidth: { value: w, configurable: true }, offsetHeight: { value: h, configurable: true } });
    };
    cleanup();
    m = mount();
    geo(m.gameFile, 0, 0, 618, 593);
    geo(m.dataFile, 240, 28, 600, 600);
    m.desk.style.setProperty('--tilt', '3deg');
    m.desk.style.setProperty('--arot', '6deg');
    cleanup = initDesk(m.desk, m.hint);
    const want = asideGeometry({ x: 0, y: 0, w: 618, h: 593 }, { x: 240, y: 28, w: 600, h: 600 }, 3, 6);
    expect(m.desk.style.getPropertyValue('--ax')).toBe(`${want.ax}px`);
    expect(m.desk.style.getPropertyValue('--ay')).toBe(`${want.ay}px`);
    expect(m.desk.style.getPropertyValue('--cx')).toBe(`${want.cx}px`);
  });
});
