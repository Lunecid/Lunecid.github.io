// src/lib/links.ts — the only builder of internal links (R-5, contract §2.3). Data stores BASE form (Korean,
// version-free, e.g. '/records/#job-fit'); this module adds '/en' and '/game' | '/data'. An unknown target is a build
// error (A-4), so a broken link never ships.
import { DOCUMENTS } from '../config';
import type { Lang } from '../i18n/ui';
import { SHARED_PATHS, type VariantId } from '../variants/ids';
import { chooserRoute, isKnownInternalHref, routePath, variantBasePaths } from './routes';

export { switchLocalePath as langSwitchHref } from '../i18n/utils';

export interface HrefContext {
  lang: Lang;
  variant: VariantId | null;
}

export class UnknownInternalHrefError extends Error {
  readonly href: string;
  readonly variant: VariantId | null;
  constructor(href: string, variant: VariantId | null) {
    super(`pageHref: "${href}" is not a known internal page${variant === null ? ' (no version)' : ` of the ${variant} version`}; data stores base form such as '/records/#job-fit'`);
    this.name = 'UnknownInternalHrefError';
    this.href = href;
    this.variant = variant;
  }
}

const DOCUMENT_HREFS: readonly string[] = Object.values(DOCUMENTS);
const EXTERNAL = /^(?:https?:|mailto:)/;

/**
 * The only builder of internal links. `base` is BASE form.
 * - http(s):, mailto:, '//' and bare '#hash' → unchanged.  - a DOCUMENTS pdf (no hash) → unchanged.
 * - a SHARED_PATHS path → routePath(base, lang, null).      - '/' with variant null → the chooser route.
 * - otherwise isKnownInternalHref(base, variant) with variant !== null → routePath(base, lang, variant).
 * Anything else throws UnknownInternalHrefError, including an already-prefixed path.
 */
export function pageHref(base: string, ctx: HrefContext): string {
  if (EXTERNAL.test(base) || base.startsWith('//') || base.startsWith('#')) return base;
  const hashAt = base.indexOf('#');
  const path = hashAt === -1 ? base : base.slice(0, hashAt);
  if (DOCUMENT_HREFS.includes(path) && hashAt === -1) return base;
  if ((SHARED_PATHS as readonly string[]).includes(path)) {
    if (!isKnownInternalHref(base, null)) throw new UnknownInternalHrefError(base, ctx.variant);
    return routePath(base, ctx.lang, null);
  }
  if (ctx.variant === null) {
    if (base === '/') return chooserRoute(ctx.lang);
    throw new UnknownInternalHrefError(base, null);
  }
  if (!isKnownInternalHref(base, ctx.variant)) throw new UnknownInternalHrefError(base, ctx.variant);
  return routePath(base, ctx.lang, ctx.variant);
}

/** routePath('/', lang, variant): '/game/', '/en/data/'. */
export function homeHref(lang: Lang, variant: VariantId): string {
  return routePath('/', lang, variant);
}

/** '/', '/en/', or with { choose: true } '/?choose', '/en/?choose' (the chooser skips its redirect). */
export function chooserHref(lang: Lang, opts: { choose?: boolean } = {}): string {
  return opts.choose === true ? `${chooserRoute(lang)}?choose` : chooserRoute(lang);
}

export function otherVariant(variant: VariantId): VariantId {
  return variant === 'game' ? 'data' : 'game';
}

export interface VariantSwitchLink {
  target: VariantId;
  href: string;
  samePage: boolean;
}

/** Same language, same base when the target version has it (samePage true), else the target version home. */
export function switchVariantHref(base: string, lang: Lang, from: VariantId): VariantSwitchLink {
  const target = otherVariant(from);
  const samePage = variantBasePaths(target).includes(base);
  return { target, href: samePage ? routePath(base, lang, target) : homeHref(lang, target), samePage };
}

/** CA-3: base path of a project case study. */
export function projectBase(slug: string): string {
  return `/projects/${slug}/`;
}

/** CA-3: base path of a paper page. */
export function paperBase(id: string): string {
  return `/research/${id}/`;
}
