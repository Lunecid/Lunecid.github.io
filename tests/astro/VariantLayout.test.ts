import { describe, expect, it } from 'vitest';
import VariantLayout from '../../src/layouts/VariantLayout.astro';
import { renderAstro } from './helpers';

describe('VariantLayout', () => {
  it('renders BaseLayout for layout "base" (P1: both versions) and forwards the head slot', async () => {
    for (const variant of ['game', 'data'] as const) {
      const html = await renderAstro(VariantLayout, {
        props: { lang: 'ko', title: 't', description: 'd', page: 'records', section: 'records', variant },
        slots: { default: '<p class="probe">x</p>', head: '<meta name="probe-head" content="1">' },
        url: '/records/',
      });
      expect(html).toContain(`data-variant="${variant}"`);
      expect(html).toContain('class="hud-nav"');
      expect(html).toMatch(/<main id="main" tabindex="-1"[^>]*>\s*<p class="probe">x<\/p>/);
      expect(html.match(/<head[^>]*>[\s\S]*<\/head>/)?.[0]).toContain('<meta name="probe-head" content="1">');
    }
  });
});
