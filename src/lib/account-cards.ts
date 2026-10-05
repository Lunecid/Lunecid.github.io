// src/lib/account-cards.ts — the LINKED ACCOUNTS character-card art (build only). The files are the committed crops of
// src/assets/account-cards/ (provenance in sources.json, made at dev time by scripts/assets/account-cards.mjs); the
// build never fetches an image. File names stay neutral (card-<n>): no game or character name reaches a URL.
// Steam has no file: its card shows the owner's own avatar from the Steam feed (account-view.ts).
import type { ImageMetadata } from 'astro';
import type { AccountTileKey } from './account-state';
import { withoutArt } from './characters';
import type { IslandImage } from './island-image';
import { islandImage } from './island-image.server';

/** Tile → art file stem. 2× the 128×140 art box is 256×280, the size of every file. */
export const CARD_ART: Readonly<Partial<Record<AccountTileKey, string>>> = { genshin: 'card-1', zzz: 'card-2', lol: 'card-3', tft: 'card-4' };

export const CARD_ART_WIDTHS = [128, 256];
/** Three cards per row on a phone (about a third of the viewport), else the 128px art box. */
export const CARD_ART_SIZES = '(max-width: 480px) 30vw, 128px';

export interface CardArtLookup {
  art(key: AccountTileKey): ImageMetadata | undefined;
}

/**
 * Factory over an import.meta.glob map of '../assets/account-cards/*.webp' (tests pass a plain object). SB_NO_ART=1
 * (the no-art e2e build) drops every file, so each tile falls back to its glyph; a missing file does the same.
 */
export function createCardArtLookup(files: Record<string, ImageMetadata>, setting: string | undefined = process.env.SB_NO_ART): CardArtLookup {
  const byStem = new Map<string, ImageMetadata>();
  // '1'/'all' drops every card; a comma list names character slots, not card stems, so it keeps the cards
  for (const [path, meta] of Object.entries(withoutArt(files, setting))) {
    const match = /([^/\\]+)\.webp$/.exec(path);
    if (match?.[1]) byStem.set(match[1], meta);
  }
  return {
    art(key) {
      const stem = CARD_ART[key];
      return stem === undefined ? undefined : byStem.get(stem);
    },
  };
}

export function cardArt(meta: ImageMetadata): Promise<IslandImage> {
  return islandImage(meta, CARD_ART_WIDTHS, CARD_ART_SIZES);
}

/** Default instance over the committed crops. */
export const cardArtLookup = createCardArtLookup(import.meta.glob<ImageMetadata>('../assets/account-cards/*.webp', { eager: true, import: 'default' }));
