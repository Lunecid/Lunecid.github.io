// src/variants/types.ts — the shape of a version's presentation data (contract §1.6). Facts never live here: copy strings
// reach them through fact tokens (§3), and the fact lint (P1-8) scans every string leaf of src/variants/*.ts.
import type { DocumentId } from '../config';
import type { Lang } from '../i18n/ui';
import type { Localized } from '../i18n/utils';
import type { JobfitId, NavSection } from '../types';
import type { ModuleId, VariantId } from './ids';
import { PROJECT_SLUGS, type ProjectSlug } from '../lib/routes';

export type ProjectRef = `project:${ProjectSlug}`;
export type PubRef = `pub:${string}`; // validated against publications at build (resolveOrder)
export type OrderItem = ProjectRef | PubRef;

export function parseOrderItem(item: OrderItem): { kind: 'project'; slug: ProjectSlug } | { kind: 'pub'; id: string } {
  const match = /^(project|pub):([a-z0-9-]+)$/.exec(item);
  if (!match) throw new Error(`variants: "${item}" is not an order item (project:<slug> | pub:<id>)`);
  const [, kind, ref] = match as unknown as [string, 'project' | 'pub', string];
  if (kind === 'pub') return { kind, id: ref };
  if (!(PROJECT_SLUGS as readonly string[]).includes(ref)) throw new Error(`variants: unknown project "${ref}" in ${item}`);
  return { kind, slug: ref as ProjectSlug };
}

export interface VariantOrders {
  homeFeatured: readonly OrderItem[]; // exactly 3, all with a page
  projectsOrder: readonly OrderItem[]; // every project slug once + every publication that has `card` once
  recordsProjectsOrder: readonly ProjectRef[]; // every PROJECT_SLUG once (publications have their own #publications)
  pdfProjectOrder: readonly OrderItem[]; // every item with any true pdf flag the version's résumés use, once
}

/** R-3: per-version identity copy. Strings may contain fact tokens and nothing else fact-like. */
export interface IdentityCopy {
  headline: Localized; // PDF headline, JSON-LD jobTitle, game hero class line (en.toUpperCase())
  siteTitle: Localized; // og:site_name (replaces ui.ts 'site.title')
  tagline: Localized; // hero slogan, records head, PDF tagline
  status: Localized; // hero STATUS line, records head
  about: Localized; // profile bio
  labNote: { title: Localized; body: Localized }; // research page #for-labs block
}

export interface VariantDocuments {
  resume: Readonly<Record<Lang, DocumentId>>; // nav CV button + records primary button (off research pages)
  academic: DocumentId; // CV button on research pages (D-7): 'cv-academic'
  list: readonly DocumentId[]; // records #documents, in this order
}

export interface VariantNavItem {
  key: NavSection;
  base: string;
} // numbering ('01'…) is game markup, not config

export const CAPTION_KEYS = [
  'research', 'publications', 'projects', 'selectProject', 'patchNotes', 'profile', 'questLog', 'achievements',
  'inventory', 'skills', 'jobFit', 'documents', 'interests', 'inProgress', 'forLabs', 'github', 'figures', 'links',
  'projectDetails', 'researchContribution', 'pageResearch', 'pageProjects', 'pageRecords', 'heroLabel', 'nowPlaying',
] as const;
export type CaptionKey = (typeof CAPTION_KEYS)[number];

export interface PageMetaText {
  title: string;
  description: string;
}
export type VariantPageKey = 'home' | 'research' | 'research-story' | 'projects' | 'records' | 'player-log';

export interface Variant {
  id: VariantId;
  prefix: '/game' | '/data'; // = VARIANT_PREFIX[id]
  modules: readonly ModuleId[]; // = VARIANT_MODULES[id] (same array; never a copy)
  layout: 'base' | 'data'; // P1: both 'base'; P2-2 sets data → 'data' (contract §8.1 F-3)
  theme: 'hud' | 'editorial';
  identity: IdentityCopy;
  orders: VariantOrders;
  jobfit: JobfitId;
  documents: VariantDocuments;
  nav: readonly VariantNavItem[];
  captions: Readonly<Record<CaptionKey, Localized>>;
  pageMeta: { home: Localized<PageMetaText>; records: Localized<PageMetaText> } & Partial<Record<Exclude<VariantPageKey, 'home' | 'records'>, Localized<PageMetaText>>>;
}
