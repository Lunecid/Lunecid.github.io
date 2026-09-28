// src/lib/generated.ts — build-time JSON written by scripts/fetch-*.mjs into src/data/generated/ (gitignored).
// Missing files never break the build: import.meta.glob simply returns fewer entries.
// Client code (islands) must import isFresh from ./freshness and only `import type` from this file,
// because a runtime import would bundle every generated JSON file.
import { isFresh } from './freshness';

export { isFresh };

export interface GitHubRepo {
  name: string;
  description: string;
  url: string;
  homepage: string | null;
  language: string | null;
  topics: string[];
  stars: number;
  pushedAt: string;
  archived: boolean;
}

export interface GitHubPinned {
  name: string;
  description: string;
  url: string;
  language: string | null;
  topics: string[];
  stars: number;
}

export interface GitHubDay {
  date: string;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
}

export interface GitHubData {
  schemaVersion: 1;
  source: 'github';
  login: string;
  status: 'ok' | 'partial' | 'error';
  fetchedAt: string;
  maxAgeDays: number;
  authFailed: boolean;
  repos: GitHubRepo[];
  pinned: GitHubPinned[] | null;
  calendar: { total: number; weeks: GitHubDay[][] } | null;
  errors: string[];
}

export interface StatsData {
  schemaVersion: 1;
  source: 'goatcounter';
  status: 'ok' | 'skipped' | 'error';
  fetchedAt: string;
  maxAgeDays: number;
  authFailed: boolean;
  range: { start: string; end: string } | null;
  total: number | null;
  daily: { day: string; count: number }[];
  pages: { path: string; title: string; count: number }[];
  referrers: { name: string | null; count: number }[]; // null = direct visit (UI label stats.direct)
  errors: string[];
}

export interface AccountStat {
  label: string;
  value: number | string;
  suffix?: string;
}

export interface AccountCard {
  title: string;
  subtitle?: string;
  image?: string;
  stats: AccountStat[];
  progress?: { label: string; value: number };
  badges?: string[];
}

export interface AccountFeed {
  schemaVersion: 1;
  platform: string;
  status: 'ok' | 'error';
  fetchedAt: string;
  maxAgeDays: number;
  attribution: string;
  authFailed?: boolean;
  cards: AccountCard[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fileStem(path: string): string {
  const base = path.replace(/\\/g, '/').split('/').pop() ?? '';
  return base.replace(/\.json$/, '');
}

/** Factory over an import.meta.glob-style map (tests pass a plain object). */
export function createGeneratedLoader(files: Record<string, unknown>): {
  github(): GitHubData | undefined;
  stats(): StatsData | undefined;
  accounts(): Record<string, AccountFeed>;
} {
  const top: Record<string, unknown> = {};
  const accountFiles: Record<string, AccountFeed> = {};
  for (const [path, value] of Object.entries(files)) {
    const normalized = path.replace(/\\/g, '/');
    if (/\/accounts\/[^/]+\.json$/.test(normalized)) {
      if (isRecord(value) && value.schemaVersion === 1 && typeof value.platform === 'string') {
        accountFiles[fileStem(normalized)] = value as unknown as AccountFeed;
      }
    } else {
      top[fileStem(normalized)] = value;
    }
  }
  return {
    github() {
      const value = top['github'];
      return isRecord(value) && value.schemaVersion === 1 && value.source === 'github' ? (value as unknown as GitHubData) : undefined;
    },
    stats() {
      const value = top['stats'];
      return isRecord(value) && value.schemaVersion === 1 && value.source === 'goatcounter' ? (value as unknown as StatsData) : undefined;
    },
    accounts() {
      return { ...accountFiles };
    },
  };
}

// Default instance over the real (optional) files.
export const generated = createGeneratedLoader(
  import.meta.glob<unknown>(['../data/generated/*.json', '../data/generated/accounts/*.json'], { eager: true, import: 'default' }),
);

/** undefined if missing, status 'error', or not fresh. 'partial' data is kept (the section shows what exists). */
export function usableGitHub(d: GitHubData | undefined, now: number = Date.now()): GitHubData | undefined {
  if (!d || d.status === 'error' || !isFresh(d, now)) return undefined;
  return d;
}

/** undefined unless status 'ok' and fresh. */
export function usableStats(d: StatsData | undefined, now: number = Date.now()): StatsData | undefined {
  if (!d || d.status !== 'ok' || !isFresh(d, now)) return undefined;
  return d;
}
