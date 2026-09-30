import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isFresh as isFreshDirect } from '../../src/lib/freshness';
import {
  createGeneratedLoader,
  freshenFixtureFeeds,
  isFresh,
  usableGitHub,
  usableStats,
  type AccountCard,
  type AccountFeed,
  type AccountMetricKey,
  type GitHubData,
  type RiotLinks,
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

// AL-8 (account-link spec §5.4, §5.5): the card fields the fetch scripts write, links/riot.json and accounts/img/*.
const LOL = 'https://op.gg/lol/summoners/kr/Hide%20on%20bush-KR1';
const TFT = 'https://lolchess.gg/profile/kr/Hide%20on%20bush-KR1';

function riot(overrides: Record<string, unknown> = {}): RiotLinks {
  return { schemaVersion: 1, platform: 'riot', status: 'ok', fetchedAt: at(NOW - DAY), riotId: 'Hide on bush#KR1', links: { lol: LOL, tft: TFT }, ...overrides } as RiotLinks;
}
const linksFrom = (value: unknown) => createGeneratedLoader({ '/src/data/generated/links/riot.json': value }).links();
const IMG = (name: string) => ({ src: `/_astro/${name}`, width: 96, height: 96, format: 'png' as const });

describe('account cards, Riot links and account images (AL-8)', () => {
  it('accepts the new optional card and feed fields and keeps them as written', () => {
    const card: AccountCard = {
      lang: 'ko',
      title: 'SynthWanderer',
      image: 'c6e3270c5fb0.png',
      banner: '830179f16e8f.jpg',
      stats: [],
      metrics: [{ key: 'ar', value: 57 }, { key: 'abyss', value: '12-3' }, { key: 'playtimeTotal', value: 321, unit: 'hours' }],
      items: [{ name: 'Synthetic A', image: 'd79f1b3381be.png', meta: 'Lv 90' }, { name: 'Synthetic C' }],
      link: { kind: 'steam', href: 'https://steamcommunity.com/profiles/76561197960435530' },
    };
    const ok: AccountFeed = { ...feed('enka-genshin'), ttl: 60, cards: [card, { ...card, lang: 'en' }] };
    const skipped: AccountFeed = { ...feed('steam'), status: 'skipped' };
    const failed: AccountFeed = { ...feed('enka-zzz'), status: 'error', reason: 'name-mismatch' };
    const accounts = createGeneratedLoader({
      '/src/data/generated/accounts/enka-genshin.json': ok,
      '/src/data/generated/accounts/steam.json': skipped,
      '/src/data/generated/accounts/enka-zzz.json': failed,
    }).accounts();
    expect(Object.keys(accounts).sort()).toEqual(['enka-genshin', 'enka-zzz', 'steam']);
    expect(accounts['enka-genshin']).toEqual(ok);
    expect(accounts['enka-genshin']?.ttl).toBe(60);
    expect(accounts['enka-genshin']?.cards.map((c) => c.lang)).toEqual(['ko', 'en']);
    expect(accounts['enka-genshin']?.cards[0]?.link?.href).toBe('https://steamcommunity.com/profiles/76561197960435530');
    expect(accounts['steam']?.status).toBe('skipped');
    expect(accounts['enka-zzz']?.reason).toBe('name-mismatch');
    // Every metric key the fetch scripts write is a member of the type (a type error otherwise, npm run check).
    const written: AccountMetricKey[] = ['ar', 'achievements', 'abyss', 'theater', 'worldLevel', 'ikLevel', 'medal.1', 'medal.2', 'medal.3', 'medal.4', 'steamLevel', 'ownedGames', 'playtimeTotal', 'playtime2w'];
    expect(new Set(written).size).toBe(14);
  });

  it('drops invalid account files: wrong schemaVersion, platform, status or cards', () => {
    const accounts = createGeneratedLoader({
      '/src/data/generated/accounts/a.json': { ...feed('a'), schemaVersion: 2 },
      '/src/data/generated/accounts/b.json': { ...feed('b'), platform: 7 },
      '/src/data/generated/accounts/c.json': { ...feed('c'), status: 'partial' },
      '/src/data/generated/accounts/d.json': { ...feed('d'), cards: 'none' },
      '/src/data/generated/accounts/e.json': null,
      '/src/data/generated/accounts/ok.json': feed('ok'),
    }).accounts();
    expect(Object.keys(accounts)).toEqual(['ok']);
  });

  it('image files and links never reach accounts(); feeds and riot.json never reach accountImages()', () => {
    const loader = createGeneratedLoader(
      {
        '/src/data/generated/accounts/steam.json': feed('steam'),
        '/src/data/generated/accounts/img/3fa2c1d09b7e.json': feed('img'),
        '/src/data/generated/links/riot.json': riot(),
      },
      { '/src/data/generated/accounts/img/3fa2c1d09b7e.png': IMG('3fa2c1d09b7e.png') },
    );
    expect(Object.keys(loader.accounts())).toEqual(['steam']);
    expect(Object.keys(loader.accountImages())).toEqual(['3fa2c1d09b7e.png']);
    expect(loader.links()?.riotId).toBe('Hide on bush#KR1');
    expect(loader.github()).toBeUndefined();
    expect(loader.stats()).toBeUndefined();
  });

  it('accountImages() maps each accounts/img file name to its metadata and ignores other folders', () => {
    const a = IMG('3fa2c1d09b7e.png');
    const b = IMG('9c01d2e3f4a5.jpg');
    const c = IMG('1b2c3d4e5f60.webp');
    const loader = createGeneratedLoader(
      {},
      {
        '../data/generated/accounts/img/3fa2c1d09b7e.png': a,
        '/src/data/generated/accounts/img/9c01d2e3f4a5.jpg': b,
        '/tests/fixtures/generated/accounts/img/1b2c3d4e5f60.webp': c,
        '/src/data/generated/accounts/other.png': IMG('other.png'),
        '/src/data/generated/accounts/img/notes.txt': IMG('notes.txt'),
      },
    );
    expect(loader.accountImages()).toEqual({ '3fa2c1d09b7e.png': a, '9c01d2e3f4a5.jpg': b, '1b2c3d4e5f60.webp': c });
    expect(createGeneratedLoader({}).accountImages()).toEqual({});
  });

  it('links() keeps a valid links/riot.json with both links', () => {
    expect(linksFrom(riot())).toEqual(riot());
    expect(linksFrom(riot())?.links).toEqual({ lol: LOL, tft: TFT });
  });

  it('links() drops a wrong platform, schemaVersion or status, a non-object and a missing file', () => {
    expect(linksFrom(riot({ platform: 'lol' }))).toBeUndefined();
    expect(linksFrom(riot({ schemaVersion: 2 }))).toBeUndefined();
    expect(linksFrom(riot({ status: 'error' }))).toBeUndefined();
    expect(linksFrom(riot({ links: null }))).toBeUndefined();
    expect(linksFrom(['riot'])).toBeUndefined();
    expect(createGeneratedLoader({}).links()).toBeUndefined();
    // Only links/riot.json counts: a riot.json elsewhere is not the links file.
    expect(createGeneratedLoader({ '/src/data/generated/links/other.json': riot() }).links()).toBeUndefined();
  });

  it('links() drops an href that fails HREF_ALLOW and keeps the other; no link left → undefined', () => {
    const badLol = linksFrom(riot({ links: { lol: 'https://evil.example/lol/summoners/kr/x', tft: TFT } }));
    expect(badLol?.links).toEqual({ tft: TFT });
    const badTft = linksFrom(riot({ links: { lol: LOL, tft: 'https://lolchess.gg/profile/kr/x?next=//evil' } }));
    expect(badTft?.links).toEqual({ lol: LOL });
    expect(linksFrom(riot({ links: { lol: 'http://op.gg/lol/summoners/kr/x', tft: 42 } }))).toBeUndefined();
    expect(linksFrom(riot({ links: {} }))).toBeUndefined();
    expect(linksFrom(riot({ links: { lol: LOL } }))?.links).toEqual({ lol: LOL });
  });

  it('links() returns only the RiotLinks fields', () => {
    const extra = linksFrom({ ...riot(), owner: 'x', links: { lol: LOL, tft: TFT, dnf: 'https://example.com/' } });
    expect(Object.keys(extra ?? {}).sort()).toEqual(['fetchedAt', 'links', 'platform', 'riotId', 'schemaVersion', 'status']);
    expect(extra?.links).toEqual({ lol: LOL, tft: TFT });
  });

  it('freshenFixtureFeeds (SB_E2E_ACCOUNTS=1 only) stamps account feeds and riot.json with the build time', () => {
    const buildTime = '2026-09-30T00:00:00.000Z';
    const gi = { ...feed('enka-genshin'), fetchedAt: '2026-01-01T00:00:00.000Z' };
    const links = riot({ fetchedAt: '2026-01-01T00:00:00.000Z' });
    const gh = github();
    const out = freshenFixtureFeeds(
      { '/tests/fixtures/generated/accounts/enka-genshin.json': gi, '/tests/fixtures/generated/links/riot.json': links, '/tests/fixtures/generated/github.json': gh },
      buildTime,
    );
    expect((out['/tests/fixtures/generated/accounts/enka-genshin.json'] as AccountFeed).fetchedAt).toBe(buildTime);
    expect((out['/tests/fixtures/generated/links/riot.json'] as RiotLinks).fetchedAt).toBe(buildTime);
    expect(out['/tests/fixtures/generated/github.json']).toBe(gh);
    // The inputs are not modified.
    expect(gi.fetchedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(links.fetchedAt).toBe('2026-01-01T00:00:00.000Z');
  });
});

describe('the committed fixture feeds (tests/fixtures/generated, SB_E2E_ACCOUNTS=1 builds only)', () => {
  const dir = 'tests/fixtures/generated';
  const json = (p: string): unknown => JSON.parse(readFileSync(`${dir}/${p}`, 'utf8'));
  const files: Record<string, unknown> = {
    '/tests/fixtures/generated/accounts/enka-genshin.json': json('accounts/enka-genshin.json'),
    '/tests/fixtures/generated/accounts/enka-zzz.json': json('accounts/enka-zzz.json'),
    '/tests/fixtures/generated/accounts/steam.json': json('accounts/steam.json'),
    '/tests/fixtures/generated/links/riot.json': json('links/riot.json'),
  };
  const imgNames = readdirSync(`${dir}/accounts/img`).sort();
  const images = Object.fromEntries(imgNames.map((n) => [`/tests/fixtures/generated/accounts/img/${n}`, IMG(n)]));
  const loader = createGeneratedLoader(files, images);

  it('has the four feed files, six e2efixture images and nothing else', () => {
    expect(readdirSync(dir).sort()).toEqual(['accounts', 'links']);
    expect(readdirSync(`${dir}/accounts`).sort()).toEqual(['enka-genshin.json', 'enka-zzz.json', 'img', 'steam.json']);
    expect(readdirSync(`${dir}/links`)).toEqual(['riot.json']);
    expect(imgNames).toEqual(['e2efixture01.png', 'e2efixture02.png', 'e2efixture03.png', 'e2efixture04.png', 'e2efixture05.png', 'e2efixture06.png']);
  });

  it('every feed is accepted, ok, with a ko and an en card named E2E Fixture …, and an old fixed fetchedAt', () => {
    const accounts = loader.accounts();
    expect(Object.keys(accounts).sort()).toEqual(['enka-genshin', 'enka-zzz', 'steam']);
    const titles = { 'enka-genshin': 'E2E Fixture GI', 'enka-zzz': 'E2E Fixture ZZZ', steam: 'E2E Fixture STM' } as const;
    for (const [stem, title] of Object.entries(titles)) {
      const f = accounts[stem];
      expect(f?.platform).toBe(stem);
      expect(f?.status).toBe('ok');
      expect(f?.fetchedAt).toBe('2026-01-01T00:00:00.000Z');
      expect(isFresh(f, NOW)).toBe(false); // only freshenFixtureFeeds (the test build) makes them current
      expect(f?.cards.map((c) => c.lang)).toEqual(['ko', 'en']);
      for (const card of f?.cards ?? []) expect(card.title).toBe(title);
    }
  });

  it('every image a fixture card names exists in the fixture image folder', () => {
    const map = loader.accountImages();
    const named = Object.values(loader.accounts()).flatMap((f) => f.cards.flatMap((c) => [c.image, c.banner, ...(c.items ?? []).map((i) => i.image)]));
    const used = named.filter((n): n is string => typeof n === 'string');
    expect(used.length).toBeGreaterThan(0);
    for (const name of used) expect(Object.keys(map)).toContain(name);
  });

  it('riot.json is the spec example Riot ID with both links', () => {
    expect(loader.links()).toEqual({ schemaVersion: 1, platform: 'riot', status: 'ok', fetchedAt: '2026-01-01T00:00:00.000Z', riotId: 'Hide on bush#KR1', links: { lol: LOL, tft: TFT } });
  });
});
