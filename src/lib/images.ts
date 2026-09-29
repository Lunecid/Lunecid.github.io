// Responsive image widths and `sizes` (batch 2: DIAGNOSIS P2-38 and P2-39).
//
// Every `sizes` value below is the real rendered width of the image slot, from the layout tokens (tokens.css): gutter
// 16px (<734), 32px (734–1067), 56px (1068–1599), 64px (1600–1799), 72px (≥1800); the HUD container
// (--container-hud) is 1180px including gutters up to 1599px, 1360px from 1600px and 1440px from 1800px (D-2 XL
// steps). Prose columns (figures) stay 720px wide at every size. tests/unit/images.test.ts recomputes the XL values
// from tokens.css.

import type { ImageMetadata } from 'astro';

/**
 * Intrinsic size of an imported image, read WITHOUT marking its original file as used (final fix 2 item 14). In a
 * build every imported ImageMetadata is a proxy that adds the source file to the published output on any property
 * read (astro/dist/assets/utils/proxy.js), so reading `.width` for a srcset ladder published every full-size
 * original next to its resized copies although no page referenced them. The proxy's hidden `clone` returns a plain
 * copy without that side effect; Astro's own getImage() reads it the same way (astro/dist/assets/internal.js).
 * Plain objects (tests) have no `clone` and are read as they are.
 */
export function sourceSize(meta: ImageMetadata): { width: number; height: number } {
  const plain = (meta as ImageMetadata & { clone?: ImageMetadata }).clone ?? meta;
  return { width: plain.width, height: plain.height };
}

/**
 * The ladder steps the source can fill, plus the source's own width when it lies strictly between two steps: a
 * source that falls between two steps (877px between 720 and 1080) keeps its full resolution instead of stopping
 * at the lower step, so 4K screens (2560 CSS px at DPR 1.5) are not upscaled (P2-38). A source wider than the
 * whole ladder keeps the ladder as it is; a source narrower than the first step is served at its own width.
 */
export function fitWidths(ladder: readonly number[], sourceWidth: number): number[] {
  const kept = ladder.filter((w) => w <= sourceWidth);
  if (kept.length === 0) return [sourceWidth];
  const betweenSteps = ladder.some((w) => w > sourceWidth) && !kept.includes(sourceWidth);
  return betweenSteps ? [...kept, sourceWidth] : kept;
}

/**
 * Numbered figures of a case study, in the centred reading column (P1-7): 760px from 900px (they widen symmetrically
 * around the column), the 38em column (646px at 17px) from 734px, the phone column below.
 */
export const FIGURE_SIZES = '(min-width: 900px) 760px, (min-width: 734px) 646px, calc(100vw - 32px)';

/**
 * The PROJECT DETAILS cover (1px bracket border): full width below 734px; capped at 600px from 734–1067 (F-006);
 * from 1068px the 1.1fr column of a two-column grid with a 34px gap inside the HUD container (540px, then
 * 626px / 659px in the XL containers).
 */
export const DETAIL_FIGURE_SIZES =
  '(min-width: 1800px) 659px, (min-width: 1600px) 626px, (min-width: 1068px) 540px, (min-width: 734px) 600px, calc(100vw - 34px)';

/**
 * Cartridge labels share one ladder, format list and quality (the research highlight on / shows the AUC chart since
 * batch 5, P1-9, so no image there shares it any more).
 */
export const CARD_WIDTHS = [320, 480, 640, 960] as const;
export const CARD_FORMATS: ('avif' | 'webp')[] = ['avif', 'webp'];

/**
 * Cartridge label image (card padding 14px each side, grid gap 26px): one column below 734px, two up to 1067px
 * (the wide card spans both), four from 1068px (the wide card spans two).
 */
export const CARTRIDGE_SIZES = {
  normal: '(min-width: 1800px) 277px, (min-width: 1600px) 261px, (min-width: 1068px) 220px, (min-width: 734px) calc(50vw - 73px), calc(100vw - 60px)',
  wide: '(min-width: 1800px) 607px, (min-width: 1600px) 575px, (min-width: 1068px) 493px, (min-width: 734px) calc(100vw - 92px), calc(100vw - 60px)',
} as const;

/**
 * Research-interest figures on /research/ (InterestCards, P1-9): a white frame (12px padding, 1px border) in the third
 * column (400px) from 1068px; from 734px in the text column right of the mono index, capped at 560px; on phones the
 * full row.
 */
export const INTEREST_FIGURE_SIZES = '(min-width: 1068px) 374px, (min-width: 734px) 534px, calc(100vw - 58px)';

