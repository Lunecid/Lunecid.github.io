// Contract §2.3: after the move, links are built only by src/lib/links.ts. Base-form path literals live only in data and
// in the route/link/OG modules; prefixed version paths only in the route/link/id modules; localizeHref only in links/utils.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
const strip = (s: string) => s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
const files = walk(join(ROOT, 'src'))
  .filter((f) => /\.(ts|tsx|astro|mjs)$/.test(f))
  .map((f) => ({ rel: relative(ROOT, f).split(sep).join('/'), text: strip(readFileSync(f, 'utf8')) }));

const BASE_LITERAL = /['"`]\/(?:research|projects|records|player-log|stats|privacy|credits)\//;
const PREFIXED_LITERAL = /['"`]\/(?:en\/)?(?:game|data)\//;
const DATA_DIRS = /^src\/(?:data|content|variants)\//;

describe('path literals (contract §2.3)', () => {
  it('localizeHref( appears only in src/lib/links.ts and src/i18n/utils.ts', () => {
    const allowed = new Set(['src/lib/links.ts', 'src/i18n/utils.ts']);
    expect(files.filter((f) => !allowed.has(f.rel) && f.text.includes('localizeHref(')).map((f) => f.rel)).toEqual([]);
  });

  it('prefixed version paths are spelled only by routes, links and ids', () => {
    const allowed = new Set(['src/lib/routes.ts', 'src/lib/links.ts', 'src/variants/ids.ts']);
    expect(files.filter((f) => !allowed.has(f.rel) && PREFIXED_LITERAL.test(f.text)).map((f) => f.rel)).toEqual([]);
  });

  it('base-form path literals live only in data and in routes/links/og-pages', () => {
    const allowed = new Set(['src/lib/routes.ts', 'src/lib/links.ts', 'src/lib/og-pages.ts']);
    expect(files.filter((f) => !allowed.has(f.rel) && !DATA_DIRS.test(f.rel) && BASE_LITERAL.test(f.text)).map((f) => f.rel)).toEqual([]);
  });

  it('langPrefix is gone (contract §2.3)', () => {
    expect(readFileSync(join(ROOT, 'src/i18n/utils.ts'), 'utf8')).not.toMatch(/export function langPrefix/);
  });
});
