// The account feed images (accounts/img/* of the @generated folder) are imported at build time by one eager glob
// (src/lib/generated.ts), and Astro publishes every image a build imports: it deletes an original only after resizing
// it. A picture is resized only when a shown row names it, so a picture of a stale feed, of a row past the card's
// limit or of no row at all reached dist/_astro full size with nothing linking it (dist-assets item 14). After the
// build this removes every file in dist/_astro made from a feed image that no page, script, style sheet or feed names;
// the resized copies the pages use stay.
import { existsSync, readdirSync, readFileSync, unlinkSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const IMAGE = /\.(png|jpe?g|webp|avif|gif)$/i;
const TEXT = /\.(html|js|mjs|css|json|xml|txt|webmanifest|svg)$/i;

/** @param {string} dir @returns {string[]} */
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));

/**
 * Deletes the unreferenced files under distDir/_astro made from an image in imgDir (Astro names them
 * `<stem>.<hash>.<ext>` and `<stem>.<hash>_<hash>.<ext>`); returns their names.
 * @param {string} distDir @param {string} imgDir
 */
export function pruneFeedImages(distDir, imgDir) {
  const assets = join(distDir, '_astro');
  if (!existsSync(assets) || !existsSync(imgDir)) return [];
  const stems = readdirSync(imgDir).filter((f) => IMAGE.test(f)).map((f) => f.slice(0, -extname(f).length));
  const made = readdirSync(assets).filter((f) => IMAGE.test(f) && stems.some((s) => f.startsWith(`${s}.`)));
  if (made.length === 0) return [];
  const text = walk(distDir)
    .filter((f) => TEXT.test(f))
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n');
  const unreferenced = made.filter((f) => !text.includes(f));
  for (const f of unreferenced) unlinkSync(join(assets, f));
  return unreferenced;
}

/** Astro integration: runs pruneFeedImages on the built site. @param {string} imgDir the feed images' folder */
export function feedImages(imgDir) {
  return {
    name: 'feed-images',
    hooks: {
      /** @param {{ dir: URL, logger: { info(message: string): void } }} options */
      'astro:build:done': ({ dir, logger }) => {
        const removed = pruneFeedImages(fileURLToPath(dir), imgDir);
        if (removed.length > 0) logger.info(`removed ${removed.length} unreferenced feed image(s): ${removed.join(', ')}`);
      },
    },
  };
}
