// src/variants/index.ts — the version registry and lookups. Views read a version only through Astro.props.variant.
import { PAGE_META, type CommonPageKey, type PageKey } from '../data/copy/pages';
import type { Lang } from '../i18n/ui';
import type { Localized } from '../i18n/utils';
import { resolveFacts, type FactSource } from '../lib/facts';
import type { NavSection } from '../types';
import { dataVariant } from './data';
import { gameVariant } from './game';
import type { VariantId } from './ids';
import type { CaptionKey, IdentityCopy, PageMetaText, Variant, VariantPageKey } from './types';

export * from './ids';
export type * from './types';
export { CAPTION_KEYS, parseOrderItem } from './types';
export { NEUTRAL_IDENTITY } from './neutral';

export const VARIANTS: Readonly<Record<VariantId, Variant>> = { game: gameVariant, data: dataVariant };

export function getVariant(id: VariantId): Variant {
  return VARIANTS[id];
}

export type ResolvedIdentity = { [K in keyof IdentityCopy]: K extends 'labNote' ? { title: string; body: string } : string };

export function resolveIdentity(variant: Variant, lang: Lang, facts: FactSource): ResolvedIdentity {
  const r = (text: Localized): string => resolveFacts(text[lang], lang, facts);
  const { identity } = variant;
  return {
    headline: r(identity.headline),
    siteTitle: r(identity.siteTitle),
    tagline: r(identity.tagline),
    status: r(identity.status),
    about: r(identity.about),
    labNote: { title: r(identity.labNote.title), body: r(identity.labNote.body) },
  };
}

/** Version override first, else PAGE_META (common keys); tokens resolved. */
export function pageMetaFor(key: PageKey, lang: Lang, variant: VariantId | null, facts: FactSource): PageMetaText {
  const own = variant === null ? undefined : getVariant(variant).pageMeta[key as VariantPageKey];
  const common = key in PAGE_META ? PAGE_META[key as CommonPageKey] : undefined;
  const text = own?.[lang] ?? common?.[lang];
  if (!text) throw new Error(`pageMetaFor: no meta for '${key}' (${variant ?? 'neutral'})`);
  return { title: resolveFacts(text.title, lang, facts), description: resolveFacts(text.description, lang, facts) };
}

export function captionFor(variant: Variant, key: CaptionKey, lang: Lang): string {
  return variant.captions[key][lang];
}

/** CA-18: the base path of a nav section of this version; throws when the version has no such section. */
export function navBase(variant: Variant, key: NavSection): string {
  const item = variant.nav.find((n) => n.key === key);
  if (!item) throw new Error(`navBase: the ${variant.id} version has no ${key} section`);
  return item.base;
}
