// The game palette (v4, owner-approved 2026-10-05): the raw --gp-* values on :root, the one game block that re-points the
// HUD/read/gold names to them, the role tokens --hl2/--hl2-deep/--ach-rim, and the print twin. Contrast pairs are the
// palette doc's §2a–§2c table (owner-assets/game-palette/v4/palette.md).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrast, parseRules } from '../helpers/css';

const read = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const squash = (v: string | undefined) => (v ?? '').replace(/\s+/g, '');
// tokens.css (inlined into every page) keeps the role-token defaults; game-tokens.css (game pages only, imported by
// game.css) holds the raw --gp-* values, the game block and its print twin
const tokens = () => read('src/styles/game-tokens.css');
const rules = () => parseRules(tokens());
const sharedRules = () => parseRules(read('src/styles/tokens.css'));
const GAME = ':root[data-variant="game"]';
const rootDecls = () => new Map([...sharedRules(), ...rules()].filter((r) => r.selector === ':root' && r.media === null).flatMap((r) => [...r.decls]));
const gameRules = () => rules().filter((r) => r.selector === GAME);
const gameBlock = () => gameRules().find((r) => r.media === null)!.decls;
const gamePrint = () => gameRules().find((r) => r.media === '@media print')!.decls;

const RAW: Record<string, string> = {
  '--gp-k0': '#0B0B0C', '--gp-k1': '#141416', '--gp-k2': '#1C1C1F', '--gp-k-read': '#121214', '--gp-k-card': '#1A1A1D',
  '--gp-t0': '#F4F4F0', '--gp-t1': '#E6E6E1', '--gp-t2': '#A3A39C',
  '--gp-ln': '#707078', '--gp-ln-strong': '#9A9AA2', '--gp-ln-dash': '#3A3A40', '--gp-divider': '#24242A', '--gp-frame': '#2C2C31',
  '--gp-y': '#FFE600', '--gp-y-text': '#FFE14A', '--gp-y-hover': '#FFF06B', '--gp-y-light': '#FFF3A6',
  '--gp-y-wash-8': 'rgba(255, 230, 0, .08)', '--gp-y-wash-12': 'rgba(255, 230, 0, .12)',
  '--gp-y-streak': 'rgba(255, 230, 0, .6)', '--gp-y-strip': 'rgba(255, 230, 0, .9)',
  '--gp-cy': '#00E5FF', '--gp-cy-dim': 'rgba(0, 229, 255, .45)', '--gp-cy-wash': 'rgba(0, 229, 255, .12)',
  '--gp-cy-glow': 'rgba(0, 229, 255, .45)', '--gp-cy-light': '#99F5FF',
  '--gp-ink': '#0B0B0C',
  '--gp-w-panel': '#EEEEE9', '--gp-w-card': '#F7F7F3', '--gp-w-ink': '#1A1A1A', '--gp-w-ink-2': '#55554F',
  '--gp-w-cy': '#006F80', '--gp-w-cy-wash': '#E0F4F6',
  '--gp-w-line': 'rgba(26, 26, 26, .14)', '--gp-w-line-strong': '#85857F', '--gp-w-rule': '#B9B9B3',
  '--gp-w-code': '#E6E6E0', '--gp-w-code-line': '#CFCFC8',
  '--gp-nav-bg': 'rgba(11, 11, 12, .97)', '--gp-panel-92': 'rgba(20, 20, 22, .92)', '--gp-panel-75': 'rgba(20, 20, 22, .75)',
  '--gp-fade': 'rgba(11, 11, 12, .95)', '--gp-scrim': 'rgba(0, 0, 0, .55)', '--gp-grid': 'rgba(255, 255, 255, .03)',
  '--gp-cart-shell': '#2A2A2E', '--gp-cart-shell-hover': '#323237', '--gp-cart-shell-shade': '#1D1D21', '--gp-cart-shell-grip': '#45454B',
  '--gp-paper-shadow': '0 0 0 1px #2C2C31, 0 18px 40px rgba(0, 0, 0, .5)',
  '--gp-ach-rim': '#0097A7',
  '--gp-haz': 'repeating-linear-gradient(-45deg, var(--gp-y) 0 5px, transparent 5px 10px)',
  '--gp-edge-cy': 'var(--gp-cy)', '--gp-edge-y': 'var(--gp-y)',
  '--gp-print-paper': '#FFFFFF', '--gp-print-ink': '#000000', '--gp-print-muted': '#333333',
};

const BLOCK: Record<string, string> = {
  'color-scheme': 'dark',
  '--hud-bg': 'var(--gp-k0)', '--hud-panel': 'var(--gp-k1)', '--hud-text': 'var(--gp-t1)', '--hud-strong': 'var(--gp-t0)',
  '--hud-muted': 'var(--gp-t2)', '--hud-label': 'var(--gp-t2)',
  '--accent': 'var(--gp-y)', '--accent-ink': 'var(--gp-ink)', '--accent-deep': 'var(--gp-y-text)', '--accent-hover': 'var(--gp-y-hover)',
  '--accent-light': 'var(--gp-y-light)', '--accent-wash': 'var(--gp-k1)', '--accent-wash-strong': 'var(--gp-k2)',
  '--accent-wash-12': 'var(--gp-y-wash-8)', '--accent-wash-16': 'var(--gp-y-wash-12)', '--accent-streak': 'var(--gp-y-streak)',
  '--hud-line': 'var(--gp-ln)', '--hud-line-strong': 'var(--gp-ln-strong)', '--hud-line-dash': 'var(--gp-ln-dash)',
  '--hud-divider': 'var(--gp-divider)', '--hud-frame': 'var(--gp-frame)', '--hud-nav-bg': 'var(--gp-nav-bg)',
  '--hud-panel-92': 'var(--gp-panel-92)', '--hud-panel-75': 'var(--gp-panel-75)', '--hud-fade': 'var(--gp-fade)',
  '--grid-line': 'var(--gp-grid)', '--chip-bg': 'var(--gp-k2)', '--scrim': 'var(--gp-scrim)',
  '--gold': 'var(--gp-cy)', '--gold-ink': 'var(--gp-ink)', '--gold-line': 'var(--gp-cy-dim)', '--gold-wash': 'var(--gp-cy-wash)',
  '--gold-deep': 'var(--gp-cy)',
  '--read-bg': 'var(--gp-k-read)', '--read-card': 'var(--gp-k-card)', '--read-text': 'var(--gp-t1)', '--read-muted': 'var(--gp-t2)',
  '--read-label': 'var(--gp-t2)', '--read-line': 'var(--gp-frame)', '--read-line-strong': 'var(--gp-ln)',
  '--cart-shell': 'var(--gp-cart-shell)', '--cart-shell-hover': 'var(--gp-cart-shell-hover)',
  '--cart-shell-shade': 'var(--gp-cart-shell-shade)', '--cart-shell-grip': 'var(--gp-cart-shell-grip)',
  '--hl2': 'var(--gp-cy)', '--hl2-deep': 'var(--gp-w-cy)', '--hl2-light': 'var(--gp-cy-light)', '--ach-rim': 'var(--gp-ach-rim)',
};

/** #RRGGBB of a token as the game block resolves it ('w' = inside a white panel uses the --gp-w-* names directly). */
const hexOf = (name: string): string => {
  const raw = rootDecls().get(name);
  if (!raw) throw new Error(`no ${name} on :root`);
  const ref = /^var\((--[\w-]+)\)$/.exec(raw);
  return ref ? hexOf(ref[1]!) : raw;
};
/** fg at alpha over an opaque bg, as #RRGGBB. */
const over = (rgba: string, bg: string): string => {
  const m = /rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/.exec(rgba)!;
  const a = Number(m[4]);
  const b = parseInt(bg.slice(1), 16);
  const ch = (i: number, shift: number) => Math.round(Number(m[i]) * a + ((b >> shift) & 255) * (1 - a));
  return `#${[ch(1, 16), ch(2, 8), ch(3, 0)].map((n) => n.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
};

describe('game palette tokens (GP-1)', () => {
  it('GP-1: --gp-* raw palette is exact (table)', () => {
    const d = rootDecls();
    for (const [name, value] of Object.entries(RAW)) expect(squash(d.get(name)), name).toBe(squash(value));
    const declared = [...d.keys()].filter((k) => k.startsWith('--gp-'));
    expect(declared.sort()).toEqual([...Object.keys(RAW), '--gp-bars-c', '--gp-bars-g'].sort());
  });

  it('GP-1: the game block re-points exactly the listed names and nothing else; it is the only :root[data-variant="game"] rule in game-tokens.css and precedes @media print; tokens.css has none and no --gp-* value', () => {
    expect(sharedRules().filter((r) => r.selector === GAME)).toEqual([]);
    expect(read('src/styles/tokens.css').replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/--gp-[\w-]+\s*:/);
    expect(read('src/styles/game.css')).toMatch(/^@import '\.\/game-tokens\.css';/m);
    const top = gameRules().filter((r) => r.media === null);
    expect(top).toHaveLength(1);
    expect(gameRules().map((r) => r.media)).toEqual([null, '@media print']);
    expect(Object.fromEntries(gameBlock())).toEqual(BLOCK);
    const css = tokens().replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css.indexOf(`${GAME} {`)).toBeGreaterThan(0);
    expect(css.indexOf(`${GAME} {`)).toBeLessThan(css.indexOf('@media print'));
    // the paper sheet stays light (GP-OQ5), the tints, account tints and game skins keep their values (GP-OQ1)
    for (const name of gameBlock().keys()) expect(name, name).not.toMatch(/^--(paper|tint|acct|gm|skin|ed|nt|pr|page)-/);
  });

  it("GP-1: :root keeps the spec §4 values; --hl2/--hl2-deep/--ach-rim resolve to today's colours outside game pages", () => {
    const d = rootDecls();
    expect(d.get('--accent')).toBe('#C8F03C');
    expect(d.get('--gold')).toBe('#F5B301');
    expect(d.get('--read-bg')).toBe('#F4F5F7');
    expect(d.get('--hud-bg')).toBe('#0B0D11');
    expect(d.get('--hl2')).toBe('var(--accent-deep)');
    expect(d.get('--hl2-deep')).toBe('var(--accent-deep)');
    expect(d.get('--hl2-light')).toBe('var(--accent-light)');
    expect(d.get('--ach-rim')).toBe('var(--gold-deep)');
    // no other selector re-points the role tokens
    for (const r of [...sharedRules(), ...rules()]) {
      if (r.selector === ':root' || r.selector === GAME) continue;
      for (const name of ['--hl2', '--hl2-deep', '--hl2-light', '--ach-rim']) expect(r.decls.has(name), `${r.selector} ${name}`).toBe(false);
    }
  });

  it('GP-1: every text pair of palette.md §2a–§2c is ≥ 4.5:1 and every UI pair ≥ 3:1', () => {
    const c = (n: string) => hexOf(`--gp-${n}`);
    const strip = over(rootDecls().get('--gp-y-strip')!, c('w-panel'));
    // [fg, bg, floor, expected (palette.md, ±0.02), source]
    const pairs: [string, string, number, number, string][] = [
      [c('t1'), c('k0'), 4.5, 15.71, '§2a t1/bg'], [c('t1'), c('k1'), 4.5, 14.69, '§2a t1/panel'],
      [c('t1'), c('k-read'), 4.5, 14.94, '§2a t1/read'], [c('t1'), c('k-card'), 4.5, 13.87, '§2a t1/card'],
      [c('t1'), c('k2'), 4.5, 13.58, '§2a t1/k2'],
      [c('t2'), c('k0'), 4.5, 7.75, '§2a t2/bg'], [c('t2'), c('k1'), 4.5, 7.25, '§2a t2/panel'],
      [c('t2'), c('k-read'), 4.5, 7.37, '§2a t2/read'], [c('t2'), c('k-card'), 4.5, 6.84, '§2a t2/card'],
      [c('t2'), c('k2'), 4.5, 6.70, '§2a t2/k2'],
      [c('t0'), c('k0'), 4.5, 17.84, '§2a title/bg'], [c('t0'), c('k1'), 4.5, 16.69, '§2a title/panel'],
      [c('t0'), c('k-read'), 4.5, 16.97, '§2a title/read'], [c('t0'), c('k-card'), 4.5, 15.75, '§2a title/card'],
      [c('t0'), c('k2'), 4.5, 15.42, '§2a chip text/k2'],
      [c('y-text'), c('k0'), 4.5, 15.10, '§2b yellow text/bg'], [c('y-text'), c('k1'), 4.5, 14.12, '§2b yellow text/panel'],
      [c('y-text'), c('k-read'), 4.5, 14.36, '§2b yellow text/read'], [c('y-text'), c('k-card'), 4.5, 13.33, '§2b yellow text/card'],
      [c('y-text'), c('k2'), 4.5, 13.05, '§2b yellow text/k2'],
      [c('cy'), c('k0'), 4.5, 12.79, '§2b cyan/bg'], [c('cy'), c('k1'), 4.5, 11.96, '§2b cyan/panel'],
      [c('cy'), c('k-read'), 4.5, 12.16, '§2b cyan/read'], [c('cy'), c('k-card'), 4.5, 11.29, '§2b cyan/card'],
      [c('cy'), c('k2'), 4.5, 11.05, '§2b cyan/k2'],
      [c('ink'), c('y'), 4.5, 15.52, '§2b ink on yellow'], [c('ink'), c('y-hover'), 4.5, 16.80, '§2b ink on yellow hover'],
      [c('ink'), c('cy'), 4.5, 12.79, '§2b ink on cyan plate'], [c('ink'), c('y-text'), 4.5, 15.10, '§2b ink on yellow text form'],
      [c('y'), c('k0'), 3, 15.52, '§2b focus ring/bg (UI)'], [c('y'), c('k-read'), 3, 14.76, '§2b focus ring/read (UI)'],
      [c('ln'), c('k0'), 3, 4.01, '§2a line/bg (UI)'], [c('ln'), c('k-read'), 3, 3.81, '§2a line/read (UI)'],
      [c('ln'), c('k1'), 3, 3.75, '§2a line/panel (UI)'], [c('ln'), c('k-card'), 3, 3.54, '§2a line/card (UI)'],
      [c('w-ink'), c('w-panel'), 4.5, 14.95, '§2c ink/panel'], [c('w-ink'), c('w-card'), 4.5, 16.21, '§2c ink/card'],
      [c('w-ink-2'), c('w-panel'), 4.5, 6.45, '§2c muted/panel'], [c('w-ink-2'), c('w-card'), 4.5, 6.99, '§2c muted/card'],
      [c('w-cy'), c('w-panel'), 4.5, 5.03, '§2c deep cyan/panel'], [c('w-cy'), c('w-card'), 4.5, 5.45, '§2c deep cyan/card'],
      [c('w-cy'), c('w-cy-wash'), 4.5, 5.14, '§2c met status on its wash'],
      [c('w-line-strong'), c('w-panel'), 3, 3.19, '§2c UI line/panel'], [c('w-line-strong'), c('w-card'), 3, 3.46, '§2c UI line/card'],
      [c('w-ink'), c('y'), 4.5, 13.73, '§2c ink on the yellow hover / primary button text'],
      [c('w-ink'), strip, 4.5, 13.77, '§2c ink on the highlighter strip over the panel'],
      [c('w-ink'), c('w-code'), 4.5, 13.89, '§2c BibTeX ground'],
      [c('w-ink'), c('w-panel'), 3, 14.95, '§2c focus ink keyline on the panel (UI)'],
    ];
    expect(pairs.length).toBeGreaterThanOrEqual(40);
    for (const [fg, bg, floor, expected, source] of pairs) {
      const r = contrast(fg, bg);
      expect(r, source).toBeGreaterThanOrEqual(floor);
      expect(Math.abs(r - expected), `${source}: ${r.toFixed(2)} vs ${expected}`).toBeLessThanOrEqual(0.02);
    }
    // yellow and cyan never carry text on white (they fail there)
    expect(contrast(c('y'), c('w-panel'))).toBeLessThan(1.5);
    expect(contrast(c('cy'), c('w-panel'))).toBeLessThan(1.5);
  });

  it('GP-1: --ach-rim differs from the medal disc (≥ 1.5:1) and reads on the card (≥ 3:1)', () => {
    const rim = hexOf('--gp-ach-rim');
    expect(contrast(rim, hexOf('--gp-cy'))).toBeGreaterThanOrEqual(1.5);
    expect(contrast(rim, hexOf('--gp-k-card'))).toBeGreaterThanOrEqual(3);
    expect(contrast(rim, hexOf('--gp-k0'))).toBeGreaterThanOrEqual(3);
  });

  it('GP-1: the barcode data URIs use exactly --gp-cy and #5A5A62; no other colour literal outside the tables', () => {
    const d = rootDecls();
    const c = d.get('--gp-bars-c')!;
    const g = d.get('--gp-bars-g')!;
    for (const v of [c, g]) expect(v).toMatch(/^url\("data:image\/svg\+xml,/);
    expect(c.match(/%23[0-9A-Fa-f]{6}/g)).toEqual([`%23${hexOf('--gp-cy').slice(1)}`]);
    expect(g.match(/%23[0-9A-Fa-f]{6}/g)).toEqual(['%235A5A62']);
    // the two barcodes are the same drawing
    expect(c.replace(/%23[0-9A-Fa-f]{6}/, '')).toBe(g.replace(/%23[0-9A-Fa-f]{6}/, ''));
    // every literal of the --gp-* block is one of the table's values
    const allowed = new Set(Object.values(RAW).join(' ').match(/#[0-9A-Fa-f]{6}/g));
    for (const [name, value] of d) {
      if (!name.startsWith('--gp-') || name.startsWith('--gp-bars')) continue;
      for (const hex of value.match(/#[0-9A-Fa-f]{3,8}\b/g) ?? []) expect(allowed.has(hex), `${name} ${hex}`).toBe(true);
    }
  });

  it('GP-1: print — every re-pointed text token has a print value ≥ 4.5:1 on white', () => {
    const p = gamePrint();
    const textTokens = ['--hud-text', '--hud-strong', '--hud-muted', '--hud-label', '--read-text', '--read-muted', '--read-label',
      '--accent', '--accent-deep', '--hl2', '--hl2-deep', '--gold', '--gold-deep'];
    for (const name of textTokens) {
      const v = p.get(name);
      expect(v, name).toMatch(/^#[0-9A-F]{6}$/);
      expect(contrast(v!, '#FFFFFF'), name).toBeGreaterThanOrEqual(4.5);
    }
    for (const name of ['--hud-bg', '--hud-panel', '--read-bg', '--read-card']) expect(p.get(name), name).toBe('#FFFFFF');
    expect(p.get('--gold-ink')).toBe('#000000');
    // the print twin comes after the game block (same specificity), so it wins
    const css = tokens().replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css.indexOf(`${GAME} {`, css.indexOf('@media print'))).toBeGreaterThan(css.indexOf(`${GAME} {`));
  });
});
