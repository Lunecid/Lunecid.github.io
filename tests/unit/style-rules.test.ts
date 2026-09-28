// Style guards of contract §5.16. Scans every src/**/*.css file whole and the <style> blocks and style="…"
// attributes of every src/**/*.astro file present when the test runs. .ts/.tsx files are not scanned for
// transitions, keyframes or font sizes (Motion transition objects are JS; island CSS lives in sibling .css files).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const GLOBAL_STYLES = ['src/styles/tokens.css', 'src/styles/base.css', 'src/styles/hud.css', 'src/styles/read.css'];
const ALLOWED_TRANSITIONS = new Set(['transform', 'opacity', 'color', 'background-color', 'border-color', 'outline-color', 'text-decoration-color']);
const KEYFRAME_PROPS = new Set(['transform', 'opacity']);
const TIMING = /^(ease|ease-in|ease-out|ease-in-out|linear|step-start|step-end|allow-discrete|normal)$/;
const TIME = /^-?[\d.]+m?s$/;

type Violation = { file: string; rule: string; detail: string };
type Decl = { prop: string; value: string };

const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true })
    .map(String)
    .map((f) => relative(ROOT, join(dir, f)).replace(/\\/g, '/'))
    .sort();
}

/** CSS that the rules apply to. */
function scannedCss(file: string, text: string): string {
  if (file.endsWith('.css')) return stripComments(text);
  if (file.endsWith('.astro')) {
    // Never the frontmatter or <script> bodies: only <style> blocks and style="…" attributes of the markup.
    const markup = text.replace(/^---\n[\s\S]*?\n---(\n|$)/, '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
    const blocks = [...markup.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
    const tags = markup.replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, '');
    const attrs = [...tags.matchAll(/\sstyle=(?:"([^"]*)"|'([^']*)')/g)].map((m) => `[style-attr] { ${m[1] ?? m[2]} }`);
    return stripComments([...blocks, ...attrs].join('\n'));
  }
  return '';
}

/** Declarations of every innermost {…} body (rules, keyframe frames, style attributes). */
function declarations(css: string): Decl[] {
  const out: Decl[] = [];
  for (const m of css.matchAll(/\{([^{}]*)\}/g)) {
    for (const part of m[1].split(';')) {
      const i = part.indexOf(':');
      if (i < 0) continue;
      const prop = part.slice(0, i).trim().toLowerCase();
      const value = part.slice(i + 1).trim().replace(/\s*!important$/, '');
      if (/^-?-?[a-z][a-z0-9-]*$/.test(prop) && value) out.push({ prop, value });
    }
  }
  return out;
}

/** Splits on commas and whitespace that are not inside parentheses. */
function splitTop(value: string, sep: ',' | ' '): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of value) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (depth === 0 && (sep === ',' ? ch === ',' : /\s/.test(ch))) {
      if (cur.trim()) parts.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

let tokenCache: Map<string, string[]> | null = null;
/** Every custom property defined in tokens.css (all breakpoints) → its values. */
function tokens(): Map<string, string[]> {
  if (tokenCache) return tokenCache;
  const map = new Map<string, string[]>();
  if (existsSync(join(ROOT, 'src/styles/tokens.css'))) {
    for (const d of declarations(stripComments(read('src/styles/tokens.css')))) {
      if (d.prop.startsWith('--')) map.set(d.prop, [...(map.get(d.prop) ?? []), d.value]);
    }
  }
  tokenCache = map;
  return map;
}

/** Smallest px value a length expression can take; null when it cannot be known (%, vw, keywords). */
function minPx(expr: string, depth = 0): number | null {
  const v = expr.trim();
  if (depth > 8) return null;
  const varM = /^var\(\s*(--[\w-]+)\s*(?:,\s*([\s\S]+))?\)$/.exec(v);
  if (varM) {
    const defs = tokens().get(varM[1]);
    const vals = (defs ?? (varM[2] ? [varM[2]] : [])).map((d) => minPx(d, depth + 1)).filter((n): n is number => n !== null);
    return vals.length ? Math.min(...vals) : null;
  }
  const fn = /^(clamp|min|max)\(([\s\S]*)\)$/.exec(v);
  if (fn) {
    const vals = splitTop(fn[2], ',').map((a) => minPx(a, depth + 1)).filter((n): n is number => n !== null);
    return vals.length ? Math.min(...vals) : null;
  }
  const calc = /^calc\(([\s\S]*)\)$/.exec(v);
  if (calc) {
    let unknown = false;
    const arith = calc[1]
      .replace(/var\([^()]*\)/g, (m) => {
        const n = minPx(m, depth + 1);
        if (n === null) unknown = true;
        return String(n ?? 0);
      })
      .replace(/(-?[\d.]+)(px|rem|em|pt|%|vw|vh|ch)?/g, (_, n: string, unit?: string) => {
        if (!unit) return n;
        const px = minPx(`${n}${unit}`, depth + 1);
        if (px === null) unknown = true;
        return String(px ?? 0);
      });
    if (unknown || !/^[\d\s.+\-*/()]+$/.test(arith)) return null;
    return Number(Function(`return (${arith});`)());
  }
  const len = /^(-?[\d.]+)(px|rem|em|pt)?$/.exec(v);
  if (len) {
    const n = Number(len[1]);
    if (!len[2]) return n === 0 ? 0 : null;
    return len[2] === 'px' ? n : len[2] === 'pt' ? (n * 4) / 3 : n * 16;
  }
  return null;
}

/** Index of a '/' outside parentheses, or -1. */
function topSlash(token: string): number {
  let depth = 0;
  for (let i = 0; i < token.length; i++) {
    if (token[i] === '(') depth++;
    else if (token[i] === ')') depth--;
    else if (token[i] === '/' && depth === 0) return i;
  }
  return -1;
}

/** The size part of a `font:` shorthand (the token before a top-level '/', else the first length-like token). */
function shorthandSize(value: string): string | null {
  const toks = splitTop(value, ' ');
  const withSlash = toks.find((t) => topSlash(t) >= 0);
  if (withSlash) return withSlash.slice(0, topSlash(withSlash));
  return toks.find((t) => /^(-?[\d.]+(px|rem|em|pt|%)|(clamp|min|max|calc)\(.+\)|var\(--fs[\w-]*\))$/.test(t)) ?? null;
}

function shorthandWeight(value: string): number | null {
  const size = shorthandSize(value);
  for (const t of splitTop(value, ' ')) {
    if (size && t.startsWith(size)) break;
    if (/^\d{1,4}$/.test(t)) return Number(t);
  }
  return null;
}

function transitionProps(value: string): string[] {
  return splitTop(value, ',').map((item) => {
    let s = item;
    while (/[\w-]+\([^()]*\)/.test(s)) s = s.replace(/[\w-]+\([^()]*\)/g, ' ');
    const words = s.split(/\s+/).filter(Boolean);
    return words.find((w) => !TIME.test(w) && !TIMING.test(w)) ?? '(unresolved)';
  });
}

/** Keyframe blocks with their full bodies. */
function keyframeBodies(css: string): { name: string; body: string }[] {
  const out: { name: string; body: string }[] = [];
  const re = /@keyframes\s+([\w-]+)\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    let depth = 1;
    let j = re.lastIndex;
    for (; j < css.length && depth > 0; j++) {
      if (css[j] === '{') depth++;
      if (css[j] === '}') depth--;
    }
    out.push({ name: m[1], body: css.slice(re.lastIndex, j - 1) });
  }
  return out;
}

function scanSource(file: string, text: string): Violation[] {
  const css = scannedCss(file, text);
  if (!css.trim()) return [];
  const v: Violation[] = [];
  const add = (rule: string, detail: string) => v.push({ file, rule, detail });
  const decls = declarations(css);
  for (const { prop, value } of decls) {
    if (prop === 'transition' || prop === 'transition-property') {
      const props = prop === 'transition' ? transitionProps(value) : splitTop(value, ',');
      for (const p of props) {
        if (p === 'all') add('transition-all', `${prop}: ${value}`);
        else if (p !== 'none' && !ALLOWED_TRANSITIONS.has(p)) add('transition-property', `${prop}: ${value}`);
      }
    }
    if (prop === 'font-size' || prop === 'font') {
      const size = prop === 'font' ? shorthandSize(value) : value;
      const px = size === null ? null : minPx(size);
      if (px !== null && px < 12 - 1e-9) add('font-size', `${prop}: ${value} (${Math.round(px * 100) / 100}px)`);
    }
    if (prop === 'letter-spacing') {
      const px = value.startsWith('var(') ? minPx(value) : null;
      if (value.startsWith('-') || /^calc\(\s*-/.test(value) || (px !== null && px < 0)) add('letter-spacing', `${prop}: ${value}`);
    }
    if (prop === 'font-weight' || prop === 'font') {
      const w = prop === 'font' ? shorthandWeight(value) : /^\d+$/.test(value) ? Number(value) : value === 'lighter' ? 100 : null;
      if (w !== null && w <= 300) add('font-weight', `${prop}: ${value}`);
    }
  }
  if (/\binfinite\b/.test(css)) add('infinite', 'animation repeats forever');
  for (const kf of keyframeBodies(css)) {
    for (const d of declarations(kf.body)) if (!KEYFRAME_PROPS.has(d.prop)) add('keyframes', `@keyframes ${kf.name}: ${d.prop}`);
  }
  return v;
}

let repoCache: { files: string[]; violations: Violation[] } | null = null;
function repo() {
  if (repoCache) return repoCache;
  const files = walk(join(ROOT, 'src')).filter((f) => /\.(css|astro)$/.test(f));
  const violations = files.flatMap((f) => scanSource(f, read(f)));
  repoCache = { files, violations };
  return repoCache;
}

function violationsOf(rule: string): Violation[] {
  const { files, violations } = repo();
  expect(files).toEqual(expect.arrayContaining(GLOBAL_STYLES)); // the four global stylesheets are always scanned
  return violations.filter((x) => x.rule === rule);
}

describe('style rules over src/**', () => {
  it('no transition: all', () => {
    expect(violationsOf('transition-all')).toEqual([]);
  });

  it('transitions animate only allowed properties', () => {
    expect(violationsOf('transition-property')).toEqual([]);
  });

  it('keyframes use only transform and opacity', () => {
    expect(violationsOf('keyframes')).toEqual([]);
  });

  it('no infinite animations', () => {
    expect(violationsOf('infinite')).toEqual([]);
  });

  it('no font-size below 12px (px, rem/em, pt converted)', () => {
    expect(violationsOf('font-size')).toEqual([]);
  });

  it('no negative letter-spacing', () => {
    expect(violationsOf('letter-spacing')).toEqual([]);
  });

  it('no font-weight 100–300', () => {
    expect(violationsOf('font-weight')).toEqual([]);
  });

  it('--font-card only in MembershipCard.astro, --font-anton only in tokens.css and PlayerLogView.astro', () => {
    const files = walk(join(ROOT, 'src')).filter((f) => /\.(css|astro|ts|tsx|mjs|js|md|mdx)$/.test(f));
    expect(files).toEqual(expect.arrayContaining(GLOBAL_STYLES));
    const cardUsers = files.filter((f) => read(f).includes('var(--font-card'));
    const antonUsers = files.filter((f) => read(f).includes('--font-anton'));
    expect(cardUsers.filter((f) => f !== 'src/components/player-log/MembershipCard.astro')).toEqual([]);
    expect(antonUsers.filter((f) => f !== 'src/styles/tokens.css' && f !== 'src/views/PlayerLogView.astro')).toEqual([]);
    expect(read('src/styles/tokens.css')).toMatch(/--font-card:\s*var\(--font-anton,/);
  });

  it('.prose max-width is the reading measure: 38em (ko) / 36em, about 66 characters (en) (P2-37)', () => {
    const css = stripComments(read('src/styles/read.css'));
    expect(css).toMatch(/(^|\n)\.prose\s*\{[^}]*max-width:\s*var\(--measure\)/);
    // The centred band and the reading column centre the same measure.
    expect(css).toMatch(/\.prose\.read, \.read-column\s*\{[^}]*calc\(50% - var\(--measure\) \/ 2\)/);
    const tokens = stripComments(read('src/styles/tokens.css'));
    expect(tokens).toMatch(/--measure:\s*38em/);
    expect(tokens).toMatch(/:lang\(en\)\s*\{[^}]*--measure:\s*36em/);
    // No component keeps the old 66ch English measure.
    const stale = walk(join(ROOT, 'src')).filter((f) => /\.(css|astro)$/.test(f) && /max-width:\s*66ch/.test(read(f)));
    expect(stale).toEqual([]);
  });

  // P1-10: Hangul set directly in a mono HUD element (no .hud-label__ko-style wrapper) must switch to the
  // sans font for :lang(ko) — JetBrains Mono's own space glyph widens multi-word Korean labels even though
  // Hangul letterforms already fall back to Pretendard. Where the mono rule also tracked the text out with a
  // positive letter-spacing, the :lang(ko) override must zero it too (spec §4 "Hangul letter-spacing 0").
  const KO_MONO_TO_SANS: { file: string; selector: string; alsoZeroesTracking: boolean }[] = [
    { file: 'src/styles/hud.css', selector: '.hud-label:lang(ko)', alsoZeroesTracking: true },
    { file: 'src/components/hud/MainMenu.astro', selector: '.mm__title:lang(ko)', alsoZeroesTracking: false },
    { file: 'src/components/hud/MainMenu.astro', selector: '.mm__cap:lang(ko)', alsoZeroesTracking: false },
    { file: 'src/components/projects/ProjectCartridge.astro', selector: '.cart__tags li:lang(ko)', alsoZeroesTracking: true },
    { file: 'src/components/hud/SiteFooter.astro', selector: '.site-footer__motion:lang(ko)', alsoZeroesTracking: false },
    { file: 'src/islands/FavoriteGames.css', selector: '.fg__tab small:lang(ko)', alsoZeroesTracking: true },
    { file: 'src/components/research/AucOverallChart.astro', selector: '.chart__summary:lang(ko)', alsoZeroesTracking: true },
    { file: 'src/components/hud/PlayerCard.astro', selector: '.player-card__class:lang(ko)', alsoZeroesTracking: true },
  ];
  it.each(KO_MONO_TO_SANS)('$file $selector switches to the sans font for Korean', ({ file, selector, alsoZeroesTracking }) => {
    const css = stripComments(read(file));
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const body = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css)?.[1];
    expect(body, `${selector} not found in ${file}`).toBeTruthy();
    expect(body).toMatch(/font-family:\s*var\(--font-sans\)/);
    if (alsoZeroesTracking) expect(body).toMatch(/letter-spacing:\s*0\b/);
  });
});

describe('style scanner fixtures', () => {
  it('motion transition objects in TSX are ignored', () => {
    const tsx = "const t = { transition: 'all 1s' };\nexport const X = () => <motion.div transition={{ duration: 0.6, repeat: Infinity }} style={{ fontSize: 8, letterSpacing: -1 }} />;";
    expect(scanSource('src/islands/Fixture.tsx', tsx)).toEqual([]);
    expect(scanSource('src/lib/fixture.ts', "export const css = 'transition: all 1s; font-size: 8px';")).toEqual([]);
  });

  it('10.5pt passes, 8pt fails', () => {
    expect(scanSource('fixture.css', '.a { font-size: 10.5pt; }')).toEqual([]);
    expect(scanSource('fixture.css', '.a { font-size: 8pt; }').map((x) => x.rule)).toEqual(['font-size']);
  });

  it('clamp(12px, 2vw, 16px) passes, clamp(10px, …) fails', () => {
    expect(scanSource('fixture.css', '.a { font-size: clamp(12px, 2vw, 16px); }')).toEqual([]);
    expect(scanSource('fixture.css', '.a { font-size: clamp(10px, 2vw, 16px); }').map((x) => x.rule)).toEqual(['font-size']);
  });

  it('flags each rule on a bad fixture and passes the matching good one', () => {
    const cases: [string, string, string | null][] = [
      ['transition: all .2s', 'transition-all', null],
      ['transition: width .2s ease', 'transition-property', null],
      ['transition-property: opacity, height', 'transition-property', null],
      ['transition: opacity var(--dur-fade) var(--ease-out), transform .6s cubic-bezier(.22, 1, .36, 1)', '', null],
      ['transition: color var(--dur-hover) linear, background-color .1s', '', null],
      ['animation: spin 1s linear infinite', 'infinite', null],
      ['font-size: 11px', 'font-size', null],
      ['font-size: .7rem', 'font-size', null],
      ['font-size: .75rem', '', null],
      ['font-size: calc(var(--fs-min) - 1px)', 'font-size', null],
      ['font-size: var(--fs-caption)', '', null],
      ['font: 800 11px/1 var(--font-sans)', 'font-size', null],
      ['font: 600 var(--fs-label)/1.5 var(--font-mono)', '', null],
      ['letter-spacing: -.02em', 'letter-spacing', null],
      ['letter-spacing: var(--ls-label)', '', null],
      ['font-weight: 300', 'font-weight', null],
      ['font: 300 14px/1.5 var(--font-sans)', 'font-weight', null],
      ['font-weight: 400', '', null],
    ];
    for (const [decl, rule] of cases) {
      const got = scanSource('fixture.css', `.a { ${decl}; }`).map((x) => x.rule);
      expect(got, decl).toEqual(rule ? [rule] : []);
    }
    expect(scanSource('fixture.css', '@keyframes k { from { left: 0; } to { left: 10px; } }').map((x) => x.rule)).toEqual(['keyframes', 'keyframes']);
    expect(scanSource('fixture.css', '@keyframes k { from { transform: translateX(40%); opacity: 0; } to { transform: none; opacity: 1; } }')).toEqual([]);
    expect(scanSource('fixture.css', '@keyframes k { 0% { transform: none; animation-timing-function: linear; } 100% { opacity: 0; } }').map((x) => x.rule)).toEqual(['keyframes']);
    // Frontmatter and <script> are never scanned, even when they contain style="…" strings.
    const astro = '---\nconst t = "transition: all";\nconst tag = \'<i style="font-size: 8px">\';\n---\n<p style="font-size: 10px">x</p>\n<script>el.style.transition = "all 1s"; el.innerHTML = \'<b style="font-weight: 200">\';</script>\n<style>.b { transition: all .1s; }</style>';
    expect(scanSource('src/components/Fixture.astro', astro).map((x) => x.rule).sort()).toEqual(['font-size', 'transition-all']);
  });
});
