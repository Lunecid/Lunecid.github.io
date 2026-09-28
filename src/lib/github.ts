// src/lib/github.ts — which repositories the GitHub section lists, in what order and with which description (P1-17).
// Plain module (no astro:* imports) so unit tests can call it with fixtures.
import { GITHUB_DESCRIPTIONS, GITHUB_EXCLUDED, GITHUB_FIRST } from '../data/github-repos';
import type { Lang } from '../i18n/ui';
import type { Localized } from '../i18n/utils';
import type { GitHubData } from './generated';

export const GITHUB_MAX_REPOS = 6;

export interface GitHubRepoItem {
  name: string;
  url: string;
  description: string; // '' = none
  language: string | null;
  stars: number; // the section shows it only when > 0
}

const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힣]/;

interface ListOptions {
  excluded?: readonly string[];
  first?: readonly string[];
  descriptions?: Readonly<Record<string, Localized>>;
  max?: number;
}

/**
 * Pinned repositories first (the owner's own choice, when the fetch had a token), then the other public,
 * non-archived repositories by last push; excluded names and repositories without any description (neither on GitHub
 * nor in GITHUB_DESCRIPTIONS) dropped; GITHUB_FIRST names moved to the top; at most
 * GITHUB_MAX_REPOS. Descriptions: the site-side text in the page language, else the GitHub description — on
 * English pages only when it contains no Hangul.
 */
export function githubRepoList(
  data: Pick<GitHubData, 'repos' | 'pinned'>,
  lang: Lang,
  { excluded = GITHUB_EXCLUDED, first = GITHUB_FIRST, descriptions = GITHUB_DESCRIPTIONS, max = GITHUB_MAX_REPOS }: ListOptions = {},
): GitHubRepoItem[] {
  const pinned = (data.pinned ?? []).map((p) => ({ name: p.name, url: p.url, description: p.description, language: p.language, stars: p.stars }));
  const recent = data.repos
    .filter((r) => !r.archived)
    .sort((a, b) => Date.parse(b.pushedAt) - Date.parse(a.pushedAt))
    .map((r) => ({ name: r.name, url: r.url, description: r.description, language: r.language, stars: r.stars }));
  const seen = new Set<string>();
  const merged = [...pinned, ...recent].filter((r) => {
    if (excluded.includes(r.name) || seen.has(r.name)) return false;
    // A repository with neither a GitHub description nor a site-side one says nothing to a visitor: not listed.
    if (r.description.trim() === '' && !descriptions[r.name]) return false;
    seen.add(r.name);
    return true;
  });
  const rank = (name: string): number => {
    const i = first.indexOf(name);
    return i === -1 ? first.length : i;
  };
  return merged
    .map((r, i) => ({ r, i }))
    .sort((a, b) => rank(a.r.name) - rank(b.r.name) || a.i - b.i)
    .slice(0, max)
    .map(({ r }) => {
      // P2-14: a site-side description keyed by name but with an empty string for this lang (e.g. { ko: '…', en: '' })
      // must fall back to the GitHub description, never render blank — `site ?? …` alone let `''` win over `??`.
      const site = descriptions[r.name]?.[lang];
      const own = r.description.trim();
      const fallback = lang === 'en' && HANGUL.test(own) ? '' : own;
      const description = site !== undefined && site.trim() !== '' ? site : fallback;
      return { name: r.name, url: r.url, description, language: r.language, stars: r.stars };
    });
}
