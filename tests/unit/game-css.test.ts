// src/styles/game.css (game palette v4): scoped to game pages, tokens only, hover inside (hover: hover) with an :active
// twin, decoration that never takes the pointer.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { splitSelectors } from '../helpers/css';

type Rule = { at: string[]; selector: string; decls: Map<string, string>; body: string };
const read = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const css = () => read('src/styles/game.css');

/** Every style rule with the chain of at-rules around it (@media, @container, @supports nest). */
function rulesOf(text: string): Rule[] {
  const src = text.replace(/\/\*[\s\S]*?\*\//g, '');
  const out: Rule[] = [];
  const walk = (t: string, at: string[]) => {
    let i = 0;
    while (i < t.length) {
      const open = t.indexOf('{', i);
      if (open < 0) break;
      const prelude = t.slice(i, open).trim().replace(/\s+/g, ' ');
      let depth = 1;
      let j = open + 1;
      for (; j < t.length && depth > 0; j++) {
        if (t[j] === '{') depth++;
        if (t[j] === '}') depth--;
      }
      const body = t.slice(open + 1, j - 1);
      if (prelude.startsWith('@')) walk(body, [...at, prelude]);
      else {
        const decls = new Map<string, string>();
        for (const part of body.split(/;(?![^(]*\))/)) {
          const k = part.indexOf(':');
          if (k > 0) decls.set(part.slice(0, k).trim(), part.slice(k + 1).trim().replace(/\s+/g, ' '));
        }
        out.push({ at, selector: prelude, decls, body });
      }
      i = j;
    }
  };
  walk(src, []);
  return out;
}

const PREFIX = /^(:root\[data-variant="game"\]|html\[data-variant="game"\])/;

describe('game.css (GP-2)', () => {
  it('GP-2: every selector of game.css starts with :root[data-variant="game"] (or html[data-variant="game"])', () => {
    const rules = rulesOf(css());
    expect(rules.length).toBeGreaterThan(10);
    for (const r of rules) for (const sel of splitSelectors(r.selector)) expect(sel, sel).toMatch(PREFIX);
  });

  it('GP-2: no colour literal (tokens only)', () => {
    const src = css().replace(/\/\*[\s\S]*?\*\//g, '');
    expect(src.match(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(|\bcolor-mix\(/g) ?? []).toEqual([]);
    // named colours only as forced-colours system colours or keywords
    const named = src.match(/:\s*[^;{}]*\b(white|black|yellow|cyan|red|blue|gold|lime)\b/gi) ?? [];
    expect(named).toEqual([]);
  });

  it('GP-2: every :hover rule is inside @media (hover: hover…) and has an :active twin where it changes colour or transform', () => {
    const rules = rulesOf(css());
    const hovers = rules.filter((r) => r.selector.includes(':hover'));
    expect(hovers.length).toBeGreaterThan(0);
    for (const r of hovers) {
      expect(r.at.some((a) => /@media \(hover: hover\)/.test(a)), r.selector).toBe(true);
      const moves = [...r.decls.keys()].some((k) => /color|background|transform|text-shadow|box-shadow|text-decoration/.test(k));
      if (!moves || r.selector.includes(':focus')) continue;
      // the media tilt is a fine-pointer lean, not a press (keyboard focus has its own rule, touch never tilts)
      if (r.at.some((a) => /pointer: fine/.test(a))) continue;
      for (const sel of splitSelectors(r.selector)) {
        const twin = sel.replace(/:hover/g, ':active');
        const found = rules.some((o) => splitSelectors(o.selector).includes(twin) && !o.at.some((a) => /hover/.test(a)));
        expect(found, `${sel} has no :active twin outside the hover query`).toBe(true);
      }
    }
  });

  it('GP-2: every pseudo-element it creates sets pointer-events: none', () => {
    for (const r of rulesOf(css())) {
      if (!r.decls.has('content')) continue;
      expect(r.decls.get('pointer-events'), r.selector).toBe('none');
    }
  });

  it('GP-2: the focus ring in the reading bands is the yellow fill colour, and hud.css, read.css and base.css carry no game rule', () => {
    const focus = rulesOf(css()).find((r) => r.selector.includes('.read :focus-visible'));
    expect(focus?.decls.get('outline-color')).toBe('var(--accent)');
    // hud.css and read.css also serve the neutral pages: no game rule there; base.css keeps only its earlier print rules
    for (const f of ['hud', 'read']) expect(read(`src/styles/${f}.css`), f).not.toMatch(/data-variant="game"|--gp-/);
    expect(read('src/styles/base.css')).not.toMatch(/--gp-|--hl2|--ach-rim/);
  });
});

describe('achievements in the game palette (GP-4)', () => {
  it('GP-4: meters fill with --hl2, never --accent', () => {
    const meter = read('src/components/player-log/AchievementMeter.astro');
    const fav = read('src/islands/FavoriteGames.css');
    expect(meter).toMatch(/\.ach-meter__fill[^{]*\{[^}]*linear-gradient\(90deg, var\(--hl2\), var\(--hl2-light\)\)/);
    expect(fav).toMatch(/\.fg-acct__fill \{[^}]*linear-gradient\(90deg, var\(--hl2\), var\(--hl2-light\)\)/);
    for (const src of [meter, fav]) {
      const fills = [...src.matchAll(/(\.ach-meter__fill|\.fg-acct__fill)[^{]*\{([^}]*)\}/g)].map((m) => m[2]!);
      for (const f of fills) expect(f).not.toMatch(/--accent/);
    }
  });

  it('GP-4: medal rim and ribbon use --ach-rim; the disc --gold; the account dialog rule is decoration in --hl2', () => {
    const medal = read('src/components/player-log/Medal.astro');
    expect(medal).toMatch(/\.medal__rim \{ fill: var\(--ach-rim\)/);
    expect(medal).toMatch(/\.medal__ribbon \{ fill: var\(--ach-rim\); stroke: var\(--ach-rim\)/);
    expect(medal).toMatch(/\.medal__disc \{ fill: var\(--gold\)/);
    expect(read('src/islands/AccountLinks.css')).toMatch(/\.acct-dlg__rule \{[^}]*background: var\(--hl2\)/);
  });
});

describe('media tilt (GP-7)', () => {
  const tilt = () => rulesOf(css()).filter((r) => /cart__img|chart__scroll|interests__img/.test(r.selector) && !r.at.some((a) => /print|forced-colors/.test(a)));

  it('GP-7: tilt transitions use --dur-tilt-in/--dur-panel-out and --ease-out; will-change only in hover/focus states', () => {
    const rules = tilt();
    const base = rules.find((r) => r.decls.get('transition'));
    expect(base?.decls.get('transition')).toBe('transform var(--dur-panel-out) var(--ease-out)');
    const active = rules.filter((r) => r.decls.has('transform') && r.decls.get('transform') !== 'none !important');
    expect(active.length).toBe(2); // hover (fine pointer) and keyboard focus
    for (const r of active) {
      expect(r.decls.get('transition-duration'), r.selector).toBe('var(--dur-tilt-in)');
      expect(r.decls.get('will-change'), r.selector).toBe('transform');
      expect(r.decls.get('transform'), r.selector).toBe('translateY(var(--tilt-lift)) rotate(calc(var(--tilt-dir) * var(--tilt-deg))) scale(var(--tilt-scale))');
      expect(/:hover|:focus-visible/.test(r.selector), r.selector).toBe(true);
    }
    const hover = active.find((r) => r.selector.includes(':hover'))!;
    expect(hover.at).toContain('@media (hover: hover) and (pointer: fine)');
    expect(active.find((r) => r.selector.includes(':focus-visible'))!.at).toEqual([]);
    for (const r of rules) if (r.decls.has('will-change') && !r.decls.get('will-change')!.startsWith('auto')) expect(active).toContain(r);
    // both reduce paths turn the lean off (the frame highlight stays: no outline or box-shadow reset there)
    const reduce = rules.filter((r) => r.decls.get('transform') === 'none !important');
    expect(reduce.some((r) => r.at.includes('@media (prefers-reduced-motion: reduce)'))).toBe(true);
    expect(reduce.some((r) => r.selector.startsWith(':root[data-variant="game"][data-motion="reduce"]'))).toBe(true);
    for (const r of reduce) expect(r.decls.has('box-shadow') || r.decls.has('outline-color'), r.selector).toBe(false);
    // print and forced colours drop the transform / the glow
    const all = rulesOf(css());
    expect(all.some((r) => r.at.includes('@media print') && /cart__img/.test(r.selector) && r.decls.get('transform') === 'none !important')).toBe(true);
    expect(all.some((r) => r.at.includes('@media (forced-colors: active)') && /cart__img/.test(r.selector) && r.decls.get('outline-color') === 'CanvasText !important')).toBe(true);
  });
});

describe('game.css validity', () => {
  it('no pseudo-element inside :is() / :where() (the whole rule would be dropped)', () => {
    for (const r of rulesOf(css())) expect(r.selector, r.selector).not.toMatch(/:(is|where)\([^)]*::/);
  });
});
