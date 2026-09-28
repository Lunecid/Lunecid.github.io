// src/lib/routes.ts — the page list, slugs and the section ids that always render.
import type { Lang } from '../i18n/ui';
import { DOCUMENTS } from '../config.ts'; // .ts: scripts/fetch-goatcounter.mjs imports this file with plain Node

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
export const STATIC_PATHS = ['/', '/research/', '/projects/', '/records/', '/player-log/', '/stats/', '/privacy/', '/credits/'] as const;

/** Korean-form paths of every page: 8 static + 1 paper + 3 project pages = 12. */
export function koPaths(): string[] {
  return [
    ...STATIC_PATHS,
    ...STORY_SLUGS.map((slug) => `/research/${slug}/`),
    ...PROJECT_PAGE_SLUGS.map((slug) => `/projects/${slug}/`),
  ];
}

/** Paths for one language (en = '/en' + ko path). */
export function routesFor(lang: Lang): string[] {
  const ko = koPaths();
  return lang === 'ko' ? ko : ko.map((path) => `/en${path}`);
}

/** All 24 routes (12 per language), ko first then en. */
export function allRoutes(): string[] {
  return [...routesFor('ko'), ...routesFor('en')];
}
// Print routes are NOT listed here: use Object.values(PRINT_ROUTES) from src/config.ts (single definition).

/** Section ids that always render (data-independent). Keys are Korean-form paths. */
export const ANCHORS: Readonly<Record<string, readonly string[]>> = {
  '/': ['main-menu', 'featured-projects', 'research-highlight', 'patch-notes', 'hello'],
  '/research/': ['interests', 'publications', 'in-progress', 'for-labs'],
  '/research/cog-2026-engagement/': ['abstract', 'bibtex'],
  '/projects/': ['project-list'],
  '/records/': ['profile', 'education', 'publications', 'projects', 'awards', 'activities', 'certifications', 'languages', 'training', 'skills', 'job-fit', 'documents'],
  '/player-log/': ['membership', 'favorite-games', 'site-achievements'], // game-achievements only with an account feed (D-13)
  '/stats/': ['summary'],
};

const DOCUMENT_HREFS: readonly string[] = Object.values(DOCUMENTS);

/** True for a Korean-form internal href whose path is in koPaths() (or a DOCUMENTS pdf) and whose #hash, if any, is in ANCHORS[path]. */
export function isKnownInternalHref(href: string): boolean {
  if (!href.startsWith('/') || href.startsWith('//')) return false;
  const hashAt = href.indexOf('#');
  const path = hashAt === -1 ? href : href.slice(0, hashAt);
  const hash = hashAt === -1 ? null : href.slice(hashAt + 1);
  if (DOCUMENT_HREFS.includes(path)) return hash === null;
  if (!koPaths().includes(path)) return false;
  if (hash === null) return true;
  return (ANCHORS[path] ?? []).includes(hash);
}
