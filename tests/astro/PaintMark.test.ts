import { describe, expect, it } from 'vitest';
import PaintMark from '../../src/components/data/PaintMark.astro';
import Folio from '../../src/components/data/Folio.astro';
import { renderAstro } from './helpers';

const KINDS = ['hero', 'photo', 'cv', 'mosaic', 'aline', 'fmark'] as const;

describe('PaintMark.astro and Folio.astro (DS-3)', () => {
  it('every kind is aria-hidden, focusable nowhere, holds no text, uses paint classes only', async () => {
    const cells: Record<string, number> = {};
    for (const kind of KINDS) {
      const html = (await renderAstro(PaintMark, { props: { kind } })).trim();
      expect(html, kind).toMatch(new RegExp(`^<span class="ed-mc ed-mc--${kind}" aria-hidden="true"[^>]*>(<i class="ed-mc__[rbyw]"[^>]*></i>)+</span>$`));
      expect(html.replace(/<[^>]*>/g, ''), `${kind}: no text`).toBe('');
      expect(html, kind).not.toMatch(/tabindex|href|<a|<button|role=/);
      cells[kind] = html.match(/<i /g)?.length ?? 0;
    }
    // red is the large field, blue secondary, yellow the small cell (v5 accents list)
    expect(cells).toEqual({ hero: 2, photo: 4, cv: 4, mosaic: 6, aline: 2, fmark: 3 });
    const fmark = await renderAstro(PaintMark, { props: { kind: 'fmark' } });
    expect([...fmark.matchAll(/ed-mc__([rbyw])/g)].map((m) => m[1])).toEqual(['r', 'b', 'y']);
  });

  it('the folio is aria-hidden page furniture with no text of its own (the number is a CSS counter)', async () => {
    const html = (await renderAstro(Folio, {})).trim();
    expect(html).toMatch(/^<div class="ed-folio" aria-hidden="true"[^>]*><span class="ed-folio__n"[^>]*><\/span><\/div>$/);
  });
});
