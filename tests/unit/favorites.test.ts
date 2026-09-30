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

import { favoriteGameSchema } from '../../src/content/schemas';
import { parseYamlList } from '../../src/content/yaml-loader';
import { CHARACTER_GAME_LABEL, POSITIONS, SHOWCASE_SIZES, SHOWCASE_SIZES_LIST, SHOWCASE_WIDTHS, createCharacterLookup } from '../../src/lib/characters';
import { ACCOUNT_HEADS, buildFavoriteGames, buildFavoriteTiles } from '../../src/lib/favorites';
import { islandImage } from '../../src/lib/island-image.server';

const root = process.cwd();
const games = parseYamlList(readFileSync(join(root, 'src/data/favorites.yaml'), 'utf8'), 'games').map((g) =>
  favoriteGameSchema.parse(g),
);
const meta = (id: string): ImageMetadata => ({ src: `/_astro/${id}.png`, width: 2000, height: 1200, format: 'png' }) as ImageMetadata;
const none = createCharacterLookup({});
const all = createCharacterLookup({
  '../assets/characters/remielle.png': meta('remielle'),
  '../assets/characters/eula.png': meta('eula'),
  '../assets/characters/mona.png': meta('mona'),
});

beforeEach(() => {
  vi.mocked(islandImage).mockClear();
});

describe('buildFavoriteGames', () => {
  it('buildFavoriteGames keeps yaml order, locks every game without an intro, uses reason as caption', async () => {
    const ko = await buildFavoriteGames(games, 'ko', none);
    expect(ko.map((g) => g.id)).toEqual(['zzz', 'genshin', 'lol', 'tft', 'dnf', 'eternal-return', 'hearthstone', 'steam']);
    expect(ko.filter((g) => g.locked).map((g) => g.id)).toEqual(['dnf', 'steam']);
    expect(ko.find((g) => g.id === 'dnf')!.tabCaption).toBe('계정 연동 준비 중');
    expect(ko[0]).toMatchObject({
      tabTitle: '젠레스 존 제로',
      tabCaption: 'ZENLESS ZONE ZERO',
      title: ['Zenless', 'Zone Zero'],
      subtitle: '젠레스 존 제로 · HoYoverse',
    });
    expect(ko[0].why).toContain('레미엘');
    expect(ko[0].meta?.[0]).toMatch(/^플레이 \d{4}/);
    expect(ko.find((g) => g.id === 'dnf')!.title).toEqual(['Dungeon', '& Fighter']);
    // 2026-09-30 (owner): TFT links with LoL's Riot ID; Eternal Return and Hearthstone have no link plan.
    // TFT and Hearthstone carry the owner's genre and reason (no favourite character); Eternal Return waits for its intro.
    expect(ko.find((g) => g.id === 'tft')!.meta).toEqual(['장르 전략 · 오토배틀러']);
    expect(ko.find((g) => g.id === 'hearthstone')!.why).toContain('최적의 판단');
    expect(ko.find((g) => g.id === 'eternal-return')!.meta).toEqual(['플레이 2024 –', '장르 배틀로얄 · MOBA']);
    // LoL (owner 2026-09-30): playing since 2012, no intro sentence; a game without meta has none.
    expect(ko[2].why).toBeUndefined();
    expect(ko[2].meta).toEqual(['플레이 2012 –', '장르 MOBA']);
    expect(ko.find((g) => g.id === 'dnf')!.meta).toBeUndefined();

    const en = await buildFavoriteGames(games, 'en', none);
    expect(en.find((g) => g.id === 'dnf')!.tabCaption).toBe('Account link coming soon');
    expect(en[0].subtitle).toBe('HoYoverse');
    expect(en[1].tabTitle).toBe('Genshin Impact');
  });

  it('games without available art have no art, but keep the tint of their first favourite character (D-1)', async () => {
    const noArt = await buildFavoriteGames(games, 'ko', none);
    for (const g of noArt) expect(g.art).toBeUndefined();
    // Characterless games (the locked ones) have no tint; the others keep their colour without art.
    expect(noArt.map((g) => g.tint)).toEqual(games.map((g) => g.characters[0]?.id));
    expect(noArt[0].tint).toBe('remielle');
    expect(noArt[1].tint).toBe('eula');
    expect(islandImage).not.toHaveBeenCalled();

    const eulaOnly = await buildFavoriteGames(games, 'ko', createCharacterLookup({ '../assets/characters/eula.png': meta('eula') }));
    expect(eulaOnly[0].art).toBeUndefined();
    expect(eulaOnly[0].tint).toBe('remielle');
    expect(eulaOnly[1].tint).toBe('eula');
    expect(eulaOnly[1].art?.objectPosition).toBe('52% 8%');
    // four or more games: the tab column beside the 600px stage; two or three: the 520px tab-row stage
    expect(islandImage).toHaveBeenCalledWith(meta('eula'), SHOWCASE_WIDTHS, SHOWCASE_SIZES_LIST);
    await buildFavoriteGames(games.slice(0, 2), 'ko', createCharacterLookup({ '../assets/characters/eula.png': meta('eula') }));
    expect(islandImage).toHaveBeenLastCalledWith(meta('eula'), SHOWCASE_WIDTHS, SHOWCASE_SIZES);

    const monaOnly = await buildFavoriteGames(games, 'en', createCharacterLookup({ '../assets/characters/mona.png': meta('mona') }));
    expect(monaOnly[1].tint).toBe('mona');
    expect(monaOnly[1].art?.objectPosition).toBe('50% 10%');

    const full = await buildFavoriteGames(games, 'ko', all);
    expect(full[0].tint).toBe('remielle');
    expect(full[0].art?.image.srcSet).toContain('remielle.png?w=480 480w');
  });

  it('account keys equal integration.platform with ACCOUNT_HEADS', async () => {
    const ko = await buildFavoriteGames(games, 'ko', none);
    ko.forEach((g, i) => {
      const platform = games[i].integration.platform;
      expect(g.account).toEqual({ key: platform, head: ACCOUNT_HEADS[platform] });
    });
    expect(ACCOUNT_HEADS).toEqual({
      'enka-zzz': 'INTER-KNOT PROFILE',
      'enka-genshin': 'ADVENTURER PROFILE',
      riot: 'SUMMONER PROFILE',
      neople: 'CHARACTER PROFILE',
      'nimble-neuron': 'PLAYER PROFILE',
      'battle-net': 'BATTLE.NET PROFILE',
      steam: 'STEAM PROFILE',
    });
  });
});

describe('buildFavoriteTiles', () => {
  it('buildFavoriteTiles yields one tile per available character with yaml names and POSITIONS.tile positions', () => {
    expect(buildFavoriteTiles(games, 'ko', none)).toEqual([]);

    const ko = buildFavoriteTiles(games, 'ko', all);
    expect(ko.map((t) => t.id)).toEqual(['remielle', 'eula', 'mona']);
    expect(ko.map((t) => t.name)).toEqual(['레미엘', '유라', '모나']);
    expect(ko.map((t) => t.objectPosition)).toEqual([POSITIONS.tile.remielle, POSITIONS.tile.eula, POSITIONS.tile.mona]);
    expect(ko[0].caption).toBe(`${CHARACTER_GAME_LABEL.remielle.en.toUpperCase()} · FAVORITE`);
    expect(ko[0].caption).toBe('ZZZ · FAVORITE');
    expect(ko[2].caption).toBe('GENSHIN · FAVORITE');
    expect(ko[1].image).toEqual(meta('eula'));

    const partial = buildFavoriteTiles(
      games,
      'en',
      createCharacterLookup({ '../assets/characters/remielle.png': meta('remielle'), '../assets/characters/mona.png': meta('mona') }),
    );
    expect(partial.map((t) => `${t.id}:${t.name}`)).toEqual(['remielle:Remielle', 'mona:Mona']);
  });

  it('FavoriteGames.tsx imports no runtime value from lib/generated', () => {
    const src = readFileSync(join(root, 'src/islands/FavoriteGames.tsx'), 'utf8');
    const imports = src.match(/^import[^;]*from\s+['"][^'"]*lib\/generated['"];?/gm) ?? [];
    expect(imports.length).toBeGreaterThan(0);
    for (const line of imports) expect(line).toMatch(/^import type /);
  });
});

describe('favorites.yaml account switches (AL-10; owner answers 2026-10-01, OQ-1 and OQ-2)', () => {
  it('the five tile games are on, dnf, Eternal Return and Hearthstone off; LoL and TFT both read the Riot ID; account stays null', () => {
    expect(Object.fromEntries(games.map((g) => [g.id, g.integration.enabled]))).toEqual({
      zzz: true, genshin: true, lol: true, tft: true, dnf: false, 'eternal-return': false, hearthstone: false, steam: true,
    });
    expect(games.filter((g) => g.id === 'lol' || g.id === 'tft').map((g) => g.integration.platform)).toEqual(['riot', 'riot']);
    for (const g of games) expect(g.account).toBeNull();
  });

  it('the header comment states the switch, the variables, the data folders and the repository rule', () => {
    const header = readFileSync(join(root, 'src/data/favorites.yaml'), 'utf8').split(/\r?\n/).filter((l) => l.startsWith('#')).join('\n');
    for (const part of ['ACCOUNT_', 'src/lib/account-config.ts', 'src/data/generated/accounts/', 'src/data/generated/links/', '계정 아이콘 배경']) expect(header).toContain(part);
    expect(header).not.toMatch(/@[a-z0-9.-]+\.[a-z]{2,}/i); // no e-mail login in the repository
  });
});
