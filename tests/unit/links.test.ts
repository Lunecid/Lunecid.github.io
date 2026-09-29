import { describe, expect, it } from 'vitest';
import { DOCUMENTS } from '../../src/config';
import {
  UnknownInternalHrefError, chooserHref, homeHref, langSwitchHref, otherVariant, pageHref, paperBase, projectBase, switchVariantHref,
} from '../../src/lib/links';

describe('pageHref (R-5: the only builder of internal links)', () => {
  it('prefixes version pages with /en and /game|/data, keeping the hash', () => {
    expect(pageHref('/records/#job-fit', { lang: 'ko', variant: 'game' })).toBe('/game/records/#job-fit');
    expect(pageHref('/records/#job-fit', { lang: 'en', variant: 'data' })).toBe('/en/data/records/#job-fit');
    expect(pageHref('/', { lang: 'en', variant: 'game' })).toBe('/en/game/');
    expect(pageHref('/research/cog-2026-engagement/', { lang: 'ko', variant: 'data' })).toBe('/data/research/cog-2026-engagement/');
  });

  it('shared pages keep their URL (only /en), the chooser is / or /en/, documents and externals are unchanged', () => {
    for (const variant of [null, 'game', 'data'] as const) {
      expect(pageHref('/stats/', { lang: 'en', variant })).toBe('/en/stats/');
      expect(pageHref('/privacy/', { lang: 'ko', variant })).toBe('/privacy/');
      expect(pageHref('/stats/#summary', { lang: 'ko', variant })).toBe('/stats/#summary');
    }
    expect(pageHref('/', { lang: 'ko', variant: null })).toBe('/');
    expect(pageHref('/', { lang: 'en', variant: null })).toBe('/en/');
    const pdf = Object.values(DOCUMENTS)[0];
    expect(pageHref(pdf, { lang: 'en', variant: 'game' })).toBe(pdf);
    for (const external of ['https://github.com/Lunecid', 'http://example.com/', 'mailto:todtjddms104204@pusan.ac.kr', '//cdn.example.com/x.js', '#job-fit']) {
      expect(pageHref(external, { lang: 'en', variant: 'data' }), external).toBe(external);
    }
  });

  it('throws UnknownInternalHrefError for unknown paths, unknown or module-owned hashes and already-prefixed paths (A-4)', () => {
    const cases: [string, 'game' | 'data' | null][] = [
      ['/nope/', 'game'],
      ['/records/#nope', 'game'],
      ['/player-log/', 'data'],
      ['/#main-menu', 'data'],
      ['/game/records/', 'game'],
      ['/en/records/', 'game'],
      ['/records', 'game'],
      ['/records/', null],
      ['/#hello', null],
      ['/privacy/#x', 'game'],
      [`${Object.values(DOCUMENTS)[0]}#page=2`, 'game'],
    ];
    for (const [href, variant] of cases) {
      expect(() => pageHref(href, { lang: 'ko', variant }), `${href} (${variant})`).toThrow(UnknownInternalHrefError);
    }
    try {
      pageHref('/nope/', { lang: 'ko', variant: 'data' });
    } catch (error) {
      expect(error).toBeInstanceOf(UnknownInternalHrefError);
      expect((error as UnknownInternalHrefError).href).toBe('/nope/');
      expect((error as UnknownInternalHrefError).variant).toBe('data');
    }
  });
});

describe('the other builders', () => {
  it('homeHref, chooserHref, otherVariant, projectBase, paperBase', () => {
    expect(homeHref('ko', 'game')).toBe('/game/');
    expect(homeHref('en', 'data')).toBe('/en/data/');
    expect(chooserHref('ko')).toBe('/');
    expect(chooserHref('en')).toBe('/en/');
    expect(chooserHref('ko', { choose: true })).toBe('/?choose');
    expect(chooserHref('en', { choose: true })).toBe('/en/?choose');
    expect(otherVariant('game')).toBe('data');
    expect(otherVariant('data')).toBe('game');
    expect(projectBase('kickick-park')).toBe('/projects/kickick-park/');
    expect(paperBase('cog-2026-engagement')).toBe('/research/cog-2026-engagement/');
  });

  it('switchVariantHref keeps the page when the other version has it, else goes to that version home (A-26)', () => {
    expect(switchVariantHref('/records/', 'ko', 'game')).toEqual({ target: 'data', href: '/data/records/', samePage: true });
    expect(switchVariantHref('/projects/kickick-park/', 'en', 'data')).toEqual({ target: 'game', href: '/en/game/projects/kickick-park/', samePage: true });
    expect(switchVariantHref('/player-log/', 'ko', 'game')).toEqual({ target: 'data', href: '/data/', samePage: false });
    expect(switchVariantHref('/player-log/', 'en', 'game')).toEqual({ target: 'data', href: '/en/data/', samePage: false });
  });

  it('langSwitchHref is switchLocalePath and works on version routes', () => {
    expect(langSwitchHref('/game/records/', 'en')).toBe('/en/game/records/');
    expect(langSwitchHref('/en/data/', 'ko')).toBe('/data/');
    expect(langSwitchHref('/', 'en')).toBe('/en/');
  });
});
