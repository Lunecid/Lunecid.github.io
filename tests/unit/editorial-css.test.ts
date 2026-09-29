import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseRules, splitSelectors } from '../helpers/css';

const read = (rel: string): string => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const SCOPE = ':root[data-variant="data"]';

describe('src/styles/editorial.css (P2-1, spec §8)', () => {
  const rules = parseRules(read('src/styles/editorial.css'));

  it('scopes every selector to the general version (defence in depth: a data rule must never style a game page)', () => {
    expect(rules.length).toBeGreaterThan(0);
    const unscoped = rules.flatMap((r) => splitSelectors(r.selector)).filter((s) => s !== SCOPE && !s.startsWith(`${SCOPE} `));
    expect(unscoped).toEqual([]);
  });

  it('uses editorial (or paper) tokens only: no colour literal, no HUD, accent, gold or read token', () => {
    const css = read('src/styles/editorial.css').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css.match(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g) ?? []).toEqual([]);
    expect(css.match(/var\(--(hud|accent|gold|read)[a-z0-9-]*\)/g) ?? []).toEqual([]);
  });

  it('defines the editorial building blocks and the [data-serif] face rule', () => {
    const selectors = rules.map((r) => r.selector).join('\n');
    const classes = ['ed-sec', 'ed-list', 'ed-item', 'ed-item__title', 'ed-meta', 'ed-body', 'ed-tag', 'ed-links', 'ed-link', 'ed-btn', 'ed-btn--fill', 'ed-figure', 'ed-figcap', 'ed-figcap__num', 'ed-table', 'ed-prose'];
    for (const c of classes) expect(selectors, `.${c}`).toMatch(new RegExp(`\\.${c}(?![\\w-])`));
    const serif = rules.find((r) => r.selector === `${SCOPE} [data-serif]`);
    expect(serif?.decls.get('font-family')).toBe('var(--font-ed-head)');
    expect(serif?.decls.get('font-weight')).toBe('700');
  });

  it('gives the case-study body (article.ed-prose) a complete Markdown typography of its own; wide tables and code scroll in their own box (no read.css on general pages from Task 9)', () => {
    const selectors = rules.flatMap((r) => splitSelectors(r.selector));
    const BODY = `${SCOPE} article.ed-prose`;
    for (const el of ['h2', 'h3', 'ul', 'ol', 'li + li', 'li::marker', 'strong', 'blockquote', 'code', 'pre', 'pre code', '.prose-table', 'table', 'th', 'td', 'thead th', 'figcaption', 'hr', '.footnote', '.footnotes', '[data-footnotes]']) {
      expect(selectors, el).toContain(`${BODY} ${el}`);
    }
    const decl = (selector: string, prop: string): string | undefined =>
      rules.find((r) => splitSelectors(r.selector).includes(selector))?.decls.get(prop);
    expect(decl(`${BODY} .prose-table`, 'overflow-x')).toBe('auto');
    expect(decl(`${BODY} .prose-table`, 'max-width')).toBe('100%');
    expect(decl(`${BODY} pre`, 'overflow-x')).toBe('auto');
    expect(decl(`${SCOPE} .ed-prose a:not(.ed-btn)`, 'text-decoration')).toBe('underline');
  });

  it('is imported by DataLayout only, and DataLayout imports neither hud.css nor read.css', () => {
    const data = read('src/layouts/DataLayout.astro');
    expect(data).toMatch(/import '\.\.\/styles\/editorial\.css';/);
    expect(data).not.toMatch(/styles\/(hud|read)\.css/);
    for (const f of ['BaseLayout', 'NeutralLayout']) expect(read(`src/layouts/${f}.astro`), f).not.toContain('editorial.css');
  });
});
