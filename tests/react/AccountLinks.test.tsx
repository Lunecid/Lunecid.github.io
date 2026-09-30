// AL-10: the LINKED ACCOUNTS row, server part (spec §3.1, §3.5, §3.7; plan DV-27: LoL and TFT are separate tiles).
// The tiles come from the real view model over the committed synthetic fixture feeds (tests/fixtures/generated),
// stamped fresh as the SB_E2E_ACCOUNTS=1 build does; islandImage is mocked (no astro:assets in jsdom).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ImageMetadata } from 'astro';
import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/island-image.server', () => ({
  islandImage: vi.fn(async (src: ImageMetadata, widths: number[], sizes: string) => ({
    src: `${src.src}?w=${widths[widths.length - 1]}`,
    srcSet: widths.map((w) => `${src.src}?w=${w} ${w}w`).join(', '),
    avifSrcSet: widths.map((w) => `${src.src}?w=${w}&f=avif ${w}w`).join(', '),
    sizes,
    width: src.width,
    height: src.height,
  })),
}));

import { favoriteGameSchema, type FavoriteGameData } from '../../src/content/schemas';
import { parseYamlList } from '../../src/content/yaml-loader';
import type { Lang } from '../../src/i18n/ui';
import AccountLinks from '../../src/islands/AccountLinks';
import { accountLinksLabels, buildAccountView, type AccountTile } from '../../src/lib/account-view';
import { createGeneratedLoader, freshenFixtureFeeds } from '../../src/lib/generated';

const FIXTURES = join(process.cwd(), 'tests/fixtures/generated');
const readJson = (rel: string): unknown => JSON.parse(readFileSync(join(FIXTURES, rel), 'utf8'));
const files = freshenFixtureFeeds(
  {
    '/g/accounts/enka-genshin.json': readJson('accounts/enka-genshin.json'),
    '/g/accounts/enka-zzz.json': readJson('accounts/enka-zzz.json'),
    '/g/accounts/steam.json': readJson('accounts/steam.json'),
    '/g/links/riot.json': readJson('links/riot.json'),
  },
  new Date().toISOString(),
);
const loader = createGeneratedLoader(files);
const images: Record<string, ImageMetadata> = Object.fromEntries(
  [1, 2, 3, 4, 5, 6].map((n) => {
    const name = `e2efixture0${n}.png`;
    return [name, { src: `/_astro/${name}`, width: 96, height: 96, format: 'png' } as ImageMetadata];
  }),
);

const yamlGames = parseYamlList(readFileSync(join(process.cwd(), 'src/data/favorites.yaml'), 'utf8'), 'games').map((g) => favoriteGameSchema.parse(g));
const TILE_ON: FavoriteGameData[] = yamlGames.map((g) => ({ ...g, integration: { ...g.integration, enabled: ['zzz', 'genshin', 'lol', 'tft', 'steam'].includes(g.id) } }));

async function tilesFor(lang: Lang, opts: { feeds?: boolean } = {}): Promise<AccountTile[]> {
  const on = opts.feeds ?? true;
  return buildAccountView(TILE_ON, on ? loader.accounts() : {}, on ? loader.links() : undefined, images, lang);
}

async function ssr(lang: Lang, tiles?: AccountTile[]): Promise<string> {
  const list = tiles ?? (await tilesFor(lang));
  return renderToString(<AccountLinks lang={lang} tiles={list} labels={accountLinksLabels(lang)} relay={null} steamButton={false} />);
}

const parse = (html: string): Document => new DOMParser().parseFromString(`<!doctype html><body>${html}</body>`, 'text/html');

afterEach(() => vi.restoreAllMocks());

describe('AccountLinks SSR (<details> tiles, no JavaScript needed)', () => {
  it('shown tiles render as details.acct-tile in the order zzz, genshin, lol, tft, steam inside ul.acct-row[role=list]', async () => {
    const doc = parse(await ssr('ko'));
    const row = doc.querySelector('ul.acct-row');
    expect(row?.getAttribute('role')).toBe('list');
    const tiles = [...doc.querySelectorAll('ul.acct-row > li > details.acct-tile')];
    expect(tiles).toHaveLength(5);
    expect(tiles.map((d) => d.querySelector('summary .acct-tile__name')?.textContent)).toEqual(['젠레스 존 제로', '원신', '리그 오브 레전드', '전략적 팀 전투', 'Steam']);
    expect(tiles.map((d) => d.querySelector('summary .acct-tile__glyph')?.textContent)).toEqual(['ZZZ', 'GI', 'LOL', 'TFT', 'STM']);
    for (const d of tiles) expect(d.querySelector(':scope > summary + div.acct-card.acct-card--static')).not.toBeNull();
    const en = parse(await ssr('en'));
    expect([...en.querySelectorAll('details.acct-tile .acct-tile__name')].map((n) => n.textContent)).toEqual([
      'Zenless Zone Zero', 'Genshin Impact', 'League of Legends', 'Teamfight Tactics', 'Steam',
    ]);
  });

  it('visible game name and teaser, the teaser sr text, glyph aria-hidden, no aria-label anywhere', async () => {
    const html = await ssr('ko');
    expect(html).not.toContain('aria-label');
    const doc = parse(html);
    const summaries = [...doc.querySelectorAll('details.acct-tile > summary')];
    const teasers = summaries.map((s) => s.querySelector('.acct-tile__teaser'));
    expect(teasers.map((x) => x?.textContent)).toEqual(['LV 55', 'AR 57', 'op.gg', 'lolchess.gg', 'LV 42']);
    for (const x of teasers) {
      expect(x?.getAttribute('aria-hidden')).toBe('true');
      expect(x?.getAttribute('lang')).toBe('en');
    }
    expect(summaries.map((s) => s.querySelector('.sr-only')?.textContent)).toEqual(['인터노트 레벨 55', '모험 등급 57', 'op.gg 전적 링크', 'lolchess.gg 전적 링크', 'Steam 레벨 42']);
    for (const s of summaries) {
      const frame = s.querySelector('.acct-tile__frame');
      expect(frame?.getAttribute('aria-hidden')).toBe('true');
      expect(frame?.querySelector('.acct-tile__glyph')).not.toBeNull();
    }
  });

  it('the lol static card has exactly one link (op.gg), the tft card exactly one (lolchess.gg); new-tab, no referrer', async () => {
    const doc = parse(await ssr('ko'));
    const [, , lol, tft] = [...doc.querySelectorAll('details.acct-tile')];
    const lolLinks = [...(lol?.querySelectorAll('.acct-card a') ?? [])];
    const tftLinks = [...(tft?.querySelectorAll('.acct-card a') ?? [])];
    expect(lolLinks.map((a) => a.getAttribute('href'))).toEqual(['https://op.gg/lol/summoners/kr/Hide%20on%20bush-KR1']);
    expect(tftLinks.map((a) => a.getAttribute('href'))).toEqual(['https://lolchess.gg/profile/kr/Hide%20on%20bush-KR1']);
    for (const a of [...lolLinks, ...tftLinks]) {
      expect(a.getAttribute('target')).toBe('_blank');
      expect(a.getAttribute('rel')).toBe('noopener noreferrer');
      expect(a.getAttribute('referrerpolicy')).toBe('no-referrer');
      expect(a.querySelector('[aria-hidden="true"]')?.textContent).toBe('↗');
      expect(a.querySelector('.sr-only')?.textContent).toBe('새 탭에서 열림');
    }
    expect(lolLinks[0]?.textContent).toContain('LoL 전적 보기 (op.gg)');
    expect(tftLinks[0]?.textContent).toContain('TFT 전적 보기 (lolchess.gg)');
    // the Riot ID as text, the external-site line, and no fetched-at line (links do not go stale)
    expect(lol?.querySelector('.acct-card')?.textContent).toContain('Hide on bush#KR1');
    expect(lol?.querySelector('.acct-card')?.textContent).toContain('외부 전적 사이트로 이동합니다.');
    expect(lol?.querySelector('.acct-card__asof')).toBeNull();
  });

  it('G-010: the static card holds the numbers, labels and the fetched-at line in the HTML', async () => {
    const doc = parse(await ssr('ko'));
    const [zzz, genshin, , , steam] = [...doc.querySelectorAll('details.acct-tile')];
    const rows = (d: Element | undefined) => [...(d?.querySelectorAll('.acct-card dl > div') ?? [])].map((r) => `${r.querySelector('dt')?.textContent}=${r.querySelector('dd')?.textContent}`);
    expect(rows(genshin)).toEqual(['모험 등급=57', '업적=812', '나선 비경=12층 3방', '환상극=8막']);
    expect(rows(zzz)).toEqual(['인터노트 레벨=55']);
    expect(rows(steam)).toEqual(['Steam 레벨=42']);
    expect(genshin?.querySelector('.acct-card__title')?.textContent).toBe('E2E Fixture GI');
    expect(zzz?.querySelector('.acct-card__sub')?.textContent).toBe('합성 칭호');
    expect(genshin?.querySelector('.acct-card__asof')?.textContent).toMatch(/^기준 시각 \d{4}\.\d{2}\.\d{2} \d{2}:\d{2} KST$/);
    expect(genshin?.querySelector('.acct-card__data')?.textContent).toBe('데이터: Enka.Network');
    expect([...(genshin?.querySelectorAll('.acct-card__items li') ?? [])].map((li) => li.textContent)).toEqual([
      '합성 캐릭터 가Lv 90', '합성 캐릭터 나Lv 80', '합성 캐릭터 다Lv 70', '합성 캐릭터 라Lv 60',
    ]);
    // the per-card notices (spec §9.3): Steam carries the Valve lines, the Riot tiles none
    expect(steam?.querySelector('.acct-card__notices')?.textContent).toContain('Valve Corporation');
    expect(steam?.querySelector('.acct-card a')?.getAttribute('href')).toBe('https://steamcommunity.com/profiles/76561197960435530');
    expect(steam?.querySelector('.acct-card a')?.getAttribute('rel')).not.toContain('nofollow');
  });

  it('images inside the closed details are loading="lazy"; only the avatar has alt text', async () => {
    const doc = parse(await ssr('ko'));
    const imgs = [...doc.querySelectorAll('details.acct-tile img')];
    expect(imgs.length).toBeGreaterThan(0);
    for (const img of imgs) expect(img.getAttribute('loading')).toBe('lazy');
    expect(doc.querySelector('details.acct-tile .acct-card__avatar img')?.getAttribute('alt')).toBe('E2E Fixture ZZZ 프로필 이미지');
    for (const img of doc.querySelectorAll('details.acct-tile .acct-card__items img, details.acct-tile .acct-card__banner img')) expect(img.getAttribute('alt')).toBe('');
  });

  it('the tint arrives as a style custom property (background only)', async () => {
    const html = await ssr('ko');
    expect(html).toContain('style="--acct-tint:var(--tint-remielle)"');
    expect(html).toContain('style="--acct-tint:var(--tint-eula)"');
    expect(html).toContain('style="--acct-tint:var(--acct-tint-riot)"');
    expect(html).toContain('style="--acct-tint:var(--acct-tint-steam)"');
  });

  it('the caption: mono LINKED ACCOUNTS (lang="en") with the Korean name on ko pages, English only on en pages', async () => {
    const ko = parse(await ssr('ko')).querySelector('.acct-links__cap');
    expect(ko?.querySelector('[lang="en"]')?.textContent).toBe('LINKED ACCOUNTS');
    expect(ko?.textContent).toContain('연동 계정');
    const en = parse(await ssr('en')).querySelector('.acct-links__cap');
    expect(en?.textContent).toBe('LINKED ACCOUNTS');
  });

  it('zero shown tiles → exactly the empty frame, no caption (unlinked, error, stale or no tile at all)', async () => {
    const empty = '<div class="acct-row acct-row--empty"></div>';
    expect(await ssr('ko', [])).toBe(empty);
    const unlinked = await tilesFor('ko', { feeds: false });
    expect(unlinked.map((t) => t.state)).toEqual(['unlinked', 'unlinked', 'unlinked', 'unlinked', 'unlinked']);
    expect(await ssr('ko', unlinked)).toBe(empty);
    const shown = await tilesFor('en');
    expect(await ssr('en', shown.map((t) => ({ ...t, state: 'stale' as const })))).toBe(empty);
    // one shown tile among hidden ones → exactly one tile
    const one = shown.map((t, i) => (i === 1 ? t : { ...t, state: 'error' as const }));
    expect(parse(await ssr('en', one)).querySelectorAll('details.acct-tile')).toHaveLength(1);
  });

  it('no management string reaches the visitor markup or the labels', async () => {
    const html = await ssr('ko');
    expect(html).not.toContain('accounts-admin');
    expect(html).not.toMatch(/연동 관리|Manage links|GitHub/);
    expect(JSON.stringify(accountLinksLabels('ko'))).not.toMatch(/accounts-admin|GitHub/);
  });

  it('hydration: the client renders the same <details> markup (no mismatch), reads no URL, makes no request', async () => {
    const tiles = await tilesFor('ko');
    const html = await ssr('ko', tiles);
    const host = document.createElement('div');
    host.innerHTML = html;
    document.body.append(host);
    const before = host.innerHTML; // the parsed SSR markup (attribute names normalised by the parser)
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const errors: unknown[] = [];
    const consoleError = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => errors.push(args));
    await act(async () => {
      hydrateRoot(host, <AccountLinks lang="ko" tiles={tiles} labels={accountLinksLabels('ko')} relay={null} steamButton={false} />, {
        onRecoverableError: (e) => errors.push(e),
      });
    });
    expect(errors).toEqual([]);
    expect(host.innerHTML).toBe(before);
    expect(host.querySelectorAll('details.acct-tile')).toHaveLength(5);
    expect(host.querySelector('button')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    consoleError.mockRestore();
    host.remove();
  });
});
