import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { z } from 'astro/zod';
import { describe, expect, it } from 'vitest';
import ResumeEn from '../../src/components/print/ResumeEn.astro';
import { awardSchema, projectSchema, publicationSchema, resumeSchema } from '../../src/content/schemas';
import { parseYamlDocument, parseYamlList } from '../../src/content/yaml-loader';
import { ACADEMIC_EXTRAS, DOC_LANG, buildResumeModel } from '../../src/lib/resume-model';
import { listMarkdown, readFrontmatter } from '../content/helpers';
import { renderAstro } from './helpers';
import { resolveIdentity } from '../../src/variants';
import { gameVariant } from '../../src/variants/game';
import { loadFactSource } from '../helpers/fact-source';

const root = process.cwd();
const model = buildResumeModel({
  resume: resumeSchema.parse(parseYamlDocument(readFileSync(join(root, 'src/data/resume.yaml'), 'utf8'), 'resume')),
  projects: (['ko', 'en'] as const).flatMap((lang) =>
    listMarkdown(join(root, 'src/content/projects', lang)).map((f) => ({ slug: basename(f, '.md'), lang, data: projectSchema(z.string()).parse(readFrontmatter(f)) })),
  ),
  publications: listMarkdown(join(root, 'src/content/publications')).map((f) => ({ id: basename(f, '.md'), data: publicationSchema(z.string()).parse(readFrontmatter(f)) })),
  awards: parseYamlList(readFileSync(join(root, 'src/data/awards.yaml'), 'utf8')).map((a) => awardSchema.parse(a)),
  doc: 'resume-en',
  today: '2026-09-26',
  academicExtras: ACADEMIC_EXTRAS,
  identity: (() => { const i = resolveIdentity(gameVariant, DOC_LANG['resume-en'], loadFactSource()); return { headline: i.headline, tagline: i.tagline }; })(),
});
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Text as Astro renders it (the English tagline's apostrophe becomes &#39;). */
const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const positions = (html: string, headings: string[]) => headings.map((h) => html.search(new RegExp(`<h2[^>]*>${esc(h)}</h2>`)));

describe('ResumeEn', () => {
  it('one h1 with the name; tagline; section order; no img', async () => {
    const html = await renderAstro(ResumeEn, { props: { model } });
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html).toMatch(/<h1[^>]*>Seongeun Baek<\/h1>/);
    expect(html).toContain(escHtml(model.tagline));
    expect(html).toMatch(/class="print print--compact"/);
    const order = positions(html, ['Education', 'Publications and talks', 'Projects', 'Awards', 'Certifications', 'Languages', 'Training', 'Skills']);
    expect(order.every((i) => i >= 0), JSON.stringify(order)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).not.toMatch(/<h2[^>]*>Activities<\/h2>/); // no activity is flagged for the English résumé
    expect(html).toContain('(expected)');
    expect(html).not.toContain('CDS Big Data Training');
    expect(html).not.toContain('CCAIM Machine Learning for Healthcare Summer School 2026');
    expect(html).not.toMatch(/<img[\s>]/);
  });

  it('final review fix 1 item 11: the CoG link says "paper page" (D-15: abstract only), project pages say "case study"', async () => {
    const html = await renderAstro(ResumeEn, { props: { model } });
    expect(html).toMatch(/<a[^>]*href="https:\/\/lunecid\.github\.io\/en\/research\/cog-2026-engagement\/"[^>]*>↗ paper page<\/a>/);
    expect(html).not.toMatch(/href="[^"]*\/research\/cog-2026-engagement\/"[^>]*>↗ case study</);
    expect(html).toMatch(/<a[^>]*href="https:\/\/lunecid\.github\.io\/en\/projects\/kickick-park\/"[^>]*>↗ case study<\/a>/);
  });
});
