import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { z } from 'astro/zod';
import { describe, expect, it } from 'vitest';
import CvAcademic from '../../src/components/print/CvAcademic.astro';
import { awardSchema, projectSchema, publicationSchema, resumeSchema } from '../../src/content/schemas';
import { parseYamlDocument, parseYamlList } from '../../src/content/yaml-loader';
import { ACADEMIC_EXTRAS, buildResumeModel } from '../../src/lib/resume-model';
import { listMarkdown, readFrontmatter } from '../content/helpers';
import { renderAstro } from './helpers';

const root = process.cwd();
const model = buildResumeModel({
  resume: resumeSchema.parse(parseYamlDocument(readFileSync(join(root, 'src/data/resume.yaml'), 'utf8'), 'resume')),
  projects: (['ko', 'en'] as const).flatMap((lang) =>
    listMarkdown(join(root, 'src/content/projects', lang)).map((f) => ({ slug: basename(f, '.md'), lang, data: projectSchema(z.string()).parse(readFrontmatter(f)) })),
  ),
  publications: listMarkdown(join(root, 'src/content/publications')).map((f) => ({ id: basename(f, '.md'), data: publicationSchema(z.string()).parse(readFrontmatter(f)) })),
  awards: parseYamlList(readFileSync(join(root, 'src/data/awards.yaml'), 'utf8')).map((a) => awardSchema.parse(a)),
  doc: 'cv-academic',
  today: '2026-09-26',
  academicExtras: ACADEMIC_EXTRAS,
});
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Text as Astro renders it (the English tagline's apostrophe becomes &#39;). */
const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const positions = (html: string, headings: string[]) => headings.map((h) => html.search(new RegExp(`<h2[^>]*>${esc(h)}</h2>`)));

describe('CvAcademic', () => {
  it('one h1 with the name; tagline; section order; no img', async () => {
    const html = await renderAstro(CvAcademic, { props: { model } });
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html).toMatch(/<h1[^>]*>Seongeun Baek<\/h1>/);
    expect(html).toContain(escHtml(model.tagline));
    const headings = [
      'Research interests', 'Education', 'Publications',
      ...(model.presentations.length > 0 ? ['Presentations'] : []),
      'Work in progress', 'Projects', 'Awards', 'Languages', 'Training', 'Skills',
    ];
    const order = positions(html, headings);
    expect(order.every((i) => i >= 0), JSON.stringify(order)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    if (ACADEMIC_EXTRAS.abstract) expect(html).toContain('We study how much pre-engagement signal');
    expect(html).toContain('DataLab');
    expect(html).toContain('CDS Big Data Training');
    expect(html).toContain('Pusan National University');
    expect(html).toContain('CCAIM Machine Learning for Healthcare Summer School 2026');
    expect(html).toMatch(/print__meta">Pusan National University<\/p>/);
    expect(html).not.toMatch(/Pusan National University · /);
    expect(html).not.toMatch(/print__meta">Cambridge Centre for AI in Medicine \(CCAIM\), University of Cambridge \(online\) · /);
    expect(html).not.toMatch(/<img[\s>]/);
  });

  it('owner 2026-09-28: the removed course project is not in the Academic CV', async () => {
    const html = await renderAstro(CvAcademic, { props: { model } });
    expect(html).not.toMatch(/counseling-nlp|↗ project summary/);
  });
});
