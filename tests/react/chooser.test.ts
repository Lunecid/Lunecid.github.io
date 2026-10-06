// The chooser desk's script (MO-24): memory, arrows on both axes (the two files overlap at every width, so the old
// isStacked layout test is gone: its two tests are merged into the arrows test), the slide-aside geometry, the touch
// first-tap reveal, tap-outside and Escape, and the touch hint.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { EXIT_MS, asideGeometry, attachExitSheet, buildExitLayers, initChooser, initDesk } from '../../src/scripts/chooser';

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
    const tokens = readFileSync('src/styles/chooser-exit.css', 'utf8'); // the exits' tokens (MO-41: moved from tokens.css)
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

describe('the page-turn sound and the mute button (MO-40)', () => {
  class P { value = 0; setValueAtTime() { return this; } linearRampToValueAtTime() { return this; } exponentialRampToValueAtTime() { return this; } }
  class N { connect(n: unknown) { return n; } }
  class Ctx {
    static made = 0;
    static sources = 0;
    sampleRate = 8000;
    currentTime = 0;
    state = 'running';
    destination = new N();
    constructor() { Ctx.made += 1; }
    resume() { return Promise.resolve(); }
    createGain() { return Object.assign(new N(), { gain: new P() }); }
    createBiquadFilter() { return Object.assign(new N(), { type: '', Q: new P(), frequency: new P() }); }
    createBufferSource() { Ctx.sources += 1; return Object.assign(new N(), { buffer: null, start() {}, stop() {} }); }
    createBuffer(_c: number, length: number) { const d = new Float32Array(length); return { getChannelData: () => d }; }
  }
  let reduce = false;
  let hidden = false;
  type Mod = typeof import('../../src/scripts/chooser');
  let mod: Mod;
  let m: ReturnType<typeof mount>;
  const button = () => document.querySelector<HTMLButtonElement>('[data-sound-toggle]')!;
  beforeEach(async () => {
    Ctx.made = 0;
    Ctx.sources = 0;
    reduce = false;
    hidden = false;
    navigations = [];
    localStorage.clear();
    vi.stubGlobal('AudioContext', Ctx);
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    window.matchMedia = vi.fn().mockImplementation((q: string) => ({ matches: reduce && /reduced-motion: reduce/.test(q), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.resetModules(); // a fresh AudioContext singleton per test
    mod = await import('../../src/scripts/chooser');
    m = mount();
    document.body.insertAdjacentHTML('afterbegin', '<button type="button" class="chooser__sound" data-sound-toggle aria-pressed="true" data-on="ON" data-off="OFF" hidden><span>S</span> <span class="chooser__sound-s">ON</span></button>');
    mod.initChooser(document, { navigate: (href) => navigations.push(href) });
  });
  afterEach(() => {
    mod.initDesk(m.desk, m.hint)();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(document, 'hidden');
    document.documentElement.dataset.motion = 'full';
  });
  const back = () => {
    vi.advanceTimersByTime(EXIT_MS.data + 10);
    const ev = new Event('pageshow') as Event & { persisted: boolean };
    Object.defineProperty(ev, 'persisted', { value: true });
    window.dispatchEvent(ev);
  };

  it('MO-40: no AudioContext on load, hover, focus, Tab, scroll, or a touch first tap', () => {
    m.data.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    m.data.focus();
    key(m.data, 'Tab');
    window.dispatchEvent(new Event('scroll'));
    pointerdown(m.gameFile, 'touch');
    click(m.game);
    expect(m.desk.classList.contains('is-aside')).toBe(true);
    expect(Ctx.made).toBe(0);
  });

  it('MO-40: one AudioContext on the first data activation (click or Enter); reused on the next', () => {
    click(m.data);
    expect(Ctx.made).toBe(1);
    expect(Ctx.sources).toBe(3);
    back();
    click(m.data, 0);
    expect(Ctx.made).toBe(1);
    expect(Ctx.sources).toBe(6);
  });

  it('MO-40: no sound under prefers-reduced-motion, under data-motion=reduce, when sb:sound=off, when document.hidden, or without AudioContext; navigation unaffected', () => {
    const cases: [string, () => void, () => void][] = [
      ['os reduce', () => { reduce = true; }, () => { reduce = false; }],
      ['site reduce', () => { document.documentElement.dataset.motion = 'reduce'; }, () => { document.documentElement.dataset.motion = 'full'; }],
      ['muted', () => localStorage.setItem('sb:sound', 'off'), () => localStorage.removeItem('sb:sound')],
      ['hidden', () => { hidden = true; }, () => { hidden = false; }],
      ['no AudioContext', () => vi.stubGlobal('AudioContext', undefined), () => vi.stubGlobal('AudioContext', Ctx)],
    ];
    let n = 0;
    for (const [name, on, off] of cases) {
      on();
      click(m.data);
      expect(Ctx.made, name).toBe(0);
      back();
      off();
      n += 1;
      expect(navigations, name).toHaveLength(n);
    }
  });

  it('MO-40: the game exit plays no sound', () => {
    click(m.game);
    vi.advanceTimersByTime(EXIT_MS.game);
    expect(navigations).toEqual(['/game/']);
    expect(Ctx.made).toBe(0);
  });

  it('MO-40: the mute button shows when JS runs, aria-pressed mirrors sb:sound, a press writes it and dispatches sb:sound-change', () => {
    expect(button().hidden).toBe(false);
    expect(button().getAttribute('aria-pressed')).toBe('true'); // plays unless muted
    expect(button().querySelector('.chooser__sound-s')!.textContent).toBe('ON');
    const seen: boolean[] = [];
    window.addEventListener('sb:sound-change', (e) => seen.push((e as CustomEvent<boolean>).detail));
    button().click();
    expect(localStorage.getItem('sb:sound')).toBe('off');
    expect(button().getAttribute('aria-pressed')).toBe('false');
    expect(button().querySelector('.chooser__sound-s')!.textContent).toBe('OFF');
    button().click();
    expect(localStorage.getItem('sb:sound')).toBe('on');
    expect(seen).toEqual([false, true]);
    // a change made elsewhere (another tab's toggle) is mirrored
    window.dispatchEvent(new CustomEvent('sb:sound-change', { detail: false }));
    expect(button().getAttribute('aria-pressed')).toBe('false');
  });

  it('MO-40: a throwing AudioContext never blocks the exit', () => {
    vi.stubGlobal('AudioContext', class { constructor() { throw new Error('no audio'); } });
    click(m.data);
    expect(m.desk.dataset.exit).toBe('data');
    vi.advanceTimersByTime(EXIT_MS.data);
    expect(navigations).toEqual(['/data/']);
  });
});

describe('the handoff after the exits (MO-42)', () => {
  let m: ReturnType<typeof mount>;
  beforeEach(() => {
    navigations = [];
    localStorage.clear();
    sessionStorage.clear();
    window.matchMedia = vi.fn().mockImplementation((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    m = mount();
    initChooser(document, { navigate: (href) => navigations.push(href) });
  });
  afterEach(() => {
    initDesk(m.desk, m.hint)();
    vi.useRealTimers();
    sessionStorage.clear();
  });

  it('MO-42: both exits spend sb:intro (the exit is the entry: no CRT on the game home after it); modified clicks and the first touch tap do not', () => {
    pointerdown(m.gameFile, 'touch');
    click(m.game); // first tap: reveal only
    click(m.game, 1, { ctrlKey: true });
    expect(sessionStorage.getItem('sb:intro')).toBeNull();
    click(m.game);
    expect(sessionStorage.getItem('sb:intro')).toBe('1');
    sessionStorage.clear();
    settle();
    click(m.data);
    expect(sessionStorage.getItem('sb:intro')).toBe('1');
  });

  it('MO-42: at the navigation the exit is marked done (the ground snaps to its end, whatever the animation clock); bfcache clears it', () => {
    click(m.game);
    expect(m.desk.hasAttribute('data-exit-done')).toBe(false);
    vi.advanceTimersByTime(EXIT_MS.game);
    expect(m.desk.hasAttribute('data-exit-done')).toBe(true);
    expect(navigations).toEqual(['/game/']);
    const ev = new Event('pageshow') as Event & { persisted: boolean };
    Object.defineProperty(ev, 'persisted', { value: true });
    window.dispatchEvent(ev);
    expect(m.desk.hasAttribute('data-exit-done')).toBe(false);
    const css = readFileSync('src/styles/chooser-exit.css', 'utf8');
    expect(css).toMatch(/\.desk\[data-exit-done\] ~ \.xnav \.xnav__bg \{ animation: none; opacity: 1; \}/);
  });

  it('MO-42: storage that throws never blocks the exit', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    try {
      click(m.game);
      vi.advanceTimersByTime(EXIT_MS.game);
      expect(navigations).toEqual(['/game/']);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('the exit sheet (MO-38)', () => {
  it('MO-38: the exit sheet is attached once, only after the page has loaded', () => {
    document.head.querySelectorAll('link[data-chooser-exit]').forEach((l) => l.remove());
    const state = vi.spyOn(document, 'readyState', 'get').mockReturnValue('interactive');
    document.body.innerHTML = '<div class="desk" data-chooser data-desk><div class="props"><svg class="prop"><use data-href="/s.svg#prop-kb"></use></svg></div></div>';
    try {
      attachExitSheet();
      expect(document.querySelector('use')!.hasAttribute('href')).toBe(false); // MO-36: the props' sprite waits for load too
      expect(document.head.querySelectorAll('link[data-chooser-exit]')).toHaveLength(0);
      window.dispatchEvent(new Event('load'));
      expect(document.head.querySelectorAll('link[data-chooser-exit]')).toHaveLength(1);
      expect(document.querySelector('use')!.getAttribute('href')).toBe('/s.svg#prop-kb');
      attachExitSheet();
      window.dispatchEvent(new Event('load'));
      expect(document.head.querySelectorAll('link[data-chooser-exit]')).toHaveLength(1);
      expect(document.head.querySelector<HTMLLinkElement>('link[data-chooser-exit]')!.rel).toBe('stylesheet');
    } finally {
      state.mockRestore();
    }
  });
});

describe('the exit layers (MO-38, MO-39)', () => {
  it('buildExitLayers adds every layer once, aria-hidden, with the banner words on the next sheet', () => {
    document.body.innerHTML = `<div class="chooser__stage"><div class="desk" data-chooser data-desk>
      <article class="file file--data"><div class="face"><div class="feed"><div class="turn"><div class="turn__in"><div class="pr"><p class="pr__disp"><span>DATA</span> <span>ANALYST</span></p></div></div></div><span class="tab"></span></div></div></article>
      <article class="file file--game"><div class="dev"><div class="dev__body"><div class="dev__screen"><div class="face"></div><i class="dev__glass"></i></div></div></div></article>
    </div><p class="desk__hint"></p></div>`;
    const desk = document.querySelector<HTMLElement>('.desk')!;
    buildExitLayers(desk);
    buildExitLayers(desk);
    for (const sel of ['.xg', '.xg__off', '.under', '.flap', '.turn__shade']) expect(desk.querySelectorAll(sel), sel).toHaveLength(1);
    expect(document.querySelectorAll('.xnav')).toHaveLength(1);
    expect(document.querySelector('.desk ~ .xnav')).not.toBeNull(); // a later sibling: the exit rules reach it
    expect(desk.querySelector('.dev__screen > .xg__off + .face + .xg + .dev__glass')).not.toBeNull();
    expect(desk.querySelector('.feed')!.firstElementChild!.className).toBe('under');
    expect(desk.querySelector('.under__hero')!.textContent).toBe('DATA ANALYST');
    expect([...desk.querySelectorAll<HTMLElement>('.flap__f--s')].map((e) => e.style.getPropertyValue('--i'))).toEqual(['1', '2', '3']);
    for (const sel of ['.xg', '.xg__off', '.under', '.flap', '.turn__shade', '.xnav']) expect(document.querySelector(sel)!.getAttribute('aria-hidden'), sel).toBe('true');
  });
});

describe('a press that ends the opening (MO-41)', () => {
  let m: ReturnType<typeof mount>;
  beforeEach(() => {
    navigations = [];
    localStorage.clear();
    sessionStorage.clear();
    coarse(true);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    m = mount();
    initChooser(document, { navigate: (href) => navigations.push(href) });
  });
  afterEach(() => {
    initDesk(m.desk, m.hint)();
    vi.useRealTimers();
    delete (window as Window & { __sbOpeningSkip?: number }).__sbOpeningSkip;
  });
  // head-init ends the opening on the pointerdown and records its timeStamp (window capture, before this script)
  const skipPress = (el: Element, pointerType = 'mouse') => {
    const ev = new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 });
    Object.defineProperty(ev, 'pointerType', { value: pointerType });
    (window as Window & { __sbOpeningSkip?: number }).__sbOpeningSkip = ev.timeStamp;
    el.dispatchEvent(ev);
  };

  it('MO-41: the click of the press that ended the opening does nothing: no navigation, no stamp, no first tap, no memory', () => {
    for (const [link, file, type] of [[m.game, m.gameFile, 'mouse'], [m.game, m.gameFile, 'touch'], [m.data, m.dataFile, 'mouse']] as const) {
      skipPress(file, type);
      expect(click(link), `${link.getAttribute('href')} ${type}`).toBe(false);
      vi.advanceTimersByTime(EXIT_MS.game + 10);
      expect(navigations).toEqual([]);
      expect(m.desk.hasAttribute('data-exit')).toBe(false);
      expect(m.stamp.classList.contains('is-struck')).toBe(false);
      expect(m.stamp.classList.contains('is-declassified'), 'not even inked by the press').toBe(false);
      expect(m.desk.classList.contains('is-aside')).toBe(false);
      expect(localStorage.getItem('sb:variant')).toBeNull();
    }
  });

  it('MO-41: the next press, and a keyboard activation after a skip press, work as usual', () => {
    skipPress(m.gameFile);
    click(m.data, 0); // Enter on the focused link: detail 0, never the skipped press
    vi.advanceTimersByTime(EXIT_MS.data + 10);
    expect(navigations).toEqual(['/data/']);
    navigations = [];
    const ev = new Event('pageshow') as Event & { persisted: boolean };
    Object.defineProperty(ev, 'persisted', { value: true });
    window.dispatchEvent(ev);
    pointerdown(m.dataFile, 'mouse');
    click(m.data);
    vi.advanceTimersByTime(EXIT_MS.data + 10);
    expect(navigations).toEqual(['/data/']);
  });
});

describe('neon typing (MO-27)', () => {
  const root = document.documentElement;
  const mountLabels = () => {
    document.body.innerHTML = `
      <div class="desk" data-chooser data-desk>
        <article class="file file--data"><div class="face"><a class="cta" href="/data/" data-choose-variant="data">D</a></div></article>
        <article class="file file--game"><div class="dev"><div class="face">
          <div class="bar"><span class="bar__name neon" lang="en">GAME_ANALYST.DOC</span><span class="bar__no neon--dim" lang="en">NO. 1</span></div>
          <p class="cv__foot" aria-hidden="true"><span class="cv__foot-t">2026 · PORTFOLIO</span></p>
          <h2 class="title">게임 데이터 분석가</h2>
          <a class="cta" href="/game/" data-choose-variant="game">G</a>
          <div class="ov" aria-hidden="true"><div class="ov__con"><p class="ov__hd"><span class="ov__t">TERMINAL</span></p><p class="ov__ln"><span class="ov__rq">&gt; 열람 요청</span></p></div><p class="ov__st">ACCESS GRANTED</p></div>
        </div></div></article>
      </div>`;
  };
  afterEach(() => {
    root.removeAttribute('data-intro');
  });

  it('MO-27: while the opening plays the targets type in glyph spans (seeded variants, a start each); read labels keep an sr-only copy; the plain text is back at sb:intro-done', async () => {
    const { typeNeon } = await import('../../src/scripts/chooser');
    const { NEON_LEAD_MS, NEON_TARGETS } = await import('../../src/lib/neon');
    mountLabels();
    root.setAttribute('data-intro', 'opening');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    try {
      typeNeon(document);
      // one short task per line, just before its first glyph: nothing is split up front
      expect(document.querySelectorAll('.ng')).toHaveLength(0);
      const atOf = (sel: string) => NEON_TARGETS.find((t) => t.sel === sel)!.atMs;
      vi.advanceTimersByTime(atOf('.ov__t') - NEON_LEAD_MS);
      expect(document.querySelector('.ov__t .ng')).not.toBeNull();
      expect(document.querySelector('.bar__name .ng')).toBeNull();
      // a line built later still keeps the opening's clock: its first glyph starts the lead after the build
      expect(parseFloat(document.querySelector<HTMLElement>('.ov__t .ng')!.style.getPropertyValue('--d'))).toBeCloseTo(NEON_LEAD_MS, 0);
      vi.advanceTimersByTime(atOf('.cv__sn'));
    } finally {
      vi.useRealTimers();
    }
    const name = document.querySelector<HTMLElement>('.bar__name')!;
    const glyphs = [...name.querySelectorAll<HTMLElement>('.ng')];
    expect(glyphs.map((g) => g.textContent).join('')).toBe('GAME_ANALYST.DOC');
    expect(glyphs[0]!.parentElement!.getAttribute('aria-hidden')).toBe('true');
    expect(name.querySelector('.sr-only')!.textContent).toBe('GAME_ANALYST.DOC');
    expect(glyphs.every((g) => /^-?[\d.]+ms$/.test(g.style.getPropertyValue('--d')))).toBe(true);
    const ds = glyphs.map((g) => parseFloat(g.style.getPropertyValue('--d')));
    for (let i = 1; i < ds.length; i++) expect(ds[i]! - ds[i - 1]!).toBeCloseTo(18, 6);
    expect(glyphs.some((g) => g.classList.contains('ng--b'))).toBe(true);
    // inside the aria-hidden overlay and the hidden foot line: no extra copy
    expect(document.querySelector('.ov__t .sr-only')).toBeNull();
    expect(document.querySelector('.cv__foot-t .sr-only')).toBeNull();
    expect(document.querySelector('.ov__rq')!.querySelectorAll('.ng')).toHaveLength(7);
    // never the title
    expect(document.querySelector('.title .ng')).toBeNull();
    window.dispatchEvent(new Event('sb:intro-done'));
    expect(name.innerHTML).toBe('GAME_ANALYST.DOC');
    expect(document.querySelector('.ov__rq')!.textContent).toBe('> 열람 요청');
    expect(document.querySelectorAll('.ng')).toHaveLength(0);
    expect(name.getAttribute('style')).toBeNull();
  });

  it('an opening ended early (a skip) splits no line that had not started yet', async () => {
    const { typeNeon } = await import('../../src/scripts/chooser');
    mountLabels();
    root.setAttribute('data-intro', 'opening');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    try {
      typeNeon(document);
      vi.advanceTimersByTime(600);
      expect(document.querySelector('.ov__t .ng')).not.toBeNull();
      root.removeAttribute('data-intro');
      window.dispatchEvent(new Event('sb:intro-done'));
      vi.advanceTimersByTime(3000);
      expect(document.querySelectorAll('.ng')).toHaveLength(0);
      expect(document.querySelector('.bar__name')!.innerHTML).toBe('GAME_ANALYST.DOC');
    } finally {
      vi.useRealTimers();
    }
  });

  it('MO-27: without the opening nothing is split', async () => {
    const { typeNeon } = await import('../../src/scripts/chooser');
    mountLabels();
    typeNeon(document);
    expect(document.querySelectorAll('.ng')).toHaveLength(0);
  });
});
