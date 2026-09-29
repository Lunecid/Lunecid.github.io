// P2-2a (contract §2.2, §8.1 F-8): one page module per version and language. Each imports only the layout its version
// names (Astro bundles the CSS of every module a page imports, rendered or not) and hands it to the shared view.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getVariant } from '../../src/variants';
import { VARIANT_IDS } from '../../src/variants/ids';

const read = (rel: string): string => readFileSync(rel, 'utf8');
const LAYOUT = { base: 'BaseLayout', data: 'DataLayout' } as const;
const PAGES = ['index.astro', 'records.astro', 'research/index.astro', 'research/[slug].astro', 'projects/index.astro', 'projects/[slug].astro'];
const ROOTS = [['src/pages', 'ko'], ['src/pages/en', 'en']] as const;
const astroFiles = (dir: string, root: string = dir): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? astroFiles(join(dir, e.name), root) : e.name.endsWith('.astro') ? [relative(root, join(dir, e.name)).split(sep).join('/')] : [],
  );
/** Value imports of a version layout; type-only imports are erased and add no module edge, so no CSS. */
const layoutImports = (src: string): string[] =>
  [...src.matchAll(/^import\s+(?!type\s)\w+\s+from\s+'(?:\.\.\/)+layouts\/(BaseLayout|DataLayout)\.astro';/gm)].map((m) => m[1]!);

describe('version page modules (P2-2a)', () => {
  it('no [variant] route and no VariantLayout remain; each version has its own page files', () => {
    expect(existsSync('src/pages/[variant]')).toBe(false);
    expect(existsSync('src/pages/en/[variant]')).toBe(false);
    expect(existsSync('src/layouts/VariantLayout.astro')).toBe(false);
    for (const [root] of ROOTS) {
      expect(astroFiles(`${root}/game`).sort(), `${root}/game`).toEqual([...PAGES, 'player-log.astro'].sort());
      expect(astroFiles(`${root}/data`).sort(), `${root}/data`).toEqual([...PAGES].sort());
    }
  });

  it('every page module imports the layout its version names and hands it to the view with its version and language', () => {
    for (const variant of VARIANT_IDS) {
      const layout = LAYOUT[getVariant(variant).layout];
      for (const [root, lang] of ROOTS) {
        for (const page of PAGES) {
          const file = `${root}/${variant}/${page}`;
          const src = read(file);
          expect(layoutImports(src), file).toEqual([layout]);
          expect(src, file).toContain(`layout={${layout}}`);
          expect(src, file).toContain(`variant="${variant}"`);
          expect(src, file).toContain(`lang="${lang}"`);
        }
      }
    }
  });

  it('no view imports a version layout as a value (PlayerLogView, game only, imports BaseLayout); page-layout.ts is type-only', () => {
    for (const file of readdirSync('src/views').filter((f) => f.endsWith('.astro'))) {
      expect(layoutImports(read(`src/views/${file}`)), file).toEqual(file === 'PlayerLogView.astro' ? ['BaseLayout'] : []);
    }
    expect(read('src/layouts/page-layout.ts')).not.toMatch(/^import\s+(?!type\s)/m);
  });

  it('no general page module, data-only component or DataLayout imports GhostArt (the game version\'s Miku watermark, site-v1 6d729ec)', () => {
    const files = [
      ...ROOTS.flatMap(([root]) => astroFiles(`${root}/data`).map((file) => `${root}/data/${file}`)),
      ...astroFiles('src/components/data').map((file) => `src/components/data/${file}`),
      'src/layouts/DataLayout.astro',
    ];
    // import lines and asset paths only: DataLayout's header comment names GhostArt to say it is not there
    for (const file of files) expect(read(file), file).not.toMatch(/^\s*import\b[^\n]*\bGhostArt\b|assets\/ghost\//m);
  });
});
