// Server-only (imports island-image.server → astro:assets). Character art is optional:
// every caller renders correctly when src/assets/characters/ is empty (Review Focus 4).
import type { ImageMetadata } from 'astro';
import { CHARACTER_IDS, type CharacterId, type NoticeKey } from '../types';
import type { Lang } from '../i18n/ui';
import { t } from '../i18n/utils';
import type { StageCharacter } from '../islands/CharacterStage';
import { islandImage } from './island-image.server';

/*
 * `sizes` = the width the art is PAINTED at, not the width of its box (final fix 2 item 2). Every character image is
 * a landscape PNG (Remielle 1600x854, Eula 1600x937, Mona 1600x981) drawn with `object-fit: cover` into a box that
 * is relatively taller than the source, so cover scales it to the box height and the painted width is
 * box height x source aspect (up to 1.873, Remielle's, which the values below use because one `sizes` serves every
 * character). Box heights from the stylesheets (CharacterStage.css, Hero.astro, FavoriteGames.css,
 * FavoriteTiles.astro) as measured in the built site:
 * - hero: the frame is the hero's height minus 52px: ~590-640px (1068-1599; 1203px painted for the English copy at
 *   1068), 648px (1600-1799), 688px (>=1800). On tablets it spans the whole ~760-880px hero (the source's full width).
 * - side (MAIN MENU): the section's height, ~380-400px on desktop (~750px painted), ~450-520px on tablets.
 * - showcase (Player Log): 520px, the art stage's height on desktop and on tablets.
 * - tiles: 280px tall from 734px on (453-524px painted in a 176-250px wide tile).
 * Phones stay close to the box on purpose (the P2-38 trade-off): there the hero and the tiles are the largest
 * first-screen images, and the painted width (1.6-2.9x the box) would multiply the bytes on the slowest connections.
 * The hero keeps the viewport width; the tiles ask for 40vw (a 360px file on a 412px phone at DPR 1.75, 1.5x their
 * old 240px one; the 480px file cost /player-log/ 0.01 of mobile Lighthouse more). tests/e2e/final-fix2.spec.ts
 * checks the served candidate against the painted width on desktop.
 */
export const HERO_WIDTHS = [480, 800, 1200, 1600];
// 1200px for the whole 1068-1799 band: 1220px at 1600-1799 sat just above the 1200w step, so DPR-1 screens fetched the
// 1600w file for a ~1214px paint (fix 2 round 3). 1800+ keeps 1290px so 2560 @ 1.5 still takes the 1600w file. The
// side and showcase ladders have a 1000 step for their 980px values (otherwise 1200w).
export const HERO_SIZES = '(min-width: 1800px) 1290px, (min-width: 1068px) 1200px, (min-width: 734px) 1600px, 100vw';
export const SIDE_WIDTHS = [480, 800, 1000, 1200];
export const SIDE_SIZES = '(min-width: 1068px) 760px, 980px';
export const SHOWCASE_WIDTHS = [480, 800, 1000, 1200, 1520];
export const SHOWCASE_SIZES = '(min-width: 734px) 980px, 100vw';
export const TILE_WIDTHS = [240, 360, 560, 800, 1080];
export const TILE_SIZES = '(min-width: 734px) 525px, 40vw';

/** object-position per placement (mockup-port §15.1). Showcase positions come from favorites.yaml characters[].position. */
export const POSITIONS: {
  hero: Partial<Record<CharacterId, string>>;
  side: Partial<Record<CharacterId, string>>;
  tile: Partial<Record<CharacterId, string>>;
} = {
  hero: { remielle: '58% 14%', eula: '52% 10%' },
  side: { eula: '50% 8%', remielle: '58% 14%' },
  tile: { remielle: '58% 12%', eula: '52% 8%', mona: '54% 6%' },
};

/** Stage labels only; tiles use favorites.yaml names (a test keeps both equal). */
export const CHARACTER_NAMES: Record<CharacterId, { ko: string; en: string }> = {
  remielle: { ko: '레미엘', en: 'Remielle' },
  eula: { ko: '유라', en: 'Eula' },
  mona: { ko: '모나', en: 'Mona' },
};

export const CHARACTER_GAME_LABEL: Record<CharacterId, { ko: string; en: string }> = {
  remielle: { ko: 'ZZZ', en: 'ZZZ' },
  eula: { ko: '원신', en: 'Genshin' },
  mona: { ko: '원신', en: 'Genshin' },
};

const DEFAULT_POSITION = '50% 10%';
const ZZZ_CREDIT = ' · © miHoYo (Zenless Zone Zero)';

function idFromPath(path: string): CharacterId | null {
  const stem = (path.split('/').pop() ?? '').replace(/\.png$/i, '');
  return (CHARACTER_IDS as readonly string[]).includes(stem) ? (stem as CharacterId) : null;
}

/** Factory over an import.meta.glob map of '../assets/characters/*.png' (tests pass a plain object). */
export function createCharacterLookup(files: Record<string, ImageMetadata>): {
  art(id: CharacterId): ImageMetadata | undefined;
  available(ids: readonly CharacterId[]): CharacterId[];
  notices(ids: readonly CharacterId[]): NoticeKey[];
} {
  const byId = new Map<CharacterId, ImageMetadata>();
  for (const [path, image] of Object.entries(files)) {
    const id = idFromPath(path);
    if (id !== null && image) byId.set(id, image);
  }
  const available = (ids: readonly CharacterId[]): CharacterId[] => ids.filter((id) => byId.has(id));
  return {
    art: (id) => byId.get(id),
    available,
    notices(ids) {
      const shown = available(ids);
      if (shown.length === 0) return [];
      return shown.includes('remielle') ? ['cognosphere', 'zzz-fan-guide', 'fan-content'] : ['cognosphere', 'fan-content'];
    },
  };
}

/**
 * Test-only build switch for the no-art layouts (batch 4, D-1). `SB_NO_ART=1` (or `all`) builds every page as if no
 * character PNG existed; a comma list of ids (`SB_NO_ART=eula`) drops only those characters, i.e. one missing slot.
 * The e2e run builds `dist-no-art/` with it (playwright.config.ts); the deploy workflow never sets it.
 */
export function withoutArt<T>(files: Record<string, T>, setting: string | undefined): Record<string, T> {
  const value = (setting ?? '').trim();
  if (value === '' || value === '0') return files;
  if (value === '1' || value === 'all') return {};
  const drop = new Set(value.split(',').map((id) => id.trim()));
  return Object.fromEntries(Object.entries(files).filter(([path]) => !drop.has(idFromPath(path) ?? '')));
}

/** Default instance over the committed art (empty when the user did not approve the downloads in Task 2). */
export const characters = createCharacterLookup(
  withoutArt(import.meta.glob<ImageMetadata>('../assets/characters/*.png', { eager: true, import: 'default' }), process.env.SB_NO_ART),
);

/** Available characters only, as CharacterStage props; label = `${name} · ${game}`. */
export async function getStageCharacters(
  ids: readonly CharacterId[],
  variant: 'hero' | 'side',
  lang: Lang,
  lookup: ReturnType<typeof createCharacterLookup> = characters,
): Promise<StageCharacter[]> {
  const widths = variant === 'hero' ? HERO_WIDTHS : SIDE_WIDTHS;
  const sizes = variant === 'hero' ? HERO_SIZES : SIDE_SIZES;
  const stage: StageCharacter[] = [];
  for (const id of lookup.available(ids)) {
    const art = lookup.art(id);
    if (!art) continue;
    stage.push({
      id,
      label: `${CHARACTER_NAMES[id][lang]} · ${CHARACTER_GAME_LABEL[id][lang]}`,
      image: await islandImage(art, widths, sizes),
      objectPosition: POSITIONS[variant][id] ?? DEFAULT_POSITION,
    });
  }
  return stage;
}

/** Visible credit line for art on a page; null when none of `ids` has art. */
export function characterCredit(
  ids: readonly CharacterId[],
  lang: Lang,
  lookup: ReturnType<typeof createCharacterLookup> = characters,
): string | null {
  const shown = lookup.available(ids);
  if (shown.length === 0) return null;
  const credit = t(lang, 'favorites.characterCredit');
  return shown.includes('remielle') ? `${credit}${ZZZ_CREDIT}` : credit;
}
