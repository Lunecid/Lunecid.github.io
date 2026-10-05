// PL-6: the LINKED ACCOUNTS character-card art lookup (src/lib/account-cards.ts) over the committed crops and their
// provenance manifest (src/assets/account-cards/sources.json).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ImageMetadata } from 'astro';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/island-image.server', () => ({
  islandImage: vi.fn(async (src: ImageMetadata, widths: number[], sizes: string) => ({
    src: `${src.src}?w=${widths[widths.length - 1]}`,
    srcSet: widths.map((w) => `${src.src}?w=${w} ${w}w`).join(', '),
    sizes,
    width: src.width,
    height: src.height,
  })),
}));

import { CARD_ART, CARD_ART_SIZES, CARD_ART_WIDTHS, cardArt, createCardArtLookup } from '../../src/lib/account-cards';
import { TILE_SLOTS } from '../../src/lib/account-state';

const DIR = join(process.cwd(), 'src/assets/account-cards');
const manifest = JSON.parse(readFileSync(join(DIR, 'sources.json'), 'utf8')) as { file: string; tile: string; width: number; height: number }[];
const meta = (name: string): ImageMetadata => ({ src: `/_astro/${name}`, width: 256, height: 280, format: 'webp' }) as ImageMetadata;
const FILES: Record<string, ImageMetadata> = Object.fromEntries(
  readdirSync(DIR)
    .filter((f) => f.endsWith('.webp'))
    .map((f) => [`../assets/account-cards/${f}`, meta(f)]),
);

describe('PL-6: card art lookup', () => {
  it('CARD_ART maps genshin, zzz, lol and tft to the manifest files; steam and hearthstone have none', () => {
    expect(CARD_ART).toEqual({ genshin: 'card-1', zzz: 'card-2', lol: 'card-3', tft: 'card-4' });
    for (const [tile, stem] of Object.entries(CARD_ART)) {
      const entry = manifest.find((e) => e.file === `${stem}.webp`);
      expect(entry?.tile, stem).toBe(tile);
      expect([entry?.width, entry?.height], stem).toEqual([256, 280]);
    }
    expect(Object.hasOwn(CARD_ART, 'steam')).toBe(false);
    expect(Object.hasOwn(CARD_ART, 'hearthstone')).toBe(false);
    const lookup = createCardArtLookup(FILES, undefined);
    for (const key of TILE_SLOTS) {
      expect(lookup.art(key)?.src, key).toBe(key === 'steam' ? undefined : `/_astro/${CARD_ART[key]}.webp`);
    }
  });

  it('SB_NO_ART=1 → no art', () => {
    for (const setting of ['1', 'all']) {
      const lookup = createCardArtLookup(FILES, setting);
      for (const key of TILE_SLOTS) expect(lookup.art(key), `${setting} ${key}`).toBeUndefined();
    }
    // off ('' / '0') keeps every card; a missing file is no art, not an error
    expect(createCardArtLookup(FILES, '0').art('lol')).toBeDefined();
    expect(createCardArtLookup({}, '').art('lol')).toBeUndefined();
  });

  it('cardArt: 128 and 256 wide, sized for three per row on a phone and the 128px box elsewhere', async () => {
    expect(CARD_ART_WIDTHS).toEqual([128, 256]);
    expect(CARD_ART_SIZES).toBe('(max-width: 480px) 30vw, 128px');
    const image = await cardArt(meta('card-3.webp'));
    expect(image).toMatchObject({ srcSet: '/_astro/card-3.webp?w=128 128w, /_astro/card-3.webp?w=256 256w', sizes: CARD_ART_SIZES, width: 256, height: 280 });
  });
});
