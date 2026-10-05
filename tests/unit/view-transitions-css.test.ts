// Cross-document page transitions (motion audit V1, V2, D-1): base.css opts every page in, names the site's nav only
// while a transition of type `page` runs, and fades the root through (old out first, then the new page in).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (file: string): string => readFileSync(join(ROOT, file), 'utf8');
const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');
const squash = (s: string): string => s.replace(/\s+/g, ' ').trim();
const BASE = stripComments(read('src/styles/base.css'));

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}
const rel = (full: string): string => relative(ROOT, full).split(sep).join('/');

/** CSS of a source file: a .css file whole, an .astro file's <style> blocks. */
function cssOf(file: string): string {
  const text = read(file);
  if (file.endsWith('.css')) return stripComments(text);
  return stripComments([...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n'));
}

type Rule = { selector: string; body: string; at: string[] };
/** Every style rule with the preludes of the at-rules around it; @keyframes bodies are skipped. */
function rules(css: string): Rule[] {
  const out: Rule[] = [];
  const visit = (text: string, at: string[]) => {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf('{', i);
      if (open < 0) break;
      const prelude = squash(text.slice(i, open).split(/[;}]/).pop()!);
      let depth = 1;
      let j = open + 1;
      for (; j < text.length && depth > 0; j++) {
        if (text[j] === '{') depth++;
        if (text[j] === '}') depth--;
      }
      const body = text.slice(open + 1, j - 1);
      if (/^@keyframes\b/.test(prelude)) {
        // frames are not rules
      } else if (prelude.startsWith('@') && body.includes('{')) visit(body, [...at, prelude]);
      else out.push({ selector: prelude, body: squash(body), at });
      i = j;
    }
  };
  visit(css, []);
  return out;
}

const decl = (body: string, prop: string): string | undefined =>
  body.split(';').map((d) => d.trim()).find((d) => d.startsWith(`${prop}:`))?.slice(prop.length + 1).trim();

function keyframes(css: string, name: string): string | null {
  const m = new RegExp(`@keyframes\\s+${name}\\s*\\{`).exec(css);
  if (!m) return null;
  let depth = 1;
  let j = m.index + m[0].length;
  for (; j < css.length && depth > 0; j++) {
    if (css[j] === '{') depth++;
    if (css[j] === '}') depth--;
  }
  return css.slice(m.index + m[0].length, j - 1);
}

describe('page transitions (base.css)', () => {
  it('V1: base.css opts every page in with @view-transition { navigation: auto; types: page }', () => {
    const at = rules(BASE).filter((r) => r.selector === '@view-transition');
    expect(at).toHaveLength(1);
    expect(at[0].at).toEqual([]); // not inside a media query: every page, every motion setting (D-1)
    expect(decl(at[0].body, 'navigation')).toBe('auto');
    expect(decl(at[0].body, 'types')).toBe('page');
  });

  it('V1: view-transition-name appears only under :active-view-transition-type(...)', () => {
    const files = walk(join(ROOT, 'src')).map(rel).filter((f) => /\.(css|astro)$/.test(f));
    const named = files.flatMap((f) => rules(cssOf(f)).filter((r) => decl(r.body, 'view-transition-name') !== undefined).map((r) => ({ f, ...r })));
    expect(named.length).toBeGreaterThanOrEqual(3);
    for (const r of named) expect(r.selector, `${r.f}: ${r.selector}`).toMatch(/:active-view-transition-type\(/);
    // no permanent name in markup either (inline style or Astro's transition:name)
    for (const f of files.filter((x) => x.endsWith('.astro'))) {
      const markup = read(f).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '');
      expect(markup, f).not.toMatch(/view-transition-name|transition:name/);
    }
    // the three navs are named under the page type, each only on its own version
    for (const [variant, cls, name] of [['game', 'hud-nav', 'nav-game'], ['data', 'data-nav', 'nav-data'], ['neutral', 'nt-header', 'nav-neutral']]) {
      const r = rules(BASE).find((x) => x.selector.includes(`.${cls}`) && decl(x.body, 'view-transition-name') !== undefined);
      expect(r?.selector, cls).toBe(`:root:active-view-transition-type(page)[data-variant="${variant}"] .${cls}`);
      expect(decl(r!.body, 'view-transition-name')).toBe(name);
      expect(decl(r!.body, 'view-transition-class')).toBe('site-nav');
    }
    // nothing names the hero blocks permanently
    for (const r of rules(BASE)) if (/\.(hero|dhero)\b/.test(r.selector)) expect(decl(r.body, 'view-transition-name')).toBeUndefined();
  });

  it('V1: the root fades through: out --dur-nav-out --ease-in, in --dur-nav-in --ease-out after --dur-nav-out', () => {
    const all = rules(BASE);
    const oldRoot = all.find((r) => r.selector.split(',').map((s) => s.trim()).includes('::view-transition-old(root)'));
    const newRoot = all.find((r) => r.selector.split(',').map((s) => s.trim()).includes('::view-transition-new(root)'));
    expect(decl(oldRoot!.body, 'animation')).toBe('vt-out var(--dur-nav-out) var(--ease-in) both');
    expect(decl(newRoot!.body, 'animation')).toBe('vt-in var(--dur-nav-in) var(--ease-out) var(--dur-nav-out) both');
    // an unpaired nav (version switch) fades with the root; a paired nav moves with --dur-hover
    expect(oldRoot!.selector).toContain('::view-transition-old(*.site-nav):only-child');
    expect(newRoot!.selector).toContain('::view-transition-new(*.site-nav):only-child');
    const group = all.find((r) => r.selector === '::view-transition-group(*.site-nav)');
    expect(decl(group!.body, 'animation-duration')).toBe('var(--dur-hover)');
  });

  it('V1: the vt keyframes animate opacity only; no reduce override (D-1)', () => {
    expect(squash(keyframes(BASE, 'vt-out') ?? '')).toBe('to { opacity: 0; }');
    expect(squash(keyframes(BASE, 'vt-in') ?? '')).toBe('from { opacity: 0; }');
    const reduceRules = rules(BASE).filter((r) => r.at.some((a) => a.includes('prefers-reduced-motion')) || r.selector.includes('data-motion="reduce"'));
    for (const r of reduceRules) expect(r.selector).not.toMatch(/view-transition/);
  });
});
