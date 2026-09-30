import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import Hello from '../astro/fixtures/Hello.astro';
import { renderAstro } from '../astro/helpers';

const read = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

describe('toolchain', () => {
  it('astro config sets site, trailingSlash, compressHTML, build.format and i18n', { timeout: 30_000 }, async () => {
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
    // P1-13 (A-6): legacy-redirects runs last, after the sitemap and the font subsetting.
    // AL-1 (C0): csp-finalize re-hashes every inline block after the font rewrite, before the stubs (own CSP meta).
    expect((config.integrations ?? []).map((i) => (i && 'name' in i ? i.name : ''))).toEqual(['@astrojs/react', '@astrojs/sitemap', 'font-subsets', 'csp-finalize', 'legacy-redirects']);
    expect(config.security?.csp).toMatchObject({ algorithm: 'SHA-256' });
  });

  it('final fix 2 item 12: every Fonts API family is read from installed files, so a cold-cache build needs no network', { timeout: 30_000 }, async () => {
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

  it('final fix 2 item 20: the sitemap adds x-default (= the Korean page) to the ko/en links, as the page heads do', { timeout: 30_000 }, async () => {
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

  it('sitemapFilter drops /print/ routes and keeps /en/', { timeout: 30_000 }, async () => {
    const { sitemapFilter } = await import('../../astro.config.mjs');
    expect(sitemapFilter('https://lunecid.github.io/print/resume-ko/')).toBe(false);
    expect(sitemapFilter('https://lunecid.github.io/print/cv-academic/')).toBe(false);
    expect(sitemapFilter('https://lunecid.github.io/en/')).toBe(true);
    expect(sitemapFilter('https://lunecid.github.io/en/game/projects/kickick-park/')).toBe(true);
    expect(sitemapFilter('https://lunecid.github.io/')).toBe(true);
  });

  it('AL-8 (DV-32): the @generated alias is src/data/generated, and tests/fixtures/generated only when SB_E2E_ACCOUNTS=1', { timeout: 60_000 }, async () => {
    const dir = (rel: string) => fileURLToPath(new URL(`../../${rel}`, import.meta.url)).replace(/[\\/]+$/, '');
    const aliasOf = (config: { vite?: { resolve?: { alias?: unknown } } }) =>
      String((config.vite?.resolve?.alias as Record<string, string> | undefined)?.['@generated']).replace(/[\\/]+$/, '');
    // Each import uses its own query string, so the config module is evaluated again under that environment (a
    // computed specifier: TypeScript has no declaration for a query-string path).
    const load = async (query: string) => ((await import(/* @vite-ignore */ `../../astro.config.mjs?${query}`)) as { default: { vite?: { resolve?: { alias?: unknown } } } }).default;
    try {
      vi.stubEnv('SB_E2E_ACCOUNTS', undefined);
      expect(aliasOf(await load('al8-unset'))).toBe(dir('src/data/generated'));
      vi.stubEnv('SB_E2E_ACCOUNTS', 'yes');
      expect(aliasOf(await load('al8-yes'))).toBe(dir('src/data/generated'));
      vi.stubEnv('SB_E2E_ACCOUNTS', '1');
      expect(aliasOf(await load('al8-one'))).toBe(dir('tests/fixtures/generated'));
    } finally {
      vi.unstubAllEnvs();
    }
    // tsconfig mirrors the real path (the alias's only other home); the workflow never sets the switch (AL-1's csp case).
    const tsconfig = JSON.parse(read('tsconfig.json')) as { compilerOptions: { paths?: Record<string, string[]> } };
    expect(tsconfig.compilerOptions.paths).toEqual({ '@generated/*': ['src/data/generated/*'] });
    expect(read('.github/workflows/deploy.yml')).not.toContain('SB_E2E_ACCOUNTS');
  });

  it('AL-8 (DV-32): site code reaches generated data only through @generated and never names a fixture path', () => {
    const generated = read('src/lib/generated.ts');
    expect(generated).not.toContain('../data/generated');
    const globs = [...generated.matchAll(/import\.meta\.glob[^(\n]*\(\s*(\[[^\]]*\]|'[^']*')/g)].map((m) => m[1] ?? '');
    expect(globs.length).toBe(2);
    for (const glob of globs) for (const pattern of glob.match(/'[^']*'/g) ?? []) expect(pattern).toMatch(/^'@generated\//);
    // git grep exits 1 when nothing matches (the expected case) and 0 with the file list otherwise.
    const grep = spawnSync('git', ['grep', '--untracked', '-l', '-I', '-E', 'tests/fixtures|e2efixture|E2E Fixture', '--', 'src'], { encoding: 'utf8' });
    expect(grep.stdout.trim()).toBe('');
    expect(grep.status).toBe(1);
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

  it('external linkinator config has no skip and the npm script pins --config', () => {
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
    const external = JSON.parse(read('linkinator.external.json')) as Record<string, unknown>;
    expect(Object.hasOwn(external, 'skip')).toBe(false);
    expect(pkg.scripts['test:links:external']).toContain('--config linkinator.external.json');
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
    const config = await import('../../src/config');
    const { SITE, DOCUMENTS, PRINT_ROUTES, STORAGE_KEYS, GOATCOUNTER, MEDIA, NAV_HEIGHT_PX, HUD_LABEL_LIME, RIOT_NOTICE_ON_PAGES } = config;
    expect(SITE.email).toBe('todtjddms104204@pusan.ac.kr');
    expect(SITE.githubLogin).toBe('Lunecid');
    expect(Object.keys(DOCUMENTS)).toEqual(['resume-ko', 'resume-en', 'cv-academic', 'resume-data-ko', 'resume-data-en']);
    expect(DOCUMENTS['resume-data-ko']).toBe('/cv/seongeun-baek-resume-data-ko.pdf');
    expect(DOCUMENTS['resume-data-en']).toBe('/cv/seongeun-baek-resume-data-en.pdf');
    expect(PRINT_ROUTES['resume-data-en']).toBe('/print/resume-data-en/');
    expect(config).not.toHaveProperty('CV_HREF');
    expect(config).not.toHaveProperty('ACADEMIC_CV_HREF');
    expect(Object.keys(DOCUMENTS)).toEqual(Object.keys(PRINT_ROUTES));
    expect(Object.values(PRINT_ROUTES).every((r) => /^\/print\/[a-z-]+\/$/.test(r))).toBe(true);
    expect(STORAGE_KEYS.motion).toBe('sb:motion');
    expect(STORAGE_KEYS.intro).toBe('sb:intro');
    expect(STORAGE_KEYS.variant).toBe('sb:variant');
    expect(STORAGE_KEYS.bgmTime).toBe('sb:bgm-t');
    expect(GOATCOUNTER.sri.startsWith('sha384-')).toBe(true);
    expect(GOATCOUNTER.code === null || /^[a-z0-9-]+$/.test(GOATCOUNTER.code)).toBe(true);
    expect(MEDIA.bgm).toBe('/audio/bgm/everything-you-ever-dreamed.mp3');
    expect(NAV_HEIGHT_PX).toBe(52);
    expect(HUD_LABEL_LIME).toBe(false);
    expect(RIOT_NOTICE_ON_PAGES).toBe(false);
  });

  it('P1-14: the BgmToggle BGM_TIME_KEY (src/lib/bgm.ts, P1-9b) equals STORAGE_KEYS.bgmTime (contract §1.9, §6.1)', async () => {
    const { STORAGE_KEYS } = await import('../../src/config');
    const { BGM_TIME_KEY } = await import('../../src/lib/bgm');
    expect(BGM_TIME_KEY).toBe(STORAGE_KEYS.bgmTime);
  });

  it('config.ts, types.ts, account-ids.ts and account-config.ts have no import statements', () => {
    // AL-3: account-ids.ts and account-config.ts are also read by the fetch-accounts job (Node type stripping, no npm
    // dependencies) and by the relay Worker (esbuild), so they follow the same import-free, erasable-only rule.
    for (const rel of ['src/config.ts', 'src/types.ts', 'src/lib/account-ids.ts', 'src/lib/account-config.ts']) {
      const src = read(rel);
      expect(src, rel).not.toMatch(/^\s*import\b/m);
      expect(src, rel).not.toMatch(/\bfrom\s+['"]/);
      expect(src, rel).not.toMatch(/\brequire\(/);
      expect(src, rel).not.toMatch(/^\s*(export\s+)?(const\s+)?enum\b|^\s*(export\s+)?namespace\b/m);
    }
    // Plain Node (type stripping, Node >= 22.18) must load both files, as scripts/*.mjs do.
    const out = execFileSync(process.execPath, ['-e', "Promise.all([import('./src/config.ts'), import('./src/types.ts')]).then(([c, t]) => console.log(c.DOCUMENTS['resume-ko'] + ' ' + t.CHARACTER_IDS.join(',')))"], { encoding: 'utf8' });
    expect(out.trim()).toBe('/cv/seongeun-baek-resume-ko.pdf remielle,eula,mona');
    const accounts = execFileSync(
      process.execPath,
      ['--input-type=module', '-e', "const [i, c] = await Promise.all([import('./src/lib/account-ids.ts'), import('./src/lib/account-config.ts')]); console.log(i.ACCOUNT_VARS.length + ' ' + i.RIOT_REGION + ' ' + c.STEAM_SHOW_GAMES + ' ' + i.validateVar('ACCOUNT_GENSHIN_UID', ' 618285856 ').ok)"],
      { encoding: 'utf8' },
    );
    expect(accounts.trim()).toBe('7 kr false true');
  });

  it('P1-2: src/variants/ids.ts is import-free and plain Node loads src/lib/routes.ts', async () => {
    const ids = read('src/variants/ids.ts');
    expect(ids).not.toMatch(/^\s*import\b/m);
    expect(ids).not.toMatch(/\bfrom\s+['"]/);
    expect(ids).not.toMatch(/\brequire\(/);
    expect(ids).not.toMatch(/^\s*(export\s+)?(const\s+)?enum\b|^\s*(export\s+)?namespace\b/m);
    const out = execFileSync(
      process.execPath,
      ['--input-type=module', '-e', "const r = await import('./src/lib/routes.ts'); console.log(r.routePath('/', 'en', 'game') + ' ' + r.legacyRedirects().length)"],
      { encoding: 'utf8' },
    );
    // Contract §2.1: counts come from the table, never a literal. Plain Node and vitest must see the same table.
    const { legacyRedirects } = await import('../../src/lib/routes');
    expect(out.trim()).toBe(`/en/game/ ${legacyRedirects().length}`);
  });

  it('P1-3: Markdown links go through rehype-base-links, and plain Node loads the plugin', async () => {
    const { default: config } = await import('../../astro.config.mjs');
    const { baseLinksHastPlugin } = await import('../../scripts/markdown/rehype-base-links.mjs');
    // Astro 7 renders Markdown with Sätteri: the plugin is registered as a Sätteri hast plugin.
    const processor = config.markdown?.processor as { name: string; options: { hastPlugins: unknown[] } } | undefined;
    expect(processor?.name).toBe('satteri');
    expect(processor?.options.hastPlugins).toEqual([baseLinksHastPlugin]);
    const out = execFileSync(
      process.execPath,
      ['--input-type=module', '-e', "const m = await import('./scripts/markdown/rehype-base-links.mjs'); console.log(m.markdownHref('/stats/', 'en'))"],
      { encoding: 'utf8' },
    );
    expect(out.trim()).toBe('/en/stats/');
  });

  it('shared id lists', async () => {
    const types = await import('../../src/types');
    expect(types.CHARACTER_IDS).toEqual(['remielle', 'eula', 'mona']);
    expect(types.NAV_SECTIONS).toEqual(['research', 'projects', 'records', 'player-log']);
    expect(new Set(types.ACHIEVEMENT_TRIGGERS).size).toBe(types.ACHIEVEMENT_TRIGGERS.length);
    expect(types.ACHIEVEMENT_TRIGGERS).not.toContain('visit-404');
    expect(types.NOTICE_KEYS).toContain('riot');
    expect(types.CERTIFICATE_IDS).toEqual(['busan-mayor-award', 'cds-encouragement-award', 'multicampus-grand-award']);
    expect(types.GAME_IDS).toEqual(['zzz', 'genshin', 'lol', 'tft', 'dnf', 'eternal-return', 'hearthstone', 'steam']);
    expect(types.SFX_NAMES).toEqual(['move', 'select', 'open', 'close']);
    expect(types.PAGE_IDS).toContain('not-found');
    expect(types.PAGE_IDS).toContain('chooser');
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
