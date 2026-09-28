import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import Hello from '../astro/fixtures/Hello.astro';
import { renderAstro } from '../astro/helpers';

const read = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

describe('toolchain', () => {
  it('astro config sets site, trailingSlash, compressHTML, build.format and i18n', async () => {
    const { default: config } = await import('../../astro.config.mjs');
    expect(config.site).toBe('https://lunecid.github.io');
    expect(config.trailingSlash).toBe('always');
    expect(config.compressHTML).toBe(true);
    expect(config.build?.format).toBe('directory');
    // Task 30 fix round 1, re-measured against 'auto' in batch 2: page CSS is inlined into <head> instead of a
    // render-blocking <link rel="stylesheet"> (see astro.config.mjs; Lighthouse local run preferred 'always').
    expect(config.build?.inlineStylesheets).toBe('always');
    expect(config.i18n).toEqual({ defaultLocale: 'ko', locales: ['ko', 'en'], routing: { prefixDefaultLocale: false } });
    // Batch 2: font-subsets subsets the page fonts after the build (scripts/fonts/build.mjs).
    expect((config.integrations ?? []).map((i) => (i && 'name' in i ? i.name : ''))).toEqual(['@astrojs/react', '@astrojs/sitemap', 'font-subsets']);
  });

  it('final fix 2 item 12: every Fonts API family is read from installed files, so a cold-cache build needs no network', async () => {
    const { default: config } = await import('../../astro.config.mjs');
    const fonts = (config.fonts ?? []) as { name: string; provider: { name: string }; options?: { variants: { src: string[] }[] } }[];
    expect(fonts.map((f) => f.name)).toEqual(['Pretendard Print', 'Anton']);
    for (const font of fonts) {
      expect(font.provider.name, font.name).toBe('local'); // the npm provider fetched the files from cdn.jsdelivr.net
      for (const variant of font.options?.variants ?? []) {
        for (const src of variant.src) expect(existsSync(new URL(`../../node_modules/${src}`, import.meta.url)), src).toBe(true);
      }
    }
    expect(read('astro.config.mjs')).not.toMatch(/fontProviders\.(?!local\b)\w+\(/);
  });

  it('final fix 2 item 20: the sitemap adds x-default (= the Korean page) to the ko/en links, as the page heads do', async () => {
    const { sitemapSerialize } = await import('../../astro.config.mjs');
    const links = [
      { url: 'https://lunecid.github.io/records/', lang: 'ko' },
      { url: 'https://lunecid.github.io/en/records/', lang: 'en' },
    ];
    const item = { url: 'https://lunecid.github.io/en/records/', links };
    expect(sitemapSerialize(item).links).toEqual([...links, { url: 'https://lunecid.github.io/records/', lang: 'x-default' }]);
    expect(sitemapSerialize({ url: 'https://lunecid.github.io/404/' })).toEqual({ url: 'https://lunecid.github.io/404/' });
    expect(read('astro.config.mjs')).toMatch(/locales: \{ ko: 'ko', en: 'en' \}/);
  });

  it('sitemapFilter drops /print/ routes and keeps /en/', async () => {
    const { sitemapFilter } = await import('../../astro.config.mjs');
    expect(sitemapFilter('https://lunecid.github.io/print/resume-ko/')).toBe(false);
    expect(sitemapFilter('https://lunecid.github.io/print/cv-academic/')).toBe(false);
    expect(sitemapFilter('https://lunecid.github.io/en/')).toBe(true);
    expect(sitemapFilter('https://lunecid.github.io/en/projects/kickick-park/')).toBe(true);
    expect(sitemapFilter('https://lunecid.github.io/')).toBe(true);
  });

  it('package.json pins typescript ~6.0.3, js-yaml ^4.3.2 and node >=22.18.0', () => {
    const pkg = JSON.parse(read('package.json')) as {
      type: string; engines: { node: string }; scripts: Record<string, string>;
      dependencies: Record<string, string>; devDependencies: Record<string, string>;
    };
    expect(pkg.type).toBe('module');
    expect(pkg.devDependencies.typescript).toBe('~6.0.3');
    expect(pkg.dependencies['js-yaml']).toBe('^4.3.2');
    expect(pkg.engines.node).toBe('>=22.18.0');
    expect(pkg.scripts.check).toBe('astro check');
    expect(pkg.scripts['test:ops']).toBe('node --test "tests/ops/*.test.mjs"');
  });

  it('tsconfig excludes .claude/worktrees and .gitignore lists it', () => {
    const tsconfig = JSON.parse(read('tsconfig.json')) as { extends: string; exclude: string[]; compilerOptions: Record<string, string> };
    expect(tsconfig.extends).toBe('astro/tsconfigs/strict');
    expect(tsconfig.exclude).toEqual(expect.arrayContaining(['dist', 'coverage', '.claude/worktrees', '.superpowers']));
    expect(tsconfig.compilerOptions.jsx).toBe('react-jsx');
    const ignored = read('.gitignore').split('\n').map((l) => l.trim());
    for (const line of ['.claude/worktrees/', 'src/data/generated/', 'playwright-report/', 'test-results/', '.lighthouseci/', 'coverage/', '.superpowers/', 'docs/superpowers/', '.cursor-handoff/', 'node_modules/', 'dist/', '.astro/']) {
      expect(ignored, line).toContain(line);
    }
  });

  it('.gitattributes has one binary pattern per line', () => {
    const lines = read('.gitattributes').split('\n').filter((l) => l.trim() !== '');
    expect(lines[0]).toBe('* text=auto eol=lf');
    for (const line of lines.slice(1)) expect(line).toMatch(/^\*\.[a-z0-9]+ binary$/);
    const exts = lines.slice(1).map((l) => l.slice(2, l.indexOf(' ')));
    expect(exts).toEqual(expect.arrayContaining(['png', 'webp', 'jpg', 'pdf', 'woff2', 'mp3']));
  });

  it('config constants match the spec', async () => {
    const { SITE, CV_HREF, DOCUMENTS, PRINT_ROUTES, STORAGE_KEYS, GOATCOUNTER, MEDIA, NAV_HEIGHT_PX, HUD_LABEL_LIME, RIOT_NOTICE_ON_PAGES } = await import('../../src/config');
    expect(SITE.email).toBe('todtjddms104204@pusan.ac.kr');
    expect(SITE.githubLogin).toBe('Lunecid');
    expect(CV_HREF.ko).toBe('/cv/seongeun-baek-resume-ko.pdf');
    expect(CV_HREF.en).toBe('/cv/seongeun-baek-resume-en.pdf');
    expect(Object.keys(DOCUMENTS)).toEqual(Object.keys(PRINT_ROUTES));
    expect(Object.values(PRINT_ROUTES).every((r) => /^\/print\/[a-z-]+\/$/.test(r))).toBe(true);
    expect(STORAGE_KEYS.motion).toBe('sb:motion');
    expect(STORAGE_KEYS.intro).toBe('sb:intro');
    expect(GOATCOUNTER.sri.startsWith('sha384-')).toBe(true);
    expect(GOATCOUNTER.code === null || /^[a-z0-9-]+$/.test(GOATCOUNTER.code)).toBe(true);
    expect(MEDIA.bgm).toBe('/audio/bgm/everything-you-ever-dreamed.mp3');
    expect(NAV_HEIGHT_PX).toBe(52);
    expect(HUD_LABEL_LIME).toBe(false);
    expect(RIOT_NOTICE_ON_PAGES).toBe(false);
  });

  it('config.ts and types.ts have no import statements', () => {
    for (const rel of ['src/config.ts', 'src/types.ts']) {
      const src = read(rel);
      expect(src, rel).not.toMatch(/^\s*import\b/m);
      expect(src, rel).not.toMatch(/\bfrom\s+['"]/);
      expect(src, rel).not.toMatch(/\brequire\(/);
      expect(src, rel).not.toMatch(/^\s*(export\s+)?(const\s+)?enum\b|^\s*(export\s+)?namespace\b/m);
    }
    // Plain Node (type stripping, Node >= 22.18) must load both files, as scripts/*.mjs do.
    const out = execFileSync(process.execPath, ['-e', "Promise.all([import('./src/config.ts'), import('./src/types.ts')]).then(([c, t]) => console.log(c.DOCUMENTS['resume-ko'] + ' ' + t.CHARACTER_IDS.join(',')))"], { encoding: 'utf8' });
    expect(out.trim()).toBe('/cv/seongeun-baek-resume-ko.pdf remielle,eula,mona');
  });

  it('shared id lists', async () => {
    const types = await import('../../src/types');
    expect(types.CHARACTER_IDS).toEqual(['remielle', 'eula', 'mona']);
    expect(types.NAV_SECTIONS).toEqual(['research', 'projects', 'records', 'player-log']);
    expect(types.ACHIEVEMENT_TRIGGERS).toHaveLength(8);
    expect(new Set(types.ACHIEVEMENT_TRIGGERS).size).toBe(8);
    expect(types.NOTICE_KEYS).toContain('riot');
    expect(types.CERTIFICATE_IDS).toEqual(['busan-mayor-award', 'cds-encouragement-award', 'multicampus-grand-award']);
    expect(types.GAME_IDS).toEqual(['zzz', 'genshin', 'lol', 'dnf', 'steam']);
    expect(types.SFX_NAMES).toEqual(['move', 'select', 'open', 'close']);
    expect(types.PAGE_IDS).toContain('not-found');
  });

  it('favicon.svg is the vector [SB] mark in accent on hud-bg', () => {
    const svg = read('public/favicon.svg');
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    expect(svg).toContain('fill="#0B0D11"');
    expect(svg).toContain('stroke="#C8F03C"');
    expect(svg).toMatch(/>SB<\/text>/);
    expect(svg).not.toMatch(/<image|data:image/);
  });

  it('Container renders an Astro fixture', async () => {
    const html = await renderAstro(Hello, { props: { name: 'x' } });
    expect(html).toMatch(/<p class="hello"[^>]*>hello x<\/p>/);
  });
});
