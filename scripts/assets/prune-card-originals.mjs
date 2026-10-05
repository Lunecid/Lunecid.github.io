// The LINKED ACCOUNTS card art (src/lib/account-cards.ts) is imported at build time, and Astro publishes every image
// a build imports: it deletes an original only after resizing it (astro/dist/assets/build/generate.js). A card is
// resized only when its tile is shown, so with no fresh feed for a tile its full-size crop reached dist/_astro with
// nothing linking it (dist-assets item 14). After the build this removes every card file in dist/_astro that no page,
// script, style sheet or feed names; the resized copies the pages use stay.
import { existsSync, readdirSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** A card file Astro writes: card-<n>.<hash>.webp (the original) or card-<n>.<hash>_<hash>.<ext> (a resized copy). */
const CARD_FILE = /^card-\d+\.[^/]+\.(webp|avif|png|jpe?g)$/;
const TEXT = /\.(html|js|mjs|css|json|xml|txt|webmanifest|svg)$/i;

/** @param {string} dir @returns {string[]} */
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));

/** Deletes the unreferenced card files under distDir/_astro; returns their names. @param {string} distDir */
export function pruneCardOriginals(distDir) {
  const assets = join(distDir, '_astro');
  if (!existsSync(assets)) return [];
  const cards = readdirSync(assets).filter((f) => CARD_FILE.test(f));
  if (cards.length === 0) return [];
  const text = walk(distDir)
    .filter((f) => TEXT.test(f))
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n');
  const unreferenced = cards.filter((f) => !text.includes(f));
  for (const f of unreferenced) unlinkSync(join(assets, f));
  return unreferenced;
}

/** Astro integration: runs pruneCardOriginals on the built site. */
export function cardOriginals() {
  return {
    name: 'card-originals',
    hooks: {
      'astro:build:done': ({ dir, logger }) => {
        const removed = pruneCardOriginals(fileURLToPath(dir));
        if (removed.length > 0) logger.info(`removed ${removed.length} unreferenced card file(s): ${removed.join(', ')}`);
      },
    },
  };
}
