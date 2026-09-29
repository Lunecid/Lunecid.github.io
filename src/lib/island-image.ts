/** Client-safe image descriptor handed from .astro frontmatter to React islands (no astro:assets import here). */
export interface IslandImage {
  src: string;
  srcSet: string;
  /** AVIF srcset when built via islandImage(); browsers that support it pick this from <picture>. */
  avifSrcSet?: string;
  sizes: string;
  width: number;
  height: number;
}

const cache = new Map<string, Promise<void>>();

/** Resolves when the image is decoded or after capMs (default 1500); never rejects; cached per srcSet. */
export function preloadImage(img: IslandImage, capMs = 1500): Promise<void> {
  const key = img.avifSrcSet || img.srcSet || img.src;
  const hit = cache.get(key);
  if (hit) return hit;
  const promise = new Promise<void>((resolve) => {
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve();
    };
    const timer = window.setTimeout(finish, capMs);
    try {
      const el = new Image();
      el.decoding = 'async';
      el.sizes = img.sizes; // before srcset so the browser picks the same candidate as the <img>
      el.srcset = img.avifSrcSet || img.srcSet;
      el.src = img.src;
      if (typeof el.decode === 'function') {
        el.decode().then(finish, finish);
      } else {
        el.onload = finish;
        el.onerror = finish;
      }
    } catch {
      finish();
    }
  });
  cache.set(key, promise);
  return promise;
}
