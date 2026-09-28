// src/lib/publications.ts — publication entries → the card data used on home, /research/ and /records/,
// and the paper page data of /research/<id>/ (D-15: abstract only, in paper typography).
import type { ImageMetadata } from 'astro';
import { getCollection, type CollectionEntry } from 'astro:content';
import type { Lang } from '../i18n/ui';
import { localizeHref } from '../i18n/utils';

export interface PaperCardData {
  id: string;
  href: string | null; // localized caseStudy path or null
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

/** Year descending, then highlighted entries first. */
export async function getPublications(): Promise<CollectionEntry<'publications'>[]> {
  const entries = await getCollection('publications');
  return [...entries].sort((a, b) => b.data.year - a.data.year || Number(b.data.highlight) - Number(a.data.highlight));
}

export function toPaperCard(entry: CollectionEntry<'publications'>, lang: Lang): PaperCardData {
  const d = entry.data;
  const pending = d.pdf === null && d.doi === null;
  return {
    id: entry.id,
    href: d.caseStudy ? localizeHref(d.caseStudy, lang) : null,
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

/** Publications that have a paper page; each page must live at /research/<id>/ (the route slug is the id). */
export async function getPaperPages(): Promise<CollectionEntry<'publications'>[]> {
  const entries = await getCollection('publications', (entry) => entry.data.caseStudy !== undefined);
  for (const entry of entries) {
    if (entry.data.caseStudy !== `/research/${entry.id}/`) {
      throw new Error(`publications: ${entry.id} has caseStudy "${entry.data.caseStudy}", expected "/research/${entry.id}/"`);
    }
  }
  return entries;
}

/** getStaticPaths for src/pages/research/[slug].astro and its /en/ twin. */
export async function paperStaticPaths(): Promise<{ params: { slug: string }; props: { entry: CollectionEntry<'publications'> } }[]> {
  return (await getPaperPages()).map((entry) => ({ params: { slug: entry.id }, props: { entry } }));
}
