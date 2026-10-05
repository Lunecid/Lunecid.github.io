// The props sprite (MO-36): one same-origin SVG asset holding the six props as symbols. Colours: the role colours
// (the yellow marks, the cyan glow) are the page's tokens, inherited through <use>; the neutral shading is the asset's
// own (an image's pixels, not a stylesheet: AGENTS.md's colour-literal rule covers CSS), so the inline global sheet
// stays small on every page.
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

const SPRITE = readFileSync('src/assets/chooser/props.svg', 'utf8');
/** About 4.2 KB gzip (v6.12's props); a cached file, never part of the first flight. */
export const PROPS_SPRITE_MAX_GZ = 4600;

describe('the props sprite (MO-36)', () => {
  it('is well-formed XML (a malformed sprite draws nothing): comments without "--", one root, balanced tags', () => {
    for (const m of SPRITE.matchAll(/<!--([\s\S]*?)-->/g)) expect(m[1]).not.toContain('--');
    const doc = new JSDOM(SPRITE, { contentType: 'image/svg+xml' }).window.document; // throws on malformed XML
    expect(doc.documentElement.nodeName).toBe('svg');
  });

  it('six symbols with unique prefixed ids; no text, image, foreignObject, filter or reference to another file', () => {
    expect([...SPRITE.matchAll(/<symbol id="(prop-\w+)"/g)].map((m) => m[1])).toEqual(['prop-plant', 'prop-cup', 'prop-phone', 'prop-clip', 'prop-kb', 'prop-pen']);
    const ids = [...SPRITE.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]!);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^(prop|dk)-/); // never the covers' ids (cover-em-dots, xg-…)
    expect(SPRITE).not.toMatch(/<text|<image|<foreignObject|<filter|filter=|<script|on\w+=/i);
    for (const m of SPRITE.matchAll(/href="([^"]*)"/g)) expect(m[1]).toMatch(/^#dk-|^#prop-/);
  });

  it('role colours are tokens: yellow and cyan only as var(--accent) / var(--cover-cy); the literals are neutral shading', () => {
    expect(SPRITE).toMatch(/var\(--accent\)/);
    expect(SPRITE).toMatch(/var\(--cover-cy\)/);
    expect(SPRITE).not.toMatch(/var\(--[\w-]+,/); // no literal fallbacks
    for (const m of SPRITE.matchAll(/#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})\b/g)) {
      const h = m[1]!.length === 3 ? [...m[1]!].map((c) => c + c).join('') : m[1]!;
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
      const sat = Math.max(r!, g!, b!) - Math.min(r!, g!, b!);
      expect(sat, `#${m[1]} is not a role colour`).toBeLessThan(100);
    }
  });

  it(`the sprite stays within ${PROPS_SPRITE_MAX_GZ} B gzip`, () => {
    expect(gzipSync(Buffer.from(SPRITE), { level: 9 }).length).toBeLessThanOrEqual(PROPS_SPRITE_MAX_GZ);
  });
});
