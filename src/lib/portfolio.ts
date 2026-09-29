// src/lib/portfolio.ts — the common frame (B-8, spec §4.1, contract §1.4): the only reader of the fact collections
// (projects, publications, news, resume, awards; jobfit from P1-6). Views, components, layouts and page files read
// facts only through this module (tests/unit/portfolio-boundary.test.ts). The async readers are thin wrappers over
// pure helpers that vitest covers; the build covers the collection reads.
import type { ImageMetadata } from 'astro';
import { getCollection, getEntry, type CollectionEntry } from 'astro:content';
import photo from '../assets/photo/photo-id.webp';
import { DOCUMENTS, SITE, type DocumentId } from '../config';
import type { AwardData, JobfitData, ResumeData } from '../content/schemas';
import type { Lang } from '../i18n/ui';
import { splitEntryId, type Localized } from '../i18n/utils';
import type { JobfitId } from '../types';
import { VARIANT_IDS, type VariantId } from '../variants/ids';
import { parseOrderItem, type OrderItem } from '../variants/types';
import { buildFactSource, graduationEntry, type FactSource } from './facts';
import { hasProjectPage, projectSlug } from './projects';
import { PROJECT_SLUGS, type ProjectSlug } from './routes';

export type ProjectEntry = CollectionEntry<'projects'>;
export type PublicationEntry = CollectionEntry<'publications'>;
export type NewsEntry = CollectionEntry<'news'>;

export interface Person {
  name: Localized;
  email: string;
  github: string;
  /** SITE.daconUrl (site-v1 e40655f): RecordsHead's `contact.dacon`; never in the footers (P-04). */
  dacon: string;
  siteUrl: string;
  photo: ImageMetadata;
  affiliation: Localized;
  advisor: Localized;
  location: Localized;
  education: ResumeData['education'];
  /** The education entry with expected: true (else the latest end). */
  graduation: { ym: string; expected: boolean };
  researchIds: ResumeData['researchIds'];
  researchInterests: ResumeData['profile']['researchInterests'];
}

export async function getResume(): Promise<ResumeData> {
  const entry = await getEntry('resume', 'resume');
  if (!entry) throw new Error('portfolio: src/data/resume.yaml did not load');
  return entry.data;
}

export async function getPerson(): Promise<Person> {
  const resume = await getResume();
  const p = resume.profile;
  const grad = graduationEntry(resume.education);
  return {
    name: p.name,
    email: SITE.email,
    github: SITE.githubUrl,
    dacon: SITE.daconUrl,
    siteUrl: SITE.url,
    photo,
    affiliation: p.affiliation,
    advisor: p.advisor,
    location: p.location,
    education: resume.education,
    graduation: { ym: grad.end, expected: grad.expected },
    researchIds: resume.researchIds,
    researchInterests: p.researchInterests,
  };
}

/** CA-10: PROJECT_SLUGS order (versions reorder with their order lists); a slug outside the list fails the build. */
export function sortBySlugOrder<T extends { id: string }>(entries: readonly T[]): T[] {
  const rank = (entry: T): number => {
    const i = (PROJECT_SLUGS as readonly string[]).indexOf(splitEntryId(entry.id).slug);
    if (i === -1) throw new Error(`portfolio: project ${entry.id} is not in PROJECT_SLUGS (src/lib/routes.ts)`);
    return i;
  };
  // Rank every entry first: sort() never calls the comparator for a one-entry list, and an unknown slug must still fail.
  return entries
    .map((entry) => ({ entry, i: rank(entry) }))
    .sort((a, b) => a.i - b.i)
    .map(({ entry }) => entry);
}

export async function getProjects(lang: Lang): Promise<ProjectEntry[]> {
  return sortBySlugOrder(await getCollection('projects', ({ id }) => id.startsWith(`${lang}/`)));
}

export async function getProject(slug: ProjectSlug, lang: Lang): Promise<ProjectEntry> {
  const entry = await getEntry('projects', `${lang}/${slug}`);
  if (!entry) throw new Error(`portfolio: no project ${lang}/${slug}`);
  return entry;
}

/** CA-10: year descending, then highlighted entries first (today's order). */
export function sortPublications<T extends { data: { year: number; highlight: boolean } }>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => b.data.year - a.data.year || Number(b.data.highlight) - Number(a.data.highlight));
}

export async function getPublications(): Promise<PublicationEntry[]> {
  return sortPublications(await getCollection('publications'));
}

export async function getPublication(id: string): Promise<PublicationEntry> {
  const entry = await getEntry('publications', id);
  if (!entry) throw new Error(`portfolio: no publication ${id}`);
  return entry;
}

/** CA-10: publications with a paper page; each page must be the base path /research/<id>/ (the route slug is the id). */
export function checkPaperPages<T extends { id: string; data: { caseStudy?: string } }>(entries: readonly T[]): T[] {
  const pages = entries.filter((entry) => entry.data.caseStudy !== undefined);
  for (const entry of pages) {
    if (entry.data.caseStudy !== `/research/${entry.id}/`) {
      throw new Error(`publications: ${entry.id} has caseStudy "${entry.data.caseStudy}", expected "/research/${entry.id}/"`);
    }
  }
  return pages;
}

export async function getPaperPages(): Promise<PublicationEntry[]> {
  return checkPaperPages(await getCollection('publications'));
}

export type OrderedItem =
  | { kind: 'project'; slug: ProjectSlug; entry: ProjectEntry }
  | { kind: 'pub'; id: string; entry: PublicationEntry };

/** CA-10: pure part of resolveOrder over one language's project entries and the publications. */
export function orderedItems<P extends { id: string }, Q extends { id: string }>(
  order: readonly OrderItem[],
  projects: readonly P[],
  publications: readonly Q[],
): ({ kind: 'project'; slug: ProjectSlug; entry: P } | { kind: 'pub'; id: string; entry: Q })[] {
  const seen = new Set<string>();
  return order.map((item) => {
    if (seen.has(item)) throw new Error(`portfolio: duplicate order item ${item}`);
    seen.add(item);
    const ref = parseOrderItem(item);
    if (ref.kind === 'pub') {
      const entry = publications.find((p) => p.id === ref.id);
      if (!entry) throw new Error(`portfolio: unknown publication in order item ${item}`);
      return { kind: 'pub' as const, id: ref.id, entry };
    }
    const entry = projects.find((p) => splitEntryId(p.id).slug === ref.slug);
    if (!entry) throw new Error(`portfolio: unknown project in order item ${item}`);
    return { kind: 'project' as const, slug: ref.slug, entry };
  });
}

/** Resolves a version order list; throws on an unknown slug/id or a duplicate. */
export async function resolveOrder(order: readonly OrderItem[], lang: Lang): Promise<OrderedItem[]> {
  return orderedItems(order, await getProjects(lang), await getCollection('publications')) as OrderedItem[];
}

export async function getAwards(): Promise<AwardData[]> {
  return (await getCollection('awards')).map((entry) => entry.data);
}

export async function getSkills(): Promise<ResumeData['skills']> {
  return (await getResume()).skills;
}

export async function getNews(): Promise<NewsEntry[]> {
  return getCollection('news');
}

/** The version's job-fit table, or null while its file is absent (the pending state, §2.6). */
export async function getJobfit(id: JobfitId): Promise<JobfitData | null> {
  const entry = await getEntry('jobfit', id);
  return entry ? entry.data : null;
}

export interface DocumentEntry {
  id: DocumentId;
  label: Localized;
  href: string;
}

/** CA-10: DOCUMENTS key order; every document needs its label in resume.yaml documents. */
export function documentEntries(documents: readonly { id: string; label: Localized }[]): DocumentEntry[] {
  return (Object.keys(DOCUMENTS) as DocumentId[]).map((id) => {
    const doc = documents.find((d) => d.id === id);
    if (!doc) throw new Error(`portfolio: resume.yaml documents has no ${id}`);
    return { id, label: doc.label, href: DOCUMENTS[id] };
  });
}

export async function getDocuments(): Promise<DocumentEntry[]> {
  return documentEntries((await getResume()).documents);
}

async function buildFromCollections(): Promise<FactSource> {
  const [resume, awards, publications, projects] = await Promise.all([getResume(), getAwards(), getCollection('publications'), getCollection('projects')]);
  return buildFactSource({
    resume,
    awards,
    publications: publications.map((entry) => ({ id: entry.id, data: entry.data })),
    projects: projects.map((entry) => ({ ...splitEntryId(entry.id), data: entry.data })),
  });
}

let factSource: Promise<FactSource> | null = null;
/** Memoized per production build; rebuilt on every call in dev so edited data shows up without a restart. */
export function getFactSource(): Promise<FactSource> {
  if (!import.meta.env.PROD) return buildFromCollections();
  factSource ??= buildFromCollections();
  return factSource;
}

/** getStaticPaths helper for [variant]/research/[slug] pages (version × paper page). */
export async function variantPaperPaths(): Promise<{ params: { variant: VariantId; slug: string }; props: { entry: PublicationEntry } }[]> {
  const papers = await getPaperPages();
  return VARIANT_IDS.flatMap((variant) => papers.map((entry) => ({ params: { variant, slug: entry.id }, props: { entry } })));
}

/** getStaticPaths helper for [variant]/projects/[slug] pages (version × project with a page, in one language). */
export async function variantProjectPaths(lang: Lang): Promise<{ params: { variant: VariantId; slug: string }; props: { entry: ProjectEntry } }[]> {
  const entries = (await getProjects(lang)).filter((entry) => hasProjectPage(entry.data));
  return VARIANT_IDS.flatMap((variant) => entries.map((entry) => ({ params: { variant, slug: projectSlug(entry) }, props: { entry } })));
}
