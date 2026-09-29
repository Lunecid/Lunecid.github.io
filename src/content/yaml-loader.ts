// src/content/yaml-loader.ts — Content Layer loaders for the YAML data files.
// Unlike astro's file() loader (which only logs), a YAML syntax error, a non-mapping root,
// or a missing/duplicate id THROWS, so `astro build` fails (stack-core G4).
// Parsing uses js-yaml 4, the same parser Astro bundles (unquoted YYYY-MM-DD becomes a Date).
import { existsSync, promises as fs } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';
import type { Loader, LoaderContext } from 'astro/loaders';

type Item = Record<string, unknown> & { id: string };

function isMapping(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date);
}

function parseYaml(text: string, label: string): unknown {
  try {
    return load(text);
  } catch (error) {
    throw new Error(`${label}: invalid YAML: ${(error as Error).message}`);
  }
}

/** Whole YAML document as one record with the given id. Throws on syntax errors or non-object roots. */
export function parseYamlDocument(text: string, id: string): Record<string, unknown> & { id: string } {
  const data = parseYaml(text, `YAML document '${id}'`);
  if (!isMapping(data)) throw new Error(`YAML document '${id}' must have a mapping at its root`);
  if (data.id !== undefined && data.id !== id) {
    throw new Error(`YAML document '${id}' declares a different id: ${String(data.id)}`);
  }
  return { ...data, id };
}

/** Array at the root (or at `listKey`) of items that each have a unique string `id`. Throws on missing/duplicate ids. */
export function parseYamlList(text: string, listKey?: string): Array<Record<string, unknown> & { id: string }> {
  const where = listKey === undefined ? 'the root' : `'${listKey}'`;
  const data = parseYaml(text, `YAML list at ${where}`);
  const list = listKey === undefined ? data : isMapping(data) ? data[listKey] : undefined;
  if (!Array.isArray(list)) throw new Error(`Expected a YAML list at ${where}`);
  const seen = new Set<string>();
  return list.map((item: unknown, index: number): Item => {
    if (!isMapping(item)) throw new Error(`Item ${index} at ${where} is not a mapping`);
    const id = item.id;
    if (typeof id !== 'string' || id === '') throw new Error(`Item ${index} at ${where} is missing a string id`);
    if (seen.has(id)) throw new Error(`Duplicate id '${id}' at ${where}`);
    seen.add(id);
    return { ...item, id };
  });
}

function yamlLoader(name: 'yaml-document' | 'yaml-list', file: string, parse: (text: string) => Item[]): Loader {
  return {
    name,
    load: async ({ store, parseData, logger, watcher, config }: LoaderContext) => {
      const absPath = resolve(fileURLToPath(new URL(file, config.root)));
      const sync = async (): Promise<void> => {
        store.clear();
        if (!existsSync(absPath)) {
          logger.warn(`${file} not found`);
          return;
        }
        let items: Item[];
        try {
          items = parse(await fs.readFile(absPath, 'utf8'));
        } catch (error) {
          throw new Error(`${file}: ${(error as Error).message}`);
        }
        for (const item of items) {
          const data = await parseData({ id: item.id, data: item, filePath: absPath });
          store.set({ id: item.id, data, filePath: file });
        }
      };
      await sync(); // build: errors propagate and fail the build
      watcher?.add(absPath);
      watcher?.on('change', (changed: string) => {
        if (resolve(changed) !== absPath) return;
        sync().catch((error: unknown) => logger.error(`${file}: ${(error as Error).message}`)); // dev: keep the server alive
      });
    },
  };
}

/** Loader: reads `file` (repo-relative), stores one entry `id`, validates through parseData. */
export function yamlDocumentLoader(file: string, id: string): Loader {
  return yamlLoader('yaml-document', file, (text) => [parseYamlDocument(text, id)]);
}

/** Loader: reads `file`, stores one entry per list item keyed by item.id. */
export function yamlListLoader(file: string, listKey?: string): Loader {
  return yamlLoader('yaml-list', file, (text) => parseYamlList(text, listKey));
}

/**
 * Loader (A-13): one entry per key of `files` (entry id = key, repo-relative paths). A missing file warns and is skipped
 * (the pending job-fit table, §2.6); a parse error fails the build.
 */
export function yamlDocumentsLoader(files: Readonly<Record<string, string>>): Loader {
  return {
    name: 'yaml-documents',
    load: async ({ store, parseData, logger, watcher, config }: LoaderContext) => {
      const docs = Object.entries(files).map(([id, file]) => ({ id, file, absPath: resolve(fileURLToPath(new URL(file, config.root))) }));
      const sync = async (): Promise<void> => {
        store.clear();
        for (const { id, file, absPath } of docs) {
          if (!existsSync(absPath)) {
            logger.warn(`${file} not found (entry '${id}' skipped)`);
            continue;
          }
          let item: Item;
          try {
            item = parseYamlDocument(await fs.readFile(absPath, 'utf8'), id);
          } catch (error) {
            throw new Error(`${file}: ${(error as Error).message}`);
          }
          const data = await parseData({ id, data: item, filePath: absPath });
          store.set({ id, data, filePath: file });
        }
      };
      await sync();
      for (const { absPath } of docs) watcher?.add(absPath);
      watcher?.on('change', (changed: string) => {
        if (!docs.some((doc) => doc.absPath === resolve(changed))) return;
        sync().catch((error: unknown) => logger.error((error as Error).message));
      });
      watcher?.on('add', (added: string) => {
        if (!docs.some((doc) => doc.absPath === resolve(added))) return;
        sync().catch((error: unknown) => logger.error((error as Error).message));
      });
    },
  };
}
