// The chooser desk's props (MO-36, owner ruling 2026-10-05: one same-origin external SVG sprite): the page carries six
// empty frames that <use> the sprite; nothing is drawn inline.
import { readFileSync } from 'node:fs';
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

  it('MO-41: the props settle during the power-on: opacity only, 60 ms apart in the visible order of each breakpoint, all in by 740 ms; the mat is there from the start', () => {
    const css = readFileSync(new URL('../../src/styles/chooser.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).toMatch(/:root\[data-intro="opening"\] \.desk \.prop \{ animation: op-in var\(--dur-op-props\) var\(--ease-out\) calc\(var\(--at-op-props\) \+ var\(--pi, 0\) \* var\(--op-props-step\)\) both; \}/);
    expect(css).not.toMatch(/\[data-intro="opening"\][^{]*\.mat/);
    // each breakpoint numbers its visible props 0…n-1 (phone 2, tablet 5, desktop 6)
    const block = (media: string | null) => {
      const scope = media ? [...css.matchAll(new RegExp(`@media \\(${media}\\) \\{([\\s\\S]*?)\\n\\}`, 'g'))].map((m) => m[1]).join('\n') : css;
      const out: Record<string, number> = {};
      for (const m of scope.matchAll(/\.desk \.prop--(\w+) \{[^}]*--pi: (\d)/g)) out[m[1]!] ??= Number(m[2]); // the first (base) rule
      return out;
    };
    const phone = block(null);
    expect({ kb: phone.kb, pen: phone.pen }).toEqual({ kb: 0, pen: 1 });
    expect(block('min-width: 734px')).toEqual({ kb: 3, pen: 4, phone: 1, clip: 2, cup: 0 });
    expect(block('min-width: 1068px')).toEqual({ kb: 4, pen: 5, phone: 2, clip: 3, cup: 1, plant: 0 });
  });
});
