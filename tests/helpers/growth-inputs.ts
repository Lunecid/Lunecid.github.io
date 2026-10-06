// tests/helpers/growth-inputs.ts — the growth builder's inputs from the committed YAML and frontmatter, without Astro
// (the same sources ResearchView reads through src/lib/portfolio.ts).
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { z } from 'astro/zod';
import { awardSchema, projectSchema, publicationSchema, resumeSchema } from '../../src/content/schemas';
import { parseYamlDocument, parseYamlList } from '../../src/content/yaml-loader';
import type { Lang } from '../../src/i18n/ui';
import type { GrowthInputs } from '../../src/lib/growth';
import { listMarkdown, readFrontmatter } from '../content/helpers';
import { loadFactSource } from './fact-source';

const ROOT = process.cwd();
const text = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');

export function loadGrowthInputs(lang: Lang): GrowthInputs {
  return {
    projects: listMarkdown(join(ROOT, 'src/content/projects', lang)).map((file) => ({
      slug: basename(file, '.md'),
      data: projectSchema(z.string()).parse(readFrontmatter(file)),
    })),
    awards: parseYamlList(text('src/data/awards.yaml')).map((item) => awardSchema.parse(item)),
    resume: resumeSchema.parse(parseYamlDocument(text('src/data/resume.yaml'), 'resume')),
    publications: listMarkdown(join(ROOT, 'src/content/publications')).map((file) => ({
      id: basename(file, '.md'),
      data: publicationSchema(z.string()).parse(readFrontmatter(file)),
    })),
    facts: loadFactSource(),
  };
}
