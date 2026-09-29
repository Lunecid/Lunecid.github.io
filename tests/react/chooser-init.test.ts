import { describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '../../src/config';
import { goatcounterLoaderScript } from '../../src/lib/analytics';
import { chooserInitScript } from '../../src/lib/chooser-init';
import { rememberVariant, storedVariant } from '../../src/lib/variant-pref';
import { LEGACY_HOME_ANCHORS, VARIANT_IDS } from '../../src/variants/ids';

/** Runs the classic script against a fake location/window (jsdom's location cannot be spied on). */
function run(lang: 'ko' | 'en', opts: { search?: string; hash?: string; stored?: string | null; throws?: boolean }) {
  const replace = vi.fn();
  const location = { search: opts.search ?? '', hash: opts.hash ?? '', replace };
  const win: { localStorage: { getItem: (k: string) => string | null }; __sbRedirect?: boolean } = {
    localStorage: {
      getItem: (key: string) => {
        if (opts.throws) throw new Error('storage blocked');
        return key === STORAGE_KEYS.variant ? (opts.stored ?? null) : null;
      },
    },
  };
  new Function('location', 'window', chooserInitScript(lang))(location, win);
  return { replace, redirected: win.__sbRedirect === true };
}

describe('chooserInitScript (§5.5, contract §2.5)', () => {
  it('is a self-contained classic script whose literals equal the shared constants', () => {
    const script = chooserInitScript('ko');
    expect(script).not.toMatch(/\b(import|export|require)\b/);
    expect(script.trim().startsWith('(function')).toBe(true);
    expect(script).toContain(JSON.stringify(STORAGE_KEYS.variant));
    expect(script).toContain(JSON.stringify(LEGACY_HOME_ANCHORS));
    expect(script).toContain(JSON.stringify(VARIANT_IDS));
  });

  it('a stored choice goes to that version home in the same language, keeping the hash', () => {
    expect(run('ko', { stored: 'data' }).replace).toHaveBeenCalledWith('/data/');
    expect(run('en', { stored: 'game', hash: '#x' }).replace).toHaveBeenCalledWith('/en/game/#x');
    expect(run('ko', { stored: 'data' }).redirected).toBe(true);
  });

  it('?choose stays on the chooser; nothing stored stays; garbage or blocked storage stays', () => {
    for (const search of ['?choose', '?choose=1', '?a=1&choose']) expect(run('ko', { stored: 'game', search }).replace, search).not.toHaveBeenCalled();
    expect(run('ko', {}).replace).not.toHaveBeenCalled();
    expect(run('ko', { stored: 'neutral' }).replace).not.toHaveBeenCalled();
    const blocked = run('ko', { throws: true });
    expect(blocked.replace).not.toHaveBeenCalled();
    expect(blocked.redirected).toBe(false);
  });

  it('A-27: old home anchors go to /game/#… in the same language, regardless of the stored choice', () => {
    for (const anchor of LEGACY_HOME_ANCHORS) {
      expect(run('ko', { stored: 'data', hash: `#${anchor}` }).replace).toHaveBeenCalledWith(`/game/#${anchor}`);
    }
    expect(run('en', { hash: '#hello' }).replace).toHaveBeenCalledWith('/en/game/#hello');
    expect(run('ko', { hash: '#hello', search: '?choose' }).replace).not.toHaveBeenCalled();
  });
});

describe('variant preference', () => {
  it('stores only the two version ids and swallows storage errors', () => {
    expect(storedVariant()).toBeNull();
    rememberVariant('data');
    expect(localStorage.getItem('sb:variant')).toBe('data');
    expect(storedVariant()).toBe('data');
    localStorage.setItem('sb:variant', 'neutral');
    expect(storedVariant()).toBeNull();
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(() => rememberVariant('game')).not.toThrow();
    expect(storedVariant()).toBeNull();
    set.mockRestore();
    get.mockRestore();
  });
});

describe('goatcounterLoaderScript (analytics="unless-redirecting")', () => {
  const attrs = { src: 'https://gc.zgo.at/count.v5.js', 'data-goatcounter': 'https://lunecid.goatcounter.com/count', integrity: 'sha384-x', crossorigin: 'anonymous' as const };

  it('appends the counter only when the page is not redirecting', () => {
    const script = goatcounterLoaderScript(attrs);
    expect(script).not.toMatch(/\b(import|export|require)\b/);
    document.head.innerHTML = '';
    (window as Window & { __sbRedirect?: boolean }).__sbRedirect = true;
    new Function(script)();
    expect(document.head.querySelector('script[data-goatcounter]')).toBeNull();
    (window as Window & { __sbRedirect?: boolean }).__sbRedirect = undefined;
    new Function(script)();
    const tag = document.head.querySelector('script[data-goatcounter]');
    expect(tag?.getAttribute('src')).toBe(attrs.src);
    expect(tag?.getAttribute('data-goatcounter')).toBe(attrs['data-goatcounter']);
    expect(tag?.getAttribute('integrity')).toBe('sha384-x');
    expect(tag?.getAttribute('crossorigin')).toBe('anonymous');
  });
});
