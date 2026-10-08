import { describe, expect, it } from 'vitest';
import { DOCUMENTS } from '../../src/config';
import {
  ANCHORS, ANCHOR_MODULES, LANG_PREFIX, PROJECT_PAGE_SLUGS, PROJECT_SLUGS, STORY_SLUGS,
  allRoutes, anchorsFor, chooserRoute, isKnownInternalHref, legacyRedirects, parseRoute, routePath,
  routesFor, sharedRoutes, variantBasePaths, variantParamsFor, variantRoutes,
} from '../../src/lib/routes';
import {
  BASE_PATH, CHOOSER_PATH, LEGACY_HOME_ANCHORS, LEGACY_VARIANT, MODULE_IDS, SHARED_PATHS, VARIANT_IDS, VARIANT_MODULES,
  VARIANT_PREFIX, VARIANT_STATIC_PATHS, isVariantId,
} from '../../src/variants/ids';

describe('route table after the move (contract §2.1)', () => {
  const perLang = 1 + variantBasePaths('game').length + variantBasePaths('data').length + SHARED_PATHS.length;

  it('routesFor(lang) = chooser, game, data, shared; allRoutes = ko then en; counts come from the table', () => {
    expect(routesFor('ko')).toEqual([chooserRoute('ko'), ...variantRoutes('game', 'ko'), ...variantRoutes('data', 'ko'), ...sharedRoutes('ko')]);
    expect(routesFor('ko')).toHaveLength(perLang);
    expect(allRoutes()).toEqual([...routesFor('ko'), ...routesFor('en')]);
    expect(new Set(allRoutes()).size).toBe(2 * perLang);
    expect(routesFor('en')).toEqual(routesFor('ko').map((r) => `/en${r}`));
    expect(allRoutes()).toContain('/game/player-log/');
    expect(allRoutes()).not.toContain('/data/player-log/');
    expect(allRoutes().some((r) => r.startsWith('/print/'))).toBe(false);
    for (const route of allRoutes()) expect(parseRoute(route)?.route, route).toBe(route);
  });

  it('no old game URL is a route any more, and the chooser is', () => {
    for (const { from } of legacyRedirects()) expect(allRoutes(), from).not.toContain(from);
    expect(allRoutes()).toContain('/');
    expect(allRoutes()).toContain('/en/');
  });

  it('every ANCHORS key is a version base path or a shared path', () => {
    for (const [key, ids] of Object.entries(ANCHORS)) {
      const known = variantBasePaths('game').includes(key) || (SHARED_PATHS as readonly string[]).includes(key);
      expect(known, key).toBe(true);
      expect(new Set(ids).size, key).toBe(ids.length);
      for (const id of ids) expect(id, `${key}#${id}`).toMatch(/^[a-z][a-z0-9-]*$/);
    }
    expect(ANCHORS['/research/']).toContain('in-progress');
    expect(ANCHORS['/research/cog-2026-engagement/']).toEqual(['abstract', 'bibtex']); // D-15 paper page
  });

  it("PL-4: ANCHORS['/player-log/'] lists game-achievements between favorite-games and site-achievements, owned by playerLog", () => {
    expect(ANCHORS['/player-log/']).toEqual(['membership', 'favorite-games', 'game-achievements', 'site-achievements']);
    expect(ANCHOR_MODULES['game-achievements']).toBe('playerLog');
    expect(anchorsFor('/player-log/', 'game')).toContain('game-achievements');
    expect(anchorsFor('/player-log/', 'data')).toEqual([]);
  });

  it("ANCHORS['/records/'] lists projects between publications and awards", () => {
    const records = ANCHORS['/records/'] ?? [];
    expect(records).toEqual(['profile', 'education', 'publications', 'projects', 'awards', 'activities', 'certifications', 'languages', 'training', 'skills', 'job-fit', 'documents']);
    const i = records.indexOf('projects');
    expect(records[i - 1]).toBe('publications');
    expect(records[i + 1]).toBe('awards');
  });

  it('D-4: Seoul apartment has no page in either version (KBO has one since owner 2026-10-08)', () => {
    for (const v of ['game', 'data'] as const) {
      const bases = variantBasePaths(v);
      expect(PROJECT_SLUGS.filter((slug) => !bases.includes(`/projects/${slug}/`))).toEqual(['seoul-apartment-automl']);
      expect(isKnownInternalHref('/projects/seoul-apartment-automl/', v)).toBe(false);
      expect(isKnownInternalHref('/projects/kbo-attendance/', v)).toBe(true);
    }
    expect(STORY_SLUGS).toEqual(['cog-2026-engagement']);
  });

  it("isKnownInternalHref(…, 'game') accepts '/records/#job-fit' and the document PDFs and rejects '/records/#nope' and '/nope/'", () => {
    expect(isKnownInternalHref('/records/#job-fit', 'game')).toBe(true);
    expect(isKnownInternalHref('/records/#education', 'game')).toBe(true);
    expect(isKnownInternalHref('/research/#in-progress', 'game')).toBe(true);
    expect(isKnownInternalHref('/research/cog-2026-engagement/', 'game')).toBe(true);
    expect(isKnownInternalHref('/research/cog-2026-engagement/#abstract', 'game')).toBe(true);
    expect(isKnownInternalHref('/research/cog-2026-engagement/#for-game-teams', 'game')).toBe(false); // story anchor removed (D-15)
    expect(isKnownInternalHref('/projects/school-zone-blindspots/', 'game')).toBe(true);
    expect(isKnownInternalHref('/', 'game')).toBe(true);
    for (const pdf of Object.values(DOCUMENTS)) expect(isKnownInternalHref(pdf, 'game'), pdf).toBe(true);
    expect(isKnownInternalHref('/records/#nope', 'game')).toBe(false);
    expect(isKnownInternalHref('/nope/', 'game')).toBe(false);
    expect(isKnownInternalHref('/records', 'game')).toBe(false);
    expect(isKnownInternalHref('/en/records/', 'game')).toBe(false);
    expect(isKnownInternalHref('/projects/school-zone-blind-spot/', 'game')).toBe(false);
    expect(isKnownInternalHref('https://lunecid.github.io/records/', 'game')).toBe(false);
    expect(isKnownInternalHref('//lunecid.github.io/records/', 'game')).toBe(false);
  });
});

describe('version ids (src/variants/ids.ts)', () => {
  it('ids, prefixes, modules and page sets match spec §4.2/§4.3', () => {
    expect(VARIANT_IDS).toEqual(['game', 'data']);
    expect(VARIANT_PREFIX).toEqual({ game: '/game', data: '/data' });
    expect(MODULE_IDS).toEqual(['characterArt', 'mainMenu', 'bgm', 'sfx', 'achievements', 'crtIntro', 'playerLog', 'audienceGame']);
    expect(VARIANT_MODULES.game).toEqual([...MODULE_IDS]);
    expect(VARIANT_MODULES.data).toEqual([]);
    expect(VARIANT_STATIC_PATHS.game).toEqual(['/', '/research/', '/projects/', '/records/', '/player-log/']);
    expect(VARIANT_STATIC_PATHS.data).toEqual(['/', '/research/', '/projects/', '/records/']);
    expect([...SHARED_PATHS]).toEqual(['/privacy/', '/credits/', '/stats/']);
    expect(CHOOSER_PATH).toBe('/');
    expect(BASE_PATH.playerLog).toBe('/player-log/');
    expect(LEGACY_VARIANT).toBe('game');
    expect([...LEGACY_HOME_ANCHORS]).toEqual(['main-menu', 'featured-projects', 'research-highlight', 'patch-notes', 'hello']);
    expect(isVariantId('game')).toBe(true);
    expect(isVariantId('data')).toBe(true);
    for (const bad of ['en', 'neutral', '', null, undefined, 1]) expect(isVariantId(bad), String(bad)).toBe(false);
  });
});

describe('route table v2 (final names, A-2)', () => {
  it('variantBasePaths: game 9, data 8 — static pages, then paper pages, then project pages', () => {
    const game = variantBasePaths('game');
    expect(game).toEqual([
      '/', '/research/', '/projects/', '/records/', '/player-log/',
      '/research/cog-2026-engagement/',
      ...PROJECT_PAGE_SLUGS.map((slug) => `/projects/${slug}/`),
    ]);
    expect(game).toHaveLength(VARIANT_STATIC_PATHS.game.length + STORY_SLUGS.length + PROJECT_PAGE_SLUGS.length);
    const data = variantBasePaths('data');
    expect(data).toEqual(game.filter((base) => base !== '/player-log/'));
  });

  it('routePath is a pure prefix join; variantRoutes, sharedRoutes and chooserRoute build on it', () => {
    expect(LANG_PREFIX).toEqual({ ko: '', en: '/en' });
    expect(routePath('/', 'ko', null)).toBe('/');
    expect(routePath('/', 'en', null)).toBe('/en/');
    expect(routePath('/', 'en', 'game')).toBe('/en/game/');
    expect(routePath('/records/#job-fit', 'ko', 'data')).toBe('/data/records/#job-fit');
    expect(routePath('/stats/', 'en', null)).toBe('/en/stats/');
    expect(variantRoutes('data', 'en')[0]).toBe('/en/data/');
    expect(variantRoutes('game', 'ko')).toContain('/game/player-log/');
    expect(variantRoutes('data', 'ko')).not.toContain('/data/player-log/');
    expect(sharedRoutes('en')).toEqual(['/en/privacy/', '/en/credits/', '/en/stats/']);
    expect(chooserRoute('ko')).toBe('/');
    expect(chooserRoute('en')).toBe('/en/');
  });

  it('parseRoute maps every table route back to lang, variant, base and kind; anything else is null', () => {
    expect(parseRoute('/')).toEqual({ route: '/', lang: 'ko', variant: null, base: '/', kind: 'chooser' });
    expect(parseRoute('/en/')).toEqual({ route: '/en/', lang: 'en', variant: null, base: '/', kind: 'chooser' });
    expect(parseRoute('/en/game/records/')).toEqual({ route: '/en/game/records/', lang: 'en', variant: 'game', base: '/records/', kind: 'variant' });
    expect(parseRoute('/data/projects/kickick-park')).toEqual({ route: '/data/projects/kickick-park/', lang: 'ko', variant: 'data', base: '/projects/kickick-park/', kind: 'variant' });
    expect(parseRoute('/game/records/?x=1#job-fit')?.base).toBe('/records/');
    expect(parseRoute('/en/stats/')).toEqual({ route: '/en/stats/', lang: 'en', variant: null, base: '/stats/', kind: 'shared' });
    for (const bad of ['/records/', '/data/player-log/', '/game/nope/', '/404.html', '/print/resume-ko/', '/en/en/', '/link-return/', '/en/link-return/']) {
      expect(parseRoute(bad), bad).toBeNull();
    }
    for (const lang of ['ko', 'en'] as const) {
      for (const variant of VARIANT_IDS) {
        for (const route of variantRoutes(variant, lang)) expect(parseRoute(route)?.route, route).toBe(route);
      }
    }
  });

  it('AL-16: /link-return/ is a utility page outside the route table', () => {
    expect(parseRoute('/link-return/')).toBeNull();
    expect(parseRoute('/link-return/?s=abc#gh=x')).toBeNull();
    expect(allRoutes().filter((r) => r.includes('link-return'))).toEqual([]);
  });

  it('variantParamsFor lists the versions that have a base path', () => {
    expect(variantParamsFor('/')).toEqual([{ params: { variant: 'game' } }, { params: { variant: 'data' } }]);
    expect(variantParamsFor('/player-log/')).toEqual([{ params: { variant: 'game' } }]);
    expect(variantParamsFor('/nope/')).toEqual([]);
  });

  it('legacyRedirects: every old game page except the home, per language, to the same base under /game/', () => {
    const all = legacyRedirects();
    const perLang = variantBasePaths(LEGACY_VARIANT).length - 1;
    expect(all).toHaveLength(perLang * 2);
    expect(all).toContainEqual({ from: '/records/', to: '/game/records/', lang: 'ko' });
    expect(all).toContainEqual({ from: '/en/player-log/', to: '/en/game/player-log/', lang: 'en' });
    expect(all).toContainEqual({ from: '/en/research/cog-2026-engagement/', to: '/en/game/research/cog-2026-engagement/', lang: 'en' });
    expect(all.map((r) => r.from)).not.toContain('/');
    expect(all.map((r) => r.from)).not.toContain('/en/');
    for (const r of all) expect(parseRoute(r.to)?.variant, r.to).toBe('game');
  });

  it('anchorsFor drops module-owned ids for versions without the module; shared pages only without a version', () => {
    expect(ANCHOR_MODULES).toEqual({
      'main-menu': 'mainMenu', membership: 'playerLog', 'favorite-games': 'playerLog', 'game-achievements': 'playerLog', 'site-achievements': 'playerLog', 'for-game-teams': 'audienceGame',
    });
    expect(anchorsFor('/', 'game')).toEqual(ANCHORS['/']);
    expect(anchorsFor('/', 'data')).toEqual(['featured-projects', 'research-highlight', 'patch-notes', 'hello']);
    expect(anchorsFor('/player-log/', 'data')).toEqual([]);
    expect(anchorsFor('/records/', 'data')).toEqual(ANCHORS['/records/']);
    expect(anchorsFor('/stats/', null)).toEqual(['summary']);
    expect(anchorsFor('/records/', null)).toEqual([]);
    expect(anchorsFor('/', null)).toEqual([]);
  });

  it('isKnownInternalHref(href, variant) follows the contract §1.3 rules', () => {
    // shared pages: any version (or none); hashes from anchorsFor(path, null)
    for (const v of [null, 'game', 'data'] as const) {
      expect(isKnownInternalHref('/stats/', v)).toBe(true);
      expect(isKnownInternalHref('/stats/#summary', v)).toBe(true);
      expect(isKnownInternalHref('/privacy/#x', v)).toBe(false);
      for (const pdf of Object.values(DOCUMENTS)) expect(isKnownInternalHref(pdf, v), pdf).toBe(true);
    }
    expect(isKnownInternalHref(`${Object.values(DOCUMENTS)[0]}#page=2`, 'game')).toBe(false);
    // the chooser only without a version and without a hash
    expect(isKnownInternalHref('/', null)).toBe(true);
    expect(isKnownInternalHref('/#hello', null)).toBe(false);
    // version pages
    expect(isKnownInternalHref('/player-log/', 'data')).toBe(false);
    expect(isKnownInternalHref('/#main-menu', 'data')).toBe(false);
    expect(isKnownInternalHref('/#hello', 'data')).toBe(true);
    expect(isKnownInternalHref('/records/', null)).toBe(false);
    // never: prefixed, query, absolute, no trailing slash
    for (const bad of ['/game/records/', '/data/', '/en/stats/', '/records/?x=1', 'https://lunecid.github.io/', '/records']) {
      expect(isKnownInternalHref(bad, 'game'), bad).toBe(false);
    }
  });
});
