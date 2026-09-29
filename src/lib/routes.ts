// src/lib/routes.ts — the route table (chooser, two versions × two languages, shared pages), slugs, section anchors
// and legacy URLs (spec §3, contract §1.3). Plain-Node safe: runtime imports only of import-free files, each with an
// explicit .ts (scripts/fetch-goatcounter.mjs, scripts/redirects/build.mjs and scripts/markdown/* import this file).
import type { Lang } from '../i18n/ui';
import { DOCUMENTS } from '../config.ts';
import {
  CHOOSER_PATH,
  LEGACY_VARIANT,
  SHARED_PATHS,
  VARIANT_IDS,
  VARIANT_MODULES,
  VARIANT_PREFIX,
  VARIANT_STATIC_PATHS,
  type ModuleId,
  type VariantId,
} from '../variants/ids.ts';

/** Every project in the collection (records summary, résumé PDFs, /projects/ cards). */
export const PROJECT_SLUGS = ['school-zone-blindspots', 'kickick-park', 'youth-startup-location', 'kbo-attendance', 'seoul-apartment-automl'] as const;
export type ProjectSlug = (typeof PROJECT_SLUGS)[number];
/**
 * Projects with a case-study page at /projects/<slug>/. The others are status 'card' (D-4): a short, link-less
 * card on /projects/ and a line on /records/, no page (tests/content/projects.test.ts keeps the two in sync).
 */
export const PROJECT_PAGE_SLUGS = ['school-zone-blindspots', 'kickick-park', 'youth-startup-location'] as const satisfies readonly ProjectSlug[];
/** Paper pages at /research/<slug>/ (publication ids with a caseStudy page; abstract-only since D-15). */
export const STORY_SLUGS = ['cog-2026-engagement'] as const;

const LANGS: readonly Lang[] = ['ko', 'en'];

// Print routes are NOT listed here: use Object.values(PRINT_ROUTES) from src/config.ts (single definition).

// ── route table v2 ──
export const LANG_PREFIX: Readonly<Record<Lang, '' | '/en'>> = { ko: '', en: '/en' };

/** Base paths of one version's pages: VARIANT_STATIC_PATHS[v], then paper pages, then project pages. game 9, data 8. */
export function variantBasePaths(variant: VariantId): string[] {
  return [
    ...VARIANT_STATIC_PATHS[variant],
    ...STORY_SLUGS.map((slug) => `/research/${slug}/`),
    ...PROJECT_PAGE_SLUGS.map((slug) => `/projects/${slug}/`),
  ];
}

/** Pure path builder, no validation: (lang prefix) + (version prefix) + base. routePath('/', 'en', 'game') = '/en/game/'. */
export function routePath(base: string, lang: Lang, variant: VariantId | null): string {
  return `${LANG_PREFIX[lang]}${variant === null ? '' : VARIANT_PREFIX[variant]}${base}`;
}

export function variantRoutes(variant: VariantId, lang: Lang): string[] {
  return variantBasePaths(variant).map((base) => routePath(base, lang, variant));
}

export function sharedRoutes(lang: Lang): string[] {
  return SHARED_PATHS.map((base) => routePath(base, lang, null));
}

export function chooserRoute(lang: Lang): string {
  return routePath(CHOOSER_PATH, lang, null);
}

/** One language: [chooser, ...game, ...data, ...shared] (contract §2.1). */
export function routesFor(lang: Lang): string[] {
  return [chooserRoute(lang), ...VARIANT_IDS.flatMap((variant) => variantRoutes(variant, lang)), ...sharedRoutes(lang)];
}

/** routesFor('ko') then routesFor('en'). */
export function allRoutes(): string[] {
  return [...routesFor('ko'), ...routesFor('en')];
}

export type RouteKind = 'chooser' | 'variant' | 'shared';
export interface RouteInfo {
  route: string;
  lang: Lang;
  variant: VariantId | null;
  base: string;
  kind: RouteKind;
}

/** Pathname (query/hash ignored, trailing slash added) → RouteInfo, or null for anything not in allRoutes(). */
export function parseRoute(pathname: string): RouteInfo | null {
  const cut = pathname.search(/[?#]/);
  const bare = cut === -1 ? pathname : pathname.slice(0, cut);
  const route = bare.endsWith('/') ? bare : `${bare}/`;
  for (const lang of LANGS) {
    if (route === chooserRoute(lang)) return { route, lang, variant: null, base: CHOOSER_PATH, kind: 'chooser' };
    for (const base of SHARED_PATHS) {
      if (route === routePath(base, lang, null)) return { route, lang, variant: null, base, kind: 'shared' };
    }
    for (const variant of VARIANT_IDS) {
      for (const base of variantBasePaths(variant)) {
        if (route === routePath(base, lang, variant)) return { route, lang, variant, base, kind: 'variant' };
      }
    }
  }
  return null;
}

/** The versions that have `base` (contract §1.3; the [variant] pages it served were split per version in P2-2a). */
export function variantParamsFor(base: string): { params: { variant: VariantId } }[] {
  return VARIANT_IDS.filter((variant) => variantBasePaths(variant).includes(base)).map((variant) => ({ params: { variant } }));
}

export interface LegacyRedirect {
  from: string;
  to: string;
  lang: Lang;
}

/** Every old game HTML page except '/' and '/en/' (they are the chooser) → the same base under /game/. 8 per language. */
export function legacyRedirects(): LegacyRedirect[] {
  return LANGS.flatMap((lang) =>
    variantBasePaths(LEGACY_VARIANT)
      .filter((base) => base !== CHOOSER_PATH)
      .map((base) => ({ from: routePath(base, lang, null), to: routePath(base, lang, LEGACY_VARIANT), lang })),
  );
}

/** Section ids that always render (data-independent), keyed by base path (version pages) or shared path. */
export const ANCHORS: Readonly<Record<string, readonly string[]>> = {
  '/': ['main-menu', 'featured-projects', 'research-highlight', 'patch-notes', 'hello'], // the version home, not the chooser
  '/research/': ['interests', 'publications', 'in-progress', 'for-labs'],
  '/research/cog-2026-engagement/': ['abstract', 'bibtex'],
  '/projects/': ['project-list'],
  '/records/': ['profile', 'education', 'publications', 'projects', 'awards', 'activities', 'certifications', 'languages', 'training', 'skills', 'job-fit', 'documents'],
  '/player-log/': ['membership', 'favorite-games', 'site-achievements'], // game-achievements only with an account feed (D-13)
  '/stats/': ['summary'],
};

/** Anchors owned by a module; dropped for versions without that module (CA-2 adds for-game-teams). */
export const ANCHOR_MODULES: Readonly<Record<string, ModuleId>> = {
  'main-menu': 'mainMenu',
  membership: 'playerLog',
  'favorite-games': 'playerLog',
  'site-achievements': 'playerLog',
  'for-game-teams': 'audienceGame',
};

/** ANCHORS[base] minus module-owned ids the version lacks; variant null → ANCHORS[base] only for SHARED_PATHS, else []. */
export function anchorsFor(base: string, variant: VariantId | null): readonly string[] {
  const ids = ANCHORS[base] ?? [];
  if (variant === null) return (SHARED_PATHS as readonly string[]).includes(base) ? ids : [];
  const modules = VARIANT_MODULES[variant];
  return ids.filter((id) => {
    const owner = ANCHOR_MODULES[id];
    return owner === undefined || modules.includes(owner);
  });
}

const DOCUMENT_HREFS: readonly string[] = Object.values(DOCUMENTS);
const PREFIXED = /^\/(?:en|game|data)(?:\/|$)/;

/**
 * `href` is BASE form (Korean, version-free) with an optional #hash. True when:
 * - the path is a DOCUMENTS pdf and there is no hash; or
 * - the path is a SHARED_PATHS entry (any `variant`) and the hash, if any, is in anchorsFor(path, null); or
 * - the path is '/' and variant === null (the chooser) and there is no hash; or
 * - variant !== null, the path is in variantBasePaths(variant) and the hash, if any, is in anchorsFor(path, variant).
 * No trailing slash, query strings, absolute or protocol-relative URLs, and already-prefixed paths → false.
 */
export function isKnownInternalHref(href: string, variant: VariantId | null): boolean {
  if (!href.startsWith('/') || href.startsWith('//') || href.includes('?')) return false;
  const hashAt = href.indexOf('#');
  const path = hashAt === -1 ? href : href.slice(0, hashAt);
  const hash = hashAt === -1 ? null : href.slice(hashAt + 1);
  if (DOCUMENT_HREFS.includes(path)) return hash === null;
  if (PREFIXED.test(path)) return false;
  if ((SHARED_PATHS as readonly string[]).includes(path)) return hash === null || anchorsFor(path, null).includes(hash);
  if (path === CHOOSER_PATH && variant === null) return hash === null;
  if (variant === null || !variantBasePaths(variant).includes(path)) return false;
  return hash === null || anchorsFor(path, variant).includes(hash);
}
