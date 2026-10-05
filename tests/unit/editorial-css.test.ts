import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseRules, splitSelectors } from '../helpers/css';

const read = (rel: string): string => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const SCOPE = ':root[data-variant="data"]';

describe('src/styles/editorial.css (P2-1, spec §8)', () => {
  const rules = parseRules(read('src/styles/editorial.css'));

  it('scopes every selector to the general version (defence in depth: a data rule must never style a game page)', () => {
    expect(rules.length).toBeGreaterThan(0);
    // DS-3: the scope may be compounded on the root itself (html.js, the page's motion setting) — still the general version only
    const unscoped = rules
      .flatMap((r) => splitSelectors(r.selector))
      .filter((s) => s !== SCOPE && !s.startsWith(`${SCOPE} `) && !/^:root\[data-variant="data"\](\.js|\[data-motion="reduce"\]) /.test(s));
    expect(unscoped).toEqual([]);
  });

  it('uses editorial (or paper) tokens only: no colour literal, no HUD, accent, gold or read token; DS-2: the paint tokens of paint.css (--tex-*, --ed-paint-*, --ed-rag*) are allowed', () => {
    const css = read('src/styles/editorial.css').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css.match(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g) ?? []).toEqual([]);
    expect(css.match(/var\(--(hud|accent|gold|read)[a-z0-9-]*\)/g) ?? []).toEqual([]);
    const vars = [...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]!);
    const allowed = /^--(ed-|font-|fs-|lh-|dur-|ease-|nav-h$|tap$|measure$|section-pad-y$|gutter$|container|paper-|tex-[rby][hv]$|scrim$)/;
    expect(vars.filter((v) => !allowed.test(v))).toEqual([]);
    // DS-2: links and focus rings take the link tokens on data pages; --ed-accent stays the neutral pages' navy
    expect(css.match(/var\(--ed-accent\)/g) ?? []).toEqual([]);
  });

  // Named change (DS-8): no data markup carries data-serif any more, so the transitional [data-serif] rule is gone.
  it('defines the editorial building blocks; DS-8: no [data-serif] rule is left (the attribute is gone from data markup)', () => {
    const selectors = rules.map((r) => r.selector).join('\n');
    const classes = ['ed-sec', 'ed-list', 'ed-item', 'ed-item__title', 'ed-meta', 'ed-body', 'ed-tag', 'ed-links', 'ed-link', 'ed-btn', 'ed-btn--fill', 'ed-figure', 'ed-figcap', 'ed-figcap__num', 'ed-table', 'ed-prose'];
    for (const c of classes) expect(selectors, `.${c}`).toMatch(new RegExp(`\\.${c}(?![\\w-])`));
    expect(selectors).not.toContain('[data-serif]');
    // DS-8: the research index's plain interest cards and 진행 중 bands (the band's label sits on the yellow paint)
    for (const c of ['ed-icards', 'ed-icard', 'ed-icard__n', 'ed-nows', 'ed-now--row']) expect(selectors, `.${c}`).toMatch(new RegExp(`\\.${c}(?![\\w-])`));
  });

  it('DS-3: the v5 frame — grid, rail and chip, page head, folio, paint marks, display face, one-time reveal with both reduce paths and print', () => {
    const selectors = rules.flatMap((r) => splitSelectors(r.selector));
    for (const c of ['ed-g', 'ed-rail', 'ed-rail__in', 'ed-rail__n', 'ed-chip', 'ed-sh', 'ed-phead', 'ed-tblock', 'ed-display', 'ed-folio', 'ed-folio__n', 'ed-mc', 'ed-mc--aline', 'ed-mc--fmark', 'ed-mc--hero', 'ed-mc--photo', 'ed-mc--cv', 'ed-mc--mosaic']) {
      expect(selectors.join('\n'), `.${c}`).toMatch(new RegExp(`\\.${c}(?![\\w-])`));
    }
    // the cascade's answer: the last rule (in source order) for the selector that sets the property
    const decl = (selector: string, prop: string, media: string | null = null): string | undefined =>
      rules.filter((r) => r.media === media && splitSelectors(r.selector).includes(selector) && r.decls.has(prop)).at(-1)?.decls.get(prop);
    expect(decl(`${SCOPE} [data-display]`, 'font-family')).toBe('var(--font-ed-display)');
    expect(decl(`${SCOPE} .ed-rail__n::before`, 'content')).toBe('counter(ed-sec, decimal-leading-zero) / ""');
    expect(decl(`${SCOPE} .ed-folio__n::before`, 'content')).toBe('"- " counter(ed-folio) " -" / ""');
    // reveal: transform/opacity only, durations from tokens, both reduce paths drop the transform, print shows all
    const waiting = rules.filter((r) => r.selector.includes('is-waiting')).flatMap((r) => [...r.decls.keys()]);
    expect([...new Set(waiting)].sort()).toEqual(['opacity', 'transform']);
    expect(rules.some((r) => r.selector.includes('.ed-sh.is-in') && r.decls.get('transition') === 'transform var(--dur-rise) var(--ease-out), opacity var(--dur-fade) linear')).toBe(true);
    const reduceJs = rules.filter((r) => r.media === null && r.selector.includes('[data-motion="reduce"]'));
    const reduceOs = rules.filter((r) => r.media === '@media (prefers-reduced-motion: reduce)' && r.selector.includes('.ed-sh'));
    for (const set of [reduceJs, reduceOs]) expect(set.some((r) => r.decls.get('transform') === 'none !important' && r.selector.includes('.ed-stamp'))).toBe(true);
    expect(rules.some((r) => r.media === '@media print' && r.selector.includes('.ed-sh') && r.decls.get('opacity') === '1 !important')).toBe(true);
    expect(rules.some((r) => r.media === '@media print' && r.selector.includes('.ed-folio') && r.decls.get('display') === 'none !important')).toBe(true);
    // links: v5.1 ink with the underline tokens; the stroke is paint
    expect(decl(`${SCOPE} .ed-link`, 'color')).toBe('var(--ed-link)');
    expect(decl(`${SCOPE} .ed-link`, 'text-underline-offset')).toBe('var(--ed-ul-off)');
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
    // Named change (data CSS external): DataLayout links data-site.css (?url), which bundles editorial.css + paint.css.
    expect(data).toMatch(/import dataSiteCss from '\.\.\/styles\/data-site\.css\?url';/);
    expect(data).toMatch(/<link rel="stylesheet" href=\{dataSiteCss\} \/>/);
    expect(read('src/styles/data-site.css')).toMatch(/@import '\.\/editorial\.css';/);
    expect(data).not.toMatch(/styles\/(hud|read)\.css/);
    for (const f of ['BaseLayout', 'NeutralLayout']) {
      expect(read(`src/layouts/${f}.astro`), f).not.toContain('editorial.css');
      expect(read(`src/layouts/${f}.astro`), f).not.toContain('data-site.css');
    }
  });

  it('re-colours the plain research components on general pages (P2-5)', () => {
    const selectors = rules.flatMap((r) => splitSelectors(r.selector));
    for (const s of [
      `${SCOPE} .paper[data-paper] a`,
      `${SCOPE} .paper[data-paper] :focus-visible`,
      `${SCOPE} .pub__btn:hover`,
      `${SCOPE} .pub__btn[aria-expanded="true"]`,
      `${SCOPE} .bib__copy:hover`,
      `${SCOPE} .ed-figure img`,
    ]) expect(selectors, s).toContain(s);
  });

  it('figures (P2-5, P-06 F-065): the image has no frame (read.css frames .prose figure img until Task 9) and a cited figure lands below the nav', () => {
    const decls = (selector: string) => rules.filter((r) => splitSelectors(r.selector).includes(selector)).map((r) => r.decls);
    expect(decls(`${SCOPE} .ed-figure img`).map((d) => d.get('border'))).toContain('0');
    expect(decls(`${SCOPE} .ed-figure`).map((d) => d.get('scroll-margin-top'))).toContain('calc(var(--nav-h) + 16px)');
    const hover = rules.filter((r) => r.media === '@media (hover: hover)').flatMap((r) => splitSelectors(r.selector));
    expect(hover, 'colour hovers only on hover-capable pointers (N13)').toEqual(expect.arrayContaining([`${SCOPE} .pub__btn:hover`, `${SCOPE} .bib__copy:hover`]));
  });

  it('every hover sits inside @media (hover: hover) and has a matching :active press state (N13, Global Constraints)', () => {
    const hover = rules.filter((r) => r.media === '@media (hover: hover)').flatMap((r) => splitSelectors(r.selector));
    const outside = rules.filter((r) => r.media === null).flatMap((r) => splitSelectors(r.selector));
    expect(outside.filter((s) => s.includes(':hover'))).toEqual([]);
    for (const s of hover.filter((h) => h.endsWith(':hover'))) expect(outside, s).toContain(s.replace(/:hover$/, ':active'));
  });

  it('re-colours the tag filter and the image viewer on general pages (P2-6)', () => {
    const selectors = rules.flatMap((r) => splitSelectors(r.selector));
    for (const s of [
      `${SCOPE} .tag-filter__btn`,
      `${SCOPE} .tag-filter__btn[aria-pressed="true"]`,
      `${SCOPE} .image-viewer__cap`,
      `${SCOPE} .image-viewer__close`,
      `${SCOPE} .image-viewer__close:focus-visible`,
      `${SCOPE} .image-viewer__strip`,
      `${SCOPE} .image-viewer__nav`,
      `${SCOPE} .image-viewer__counter`,
      `${SCOPE} .image-viewer__corner`,
    ]) expect(selectors, s).toContain(s);
  });
});
