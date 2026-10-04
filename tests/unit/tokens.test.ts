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

  it('MO-1 (audit Z1, V1, V3, R1): motion tokens for transitions, morph, reflow, menu, lift and reduced exits', () => {
    const d = rootDecls(BASE);
    const s = (name: string) => parseFloat(d.get(name)!);
    expect(d.get('--dur-nav-out')).toBe('.09s');
    expect(d.get('--dur-nav-in')).toBe('.16s');
    expect(d.get('--dur-morph')).toBe('.4s');
    expect(d.get('--dur-reflow')).toBe('.3s');
    expect(d.get('--dur-menu')).toBe('.15s');
    expect(d.get('--dur-lift')).toBe('.25s');
    expect(d.get('--dur-fade-out')).toBe('.15s');
    // Fade-through: the whole page transition is .25s and the old page leaves in about the first third of it.
    expect(s('--dur-nav-out') + s('--dur-nav-in')).toBeCloseTo(0.25, 10);
    expect(s('--dur-nav-out') / 0.25).toBeGreaterThanOrEqual(0.33);
    expect(s('--dur-nav-out') / 0.25).toBeLessThanOrEqual(0.37);
    expect(s('--dur-morph')).toBeLessThanOrEqual(0.4);
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
      '--font-ed-head': '"Times New Roman", Times, "TeX Gyre Termes", "Nimbus Roman", "Liberation Serif", "SB Serif KR Head", serif',
    };
    for (const [name, value] of Object.entries(expected)) expect(d.get(name), name).toBe(value);
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

  it('P2-2: the general version\'s role tokens, set only with the layout flip (D-5)', () => {
    const ROLES = ['--page-bg', '--page-ink', '--page-muted', '--page-focus', '--page-link', '--page-rule', '--page-rule-strong', '--page-fill', '--page-fill-ink'];
    const data = declsOf(':root[data-variant="data"]');
    expect(ROLES.map((r) => data.get(r))).toEqual(['var(--ed-bg)', 'var(--ed-ink)', 'var(--ed-muted)', 'var(--ed-accent)', 'var(--ed-accent)', 'var(--ed-rule)', 'var(--ed-rule-strong)', 'var(--ed-fill)', 'var(--ed-fill-ink)']);
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
