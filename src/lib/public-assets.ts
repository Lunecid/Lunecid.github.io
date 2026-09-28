// src/lib/public-assets.ts — SERVER-ONLY (node:fs). Import it only from .astro frontmatter or Node tests.
// Optional media (BGM, SFX, self-hosted GoatCounter script) exist only when Task 2 approved them; the layout
// renders their controls/attributes only when the files are really in public/ (D6 fallbacks).
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { MEDIA } from '../config';
import { SFX_NAMES } from '../types';

/** relPath like 'audio/bgm/x.mp3' or '/audio/bgm/x.mp3' (leading slashes ignored); root defaults to process.cwd(). */
export function publicFileExists(relPath: string, root: string = process.cwd()): boolean {
  return existsSync(join(root, 'public', relPath.replace(/^\/+/, '')));
}

/** bgm: the BGM file exists; sfx: all four SFX files exist (otherwise no SFX at all). */
export function soundAvailability(root?: string): { bgm: boolean; sfx: boolean } {
  return {
    bgm: publicFileExists(MEDIA.bgm, root),
    sfx: SFX_NAMES.every((name) => publicFileExists(`${MEDIA.sfxDir}${name}.mp3`, root)),
  };
}

/** public/js/count.v5.js exists (self-hosted GoatCounter script); otherwise the CDN script with SRI is used. */
export function goatcounterSelfHosted(root?: string): boolean {
  return publicFileExists(MEDIA.goatcounterSelfHosted, root);
}
