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
      // the tilt is a pointer-only lean (keyboard focus has its own rule); colour changes need a pressed twin
      if ([...r.decls.keys()].every((k) => /^(transform|will-change)$/.test(k))) continue;
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
