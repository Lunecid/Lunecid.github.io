import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '../../src/config';
import { HEAD_INIT_SCRIPT, INTRO_TIMING } from '../../src/lib/head-init';

type IntroWindow = Window & { __sbIntroSkipped?: boolean };
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
  for (const name of ['data-page', 'data-motion', 'data-intro', 'data-intro-played']) root.removeAttribute(name);
  delete (window as IntroWindow).__sbIntroSkipped;
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
    expect(HEAD_INIT_SCRIPT).not.toMatch(/\b(import|export|require)\b/);
    expect(HEAD_INIT_SCRIPT.trim().startsWith('(function')).toBe(true);
  });
});
