// B.3 budgets of the chooser's first load, read from the built site (skipped without dist; the controller runs it after
// each build): the HTML fits the first flight, the DOM stays small, the chooser's sheet and scripts stay within their
// budgets, and the props come from their cached sprite (nothing drawn inline).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

const DIST = 'dist';
const gz = (b: Buffer | string) => gzipSync(typeof b === 'string' ? Buffer.from(b) : b, { level: 9 }).length;
const file = (href: string) => readFileSync(join(DIST, ...href.split('/').filter(Boolean)));

describe.skipIf(!existsSync(join(DIST, 'index.html')))('chooser first-load budgets (B.3, dist)', () => {
  for (const page of ['index.html', 'en/index.html']) {
    it(`B.3: / HTML ≤ 14,336 B gz, ≤ 800 elements; chooser.css ≤ 13,000 B gz; chooser scripts ≤ 8,000 B gz (${page})`, () => {
      const html = readFileSync(join(DIST, page), 'utf8');
      expect(gz(html)).toBeLessThanOrEqual(14336);
      expect((html.match(/<[a-zA-Z][\w-]*[\s>/]/g) ?? []).length).toBeLessThanOrEqual(800);
      const sheet = /<link rel="stylesheet" href="(\/_astro\/chooser\.[\w-]+\.css)"/.exec(html)?.[1];
      expect(sheet).toBeDefined();
      expect(gz(file(sheet!))).toBeLessThanOrEqual(13000);
      // the module scripts the page loads and their static imports
      const seen = new Set<string>();
      const queue = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]!);
      while (queue.length) {
        const src = queue.pop()!;
        if (seen.has(src)) continue;
        seen.add(src);
        const text = file(src).toString();
        for (const m of text.matchAll(/(?:from|import)\s*"\.\/([^"]+\.js)"/g)) queue.push(src.replace(/[^/]+$/, '') + m[1]);
      }
      expect([...seen].reduce((n, s) => n + gz(file(s)), 0)).toBeLessThanOrEqual(8000);
    });
  }

  it('the printout’s paint tiles are hashed files the sheet names (shared with the general version’s), never inlined', () => {
    const html = readFileSync(join(DIST, 'index.html'), 'utf8');
    const sheet = file(/<link rel="stylesheet" href="(\/_astro\/chooser\.[\w-]+\.css)"/.exec(html)![1]!).toString();
    expect(sheet).not.toMatch(/data:image\/webp/);
    const tiles = [...sheet.matchAll(/\/_astro\/((?:paint-(?:rh|yh|yv|bv)(?:-2x)?|paper-formation)\.[\w-]+\.webp)/g)].map((m) => m[1]!);
    expect(new Set(tiles.map((t) => t.split('.')[0])).size).toBe(9);
    for (const t of tiles) expect(existsSync(join(DIST, '_astro', t)), t).toBe(true);
  });

  it('MO-36: the props are six <use> frames of one cached sprite (≤ 4,600 B gz); no props drawing inline', () => {
    const html = readFileSync(join(DIST, 'index.html'), 'utf8');
    const uses = [...html.matchAll(/<use data-href="(\/_astro\/props\.[\w-]+\.svg)#prop-\w+"/g)].map((m) => m[1]);
    expect(uses).toHaveLength(6);
    expect(new Set(uses).size).toBe(1);
    expect(gz(file(uses[0]!))).toBeLessThanOrEqual(4600);
    expect(html).not.toMatch(/<symbol|id="dk-/);
  });
});
