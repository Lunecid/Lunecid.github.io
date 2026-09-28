// Converts staged sources into the committed src/assets/** files (WebP q85, max 1600px wide, metadata stripped).
// Sources: the staging root (ASSET_STAGING) and the LOL_teamfight repo (LOL_ROOT). Both default to absolute paths,
// so the script works from a git worktree. Character art stays PNG with alpha and is optional.
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';

export const DEFAULT_STAGING = 'C:/Users/todtj/PycharmProjects/Portpolio/.superpowers/assets';
export const DEFAULT_LOL_ROOT = 'C:/Users/todtj/PycharmProjects/LOL_teamfight';
export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
export const MAX_WIDTH = 1600;

const FIG1 = 'paper/figures/label_horizon.png'; // paper Fig. 1, 2816×1536

/** @typedef {{ id: string; src: string; out: string; format: 'webp' | 'png'; root?: 'staging' | 'lol'; crop?: { left: number; top: number; width: number; height: number }; flatten?: boolean; optional?: boolean; greyscale?: boolean; height?: number }} Job */

/** src is relative to its root (staging unless root: 'lol'); out is repo-relative. @type {Job[]} */
export const JOBS = [
  // Project figures (content-projects §3)
  { id: 'dx-risk-heatmap', src: 'figures/dx/p08_1.png', out: 'src/assets/projects/school-zone-blindspots/risk-heatmap.webp', format: 'webp' },
  { id: 'dx-spatial-cv-blocks', src: 'figures/dx/p07_0.png', out: 'src/assets/projects/school-zone-blindspots/spatial-cv-blocks.webp', format: 'webp' },
  { id: 'dx-false-positive-areas', src: 'figures/dx/p09_1.png', out: 'src/assets/projects/school-zone-blindspots/false-positive-areas.webp', format: 'webp' },
  { id: 'dx-gupo-existing-zone', src: 'figures/dx/p10_0.png', out: 'src/assets/projects/school-zone-blindspots/gupo-existing-zone.webp', format: 'webp' },
  { id: 'dx-yeonsan-unprotected', src: 'figures/dx/p10_4.png', out: 'src/assets/projects/school-zone-blindspots/yeonsan-unprotected.webp', format: 'webp' },
  { id: 'kick-parking-stand-detection', src: 'figures/kick/p19_1.png', out: 'src/assets/projects/kickick-park/parking-stand-detection.webp', format: 'webp' },
  { id: 'kick-dong-ranking', src: 'figures/kick/p13_0.png', out: 'src/assets/projects/kickick-park/dong-ranking.webp', format: 'webp' },
  { id: 'kick-selected-dongs', src: 'figures/kick/p13_1.png', out: 'src/assets/projects/kickick-park/selected-dongs.webp', format: 'webp' },
  { id: 'kick-segmentation-v5', src: 'figures/kick/p20_0.png', out: 'src/assets/projects/kickick-park/segmentation-v5.webp', format: 'webp' },
  { id: 'datory-cluster-zscore-heatmap', src: 'figures/datory/p08_0.png', out: 'src/assets/projects/youth-startup-location/cluster-zscore-heatmap.webp', format: 'webp' },
  // CoG 2026 research figures (content-research §1), flattened onto white
  { id: 'cog-label-horizon', root: 'lol', src: FIG1, out: 'src/assets/research/cog-2026/label-horizon.webp', format: 'webp', flatten: true },
  { id: 'cog-kill-gap-kde', root: 'lol', src: 'config/fight_boundary/temporal_kde_pooled.png', out: 'src/assets/research/cog-2026/kill-gap-kde.webp', format: 'webp', flatten: true },
  // Redacted certificates and the ID photo
  { id: 'cert-busan-mayor-award', src: 'certs/busan-mayor-award.jpg', out: 'src/assets/certificates/busan-mayor-award.webp', format: 'webp' },
  { id: 'cert-cds-encouragement-award', src: 'certs/cds-encouragement-award.jpg', out: 'src/assets/certificates/cds-encouragement-award.webp', format: 'webp' },
  { id: 'cert-multicampus-grand-award', src: 'certs/multicampus-grand-award.jpg', out: 'src/assets/certificates/multicampus-grand-award.webp', format: 'webp' },
  // P2-22: the 360×480 source has a 1px dark line on its top and side edges; crop 3px inward on every side, keeping
  // 3:4 (354×472). The source is only 360×480, so no larger export is possible without upscaling.
  { id: 'photo-id', src: 'photo/photo-id.jpg', out: 'src/assets/photo/photo-id.webp', format: 'webp', crop: { left: 3, top: 3, width: 354, height: 472 } },
  // Character art (only when Task 2 downloaded it): PNG with alpha
  { id: 'character-remielle', src: 'characters/remielle.png', out: 'src/assets/characters/remielle.png', format: 'png', optional: true },
  { id: 'character-eula', src: 'characters/eula.png', out: 'src/assets/characters/eula.png', format: 'png', optional: true },
  { id: 'character-mona', src: 'characters/mona.png', out: 'src/assets/characters/mona.png', format: 'png', optional: true },
  // Side-margin ghost watermark (optional; greyscale WebP with alpha, height-capped)
  { id: 'ghost-miku', src: 'characters/miku-v6.webp', out: 'src/assets/ghost/miku-v6.webp', format: 'webp', optional: true, greyscale: true, height: 1400 },
];

/** Converts one job. sharp drops EXIF/XMP/IPTC/ICC because withMetadata() is never called. */
async function convert(job, srcPath, outPath) {
  let img = sharp(srcPath).rotate();
  if (job.crop) img = img.extract(job.crop);
  // height (when set) replaces the default max-width resize so existing jobs stay byte-identical.
  img = job.height
    ? img.resize({ height: job.height, withoutEnlargement: true })
    : img.resize({ width: MAX_WIDTH, withoutEnlargement: true });
  if (job.greyscale) img = img.greyscale();
  if (job.flatten) img = img.flatten({ background: '#ffffff' });
  img = job.format === 'png' ? img.png({ compressionLevel: 9 }) : img.webp({ quality: 85, effort: 6 });
  await mkdir(dirname(outPath), { recursive: true });
  const info = await img.toFile(outPath);
  return { width: info.width, height: info.height };
}

/**
 * Runs the jobs (all, or the ids in `only`). Outputs go to join(outDir, job.out); outDir defaults to the repo root.
 * A missing optional source is reported as skipped; a missing required source throws.
 */
export async function runJobs({ root, lolRoot, outDir = REPO_ROOT, only }) {
  const results = [];
  for (const job of JOBS) {
    if (only && !only.includes(job.id)) continue;
    const srcPath = join(job.root === 'lol' ? lolRoot : root, job.src);
    const out = join(outDir, job.out);
    if (!existsSync(srcPath)) {
      if (job.optional) {
        results.push({ id: job.id, out, width: 0, height: 0, skipped: `source missing: ${srcPath}` });
        continue;
      }
      throw new Error(`${job.id}: source missing: ${srcPath}`);
    }
    results.push({ id: job.id, out, ...(await convert(job, srcPath, out)) });
  }
  return results;
}

async function main() {
  const onlyArg = process.argv.find((a) => a.startsWith('--only='));
  const only = onlyArg ? onlyArg.slice('--only='.length).split(',') : undefined;
  const root = process.env.ASSET_STAGING ?? DEFAULT_STAGING;
  const lolRoot = process.env.LOL_ROOT ?? DEFAULT_LOL_ROOT;
  try {
    const results = await runJobs({ root, lolRoot, only });
    for (const r of results) console.log(r.skipped ? `skip ${r.id}: ${r.skipped}` : `ok   ${r.id} -> ${r.out} (${r.width}x${r.height})`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
