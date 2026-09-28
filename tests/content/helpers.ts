// tests/content/helpers.ts — shared readers for content tests (js-yaml 4 = Astro's parser, stack-core G3).
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { load } from 'js-yaml';

const ROOT = process.cwd();
const FRONTMATTER = /^---\n([\s\S]*?)\n---(?:\n|$)/;

function absolute(path: string): string {
  return isAbsolute(path) ? path : resolve(ROOT, path);
}

function readText(path: string): string {
  return readFileSync(absolute(path), 'utf8').replace(/\r\n/g, '\n');
}

/** Parsed YAML frontmatter of a Markdown file (repo-relative or absolute path). */
export function readFrontmatter(path: string): unknown {
  const match = FRONTMATTER.exec(readText(path));
  if (!match) throw new Error(`No frontmatter: ${path}`);
  return load(match[1] ?? '');
}

/** Markdown body after the frontmatter block (CRLF normalised). */
export function readBody(path: string): string {
  const text = readText(path);
  const match = FRONTMATTER.exec(text);
  return match ? text.slice(match[0].length) : text;
}

/** Parsed YAML file. */
export function loadYaml(path: string): unknown {
  return load(readText(path));
}

/** Absolute paths of the .md files directly inside `dir`, sorted by name. */
export function listMarkdown(dir: string): string[] {
  const base = absolute(dir);
  return readdirSync(base)
    .filter((name) => name.endsWith('.md'))
    .sort()
    .map((name) => join(base, name));
}

/** Resolves a path written inside a Markdown file (e.g. '../../../assets/x.webp') to an absolute path. */
export function resolveFromFile(mdPath: string, rel: string): string {
  return resolve(dirname(absolute(mdPath)), rel);
}

/** JSON-style paths ('$.a[0].b') of every Date object inside a parsed YAML value. */
export function findDates(value: unknown): string[] {
  const found: string[] = [];
  const walk = (node: unknown, path: string): void => {
    if (node instanceof Date) found.push(path);
    else if (Array.isArray(node)) node.forEach((child, i) => walk(child, `${path}[${i}]`));
    else if (node !== null && typeof node === 'object') {
      for (const [key, child] of Object.entries(node)) walk(child, `${path}.${key}`);
    }
  };
  walk(value, '$');
  return found;
}
