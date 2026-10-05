// src/lib/game-records.server.ts — server-only (imports astro:assets). Each game record's evidence screenshot
// (src/assets/game-records/<record.image>) as a thumbnail and as the full image the ImageViewer opens; no WebP is wider
// than its source. A record whose file is missing fails the build.
import type { GetImageResult, ImageMetadata } from 'astro';
import { getImage } from 'astro:assets';
import type { GameRecordData } from '../content/schemas';
import { fitWidths, sourceSize } from './images';

export interface EvidenceImage {
  src: string;
  srcSet: string;
  sizes: string;
  width: number;
  height: number;
}

export interface Evidence {
  thumb: EvidenceImage;
  full: EvidenceImage;
}

export const THUMB_WIDTHS = [240, 480];
export const THUMB_SIZES = '240px';
export const FULL_WIDTHS = [640, 960, 1280];
/** The viewer's stage is at most 92vw wide (ImageViewer.css). */
export const FULL_SIZES = '92vw';
const QUALITY = 80;

/**
 * One WebP per ladder step the source can fill, in ladder order (fitWidths: a source between two steps adds its own
 * width, so the viewer never stretches the lower step).
 */
async function webps(src: ImageMetadata, ladder: readonly number[]): Promise<GetImageResult[]> {
  const widths = fitWidths(ladder, sourceSize(src).width);
  return Promise.all(widths.map((width) => getImage({ src, width, format: 'webp', quality: QUALITY })));
}

/** `src`, width and height are those of one srcset entry, so no unreferenced variant is emitted. */
function evidenceImage(images: GetImageResult[], shown: GetImageResult, sizes: string): EvidenceImage {
  return {
    src: shown.src,
    srcSet: images.map((img) => `${img.src} ${img.attributes.width}w`).join(', '),
    sizes,
    width: shown.attributes.width,
    height: shown.attributes.height,
  };
}

/** Factory over an import.meta.glob map of '../assets/game-records/*.{webp,png}' (tests pass a plain object). */
export function createEvidenceLookup(files: Record<string, ImageMetadata>): { build(record: GameRecordData): Promise<Evidence> } {
  const byName = new Map<string, ImageMetadata>();
  for (const [path, meta] of Object.entries(files)) {
    const name = /[^/\\]+$/.exec(path)?.[0];
    if (name) byName.set(name, meta);
  }
  return {
    async build(record) {
      const src = byName.get(record.image);
      if (!src) throw new Error(`game record '${record.id}': src/assets/game-records/${record.image} is missing`);
      const [thumbs, fulls] = await Promise.all([webps(src, THUMB_WIDTHS), webps(src, FULL_WIDTHS)]);
      return {
        thumb: evidenceImage(thumbs, thumbs[0], THUMB_SIZES),
        // The no-JS href of the evidence link: the widest full WebP, at most 1280 wide and never upscaled.
        full: evidenceImage(fulls, fulls[fulls.length - 1], FULL_SIZES),
      };
    },
  };
}

export const evidence = createEvidenceLookup(
  import.meta.glob<ImageMetadata>('../assets/game-records/*.{webp,png}', { eager: true, import: 'default' }),
);
