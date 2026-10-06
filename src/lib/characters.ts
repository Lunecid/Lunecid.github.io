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
/** Four or more games (the tab column beside a 600px stage from 1068px): the portrait art is painted ~1125px wide there. */
export const SHOWCASE_SIZES_LIST = '(min-width: 1068px) 1130px, (min-width: 734px) 980px, 100vw';
/**
 * Showcase-only art (owner ruling 2026-10-06: League of Legends and TFT get stage art, never a favourite-character
 * tile). Their sources are narrower than the HoYoverse art the shared values above assume (Ezreal's centred splash
 * 1280x720 = 1.78, Pengu's render 1232x978 = 1.26), so each gets its own ladder and painted widths from the same
 * boxes (the 520px stage on tablets and in the tab row, the 600px stage beside the tab column from 1068px; at least
 * the ~760px art box there): Pengu 655/760px, Ezreal 924/1067px. Phones keep 100vw like the rest. Each ladder ends at
 * the source width.
 */
export const SHOWCASE_ART: Partial<Record<CharacterId, { widths: number[]; row: string; list: string }>> = {
  ezreal: { widths: [480, 800, 930, 1070, 1280], row: '(min-width: 734px) 930px, 100vw', list: '(min-width: 1068px) 1070px, (min-width: 734px) 930px, 100vw' },
  pengu: { widths: [480, 660, 760, 1000, 1232], row: '(min-width: 734px) 660px, 100vw', list: '(min-width: 1068px) 760px, (min-width: 734px) 660px, 100vw' },
};
/** Characters whose art serves only the showcase stage: no favourite tile, no tile slot. */
export const SHOWCASE_ONLY: readonly CharacterId[] = ['ezreal', 'pengu'];
/**
 * Art file stem per character when it is not the id: Riot art keeps a neutral name (showcase-<n>), so no game or
 * character name reaches a built asset URL. Provenance: src/assets/characters/sources.json.
 */
export const ART_FILES: Partial<Record<CharacterId, string>> = { ezreal: 'showcase-1', pengu: 'showcase-2' };
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
  ezreal: { ko: '이즈리얼', en: 'Ezreal' },
  pengu: { ko: '펭구', en: 'Pengu' },
};

export const CHARACTER_GAME_LABEL: Record<CharacterId, { ko: string; en: string }> = {
  remielle: { ko: 'ZZZ', en: 'ZZZ' },
  eula: { ko: '원신', en: 'Genshin' },
  mona: { ko: '원신', en: 'Genshin' },
  ezreal: { ko: '리그 오브 레전드', en: 'League of Legends' },
  pengu: { ko: '전략적 팀 전투', en: 'Teamfight Tactics' },
};

const DEFAULT_POSITION = '50% 10%';
const ZZZ_CREDIT = ' · © miHoYo (Zenless Zone Zero)';
const RIOT_CREDIT = ' · © Riot Games';
const HOYO_IDS: readonly CharacterId[] = ['remielle', 'eula', 'mona'];
const RIOT_IDS: readonly CharacterId[] = ['ezreal', 'pengu'];

function idFromPath(path: string): CharacterId | null {
  const stem = (path.split('/').pop() ?? '').replace(/\.png$/i, '');
  const mapped = CHARACTER_IDS.find((id) => ART_FILES[id] === stem);
  if (mapped) return mapped;
  // a character with a neutral file name is found only by that name
  return (CHARACTER_IDS as readonly string[]).includes(stem) && ART_FILES[stem as CharacterId] === undefined ? (stem as CharacterId) : null;
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
      const hoyo: NoticeKey[] = !shown.some((id) => HOYO_IDS.includes(id))
        ? []
        : shown.includes('remielle')
          ? ['cognosphere', 'zzz-fan-guide', 'fan-content']
          : ['cognosphere', 'fan-content'];
      // Riot's Legal Jibber Jabber notice goes wherever Riot art shows
      return shown.some((id) => RIOT_IDS.includes(id)) ? [...hoyo, 'riot-assets'] : hoyo;
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
  const riot = shown.some((id) => RIOT_IDS.includes(id)) ? RIOT_CREDIT : '';
  // the line opens with the COGNOSPHERE credit; Riot art alone relies on the footer's Legal Jibber Jabber notice
  if (!shown.some((id) => HOYO_IDS.includes(id))) return null;
  const credit = t(lang, 'favorites.characterCredit');
  return `${credit}${shown.includes('remielle') ? ZZZ_CREDIT : ''}${riot}`;
}
