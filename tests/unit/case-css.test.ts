// The case overlay's stylesheet (src/lib/case/overlay.css) and its scoped tokens (src/styles/case-tokens.css).
// style-rules.test.ts covers motion, hover, sizes and durations for every src CSS file (no new exemption); here: the
// palette lives only in case-tokens.css, every --cs-* in use is defined, nothing leaks into the inlined tokens.css,
// and the report palette's text pairs keep 4.5:1.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(rel, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const TOKENS = read('src/styles/case-tokens.css');
const OVERLAY = read('src/lib/case/overlay.css');
const LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g;

const defined = (): Map<string, string> => {
  const map = new Map<string, string>();
  for (const m of TOKENS.matchAll(/(--[\w-]+):\s*([^;]+);/g)) map.set(m[1]!, m[2]!.trim());
  return map;
};
const caseSources = (): string[] => {
  const files = existsSync('src/lib/case') ? readdirSync('src/lib/case').filter((f) => /\.(ts|css)$/.test(f)).map((f) => `src/lib/case/${f}`) : [];
  return files.map((f) => readFileSync(f, 'utf8'));
};

/** WCAG relative luminance of #RRGGBB. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

describe('case overlay CSS', () => {
  it('the palette is the approved v4 report palette, scoped to .cs, in case-tokens.css only', () => {
    const t = defined();
    expect(Object.fromEntries(['--cs-paper', '--cs-t0', '--cs-t1', '--cs-t2', '--cs-cy', '--cs-y', '--cs-y-text'].map((k) => [k, t.get(k)]))).toEqual({
      '--cs-paper': '#F6F4EE', '--cs-t0': '#1B1F24', '--cs-t1': '#30353C', '--cs-t2': '#5B626B', '--cs-cy': '#1B5E9B', '--cs-y': '#94600F', '--cs-y-text': '#85550B',
    });
    expect(TOKENS.trim()).toMatch(/^\.cs \{[\s\S]*\}$/);
    expect(read('src/styles/tokens.css')).not.toMatch(/--cs-|--dur-cs-/);
    // colour literals only in --cs-* declarations
    for (const decl of TOKENS.split(';').filter((d) => LITERAL.test(d))) expect(decl.trim()).toMatch(/^(?:\.cs \{\s*)?--cs-[\w-]+:/);
  });

  it('overlay.css imports the tokens and has no colour literal', () => {
    expect(OVERLAY).toMatch(/^@import '\.\.\/\.\.\/styles\/case-tokens\.css';/m);
    expect(OVERLAY.match(LITERAL) ?? []).toEqual([]);
  });

  it('every --cs-* and --dur-cs-* used by the overlay CSS and the case scripts is defined', () => {
    const t = defined();
    const used = new Set(caseSources().flatMap((src) => [...src.matchAll(/var\((--(?:cs|dur-cs)-[\w-]+)/g)].map((m) => m[1]!)));
    expect(used.size).toBeGreaterThan(40);
    expect([...used].filter((name) => !t.has(name))).toEqual([]);
  });

  it('every class rule is cs-prefixed (the sheet sits inside pages with their own .badge, .btn, .hit)', () => {
    const selectors = [...OVERLAY.matchAll(/([^{}@]+)\{/g)].map((m) => m[1]!.trim()).filter((s) => s && !s.startsWith('@') && !/^(from|to|\d)/.test(s));
    const classes = new Set(selectors.flatMap((s) => [...s.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]!)));
    const foreign = [...classes].filter((c) => !/^(cs|is-|on\d)/.test(c) && !['sr-only', 'cs-printing'].includes(c));
    expect(foreign).toEqual([]);
  });

  it('reduced motion twins, forced colours and the print path exist', () => {
    expect(OVERLAY).toMatch(/:root\[data-motion="reduce"\] \.cs \*/);
    expect(OVERLAY).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.cs \*/);
    expect(OVERLAY).toMatch(/@media \(forced-colors: active\) \{\s*\.cs__sheet \{ border-left: 2px solid CanvasText; \}/);
    expect(OVERLAY).toMatch(/@media print \{\s*html\.cs-printing body > :not\(dialog\.cs\)/);
    expect(OVERLAY).not.toMatch(/stroke-dash(?:offset|array)\s*:[^;]*var\(--len/);
  });

  it('text pairs of the report palette are at least 4.5:1 (prototype minimum 4.85)', () => {
    const t = defined();
    const c = (fg: string, bg: string) => contrast(t.get(fg)!, t.get(bg)!);
    for (const bg of ['--cs-paper', '--cs-leaf', '--cs-paper-alt']) {
      for (const fg of ['--cs-t0', '--cs-t1', '--cs-t2', '--cs-cy', '--cs-y-text']) expect(c(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
    expect(c('--cs-on-fill', '--cs-cy')).toBeGreaterThanOrEqual(4.5);
    expect(c('--cs-on-fill', '--cs-y')).toBeGreaterThanOrEqual(4.5);
    expect(c('--cs-on-fill', '--cs-y-text')).toBeGreaterThanOrEqual(4.5);
    expect(c('--cs-t2', '--cs-k2')).toBeGreaterThanOrEqual(4.5);
  });
});
