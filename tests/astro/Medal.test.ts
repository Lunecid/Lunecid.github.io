import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import Medal from '../../src/components/player-log/Medal.astro';
import { MEDAL_EMBLEMS, MEDAL_QUESTION, MEDAL_STATES } from '../../src/lib/medals';
import { contrast, parseRules, splitSelectors } from '../helpers/css';
import { readSource, renderAstro } from './helpers';

// jsdom ships no type declarations; the node project only needs its parser here.
const { JSDOM } = createRequire(import.meta.url)('jsdom') as { JSDOM: new (html: string) => { window: { document: Document } } };

const SIZES = ['list', 'meter', 'record'] as const;
const render = (props: { id: string; state: string; size: string }) => renderAstro(Medal, { props });
const parse = async (props: { id: string; state: string; size: string }) => new JSDOM(await render(props)).window.document;
/** The medal's own classes (whatever scoping Astro adds). */
const medalClasses = (el: Element | null | undefined) => [...(el?.classList ?? [])].filter((c) => c.startsWith('medal'));

/** The component's <style>, comments removed. */
const css = (/<style>([\s\S]*?)<\/style>/.exec(readSource('src/components/player-log/Medal.astro'))?.[1] ?? '').replace(/\/\*[\s\S]*?\*\//g, '');
const rules = parseRules(css);
/** Declarations of the rule that lists this selector, at the top level (media null) or inside that @media. */
const decls = (selector: string, media: string | null = null) =>
  rules.find((r) => r.media === media && splitSelectors(r.selector).includes(selector))?.decls;
/** The stops of @keyframes name with their declarations. */
function keyframeStops(name: string): { stop: string; decls: Record<string, string> }[] {
  const open = css.indexOf('{', css.indexOf(`@keyframes ${name} `));
  expect(css.indexOf(`@keyframes ${name} `), `@keyframes ${name}`).toBeGreaterThanOrEqual(0);
  let depth = 0;
  let end = open;
  for (; end < css.length; end++) {
    if (css[end] === '{') depth++;
    if (css[end] === '}' && --depth === 0) break;
  }
  return [...css.slice(open + 1, end).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, stop, body]) => ({
    stop: stop!.trim(),
    decls: Object.fromEntries(body!.split(';').map((d) => d.split(':').map((s) => s.trim().replace(/\s+/g, ' '))).filter(([p, v]) => p && v)),
  }));
}
const tokens = parseRules(readSource('src/styles/tokens.css')).find((r) => r.selector === ':root' && r.media === null)!.decls;

describe('Medal.astro', () => {
  it('an aria-hidden, unfocusable svg with base, emblem and question layers; the state in data-state', async () => {
    for (const state of MEDAL_STATES) {
      for (const size of SIZES) {
        const doc = await parse({ id: 'konami', state, size });
        const medal = doc.querySelector('span.medal');
        const at = `${state} ${size}`;
        expect(medalClasses(medal), at).toEqual(['medal', `medal--${size}`]);
        expect(medal?.getAttribute('data-medal'), at).toBe('konami');
        expect(medal?.getAttribute('data-state'), at).toBe(state);
        expect(medal?.getAttribute('aria-hidden'), at).toBe('true');
        // the server never pops: a page load does not celebrate (the client sets data-pop on a live unlock)
        expect(medal?.hasAttribute('data-pop'), at).toBe(false);
        const svg = medal?.querySelector(':scope > svg');
        expect(svg?.getAttribute('viewBox'), at).toBe('0 0 32 32');
        expect(svg?.getAttribute('focusable'), at).toBe('false');
        // paint order: the base (ribbon, disc, rim), then the emblem, then the "?" on top
        expect([...(svg?.children ?? [])].map((el) => medalClasses(el)), at).toEqual([['medal__base'], ['medal__emblem'], ['medal__q']]);
        expect([...(svg?.querySelectorAll('.medal__base > path') ?? [])].map((el) => medalClasses(el)), at).toEqual([['medal__ribbon'], ['medal__disc'], ['medal__rim']]);
        expect(svg?.querySelector('.medal__emblem')?.getAttribute('d'), at).toBe(MEDAL_EMBLEMS.konami);
        expect(svg?.querySelector('.medal__q')?.getAttribute('d'), at).toBe(MEDAL_QUESTION);
        // nothing to read or reach: no text, no title, no focus target
        expect(medal?.textContent?.trim(), at).toBe('');
        expect(medal?.querySelector('title, desc, text, a, button, [tabindex]'), at).toBeNull();
        expect(medal?.hasAttribute('tabindex'), at).toBe(false);
      }
    }
    // every emblem renders under its own id; an unknown id fails the build rather than drawing an empty medal
    for (const [id, d] of Object.entries(MEDAL_EMBLEMS)) {
      expect((await parse({ id, state: 'unlocked', size: 'list' })).querySelector('.medal__emblem')?.getAttribute('d'), id).toBe(d);
    }
    await expect(render({ id: 'no-such-achievement', state: 'locked', size: 'list' })).rejects.toThrow(/no emblem/);
  });

  it('no fill, stroke or colour literal in the markup; colours come from tokens through classes', async () => {
    for (const state of MEDAL_STATES) {
      const html = await render({ id: 'certificate-checked', state, size: 'list' });
      expect(html, state).toContain('medal__emblem');
      expect(html, state).not.toMatch(/\s(?:fill|stroke|color|style)[\w-]*=/i);
      expect(html, state).not.toMatch(/#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\(/i);
    }
    // the stylesheet: no colour literal; every paint is a token, currentColor, none or the forced-colours system colour
    expect(css.match(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g) ?? []).toEqual([]);
    const paints = rules.flatMap((r) => [...r.decls].filter(([p]) => ['fill', 'stroke', 'color'].includes(p)).map(([p, v]) => ({ at: `${r.media ?? ''} ${r.selector} { ${p}: ${v} }`, selector: r.selector, v })));
    expect(paints.length).toBeGreaterThan(8);
    const ALLOWED = ['none', 'currentColor', 'CanvasText', 'var(--gold)', 'var(--ach-rim)', 'var(--gold-ink)', 'var(--read-line-strong)', 'var(--hud-line)'];
    for (const p of paints) expect(ALLOWED, p.at).toContain(p.v);
    // gold marks an unlocked medal only: every declaration that names a --gold token (fill, stroke, background, shadow, …)
    const gold = rules.flatMap((r) => [...r.decls].filter(([, v]) => /--gold|--ach-rim/.test(v)).map(([p, v]) => ({ at: `${r.media ?? ''} ${r.selector} { ${p}: ${v} }`, selector: r.selector })));
    expect(gold.length).toBeGreaterThanOrEqual(5);
    for (const p of gold) for (const s of splitSelectors(p.selector)) expect(s, p.at).toContain('[data-state="unlocked"]');
    // locked and hidden: outlines in currentColor = --read-line-strong on the light bands (list, records), --hud-line on the dark meter
    expect(decls('.medal path')?.get('fill')).toBe('none');
    expect(decls('.medal path')?.get('stroke')).toBe('currentColor');
    expect(decls('.medal')?.get('color')).toBe('var(--read-line-strong)');
    expect(decls('.medal--meter')?.get('color')).toBe('var(--hud-line)');
    // unlocked: a gold disc in an --ach-rim rim under an --ach-rim ribbon, the emblem in --gold-ink (named change GP-4:
    // --ach-rim = --gold-deep outside game pages; on the game palette a darker cyan, so rim and disc stay apart)
    const unlocked = (part: string) => decls(`.medal[data-state="unlocked"] .medal__${part}`);
    expect(unlocked('disc')?.get('fill')).toBe('var(--gold)');
    expect(unlocked('rim')?.get('fill')).toBe('var(--ach-rim)');
    // the rim stays a ring whichever way its inner octagon is wound
    expect(unlocked('rim')?.get('fill-rule')).toBe('evenodd');
    expect(unlocked('ribbon')?.get('fill')).toBe('var(--ach-rim)');
    expect(unlocked('emblem')?.get('stroke')).toBe('var(--gold-ink)');
    // the rim keeps a gold medal's edge visible on the light band
    expect(contrast(tokens.get('--gold-deep')!, tokens.get('--read-bg')!)).toBeGreaterThanOrEqual(3);
    // GP-4: the rim and ribbon use --ach-rim; the disc --gold
    expect(unlocked('ribbon')?.get('stroke')).toBe('var(--ach-rim)');
    expect(css).not.toMatch(/--gold-deep/);
    // hidden: the "?" and no emblem; every other state the emblem and no "?"
    expect(decls('.medal[data-state="hidden"] .medal__emblem')?.get('display')).toBe('none');
    expect(decls('.medal:not([data-state="hidden"]) .medal__q')?.get('display')).toBe('none');
  });

  it('sizes: the list medal fits the 32px icon track, a record medal is 48px, the meter medal fills its cell', () => {
    expect(decls('.medal--list')?.get('width')).toBe('32px');
    expect(decls('.medal--record')?.get('width')).toBe('48px');
    expect(decls('.medal--meter')?.get('width')).toBe('100%');
  });

  it('the pop runs only under [data-pop]: medal-mint, --dur-medal, --ease-out, transform and opacity only', () => {
    const animated = rules.filter((r) => [...r.decls.keys()].some((p) => p.startsWith('animation')));
    expect(animated.length).toBeGreaterThanOrEqual(4); // the pop, two reduce paths, print
    for (const r of animated) for (const s of splitSelectors(r.selector)) expect(s, `${r.media ?? ''} ${r.selector}`).toContain('[data-pop]');
    expect(decls('.medal[data-pop]')?.get('animation')).toBe('medal-mint var(--dur-medal) var(--ease-out) both');
    const mint = keyframeStops('medal-mint');
    expect(mint.map((f) => f.stop)).toEqual(['from', '60%', 'to']);
    expect(mint.map((f) => f.decls)).toEqual([
      { transform: 'scale(.6) rotate(-12deg)', opacity: '0' },
      { transform: 'scale(1.08)', opacity: '1' },
      { transform: 'none' },
    ]);
    expect(css).not.toMatch(/\binfinite\b|\btransition\b/);
  });

  it('both reduce paths replace the pop with an opacity fade over --dur-fade; print has no animation', () => {
    const FADE = /^medal-fade var\(--dur-fade\) [\w(),.\s-]*both$/;
    expect(decls(':global(:root[data-motion="reduce"]) .medal[data-pop]')?.get('animation')).toMatch(FADE);
    expect(decls('.medal[data-pop]', '@media (prefers-reduced-motion: reduce)')?.get('animation')).toMatch(FADE);
    // the media rule has the pop's specificity, so it comes after it
    expect(css.indexOf('@media (prefers-reduced-motion: reduce)')).toBeGreaterThan(css.indexOf('animation: medal-mint'));
    expect(keyframeStops('medal-fade')).toEqual([{ stop: 'from', decls: { opacity: '0' } }]);
    // !important: the print rule must also beat the more specific :root[data-motion="reduce"] path
    expect(decls('.medal[data-pop]', '@media print')?.get('animation')).toBe('none !important');
  });

  it('forced colors draw the medal in CanvasText', () => {
    const FORCED = '@media (forced-colors: active)';
    for (const part of ['.medal[data-state] .medal__base path', '.medal[data-state] .medal__emblem', '.medal[data-state] .medal__q']) {
      expect(decls(part, FORCED)?.get('stroke'), part).toBe('CanvasText');
      expect(decls(part, FORCED)?.get('fill'), part).toBe('none');
    }
    // after the state rules, with at least their specificity: an unlocked medal drops its gold too
    expect(css.indexOf(FORCED)).toBeGreaterThan(css.lastIndexOf('[data-state="unlocked"]'));
  });
});
