// The chooser desk's props (MO-36, owner ruling 2026-10-05: one same-origin external SVG sprite): the page carries six
// empty frames that <use> the sprite; nothing is drawn inline.
import { describe, expect, it } from 'vitest';
import DeskProps from '../../src/components/neutral/DeskProps.astro';
import { renderAstro } from './helpers';

describe('DeskProps.astro (MO-36)', () => {
  it('MO-36: six props, focusable=false, each one <use> of the sprite; no inline drawing, text, image or filter', async () => {
    const html = await renderAstro(DeskProps, {});
    const svgs = [...html.matchAll(/<svg class="prop prop--(\w+)"[^>]*>([\s\S]*?)<\/svg>/g)];
    expect(svgs.map((m) => m[1])).toEqual(['plant', 'cup', 'phone', 'clip', 'kb', 'pen']);
    for (const [whole, name, body] of svgs) {
      expect(whole, name).toMatch(/focusable="false"/);
      // the reference waits for the script (set after load), so the sprite never competes with the first render
      expect(body!.trim(), name).toMatch(new RegExp(`^<use data-href="[^"#]*props[^"#]*\\.svg#prop-${name}"[^>]*><\\/use>$`));
    }
    expect(html).not.toMatch(/<path|<rect|<circle|<symbol|<text|<image|<foreignObject|filter=|#[0-9a-f]{3,6}\b/i);
  });
});
