import { describe, expect, it } from 'vitest';
import { isFresh as isFreshDirect } from '../../src/lib/freshness';
import {
  createGeneratedLoader,
  isFresh,
  usableGitHub,
  usableStats,
  type AccountFeed,
  type GitHubData,
  type StatsData,
} from '../../src/lib/generated';

const DAY = 86_400_000;
const NOW = Date.parse('2026-09-26T00:00:00.000Z');
const at = (ms: number): string => new Date(ms).toISOString();

function github(overrides: Partial<GitHubData> = {}): GitHubData {
  return {
    schemaVersion: 1,
    source: 'github',
    login: 'Lunecid',
    status: 'ok',
    fetchedAt: at(NOW - DAY),
    maxAgeDays: 7,
    authFailed: false,
    repos: [],
    pinned: null,
    calendar: null,
    errors: [],
    ...overrides,
  };
}

function stats(overrides: Partial<StatsData> = {}): StatsData {
  return {
    schemaVersion: 1,
    source: 'goatcounter',
    status: 'ok',
    fetchedAt: at(NOW - DAY),
    maxAgeDays: 7,
    authFailed: false,
    range: { start: '2026-08-27T00:00:00Z', end: '2026-09-26T00:00:00Z' },
    total: 10,
    daily: [],
    pages: [],
    referrers: [],
    errors: [],
    ...overrides,
  };
}

function feed(platform: string): AccountFeed {
  return { schemaVersion: 1, platform, status: 'ok', fetchedAt: at(NOW - DAY), maxAgeDays: 7, attribution: 'test', cards: [] };
}

describe('generated data', () => {
  it('re-exports the one freshness rule', () => {
    expect(isFresh).toBe(isFreshDirect);
  });

  it('usableGitHub drops missing, error and stale data and keeps partial', () => {
    expect(usableGitHub(undefined, NOW)).toBeUndefined();
    expect(usableGitHub(github({ status: 'error' }), NOW)).toBeUndefined();
    expect(usableGitHub(github({ fetchedAt: at(NOW - 8 * DAY) }), NOW)).toBeUndefined();
    const partial = github({ status: 'partial', errors: ['no token'] });
    expect(usableGitHub(partial, NOW)).toBe(partial);
    const ok = github();
    expect(usableGitHub(ok, NOW)).toBe(ok);
  });

  it('usableStats keeps only fresh ok data', () => {
    const ok = stats();
    expect(usableStats(ok, NOW)).toBe(ok);
    expect(usableStats(undefined, NOW)).toBeUndefined();
    expect(usableStats(stats({ status: 'skipped' }), NOW)).toBeUndefined();
    expect(usableStats(stats({ status: 'error' }), NOW)).toBeUndefined();
    expect(usableStats(stats({ fetchedAt: at(NOW - 8 * DAY) }), NOW)).toBeUndefined();
  });

  it('accounts() keys by file stem', () => {
    const gh = github();
    const loader = createGeneratedLoader({
      '../data/generated/github.json': gh,
      '../data/generated/accounts/enka-zzz.json': feed('enka-zzz'),
      '../data/generated/accounts/riot.json': feed('riot'),
    });
    expect(Object.keys(loader.accounts()).sort()).toEqual(['enka-zzz', 'riot']);
    expect(loader.accounts()['riot']?.platform).toBe('riot');
    expect(loader.github()).toBe(gh);
    expect(loader.stats()).toBeUndefined();
  });

  it('loader with no files returns undefined/{}', () => {
    const loader = createGeneratedLoader({});
    expect(loader.github()).toBeUndefined();
    expect(loader.stats()).toBeUndefined();
    expect(loader.accounts()).toEqual({});
  });

  it('ignores files whose shape is not the expected source', () => {
    const loader = createGeneratedLoader({
      '../data/generated/github.json': { hello: 'world' },
      '../data/generated/stats.json': github(),
      '../data/generated/accounts/broken.json': ['not', 'an', 'object'],
    });
    expect(loader.github()).toBeUndefined();
    expect(loader.stats()).toBeUndefined();
    expect(loader.accounts()).toEqual({});
  });
});
