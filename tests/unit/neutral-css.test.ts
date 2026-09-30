import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseRules, splitSelectors } from '../helpers/css';

const css = readFileSync(new URL('../../src/styles/neutral.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

describe('src/styles/neutral.css (P2-11)', () => {
  it('defines the neutral blocks, scoped to neutral pages', () => {
    const selectors = parseRules(css).flatMap((r) => splitSelectors(r.selector));
    for (const c of ['nt-sec', 'nt-panel', 'nt-prose']) expect(selectors.join('\n'), c).toMatch(new RegExp(`:root\\[data-variant="neutral"\\] \\.${c}(?![\\w-])`));
  });
  it('uses tokens only: no colour literal and no HUD, accent, gold or read token', () => {
    const body = css.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(body.match(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g) ?? []).toEqual([]);
    expect(body.match(/var\(--(hud|accent|gold|read)[a-z0-9-]*\)/g) ?? []).toEqual([]);
  });
});
