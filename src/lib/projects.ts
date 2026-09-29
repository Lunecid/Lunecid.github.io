// src/lib/projects.ts — project collection helpers shared by home, /projects/, project pages and records.
import type { ImageMetadata } from 'astro';
import type { CollectionEntry } from 'astro:content';
import type { Lang } from '../i18n/ui';
import { formatPeriod, localizeHref, splitEntryId, t } from '../i18n/utils';
import type { ProjectFrontmatter } from '../content/schemas';
import { tagKey, type TagKey } from '../content/tags';

export type ProjectEntry = CollectionEntry<'projects'>;

export interface CartridgeProps {
  /** Omitted for a status 'card' project (no page, D-4): the card is not a link and shows `summary` instead. */
  href?: string;
  title: string;
  meta: string;
  summary?: string;
  tagKeys: TagKey[];
  tags: string[];
  cover?: ImageMetadata;
  coverPosition?: string;
  /** 'contain': the whole figure on a white plate (a chart with text, P1-6); default 'cover'. */
  coverFit?: 'cover' | 'contain';
  /**
   * No real figure (P1-6): a designed HUD plate from the project's own metadata (ID, period, first tag) instead of an
   * empty box. Never a drawn chart: the plate shows no data it does not have.
   */
  plate?: { id: string; period: string; tag?: string };
  /** The CoG card (fix round 1): the paper's own AUC result drawn as the label (AucLabel.astro) instead of an image. */
  chart?: { kind: 'auc-overall'; lang: Lang };
  sticker?: { text: string; sr?: string; kind: 'oral' | 'award' };
  wide?: boolean;
  headingLevel?: 2 | 3;
}

/** 'ko/kickick-park' → 'kickick-park'. Throws for ids without a locale folder. */
export function projectSlug(entry: { id: string }): string {
  return splitEntryId(entry.id).slug;
}

/** order ascending; Array.prototype.sort is stable, and the input is not mutated. */
export function sortProjects<T extends { data: { order: number } }>(entries: T[]): T[] {
  return [...entries].sort((a, b) => a.data.order - b.data.order);
}

/** false for status 'card' (short card only, D-4): no /projects/<slug>/ page and no link to one. */
export function hasProjectPage(data: Pick<ProjectFrontmatter, 'status'>): boolean {
  return data.status !== 'card';
}

/**
 * ≤6 rows (spec §5 PROJECT DETAILS): type · team, period, affiliation, my role, tools. When the project lists
 * teamTools (D-9), the tools row becomes "tools I used" and a "team tools" row follows it.
 */
export function projectDetailRows(
  data: Pick<ProjectFrontmatter, 'type' | 'team' | 'period' | 'org' | 'role' | 'tools' | 'teamTools'>,
  lang: Lang,
): { label: string; value: string }[] {
  const team = data.teamTools && data.teamTools.length > 0 ? data.teamTools : null;
  return [
    { label: t(lang, 'project.type'), value: `${data.type} · ${data.team}` },
    { label: t(lang, 'project.period'), value: formatPeriod(data.period.start, data.period.end, lang) },
    { label: t(lang, 'project.org'), value: data.org },
    { label: t(lang, 'project.role'), value: data.role },
    { label: t(lang, team ? 'project.myTools' : 'project.tools'), value: data.tools.join(', ') },
    ...(team ? [{ label: t(lang, 'project.teamTools'), value: team.join(', ') }] : []),
  ];
}

export function cartridgeMeta(tools: readonly string[]): string {
  return tools.slice(0, 2).join(' · ');
}

/** '최우수상(부산광역시장상)' → '최우수상'; 'Top Excellence Award (Mayor of Busan Award)' → 'Top Excellence Award'. */
function awardStickerText(name: string): string {
  const cut = name.indexOf('(');
  return (cut === -1 ? name : name.slice(0, cut)).trim();
}

export function toCartridge(entry: ProjectEntry, lang: Lang, opts: { headingLevel?: 2 | 3 } = {}): CartridgeProps {
  const { data } = entry;
  return {
    ...(hasProjectPage(data) ? { href: localizeHref(`/projects/${projectSlug(entry)}/`, lang) } : { summary: data.summary }),
    title: data.title,
    meta: cartridgeMeta(data.tools),
    tagKeys: data.tags.map((label) => tagKey(label)),
    tags: [...data.tags],
    ...(data.cover
      ? { cover: data.cover.src, ...(data.cover.fit === 'contain' ? { coverFit: 'contain' as const } : {}) }
      : { plate: { id: projectSlug(entry).toUpperCase(), period: formatPeriod(data.period.start, data.period.end, lang), ...(data.tags[0] ? { tag: data.tags[0] } : {}) } }),
    ...(data.award ? { sticker: { text: awardStickerText(data.award.name), kind: 'award' as const } } : {}),
    ...(opts.headingLevel ? { headingLevel: opts.headingLevel } : {}),
  };
}
