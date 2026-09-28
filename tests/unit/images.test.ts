import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CARD_WIDTHS, CARTRIDGE_SIZES, DETAIL_FIGURE_SIZES, FIGURE_SIZES, INTEREST_FIGURE_SIZES, fitWidths } from '../../src/lib/images';

describe('fitWidths (P2-38)', () => {
  it('adds the source width only when it lies strictly between two ladder steps', () => {
    expect(fitWidths([720, 1080, 1440], 877)).toEqual([720, 877]); // spatial-cv-blocks: was [720] (upscaled at 4K)
    expect(fitWidths([720, 1080, 1440], 1061)).toEqual([720, 1061]); // cluster-zscore-heatmap
    expect(fitWidths([560, 840, 1120], 762)).toEqual([560, 762]); // parking-stand-detection on its project page
    expect(fitWidths(CARD_WIDTHS, 762)).toEqual([320, 480, 640, 762]);
  });

  it('keeps the ladder as it is when the source is at least as wide as the whole ladder', () => {
    expect(fitWidths([720, 1080, 1440], 1600)).toEqual([720, 1080, 1440]);
    expect(fitWidths([720, 1080, 1440], 1440)).toEqual([720, 1080, 1440]);
    expect(fitWidths(CARD_WIDTHS, 1600)).toEqual([320, 480, 640, 960]); // label-horizon on the card ladder
    expect(fitWidths(CARD_WIDTHS, 960)).toEqual([320, 480, 640, 960]);
  });

  it('never adds a duplicate or anything wider than the source; a source below the first step keeps its width', () => {
    expect(fitWidths([720, 1080, 1440], 1080)).toEqual([720, 1080]);
    expect(fitWidths([720, 1080, 1440], 500)).toEqual([500]);
    for (const w of [300, 500, 877, 1600]) expect(Math.max(...fitWidths(CARD_WIDTHS, w))).toBe(Math.min(w, 960));
  });
});

describe('sizes (P2-39)', () => {
  it('no slot claims the whole viewport: phones get the column width, not 100vw', () => {
    for (const sizes of [FIGURE_SIZES, DETAIL_FIGURE_SIZES, CARTRIDGE_SIZES.normal, CARTRIDGE_SIZES.wide, INTEREST_FIGURE_SIZES]) {
      expect(sizes).not.toMatch(/(^|,\s*)100vw\b/);
      expect(sizes).toMatch(/calc\(100vw - \d+px\)$/);
    }
  });

  it('figures sit in the reading column; cards and the detail cover plan for the XL containers', () => {
    // P1-7: figures in the reading column, 760px wide from 900px
    expect(FIGURE_SIZES).toBe('(min-width: 900px) 760px, (min-width: 734px) 646px, calc(100vw - 32px)');
    for (const sizes of [DETAIL_FIGURE_SIZES, CARTRIDGE_SIZES.normal, CARTRIDGE_SIZES.wide]) {
      expect(sizes).toMatch(/^\(min-width: 1800px\) \d+px, \(min-width: 1600px\) \d+px, \(min-width: 1068px\) \d+px, /);
    }
    // four columns inside 1180 - 2 × 56 = 1068px of content, 26px gaps, 14px card padding
    expect(CARTRIDGE_SIZES.normal).toContain('(min-width: 1068px) 220px');
    expect(CARTRIDGE_SIZES.wide).toContain('(min-width: 1068px) 493px');
  });

  it('D-2: the XL values follow the tokens.css HUD container and gutter at 1600px and 1800px', () => {
    const css = readFileSync(new URL('../../src/styles/tokens.css', import.meta.url), 'utf8');
    const step = (min: number): { container: number; gutter: number } => {
      const block = new RegExp(String.raw`@media \(min-width: ${min}px\) \{\s*:root \{([^}]*)\}`).exec(css)?.[1] ?? '';
      const px = (name: string): number => Number(new RegExp(String.raw`${name}:\s*(\d+)px`).exec(block)?.[1]);
      return { container: px('--container-hud'), gutter: px('--gutter') };
    };
    for (const min of [1600, 1800]) {
      const { container, gutter } = step(min);
      expect(container, `--container-hud at ${min}px`).toBeGreaterThan(1180);
      const content = container - 2 * gutter;
      const column = (content - 3 * 26) / 4; // four cartridge columns, 26px gaps
      const normal = Math.round(column - 28); // 14px card padding each side
      const wide = Math.round(2 * column + 26 - 28);
      const detail = Math.round(((content - 34) * 1.1) / 2.1 - 2); // 1.1fr of the PROJECT DETAILS grid, 1px border each side
      expect(CARTRIDGE_SIZES.normal).toContain(`(min-width: ${min}px) ${normal}px`);
      expect(CARTRIDGE_SIZES.wide).toContain(`(min-width: ${min}px) ${wide}px`);
      expect(DETAIL_FIGURE_SIZES).toContain(`(min-width: ${min}px) ${detail}px`);
    }
  });
});
