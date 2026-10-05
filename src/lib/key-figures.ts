// src/lib/key-figures.ts — DS-6: the case-study key-figures band from a project's own frontmatter. Every number is a
// project fact ({fact.<key>} inside keyFigures / metrics, resolved per page language); the proportion bar and the metric
// bar widths are computed from the parsed fact values, never typed. Pure module (vitest imports it).
import type { Lang } from '../i18n/ui';
import type { ProjectFrontmatter } from '../content/schemas';
import type { StatDef } from '../data/copy/data/home';

export type KeyFigureTile = StatDef & { bar?: number };
export interface ResolvedKeyFigures {
  tiles: KeyFigureTile[];
  metrics: { title: string; label: string; rows: { key: string; value: string; share: number; highlight: boolean }[] } | null;
}

type Source = Pick<ProjectFrontmatter, 'facts' | 'keyFigures' | 'metrics'>;

/** '240,064' → 240064; '0.87' → 0.87. Throws on anything that is not a plain number. */
export function factNumber(value: string): number {
  const n = Number(value.replace(/,/g, ''));
  if (!Number.isFinite(n)) throw new Error(`key figures: "${value}" is not a number`);
  return n;
}

/** The band of a project, or null when it has no keyFigures. */
export function resolveKeyFigures(source: Source, lang: Lang): ResolvedKeyFigures | null {
  const facts = source.facts ?? {};
  const fact = (key: string): string => {
    const value = facts[key]?.[lang];
    if (value === undefined) throw new Error(`key figures: unknown fact "${key}"`);
    return value;
  };
  const resolve = (text: string): string => text.replace(/\{fact\.([A-Za-z0-9-]+)\}/g, (_, key: string) => fact(key));
  if (!source.keyFigures || source.keyFigures.length === 0) return null;
  const tiles = source.keyFigures.map((fig) => ({
    value: resolve(fig.value),
    label: resolve(fig.label),
    ...(fig.unit ? { unit: fig.unit } : {}),
    ...(fig.labelFirst ? { labelFirst: true } : {}),
    ...(fig.bar ? { bar: factNumber(fact(fig.bar[0])) / factNumber(fact(fig.bar[1])) } : {}),
  }));
  const metrics = source.metrics
    ? {
        title: source.metrics.title,
        label: source.metrics.label,
        rows: source.metrics.rows.map((row) => ({ key: row.key, value: fact(row.fact), share: factNumber(fact(row.fact)), highlight: row.highlight === true })),
      }
    : null;
  return { tiles, metrics };
}
