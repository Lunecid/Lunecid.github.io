// The case overlay's faces (CS-8): declared once, in the lazy stylesheet only, exactly as src/lib/fonts.ts builds them;
// the packages are pinned; nothing else in src references the placeholders.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CASE_FACES, CASE_DISPLAY_FAMILY, CASE_SERIF_FAMILY, CASE_SERIF_KO_FAMILY, CASE_UI_FAMILY, FONT_URL, fontFaceRule } from '../../src/lib/fonts';
import { walk } from '../helpers/fs';

const FONTS_CSS = readFileSync('src/lib/case/case-fonts.css', 'utf8');

describe('case overlay fonts', () => {
  it('case-fonts.css holds exactly the fontFaceRule of each case face, in order', () => {
    const rules = [...FONTS_CSS.matchAll(/@font-face\{[^}]*\}/g)].map((m) => m[0]);
    expect(rules).toEqual(CASE_FACES.map((face) => fontFaceRule(face)));
    expect(readFileSync('src/lib/case/overlay.css', 'utf8')).toMatch(/^@import '\.\/case-fonts\.css';$/m);
  });

  it('renamed families (Lora and Playfair Display carry Reserved Font Names); the stack falls back to SB Sans for Hangul UI text', () => {
    expect([CASE_SERIF_FAMILY, CASE_DISPLAY_FAMILY, CASE_UI_FAMILY, CASE_SERIF_KO_FAMILY]).toEqual(['SB Case Serif', 'SB Case Display', 'SB Case UI', 'SB Case Serif KR']);
    const tokens = readFileSync('src/styles/case-tokens.css', 'utf8');
    expect(tokens).toContain('--cs-ui: "SB Case UI", "SB Sans",');
    expect(tokens).toContain('--cs-serif: "SB Case Serif", "SB Case Serif KR",');
    expect(tokens).not.toMatch(/Noto Sans KR|fonts\.googleapis|"Lora"|"Playfair Display"|"Open Sans"/);
  });

  it('no page, layout or global sheet references a case face; only fonts.ts, case-fonts.css and the font build do', () => {
    const urls = CASE_FACES.map((face) => FONT_URL[face]);
    const users = walk('src').filter((f) => /\.(astro|ts|tsx|css|mjs)$/.test(f)).filter((f) => urls.some((u) => readFileSync(f, 'utf8').includes(u)));
    expect(users.map((f) => f.replace(/\\/g, '/')).sort()).toEqual(['src/lib/case/case-fonts.css', 'src/lib/fonts.ts']);
  });

  it('the three new font packages are pinned to exact versions', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { dependencies: Record<string, string> };
    for (const name of ['@fontsource-variable/lora', '@fontsource-variable/playfair-display', '@fontsource-variable/open-sans']) expect(pkg.dependencies[name], name).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
