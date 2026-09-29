// tests/helpers/fact-source.ts — the fact source built from the committed YAML and frontmatter, without Astro (vitest).
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { z } from 'astro/zod';
import { awardSchema, projectSchema, publicationSchema, resumeSchema } from '../../src/content/schemas';
import { parseYamlDocument, parseYamlList } from '../../src/content/yaml-loader';
import { buildFactSource, type FactSource } from '../../src/lib/facts';
import { listMarkdown, readFrontmatter } from '../content/helpers';

const ROOT = process.cwd();
const text = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');
let cached: FactSource | null = null;

export function loadFactSource(): FactSource {
  if (cached) return cached;
  const resume = resumeSchema.parse(parseYamlDocument(text('src/data/resume.yaml'), 'resume'));
  const awards = parseYamlList(text('src/data/awards.yaml')).map((item) => awardSchema.parse(item));
  const publications = listMarkdown(join(ROOT, 'src/content/publications')).map((file) => ({
    id: basename(file, '.md'),
    data: publicationSchema(z.string()).parse(readFrontmatter(file)),
  }));
  const projects = (['ko', 'en'] as const).flatMap((lang) =>
    listMarkdown(join(ROOT, 'src/content/projects', lang)).map((file) => ({
      slug: basename(file, '.md'),
      lang,
      data: projectSchema(z.string()).parse(readFrontmatter(file)),
    })),
  );
  cached = buildFactSource({ resume, awards, publications, projects });
  return cached;
}
