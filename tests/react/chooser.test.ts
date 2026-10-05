// The chooser desk's script (MO-24): memory, arrows on both axes (the two files overlap at every width, so the old
// isStacked layout test is gone: its two tests are merged into the arrows test), the slide-aside geometry, the touch
// first-tap reveal, tap-outside and Escape, and the touch hint.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { EXIT_MS, asideGeometry, attachExitSheet, initChooser, initDesk } from '../../src/scripts/chooser';

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
      <article class="file file--game"><div class="dev"><div class="dev__body"><div class="dev__screen"><div class="face"><span class="stamp" aria-hidden="true">S</span><a class="cta" href="/game/" data-choose-variant="game">G<span class="cta__hit"></span></a></div></div></div></div></article>
    </div>
    <p class="desk__hint" aria-live="polite" data-rest="REST" data-aside="ASIDE"></p>
    <div class="xnav" aria-hidden="true"><i class="xnav__bg"></i><i class="xnav__ln"></i></div>
    <button id="elsewhere">x</button>`;
  const desk = document.querySelector<HTMLElement>('.desk')!;
  const [data, game] = Array.from(document.querySelectorAll<HTMLAnchorElement>('a'));
  return { desk, hint: document.querySelector<HTMLElement>('.desk__hint')!, game: game!, data: data!, gameFile: desk.querySelector<HTMLElement>('.file--game')!, dataFile: desk.querySelector<HTMLElement>('.file--data')!, stamp: desk.querySelector<HTMLElement>('.stamp')! };
}
const key = (el: Element, k: string, init: KeyboardEventInit = {}): boolean => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }));
const pointerdown = (el: Element, pointerType: string, init: MouseEventInit = {}): void => {
  const ev = new MouseEvent('pointerdown', { bubbles: true, cancelable: true, ...init });
  Object.defineProperty(ev, 'pointerType', { value: pointerType });
  el.dispatchEvent(ev);
};
const click = (el: Element, detail = 1, init: MouseEventInit = {}): boolean => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail, ...init }));
/** Game-link activations go through the exit (MO-38): let it run out, then come back to the page as the back/forward
 *  cache would restore it (jsdom never leaves the page, so the desk would stay in its leaving state). */
const settle = () => {
  vi.advanceTimersByTime(EXIT_MS.game + 10);
  const ev = new Event('pageshow') as Event & { persisted: boolean };
  Object.defineProperty(ev, 'persisted', { value: true });
  window.dispatchEvent(ev);
};
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
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    m = mount();
    initChooser(document, { navigate: (href) => navigations.push(href) });
    cleanup = initDesk(m.desk, m.hint);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

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

  // MO-39 (named change): the printout's link now plays its page turn before the navigation too
  it('a choice is remembered before the navigation', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      click(m.data);
      expect(localStorage.getItem('sb:variant')).toBe('data');
      expect(navigations).toEqual([]); // the page turns first
      settle();
      click(m.game, 0);
      expect(localStorage.getItem('sb:variant')).toBe('game'); // before the delayed navigation
      vi.advanceTimersByTime(EXIT_MS.game);
      expect(navigations).toEqual(['/data/', '/game/']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('touch: first tap on the game link reveals without navigating; the second activates', () => {
    pointerdown(m.gameFile, 'touch');
    click(m.game);
    expect(m.desk.classList.contains('is-aside')).toBe(true);
    expect(navigations).toEqual([]);
    expect(localStorage.getItem('sb:variant')).toBeNull(); // a reveal is not a choice
    pointerdown(m.gameFile, 'touch');
    click(m.game);
    settle();
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
    settle();
    expect(navigations).toEqual(['/game/']);
    pointerdown(m.gameFile, 'mouse');
    click(m.game);
    settle();
    expect(navigations).toEqual(['/game/', '/game/']);
    click(m.game); // synthetic, no pointerdown at all
    settle();
    expect(navigations).toHaveLength(3);
    // a touch pointerdown on the other file does not arm the game link
    pointerdown(m.dataFile, 'touch');
    click(m.game);
    settle();
    expect(navigations).toHaveLength(4);
    expect(m.desk.classList.contains('is-aside')).toBe(false);
  });

  it('a stale touch pointerdown (over 600 ms) does not arm the first tap', () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(1000);
    try {
      pointerdown(m.gameFile, 'touch');
      now.mockReturnValue(1700);
      click(m.game);
      settle();
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

  it('measures the aside offsets on the desk from the device body and the sheet boxes (MO-34, named: was the outer file boxes)', () => {
    const geo = (el: HTMLElement, x: number, y: number, w: number, h: number) => {
      Object.defineProperties(el, { offsetLeft: { value: x, configurable: true }, offsetTop: { value: y, configurable: true }, offsetWidth: { value: w, configurable: true }, offsetHeight: { value: h, configurable: true } });
    };
    cleanup();
    m = mount();
    geo(m.gameFile.querySelector<HTMLElement>('.dev__body')!, 0, 0, 618, 593); // MO-34: the device body is measured
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

describe('the tablet (MO-34)', () => {
  it('MO-34: asideGeometry clears the device body (bezel included) by the gap', () => {
    // v6.12 boxes inside the desk (owner-assets/chooser-v6.12, measured from the prototype): the prototype's own
    // measure() put the sheet at --ax 457px (1280×800) and --ay 496px (375×812)
    const wide = asideGeometry({ x: 109.9, y: 0, w: 785.2, h: 621.9 }, { x: 502.5, y: 42.2, w: 555.7, h: 555.7 }, 3, 6);
    expect(wide.side).toBe(true);
    expect(wide.ax).toBe(457);
    const narrow = asideGeometry({ x: 0, y: 0, w: 343, h: 574 }, { x: 10, y: 116, w: 323, h: 454.8 }, 1.5, 4);
    expect(narrow.side).toBe(false);
    expect(narrow.ay).toBe(496);
    // the turned sheet's left corner clears the body's right edge (the bezel) by the gap
    const th = (9 * Math.PI) / 180;
    const leftCorner = 502.5 + wide.ax + 555.7 / 2 - (555.7 / 2) * Math.cos(th) - (555.7 / 2) * Math.sin(th);
    expect(leftCorner - (109.9 + 785.2)).toBeGreaterThanOrEqual(23.5);
  });

  it('MO-34: initDesk measures the device body inside the desk, not the article', () => {
    const m = mount();
    const set = (el: HTMLElement, x: number, y: number, w: number, h: number) =>
      Object.defineProperties(el, { offsetLeft: { value: x, configurable: true }, offsetTop: { value: y, configurable: true }, offsetWidth: { value: w, configurable: true }, offsetHeight: { value: h, configurable: true } });
    set(m.gameFile, 0, 0, 900, 700); // the article is wider than the device (a size container round it)
    set(m.gameFile.querySelector<HTMLElement>('.dev__body')!, 0, 0, 785, 622);
    set(m.dataFile, 392, 42, 556, 556);
    m.desk.style.setProperty('--tilt', '3deg');
    m.desk.style.setProperty('--arot', '6deg');
    const cleanup = initDesk(m.desk, m.hint);
    expect(m.desk.style.getPropertyValue('--ax')).toBe(`${asideGeometry({ x: 0, y: 0, w: 785, h: 622 }, { x: 392, y: 42, w: 556, h: 556 }, 3, 6).ax}px`);
    cleanup();
  });
});

// MO-38 (named rewrite of the MO-25 block): the stamp strikes as before, then the game exit plays (data-exit="game" on
// the desk, CSS keyframes) and the page opens after EXIT_MS.game; ENTER_DELAY_MS is gone.
describe('the stamp and the game exit (MO-25, MO-38)', () => {
  let m: ReturnType<typeof mount>;
  let reduce = false;
  let forced = false;
  beforeEach(() => {
    navigations = [];
    localStorage.clear();
    reduce = false;
    forced = false;
    window.matchMedia = vi.fn().mockImplementation((q: string) => ({ matches: (reduce && /reduced-motion: reduce/.test(q)) || (forced && /forced-colors: active/.test(q)), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    m = mount();
    initChooser(document, { navigate: (href) => navigations.push(href) });
  });
  afterEach(() => {
    initDesk(m.desk, m.hint)();
    vi.useRealTimers();
  });

  it('MO-38: an unmodified activation strikes, sets data-exit=game and navigates after EXIT_MS.game (880)', () => {
    pointerdown(m.game.querySelector('.cta__hit')!, 'mouse', { button: 0 });
    expect(m.stamp.classList.contains('is-declassified')).toBe(true); // at the press: instant feedback
    expect(m.stamp.classList.contains('is-struck')).toBe(true);
    click(m.game);
    expect(navigations).toEqual([]); // default prevented: the page opens after the exit
    expect(localStorage.getItem('sb:variant')).toBe('game');
    expect(m.desk.dataset.exit).toBe('game');
    expect(m.desk.classList.contains('is-aside')).toBe(true); // the sheet makes way for the screen
    // the line across the page starts on the screen: its geometry is written once, at the click
    const ln = document.querySelector<HTMLElement>('.xnav')!;
    for (const name of ['--xl-x', '--xl-y', '--xl-w', '--xl-k']) expect(ln.style.getPropertyValue(name), name).not.toBe('');
    vi.advanceTimersByTime(EXIT_MS.game - 1);
    expect(navigations).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(navigations).toEqual(['/game/']);
  });

  it('MO-38: reduced motion (either path) or forced colours → data-exit=fade, navigation at 150 ms, no strike keyframes', () => {
    reduce = true;
    click(m.game);
    expect(m.stamp.classList.contains('is-declassified')).toBe(true);
    expect(m.stamp.classList.contains('is-struck')).toBe(false);
    expect(m.desk.dataset.exit).toBe('fade');
    expect(m.desk.dataset.exitTo).toBe('game');
    vi.advanceTimersByTime(EXIT_MS.reduce);
    expect(navigations).toEqual(['/game/']);
    for (const set of [() => { document.documentElement.dataset.motion = 'reduce'; }, () => { forced = true; }]) {
      navigations = [];
      reduce = false;
      m = mount();
      set();
      try {
        initChooser(document, { navigate: (href) => navigations.push(href) });
        click(m.game);
        expect(m.stamp.classList.contains('is-struck')).toBe(false);
        expect(m.desk.dataset.exit).toBe('fade');
        vi.advanceTimersByTime(EXIT_MS.reduce);
        expect(navigations).toEqual(['/game/']);
      } finally {
        document.documentElement.dataset.motion = 'full';
        forced = false;
      }
    }
  });

  it('MO-38: Enter runs the same exit; modified/middle/detail>1 clicks are native', () => {
    click(m.game, 0);
    expect(m.stamp.classList.contains('is-declassified')).toBe(true);
    expect(m.stamp.classList.contains('is-struck')).toBe(true);
    expect(m.desk.dataset.exit).toBe('game');
    vi.advanceTimersByTime(EXIT_MS.game);
    expect(navigations).toEqual(['/game/']);
  });

  it('modified and middle clicks are native: no stamp, no preventDefault', () => {
    const inits = [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }];
    for (const init of inits) {
      pointerdown(m.game.querySelector('.cta__hit')!, 'mouse', init);
      click(m.game, 1, init);
    }
    expect(navigations).toEqual(inits.map(() => '/game/')); // native default action, at once
    expect(m.stamp.className).toBe('stamp');
    expect(m.desk.dataset.exit).toBeUndefined();
    click(m.game, 2); // a repeated click (detail 2) stays native too
    expect(navigations.at(-1)).toBe('/game/');
    expect(m.desk.dataset.exit).toBeUndefined();
  });

  it('MO-38: a second activation while leaving is ignored; the desk takes no pointer while leaving', () => {
    click(m.game);
    expect(click(m.game, 2)).toBe(false);
    click(m.game, 0);
    expect(click(m.data)).toBe(false); // the other link too
    vi.advanceTimersByTime(EXIT_MS.game + 100);
    expect(navigations).toEqual(['/game/']);
    const css = readFileSync('src/styles/chooser.css', 'utf8');
    expect(css).toMatch(/\.desk\[data-exit\],\s*\.desk\[data-exit\] \*\s*\{\s*pointer-events:\s*none/);
  });

  it('MO-38: the first touch tap still only reveals', () => {
    pointerdown(m.gameFile, 'touch');
    click(m.game);
    expect(m.desk.classList.contains('is-aside')).toBe(true);
    expect(m.stamp.classList.contains('is-declassified')).toBe(false);
    expect(m.desk.dataset.exit).toBeUndefined();
    vi.advanceTimersByTime(1000);
    expect(navigations).toEqual([]);
    pointerdown(m.gameFile, 'touch');
    click(m.game);
    expect(m.stamp.classList.contains('is-declassified')).toBe(true);
    expect(m.desk.dataset.exit).toBe('game');
    vi.advanceTimersByTime(EXIT_MS.game);
    expect(navigations).toEqual(['/game/']);
  });

  it('MO-38: pageshow persisted clears data-exit, is-aside, the stamp and every exit style', () => {
    click(m.game);
    vi.advanceTimersByTime(EXIT_MS.game);
    const ev = new Event('pageshow') as Event & { persisted: boolean };
    Object.defineProperty(ev, 'persisted', { value: true });
    window.dispatchEvent(ev);
    expect(m.stamp.classList.contains('is-declassified')).toBe(false);
    expect(m.stamp.classList.contains('is-struck')).toBe(false);
    expect(m.desk.classList.contains('is-aside')).toBe(false);
    expect(m.desk.dataset.exit).toBeUndefined();
    expect(m.desk.dataset.exitTo).toBeUndefined();
    expect(document.querySelector<HTMLElement>('.xnav')!.getAttribute('style') ?? '').toBe('');
    click(m.game); // not leaving any more
    vi.advanceTimersByTime(EXIT_MS.game);
    expect(navigations).toEqual(['/game/', '/game/']);
  });

  it('MO-38: EXIT_MS.game equals the end of the last game exit keyframe (token sum)', () => {
    const tokens = readFileSync('src/styles/tokens.css', 'utf8');
    const t = (name: string) => parseFloat(new RegExp(`${name}:\\s*([\\d.]+)s`).exec(tokens)?.[1] ?? 'NaN') * 1000;
    expect(EXIT_MS.game).toBeCloseTo(t('--x-line-at') + t('--x-line'), 5);
    expect(EXIT_MS.game).toBeCloseTo(t('--x-game'), 5);
    expect(EXIT_MS.reduce).toBe(150);
    expect(EXIT_MS.reduce).toBeGreaterThanOrEqual(t('--x-fade'));
  });
});

describe('the data exit (MO-39)', () => {
  let m: ReturnType<typeof mount>;
  let reduce = false;
  beforeEach(() => {
    navigations = [];
    localStorage.clear();
    reduce = false;
    window.matchMedia = vi.fn().mockImplementation((q: string) => ({ matches: reduce && /reduced-motion: reduce/.test(q), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    document.body.innerHTML = '';
    m = mount();
    m.dataFile.querySelector('.face')!.insertAdjacentHTML('afterbegin', '<div class="feed"></div>');
    Object.defineProperties(m.dataFile.querySelector('.feed')!, { offsetWidth: { value: 556 }, offsetHeight: { value: 556 } });
    initChooser(document, { navigate: (href) => navigations.push(href) });
  });
  afterEach(() => {
    initDesk(m.desk, m.hint)();
    vi.useRealTimers();
  });

  it('MO-39: the data link: data-exit=data, remembered, navigates after EXIT_MS.data (800); reduced → fade at 150 ms', () => {
    click(m.data);
    expect(m.desk.dataset.exit).toBe('data');
    expect(localStorage.getItem('sb:variant')).toBe('data');
    expect(m.dataFile.style.getPropertyValue('--fw')).toBe('556px');
    expect(m.dataFile.style.getPropertyValue('--fh')).toBe('556px');
    vi.advanceTimersByTime(EXIT_MS.data - 1);
    expect(navigations).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(navigations).toEqual(['/data/']);
    const ev = new Event('pageshow') as Event & { persisted: boolean };
    Object.defineProperty(ev, 'persisted', { value: true });
    window.dispatchEvent(ev);
    expect(m.dataFile.style.getPropertyValue('--fw')).toBe('');
    reduce = true;
    click(m.data);
    expect(m.desk.dataset.exit).toBe('fade');
    expect(m.desk.dataset.exitTo).toBe('data');
    vi.advanceTimersByTime(EXIT_MS.reduce);
    expect(navigations).toEqual(['/data/', '/data/']);
  });

  it('MO-39: a tap on the aside sheet only puts it back (no exit)', () => {
    pointerdown(m.gameFile, 'touch');
    click(m.game);
    expect(m.desk.classList.contains('is-aside')).toBe(true);
    click(m.data);
    expect(m.desk.classList.contains('is-aside')).toBe(false);
    expect(m.desk.dataset.exit).toBeUndefined();
    vi.advanceTimersByTime(EXIT_MS.data + 10);
    expect(navigations).toEqual([]);
  });

  it('MO-39: modified clicks native; second activation ignored', () => {
    click(m.data, 1, { ctrlKey: true });
    expect(navigations).toEqual(['/data/']);
    expect(m.desk.dataset.exit).toBeUndefined();
    click(m.data);
    click(m.data, 0);
    click(m.game, 0);
    vi.advanceTimersByTime(EXIT_MS.game + 10);
    expect(navigations).toEqual(['/data/', '/data/']);
  });
});

describe('the exit sheet (MO-38)', () => {
  it('MO-38: the exit sheet is attached once, only after the page has loaded', () => {
    document.head.querySelectorAll('link[data-chooser-exit]').forEach((l) => l.remove());
    const state = vi.spyOn(document, 'readyState', 'get').mockReturnValue('interactive');
    try {
      attachExitSheet();
      expect(document.head.querySelectorAll('link[data-chooser-exit]')).toHaveLength(0);
      window.dispatchEvent(new Event('load'));
      expect(document.head.querySelectorAll('link[data-chooser-exit]')).toHaveLength(1);
      attachExitSheet();
      window.dispatchEvent(new Event('load'));
      expect(document.head.querySelectorAll('link[data-chooser-exit]')).toHaveLength(1);
      expect(document.head.querySelector<HTMLLinkElement>('link[data-chooser-exit]')!.rel).toBe('stylesheet');
    } finally {
      state.mockRestore();
    }
  });
});

