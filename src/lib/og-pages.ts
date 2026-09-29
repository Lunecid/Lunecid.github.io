import type { ImageMetadata } from 'astro';
import photo from '../assets/photo/photo-id.webp';
import riskHeatmap from '../assets/projects/school-zone-blindspots/risk-heatmap.webp';
import type { Lang } from '../i18n/ui';
import { formatPeriod, LOCALES, splitEntryId } from '../i18n/utils';
import { PAGE_META, type PageKey } from '../data/copy/pages';
import type { OgArtifact, OgInput } from './og';
import { bibtexField } from './publications';
import { getPaperPages, getProjects } from './portfolio';
import { allRoutes } from './routes';
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
}

const NAME_SUFFIX: Record<Lang, string> = { ko: ' · 백성은', en: ' · Seongeun Baek' };

/** Korean-form path of each fixed page → its PAGE_META key, card eyebrow and which artifact it shows (P2-36). */
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

/**
 * One OG card per route in allRoutes(), keyed by ogSlugFor(route). Fixed pages: PAGE_META title (unchanged)
 * + description. Projects: frontmatter title + summary. Paper pages: PAGE_META['research-story'] title
 * (without the name suffix) + description. Throws when a route has no source entry or when a title names a
 * game trademark (OG titles never do; frontmatter titles may, as body text).
 */
export function buildOgMap(src: OgSources): Record<string, OgInput> {
  const map: Record<string, OgInput> = {};
  for (const route of allRoutes()) {
    const lang: Lang = route.startsWith('/en/') ? 'en' : 'ko';
    const koPath = lang === 'en' ? route.slice(3) : route;
    let og: OgInput;
    const fixed = FIXED[koPath];
    if (fixed) {
      const meta = PAGE_META[fixed.key][lang];
      og = { eyebrow: fixed.eyebrow, title: meta.title, subtitle: meta.description, ...withArtifact(src.artifacts?.[fixed.artifact]) };
    } else {
      const match = /^\/(projects|research)\/([a-z0-9-]+)\/$/.exec(koPath);
      if (!match) throw new Error(`og: no OG rule for ${route}`);
      const [, kind, slug] = match;
      if (kind === 'projects') {
        const project = src.projects.find((p) => p.lang === lang && p.slug === slug);
        if (!project) throw new Error(`og: no project entry ${lang}/${slug}`);
        og = { eyebrow: 'PROJECT', title: project.title, subtitle: project.summary, ...withArtifact(project.artifact) };
      } else {
        if (!src.papers.some((p) => p.lang === lang && p.slug === slug)) throw new Error(`og: no paper entry ${lang}/${slug}`);
        const meta = PAGE_META['research-story'][lang];
        og = { eyebrow: 'RESEARCH', title: withoutName(meta.title, lang), subtitle: meta.description, ...withArtifact(src.artifacts?.paper) };
      }
    }
    if (containsTrademark(og.title)) throw new Error(`og: title names a game trademark (${route}): ${og.title}`);
    map[ogSlugFor(route)] = og;
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
    artifacts: {
      photo: { kind: 'photo', path: sourceFile(photo) },
      projects: { kind: 'figure', path: sourceFile(riskHeatmap), label: 'RISK HEATMAP' },
      ...(paperArtifact ? { paper: paperArtifact } : {}),
    },
  });
}
