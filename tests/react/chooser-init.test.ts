import { describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '../../src/config';
import { goatcounterLoaderScript } from '../../src/lib/analytics';
import { chooserInitScript } from '../../src/lib/chooser-init';
import { LEGACY_HOME_ANCHORS } from '../../src/variants/ids';

/** Runs the classic script against a fake location/window (jsdom's location cannot be spied on). */
function run(lang: 'ko' | 'en', opts: { search?: string; hash?: string; stored?: string | null; throws?: boolean }) {
  const replace = vi.fn();
  const location = { search: opts.search ?? '', hash: opts.hash ?? '', replace };
  const store = new Map<string, string>(opts.stored == null ? [] : [[STORAGE_KEYS.variant, opts.stored]]);
  const win: { localStorage: { getItem: (k: string) => string | null; removeItem: (k: string) => void }; __sbRedirect?: boolean } = {
    localStorage: {
      getItem: (key: string) => {
        if (opts.throws) throw new Error('storage blocked');
        return store.get(key) ?? null;
      },
      removeItem: (key: string) => {
        if (opts.throws) throw new Error('storage blocked');
        store.delete(key);
      },
    },
  };
  new Function('location', 'window', chooserInitScript(lang))(location, win);
  return { replace, redirected: win.__sbRedirect === true, store };
}

describe('chooserInitScript (§5.5, contract §2.5; owner ruling 2026-10-07: \'/\' always shows the chooser)', () => {
  it('is a self-contained classic script whose literals equal the shared constants', () => {
    const script = chooserInitScript('ko');
    expect(script).not.toMatch(/\b(import|export|require)\b/);
    expect(script.trim().startsWith('(function')).toBe(true);
    expect(script).toContain(JSON.stringify(STORAGE_KEYS.variant));
    expect(script).toContain(JSON.stringify(LEGACY_HOME_ANCHORS));
    expect(script).not.toContain('getItem');
  });

  it('a choice an earlier version stored no longer redirects, and is removed', () => {
    for (const stored of ['game', 'data']) {
      for (const lang of ['ko', 'en'] as const) {
        const r = run(lang, { stored });
        expect(r.replace, `${lang} ${stored}`).not.toHaveBeenCalled();
        expect(r.redirected).toBe(false);
        expect(r.store.has(STORAGE_KEYS.variant)).toBe(false);
      }
    }
  });

  it('?choose, nothing stored and blocked storage all stay on the chooser', () => {
    for (const search of ['?choose', '?choose=1', '?a=1&choose']) expect(run('ko', { stored: 'game', search }).replace, search).not.toHaveBeenCalled();
    expect(run('ko', {}).replace).not.toHaveBeenCalled();
    const blocked = run('ko', { throws: true });
    expect(blocked.replace).not.toHaveBeenCalled();
    expect(blocked.redirected).toBe(false);
  });

  it('A-27: old home anchors still go to /game/#… in the same language', () => {
    for (const anchor of LEGACY_HOME_ANCHORS) {
      const r = run('ko', { stored: 'data', hash: `#${anchor}` });
      expect(r.replace).toHaveBeenCalledWith(`/game/#${anchor}`);
      expect(r.redirected).toBe(true);
    }
    expect(run('en', { hash: '#hello' }).replace).toHaveBeenCalledWith('/en/game/#hello');
    expect(run('ko', { hash: '#hello', search: '?choose' }).replace).not.toHaveBeenCalled();
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
