// Call only from .astro frontmatter or server-only modules (imports astro:assets).
import type { ImageMetadata } from 'astro';
import { getImage } from 'astro:assets';
import { sourceSize } from './images';
import type { IslandImage } from './island-image';

/**
 * WebP srcset for an island <img>; width/height are the source's intrinsic size (aspect ratio for layout), read
 * through sourceSize() so the full-size source file is not published (final fix 2 item 14).
 */
export async function islandImage(src: ImageMetadata, widths: number[], sizes: string, quality = 80): Promise<IslandImage> {
  const img = await getImage({ src, widths, sizes, format: 'webp', quality });
  const { width, height } = sourceSize(src);
  return { src: img.src, srcSet: img.srcSet.attribute, sizes, width, height };
}
