import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import GhostArt from '../../src/components/hud/GhostArt.astro';
import { renderAstro } from './helpers';

const HAS_GHOST = existsSync(join(process.cwd(), 'src/assets/ghost/miku-v6.webp')); // GhostArt renders nothing without its asset

describe('GhostArt.astro (§1.8: its rules travel with the element)', () => {
  it.runIf(HAS_GHOST)('renders the element, its image variables and its inline rules together', async () => {
    const html = await renderAstro(GhostArt, { props: { side: 'right' } });
    expect(html).toMatch(/<div class="ghost-art ghost-art--right" aria-hidden="true" data-ghost-art="right" style="--ghostWebp: url\([^)]*miku-v6[^)]*\); --ghostAvif: url\([^)]*miku-v6[^)]*\)"/);
    const css = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? '';
    expect(css).toContain('@media (min-width: 1600px)');
    expect(css).toContain('opacity: 0.07');
    expect(css).toContain('.ghost-art--right');
    expect(css).not.toContain('data-astro-cid');
  });
});
