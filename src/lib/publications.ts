// src/lib/publications.ts — publication entries → the card data used on home, /research/ and /records/,
// and the paper page data of /research/<id>/ (D-15: abstract only, in paper typography).
import type { ImageMetadata } from 'astro';
import type { CollectionEntry } from 'astro:content';
import { tagLabel } from '../content/tags';
import type { Lang } from '../i18n/ui';
import { FORMAT_PHRASE } from './facts';
import { pageHref, type HrefContext } from './links';
import type { CartridgeProps } from './projects';
import { CASE_ID } from '../data/research/cog-2026-case';

/** Publications with a case-study overlay (src/lib/case/*): their cards and lists open it; /case/<id>/<lang>.json. */
export const CASE_IDS = [CASE_ID] as const;

export interface PaperCardData {
  id: string;
  href: string | null; // caseStudy page (pageHref) or null
  title: string;
  titleGloss: string | null; // titleKo on ko pages only
  authors: { name: string; me: boolean }[]; // English names on both languages (paper byline)
  venue: string;
  venueShort: string;
  year: number;
  oral: boolean;
  tldr: string;
  abstract: string;
  abstractLang: Lang; // ko page shows abstractKo (abstractLang 'ko'); en shows abstract
  bibtex: string;
  pdf: string | null;
  doi: string | null;
  code: string | null;
  statusNote: string | null; // e.g. 'IEEE Xplore 게재 예정' when pdf and doi are null
  thumb: ImageMetadata;
  thumbAlt: string; // altKo on ko pages
}

export function toPaperCard(entry: CollectionEntry<'publications'>, ctx: HrefContext): PaperCardData {
  const lang = ctx.lang;
  const d = entry.data;
  const pending = d.pdf === null && d.doi === null;
  return {
    id: entry.id,
    href: d.caseStudy ? pageHref(d.caseStudy, ctx) : null,
    title: d.title,
    titleGloss: lang === 'ko' ? (d.titleKo ?? null) : null,
    authors: d.authors.map((a) => ({ name: a.name, me: a.me })),
    venue: d.venue,
    venueShort: d.venueShort,
    year: d.year,
    oral: d.format === 'Oral',
    tldr: d.tldr[lang],
    abstract: lang === 'ko' ? d.abstractKo : d.abstract,
    abstractLang: lang,
    bibtex: d.bibtex.trimEnd(),
    pdf: d.pdf,
    doi: d.doi,
    code: d.code,
    statusNote: pending ? (d.statusNote?.[lang] ?? null) : null,
    thumb: d.thumbnail.src,
    thumbAlt: lang === 'ko' ? d.thumbnail.altKo : d.thumbnail.alt,
  };
}

/**
 * Value of one field of a BibTeX entry (`booktitle = {…}` or `booktitle = "…"`), with the protective inner
 * braces removed (`{League of Legends}` → `League of Legends`) and whitespace collapsed; null when absent.
 */
export function bibtexField(bibtex: string, field: string): string | null {
  const name = field.replace(/[^a-z]/gi, '');
  const match = new RegExp(`(?:^|[\\s,{])${name}\\s*=\\s*(?:\\{((?:[^{}]|\\{[^{}]*\\})*)\\}|"([^"]*)")`, 'i').exec(bibtex);
  const raw = match ? (match[1] ?? match[2]) : undefined;
  if (raw === undefined) return null;
  const value = raw.replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
  return value === '' ? null : value;
}

export interface PaperPageData {
  id: string;
  venueLine: string; // running header: BibTeX booktitle (or journal), else venue
  title: string; // English original (the page <h1>)
  titleKo: string | null; // ko page only
  authors: { name: string; me: boolean; affiliation: string[] }[]; // English names, no e-mail
  abstract: string; // English original on both pages
  keywords: string[]; // IEEEkeywords, [] when the paper has none
  abstractKo: string | null; // ko page only
  presentation: string | null; // e.g. 'Oral presentation · Madrid, Spain · Sep 1–4, 2026'
  statusNote: string | null; // e.g. 'To appear in IEEE Xplore' while pdf and doi are null (same rule as the cards)
  code: string | null;
  doi: string | null;
  pdf: string | null;
  bibtex: string;
}

/** One publication → the paper page of /research/<id>/ (ko adds the Korean title and abstract). */
export function toPaperPage(entry: CollectionEntry<'publications'>, lang: Lang): PaperPageData {
  const d = entry.data;
  const pending = d.pdf === null && d.doi === null;
  return {
    id: entry.id,
    venueLine: bibtexField(d.bibtex, 'booktitle') ?? bibtexField(d.bibtex, 'journal') ?? d.venue,
    title: d.title,
    titleKo: lang === 'ko' ? (d.titleKo ?? null) : null,
    authors: d.authors.map((a) => ({ name: a.name, me: a.me, affiliation: a.affiliation ?? [] })),
    abstract: d.abstract,
    keywords: d.keywords ?? [],
    abstractKo: lang === 'ko' ? d.abstractKo : null,
    presentation: d.presentation?.[lang] ?? null,
    statusNote: pending ? (d.statusNote?.[lang] ?? null) : null,
    code: d.code,
    doi: d.doi,
    pdf: d.pdf,
    bibtex: d.bibtex.trimEnd(),
  };
}

/**
 * The CoG card on home and /projects/ (A-16; views built it by hand from src/data/copy/home.ts until P1-7b): title =
 * shortTitle, meta = the card's tool line, tags = card.tags, the thumbnail as a contained cover (the paper's Fig. 1,
 * owner decision 2026-10-05: Fig. 1 is the cover (reverses F-045)),
 * an ORAL sticker for an oral paper.
 */
export function toPaperCartridge(entry: CollectionEntry<'publications'>, lang: Lang, href: string | null): CartridgeProps {
  const d = entry.data;
  if (!d.card) throw new Error(`publications: ${entry.id} has no card (tags, tools) in its frontmatter`);
  return {
    ...(href === null ? {} : { href }),
    title: d.shortTitle ? d.shortTitle[lang] : d.title,
    meta: d.card.tools.join(' · '),
    tagKeys: [...d.card.tags],
    tags: d.card.tags.map((key) => tagLabel(key, lang)),
    cover: d.thumbnail.src,
    coverFit: 'contain',
    ...(d.format === 'Oral' ? { sticker: { text: 'ORAL', sr: FORMAT_PHRASE[lang].Oral, kind: 'oral' as const } } : {}),
    wide: true,
  };
}
