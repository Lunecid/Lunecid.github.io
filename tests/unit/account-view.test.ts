// AL-9: the per-game account view model (spec §3.1–3.5, §5.6; plan DV-27: LoL and TFT are separate tiles).
// Synthetic feeds only (the spec's public example IDs); a fixed `now`.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ImageMetadata } from 'astro';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/island-image.server', () => ({
  islandImage: vi.fn(async (src: ImageMetadata, widths: number[], sizes: string) => ({
    src: `${src.src}?w=${widths[widths.length - 1]}`,
    srcSet: widths.map((w) => `${src.src}?w=${w} ${w}w`).join(', '),
    sizes,
    width: src.width,
    height: src.height,
  })),
}));

import { favoriteGameSchema, type FavoriteGameData } from '../../src/content/schemas';
import { parseYamlList } from '../../src/content/yaml-loader';
import { ui } from '../../src/i18n/ui';
import { RECENT_PLAYTIME_WEEKS } from '../../src/lib/account-config';
import {
  DIALOG_HEADS,
  METRIC_LABEL_KEYS,
  TILE_GLYPHS,
  TILE_SLOTS,
  TILE_SOURCES,
  accountStatus,
  accountStatusJson,
  buildAccountView,
  formatAsOfKst,
  type AccountTile,
} from '../../src/lib/account-view';
import { ACCOUNT_HEADS } from '../../src/lib/favorites';
import type { AccountCard, AccountFeed, RiotLinks } from '../../src/lib/generated';
import { islandImage } from '../../src/lib/island-image.server';

const yamlGames = parseYamlList(readFileSync(join(process.cwd(), 'src/data/favorites.yaml'), 'utf8'), 'games').map((g) =>
  favoriteGameSchema.parse(g),
);
/** Every favorites game with integration.enabled forced to `on` (the yaml's own switches belong to AL-10). */
const withEnabled = (on: (id: string) => boolean): FavoriteGameData[] =>
  yamlGames.map((g) => ({ ...g, integration: { ...g.integration, enabled: on(g.id) } }));
const ALL_ON = withEnabled(() => true);
const TILE_ON = withEnabled((id) => ['zzz', 'genshin', 'lol', 'tft', 'steam'].includes(id));

const NOW = Date.parse('2026-09-30T00:00:00Z');
const FETCHED = '2026-09-29T18:31:02Z';
const OLD = '2026-09-01T00:00:00Z';

const meta = (name: string): ImageMetadata => ({ src: `/_astro/${name}`, width: 96, height: 96, format: 'png' }) as ImageMetadata;
const IMAGES: Record<string, ImageMetadata> = {
  'aaaaaaaaaaa1.png': meta('aaaaaaaaaaa1.png'),
  'aaaaaaaaaaa2.jpg': meta('aaaaaaaaaaa2.jpg'),
  'aaaaaaaaaaa3.png': meta('aaaaaaaaaaa3.png'),
};

function feed(platform: string, cards: AccountCard[], extra: Partial<AccountFeed> = {}): AccountFeed {
  return { schemaVersion: 1, platform, status: 'ok', fetchedAt: FETCHED, maxAgeDays: 7, attribution: 'x', cards, ...extra };
}
const genshinCard = (lang: 'ko' | 'en', title: string): AccountCard => ({
  lang,
  title,
  image: 'aaaaaaaaaaa1.png',
  banner: 'aaaaaaaaaaa2.jpg',
  stats: [],
  metrics: [
    { key: 'ar', value: 57, max: 60 },
    { key: 'achievements', value: 1234 },
    { key: 'abyss', value: '12-3' },
    { key: 'theater', value: 8 },
  ],
  items: [
    { name: '합성 캐릭터', image: 'aaaaaaaaaaa3.png', meta: 'Lv 90' },
    { name: '이미지 없는 캐릭터', image: 'missing00000.png', meta: 'Lv 80' },
  ],
});
const FEEDS: Record<string, AccountFeed> = {
  'enka-genshin': feed('enka-genshin', [genshinCard('ko', '합성 닉네임'), genshinCard('en', 'Synthetic Name')]),
  'enka-zzz': feed('enka-zzz', [{ title: 'Synthetic ZZZ', subtitle: '합성 칭호', stats: [], metrics: [{ key: 'ikLevel', value: 55 }], items: [] }]),
  steam: feed('steam', [
    {
      title: 'Synthetic STM',
      stats: [],
      metrics: [
        { key: 'steamLevel', value: 42 },
        { key: 'playtimeTotal', value: 1500, unit: 'hours' },
        { key: 'playtime2w', value: 12, unit: 'hours' },
      ],
      items: [],
      link: { kind: 'steam', href: 'https://steamcommunity.com/profiles/76561197960435530' },
    },
  ]),
};
const LINKS: RiotLinks = {
  schemaVersion: 1,
  platform: 'riot',
  status: 'ok',
  fetchedAt: FETCHED,
  riotId: 'Hide on bush#KR1',
  links: { lol: 'https://op.gg/lol/summoners/kr/Hide%20on%20bush-KR1', tft: 'https://lolchess.gg/profile/kr/Hide%20on%20bush-KR1' },
};

const byKey = (tiles: AccountTile[]) => Object.fromEntries(tiles.map((t) => [t.key, t]));

beforeEach(() => {
  vi.mocked(islandImage).mockClear();
});

describe('tile constants (DV-27)', () => {
  it('maps each tile to its source, the Riot tiles to one link each; slots and glyphs are fixed', () => {
    expect(TILE_SOURCES).toEqual({
      genshin: { source: 'enka-genshin' },
      zzz: { source: 'enka-zzz' },
      steam: { source: 'steam' },
      lol: { source: 'riot', link: 'lol' },
      tft: { source: 'riot', link: 'tft' },
    });
    expect(TILE_SLOTS).toEqual(['genshin', 'zzz', 'steam', 'lol', 'tft']);
    expect(TILE_GLYPHS).toEqual({ genshin: 'GI', zzz: 'ZZZ', steam: 'STM', lol: 'LOL', tft: 'TFT' });
    expect(DIALOG_HEADS).toEqual({
      genshin: 'ADVENTURER PROFILE',
      zzz: 'INTER-KNOT PROFILE',
      steam: 'STEAM PROFILE',
      lol: 'PROFILE LINK',
      tft: 'PROFILE LINK',
    });
    // ACCOUNT_HEADS is frozen (Global Constraints): riot keeps SUMMONER PROFILE.
    expect(ACCOUNT_HEADS.riot).toBe('SUMMONER PROFILE');
    // integration.platform in the yaml equals the tile source (lol and tft both 'riot').
    for (const key of TILE_SLOTS) expect(yamlGames.find((g) => g.id === key)?.integration.platform, key).toBe(TILE_SOURCES[key].source);
  });
});

describe('buildAccountView', () => {
  it('shows a tile only when enabled and the feed is ok and fresh; card only on shown', async () => {
    const tiles = await buildAccountView(TILE_ON, FEEDS, LINKS, IMAGES, 'ko', NOW);
    expect(tiles.map((t) => [t.key, t.state])).toEqual([
      ['zzz', 'shown'],
      ['genshin', 'shown'],
      ['lol', 'shown'],
      ['tft', 'shown'],
      ['steam', 'shown'],
    ]);
    for (const t of tiles) expect(t.card, t.key).toBeDefined();

    const off = await buildAccountView(withEnabled((id) => id === 'zzz'), FEEDS, LINKS, IMAGES, 'ko', NOW);
    expect(off.map((t) => t.key)).toEqual(['zzz']);

    const stale = await buildAccountView(TILE_ON, { ...FEEDS, 'enka-zzz': { ...FEEDS['enka-zzz']!, fetchedAt: OLD } }, LINKS, IMAGES, 'ko', NOW);
    expect(byKey(stale).zzz?.state).toBe('stale');
    expect(byKey(stale).zzz?.card).toBeUndefined();
    expect(byKey(stale).zzz?.teaser).toBeUndefined();
  });

  it('error for status error or no card; unlinked for no file; every enabled tile listed (owner mode)', async () => {
    const feeds = {
      'enka-genshin': feed('enka-genshin', [], { status: 'error', reason: 'http-404' }),
      'enka-zzz': feed('enka-zzz', []),
    };
    const tiles = byKey(await buildAccountView(TILE_ON, feeds, undefined, IMAGES, 'en', NOW));
    expect(tiles.genshin?.state).toBe('error');
    expect(tiles.zzz?.state).toBe('error');
    expect(tiles.steam?.state).toBe('unlinked');
    expect(tiles.lol?.state).toBe('unlinked');
    expect(tiles.tft?.state).toBe('unlinked');
    for (const t of Object.values(tiles)) expect(t.card, t.key).toBeUndefined();
    const skipped = byKey(await buildAccountView(TILE_ON, { steam: feed('steam', FEEDS.steam!.cards, { status: 'skipped' }) }, undefined, IMAGES, 'en', NOW));
    expect(skipped.steam?.state).toBe('error');
  });

  it('orders tiles zzz, genshin, lol, tft, steam; dnf, eternal-return and hearthstone never make a tile', async () => {
    const tiles = await buildAccountView(ALL_ON, FEEDS, LINKS, IMAGES, 'ko', NOW);
    expect(tiles.map((t) => t.key)).toEqual(['zzz', 'genshin', 'lol', 'tft', 'steam']);
    const reversed = await buildAccountView([...ALL_ON].reverse(), FEEDS, LINKS, IMAGES, 'ko', NOW);
    expect(reversed.map((t) => t.key)).toEqual(['zzz', 'genshin', 'lol', 'tft', 'steam']);
    expect(tiles.map((t) => t.slot)).toEqual([1, 0, 3, 4, 2]);
    expect(tiles.map((t) => t.glyph)).toEqual(['ZZZ', 'GI', 'LOL', 'TFT', 'STM']);
    expect(tiles.map((t) => t.source)).toEqual(['enka-zzz', 'enka-genshin', 'riot', 'riot', 'steam']);
  });

  it('Riot: one riot.json gives the lol tile op.gg and the tft tile lolchess.gg', async () => {
    const tiles = byKey(await buildAccountView(TILE_ON, {}, LINKS, IMAGES, 'ko', NOW));
    expect(tiles.lol?.card?.riot).toEqual({ riotId: 'Hide on bush#KR1', href: LINKS.links.lol, site: 'op.gg' });
    expect(tiles.tft?.card?.riot).toEqual({ riotId: 'Hide on bush#KR1', href: LINKS.links.tft, site: 'lolchess.gg' });
    expect(tiles.lol?.card?.title).toBe('Hide on bush#KR1');
    expect(tiles.lol?.card?.fetchedAt).toBeUndefined();
    expect(tiles.lol?.card?.fetchedAtText).toBeUndefined();
    expect(tiles.lol?.card?.notices).toEqual([]);
    expect(tiles.tft?.card?.notices).toEqual([]);
    expect(tiles.lol?.head).toBe('PROFILE LINK');
    expect(tiles.lol?.name).toBe('리그 오브 레전드');
    expect(tiles.tft?.name).toBe('전략적 팀 전투');
    // links do not go stale
    const old = byKey(await buildAccountView(TILE_ON, {}, { ...LINKS, fetchedAt: OLD }, IMAGES, 'ko', NOW));
    expect(old.lol?.state).toBe('shown');
  });

  it('Riot: a missing or bad tft link makes only the tft tile an error; no riot.json → both unlinked', async () => {
    const noTft = byKey(await buildAccountView(TILE_ON, {}, { ...LINKS, links: { lol: LINKS.links.lol } }, IMAGES, 'ko', NOW));
    expect(noTft.lol?.state).toBe('shown');
    expect(noTft.tft?.state).toBe('error');
    const bad = byKey(await buildAccountView(TILE_ON, {}, { ...LINKS, links: { lol: LINKS.links.lol, tft: 'https://lolchess.gg/profile/na/x' } }, IMAGES, 'ko', NOW));
    expect(bad.lol?.state).toBe('shown');
    expect(bad.tft?.state).toBe('error');
    const badLol = byKey(await buildAccountView(TILE_ON, {}, { ...LINKS, links: { lol: 'https://evil.example/x', tft: LINKS.links.tft } }, IMAGES, 'ko', NOW));
    expect(badLol.lol?.state).toBe('error');
    expect(badLol.tft?.state).toBe('shown');
    const none = byKey(await buildAccountView(TILE_ON, {}, undefined, IMAGES, 'ko', NOW));
    expect([none.lol?.state, none.tft?.state]).toEqual(['unlinked', 'unlinked']);
  });

  it('lang picks the card: ko, en, fallback cards[0]', async () => {
    const ko = byKey(await buildAccountView(TILE_ON, FEEDS, LINKS, IMAGES, 'ko', NOW));
    const en = byKey(await buildAccountView(TILE_ON, FEEDS, LINKS, IMAGES, 'en', NOW));
    expect(ko.genshin?.card?.title).toBe('합성 닉네임');
    expect(en.genshin?.card?.title).toBe('Synthetic Name');
    expect(en.zzz?.card?.title).toBe('Synthetic ZZZ');
    expect(en.zzz?.card?.subtitle).toBe('합성 칭호');
    const onlyEn = byKey(await buildAccountView(TILE_ON, { 'enka-genshin': feed('enka-genshin', [genshinCard('en', 'Only EN')]) }, LINKS, IMAGES, 'ko', NOW));
    expect(onlyEn.genshin?.card?.title).toBe('Only EN');
  });

  it('metrics → labels, templates, max only when present; countTo null for templated values; unknown key dropped', async () => {
    const ko = byKey(await buildAccountView(TILE_ON, FEEDS, LINKS, IMAGES, 'ko', NOW));
    expect(ko.genshin?.card?.stats).toEqual([
      { key: 'ar', label: '모험 등급', display: '57 / 60', countTo: 57, sr: '모험 등급 57 / 60' },
      { key: 'achievements', label: '업적', display: '1,234', countTo: 1234, sr: '업적 1,234' },
      { key: 'abyss', label: '나선 비경', display: '12층 3방', countTo: null, sr: '나선 비경 12층 3방' },
      { key: 'theater', label: '환상극', display: '8막', countTo: null, sr: '환상극 8막' },
    ]);
    expect(ko.zzz?.card?.stats).toEqual([{ key: 'ikLevel', label: '인터노트 레벨', display: '55', countTo: 55, sr: '인터노트 레벨 55' }]);
    expect(ko.steam?.card?.stats.map((s) => [s.label, s.display, s.countTo])).toEqual([
      ['Steam 레벨', '42', 42],
      ['총 플레이', '1,500시간', null],
      [`최근 ${RECENT_PLAYTIME_WEEKS}주`, '12시간', null],
    ]);
    const en = byKey(await buildAccountView(TILE_ON, FEEDS, LINKS, IMAGES, 'en', NOW));
    expect(en.genshin?.card?.stats.map((s) => s.display)).toEqual(['57 / 60', '1,234', 'Floor 12 · Chamber 3', 'Act 8']);
    expect(en.steam?.card?.stats.map((s) => s.display)).toEqual(['42', '1,500 h', '12 h']);

    const odd = feed('enka-genshin', [
      {
        title: 'x',
        stats: [],
        metrics: [
          { key: 'worldLevel', value: 8 },
          { key: 'bogus' as never, value: 1 },
          { key: 'abyss', value: 'not-a-floor' },
        ],
      },
    ]);
    const oddTiles = byKey(await buildAccountView(TILE_ON, { 'enka-genshin': odd }, LINKS, IMAGES, 'ko', NOW));
    expect(oddTiles.genshin?.card?.stats).toEqual([{ key: 'worldLevel', label: '세계 레벨', display: '8', countTo: 8, sr: '세계 레벨 8' }]);
  });

  it('every AccountMetricKey has accounts.stat.<key> in ko and en; the playtime2w label reads 최근 2주', () => {
    const keys = Object.keys(METRIC_LABEL_KEYS);
    expect(keys.sort()).toEqual(
      ['ar', 'achievements', 'abyss', 'theater', 'worldLevel', 'ikLevel', 'medal.1', 'medal.2', 'medal.3', 'medal.4', 'steamLevel', 'ownedGames', 'playtimeTotal', 'playtime2w'].sort(),
    );
    for (const [key, uiKey] of Object.entries(METRIC_LABEL_KEYS)) {
      expect(uiKey, key).toBe(`accounts.stat.${key}`);
      expect(ui.ko[uiKey], key).toBeTruthy();
      expect(ui.en[uiKey], key).toBeTruthy();
    }
    expect(ui.ko['accounts.stat.playtime2w'].replace('{n}', String(RECENT_PLAYTIME_WEEKS))).toBe('최근 2주');
    expect(RECENT_PLAYTIME_WEEKS).toBe(2);
  });

  it('images through islandImage (avatar 96×2, banner 480, items 48×2); a name missing from the map is dropped', async () => {
    const ko = byKey(await buildAccountView(TILE_ON, FEEDS, LINKS, IMAGES, 'ko', NOW));
    const card = ko.genshin!.card!;
    expect(card.avatar?.srcSet).toBe('/_astro/aaaaaaaaaaa1.png?w=96 96w, /_astro/aaaaaaaaaaa1.png?w=192 192w');
    expect(card.banner?.srcSet).toBe('/_astro/aaaaaaaaaaa2.jpg?w=480 480w');
    expect(card.items[0]).toEqual({ name: '합성 캐릭터', meta: 'Lv 90', image: expect.objectContaining({ srcSet: '/_astro/aaaaaaaaaaa3.png?w=48 48w, /_astro/aaaaaaaaaaa3.png?w=96 96w' }) });
    expect(card.items[1]).toEqual({ name: '이미지 없는 캐릭터', meta: 'Lv 80' });
    expect(ko.zzz?.card?.avatar).toBeUndefined();
    const calls = vi.mocked(islandImage).mock.calls.map((c) => [c[0].src, c[1]]);
    expect(calls).not.toContainEqual(['/_astro/missing00000.png', expect.anything()]);
  });

  it('Steam: the profile link is kept only when it passes HREF_ALLOW; notices and data lines per tile', async () => {
    const ko = byKey(await buildAccountView(TILE_ON, FEEDS, LINKS, IMAGES, 'ko', NOW));
    expect(ko.steam?.card?.profileLink).toBe('https://steamcommunity.com/profiles/76561197960435530');
    expect(ko.steam?.card?.notices).toEqual(['valve']);
    expect(ko.genshin?.card?.notices).toEqual(['cognosphere']);
    expect(ko.zzz?.card?.notices).toEqual(['zzz-fan-guide']);
    expect(ko.genshin?.card?.dataLine).toBe('데이터: Enka.Network');
    expect(ko.zzz?.card?.dataLine).toBe('데이터: Enka.Network');
    expect(ko.steam?.card?.dataLine).toBeUndefined();
    expect(ko.lol?.card?.dataLine).toBeUndefined();
    const en = byKey(await buildAccountView(TILE_ON, FEEDS, LINKS, IMAGES, 'en', NOW));
    expect(en.genshin?.card?.dataLine).toBe('Data: Enka.Network');
    expect(ko.genshin?.card?.fetchedAt).toBe(FETCHED);
    expect(ko.genshin?.card?.fetchedAtText).toBe('2026.09.30 03:31 KST');
    expect(ko.genshin?.fetchedAt).toBe(FETCHED);
    expect(ko.genshin?.maxAgeDays).toBe(7);

    const badSteam = feed('steam', [{ ...FEEDS.steam!.cards[0]!, link: { kind: 'steam', href: 'https://steamcommunity.com/id/vanity' } }]);
    const bad = byKey(await buildAccountView(TILE_ON, { steam: badSteam }, LINKS, IMAGES, 'ko', NOW));
    expect(bad.steam?.state).toBe('shown');
    expect(bad.steam?.card?.profileLink).toBeUndefined();
  });

  it('teasers per tile, including the Steam level fallback and no teaser without the metric', async () => {
    const ko = byKey(await buildAccountView(TILE_ON, FEEDS, LINKS, IMAGES, 'ko', NOW));
    expect([ko.genshin?.teaser, ko.genshin?.teaserSr]).toEqual(['AR 57', '모험 등급 57']);
    expect([ko.zzz?.teaser, ko.zzz?.teaserSr]).toEqual(['LV 55', '인터노트 레벨 55']);
    expect([ko.steam?.teaser, ko.steam?.teaserSr]).toEqual(['1,500 H', '총 플레이 1,500시간']);
    expect([ko.lol?.teaser, ko.lol?.teaserSr]).toEqual(['op.gg', 'op.gg 전적 링크']);
    expect([ko.tft?.teaser, ko.tft?.teaserSr]).toEqual(['lolchess.gg', 'lolchess.gg 전적 링크']);

    const levelOnly = feed('steam', [{ title: 'x', stats: [], metrics: [{ key: 'steamLevel', value: 42 }] }]);
    const lv = byKey(await buildAccountView(TILE_ON, { steam: levelOnly }, LINKS, IMAGES, 'ko', NOW));
    expect([lv.steam?.teaser, lv.steam?.teaserSr]).toEqual(['LV 42', 'Steam 레벨 42']);
    const nothing = feed('steam', [{ title: 'x', stats: [], metrics: [] }]);
    const no = byKey(await buildAccountView(TILE_ON, { steam: nothing }, LINKS, IMAGES, 'en', NOW));
    expect(no.steam?.state).toBe('shown');
    expect(no.steam?.teaser).toBeUndefined();
    expect(no.steam?.teaserSr).toBeUndefined();
  });

  it('tints: genshin/zzz the first character tint token, steam and riot the neutral account tints', async () => {
    const t = byKey(await buildAccountView(TILE_ON, FEEDS, LINKS, IMAGES, 'ko', NOW));
    expect(t.zzz?.tint).toBe('var(--tint-remielle)');
    expect(t.genshin?.tint).toBe('var(--tint-eula)');
    expect(t.steam?.tint).toBe('var(--acct-tint-steam)');
    expect(t.lol?.tint).toBe('var(--acct-tint-riot)');
    expect(t.tft?.tint).toBe('var(--acct-tint-riot)');
  });
});

describe('accountStatus / accountStatusJson (R-10)', () => {
  it('five slots in TILE_SLOTS order with only slot, state and fetchedAt', () => {
    const feeds = { ...FEEDS, 'enka-zzz': { ...FEEDS['enka-zzz']!, fetchedAt: OLD } };
    const status = accountStatus(ALL_ON, feeds, { ...LINKS, links: { lol: LINKS.links.lol } }, NOW, 'run-1');
    expect(status).toEqual({
      runId: 'run-1',
      platforms: [
        { slot: 0, state: 'shown', fetchedAt: FETCHED },
        { slot: 1, state: 'hidden', fetchedAt: OLD },
        { slot: 2, state: 'shown', fetchedAt: FETCHED },
        { slot: 3, state: 'shown' },
        { slot: 4, state: 'hidden' },
      ],
    });
    const json = JSON.stringify(status);
    for (const secretish of ['Hide on bush', '76561197960435530', '합성 닉네임', 'Synthetic', 'op.gg', 'http']) expect(json).not.toContain(secretish);
    expect(accountStatus(TILE_ON, {}, undefined, NOW, null).platforms.map((p) => p.state)).toEqual(['absent', 'absent', 'absent', 'absent', 'absent']);
    expect(accountStatus(withEnabled((id) => id === 'steam'), FEEDS, LINKS, NOW, null).platforms).toEqual([{ slot: 2, state: 'shown', fetchedAt: FETCHED }]);
    const errored = accountStatus(TILE_ON, { steam: feed('steam', [], { status: 'error', reason: 'auth' }) }, undefined, NOW, null);
    expect(JSON.stringify(errored)).not.toContain('auth');
  });

  it('runId defaults to GITHUB_RUN_ID or null', () => {
    const saved = process.env.GITHUB_RUN_ID;
    try {
      delete process.env.GITHUB_RUN_ID;
      expect(accountStatus(TILE_ON, {}, undefined, NOW).runId).toBeNull();
      process.env.GITHUB_RUN_ID = '12345';
      expect(accountStatus(TILE_ON, {}, undefined, NOW).runId).toBe('12345');
    } finally {
      if (saved === undefined) delete process.env.GITHUB_RUN_ID;
      else process.env.GITHUB_RUN_ID = saved;
    }
  });

  it('accountStatusJson escapes < as the six characters \\u003c', () => {
    const json = accountStatusJson({ runId: '</script><x>', platforms: [] });
    expect(json).not.toContain('<');
    expect(json).toContain('\\u003c/script>\\u003cx>');
    expect(JSON.parse(json)).toEqual({ runId: '</script><x>', platforms: [] });
  });
});

describe('formatAsOfKst (StatsSummary format; OQ-6)', () => {
  it('ko YYYY.MM.DD HH:MM KST and en Mon D, YYYY HH:MM KST in Asia/Seoul', () => {
    expect(formatAsOfKst('2026-09-29T18:31:02Z', 'ko')).toBe('2026.09.30 03:31 KST');
    expect(formatAsOfKst('2026-09-29T18:31:02Z', 'en')).toBe('Sep 30, 2026 03:31 KST');
    expect(formatAsOfKst('2026-01-05T14:59:00Z', 'en')).toBe('Jan 5, 2026 23:59 KST');
    expect(formatAsOfKst('2026-01-05T15:00:00Z', 'ko')).toBe('2026.01.06 00:00 KST');
  });
});
