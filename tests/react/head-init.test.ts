import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '../../src/config';
import { HEAD_INIT_SCRIPT, INTRO_TIMING, OPENING_TIMING } from '../../src/lib/head-init';

type IntroWindow = Window & { __sbIntroSkipped?: boolean; __sbRedirect?: boolean; __sbOpeningSkip?: number };
const root = document.documentElement;

function stubOsReduce(reduce: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: reduce && query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

/** N17: arm intro timers as if FCP just fired (PerformanceObserver path). */
function stubFcpObserver(): void {
  class FakePO {
    private cb: (list: { getEntries: () => PerformanceEntry[] }) => void;
    constructor(cb: (list: { getEntries: () => PerformanceEntry[] }) => void) {
      this.cb = cb;
    }
    observe(): void {
      this.cb({
        getEntries: () => [{ name: 'first-contentful-paint', entryType: 'paint', startTime: 0, duration: 0, toJSON: () => ({}) }],
      });
    }
    disconnect(): void {}
  }
  vi.stubGlobal('PerformanceObserver', FakePO);
  vi.spyOn(performance, 'getEntriesByType').mockReturnValue([]);
}

function runHeadScript(page: string): void {
  root.setAttribute('data-page', page);
  new Function(HEAD_INIT_SCRIPT)();
}

function resetRoot(): void {
  root.className = '';
  for (const name of ['data-page', 'data-motion', 'data-intro', 'data-intro-played', 'data-intro-skip', 'data-hero-seen']) root.removeAttribute(name);
  delete (window as IntroWindow).__sbIntroSkipped;
  delete (window as IntroWindow).__sbRedirect;
  delete (window as IntroWindow).__sbOpeningSkip;
}

/** The chooser (neutral variant): runs the head script there, then puts the game variant back for the other tests. */
function runOnChooser(search = ''): void {
  const variant = root.getAttribute('data-variant');
  window.history.replaceState(null, '', `/${search}`);
  root.setAttribute('data-variant', 'neutral');
  try {
    runHeadScript('chooser');
  } finally {
    if (variant === null) root.removeAttribute('data-variant');
    else root.setAttribute('data-variant', variant);
    window.history.replaceState(null, '', '/');
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  stubOsReduce(false);
  stubFcpObserver();
  resetRoot();
});

afterEach(() => {
  vi.runOnlyPendingTimers(); // finishes any intro so its listeners are removed
  vi.useRealTimers();
  vi.restoreAllMocks();
  resetRoot();
});

describe('HEAD_INIT_SCRIPT', () => {
  it('adds js class and sets data-motion full by default', () => {
    runHeadScript('records');
    expect(root.classList.contains('js')).toBe(true);
    expect(root.getAttribute('data-motion')).toBe('full');
    expect(root.hasAttribute('data-intro')).toBe(false);
  });

  it("stored 'off' or OS reduce sets data-motion reduce and never starts the intro", () => {
    localStorage.setItem(STORAGE_KEYS.motion, 'off');
    runHeadScript('home');
    expect(root.getAttribute('data-motion')).toBe('reduce');
    expect(root.hasAttribute('data-intro')).toBe(false);
    expect(sessionStorage.getItem(STORAGE_KEYS.intro)).toBeNull();

    localStorage.clear();
    resetRoot();
    stubOsReduce(true);
    runHeadScript('home');
    expect(root.getAttribute('data-motion')).toBe('reduce');
    expect(root.hasAttribute('data-intro')).toBe(false);
    expect(sessionStorage.getItem(STORAGE_KEYS.intro)).toBeNull();
  });

  it('intro plays once per session on the home page only', () => {
    runHeadScript('home');
    expect(root.getAttribute('data-intro')).toBe('playing');
    expect(root.hasAttribute('data-intro-played')).toBe(true);
    expect(sessionStorage.getItem(STORAGE_KEYS.intro)).toBe('1');
    vi.advanceTimersByTime(INTRO_TIMING.doneMs);
    expect(root.hasAttribute('data-intro')).toBe(false);

    resetRoot();
    runHeadScript('home');
    expect(root.hasAttribute('data-intro')).toBe(false);

    sessionStorage.clear();
    resetRoot();
    runHeadScript('research');
    expect(root.hasAttribute('data-intro')).toBe(false);
    expect(sessionStorage.getItem(STORAGE_KEYS.intro)).toBeNull();
  });

  it('intro releases at 400ms and finishes at 700ms from FCP, dispatching sb:intro-done', () => {
    expect(INTRO_TIMING).toEqual({ releaseMs: 400, doneMs: 700, skipFadeMs: 150, safetyMs: 3000 });
    const onDone = vi.fn();
    window.addEventListener('sb:intro-done', onDone);
    runHeadScript('home');
    vi.advanceTimersByTime(INTRO_TIMING.releaseMs - 1);
    expect(root.getAttribute('data-intro')).toBe('playing');
    vi.advanceTimersByTime(1);
    expect(root.getAttribute('data-intro')).toBe('fading');
    vi.advanceTimersByTime(INTRO_TIMING.doneMs - INTRO_TIMING.releaseMs - 1);
    expect(root.getAttribute('data-intro')).toBe('fading');
    expect(onDone).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(root.hasAttribute('data-intro')).toBe(false);
    expect(onDone).toHaveBeenCalledTimes(1);
    window.removeEventListener('sb:intro-done', onDone);
  });

  it('any keydown skips the intro within 150ms and sets __sbIntroSkipped', () => {
    const onDone = vi.fn();
    window.addEventListener('sb:intro-done', onDone);
    runHeadScript('home');
    vi.advanceTimersByTime(50);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect((window as IntroWindow).__sbIntroSkipped).toBe(true);
    expect(root.getAttribute('data-intro')).toBe('fading');
    vi.advanceTimersByTime(INTRO_TIMING.skipFadeMs - 1);
    expect(root.hasAttribute('data-intro')).toBe(true);
    vi.advanceTimersByTime(1);
    expect(root.hasAttribute('data-intro')).toBe(false);
    expect(onDone).toHaveBeenCalledTimes(1);

    // listeners are gone once the intro is done
    delete (window as IntroWindow).__sbIntroSkipped;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect((window as IntroWindow).__sbIntroSkipped).toBeUndefined();
    window.removeEventListener('sb:intro-done', onDone);
  });

  it('F1: a skip marks data-intro-skip until done removes it', () => {
    runHeadScript('home');
    expect(root.hasAttribute('data-intro-skip')).toBe(false);
    vi.advanceTimersByTime(50);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' }));
    expect(root.getAttribute('data-intro')).toBe('fading');
    expect(root.hasAttribute('data-intro-skip')).toBe(true);
    vi.advanceTimersByTime(INTRO_TIMING.skipFadeMs);
    expect(root.hasAttribute('data-intro')).toBe(false);
    expect(root.hasAttribute('data-intro-skip')).toBe(false);

    // the natural fade never sets it
    sessionStorage.clear();
    resetRoot();
    runHeadScript('home');
    vi.advanceTimersByTime(INTRO_TIMING.releaseMs);
    expect(root.getAttribute('data-intro')).toBe('fading');
    expect(root.hasAttribute('data-intro-skip')).toBe(false);
  });

  it.each(['pointerdown', 'wheel', 'touchstart'])('a %s also skips the intro', (type) => {
    runHeadScript('home');
    window.dispatchEvent(new Event(type));
    expect((window as IntroWindow).__sbIntroSkipped).toBe(true);
    vi.advanceTimersByTime(INTRO_TIMING.skipFadeMs);
    expect(root.hasAttribute('data-intro')).toBe(false);
  });

  it('throwing storage yields no intro and no exception', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage denied');
    });
    expect(() => runHeadScript('home')).not.toThrow();
    expect(root.classList.contains('js')).toBe(true);
    expect(root.getAttribute('data-motion')).toBe('full');
    expect(root.hasAttribute('data-intro')).toBe(false);
    expect(root.hasAttribute('data-hero-seen'), 'unknown session: the hero copy stays static').toBe(true);
  });

  it('works when window.matchMedia is missing', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(() => runHeadScript('records')).not.toThrow();
    expect(root.getAttribute('data-motion')).toBe('full');
  });

  it('safety timeout calls done without arming the release path when FCP never arrives', () => {
    vi.stubGlobal('PerformanceObserver', undefined);
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([]);
    runHeadScript('home');
    expect(root.getAttribute('data-intro')).toBe('playing');
    vi.advanceTimersByTime(INTRO_TIMING.safetyMs - 1);
    expect(root.getAttribute('data-intro')).toBe('playing');
    vi.advanceTimersByTime(1);
    expect(root.hasAttribute('data-intro')).toBe(false);
  });

  it('script uses the STORAGE_KEYS literals', () => {
    expect(HEAD_INIT_SCRIPT).toContain(`'${STORAGE_KEYS.motion}'`);
    expect(HEAD_INIT_SCRIPT).toContain(`'${STORAGE_KEYS.intro}'`);
    expect(STORAGE_KEYS.hero).toBe('sb:hero');
    expect(HEAD_INIT_SCRIPT).toContain(`'${STORAGE_KEYS.hero}'`);
    expect(HEAD_INIT_SCRIPT).not.toMatch(/\b(import|export|require)\b/);
    expect(HEAD_INIT_SCRIPT.trim().startsWith('(function')).toBe(true);
  });

  it('A-19: the CRT intro plays only on the game home (never on a data or neutral home)', () => {
    for (const variant of ['data', 'neutral']) {
      root.setAttribute('data-variant', variant);
      sessionStorage.clear();
      runHeadScript('home');
      expect(root.hasAttribute('data-intro'), variant).toBe(false);
      expect(root.getAttribute('data-motion'), variant).toBe('full');
    }
    root.setAttribute('data-variant', 'game');
    sessionStorage.clear();
    runHeadScript('home');
    expect(root.getAttribute('data-intro')).toBe('playing');
  });
  it('H1: the hero copy rises on the first game-home view of the session only', () => {
    runHeadScript('home');
    expect(root.hasAttribute('data-hero-seen')).toBe(false);
    expect(sessionStorage.getItem(STORAGE_KEYS.hero)).toBe('1');
    resetRoot();
    runHeadScript('home');
    expect(root.hasAttribute('data-hero-seen')).toBe(true);

    // other pages and other versions neither read nor record it
    sessionStorage.clear();
    resetRoot();
    runHeadScript('projects');
    expect(root.hasAttribute('data-hero-seen')).toBe(false);
    expect(sessionStorage.getItem(STORAGE_KEYS.hero)).toBeNull();
    for (const variant of ['data', 'neutral']) {
      resetRoot();
      root.setAttribute('data-variant', variant);
      runHeadScript('home');
      expect(root.hasAttribute('data-hero-seen'), variant).toBe(false);
      expect(sessionStorage.getItem(STORAGE_KEYS.hero), variant).toBeNull();
    }
  });

  it('H1: under reduced motion the session is still recorded (the fade also plays once)', () => {
    localStorage.setItem(STORAGE_KEYS.motion, 'off');
    runHeadScript('home');
    expect(root.getAttribute('data-motion')).toBe('reduce');
    expect(root.hasAttribute('data-hero-seen')).toBe(false);
    expect(sessionStorage.getItem(STORAGE_KEYS.hero)).toBe('1');
    expect(sessionStorage.getItem(STORAGE_KEYS.intro), 'the CRT gate is still skipped').toBeNull();
    resetRoot();
    runHeadScript('home');
    expect(root.getAttribute('data-motion')).toBe('reduce');
    expect(root.hasAttribute('data-hero-seen')).toBe(true);
  });

  it('H1: a view-transition entry (pagereveal with viewTransition) marks the hero as seen', () => {
    const reveal = (viewTransition: object | null): void => {
      const event = new Event('pagereveal');
      Object.defineProperty(event, 'viewTransition', { value: viewTransition });
      window.dispatchEvent(event);
    };
    runHeadScript('home');
    expect(root.hasAttribute('data-hero-seen')).toBe(false);
    reveal(null);
    expect(root.hasAttribute('data-hero-seen'), 'an ordinary load keeps the rise').toBe(false);
    reveal({});
    expect(root.hasAttribute('data-hero-seen')).toBe(true);
  });
  it('MO-41: the opening plays once per session on the chooser only (data-intro=opening)', () => {
    expect(OPENING_TIMING).toEqual({ doneMs: 2400, safetyMs: 3400 });
    runOnChooser();
    expect(root.getAttribute('data-intro')).toBe('opening');
    expect(root.hasAttribute('data-intro-played'), 'the CRT marker stays the game home\'s').toBe(false);
    expect(sessionStorage.getItem(STORAGE_KEYS.intro)).toBe('1');
    vi.advanceTimersByTime(OPENING_TIMING.doneMs);
    expect(root.hasAttribute('data-intro')).toBe(false);
    resetRoot();
    runOnChooser();
    expect(root.hasAttribute('data-intro'), 'second load').toBe(false);
    // other neutral pages never play it
    sessionStorage.clear();
    resetRoot();
    root.setAttribute('data-variant', 'neutral');
    runHeadScript('privacy');
    root.setAttribute('data-variant', 'game');
    expect(root.hasAttribute('data-intro')).toBe(false);
    expect(sessionStorage.getItem(STORAGE_KEYS.intro)).toBeNull();
  });

  it('MO-41: none with ?choose, after a pre-paint redirect, under reduced motion, or with throwing storage', () => {
    runOnChooser('?choose');
    expect(root.hasAttribute('data-intro'), '?choose').toBe(false);
    runOnChooser('?x=1&choose=1');
    expect(root.hasAttribute('data-intro'), '?…&choose=').toBe(false);
    (window as IntroWindow).__sbRedirect = true;
    runOnChooser();
    expect(root.hasAttribute('data-intro'), 'redirect').toBe(false);
    resetRoot();
    localStorage.setItem(STORAGE_KEYS.motion, 'off');
    runOnChooser();
    expect(root.hasAttribute('data-intro'), 'site toggle').toBe(false);
    localStorage.clear();
    resetRoot();
    stubOsReduce(true);
    runOnChooser();
    expect(root.hasAttribute('data-intro'), 'OS reduce').toBe(false);
    stubOsReduce(false);
    expect(sessionStorage.getItem(STORAGE_KEYS.intro), 'none of these spends the session').toBeNull();
    resetRoot();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage denied');
    });
    expect(() => runOnChooser()).not.toThrow();
    expect(root.hasAttribute('data-intro'), 'throwing storage').toBe(false);
  });

  it('MO-41: a redirect does not spend sb:intro', () => {
    (window as IntroWindow).__sbRedirect = true;
    runOnChooser();
    expect(sessionStorage.getItem(STORAGE_KEYS.intro)).toBeNull();
    // the game home the redirect lands on still plays its CRT
    resetRoot();
    runHeadScript('home');
    expect(root.getAttribute('data-intro')).toBe('playing');
  });

  it('MO-41: done at doneMs after FCP; safety without FCP; dispatches sb:intro-done', () => {
    const onDone = vi.fn();
    window.addEventListener('sb:intro-done', onDone);
    runOnChooser();
    vi.advanceTimersByTime(OPENING_TIMING.doneMs - 1);
    expect(root.getAttribute('data-intro')).toBe('opening');
    vi.advanceTimersByTime(1);
    expect(root.hasAttribute('data-intro')).toBe(false);
    expect(onDone).toHaveBeenCalledTimes(1);

    sessionStorage.clear();
    resetRoot();
    vi.stubGlobal('PerformanceObserver', undefined);
    runOnChooser();
    vi.advanceTimersByTime(OPENING_TIMING.safetyMs - 1);
    expect(root.getAttribute('data-intro')).toBe('opening');
    vi.advanceTimersByTime(1);
    expect(root.hasAttribute('data-intro')).toBe(false);
    expect(onDone).toHaveBeenCalledTimes(2);
    window.removeEventListener('sb:intro-done', onDone);
  });

  it('MO-41: any input ends it synchronously and records the pointer skip timestamp', () => {
    for (const type of ['keydown', 'pointerdown', 'wheel', 'touchstart']) {
      sessionStorage.clear();
      resetRoot();
      const onDone = vi.fn();
      window.addEventListener('sb:intro-done', onDone);
      runOnChooser();
      vi.advanceTimersByTime(300);
      const ev = new Event(type);
      window.dispatchEvent(ev);
      expect(root.hasAttribute('data-intro'), type).toBe(false);
      expect(root.hasAttribute('data-intro-skip'), `${type}: no fade`).toBe(false);
      expect(onDone, type).toHaveBeenCalledTimes(1);
      const skip = (window as IntroWindow).__sbOpeningSkip;
      if (type === 'pointerdown' || type === 'touchstart') expect(skip, type).toBe(ev.timeStamp);
      else expect(skip, type).toBeUndefined();
      // the listeners are gone
      window.dispatchEvent(new Event('pointerdown'));
      expect((window as IntroWindow).__sbOpeningSkip, `${type}: unbound`).toBe(skip);
      vi.advanceTimersByTime(OPENING_TIMING.safetyMs);
      expect(onDone, `${type}: once`).toHaveBeenCalledTimes(1);
      window.removeEventListener('sb:intro-done', onDone);
    }
  });

  it('D-2: after the opening a game home in the same session plays no CRT', () => {
    runOnChooser();
    vi.advanceTimersByTime(OPENING_TIMING.doneMs);
    resetRoot();
    runHeadScript('home');
    expect(root.hasAttribute('data-intro')).toBe(false);
  });
});
