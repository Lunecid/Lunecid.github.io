import type { ImageMetadata } from 'astro';
import photo from '../assets/photo/photo-id.webp';
import riskHeatmap from '../assets/projects/school-zone-blindspots/risk-heatmap.webp';
import type { Lang } from '../i18n/ui';
import { formatPeriod, LOCALES, splitEntryId, t, type UiKey } from '../i18n/utils';
import { chooserCopy } from '../data/copy/chooser';
import type { PageKey } from '../data/copy/pages';
import { captionFor, getVariant, NEUTRAL_IDENTITY, pageMetaFor, type CaptionKey } from '../variants';
import type { OgArtifact, OgInput, OgTemplate } from './og';
import type { FactSource } from './facts';
import { bibtexField } from './publications';
import { getFactSource, getPaperPages, getProjects } from './portfolio';
import { allRoutes, parseRoute } from './routes';
import { containsTrademark, ogSlugFor } from './seo';

export interface OgSources {
  /** artifact: the project's cover figure, or its metadata plate when it has none (P2-36). */
  projects: { lang: Lang; slug: string; title: string; summary: string; artifact?: OgArtifact }[];
  papers: { lang: Lang; slug: string }[]; // paper pages: title/subtitle come from PAGE_META (paper titles name a game)
  /**
   * P2-36 artifacts of the fixed pages and the paper pages (build only; the unit tests leave them out): the ID photo
   * (home, records and the other fixed pages), the paper's title block (/research/ and the paper page) and the first
   * project's figure (/projects/: the school-zone risk heatmap; the CoG card's label is an inline chart since fix round 1).
   */
  artifacts?: { photo?: OgArtifact; paper?: OgArtifact; projects?: OgArtifact };
  facts: FactSource;
}

const NAME_SUFFIX: Record<Lang, string> = { ko: ' · 백성은', en: ' · Seongeun Baek' };

/** Base path of each fixed page (the '/' entry is the version home, not the chooser) → its PAGE_META key, card eyebrow and which artifact it shows (P2-36). */
const FIXED: Readonly<Record<string, { key: PageKey; eyebrow: string; artifact: keyof NonNullable<OgSources['artifacts']> }>> = {
  '/': { key: 'home', eyebrow: 'PORTFOLIO', artifact: 'photo' },
  '/research/': { key: 'research', eyebrow: 'RESEARCH', artifact: 'paper' },
  '/projects/': { key: 'projects', eyebrow: 'PROJECT', artifact: 'projects' },
  '/records/': { key: 'records', eyebrow: 'RECORDS', artifact: 'photo' },
  '/player-log/': { key: 'player-log', eyebrow: 'PLAYER LOG', artifact: 'photo' },
  '/stats/': { key: 'stats', eyebrow: 'STATS', artifact: 'photo' },
  '/privacy/': { key: 'privacy', eyebrow: 'PRIVACY', artifact: 'photo' },
  '/credits/': { key: 'credits', eyebrow: 'CREDITS', artifact: 'photo' },
};

/** `{ artifact }` when there is one, `{}` otherwise (cards without an artifact stay text-only). */
const withArtifact = (artifact: OgArtifact | undefined): { artifact?: OgArtifact } => (artifact ? { artifact } : {});

/** Paper cards use the research-story PAGE_META title without ' · 백성은' / ' · Seongeun Baek' (§5.11). */
function withoutName(title: string, lang: Lang): string {
  const suffix = NAME_SUFFIX[lang];
  return title.endsWith(suffix) ? title.slice(0, -suffix.length) : title;
}

/** The card's template (P2-12): general pages editorial, game pages HUD, the chooser and the shared pages neutral. */
export function ogTemplateFor(route: string): OgTemplate {
  const info = parseRoute(route);
  if (!info) throw new Error(`og: ${route} is not a route`);
  return info.kind === 'variant' ? (info.variant === 'data' ? 'editorial' : 'hud') : 'neutral';
}

/** Editorial eyebrows: the general version's captions (spec §8), never a HUD caption. */
function editorialCaption(base: string): CaptionKey {
  if (base === '/') return 'heroLabel';
  if (base === '/research/') return 'pageResearch';
  if (base === '/projects/') return 'pageProjects';
  if (base === '/records/') return 'pageRecords';
  return base.startsWith('/research/') ? 'publications' : 'projectDetails';
}
const SHARED_EYEBROW: Readonly<Record<string, UiKey>> = { '/stats/': 'nav.stats', '/privacy/': 'nav.privacy', '/credits/': 'nav.credits' };

/**
 * A card with its template: HUD cards unchanged; editorial cards take the general captions as eyebrows and the general
 * home shows the B-12 heatmap (the projects artifact); the chooser card shows both versions; shared cards are named by
 * their page.
 */
function withTemplate(og: Omit<OgInput, 'template'>, route: string, src: OgSources): OgInput {
  const template = ogTemplateFor(route);
  const info = parseRoute(route)!;
  if (template === 'hud') return { ...og, template };
  if (template === 'editorial') {
    const artifact = info.base === '/' ? src.artifacts?.projects : og.artifact;
    return {
      template,
      eyebrow: captionFor(getVariant('data'), editorialCaption(info.base), info.lang),
      title: og.title,
      ...(og.subtitle ? { subtitle: og.subtitle } : {}),
      ...(artifact ? { artifact } : {}),
    };
  }
  if (info.kind === 'chooser') {
    const copy = chooserCopy[info.lang];
    return {
      ...og,
      template,
      eyebrow: NEUTRAL_IDENTITY.siteTitle[info.lang],
      artifact: { kind: 'versions', game: { mode: `[ MODE ${copy.game.num} ]`, title: copy.game.title }, data: { kicker: copy.data.kicker, title: copy.data.title } },
    };
  }
  const key = SHARED_EYEBROW[info.base];
  if (!key) throw new Error(`og: no eyebrow for the shared page ${route}`);
  return { ...og, template, eyebrow: t(info.lang, key) };
}

/**
 * One OG card per route in allRoutes() (read through parseRoute), keyed by ogSlugFor(route). The chooser: its
 * page meta. Fixed pages: the page meta of the route's version (null for shared pages) + description. Projects:
 * frontmatter title + summary. Paper pages: the version's 'research-story' meta title (without the name suffix) +
 * description. Throws when a route has no source entry or when a title names a
 * game trademark (OG titles never do; frontmatter titles may, as body text).
 */
export function buildOgMap(src: OgSources): Record<string, OgInput> {
  const map: Record<string, OgInput> = {};
  for (const route of allRoutes()) {
    const info = parseRoute(route);
    if (!info) throw new Error(`og: ${route} is not in the route table`);
    const { lang, variant, base, kind } = info;
    let og: Omit<OgInput, 'template'>;
    if (kind === 'chooser') {
      const meta = pageMetaFor('chooser', lang, null, src.facts);
      og = { eyebrow: 'PORTFOLIO', title: meta.title, subtitle: meta.description, ...withArtifact(src.artifacts?.photo) };
    } else if (FIXED[base]) {
      const fixed = FIXED[base];
      const meta = pageMetaFor(fixed.key, lang, variant, src.facts);
      og = { eyebrow: fixed.eyebrow, title: meta.title, subtitle: meta.description, ...withArtifact(src.artifacts?.[fixed.artifact]) };
    } else {
      const match = /^\/(projects|research)\/([a-z0-9-]+)\/$/.exec(base);
      if (!match || variant === null) throw new Error(`og: no OG rule for ${route}`);
      const [, kindOf, slug] = match;
      if (kindOf === 'projects') {
        const project = src.projects.find((p) => p.lang === lang && p.slug === slug);
        if (!project) throw new Error(`og: no project entry ${lang}/${slug}`);
        og = { eyebrow: 'PROJECT', title: project.title, subtitle: project.summary, ...withArtifact(project.artifact) };
      } else {
        if (!src.papers.some((p) => p.lang === lang && p.slug === slug)) throw new Error(`og: no paper entry ${lang}/${slug}`);
        const meta = pageMetaFor('research-story', lang, variant, src.facts);
        og = { eyebrow: 'RESEARCH', title: withoutName(meta.title, lang), subtitle: meta.description, ...withArtifact(src.artifacts?.paper) };
      }
    }
    if (containsTrademark(og.title)) throw new Error(`og: title names a game trademark (${route}): ${og.title}`);
    map[ogSlugFor(route)] = withTemplate(og, route, src);
  }
  return map;
}

/**
 * The file an imported image came from. Astro sets `fsPath` (non-enumerable) on every image it imports, and reads it
 * itself to build images; the OG cards read the same file with sharp.
 */
function sourceFile(image: ImageMetadata): string {
  const path = (image as ImageMetadata & { fsPath?: string }).fsPath;
  if (!path) throw new Error(`og: no source file for ${image.src}`);
  return path;
}

/** Collections → buildOgMap (used by src/pages/og/[...slug].png.ts at build time). */
export async function getOgPages(): Promise<Record<string, OgInput>> {
  const [projects, papers] = await Promise.all([Promise.all([getProjects('ko'), getProjects('en')]).then((l) => l.flat()), getPaperPages()]);
  const paper = papers[0];
  const paperArtifact: OgArtifact | undefined = paper
    ? {
        kind: 'paper',
        venue: bibtexField(paper.data.bibtex, 'booktitle') ?? paper.data.venue,
        title: paper.data.title,
        authors: paper.data.authors.map((a) => a.name).join(', '),
        ...(paper.data.authors[0]?.affiliation ? { affiliation: paper.data.authors[0].affiliation.join(', ') } : {}),
      }
    : undefined;
  return buildOgMap({
    projects: projects.map((entry) => {
      const { lang, slug } = splitEntryId(entry.id);
      const { cover, period, tags } = entry.data;
      const artifact: OgArtifact = cover
        ? { kind: 'figure', path: sourceFile(cover.src), label: cover.label }
        : { kind: 'plate', id: slug.toUpperCase(), period: formatPeriod(period.start, period.end, lang), ...(tags[0] ? { tag: tags[0] } : {}) };
      return { lang, slug, title: entry.data.title, summary: entry.data.summary, artifact };
    }),
    papers: papers.flatMap((entry) => LOCALES.map((lang) => ({ lang, slug: entry.id }))),
    facts: await getFactSource(),
    artifacts: {
      photo: { kind: 'photo', path: sourceFile(photo) },
      projects: { kind: 'figure', path: sourceFile(riskHeatmap), label: 'RISK HEATMAP' },
      ...(paperArtifact ? { paper: paperArtifact } : {}),
    },
  });
}
