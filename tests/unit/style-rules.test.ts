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


// F-030 (P-11): px font-size literals. Type sizes come from the rem tokens of tokens.css (--fs-*); a px literal in a
// font-size or font declaration is allowed only where PX_FONT_BASELINE lists it. The baseline is the count P2 left
// (P-11 applied): it only shrinks, never grows. Exempt: tokens.css (it defines the scale) and the membership card's
// Anton title (a printed-card lettering sized to its card box, not body type).
const PX_FONT_EXEMPT_FILES = new Set(['src/styles/tokens.css']);
const PX_FONT_EXEMPT_RULES: { file: string; selector: string }[] = [{ file: 'src/components/player-log/MembershipCard.astro', selector: '.mcard__title' }];
/** "<selector> | <size>" for every font-size / font declaration of a file whose size carries a px literal. */
function pxFontSizes(file: string, text: string): string[] {
  if (PX_FONT_EXEMPT_FILES.has(file)) return [];
  const css = scannedCss(file, text);
  const out: string[] = [];
  for (const m of css.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    const selector = m[1].trim().replace(/\s+/g, ' ');
    if (PX_FONT_EXEMPT_RULES.some((x) => x.file === file && x.selector === selector)) continue;
    for (const { prop, value } of declarations(`{${m[2]}}`)) {
      if (prop !== 'font-size' && prop !== 'font') continue;
      const size = prop === 'font' ? shorthandSize(value) : value;
      if (size && /(^|[^\w.-])\d*\.?\d+px\b/.test(size)) out.push(`${selector} | ${size}`);
    }
  }
  return out.sort();
}

const PX_FONT_BASELINE_MAX = 74;
const PX_FONT_BASELINE: Record<string, string[]> = {
  'src/components/data/DataNav.astro': ['.data-nav__name | 20px'],
  'src/components/home/HelloProfile.astro': ['.hello__title | 32px', '.hello__title | 40px'],
  'src/components/hud/AchievementHost.css': ['.ach-toast__close | 18px'],
  'src/components/hud/CrtIntro.astro': ['.crt__caption | clamp(28px, 5.2vw, 56px)', '.crt__start | clamp(14px, 2.3vw, 22px)'],
  'src/components/hud/Hero.astro': ['.hero__chip-face | 13px', '.hero__jobfit | 15px'],
  'src/components/hud/HudNav.astro': ['.hud-nav__bar | 13px', '.hud-nav__list a | 16px', '.hud-nav__toggle | 13px'],
  'src/components/hud/MainMenu.astro': ['.mm__cap | 14px', '.mm__link | 18px', '.mm__link | 20px'],
  'src/components/player-log/AchievementMeter.astro': ['.ach-meter__count | clamp(28px, 3vw, 40px)', '.ach-meter__note | 14px'],
  'src/components/player-log/FavoriteTiles.astro': ['.fav-tile__cap strong | 16px', '.fav-tile__cap strong | 20px', '.fav-tile__kicker | 12px'],
  'src/components/player-log/MembershipCard.astro': ['.mcard__band | 12px', '.mcard__field dd | 15px', '.mcard__field dt | 13px', '.mcard__sticker | 12px', '.mcard__sticker | 13px', '.mcard__title small | 13px'],
  'src/components/player-log/SiteAchievementList.astro': ['.site-ach__desc | 15px', '.site-ach__hint | 14px', '.site-ach__note, .site-ach__nojs | 14px', '.site-ach__progress | 15px'],
  'src/components/projects/ProjectAudience.astro': ['.audience__text | 16px'],
  'src/components/projects/ProjectCartridge.astro': ['.cart__label--text .cart__title | 16px', '.cart__label--text .cart__title | 18px', '.cart__plate-id | 13px', '.cart__plate-id | 16px', '.cart__plate-period | 13px', '.cart__plate-tag | 13px', '.cart__sticker | 12px', '.cart__summary | 13px', '.cart__title | 14px', '.cart__title | 16px'],
  'src/components/records/CredentialList.astro': ['.creds__primary | 16px'],
  'src/components/records/EducationTimeline.astro': ['.timeline__degree | 16px'],
  'src/components/records/JobFitTable.astro': ['.jobfit__intro | 16px', '.jobfit__pending | 16px'],
  'src/components/records/ProjectSummaryList.astro': ['.psum__summary | 16px'],
  'src/components/records/RecordsHead.astro': ['.rhead__hello | 28px', '.rhead__hello | 34px', '.rhead__hello | 40px', '.rhead__hello | min(34px, 9svh)', '.rhead__hello | min(40px, 9svh)'],
  'src/components/research/InProgressList.astro': ['.progress-list__body | 16px'],
  'src/components/research/PaperSheet.astro': ['.paper__title | 24px'],
  'src/components/research/PublicationItem.astro': ['.pub__tldr | 16px'],
  'src/islands/CharacterStage.css': ['.char-stage__btn | 13px'],
  'src/islands/FavoriteGames.css': ['.fg-acct__badges li | 12px', '.fg-acct__hd | 12px', '.fg-acct__nm | 22px', '.fg-acct__row dd | 18px', '.fg-acct__row | 14px', '.fg-acct__src | 12px', '.fg-acct__sub | 12px', '.fg__tab b | 15px', '.fg__tab small | 12px', '.fg__title | 34px', '.fg__title | 40px', '.fg__title | 46px', '.fg__why | 16px'],
  'src/islands/ImageViewer.css': ['.image-viewer__cap | 14px', '.image-viewer__close | var(--fs-label, 12px)', '.image-viewer__close-x | 18px', '.image-viewer__counter | 13px', '.image-viewer__nav | 18px', '.image-viewer__strip | var(--fs-label, 12px)'],
  'src/views/LegalView.astro': ['.legal :global(td:first-child) | 16px'],
};

type NestedRule = { selector: string; body: string; at: string[] };
/** Every style rule with the preludes of the at-rules around it (@media, @supports, …); @keyframes bodies are skipped. */
function nestedRules(css: string): NestedRule[] {
  const out: NestedRule[] = [];
  const visit = (text: string, at: string[]) => {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf('{', i);
      if (open < 0) break;
      const prelude = text.slice(i, open).split(';').pop()!.trim().replace(/\s+/g, ' ');
      let depth = 1;
      let j = open + 1;
      for (; j < text.length && depth > 0; j++) {
        if (text[j] === '{') depth++;
        if (text[j] === '}') depth--;
      }
      const body = text.slice(open + 1, j - 1);
      if (/^@(-[a-z]+-)?keyframes\b/.test(prelude)) {
        // frames are not rules
      } else if (prelude.startsWith('@') && body.includes('{')) visit(body, [...at, prelude]);
      else out.push({ selector: prelude, body, at });
      i = j;
    }
  };
  visit(css, []);
  return out;
}

// Hover styles belong to hover-capable pointers: on a touch screen a :hover rule outside @media (hover: hover) sticks
// after a tap. HOVER_OUTSIDE_BASELINE lists the rules that still sit outside; it only shrinks.
const HOVER_PROPS = new Set(['color', 'background', 'background-color', 'border', 'border-color', 'outline-color', 'text-decoration', 'text-decoration-color', 'transform']);
const HOVER_MEDIA = /\(\s*hover\s*:\s*hover\s*\)/;
/** Selectors of the :hover rules of a file that change colour, border, transform or a custom property outside (hover: hover). */
function hoverOutsideMedia(file: string, text: string): string[] {
  const out: string[] = [];
  for (const r of nestedRules(scannedCss(file, text))) {
    if (!r.selector.includes(':hover')) continue;
    if (r.at.some((a) => a.startsWith('@media') && HOVER_MEDIA.test(a))) continue;
    if (declarations(`{${r.body}}`).some((d) => HOVER_PROPS.has(d.prop) || d.prop.startsWith('--'))) out.push(r.selector);
  }
  return out.sort();
}
const HOVER_OUTSIDE_BASELINE_MAX = 0;
const HOVER_OUTSIDE_BASELINE: Record<string, string[]> = {};

// Durations come from the --dur-* tokens. DURATION_LITERAL_BASELINE lists the literal durations that remain; it only
// shrinks. Delays are not checked (staggers are local choreography); 0s/0ms is not a duration to tokenise.
const DURATION_PROPS = new Set(['transition', 'transition-duration', 'animation', 'animation-duration']);
/** "<selector> | <literal>" for each comma item whose duration is a time literal other than 0. */
function literalDurations(file: string, text: string): string[] {
  const out: string[] = [];
  for (const r of nestedRules(scannedCss(file, text))) {
    for (const { prop, value } of declarations(`{${r.body}}`)) {
      if (!DURATION_PROPS.has(prop)) continue;
      for (const item of splitTop(value, ',')) {
        const words = splitTop(item, ' ');
        const dur = prop.endsWith('-duration') ? item : words.find((w) => TIME.test(w) || (/^(var|calc)\(/.test(w) && !/^var\(\s*--ease/.test(w)));
        if (dur && TIME.test(dur) && !/^-?0+(\.0+)?m?s$/.test(dur)) out.push(`${r.selector} | ${dur}`);
      }
    }
  }
  return out.sort();
}
// What remains is owned elsewhere: the CRT intro's timeline (frozen), the account dialog and the achievement meter's pop.
const DURATION_LITERAL_BASELINE_MAX = 15;
const DURATION_LITERAL_BASELINE: Record<string, string[]> = {
  'src/components/hud/CrtIntro.astro': ['.crt__bar i | .2s', '.crt__bar | .12s', '.crt__caption | .12s', '.crt__flash | .18s', '.crt__screen | .18s', '.crt__start | .12s'],
  'src/islands/AccountLinks.css': [
    '.acct-dlg | 150ms',
    '.acct-dlg::backdrop, .acct-dlg[data-state="closing"]::backdrop | 150ms',
    '.acct-dlg[data-state="closing"] .acct-dlg__panel | 80ms',
    '.acct-dlg[data-state="open"] .acct-dlg__panel | 120ms',
    '.acct-dlg__card--out | 180ms',
    '.acct-dlg__card[data-anim="switch"] | 180ms',
    ':root[data-motion="reduce"] .acct-dlg | 150ms',
    ':root[data-motion="reduce"] .acct-dlg::backdrop, :root[data-motion="reduce"] .acct-dlg[data-state="closing"]::backdrop | 150ms',
  ],
};

/** The PX_FONT_BASELINE check for another per-file baseline: no new entry, no entry gone without being deleted. */
function expectShrinkingBaseline(name: string, actual: Record<string, string[]>, baseline: Record<string, string[]>, max: number, hint: string) {
  for (const file of new Set([...Object.keys(actual), ...Object.keys(baseline)])) {
    const got = actual[file] ?? [];
    const allowed = [...(baseline[file] ?? [])].sort();
    const count = (list: string[], x: string) => list.filter((y) => y === x).length;
    const extra = got.filter((x, i) => got.indexOf(x) === i && count(got, x) > count(allowed, x));
    const gone = allowed.filter((x, i) => allowed.indexOf(x) === i && count(allowed, x) > count(got, x));
    expect(extra, `${file}: ${hint}`).toEqual([]);
    expect(gone, `${file}: entries gone; delete them from ${name} (it only shrinks)`).toEqual([]);
  }
  const total = Object.values(baseline).reduce((n, list) => n + list.length, 0);
  expect(total, `${name}_MAX only goes down`).toBeLessThanOrEqual(max);
}

function scanAll(fn: (file: string, text: string) => string[]): Record<string, string[]> {
  const files = walk(join(ROOT, 'src')).filter((f) => /\.(css|astro)$/.test(f));
  expect(files).toEqual(expect.arrayContaining(GLOBAL_STYLES));
  return Object.fromEntries(files.map((f) => [f, fn(f, read(f))] as const).filter(([, list]) => list.length > 0));
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

  it('F-030: px font-size literals only where the shrinking baseline lists them (tokens.css and the Anton card title exempt)', () => {
    const files = walk(join(ROOT, 'src')).filter((f) => /\.(css|astro)$/.test(f));
    expect(files).toEqual(expect.arrayContaining(GLOBAL_STYLES));
    const actual = Object.fromEntries(files.map((f) => [f, pxFontSizes(f, read(f))] as const).filter(([, list]) => list.length > 0));
    if (process.env.PRINT_PX_FONT_BASELINE) console.log(JSON.stringify(actual, null, 2));
    for (const file of new Set([...Object.keys(actual), ...Object.keys(PX_FONT_BASELINE)])) {
      const got = actual[file] ?? [];
      const allowed = [...(PX_FONT_BASELINE[file] ?? [])].sort();
      const extra = got.filter((x, i) => got.indexOf(x) === i && got.filter((y) => y === x).length > allowed.filter((y) => y === x).length);
      const gone = allowed.filter((x, i) => allowed.indexOf(x) === i && allowed.filter((y) => y === x).length > got.filter((y) => y === x).length);
      expect(extra, `${file}: new px font sizes; use a --fs-* token`).toEqual([]);
      expect(gone, `${file}: literals gone; delete them from PX_FONT_BASELINE (it only shrinks)`).toEqual([]);
    }
    const total = Object.values(PX_FONT_BASELINE).reduce((n, list) => n + list.length, 0);
    expect(total, 'PX_FONT_BASELINE_MAX only goes down').toBeLessThanOrEqual(PX_FONT_BASELINE_MAX);
    // DataNav's name keeps its px size (no type token is 20px); the editorial <pre> takes --fs-meta, the 14px token.
    expect(stripComments(read('src/styles/editorial.css'))).toMatch(/article\.ed-prose pre \{[^}]*font-size: var\(--fs-meta\)/);
    expect(PX_FONT_BASELINE['src/components/data/DataNav.astro']).toContain('.data-nav__name | 20px');
    // Exemptions: tokens.css is never listed; the Anton card title keeps its px sizes without an entry.
    expect(Object.keys(PX_FONT_BASELINE)).not.toContain('src/styles/tokens.css');
    expect(stripComments(read('src/components/player-log/MembershipCard.astro'))).toMatch(/\.mcard__title\s*\{[^}]*font-size:\s*\d+px/);
    expect((PX_FONT_BASELINE['src/components/player-log/MembershipCard.astro'] ?? []).some((x) => x.startsWith('.mcard__title |'))).toBe(false);
  });

  it('Z1: hover colour, border and transform rules sit inside @media (hover: hover) (shrinking baseline)', () => {
    const actual = scanAll(hoverOutsideMedia);
    if (process.env.PRINT_HOVER_BASELINE) console.log(JSON.stringify(actual, null, 2));
    expectShrinkingBaseline('HOVER_OUTSIDE_BASELINE', actual, HOVER_OUTSIDE_BASELINE, HOVER_OUTSIDE_BASELINE_MAX, 'new :hover rules outside @media (hover: hover); move them inside and add an :active press state');
  });

  it('Z1: transition and animation durations are var(--dur-*) or 0 (shrinking baseline)', () => {
    const actual = scanAll(literalDurations);
    if (process.env.PRINT_DURATION_BASELINE) console.log(JSON.stringify(actual, null, 2));
    expectShrinkingBaseline('DURATION_LITERAL_BASELINE', actual, DURATION_LITERAL_BASELINE, DURATION_LITERAL_BASELINE_MAX, 'new literal durations; use a --dur-* token');
  });

  it('F-030: item titles are set in --fs-sub', () => {
    const TITLES: [string, string][] = [
      ['src/components/records/EducationTimeline.astro', '.timeline__school'],
      ['src/components/records/ProjectSummaryList.astro', '.psum__title'],
      ['src/components/records/AwardList.astro', '.award__title'],
      ['src/components/research/InProgressList.astro', '.progress-list__name'],
      ['src/components/research/PublicationItem.astro', '.pub__title'],
      ['src/components/research/InterestCards.astro', '.interests__title'],
      ['src/components/home/ResearchHighlight.astro', '.paper__title'],
      ['src/components/home/ResearchHighlight.astro', '.rh-ed__title'],
      ['src/components/player-log/SiteAchievementList.astro', '.site-ach__title'],
      ['src/styles/editorial.css', ':root[data-variant="data"] .ed-item__title'],
    ];
    for (const [file, selector] of TITLES) {
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const body = new RegExp(`(?:^|[}\\s])${escaped}\\s*\\{([^}]*)\\}`).exec(stripComments(read(file)))?.[1];
      expect(body, `${selector} in ${file}`).toMatch(/font-size:\s*var\(--fs-sub\)/);
    }
  });

  it('F-067: the cartridge has no colour literal; the membership card keeps its scoped --mc-* palette with an exemption note', () => {
    const cart = scannedCss('src/components/projects/ProjectCartridge.astro', read('src/components/projects/ProjectCartridge.astro'));
    expect(cart.match(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g) ?? []).toEqual([]);
    const card = read('src/components/player-log/MembershipCard.astro');
    expect(card).toMatch(/--mc-\* is a scoped palette, exempt from the tokens-only colour rule/);
    const literals = scannedCss('src/components/player-log/MembershipCard.astro', card).split(';').filter((d) => /#[0-9a-fA-F]{3,8}\b|\brgba?\(/.test(d));
    for (const d of literals) expect(d.trim(), 'colour literals only in --mc-* declarations').toMatch(/^(?:[^{]*\{\s*)?--mc-[\w-]+:/);
  });

  it('no negative letter-spacing', () => {
    expect(violationsOf('letter-spacing')).toEqual([]);
  });

  it('no font-weight 100–300', () => {
    expect(violationsOf('font-weight')).toEqual([]);
  });

  it('--font-card only in MembershipCard.astro, --font-anton only in tokens.css and PlayerLogView.astro; --font-cover only in the chooser sheet (MO-23)', () => {
    const files = walk(join(ROOT, 'src')).filter((f) => /\.(css|astro|ts|tsx|mjs|js|md|mdx)$/.test(f));
    expect(files).toEqual(expect.arrayContaining(GLOBAL_STYLES));
    const cardUsers = files.filter((f) => read(f).includes('var(--font-card'));
    const antonUsers = files.filter((f) => read(f).includes('--font-anton'));
    expect(cardUsers.filter((f) => f !== 'src/components/player-log/MembershipCard.astro')).toEqual([]);
    expect(antonUsers.filter((f) => f !== 'src/styles/tokens.css' && f !== 'src/views/PlayerLogView.astro')).toEqual([]);
    expect(read('src/styles/tokens.css')).toMatch(/--font-card:\s*var\(--font-anton,/);
    expect(read('src/styles/tokens.css')).toMatch(/--font-cover:\s*"SB Cover Display",/);
    const coverUsers = files.filter((f) => read(f).includes('var(--font-cover'));
    expect(coverUsers).toEqual(['src/styles/chooser.css']);
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
    { file: 'src/styles/hud.css', selector: '.badge--tier:lang(ko)', alsoZeroesTracking: true },
    { file: 'src/components/hud/MainMenu.astro', selector: '.mm__title:lang(ko)', alsoZeroesTracking: false },
    { file: 'src/components/hud/MainMenu.astro', selector: '.mm__cap:lang(ko)', alsoZeroesTracking: false },
    { file: 'src/components/hud/MainMenu.astro', selector: '.mm__hint:lang(ko)', alsoZeroesTracking: true },
    { file: 'src/components/projects/ProjectCartridge.astro', selector: '.cart__tags li:lang(ko)', alsoZeroesTracking: true },
    { file: 'src/components/hud/SiteFooter.astro', selector: '.site-footer__motion:lang(ko)', alsoZeroesTracking: false },
    { file: 'src/components/hud/SiteFooter.astro', selector: '.site-footer__copy:lang(ko)', alsoZeroesTracking: true },
    { file: 'src/components/hud/SiteFooter.astro', selector: '.site-footer__updated:lang(ko)', alsoZeroesTracking: true },
    { file: 'src/components/hud/SiteFooter.astro', selector: '.site-footer a:lang(ko)', alsoZeroesTracking: true },
    { file: 'src/components/hud/Hero.astro', selector: '.hero__credit-part:lang(ko)', alsoZeroesTracking: true },
    { file: 'src/components/stats/StatsSummary.astro', selector: ':global(.stats__live-label:lang(ko))', alsoZeroesTracking: true },
    { file: 'src/islands/FavoriteGames.css', selector: '.fg__tab small:lang(ko)', alsoZeroesTracking: true },
    { file: 'src/islands/FavoriteGames.css', selector: '.fg__meta li:lang(ko)', alsoZeroesTracking: true },
    { file: 'src/islands/FavoriteGames.css', selector: '.fg__credit:lang(ko)', alsoZeroesTracking: true },
    { file: 'src/islands/CharacterStage.css', selector: '.char-stage__btn:lang(ko)', alsoZeroesTracking: true },
    { file: 'src/components/research/AucOverallChart.astro', selector: '.chart__summary:lang(ko)', alsoZeroesTracking: true },
    { file: 'src/components/hud/PlayerCard.astro', selector: '.player-card__class:lang(ko)', alsoZeroesTracking: true },
    { file: 'src/styles/chooser.css', selector: '.file--game .toc:lang(ko)', alsoZeroesTracking: false },
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

  it('F-030 px font-size scan: px literals in font-size and the font shorthand; tokens, rem and the exemptions pass', () => {
    const css = [
      '.a { font-size: 14px; }',
      '.b { font: 700 15px/1.3 var(--font-mono); }',
      '.c { font-size: clamp(28px, 5vw, 56px); }',
      '.d { font: 600 var(--fs-label, 12px)/1.5 var(--font-mono); }',
      '.e { font-size: var(--fs-sub); padding: 14px; }',
      '.f { font: 600 var(--fs-label)/1.5 var(--font-mono); }',
      '.g { font-size: .875rem; line-height: 20px; }',
      '@media (min-width: 734px) { .a { font-size: 16px; } }',
    ].join('\n');
    expect(pxFontSizes('fixture.css', css)).toEqual(['.a | 14px', '.a | 16px', '.b | 15px', '.c | clamp(28px, 5vw, 56px)', '.d | var(--fs-label, 12px)']);
    expect(pxFontSizes('src/styles/tokens.css', ':root { --x: 1px; } .a { font-size: 14px; }')).toEqual([]);
    const card = '<style>.mcard__title { font-size: 31px; } .mcard__title small { font-size: 13px; }</style>';
    expect(pxFontSizes('src/components/player-log/MembershipCard.astro', card)).toEqual(['.mcard__title small | 13px']);
  });

  it('Z1 scanner fixtures: hover outside/inside the media, :focus-within beside :hover, 150ms vs var(--dur-menu) vs 0s, delays ignored', () => {
    expect(hoverOutsideMedia('fixture.css', '.a:hover{color:red}')).toEqual(['.a:hover']);
    expect(hoverOutsideMedia('fixture.css', '@media (hover: hover){.a:hover{color:red}}')).toEqual([]);
    expect(hoverOutsideMedia('fixture.css', '@media (hover:hover) and (prefers-reduced-motion: reduce){.a:hover{transform:none}}')).toEqual([]);
    expect(hoverOutsideMedia('fixture.css', '.a:hover{cursor:pointer}')).toEqual([]);
    expect(hoverOutsideMedia('fixture.css', '.a:hover{--cut-line:red}')).toEqual(['.a:hover']);
    expect(hoverOutsideMedia('fixture.css', '@media (min-width: 734px){.a:hover .p, .a:focus-within .p{border-color:red}}')).toEqual(['.a:hover .p, .a:focus-within .p']);
    expect(hoverOutsideMedia('fixture.css', '.a:focus-within .p{color:red} @media (hover: hover){.a:hover .p{color:red}}')).toEqual([]);
    expect(hoverOutsideMedia('src/components/Fixture.astro', '---\nconst x = 1;\n---\n<a>x</a>\n<style>a:hover { color: red; }</style>')).toEqual(['a:hover']);
    expect(literalDurations('fixture.css', '.a{transition:opacity 150ms linear}')).toEqual(['.a | 150ms']);
    expect(literalDurations('fixture.css', '.a{transition:opacity var(--dur-menu) linear, transform 0s}')).toEqual([]);
    expect(literalDurations('fixture.css', '.a{animation:k var(--dur-enter) var(--ease-out) .2s both}')).toEqual([]);
    expect(literalDurations('fixture.css', '.a{transition-duration:.2s, 0ms} @media (prefers-reduced-motion: reduce){.b{animation:k .15s ease-in both}}')).toEqual(['.a | .2s', '.b | .15s']);
    expect(literalDurations('fixture.css', '@keyframes k { from { opacity: 0; } to { opacity: 1; } } .a{animation-delay:.3s}')).toEqual([]);
    // a calc() of --dur-* tokens is a token duration (the arrival cue's draw + hold + fade)
    expect(literalDurations('fixture.css', '.a::before{animation:cue-rule calc(var(--dur-panel-in) + var(--dur-streak)) var(--ease-out)}')).toEqual([]);
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
