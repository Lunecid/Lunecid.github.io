// MO-27: neon flicker typing on the opening's overlay lines and the game cover's small labels (chooser v6.2 typing,
// v6.12 timings). Pure helpers: the glyph split, the per-glyph variant (seeded, deterministic), the line stagger that
// fits each line in its window, and the WCAG 2.3.1 flash-area bound.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { coverCopy } from '../../src/data/copy/chooser-covers';
import { NEON, NEON_TARGETS, NEON_WINDOWS, glyphVariant, lineEndMs, lineStagger, splitGlyphs } from '../../src/lib/neon';
import { chooserCopy } from '../../src/data/copy/chooser';

const css = readFileSync(new URL('../../src/styles/chooser.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

describe('neon typing (MO-27)', () => {
  it('NEON values; the chooser tokens --dur-type-step and --dur-flicker equal them', () => {
    expect(NEON).toEqual({ staggerMs: 18, staggerMinMs: 10, staggerMaxMs: 30, flickerMs: 150, maxCycles: 3 });
    const root = /\n:root \{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(root).toMatch(/--dur-type-step: 18ms;/);
    expect(root).toMatch(/--dur-flicker: \.15s;/);
  });

  it('splitGlyphs: Hangul syllables, Latin letters and spaces are one glyph each; joined back equals the text', () => {
    expect(splitGlyphs('> 열람 요청 · 2건')).toEqual(['>', ' ', '열', '람', ' ', '요', '청', ' ', '·', ' ', '2', '건']);
    for (const text of ['SECURE DOCUMENT TERMINAL', '[ MODE 01 ]', 'NO. PDL-26/01', '> 열람 요청 · 포트폴리오 문서 2건']) expect(splitGlyphs(text).join('')).toBe(text);
  });

  it('variant choice is deterministic per text and position; about a quarter of the glyphs light once', () => {
    const text = 'SECURE DOCUMENT TERMINAL ACCESS GRANTED GAME_ANALYST.DOC';
    const a = splitGlyphs(text).map((_, i) => glyphVariant(text, i));
    expect(splitGlyphs(text).map((_, i) => glyphVariant(text, i))).toEqual(a);
    expect(new Set(a)).toEqual(new Set(['a', 'b']));
    const once = a.filter((v) => v === 'a').length / a.length;
    expect(once).toBeGreaterThan(0.1);
    expect(once).toBeLessThan(0.45);
    expect(glyphVariant('AB', 0)).not.toBe(undefined);
  });

  it('the keyframes animate opacity only, with at most three dark-to-light cycles, stepped (steps(1, end)); the glow is static', () => {
    for (const name of ['ng-a', 'ng-b']) {
      const body = new RegExp(`@keyframes ${name} \\{([\\s\\S]*?\\})\\s*\\}`).exec(css)?.[1] ?? '';
      expect(body, name).not.toBe('');
      expect([...body.matchAll(/([\w-]+):/g)].map((m) => m[1]).filter((p) => p !== 'opacity'), name).toEqual([]);
      const values = [...body.matchAll(/opacity: ([\d.]+)/g)].map((m) => Number(m[1]));
      let rises = 0;
      for (let i = 1; i < values.length; i++) if (values[i]! > values[i - 1]!) rises++;
      expect(rises, name).toBeLessThanOrEqual(NEON.maxCycles);
      expect(values.at(-1), name).toBe(1);
    }
    expect(css).toMatch(/\[data-intro="opening"\] \.ng \{ animation: ng-a var\(--dur-flicker\) steps\(1, end\) var\(--d, 0s\) both; \}/);
    expect(css).not.toMatch(/@keyframes [\w-]+ \{[^@]*text-shadow/);
  });

  it('lineStagger: 18 ms when the line fits its window, compressed to fit (never under 10 ms), never over 30 ms', () => {
    expect(lineStagger(10, 1000)).toBe(18);
    expect(lineStagger(24, 450)).toBeCloseTo((450 - 150) / 23, 6);
    expect(lineStagger(80, 300)).toBe(10);
    expect(lineEndMs(10, 18)).toBe(9 * 18 + 150);
  });

  it('every overlay line and cover label fits its window in both languages', () => {
    for (const lang of ['ko', 'en'] as const) {
      const c = coverCopy[lang];
      const texts: Record<string, string> = {
        '.ov__t': c.opening.terminal, '.ov__rq': c.opening.request.replace('{count}', '2'), '.ov__nd': c.opening.node.num, '.ov__dt': c.opening.decrypt, '.ov__st': c.opening.granted,
        '.bar__name': c.game.file, '.bar__access': c.game.access, '.bar__no': c.game.serial, '.cv__pub': c.game.series, '.cv__kicker': `[ MODE ${chooserCopy[lang].game.num} ]`,
        '.cv__no': c.game.num, '.cv__foot-t': c.foot.replace('{year}', '2026').replace('{host}', 'lunecid.github.io'), '.cv__sn': c.game.rail.serial,
      };
      for (const t of NEON_TARGETS) {
        const n = splitGlyphs(texts[t.sel]!).length;
        const end = t.atMs + lineEndMs(n, lineStagger(n, NEON_WINDOWS[t.window] - t.atMs));
        expect(end, `${lang} ${t.sel}`).toBeLessThanOrEqual(NEON_WINDOWS[t.window] + 1e-6);
      }
    }
  });

  it('targets: the overlay lines and the small cover labels only — never the h1, the h2s, display words, taglines, contents or a CTA', () => {
    expect(NEON_TARGETS.map((t) => t.sel)).toEqual(['.ov__t', '.ov__rq', '.ov__nd', '.ov__dt', '.ov__st', '.bar__name', '.cv__pub', '.cv__kicker', '.bar__access', '.cv__foot-t', '.cv__no', '.bar__no', '.cv__sn']);
    for (const t of NEON_TARGETS) expect(t.sel).not.toMatch(/title|disp|intro|toc|cta|h1|h2/);
  });

  it('WCAG 2.3.1: concurrent flicker area < 21,824 px² at the densest moment (all lock-phase labels overlap)', () => {
    // glyph boxes (measured at the chooser's sizes): a --fs-min (12px) mono glyph ≈ 7.3 × 17 px, the request line's
    // --fs-small (15px) glyph ≈ 9.1 × 24 px (Hangul up to 15 × 24 px)
    const BOX: Record<string, number> = { min: 7.3 * 17, small: 15 * 24 };
    const conc = (stagger: number) => Math.ceil(NEON.flickerMs / stagger);
    // densest moment: every label line types at once at the floor stagger (worst case), plus the status badge
    const labels = NEON_TARGETS.filter((t) => t.window === 'labels' || t.window === 'status').length;
    const area = labels * conc(NEON.staggerMinMs) * BOX.min!;
    // the console lines overlap each other, not the labels (the console is gone before the lock)
    const consoleArea = 3 * conc(NEON.staggerMinMs) * BOX.min! + conc(NEON.staggerMinMs) * BOX.small!;
    expect(Math.max(area, consoleArea)).toBeLessThan(21824);
  });
});
