import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { LoaderContext } from 'astro/loaders';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseYamlDocument, parseYamlList, yamlDocumentLoader, yamlDocumentsLoader, yamlListLoader } from '../../src/content/yaml-loader';

describe('parse functions', () => {
  it('parseYamlDocument adds the id', () => {
    const doc = parseYamlDocument('profile:\n  name: { ko: 백성은, en: Seongeun Baek }\n', 'resume');
    expect(doc.id).toBe('resume');
    expect(doc.profile).toEqual({ name: { ko: '백성은', en: 'Seongeun Baek' } });
    expect(parseYamlDocument('id: jobfit\nasOf: "2026-09-25"\n', 'jobfit').id).toBe('jobfit');
    expect(() => parseYamlDocument('id: other\n', 'jobfit')).toThrow(/different id/);
    expect(() => parseYamlDocument('- a\n- b\n', 'resume')).toThrow(/mapping/);
    expect(() => parseYamlDocument('', 'resume')).toThrow(/mapping/);
  });

  it('parseYamlList reads a root list and a listKey list', () => {
    expect(parseYamlList('- id: a\n  n: 1\n- id: b\n  n: 2\n').map((i) => i.id)).toEqual(['a', 'b']);
    const games = parseYamlList('# comment\ngames:\n  - id: zzz\n  - id: genshin\n', 'games');
    expect(games.map((g) => g.id)).toEqual(['zzz', 'genshin']);
    expect(() => parseYamlList('games:\n  - id: zzz\n')).toThrow(/list at the root/);
    expect(() => parseYamlList('- id: zzz\n', 'games')).toThrow(/'games'/);
  });

  it('parseYamlList throws on a missing or duplicate id', () => {
    expect(() => parseYamlList('- id: a\n- name: no-id\n')).toThrow(/Item 1 .*missing a string id/);
    expect(() => parseYamlList('- id: a\n- id: a\n')).toThrow(/Duplicate id 'a'/);
    expect(() => parseYamlList('- id: 7\n')).toThrow(/missing a string id/);
    expect(() => parseYamlList('- just-a-string\n')).toThrow(/not a mapping/);
  });

  it('parse functions throw on YAML syntax errors', () => {
    const broken = 'profile:\n  name: [unclosed\n';
    expect(() => parseYamlDocument(broken, 'resume')).toThrow(/invalid YAML/);
    expect(() => parseYamlList('- id: a\n  title: "unterminated\n')).toThrow(/invalid YAML/);
  });

  it('quoted dates stay strings, unquoted dates become Date (js-yaml 4 behaviour)', () => {
    const [item] = parseYamlList("- id: a\n  quoted: '2025-07-11'\n  unquoted: 2025-07-11\n  month: 2025-07\n");
    expect(item?.quoted).toBe('2025-07-11');
    expect(item?.unquoted).toBeInstanceOf(Date);
    expect(item?.month).toBe('2025-07');
  });
});

describe('loaders', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  function fakeContext(root: string) {
    const entries = new Map<string, Record<string, unknown>>();
    const warnings: string[] = [];
    const parseData = vi.fn(async ({ data }: { id: string; data: Record<string, unknown> }) => ({ ...data, validated: true }));
    const context = {
      config: { root: pathToFileURL(`${root}/`) },
      store: {
        clear: () => entries.clear(),
        set: ({ id, data }: { id: string; data: Record<string, unknown> }) => {
          entries.set(id, data);
          return true;
        },
      },
      parseData,
      logger: { warn: (message: string) => warnings.push(message), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
      watcher: undefined,
    } as unknown as LoaderContext;
    return { context, entries, warnings, parseData };
  }

  function tempRoot(): string {
    const dir = mkdtempSync(join(tmpdir(), 'yaml-loader-'));
    dirs.push(dir);
    mkdirSync(join(dir, 'src/data'), { recursive: true });
    return dir;
  }

  it('yamlListLoader stores one validated entry per item and only warns when the file is missing', async () => {
    const root = tempRoot();
    const missing = fakeContext(root);
    await yamlListLoader('src/data/favorites.yaml', 'games').load(missing.context);
    expect(missing.entries.size).toBe(0);
    expect(missing.warnings).toEqual(['src/data/favorites.yaml not found']);

    writeFileSync(join(root, 'src/data/favorites.yaml'), 'games:\n  - id: zzz\n    locked: false\n  - id: steam\n    locked: true\n');
    const present = fakeContext(root);
    await yamlListLoader('src/data/favorites.yaml', 'games').load(present.context);
    expect([...present.entries.keys()]).toEqual(['zzz', 'steam']);
    expect(present.entries.get('steam')).toEqual({ id: 'steam', locked: true, validated: true });
    expect(present.parseData).toHaveBeenCalledTimes(2);
  });

  it('yamlDocumentLoader stores one entry and a YAML error rejects the load (fails the build)', async () => {
    const root = tempRoot();
    writeFileSync(join(root, 'src/data/resume.yaml'), "profile:\n  site: https://lunecid.github.io\ndocuments: []\n");
    const ok = fakeContext(root);
    await yamlDocumentLoader('src/data/resume.yaml', 'resume').load(ok.context);
    expect([...ok.entries.keys()]).toEqual(['resume']);
    expect(ok.entries.get('resume')).toMatchObject({ id: 'resume', documents: [], validated: true });

    writeFileSync(join(root, 'src/data/resume.yaml'), 'profile:\n  site: [unclosed\n');
    const broken = fakeContext(root);
    await expect(yamlDocumentLoader('src/data/resume.yaml', 'resume').load(broken.context)).rejects.toThrow(/^src\/data\/resume\.yaml: .*invalid YAML/);

    writeFileSync(join(root, 'src/data/achievements.yaml'), '- id: a\n- title: no id\n');
    const noId = fakeContext(root);
    await expect(yamlListLoader('src/data/achievements.yaml').load(noId.context)).rejects.toThrow(/missing a string id/);
  });
});

describe('yamlDocumentsLoader (A-13)', () => {
  function context(root: URL) {
    const entries = new Map<string, { id: string; data: unknown }>();
    const warnings: string[] = [];
    return {
      entries,
      warnings,
      ctx: {
        store: { clear: () => entries.clear(), set: (e: { id: string; data: unknown }) => entries.set(e.id, e) },
        parseData: async ({ data }: { data: unknown }) => data,
        logger: { warn: (m: string) => warnings.push(m), error: () => undefined, info: () => undefined },
        watcher: undefined,
        config: { root },
      },
    };
  }

  it('stores one entry per key (id = key), warns and skips a missing file, fails on a parse error', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'yaml-docs-'));
    writeFileSync(join(dir, 'a.yaml'), 'title: A\n');
    writeFileSync(join(dir, 'bad.yaml'), 'title: [unclosed\n');
    const root = pathToFileURL(`${dir}/`);
    const ok = context(root);
    const loader = yamlDocumentsLoader({ game: 'a.yaml', data: 'missing.yaml' });
    expect(loader.name).toBe('yaml-documents');
    await loader.load(ok.ctx as never);
    expect([...ok.entries.keys()]).toEqual(['game']);
    expect(ok.entries.get('game')?.data).toEqual({ title: 'A', id: 'game' });
    expect(ok.warnings.join('\n')).toMatch(/missing\.yaml not found/);
    const bad = context(root);
    await expect(yamlDocumentsLoader({ game: 'bad.yaml' }).load(bad.ctx as never)).rejects.toThrow(/bad\.yaml/);
  });
});
