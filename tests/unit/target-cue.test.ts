// In-page arrival cue (motion audit T1): a figure or records section reached through an in-page link (`:target`)
// marks itself once — the game figure's corner marks lock on, the general figure draws an accent line over its heavy
// top rule; the records section heads take the same pattern. Reduced motion (both paths) and print get no motion.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const css = (file: string): string => readFileSync(join(ROOT, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const squash = (s: string): string => s.replace(/\s+/g, ' ').trim();
const HUD = css('src/styles/hud.css');
const READ = css('src/styles/read.css');
const ED = css('src/styles/editorial.css');

type Rule = { selectors: string[]; body: string; at: string[] };
function rules(text: string): Rule[] {
  const out: Rule[] = [];
  const visit = (t: string, at: string[]) => {
    let i = 0;
    while (i < t.length) {
      const open = t.indexOf('{', i);
      if (open < 0) break;
      const prelude = squash(t.slice(i, open).split(/[;}]/).pop()!);
      let depth = 1;
      let j = open + 1;
      for (; j < t.length && depth > 0; j++) {
        if (t[j] === '{') depth++;
        if (t[j] === '}') depth--;
      }
      const body = t.slice(open + 1, j - 1);
      if (/^@keyframes\b/.test(prelude)) {
        // frames are not rules
      } else if (prelude.startsWith('@') && body.includes('{')) visit(body, [...at, prelude]);
      else out.push({ selectors: prelude.split(',').map(squash), body: squash(body), at });
      i = j;
    }
  };
  visit(text, []);
  return out;
}
const decl = (body: string, prop: string): string | undefined =>
  body.split(';').map((d) => d.trim()).find((d) => d.startsWith(`${prop}:`))?.slice(prop.length + 1).trim();
/** Declared value of `prop` for `selector` outside any at-rule (the last rule wins). */
function screenValue(text: string, selector: string, prop: string): string | undefined {
  let v: string | undefined;
  for (const r of rules(text)) if (r.at.length === 0 && r.selectors.includes(selector) && decl(r.body, prop) !== undefined) v = decl(r.body, prop);
  return v;
}
function keyframes(text: string, name: string): string {
  const m = new RegExp(`@keyframes\\s+${name}\\s*\\{`).exec(text);
  if (!m) return '';
  let depth = 1;
  let j = m.index + m[0].length;
  for (; j < text.length && depth > 0; j++) {
    if (text[j] === '{') depth++;
    if (text[j] === '}') depth--;
  }
  return squash(text.slice(m.index + m[0].length, j - 1));
}
const frameProps = (body: string): string[] => [...body.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);

const GAME_FIG = '.figure.bracket:target';
const GAME_SEC = ['.rec.read-sec:target > .container > .sec-head', '.jobfit.read-sec:target > .container > .sec-head'];
const DATA_FIG = ':root[data-variant="data"] .ed-figure:target';
const DATA_SEC = [':root[data-variant="data"] .rec.ed-sec:target > .container > .ed-head', ':root[data-variant="data"] .jobfit.ed-sec:target > .container > .ed-head'];
const HOLD = 'calc(var(--dur-panel-in) + var(--dur-streak) + var(--dur-fade))';

/** Both reduce paths: rules under :root[data-motion="reduce"] and rules inside @media (prefers-reduced-motion: reduce). */
function reduceRules(text: string) {
  const all = rules(text);
  return {
    js: all.filter((r) => r.at.length === 0 && r.selectors.every((s) => /^:root(\[data-variant="data"\])?\[data-motion="reduce"\] /.test(s))),
    os: all.filter((r) => r.at.some((a) => /prefers-reduced-motion:\s*reduce/.test(a))),
  };
}
const covers = (list: Rule[], selector: string, prop: string, value: string): boolean =>
  list.some((r) => r.selectors.some((s) => s.endsWith(selector)) && decl(r.body, prop)?.replace(/\s*!important$/, '') === value);

describe('T1 in-page arrival cue', () => {
  it('T1: game figures lock on once with --dur-panel-in --ease-out', () => {
    expect(screenValue(HUD, `${GAME_FIG}::before`, 'animation')).toBe('cue-lock-tl var(--dur-panel-in) var(--ease-out)');
    expect(screenValue(HUD, `${GAME_FIG}::after`, 'animation')).toBe('cue-lock-br var(--dur-panel-in) var(--ease-out)');
    expect(keyframes(HUD, 'cue-lock-tl')).toBe('from { transform: translate(-6px, -6px); opacity: .4; }');
    expect(keyframes(HUD, 'cue-lock-br')).toBe('from { transform: translate(6px, 6px); opacity: .4; }');
    // the records section heads take the same lock-on, then let go (the head has no corners at rest)
    for (const sel of GAME_SEC) {
      expect(screenValue(READ, `${sel}::before`, 'animation'), sel).toBe(`cue-head-tl ${HOLD} var(--ease-out)`);
      expect(screenValue(READ, `${sel}::after`, 'animation'), sel).toBe(`cue-head-br ${HOLD} var(--ease-out)`);
      expect(screenValue(READ, `${sel}::before`, 'opacity'), sel).toBe('0');
    }
  });

  it('T1: general figures draw an accent rule, then fade', () => {
    for (const sel of [DATA_FIG, ...DATA_SEC]) {
      const pe = `${sel}::before`;
      expect(screenValue(ED, pe, 'animation'), sel).toBe(`cue-rule ${HOLD} var(--ease-out)`);
      expect(screenValue(ED, pe, 'border-top'), sel).toBe('var(--ed-rule-w-strong) solid var(--ed-accent)');
      expect(screenValue(ED, pe, 'transform-origin'), sel).toBe('0');
      expect(screenValue(ED, pe, 'opacity'), sel).toBe('0'); // gone once the animation ends
    }
    const rule = keyframes(ED, 'cue-rule');
    expect(rule).toMatch(/^0% \{ transform: scaleX\(0\); opacity: 1; \}/);
    expect(rule).toContain('23% { transform: scaleX(1); }');
    expect(rule).toContain('85% { opacity: 1; }');
    expect(rule).toMatch(/100% \{ opacity: 0; \}$/);
  });

  it('T1: keyframes use transform and opacity only', () => {
    for (const [text, names] of [[HUD, ['cue-lock-tl', 'cue-lock-br']], [READ, ['cue-head-tl', 'cue-head-br']], [ED, ['cue-rule']]] as const) {
      for (const name of names) {
        const body = keyframes(text, name);
        expect(body, name).not.toBe('');
        expect(new Set(frameProps(body)), name).toEqual(new Set(['transform', 'opacity']));
      }
    }
  });

  it('T1: both reduce paths replace the motion with a static colour', () => {
    const cases: [string, string[], [string, string, string][]][] = [
      [HUD, [`${GAME_FIG}::before`, `${GAME_FIG}::after`], [[`${GAME_FIG} .figure__num`, 'color', 'var(--accent-deep)']]],
      [READ, GAME_SEC.flatMap((s) => [`${s}::before`, `${s}::after`]), [['.rec.read-sec:target', 'border-top-color', 'var(--accent-deep)'], ['.jobfit.read-sec:target', 'border-top-color', 'var(--accent-deep)']]],
      [ED, [DATA_FIG, ...DATA_SEC].map((s) => `${s}::before`), [[`${DATA_FIG} .ed-figcap__num`, 'color', 'var(--ed-accent)'], [DATA_FIG, 'border-top-color', 'var(--ed-accent)'], ...DATA_SEC.map((s): [string, string, string] => [s, 'border-top-color', 'var(--ed-accent)'])]],
    ];
    for (const [text, moving, statics] of cases) {
      const { js, os } = reduceRules(text);
      for (const [label, list] of [['data-motion', js], ['media', os]] as const) {
        for (const pe of moving) expect(covers(list, pe.replace(/^:root\[data-variant="data"\] /, ''), 'animation', 'none'), `${label}: ${pe}`).toBe(true);
        for (const [sel, prop, value] of statics) expect(covers(list, sel.replace(/^:root\[data-variant="data"\] /, ''), prop, value), `${label}: ${sel} ${prop}`).toBe(true);
      }
    }
  });

  it('T1: print turns the cue off', () => {
    for (const [text, pes] of [
      [HUD, [`${GAME_FIG}::before`, `${GAME_FIG}::after`]],
      [READ, GAME_SEC.flatMap((s) => [`${s}::before`, `${s}::after`])],
      [ED, [DATA_FIG, ...DATA_SEC].map((s) => `${s}::before`)],
    ] as const) {
      const print = rules(text).filter((r) => r.at.some((a) => /^@media print\b/.test(a)));
      for (const pe of pes) {
        expect(print.some((r) => r.selectors.some((s) => s.endsWith(pe.replace(/^:root\[data-variant="data"\] /, ''))) && /^none\s*!important$/.test(decl(r.body, 'animation') ?? '')), pe).toBe(true);
      }
    }
  });
});
