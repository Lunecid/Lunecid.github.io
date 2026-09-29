import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import rehypeBaseLinks, { baseLinksHastPlugin, langOfFile, markdownHref } from '../../scripts/markdown/rehype-base-links.mjs';

describe('markdownHref (A-5)', () => {
  it('localizes shared pages and the chooser, leaves documents and externals alone', () => {
    expect(markdownHref('/stats/', 'ko')).toBe('/stats/');
    expect(markdownHref('/stats/', 'en')).toBe('/en/stats/');
    expect(markdownHref('/stats/#summary', 'en')).toBe('/en/stats/#summary');
    expect(markdownHref('/', 'en')).toBe('/en/');
    expect(markdownHref('/cv/seongeun-baek-cv-academic.pdf', 'en')).toBe('/cv/seongeun-baek-cv-academic.pdf');
    for (const href of ['https://www.goatcounter.com/privacy', 'mailto:todtjddms104204@pusan.ac.kr', '#fn1', '//x.example/']) {
      expect(markdownHref(href, 'en'), href).toBe(href);
    }
  });

  it('throws on a version page, an unknown path, a bad hash or an already-prefixed path', () => {
    for (const href of ['/records/', '/research/cog-2026-engagement/', '/game/records/', '/en/stats/', '/nope/', '/stats/#nope', '/#hello']) {
      expect(() => markdownHref(href, 'ko'), href).toThrow(/rehype-base-links/);
    }
  });
});

describe('rehypeBaseLinks', () => {
  it('takes the language from the entry locale folder (none → ko) and rewrites <a href>', () => {
    expect(langOfFile({ path: 'C:\\repo\\src\\content\\legal\\en\\privacy.md' })).toBe('en');
    expect(langOfFile({ path: '/repo/src/content/projects/ko/kickick-park.md' })).toBe('ko');
    expect(langOfFile({ history: ['/repo/src/content/news/2026-09-01-cog-2026-oral.md'] })).toBe('ko');
    expect(langOfFile(undefined)).toBe('ko');
    const tree = {
      type: 'root',
      children: [
        { type: 'element', tagName: 'p', properties: {}, children: [
          { type: 'element', tagName: 'a', properties: { href: '/stats/' }, children: [{ type: 'text', value: 'Visitor stats' }] },
          { type: 'element', tagName: 'a', properties: { href: 'https://www.goatcounter.com/privacy' }, children: [] },
        ] },
      ],
    };
    rehypeBaseLinks()(tree, { path: '/repo/src/content/legal/en/privacy.md' });
    const [first, second] = (tree.children[0] as { children: { properties: { href: string } }[] }).children;
    expect(first?.properties.href).toBe('/en/stats/');
    expect(second?.properties.href).toBe('https://www.goatcounter.com/privacy');
  });

  it('fails the build on a version link in Markdown', () => {
    const tree = { type: 'root', children: [{ type: 'element', tagName: 'a', properties: { href: '/projects/kickick-park/' }, children: [] }] };
    expect(() => rehypeBaseLinks()(tree, { path: '/repo/src/content/projects/ko/x.md' })).toThrow(/Markdown cannot link a version page/);
  });
});

describe('baseLinksHastPlugin (Sätteri, the processor astro.config.mjs uses)', () => {
  const ctxFor = (path: string) => {
    const set: [unknown, string, unknown][] = [];
    return { set, ctx: { fileURL: new URL(`file://${path}`), setProperty: (node: unknown, key: string, value: unknown) => set.push([node, key, value]) } };
  };

  it('visits <a> only and rewrites a shared-page href in the language of the entry folder', () => {
    expect(baseLinksHastPlugin.element.filter).toEqual(['a']);
    const node = { type: 'element', tagName: 'a', properties: { href: '/stats/' }, children: [] };
    const en = ctxFor('/repo/src/content/legal/en/privacy.md');
    baseLinksHastPlugin.element.visit(node, en.ctx);
    expect(en.set).toEqual([[node, 'href', '/en/stats/']]);
    const ko = ctxFor('/repo/src/content/legal/ko/privacy.md');
    baseLinksHastPlugin.element.visit(node, ko.ctx);
    expect(ko.set).toEqual([]);
  });

  it('fails the build on a version link', () => {
    const node = { type: 'element', tagName: 'a', properties: { href: '/records/' }, children: [] };
    expect(() => baseLinksHastPlugin.element.visit(node, ctxFor('/repo/src/content/projects/ko/x.md').ctx)).toThrow(/Markdown cannot link a version page/);
  });
});

describe('every Markdown entry (the build only logs a render error, so this is the gate)', () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.md') ? [join(dir, e.name)] : []));

  it('links only shared pages, the chooser, documents or external targets', () => {
    const root = join(process.cwd(), 'src', 'content');
    const bad: string[] = [];
    for (const file of walk(root)) {
      const rel = relative(process.cwd(), file).split(sep).join('/');
      const body = readFileSync(file, 'utf8').replace(/^---[\s\S]*?\n---/, '');
      for (const m of body.matchAll(/\]\((\/[^)\s]*)\)|href="(\/[^"]*)"/g)) {
        const href = m[1] ?? m[2] ?? '';
        try {
          markdownHref(href, langOfFile({ path: `/${rel}` }));
        } catch {
          bad.push(`${rel}: ${href}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
