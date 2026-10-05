import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HUD_LABEL_LIME, NAV_HEIGHT_PX } from '../../src/config';
import { contrast, parseRules as parseCss, splitSelectors } from '../helpers/css';

type Rule = { media: string | null; selector: string; decls: Map<string, string> };

const read = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const squash = (v: string | undefined) => (v ?? '').replace(/\s+/g, '');

/** Top-level and @media rules of a stylesheet with their declarations (last declaration wins). */
function parseRules(css: string): Rule[] {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: Rule[] = [];
  const walk = (text: string, media: string | null) => {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf('{', i);
      if (open < 0) break;
      const prelude = text.slice(i, open).trim();
      let depth = 1;
      let j = open + 1;
      for (; j < text.length && depth > 0; j++) {
        if (text[j] === '{') depth++;
        if (text[j] === '}') depth--;
      }
      const body = text.slice(open + 1, j - 1);
      if (prelude.startsWith('@media')) walk(body, prelude.replace(/\s+/g, ' '));
      else {
        const decls = new Map<string, string>();
        for (const part of body.split(';')) {
          const k = part.indexOf(':');
          if (k > 0 && !part.includes('{')) decls.set(part.slice(0, k).trim(), part.slice(k + 1).trim());
        }
        rules.push({ media, selector: prelude.replace(/\s+/g, ' '), decls });
      }
      i = j;
    }
  };
  walk(src, null);
  return rules;
}

function rootDecls(media: string | null): Map<string, string> {
  const rule = parseRules(read('src/styles/tokens.css')).find((r) => r.selector === ':root' && r.media === media);
  expect(rule, `:root block for ${media ?? 'base'}`).toBeDefined();
  return rule!.decls;
}

const BASE = null;
const TABLET = '@media (min-width: 734px)';
const DESKTOP = '@media (min-width: 1068px)';

describe('design tokens (src/styles/tokens.css)', () => {
  it('spec §4 colour tokens are exact', () => {
    const d = rootDecls(BASE);
    const spec: Record<string, string> = {
      '--hud-bg': '#0B0D11',
      '--hud-panel': '#15181F',
      '--hud-text': '#E8EAED',
      '--hud-muted': '#8B93A1',
      '--accent': '#C8F03C',
      '--accent-ink': '#0B0D11',
      '--accent-deep': '#4F6B00',
      '--gold': '#F5B301',
      '--read-bg': '#F4F5F7',
      '--read-card': '#FFFFFF',
      '--read-text': '#1D1D1F',
      '--read-muted': '#6E6E73',
      '--grid-line': 'rgba(255,255,255,.035)',
    };
    expect(Object.keys(spec)).toHaveLength(13);
    for (const [name, value] of Object.entries(spec)) expect(squash(d.get(name)), name).toBe(value);
  });

  it('hud-label follows HUD_LABEL_LIME (preflight Q13; default muted)', () => {
    const d = rootDecls(BASE);
    expect(d.get('--hud-label')).toBe(HUD_LABEL_LIME ? 'var(--accent)' : 'var(--hud-muted)');
    expect(d.get('--read-label')).toBe(HUD_LABEL_LIME ? 'var(--accent-deep)' : 'var(--read-muted)');
  });

  it('character tints are only the three rgba values', () => {
    const tints = parseRules(read('src/styles/tokens.css'))
      .flatMap((r) => [...r.decls])
      .filter(([k]) => k.startsWith('--tint-'))
      .map(([k, v]) => [k, squash(v)]);
    expect(Object.fromEntries(tints)).toEqual({
      '--tint-remielle': 'rgba(255,79,139,.18)',
      '--tint-eula': 'rgba(80,160,255,.16)',
      '--tint-mona': 'rgba(122,108,240,.16)',
    });
    expect(tints).toHaveLength(3);
  });

  it('AL-9: the two account tints exist with alpha .16–.18 and are never a text colour', () => {
    const decls = rootDecls(BASE);
    const expected: Record<string, string> = { '--acct-tint-steam': 'rgba(139,147,161,.16)', '--acct-tint-riot': 'rgba(232,234,237,.16)' };
    for (const [name, value] of Object.entries(expected)) {
      expect(squash(decls.get(name)), name).toBe(value);
      const alpha = Number(/,([\d.]+)\)$/.exec(value)?.[1]);
      expect(alpha, name).toBeGreaterThanOrEqual(0.16);
      expect(alpha, name).toBeLessThanOrEqual(0.18);
    }
    const files = readdirSync(new URL('../../src/', import.meta.url), { recursive: true, encoding: 'utf8' }).filter((f) => /\.(css|astro|tsx)$/.test(f));
    expect(files.length).toBeGreaterThan(20);
    const asText = /(?<![-\w])color\s*:[^;}]*--acct-tint/;
    for (const f of files) expect(asText.test(read(`src/${f.replace(/\\/g, '/')}`)), f).toBe(false);
    expect(asText.test('.x{color: var(--acct-tint)}')).toBe(true);
    expect(asText.test('.x{background-color: var(--acct-tint)}')).toBe(false);
  });

  it('type scale per breakpoint', () => {
    const scale: Record<string, [string, string, string]> = {
      // G-015 (P-11): rem at the same default sizes (40/60/76, 32/48/56, 26/28/32, 19/21/24px at a 16px root).
      '--fs-name': ['2.5rem', '3.75rem', '4.75rem'],
      '--fs-display': ['2rem', '3rem', '3.5rem'],
      '--fs-h2': ['1.625rem', '1.75rem', '2rem'],
      '--fs-sub': ['1.1875rem', '1.3125rem', '1.5rem'],
    };
    const [base, tablet, desktop] = [rootDecls(BASE), rootDecls(TABLET), rootDecls(DESKTOP)];
    for (const [name, [b, t, dk]] of Object.entries(scale)) {
      expect([base.get(name), tablet.get(name), desktop.get(name)], name).toEqual([b, t, dk]);
    }
    expect(base.get('--fs-body')).toBe('1.0625rem');
    expect(tablet.has('--fs-body') || desktop.has('--fs-body')).toBe(false);
    expect(base.get('--lh-body')).toBe('1.7');
    const en = parseRules(read('src/styles/tokens.css')).find((r) => r.selector === ':lang(en)');
    expect(en?.decls.get('--lh-body')).toBe('1.47');
    expect(en?.decls.get('--lh-display')).toBe('1.07');
    // P2-37: reading measure ≈38 Korean characters, 36em ≈ 66 characters on English pages.
    expect(base.get('--measure')).toBe('38em');
    expect(en?.decls.get('--measure')).toBe('36em');
  });

  it('D-2 XL steps: the HUD container is 1360px from 1600px and 1440px from 1800px; type and gutters step up; --container stays', () => {
    expect(rootDecls(BASE).get('--container-hud')).toBe('var(--container)');
    // px lengths as they are; rem type tokens at the 16px default (G-015)
    const px = (v: string | undefined): number => {
      const m = /^(\d*\.?\d+)(px|rem)$/.exec(v ?? '');
      return m ? Number(m[1]) * (m[2] === 'rem' ? 16 : 1) : NaN;
    };
    const desktop = rootDecls(DESKTOP);
    const large = rootDecls('@media (min-width: 1600px)');
    const xl = rootDecls('@media (min-width: 1800px)');
    expect(large.get('--container-hud')).toBe('1360px');
    expect(xl.get('--container-hud')).toBe('1440px');
    // --container stays the 1180px base; every band's .container follows --container-hud (base.css, batch 5 item
    // 11); prose keeps its em measure (--measure), untouched by the steps.
    expect(large.has('--container') || xl.has('--container')).toBe(false);
    expect(large.has('--measure') || xl.has('--measure')).toBe(false);
    for (const name of ['--gutter', '--fs-name', '--fs-display', '--fs-h2', '--fs-sub']) {
      expect(px(large.get(name)), `${name} at 1600px`).toBeGreaterThan(px(desktop.get(name)));
      expect(px(xl.get(name)), `${name} at 1800px`).toBeGreaterThanOrEqual(px(large.get(name)));
    }
    expect(px(xl.get('--fs-name'))).toBeLessThanOrEqual(92); // "slightly": name ~88–92px, h2 ~36px
    expect(px(xl.get('--fs-h2'))).toBeLessThanOrEqual(36);
    expect(large.has('--fs-body') || xl.has('--fs-body')).toBe(false);
  });

  it('--fs-label and --fs-caption are 13–14px and --fs-min is 12px', () => {
    const d = rootDecls(BASE);
    for (const name of ['--fs-label', '--fs-caption']) {
      const px = Number(/^(\d*\.?\d+)rem$/.exec(d.get(name) ?? '')?.[1]) * 16;
      expect(px >= 13 && px <= 14, `${name} = ${d.get(name)}`).toBe(true);
    }
    expect(d.get('--fs-min')).toBe('.75rem');
  });

  it('G-015 / F-030 (P-11): every type token is rem at its 16px-default size in every breakpoint step; layout stays px', () => {
    const all = parseRules(read('src/styles/tokens.css')).flatMap((r) => [...r.decls].map(([k, v]) => ({ media: r.media, k, v })));
    const fs = all.filter((d) => d.k.startsWith('--fs-'));
    expect(fs.length).toBeGreaterThanOrEqual(10 + 4 * 4);
    for (const d of fs) expect(d.v, `${d.k} ${d.media ?? 'base'}`).toMatch(/^\d*\.?\d+rem$/);
    const base = rootDecls(BASE);
    const at16 = (name: string) => Number(/^(\d*\.?\d+)rem$/.exec(base.get(name) ?? '')?.[1]) * 16;
    expect(['--fs-name', '--fs-display', '--fs-h2', '--fs-sub', '--fs-body', '--fs-small', '--fs-meta', '--fs-caption', '--fs-label', '--fs-min'].map(at16))
      .toEqual([40, 32, 26, 19, 17, 15, 14, 13, 13, 12]);
    expect(base.get('--fs-meta')).toBe('.875rem');
    for (const name of ['--gutter', '--container', '--nav-h', '--section-pad-y', '--tap', '--bracket']) expect(base.get(name), name).toMatch(/^\d+px$/);
    // F-082 (owner decision 15 (a)): 38em stays; the comment states what it measures.
    expect(read('src/styles/tokens.css')).toContain('38em ≈ 46–55 Korean characters at 17px');
  });

  it('F-068 (P-11): panel and toast motion tokens; the panel closes faster than it opens', () => {
    const d = rootDecls(BASE);
    expect(d.get('--dur-panel-in')).toBe('.3s');
    expect(d.get('--dur-panel-out')).toBe('.18s');
    expect(parseFloat(d.get('--dur-panel-out')!)).toBeLessThan(parseFloat(d.get('--dur-panel-in')!));
    expect(d.get('--dur-toast-in')).toBe('.3s');
    expect(d.get('--dur-toast-out')).toBe('.2s');
  });

  it('PL-1: --dur-medal is at most .4s', () => {
    const d = rootDecls(BASE);
    expect(d.get('--dur-medal')).toBe('.36s');
    expect(parseFloat(d.get('--dur-medal')!)).toBeLessThanOrEqual(0.4);
  });

  it('MO-1 (audit Z1, V1, V3, R1): motion tokens for transitions, morph, reflow, menu, lift and reduced exits', () => {
    const d = rootDecls(BASE);
    const s = (name: string) => parseFloat(d.get(name)!);
    expect(d.get('--dur-nav-out')).toBe('.09s');
    expect(d.get('--dur-nav-in')).toBe('.16s');
    // MO-42 (named): --dur-morph is gone with the chooser morph it timed (the exits replaced it); no rule used it
    expect(d.has('--dur-morph')).toBe(false);
    expect(d.get('--dur-reflow')).toBe('.3s');
    expect(d.get('--dur-menu')).toBe('.15s');
    expect(d.get('--dur-lift')).toBe('.25s');
    expect(d.get('--dur-fade-out')).toBe('.15s');
    // Fade-through: the whole page transition is .25s and the old page leaves in about the first third of it.
    expect(s('--dur-nav-out') + s('--dur-nav-in')).toBeCloseTo(0.25, 10);
    expect(s('--dur-nav-out') / 0.25).toBeGreaterThanOrEqual(0.33);
    expect(s('--dur-nav-out') / 0.25).toBeLessThanOrEqual(0.37);
    expect(s('--dur-fade-out')).toBeLessThan(s('--dur-fade'));
    expect(d.get('--dur-menu')).toBe(d.get('--dur-press'));
    expect(d.get('--dur-lift')).toBe(d.get('--dur-exit'));
  });

  it('F-067 (P-11): the cartridge shell colours are tokens', () => {
    const d = rootDecls(BASE);
    expect(['--cart-shell', '--cart-shell-hover', '--cart-shell-shade', '--cart-shell-grip'].map((n) => d.get(n))).toEqual(['#C9CED6', '#D5D9E0', '#AEB4BE', '#8E949E']);
  });

  it('motion tokens match spec §4', () => {
    const d = rootDecls(BASE);
    expect(squash(d.get('--ease-out'))).toBe('cubic-bezier(.22,1,.36,1)');
    expect(d.get('--dur-enter')).toBe('.6s');
    expect(d.get('--dur-exit')).toBe('.25s');
    expect(d.get('--dur-hover')).toBe('.1s');
    expect(d.get('--dur-press')).toBe('.15s');
    expect(d.get('--dur-fade')).toBe('.2s');
    expect(d.get('--dur-streak')).toBe('.8s');
  });

  it('layout and font tokens: nav height, tap target, container, font stacks', () => {
    const d = rootDecls(BASE);
    expect(d.get('--nav-h')).toBe(`${NAV_HEIGHT_PX}px`);
    expect(d.get('--tap')).toBe('44px');
    expect(d.get('--container')).toBe('1180px');
    // Batch 2: "SB Sans" is the build-time Pretendard subset, renamed ("Pretendard" is an OFL Reserved Font Name).
    expect(d.get('--font-sans')).toMatch(/^"SB Sans",/);
    expect(d.get('--font-sans')).not.toMatch(/Pretendard Variable/);
    expect(d.get('--font-mono')).toMatch(/^"JetBrains Mono Variable",[\s\S]*"SB Sans"/);
    expect(d.get('--font-paper-ko')).toBe('"SB Serif KR", var(--font-paper)');
    expect(d.get('--font-card')).toBe('var(--font-anton, Impact, "Arial Narrow Bold", sans-serif)');
  });

  it('base.css sets keep-all, overflow-wrap anywhere and a scroll-margin under the sticky nav for everything outside it', () => {
    const rules = parseRules(read('src/styles/base.css'));
    const body = rules.find((r) => r.selector === 'body')?.decls;
    expect(body?.get('word-break')).toBe('keep-all');
    expect(body?.get('overflow-wrap')).toBe('anywhere');
    expect(body?.get('letter-spacing')).toBe('0');
    expect(body?.get('font-size')).toBe('var(--fs-body)');
    // Final review fix 1 item 2 (WCAG 2.4.11) + fix round 2: a scroll-margin on everything outside the nav covers anchor
    // jumps AND focus scrolling; no root scroll-padding (it also made focus inside the always-visible nav scroll the page).
    const margins = rules.filter((r) => r.decls.has('scroll-margin-top'));
    expect(margins.map((r) => r.selector.replace(/\s+/g, ' '))).toEqual(['body > :not(.hud-nav), body > :not(.hud-nav) *']);
    expect(margins[0]?.decls.get('scroll-margin-top')).toBe('calc(var(--nav-h) + 16px)');
    expect(rules.some((r) => r.decls.has('scroll-padding-top') || r.decls.has('scroll-padding'))).toBe(false);
    expect(rules.find((r) => r.selector === ':root')?.decls.get('scroll-behavior')).toBe('auto');
    const focus = rules.find((r) => r.selector === ':focus-visible')?.decls;
    expect(focus?.get('outline')).toBe('2px solid var(--accent)');
    expect(focus?.get('outline-offset')).toBe('3px');
    expect(rules.find((r) => r.selector.startsWith('.read :focus-visible'))?.decls.get('outline-color')).toBe('var(--accent-deep)');
  });

  it('every §5.16 global class is defined in src/styles', () => {
    const selectors = ['base', 'hud', 'read'].flatMap((f) => parseRules(read(`src/styles/${f}.css`)).map((r) => r.selector)).join('\n');
    const classes = ['container', 'read', 'sr-only', 'skip-link', 'hit', 'hud-grid', 'cut', 'cut--line', 'bracket', 'bracket--sm', 'btn', 'btn--fill', 'btn--line', 'hud-label', 'hud-label__ko', 'hud-label__en', 'badge', 'badge--tier', 'hud-panel', 'sec', 'sec-more', 'prose', 'read-card', 'read-section', 'tnum',
      // batch 5: the section head (D-8) and the light HUD set (P1-9)
      'hud-label__mark', 'hud-label__sq', 'sec-head', 'sec-head__title', 'read-sec', 'read-column', 'lh-rows', 'lh-row', 'lh-idx', 'lh-table', 'lh-frame', 'lh-chips', 'lh-chip', 'lh-chip--mono', 'lh-tag'];
    for (const c of classes) expect(selectors, `.${c}`).toMatch(new RegExp(`\\.${c}(?![\\w-])`));
  });

  it('base, hud and read use colour tokens only (no colour literals)', () => {
    for (const f of ['base', 'hud', 'read']) {
      const css = read(`src/styles/${f}.css`).replace(/\/\*[\s\S]*?\*\//g, '');
      expect(css.match(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g) ?? [], f).toEqual([]);
    }
  });

  it('P1-10: neutral tokens and the role tokens that switch by <html data-variant>', () => {
    const d = rootDecls(BASE);
    expect(d.get('--nt-bg')).toBe('var(--ed-bg)');
    expect(d.get('--nt-ink')).toBe('var(--ed-ink)');
    expect(d.get('--nt-muted')).toBe('var(--ed-muted)');
    expect(d.get('--nt-rule')).toBe('var(--ed-rule)');
    expect(d.get('--nt-accent')).toBe('var(--ed-accent)');
    expect(d.get('--page-bg')).toBe('var(--hud-bg)');
    expect(d.get('--page-ink')).toBe('var(--hud-text)');
    expect(d.get('--page-muted')).toBe('var(--hud-muted)');
    expect(d.get('--page-focus')).toBe('var(--accent)');
    const neutral = parseRules(read('src/styles/tokens.css')).find((r) => r.selector === ':root[data-variant="neutral"]')?.decls;
    expect(neutral?.get('--page-bg')).toBe('var(--nt-bg)');
    expect(neutral?.get('--page-ink')).toBe('var(--nt-ink)');
    expect(neutral?.get('--page-muted')).toBe('var(--nt-muted)');
    expect(neutral?.get('--page-focus')).toBe('var(--nt-accent)');
    const base = parseRules(read('src/styles/base.css'));
    expect(base.find((r) => r.selector === 'body')?.decls.get('background')).toBe('var(--page-bg)');
    expect(base.find((r) => r.selector === 'body')?.decls.get('color')).toBe('var(--page-ink)');
    // P1-10 adds only the neutral half; P2-2 (with the layout flip) widens both selectors to data + neutral, contract §8.1 F-5.
    // Matching one part of a selector list keeps this test green before and after that widening.
    const ruleWith = (part: string) => base.find((r) => r.selector.split(',').map((s) => s.trim()).includes(part));
    expect(ruleWith(':root[data-variant="neutral"]')?.decls.get('color-scheme')).toBe('light');
    expect(ruleWith(':root[data-variant="neutral"] :focus-visible')?.decls.get('outline-color')).toBe('var(--page-focus)');
    const neutralCss = read('src/styles/neutral.css').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(neutralCss.match(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g) ?? []).toEqual([]);
  });

  it('P1-10: contrast of the neutral pairs (AA for text)', () => {
    const lum = (hex: string) => {
      const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
    };
    const ratio = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
    expect(ratio('#141414', '#FFFFFF')).toBeGreaterThan(18);
    expect(ratio('#6B6B6B', '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(ratio('#1E3A8A', '#FFFFFF')).toBeGreaterThan(10);
  });
});

describe('editorial palette, neutral aliases and role tokens (P2-1, spec §8, contract §4.2)', () => {
  const tokenRules = () => parseCss(read('src/styles/tokens.css'));
  /** Declarations of every top-level rule with exactly this selector, merged in source order. */
  const declsOf = (selector: string): Map<string, string> =>
    new Map(tokenRules().filter((r) => r.selector === selector && r.media === null).flatMap((r) => [...r.decls]));

  it('editorial tokens are exact', () => {
    const d = declsOf(':root');
    const expected: Record<string, string> = {
      '--ed-bg': '#FFFFFF',
      '--ed-ink': '#141414',
      '--ed-muted': '#6B6B6B',
      '--ed-rule': '#E5E5E5',
      '--ed-rule-strong': 'var(--ed-ink)',
      '--ed-accent': '#1E3A8A',
      '--ed-fill': 'var(--ed-ink)',
      '--ed-fill-ink': '#FFFFFF',
      '--ed-rule-w': '1px',
      '--ed-rule-w-strong': '2px',
      '--font-ed-serif': '"Times New Roman", Times, "TeX Gyre Termes", "Nimbus Roman", "Liberation Serif", serif',
      '--font-ed-head': '"Times New Roman", Times, "TeX Gyre Termes", "Nimbus Roman", "Liberation Serif", serif', // MO-29 (named): the unused heading face left the stack
    };
    for (const [name, value] of Object.entries(expected)) expect(d.get(name), name).toBe(value);
  });

  it('DS-1: --font-ed-display = "SB Display", var(--font-sans)', () => {
    const d = declsOf(':root');
    expect(d.get('--font-ed-display')).toBe('"SB Display", var(--font-sans)');
    // Hangul inside a display element falls to SB Sans by the stack, never to a system font
    expect(d.get('--font-sans')).toMatch(/^"SB Sans",/);
  });

  it('DS-2: v5 editorial tokens are exact', () => {
    const d = declsOf(':root');
    const expected: Record<string, string> = {
      '--ed-red': '#CC281C',
      '--ed-blue': '#1F3A93',
      '--ed-yellow': '#F5C400',
      '--ed-black': '#111111',
      '--ed-ink-2': 'var(--paper-muted)',
      '--ed-n-50': '#F6F6F4',
      '--ed-n-100': '#EEEEEB',
      '--ed-line': '#D6D6D1',
      '--ed-perf': 'rgba(20, 20, 20, .38)',
      '--ed-wash': '#F2F1EC',
      '--ed-on-color': '#FFFFFF',
      // v5.1 (final, owner 2026-10-05): museum-style ink links; colour belongs to the paint
      '--ed-link': 'var(--ed-ink)',
      '--ed-link-line': 'var(--ed-ink)',
      '--ed-link-hover': 'var(--ed-ink)',
      '--ed-focus': 'var(--ed-ink)',
      '--ed-ul': '1px',
      '--ed-ul-on': '2px',
      '--ed-ul-off': '.16em',
      '--ed-rw': '5px',
    };
    for (const [name, value] of Object.entries(expected)) expect(d.get(name), name).toBe(value);
    expect(d.get('--paper-muted')).toBe('#4A4A4A');
    // the neutral pages alias --ed-accent / --ed-muted / --ed-rule: unchanged
    expect([d.get('--ed-accent'), d.get('--ed-muted'), d.get('--ed-rule')]).toEqual(['#1E3A8A', '#6B6B6B', '#E5E5E5']);
    expect([rootDecls(TABLET).get('--ed-rw'), rootDecls(DESKTOP).get('--ed-rw')]).toEqual(['6px', '8px']);
  });

  it('DS-2: WCAG on white: --ed-link ≥ 7, --ed-ink-2 ≥ 7, focus ≥ 3, on-color pairs as listed', () => {
    const d = declsOf(':root');
    const hex = (name: string): string => {
      const v = d.get(name) ?? '';
      const ref = /^var\((--[\w-]+)\)$/.exec(v)?.[1];
      return ref ? hex(ref) : v;
    };
    const [bg, n50, n100, wash] = ['--ed-bg', '--ed-n-50', '--ed-n-100', '--ed-wash'].map(hex);
    for (const ground of [bg, n50, n100, wash]) {
      expect(contrast(hex('--ed-link'), ground!), `link on ${ground}`).toBeGreaterThanOrEqual(7);
      expect(contrast(hex('--ed-link-hover'), ground!), `hover on ${ground}`).toBeGreaterThanOrEqual(7);
      expect(contrast(hex('--ed-focus'), ground!), `focus on ${ground}`).toBeGreaterThanOrEqual(3);
    }
    expect(contrast(hex('--ed-ink-2'), bg!)).toBeGreaterThanOrEqual(7);
    expect(contrast(hex('--ed-ink-2'), n100!)).toBeGreaterThanOrEqual(7);
    expect(contrast(hex('--ed-link'), hex('--ed-yellow'))).toBeGreaterThanOrEqual(7); // ink on the hover stroke
    expect(contrast(hex('--ed-on-color'), hex('--ed-red'))).toBeGreaterThanOrEqual(5.4);
    expect(contrast(hex('--ed-on-color'), hex('--ed-blue'))).toBeGreaterThanOrEqual(10);
    expect(contrast(hex('--ed-on-color'), hex('--ed-black'))).toBeGreaterThanOrEqual(18);
    expect(contrast(hex('--ed-ink'), hex('--ed-yellow'))).toBeGreaterThanOrEqual(11);
  });

  it('DS-2: --fs-ed-* rem steps per breakpoint; --dur-rise .42s, --dur-stamp .22s', () => {
    const steps: Record<string, [string, string, string, string]> = {
      '--fs-ed-display': ['2.25rem', '3.25rem', '4.75rem', '4.75rem'],
      '--fs-ed-h1': ['2.25rem', '2.875rem', '4rem', '4rem'],
      '--fs-ed-h2': ['1.625rem', '2rem', '2.5rem', '2.5rem'],
      '--fs-ed-num': ['1.75rem', '2rem', '2.6875rem', '2.875rem'],
    };
    const [base, tablet, desktop, large] = [rootDecls(BASE), rootDecls(TABLET), rootDecls(DESKTOP), rootDecls('@media (min-width: 1600px)')];
    for (const [name, [b, t, dk, lg]] of Object.entries(steps)) {
      expect([base.get(name), tablet.get(name), desktop.get(name), large.get(name) ?? desktop.get(name)], name).toEqual([b, t, dk, lg]);
    }
    expect(base.get('--dur-rise')).toBe('.42s');
    expect(base.get('--dur-stamp')).toBe('.22s');
    expect(base.get('--dur-stroke')).toBe('.2s');
  });

  it('neutral tokens alias the editorial palette', () => {
    const d = declsOf(':root');
    expect(['--nt-bg', '--nt-ink', '--nt-muted', '--nt-rule', '--nt-accent'].map((n) => d.get(n))).toEqual([
      'var(--ed-bg)', 'var(--ed-ink)', 'var(--ed-muted)', 'var(--ed-rule)', 'var(--ed-accent)',
    ]);
  });

  it('role tokens: one :root block holds them all, the neutral rule switches them, and it sets role tokens only', () => {
    const ROLES = ['--page-bg', '--page-ink', '--page-muted', '--page-focus', '--page-link', '--page-rule', '--page-rule-strong', '--page-fill', '--page-fill-ink'];
    expect(tokenRules().filter((r) => r.selector === ':root' && r.media === null)).toHaveLength(1);
    const expected: Record<string, string[]> = {
      ':root': ['var(--hud-bg)', 'var(--hud-text)', 'var(--hud-muted)', 'var(--accent)', 'var(--accent)', 'var(--hud-divider)', 'var(--hud-line-strong)', 'var(--accent)', 'var(--accent-ink)'],
      ':root[data-variant="neutral"]': ['var(--nt-bg)', 'var(--nt-ink)', 'var(--nt-muted)', 'var(--nt-accent)', 'var(--nt-accent)', 'var(--nt-rule)', 'var(--nt-ink)', 'var(--nt-ink)', 'var(--nt-bg)'],
    };
    for (const [selector, values] of Object.entries(expected)) expect(ROLES.map((r) => declsOf(selector).get(r)), selector).toEqual(values);
    for (const name of declsOf(':root[data-variant="neutral"]').keys()) expect(name, `neutral sets ${name}`).toMatch(/^--page-/);
  });

  it('WCAG contrast on white: ink ≥ 7, secondary ≥ 4.5, accent ≥ 7 (text) and ≥ 3 (focus ring), filled button text ≥ 7', () => {
    const d = declsOf(':root');
    const [bg, ink, muted, accent, fillInk] = ['--ed-bg', '--ed-ink', '--ed-muted', '--ed-accent', '--ed-fill-ink'].map((n) => d.get(n)!);
    expect(contrast(ink!, bg!)).toBeGreaterThanOrEqual(7);
    expect(contrast(muted!, bg!)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(accent!, bg!)).toBeGreaterThanOrEqual(7);
    expect(contrast(accent!, bg!)).toBeGreaterThanOrEqual(3);
    expect(contrast(fillInk!, ink!)).toBeGreaterThanOrEqual(7);
  });

  it('P2-2 / DS-2: the general version\'s role tokens, set only with the layout flip (D-5)', () => {
    const ROLES = ['--page-bg', '--page-ink', '--page-muted', '--page-focus', '--page-link', '--page-rule', '--page-rule-strong', '--page-fill', '--page-fill-ink'];
    const data = declsOf(':root[data-variant="data"]');
    // DS-2 (named change): muted, focus and link follow the v5 tokens (--ed-ink-2, --ed-focus, --ed-link); the rest as P2-2.
    expect(ROLES.map((r) => data.get(r))).toEqual(['var(--ed-bg)', 'var(--ed-ink)', 'var(--ed-ink-2)', 'var(--ed-focus)', 'var(--ed-link)', 'var(--ed-rule)', 'var(--ed-rule-strong)', 'var(--ed-fill)', 'var(--ed-fill-ink)']);
    for (const name of data.keys()) expect(name, `data sets ${name}`).toMatch(/^--page-/);
  });

  it('P2-2: base.css makes the general pages light with the navy focus ring, in the same rules as the neutral pages (contract §8.1 F-5)', () => {
    const base = parseCss(read('src/styles/base.css')).filter((r) => r.media === null);
    const scheme = base.find((r) => splitSelectors(r.selector).includes(':root[data-variant="data"]'));
    expect(splitSelectors(scheme?.selector ?? '')).toEqual([':root[data-variant="data"]', ':root[data-variant="neutral"]']);
    expect(scheme?.decls.get('color-scheme')).toBe('light');
    const focus = base.find((r) => splitSelectors(r.selector).includes(':root[data-variant="data"] :focus-visible'));
    expect(splitSelectors(focus?.selector ?? '')).toEqual([':root[data-variant="data"] :focus-visible', ':root[data-variant="neutral"] :focus-visible']);
    expect(focus?.decls.get('outline-color')).toBe('var(--page-focus)');
  });
});

describe('the chooser desk (MO-23, v6.4)', () => {
  const tokenRules = () => parseCss(read('src/styles/tokens.css'));
  const declsOf = (selector: string): Map<string, string> =>
    new Map(tokenRules().filter((r) => r.selector === selector && r.media === null).flatMap((r) => [...r.decls]));

  it('MO-23: chooser role block uses HUD tokens only; printout tokens exact; text pairs ≥ 4.5 (ink, ink-2, link and stamp on paper; white on the red field; ink on the yellow)', () => {
    const chooser = declsOf(':root[data-variant="neutral"][data-page="chooser"]');
    expect(Object.fromEntries(chooser)).toEqual({
      '--page-bg': 'var(--hud-bg)', '--page-ink': 'var(--hud-text)', '--page-muted': 'var(--hud-muted)', '--page-focus': 'var(--accent)',
      '--page-link': 'var(--accent)', '--page-rule': 'var(--hud-divider)', '--page-rule-strong': 'var(--hud-line-strong)',
      '--page-fill': 'var(--accent)', '--page-fill-ink': 'var(--accent-ink)',
      '--nt-bg': 'var(--hud-bg)', '--nt-ink': 'var(--hud-text)', '--nt-muted': 'var(--hud-muted)', '--nt-rule': 'var(--hud-divider)', '--nt-accent': 'var(--accent)',
    });
    for (const value of chooser.values()) expect(value).toMatch(/^var\(--(hud|accent)[\w-]*\)$/);
    const d = declsOf(':root');
    const printout: Record<string, string> = {
      '--pr-paper': '#FBFAF6', '--pr-ink': 'var(--ed-ink)', '--pr-ink-2': 'var(--paper-muted)', '--pr-stamp': '#8A2416',
      '--pr-plate': 'rgba(20, 20, 20, .075)', '--pr-lit': 'rgba(255, 255, 255, .95)',
      '--pr-red': '#CC281C', '--pr-blue': '#1F3A93', '--pr-yellow': '#F5C400', '--pr-on-color': '#FFFFFF',
      // MO-29 (named change): the stand-ins now point at the general version's type and link tokens
      '--pr-font-text': 'var(--font-sans)', '--pr-font-banner': 'var(--font-chooser-banner)',
      '--pr-link': 'var(--ed-link)', '--pr-link-stroke': 'var(--ed-yellow)', '--pr-focus': 'var(--ed-focus)',
      '--font-cover': '"SB Cover Display", Impact, "Arial Narrow Bold", sans-serif',
      '--dur-stroke': '.2s',
    };
    // the covers' mono stack keeps monospace fallbacks ahead of the proportional sans (no re-wrap when the face swaps in)
    const coverMono = d.get('--font-mono-cover') ?? '';
    expect(coverMono.indexOf('"SB Cover Mono"')).toBe(0);
    expect(coverMono.indexOf('Menlo')).toBeLessThan(coverMono.indexOf('"SB Sans"'));
    expect(coverMono.indexOf('"DejaVu Sans Mono"')).toBeLessThan(coverMono.indexOf('"SB Sans"'));
    for (const [name, value] of Object.entries(printout)) expect(squash(d.get(name)), name).toBe(squash(value));
    const hex = (name: string): string => {
      const v = d.get(name)!;
      const ref = /^var\((--[\w-]+)\)$/.exec(v);
      return ref ? hex(ref[1]!) : v;
    };
    const paper = hex('--pr-paper');
    expect(contrast(hex('--pr-ink'), paper)).toBeGreaterThanOrEqual(7);
    expect(contrast(hex('--pr-ink-2'), paper)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(hex('--pr-link'), paper)).toBeGreaterThanOrEqual(7);
    expect(contrast(hex('--pr-focus'), paper)).toBeGreaterThanOrEqual(3);
    expect(contrast(hex('--pr-stamp'), paper)).toBeGreaterThanOrEqual(7);
    expect(contrast(hex('--pr-on-color'), hex('--pr-red'))).toBeGreaterThanOrEqual(5.3);
    expect(contrast(hex('--pr-ink'), hex('--pr-yellow'))).toBeGreaterThanOrEqual(7);
    // the game cover keeps the HUD pairs: muted labels on the panel, the reversed word in ink on lime
    expect(contrast(hex('--hud-muted'), hex('--hud-panel'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(hex('--hud-bg'), hex('--accent'))).toBeGreaterThanOrEqual(7);
  });

  it('MO-29: the printout uses the general version\'s type and link tokens (display face for the banner, ink link, yellow stroke, ink focus)', () => {
    const d = declsOf(':root');
    // the banner: the display face's chooser subset first, then the general version's display stack (named: the full
    // display face cost the chooser ~75 ms of LCP)
    expect(d.get('--pr-font-banner')).toBe('var(--font-chooser-banner)');
    expect(d.get('--font-chooser-banner')).toBe('"SB Cover Banner", var(--font-ed-display)');
    expect(d.get('--pr-font-text')).toBe('var(--font-sans)');
    expect(d.get('--pr-link')).toBe('var(--ed-link)');
    expect(d.get('--pr-link-stroke')).toBe('var(--ed-yellow)');
    expect(d.get('--pr-focus')).toBe('var(--ed-focus)');
    // the display face is the general version's own token, not a copy
    expect(d.get('--font-ed-display')).toMatch(/^"SB Display"/);
  });

  // MO-33 (chooser v6.11): the game cover in the approved game palette, on the chooser only. The literals sit in one
  // --ch-* group of :root; a screen-only chooser rule re-points the HUD names the cover uses (print keeps the HUD print
  // values); the game and data blocks are untouched (game pages stay lime until the game palette ships).
  const CH: Record<string, string> = {
    '--ch-k0': '#0A0A0B', '--ch-k1': '#141416', '--ch-k2': '#1C1C1F', '--ch-t0': '#F4F4F0', '--ch-t1': '#E6E6E1', '--ch-t2': '#A3A39C',
    '--ch-line': '#707078', '--ch-dash': '#3A3A40', '--ch-divider': '#24242A', '--ch-frame': '#2C2C31', '--ch-panel-92': 'rgba(20, 20, 22, .92)',
    '--ch-y': '#FFE600', '--ch-y-hover': '#FFF06B', '--ch-y-text': '#FFE14A', '--ch-ink': '#0A0A0B',
    '--ch-cy': '#00E5FF', '--ch-cy-dim': 'rgba(0, 229, 255, .42)', '--ch-cy-glow': 'rgba(0, 229, 255, .35)',
    '--ch-neon-glow': 'rgba(230, 230, 225, .5)', '--ch-neon-halo': 'rgba(163, 163, 156, .4)', '--ch-blk-scan': 'rgba(10, 10, 11, .12)',
  };
  const screenChooser = () =>
    new Map(tokenRules().filter((r) => r.selector === ':root[data-variant="neutral"][data-page="chooser"]' && r.media === '@media screen').flatMap((r) => [...r.decls]));

  it('MO-33: chooser palette literals exact; the chooser block re-points the HUD names and --accent to them; game and data blocks unchanged', () => {
    const d = declsOf(':root');
    for (const [name, value] of Object.entries(CH)) expect(squash(d.get(name)), name).toBe(squash(value));
    const re = screenChooser();
    expect(Object.fromEntries(re)).toEqual({
      '--hud-bg': 'var(--ch-k0)', '--hud-panel': 'var(--ch-k1)', '--hud-panel-2': 'var(--ch-k2)', '--hud-text': 'var(--ch-t1)', '--hud-strong': 'var(--ch-t0)',
      '--hud-muted': 'var(--ch-t2)', '--hud-label': 'var(--ch-t2)', '--hud-line': 'var(--ch-line)', '--hud-line-strong': 'var(--ch-line)', '--hud-line-dash': 'var(--ch-dash)',
      '--hud-divider': 'var(--ch-divider)', '--hud-frame': 'var(--ch-frame)', '--hud-panel-92': 'var(--ch-panel-92)',
      '--accent': 'var(--ch-y)', '--accent-ink': 'var(--ch-ink)', '--accent-hover': 'var(--ch-y-hover)', '--accent-wash': 'var(--ch-k2)', '--accent-wash-strong': 'var(--ch-k2)',
      '--neon-glow': 'var(--ch-neon-glow)', '--neon-halo': 'var(--ch-neon-halo)', '--cover-blk-scan': 'var(--ch-blk-scan)',
      '--cover-cy': 'var(--ch-cy)', '--cover-cy-dim': 'var(--ch-cy-dim)', '--cover-cy-glow': 'var(--ch-cy-glow)',
      '--nt-accent': 'var(--ch-y-text)', '--page-link': 'var(--ch-y-text)',
    });
    // nothing outside the chooser moves: the game pages keep lime, the data block sets no accent
    expect(d.get('--accent')).toBe('#C8F03C');
    expect(d.get('--hud-bg')).toBe('#0B0D11');
    expect(declsOf(':root[data-variant="data"]').has('--accent')).toBe(false);
    expect(tokenRules().filter((r) => /--ch-/.test([...r.decls.values()].join(' ')) && !r.selector.includes('chooser') && r.selector !== ':root')).toEqual([]);
  });

  it('MO-33: pairs ≥ 4.5 — ink on yellow, off-white/muted on panel and panel-2, cyan text on panel; focus yellow ≥ 3 on the panel', () => {
    const d = declsOf(':root');
    const v = (n: string) => d.get(n)!;
    expect(contrast(v('--ch-ink'), v('--ch-y'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(v('--ch-ink'), v('--ch-y-hover'))).toBeGreaterThanOrEqual(4.5);
    for (const bg of ['--ch-k1', '--ch-k2']) for (const fg of ['--ch-t0', '--ch-t1', '--ch-t2']) expect(contrast(v(fg), v(bg)), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    expect(contrast(v('--ch-cy'), v('--ch-k1'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(v('--ch-cy'), v('--ch-k2'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(v('--ch-y-text'), v('--ch-k0'))).toBeGreaterThanOrEqual(4.5); // the language switch on the page
    expect(contrast(v('--ch-y'), v('--ch-k1'))).toBeGreaterThanOrEqual(3);
  });

  it('MO-34: device tokens exact; screen text pairs unchanged', () => {
    const d = declsOf(':root');
    const DEV: Record<string, string> = {
      '--dev-shell': '#1A1D22', '--dev-shell-2': '#101215', '--dev-hi': '#24272D', '--dev-rim': 'rgba(255, 255, 255, .09)', '--dev-rim-top': 'rgba(255, 255, 255, .13)',
      '--dev-edge': '#030304', '--dev-cam': '#0A0C10', '--dev-cam-glint': '#2B3A5C',
      '--scr': '#0A0A0B', '--scr-lit': '#19191C', '--scr-off': '#020203', '--scr-spill': 'rgba(150, 160, 190, .06)', '--glare': 'rgba(255, 255, 255, .03)',
    };
    for (const [name, value] of Object.entries(DEV)) expect(squash(d.get(name)), name).toBe(squash(value));
    // the screen is the game black; the cover window on it keeps every text pair (the window is --ch-k1)
    expect(d.get('--scr')).toBe(d.get('--ch-k0'));
    for (const fg of ['--ch-t0', '--ch-t1', '--ch-t2', '--ch-cy']) expect(contrast(d.get(fg)!, d.get('--ch-k1')!), fg).toBeGreaterThanOrEqual(4.5);
  });

  it('MO-35: desk and caption literals exact; caption on --ch-desk-lit ≥ 4.5; the device shell ≥ 15 ΔL* darker than --ch-desk (CIELAB from the literals, v6.9 bound); the yellow focus ring ≥ 3:1 on --ch-desk-lit', () => {
    const d = declsOf(':root');
    const DESK: Record<string, string> = {
      '--ch-desk': '#444B73', '--ch-desk-lit': '#545C89', '--ch-desk-night': 'rgba(7, 9, 20, .52)', '--ch-cap': '#EEF1F5',
      '--ch-mat-edge': 'rgba(18, 22, 46, .42)', '--ch-mat-lit': 'rgba(255, 255, 255, .025)', '--ch-mat-contact': 'rgba(0, 0, 0, .5)', '--ch-mat-stitch': 'rgba(178, 188, 236, .16)',
      '--ch-vignette': 'rgba(0, 0, 0, .22)', '--ch-coat': 'rgba(255, 255, 255, .03)', '--ch-coat-2': 'rgba(255, 255, 255, .012)',
    };
    for (const [name, value] of Object.entries(DESK)) expect(squash(d.get(name)), name).toBe(squash(value));
    expect(contrast(d.get('--ch-cap')!, d.get('--ch-desk-lit')!)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(d.get('--ch-y')!, d.get('--ch-desk-lit')!)).toBeGreaterThanOrEqual(3);
    const lstar = (hex: string) => {
      const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      const y = 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
      return y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : (24389 / 27) * y;
    };
    for (const shell of ['--dev-shell', '--dev-shell-2', '--dev-hi']) expect(lstar(d.get('--ch-desk')!) - lstar(d.get(shell)!), shell).toBeGreaterThanOrEqual(15);
  });

  // named change (MO-41): the chooser's motion tokens moved out of tokens.css (inlined into every page's first flight):
  // the exits' --x-* to the top of chooser-exit.css (loaded after the page), the opening's to the top of chooser.css
  const rootOf = (file: string): Map<string, string> =>
    new Map(parseCss(read(file)).filter((r) => r.selector === ':root' && r.media === null).flatMap((r) => [...r.decls]));

  it('MO-38: --x-* tokens exact and their last end = --x-game (declared in chooser-exit.css, not tokens.css)', () => {
    const d = rootOf('src/styles/chooser-exit.css');
    expect([...declsOf(':root').keys()].filter((k) => /^--(x|at-op|dur-op|op)-/.test(k))).toEqual([]);
    const X: Record<string, string> = {
      '--x-game': '.88s', '--x-scrim-at': '.12s', '--x-scrim': '.26s', '--x-grat-at': '.14s', '--x-grat': '.24s', '--x-trace-at': '.15s', '--x-trace': '.38s',
      '--x-grow': '.43s', '--x-square-at': '.28s', '--x-square': '.26s', '--x-echo-lag': '.06s', '--x-collapse-at': '.54s', '--x-collapse': '.17s',
      '--x-line-at': '.69s', '--x-line': '.19s', '--x-fade': '.14s',
    };
    for (const [name, value] of Object.entries(X)) expect(d.get(name), name).toBe(value);
    const s = (n: string) => parseFloat(d.get(n)!);
    const ends = [['--x-scrim-at', '--x-scrim'], ['--x-grat-at', '--x-grat'], ['--x-trace-at', '--x-trace'], ['--x-trace-at', '--x-grow'], ['--x-square-at', '--x-square'], ['--x-collapse-at', '--x-collapse'], ['--x-line-at', '--x-line']].map(([a, b]) => s(a!) + s(b!));
    expect(Math.max(...ends)).toBeCloseTo(s('--x-game'), 5);
    expect(s('--x-line-at') + s('--x-line')).toBeCloseTo(s('--x-game'), 5);
  });

  it('MO-39: --x-data .8s; the fold ends at .72s; EXIT_MS.data equals --x-data', async () => {
    const d = rootOf('src/styles/chooser-exit.css');
    expect(d.get('--x-data')).toBe('.8s');
    expect(d.get('--x-fold')).toBe('.72s');
    expect(d.get('--x-pull-at')).toBe('.4s');
    expect(d.get('--x-flap-fade-at')).toBe('.576s');
    expect(parseFloat(d.get('--x-fold')!)).toBeLessThan(parseFloat(d.get('--x-data')!));
    const { EXIT_MS } = await import('../../src/scripts/chooser');
    expect(EXIT_MS.data).toBe(parseFloat(d.get('--x-data')!) * 1000);
    // the baked stops of the turn match the pinned moments
    const exit = read('src/styles/chooser-exit.css');
    const fade = /@keyframes x-flap-fade \{ 0% \{ opacity: 1\.000; \} ([\d.]+)% \{ opacity: 1\.000; \}/.exec(exit)?.[1];
    expect(Number(fade) / 100 * 720).toBeCloseTo(576, 0);
    expect(exit).toMatch(/55\.56% \{ transform: translate\(0\.0px, 0\.0px\)/); // the pull starts at --x-pull-at
  });

  it('MO-41: opening tokens exact; every opening animation ends by 2.398 s ≤ OPENING_TIMING.doneMs; the toss starts after the decrypt and the status end', async () => {
    const d = rootOf('src/styles/chooser.css');
    const OP: Record<string, string> = {
      '--dur-op-device': '.28s', '--at-op-props': '.08s', '--dur-op-props': '.36s', '--op-props-step': '.06s', '--at-op-power': '.17s', '--dur-op-power': '.34s',
      '--at-op-off': '.25s', '--dur-op-off': '.14s', '--dur-op-step': '10.4ms', '--at-op-boot': '.3s', '--dur-op-boot': '.156s', '--at-op-type': '.404s',
      '--at-op-decrypt': '.716s', '--dur-op-decrypt': '.2288s', '--at-op-shutter': '1.0176s', '--dur-op-shutter': '.1248s', '--at-op-lock': '1.2152s',
      '--dur-op-lock': '.1352s', '--at-op-toss': '1.548s', '--at-op-rstamp': '2.178s', '--dur-op-rstamp': '.22s',
    };
    for (const [name, value] of Object.entries(OP)) expect(d.get(name), name).toBe(value);
    // the cyber part plays at K .52 from the power-on (300 ms): each phase start is 300 + t × .52 of v6.2's 2.4 s scale
    const ms = (v: string) => (v.endsWith('ms') ? parseFloat(v) : parseFloat(v) * 1000);
    for (const [name, t] of [['--at-op-type', 200], ['--at-op-decrypt', 800], ['--at-op-shutter', 1380], ['--at-op-lock', 1760], ['--at-op-toss', 2400]] as const) {
      expect(ms(d.get(name)!), name).toBeCloseTo(300 + t * 0.52, 6);
    }
    const dur = new Map<string, number>([...d].filter(([k]) => /^--(at|dur)-op-|^--op-/.test(k)).map(([k, v]) => [k, ms(v)]));
    dur.set('--dur-enter', ms(declsOf(':root').get('--dur-enter')!));
    // per-element indices at their largest: props (6), shutters (10), label offsets (12 steps)
    const MAX: Record<string, number> = { '--pi': 5, '--i': 9, '--li': 12 };
    const evalTime = (expr: string): number => {
      const js = expr.replace(/var\((--[\w-]+)(?:,\s*[\d.]+)?\)/g, (_, name: string) => {
        const v = MAX[name] ?? dur.get(name);
        if (v === undefined) throw new Error(`unknown token ${name} in ${expr}`);
        return String(v);
      }).replace(/calc\(/g, '(');
      expect(js, expr).toMatch(/^[\d.\s+*/()-]+$/);
      return Function(`return ${js}`)() as number;
    };
    const sheet = read('src/styles/chooser.css').replace(/\/\*[\s\S]*?\*\//g, '');
    const anims = [...sheet.matchAll(/([^{}]*\[data-intro="opening"\][^{}]*)\{\s*animation:\s*(op-[\w-]+) ([^;]+?) both;\s*\}/g)].map((m) => {
      const [name, rest] = [m[2]!, m[3]!];
      // "<duration> <easing> [<delay>]": durations and delays are var()/calc() of tokens (never a literal time)
      const parts = rest.match(/calc\((?:[^()]|\([^()]*\))*\)|var\([^()]*\)|steps\([^()]*\)|[\w.-]+/g)!;
      const times = parts.filter((p) => /^(var\(--(at|dur|op)-|calc\()/.test(p));
      expect(parts.filter((p) => /^\d|^\.\d/.test(p)), `${m[1]!.trim()}: no literal time`).toEqual([]);
      return { sel: m[1]!.trim(), name, dur: evalTime(times[0]!), at: times[1] ? evalTime(times[1]) : 0 };
    });
    expect(anims.length).toBeGreaterThanOrEqual(25);
    const end = Math.max(...anims.map((a) => a.at + a.dur));
    expect(end).toBeCloseTo(2398, 6);
    const { OPENING_TIMING } = await import('../../src/lib/head-init');
    expect(end).toBeLessThanOrEqual(OPENING_TIMING.doneMs);
    const of = (name: string) => anims.filter((a) => a.name === name);
    const toss = of('op-toss')[0]!;
    expect(toss.at).toBeCloseTo(1548, 6);
    for (const a of anims.filter((x) => /\.ov/.test(x.sel))) expect(a.at + a.dur, a.sel).toBeLessThanOrEqual(toss.at + 1e-6);
    expect(Math.max(...of('op-status').map((a) => a.at + a.dur))).toBeCloseTo(toss.at, 6);
    // the device rises and powers on before the decrypt; the props are all in by 740 ms
    expect(Math.max(...of('op-pwr').map((a) => a.at + a.dur))).toBeLessThanOrEqual(ms(d.get('--at-op-decrypt')!));
    expect(of('op-rise')[0]!.dur).toBe(280);
    expect(anims.filter((a) => /\.prop/.test(a.sel)).map((a) => a.at + a.dur)).toEqual([740]);
  });

  it('MO-23: the chooser page is dark (color-scheme dark in the chooser sheet), the other neutral pages stay light', () => {
    const sheet = read('src/styles/chooser.css');
    expect(sheet).toMatch(/(^|\n):root\[data-variant="neutral"\]\[data-page="chooser"\]\s*\{[^}]*color-scheme:\s*dark/);
    expect(read('src/styles/base.css')).toMatch(/:root\[data-variant="data"\], :root\[data-variant="neutral"\] \{ color-scheme: light; \}/);
  });

  it('MO-24: --dur-aside is .45s and at most --dur-morph + .05s', () => {
    const d = declsOf(':root');
    expect(d.get('--dur-aside')).toBe('.45s');
    // MO-42 (named): --dur-morph (.4s) is gone; the bound keeps its value
    expect(parseFloat(d.get('--dur-aside')!)).toBeLessThanOrEqual(0.4 + 0.05 + 1e-9);
  });

  it('MO-25: --dur-strike .32s, --dur-strike-ring .42s (the chooser does not redefine --dur-stamp: the general version owns that name)', () => {
    const d = declsOf(':root');
    expect(d.get('--dur-strike')).toBe('.32s');
    expect(d.get('--dur-strike-ring')).toBe('.42s');
    expect(d.get('--dur-stamp')).toBe('.22s');
  });
});
