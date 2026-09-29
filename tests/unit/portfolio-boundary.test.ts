// B-8 / contract §1.4: views, components, layouts and page files read facts only through src/lib/portfolio.ts.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const FACT_COLLECTIONS = ['projects', 'publications', 'news', 'resume', 'awards', 'jobfit'];
const ALLOWED = new Set(['src/lib/portfolio.ts', 'src/content.config.ts']);

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
}

describe('portfolio boundary', () => {
  it('fact collections are read only in src/lib/portfolio.ts', () => {
    const reader = new RegExp(`\\b(?:getCollection|getEntry)\\(\\s*['"\`](?:${FACT_COLLECTIONS.join('|')})['"\`/]`);
    const offenders = walk(join(ROOT, 'src'))
      .filter((f) => /\.(ts|tsx|astro|mjs)$/.test(f))
      .map((f) => relative(ROOT, f).split(sep).join('/'))
      .filter((rel) => !ALLOWED.has(rel) && reader.test(readFileSync(join(ROOT, rel), 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('the old readers are gone from projects.ts and publications.ts', () => {
    const projects = readFileSync(join(ROOT, 'src/lib/projects.ts'), 'utf8');
    const publications = readFileSync(join(ROOT, 'src/lib/publications.ts'), 'utf8');
    expect(projects).not.toMatch(/export async function (getProjects|projectStaticPaths)\b/);
    expect(publications).not.toMatch(/export async function (getPublications|getPaperPages|paperStaticPaths)\b/);
    expect(projects).not.toMatch(/from 'astro:content'.*getCollection|getCollection\(/);
    expect(publications).not.toMatch(/getCollection\(/);
  });
});
