// src/lib/generated.ts — build-time JSON written by scripts/fetch-*.mjs into src/data/generated/ (gitignored).
// Missing files never break the build: import.meta.glob simply returns fewer entries.
// Client code (islands) must import isFresh from ./freshness and only `import type` from this file,
// because a runtime import would bundle every generated JSON file.
// AL-8: every glob goes through the `@generated` Vite alias (astro.config.mjs), which the build points at the real
// folder, or at the test build's fixture folder only under SB_E2E_ACCOUNTS=1 (plan DV-32).
import type { ImageMetadata } from 'astro';
import { HREF_ALLOW } from './account-ids';
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

// Account-link spec §5.5 (additive; schemaVersion stays 1; every new field is optional).
/** A showcase row: character, agent or game (at most 4 per card). `image` is a file name in accounts/img/. */
export interface AccountItem {
  name: string;
  image?: string;
  meta?: string;
}

export type AccountMetricKey =
  | 'ar' | 'achievements' | 'abyss' | 'theater' | 'worldLevel'
  | 'ikLevel' | 'medal.1' | 'medal.2' | 'medal.3' | 'medal.4'
  | 'steamLevel' | 'ownedGames' | 'playtimeTotal' | 'playtime2w';

/** Language-neutral; the label comes from ui.ts `accounts.stat.<key>` at build time (R-7). */
export interface AccountMetric {
  key: AccountMetricKey;
  value: number | string;
  max?: number;
  unit?: 'hours' | 'stars' | 'score';
}

export interface AccountCard {
  /** Game text is per language, so cards are too. Pick: cards.find(c => c.lang === lang) ?? cards[0]. */
  lang?: 'ko' | 'en';
  title: string;
  subtitle?: string;
  /** File names in accounts/img/ (sha1 of the source URL, first 12 hex). */
  image?: string;
  banner?: string;
  /** The older {label, value, suffix?} form; the fetch scripts write []. */
  stats: AccountStat[];
  /** At most 4; account-view.ts turns them into stats and the teaser. */
  metrics?: AccountMetric[];
  progress?: { label: string; value: number };
  badges?: string[];
  items?: AccountItem[];
  link?: { kind: 'steam'; href: string };
}

export type AccountFailReason =
  | 'invalid-id' | 'no-name' | 'name-mismatch' | 'http-400' | 'http-404' | 'http-424' | 'http-429' | 'http-5xx'
  | 'timeout' | 'not-public' | 'bad-response' | 'auth' | 'no-key';

export interface AccountFeed {
  schemaVersion: 1;
  platform: string;
  status: 'ok' | 'error' | 'skipped';
  fetchedAt: string;
  maxAgeDays: number;
  attribution: string;
  authFailed?: boolean;
  reason?: AccountFailReason;
  /** Enka's cache hint in seconds (spec §6.4): recorded, never rendered. */
  ttl?: number;
  cards: AccountCard[];
}

/** links/riot.json (spec §5.4, §6.6): outbound profile links only, no fetched game data. */
export interface RiotLinks {
  schemaVersion: 1;
  platform: 'riot';
  status: 'ok';
  fetchedAt: string;
  riotId: string;
  links: { lol?: string; tft?: string };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fileStem(path: string): string {
  const base = path.replace(/\\/g, '/').split('/').pop() ?? '';
  return base.replace(/\.json$/, '');
}

const FEED_STATUS: ReadonlySet<unknown> = new Set(['ok', 'error', 'skipped']);
const ACCOUNT_FILE = /\/accounts\/[^/]+\.json$/;
const LINKS_FILE = /\/links\/[^/]+\.json$/;
const ACCOUNT_IMAGE = /\/accounts\/img\/([^/]+\.(?:png|jpg|webp))$/;

function isAccountFeed(value: unknown): value is AccountFeed {
  return isRecord(value) && value.schemaVersion === 1 && typeof value.platform === 'string' && FEED_STATUS.has(value.status) && Array.isArray(value.cards);
}

/** A valid links/riot.json with only the hrefs that pass HREF_ALLOW; undefined when none is left. */
function riotLinks(value: unknown): RiotLinks | undefined {
  if (!isRecord(value) || value.schemaVersion !== 1 || value.platform !== 'riot' || value.status !== 'ok') return undefined;
  if (typeof value.fetchedAt !== 'string' || typeof value.riotId !== 'string' || !isRecord(value.links)) return undefined;
  const links: RiotLinks['links'] = {};
  for (const kind of ['lol', 'tft'] as const) {
    const href = value.links[kind];
    if (typeof href === 'string' && HREF_ALLOW[kind].test(href)) links[kind] = href;
  }
  if (links.lol === undefined && links.tft === undefined) return undefined;
  return { schemaVersion: 1, platform: 'riot', status: 'ok', fetchedAt: value.fetchedAt, riotId: value.riotId, links };
}

/** Factory over import.meta.glob-style maps (tests pass plain objects): JSON files, and accounts/img/* images. */
export function createGeneratedLoader(
  files: Record<string, unknown>,
  images: Record<string, unknown> = {},
): {
  github(): GitHubData | undefined;
  stats(): StatsData | undefined;
  accounts(): Record<string, AccountFeed>;
  links(): RiotLinks | undefined;
  accountImages(): Record<string, ImageMetadata>;
} {
  const top: Record<string, unknown> = {};
  const accountFiles: Record<string, AccountFeed> = {};
  const linkFiles: Record<string, unknown> = {};
  for (const [path, value] of Object.entries(files)) {
    const normalized = path.replace(/\\/g, '/');
    if (ACCOUNT_FILE.test(normalized)) {
      if (isAccountFeed(value)) accountFiles[fileStem(normalized)] = value;
    } else if (LINKS_FILE.test(normalized)) {
      linkFiles[fileStem(normalized)] = value;
    } else if (!normalized.includes('/accounts/')) {
      top[fileStem(normalized)] = value;
    }
  }
  const imageFiles: Record<string, ImageMetadata> = {};
  for (const [path, value] of Object.entries(images)) {
    const name = ACCOUNT_IMAGE.exec(path.replace(/\\/g, '/'))?.[1];
    if (name !== undefined && isRecord(value)) imageFiles[name] = value as unknown as ImageMetadata;
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
    links() {
      return riotLinks(linkFiles['riot']);
    },
    accountImages() {
      return { ...imageFiles };
    },
  };
}

/**
 * SB_E2E_ACCOUNTS=1 builds only (the fixture feeds of the test build carry a fixed old date): a copy of `files` whose
 * account feeds and links files carry `fetchedAt` = the build time. The real build never calls this.
 */
export function freshenFixtureFeeds(files: Record<string, unknown>, buildTime: string): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(files).map(([path, value]) => {
      const normalized = path.replace(/\\/g, '/');
      const feedLike = (ACCOUNT_FILE.test(normalized) || LINKS_FILE.test(normalized)) && isRecord(value);
      return [path, feedLike ? { ...value, fetchedAt: buildTime } : value];
    }),
  );
}

// Default instance over the real (optional) files: the build's choice of folder is the @generated alias.
const generatedFiles = import.meta.glob<unknown>(['@generated/*.json', '@generated/accounts/*.json', '@generated/links/*.json'], { eager: true, import: 'default' });
const generatedImages = import.meta.glob<ImageMetadata>('@generated/accounts/img/*.{png,jpg,webp}', { eager: true, import: 'default' });
export const generated = createGeneratedLoader(
  process.env.SB_E2E_ACCOUNTS === '1' ? freshenFixtureFeeds(generatedFiles, new Date().toISOString()) : generatedFiles,
  generatedImages,
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
