// GP-6: the edge frame's pre-rendered strokes (scripts/edge/edge.mjs → src/styles/edge/*.webp) and its markup.
import { readFileSync, statSync } from 'node:fs';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { EDGE_FILES, EDGE_TOLERANCE, EDGE_YELLOW, checkEdges, edgeFile, edgeSvgs } from '../../scripts/edge/edge.mjs';

const read = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

describe('edge frame assets (GP-6)', () => {
  it('GP-6: eight WebP files; 1× total ≤ 7 KB, 2× ≤ 13 KB, edge-s ≤ 1 KB; alpha present', async () => {
    let one = 0;
    let two = 0;
    for (const key of EDGE_FILES) {
      for (const scale of [1, 2] as const) {
        const file = edgeFile(key, scale);
        const size = statSync(file).size;
        if (scale === 1) one += size;
        else two += size;
        const meta = await sharp(file).metadata();
        expect(meta.format, file).toBe('webp');
        expect(meta.hasAlpha, file).toBe(true);
      }
    }
    expect(one).toBeLessThanOrEqual(7 * 1024);
    expect(two).toBeLessThanOrEqual(13 * 1024);
    expect(statSync(edgeFile('s', 1)).size).toBeLessThanOrEqual(1024);
    expect(statSync(edgeFile('s', 2)).size).toBeLessThanOrEqual(1024);
  });

  it('GP-6: edge.mjs --check passes on the committed files', async () => {
    const rows = await checkEdges();
    expect(rows).toHaveLength(8);
    for (const r of rows) expect(r.mean, r.file).toBeLessThanOrEqual(EDGE_TOLERANCE);
  }, 60_000);

  it('GP-6: the strokes are yellow --gp-y, drawn without filters or noise', () => {
    const tokens = read('src/styles/tokens.css');
    expect(tokens).toMatch(new RegExp(`--gp-y: ${EDGE_YELLOW};`));
    for (const [key, svg] of Object.entries(edgeSvgs())) {
      expect(svg, key).not.toMatch(/<filter|feTurbulence/);
      expect(new Set(svg.match(/#[0-9A-F]{6}/gi)), key).toEqual(new Set([EDGE_YELLOW]));
    }
  });

  it('GP-6: EdgeFrame is aria-hidden, has no text, no link, no focusable element', () => {
    const src = read('src/components/hud/EdgeFrame.astro');
    const markup = src.replace(/^---[\s\S]*?---/, '').trim();
    expect(markup).toMatch(/^<div class="edge" aria-hidden="true">/);
    expect(markup).not.toMatch(/<(a|button|input|select|textarea|details|summary|iframe|img|text)\b|tabindex|href=/);
    expect(markup.replace(/<[^>]+>/g, '').trim()).toBe('');
    for (const svg of markup.match(/<svg[^>]*>/g) ?? []) expect(svg).toContain('focusable="false"');
    expect(markup).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|style=/i);
  });

  it('GP-6: edge.css uses tokens only, hides in print and forced colours, never animates, names the layer only during a page transition', () => {
    const css = read('src/styles/edge.css').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css.match(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g) ?? []).toEqual([]);
    expect(css).toMatch(/@media print \{ \.edge \{ display: none !important; \} \}/);
    expect(css).toMatch(/@media \(forced-colors: active\) \{ \.edge \{ display: none !important; \} \}/);
    expect(css).not.toMatch(/animation|transition:/);
    expect(css).toMatch(/\.edge \{[^}]*pointer-events: none;[^}]*contain: strict/);
    expect(css).toMatch(/:root:active-view-transition-type\(page\) \.edge \{ view-transition-name: game-edge; \}/);
    // plain url() masks (never background images or image-set masks: those become LCP candidates), 2× by resolution
    expect(css).not.toMatch(/background-image|image-set/);
    for (const key of EDGE_FILES) {
      expect(css).toContain(`.edge__${key} { -webkit-mask-image: url("./edge/edge-${key}.webp"); mask-image: url("./edge/edge-${key}.webp"); }`);
      expect(css).toContain(`.edge__${key} { -webkit-mask-image: url("./edge/edge-${key}-2x.webp"); mask-image: url("./edge/edge-${key}-2x.webp"); }`);
    }
    expect(css).toMatch(/@media \(min-resolution: 2dppx\)/);
    expect(read('src/styles/game.css')).toMatch(/@import '\.\/edge\.css';/);
  });
});
