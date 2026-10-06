// The growth infographic's sheets: scoped to their version, tokens only, hover in @media (hover: hover), the draw-on's
// hidden state undone by both reduce paths and print, imported by their version's external sheet only.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(rel, 'utf8').replace(/\r\n/g, '\n');
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Every selector of every rule (at-rule preludes excluded; commas inside :is() stay). */
function selectors(css: string): string[] {
  const out: string[] = [];
  const re = /([^{};]+)\{/g;
  for (const m of strip(css).matchAll(re)) {
    const prelude = (m[1] ?? '').trim();
    if (prelude.startsWith('@')) continue;
    let depth = 0;
    let cur = '';
    for (const ch of prelude) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) {
        out.push(cur.trim());
        cur = '';
      } else cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
  }
  return out;
}

const SHEETS = [
  { file: 'src/styles/growth-game.css', scope: ':root[data-variant="game"]', host: 'src/styles/game.css', wait: [/\.gq-q\.gr-wait/, /\.gq-node\.gr-wait \.gq-node__pop/, /line\.gr-wait/] },
  { file: 'src/styles/growth-data.css', scope: ':root[data-variant="data"]', host: 'src/styles/data-site.css', wait: [/\.gd-line\.gr-wait/, /\.gd-mk\.gr-wait/, /\.gd-dot\.gr-wait/, /\.gd-smc\.gr-wait/] },
] as const;

describe('growth infographic sheets (GR-2, GR-3)', () => {
  for (const sheet of SHEETS) {
    const css = read(sheet.file);
    const body = strip(css);

    it(`${sheet.file}: every selector starts with ${sheet.scope}; no colour literal; imported by ${sheet.host} only`, () => {
      const bad = selectors(css).filter((s) => !s.startsWith(sheet.scope) && !/^(from|to|\d+%)$/.test(s));
      expect(bad).toEqual([]);
      expect(body.match(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g) ?? []).toEqual([]);
      const name = sheet.file.split('/').pop()!;
      expect(read(sheet.host)).toContain(`@import './${name}';`);
      for (const other of ['src/styles/tokens.css', 'src/styles/base.css', 'src/styles/hud.css', 'src/styles/read.css']) expect(read(other)).not.toContain(name);
    });

    it(`${sheet.file}: :hover only inside @media (hover: hover), each with an :active twin`, () => {
      const outside = body.replace(/@media \(hover: hover\) \{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
      expect(outside).not.toMatch(/:hover/);
      expect(body).toMatch(/:active/);
    });

    it(`${sheet.file}: the hidden draw-on state is undone under data-motion="reduce", prefers-reduced-motion and print`, () => {
      const reduceAttr = /\[data-motion="reduce"\][^{]*\{[^}]*opacity: 1; transform: none; transition: none;/;
      expect(body).toMatch(reduceAttr);
      for (const media of ['@media (prefers-reduced-motion: reduce)', '@media print']) {
        const at = body.indexOf(media);
        expect(at, media).toBeGreaterThan(-1);
        const block = body.slice(at, body.indexOf('}\n}', at) + 3);
        for (const w of sheet.wait) expect(block, `${media} ${w}`).toMatch(w);
        expect(block).toMatch(/opacity: 1; transform: none; transition: none;/);
      }
      // the hidden state animates transform and opacity only, with --dur-* tokens
      for (const m of body.matchAll(/transition: ([^;]+);/g)) {
        for (const part of (m[1] ?? '').split(',')) expect(part.trim(), part).toMatch(/^none$|^(opacity|transform|background-color) var\(--dur-[a-z-]+\)/);
      }
    });
  }
});
