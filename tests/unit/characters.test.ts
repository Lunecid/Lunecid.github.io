import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ImageMetadata } from 'astro';
import { load } from 'js-yaml';
import { describe, expect, it, vi } from 'vitest';

vi.mock('astro:assets', () => ({
  getImage: vi.fn(async (options: { widths: number[] }) => ({
    src: '/_astro/art.webp',
    srcSet: { attribute: options.widths.map((w) => `/_astro/art-${w}.webp ${w}w`).join(', ') },
    attributes: {},
  })),
}));

import { getImage } from 'astro:assets';
import {
  CHARACTER_GAME_LABEL,
  CHARACTER_NAMES,
  HERO_SIZES,
  HERO_WIDTHS,
  POSITIONS,
  SHOWCASE_SIZES,
  SHOWCASE_SIZES_LIST,
  SHOWCASE_WIDTHS,
  SIDE_SIZES,
  SIDE_WIDTHS,
  TILE_SIZES,
  TILE_WIDTHS,
  characterCredit,
  createCharacterLookup,
  getStageCharacters,
  withoutArt,
} from '../../src/lib/characters';

const meta = (width: number, height: number): ImageMetadata =>
  ({ src: '/_astro/source.png', width, height, format: 'png' }) as ImageMetadata;

const both = createCharacterLookup({
  '../assets/characters/remielle.png': meta(1600, 854),
  '../assets/characters/eula.png': meta(1600, 937),
});
const eulaOnly = createCharacterLookup({ '../assets/characters/eula.png': meta(1600, 937) });
const none = createCharacterLookup({});

describe('character art lookup', () => {
  it('available keeps order and drops missing art', () => {
    expect(both.available(['mona', 'eula', 'remielle'])).toEqual(['eula', 'remielle']);
    expect(both.available(['remielle', 'eula'])).toEqual(['remielle', 'eula']);
    expect(none.available(['remielle', 'eula', 'mona'])).toEqual([]);
    expect(both.art('mona')).toBeUndefined();
    expect(both.art('eula')?.height).toBe(937);
    // an old/unknown file name is ignored instead of becoming a character
    expect(createCharacterLookup({ '../assets/characters/remiel.png': meta(10, 10) }).available(['remielle'])).toEqual([]);
  });

  it('SB_NO_ART build switch (tests only): unset/0 keeps the art, 1/all drops it, an id list drops those slots', () => {
    const files = {
      '../assets/characters/remielle.png': meta(1600, 854),
      '../assets/characters/eula.png': meta(1600, 937),
      '../assets/characters/mona.png': meta(1600, 900),
    };
    expect(withoutArt(files, undefined)).toBe(files);
    expect(withoutArt(files, '')).toBe(files);
    expect(withoutArt(files, '0')).toBe(files);
    expect(withoutArt(files, '1')).toEqual({});
    expect(withoutArt(files, 'all')).toEqual({});
    const noEula = createCharacterLookup(withoutArt(files, 'eula'));
    expect(noEula.available(['remielle', 'eula', 'mona'])).toEqual(['remielle', 'mona']);
    expect(createCharacterLookup(withoutArt(files, ' eula , mona ')).available(['remielle', 'eula', 'mona'])).toEqual(['remielle']);
    // The deploy workflow never sets it.
    const workflow = readFileSync(join(process.cwd(), '.github/workflows/deploy.yml'), 'utf8');
    expect(workflow).not.toContain('SB_NO_ART');
  });

  it('notices: remielle → cognosphere, zzz-fan-guide, fan-content; eula only → cognosphere, fan-content; none → []', () => {
    expect(both.notices(['eula', 'remielle'])).toEqual(['cognosphere', 'zzz-fan-guide', 'fan-content']);
    expect(eulaOnly.notices(['remielle', 'eula'])).toEqual(['cognosphere', 'fan-content']);
    expect(both.notices(['mona'])).toEqual([]);
    expect(none.notices(['remielle', 'eula', 'mona'])).toEqual([]);
  });

  it('characterCredit: null without art; COGNOSPHERE credit; adds © miHoYo when remielle is available', () => {
    expect(characterCredit(['remielle', 'eula'], 'ko', none)).toBeNull();
    expect(characterCredit(['eula'], 'ko', eulaOnly)).toBe('캐릭터 이미지 © COGNOSPHERE · 팬 콘텐츠, 공식 제휴 아님');
    expect(characterCredit(['remielle', 'eula'], 'ko', eulaOnly)).toBe('캐릭터 이미지 © COGNOSPHERE · 팬 콘텐츠, 공식 제휴 아님');
    expect(characterCredit(['remielle', 'eula'], 'en', both)).toBe(
      'Character art © COGNOSPHERE · Fan content, not officially affiliated · © miHoYo (Zenless Zone Zero)',
    );
  });

  it('names and game labels in both languages', () => {
    expect(CHARACTER_NAMES).toEqual({
      remielle: { ko: '레미엘', en: 'Remielle' },
      eula: { ko: '유라', en: 'Eula' },
      mona: { ko: '모나', en: 'Mona' },
    });
    expect(CHARACTER_GAME_LABEL).toEqual({
      remielle: { ko: 'ZZZ', en: 'ZZZ' },
      eula: { ko: '원신', en: 'Genshin' },
      mona: { ko: '원신', en: 'Genshin' },
    });
  });

  it('CHARACTER_NAMES equal the favorites.yaml character names', () => {
    const doc = load(readFileSync(join(process.cwd(), 'src/data/favorites.yaml'), 'utf8')) as {
      games: { characters: { id: string; name: { ko: string; en: string } }[] }[];
    };
    const names = Object.fromEntries(doc.games.flatMap((game) => game.characters.map((c) => [c.id, c.name])));
    expect(names).toEqual(CHARACTER_NAMES);
  });

  it('POSITIONS hold the mockup object positions', () => {
    expect(POSITIONS).toEqual({
      hero: { remielle: '58% 14%', eula: '52% 10%' },
      side: { eula: '50% 8%', remielle: '58% 14%' },
      tile: { remielle: '58% 12%', eula: '52% 8%', mona: '54% 6%' },
    });
  });

  it('final fix 2 item 2: sizes are the PAINTED widths (object-fit: cover), with ladders that reach them', () => {
    // Cover scales the landscape art to the box height: painted width = box height x source aspect (1600/854 at most).
    const aspect = 1600 / 854;
    const painted = (boxHeight: number): number => Math.ceil(boxHeight * aspect);
    const px = (sizes: string, query: string): number => Number(new RegExp(`${query.replace(/[()]/g, '\\$&')} (\\d+)px`).exec(sizes)?.[1]);
    expect(px(HERO_SIZES, '(min-width: 1800px)')).toBeGreaterThanOrEqual(painted(688)); // hero 740 - 52
    // 1068-1799 share 1200px so DPR-1 never steps over the 1200w rung (1220px at 1600 used to pull 1600w)
    expect(px(HERO_SIZES, '(min-width: 1068px)')).toBe(1200);
    expect(HERO_SIZES).not.toMatch(/min-width: 1600px/);
    expect(1200 / painted(642)).toBeGreaterThan(0.99);
    // DPR-1 viewports 1068-1799 → ≤1200w; 2560 @ 1.5 → largest (sizes 1290 × 1.5 > 1600)
    const heroSizesAt = (cssWidth: number): number => {
      if (cssWidth >= 1800) return px(HERO_SIZES, '(min-width: 1800px)');
      if (cssWidth >= 1068) return px(HERO_SIZES, '(min-width: 1068px)');
      return 0;
    };
    const pick = (need: number): number => Math.min(...HERO_WIDTHS.filter((w) => w >= need), Math.max(...HERO_WIDTHS));
    for (const w of [1068, 1440, 1600, 1799]) expect(pick(heroSizesAt(w) * 1)).toBeLessThanOrEqual(1200);
    expect(pick(heroSizesAt(2560) * 1.5)).toBe(Math.max(...HERO_WIDTHS));
    expect(px(SHOWCASE_SIZES, '(min-width: 734px)')).toBeGreaterThanOrEqual(painted(520));
    // four or more favourite games: the 600px stage from 1068px (FavoriteGames.css)
    expect(px(SHOWCASE_SIZES_LIST, '(min-width: 1068px)')).toBeGreaterThanOrEqual(painted(600));
    expect(px(SHOWCASE_SIZES_LIST, '(min-width: 734px)')).toBe(px(SHOWCASE_SIZES, '(min-width: 734px)'));
    expect(px(TILE_SIZES, '(min-width: 734px)')).toBeGreaterThanOrEqual(painted(280));
    expect(px(SIDE_SIZES, '(min-width: 1068px)')).toBeGreaterThanOrEqual(painted(400));
    // no sizes value sits just above a ladder step (a DPR-1 screen would fetch the next, much larger file)
    for (const [sizes, ladder] of [[HERO_SIZES, HERO_WIDTHS], [SIDE_SIZES, SIDE_WIDTHS], [SHOWCASE_SIZES, SHOWCASE_WIDTHS], [SHOWCASE_SIZES_LIST, SHOWCASE_WIDTHS], [TILE_SIZES, TILE_WIDTHS]] as const) {
      for (const value of [...sizes.matchAll(/(\d+)px/g)].map((m) => Number(m[1])).filter((v) => v > 300)) {
        const next = Math.min(...ladder.filter((w) => w >= value), Infinity);
        expect(next === Infinity || next / value < 1.2 || ladder.at(-1) === next, `${value}px -> ${next}w`).toBe(true);
      }
    }
    // phones keep a box-based value on purpose (bytes on the slowest connections; see characters.ts)
    expect(HERO_SIZES.endsWith(', 100vw')).toBe(true);
    expect(TILE_SIZES.endsWith(', 40vw')).toBe(true);
    // each ladder reaches the painted width at DPR 1.5 or the source's 1600px
    expect(Math.max(...HERO_WIDTHS)).toBe(1600);
    expect(Math.max(...TILE_WIDTHS)).toBeGreaterThanOrEqual(Math.min(1600, painted(280) * 2));
    expect(Math.max(...SHOWCASE_WIDTHS)).toBeGreaterThanOrEqual(Math.min(1600, painted(520) * 1.5));
    expect(Math.max(...SIDE_WIDTHS)).toBeGreaterThanOrEqual(Math.min(1600, painted(400) * 1.5));
  });

  it('getStageCharacters returns only available art with the variant widths, labels and positions', async () => {
    const hero = await getStageCharacters(['remielle', 'eula', 'mona'], 'hero', 'ko', both);
    expect(hero.map((c) => c.id)).toEqual(['remielle', 'eula']);
    expect(hero[0]).toMatchObject({
      label: '레미엘 · ZZZ',
      objectPosition: '58% 14%',
      image: { src: '/_astro/art.webp', sizes: HERO_SIZES, width: 1600, height: 854 },
    });
    expect(hero[0]?.image.srcSet).toContain('/_astro/art-1600.webp 1600w');
    expect(hero[1]).toMatchObject({ label: '유라 · 원신', objectPosition: '52% 10%' });
    expect(getImage).toHaveBeenCalledWith(
      expect.objectContaining({ widths: HERO_WIDTHS, sizes: HERO_SIZES, format: 'webp', quality: 80 }),
    );

    const side = await getStageCharacters(['eula'], 'side', 'en', both);
    expect(side).toEqual([expect.objectContaining({ id: 'eula', label: 'Eula · Genshin', objectPosition: '50% 8%' })]);
    expect(side[0]?.image.sizes).toBe(SIDE_SIZES);
    expect(getImage).toHaveBeenCalledWith(expect.objectContaining({ widths: SIDE_WIDTHS, sizes: SIDE_SIZES }));

    expect(await getStageCharacters(['remielle', 'eula'], 'hero', 'ko', none)).toEqual([]);
  });
});
