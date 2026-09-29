import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { z } from 'astro/zod';
import { describe, expect, it } from 'vitest';
import ResumeKo from '../../src/components/print/ResumeKo.astro';
import { awardSchema, projectSchema, publicationSchema, resumeSchema } from '../../src/content/schemas';
import { parseYamlDocument, parseYamlList } from '../../src/content/yaml-loader';
import { ACADEMIC_EXTRAS, DOC_LANG, buildResumeModel } from '../../src/lib/resume-model';
import { listMarkdown, readFrontmatter } from '../content/helpers';
import { renderAstro } from './helpers';
import { getVariant, resolveIdentity } from '../../src/variants';
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
  doc: 'resume-ko',
  today: '2026-09-26',
  academicExtras: ACADEMIC_EXTRAS,
  identity: (() => { const i = resolveIdentity(gameVariant, DOC_LANG['resume-ko'], loadFactSource()); return { headline: i.headline, tagline: i.tagline }; })(),
  order: getVariant('game').orders.pdfProjectOrder,
});
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Text as Astro renders it (the English tagline's apostrophe becomes &#39;). */
const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const positions = (html: string, headings: string[]) => headings.map((h) => html.search(new RegExp(`<h2[^>]*>${esc(h)}</h2>`)));

describe('ResumeKo', () => {
  it('one h1 with the name; tagline; section order; no img', async () => {
    const html = await renderAstro(ResumeKo, { props: { model } });
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html).toMatch(/<h1[^>]*>백성은<\/h1>/);
    expect(html).toContain(escHtml(model.tagline));
    expect(html).toContain('todtjddms104204@pusan.ac.kr');
    const order = positions(html, ['학력', '논문·발표', '프로젝트', '수상', '대외활동', '자격', '어학', '교육', '기술']);
    expect(order.every((i) => i >= 0), JSON.stringify(order)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toContain('4.0/4.5');
    expect(html).toContain('(졸업 예정)');
    expect(html).toContain('CDS빅데이터 교육');
    expect(html).toContain('부산대학교');
    expect(html).toContain('CCAIM Machine Learning for Healthcare Summer School 2026');
    expect(html).toMatch(/print__meta">부산대학교<\/p>/);
    expect(html).not.toMatch(/부산대학교 · /);
    expect(html).not.toMatch(/print__meta">케임브리지대학교 CCAIM\(Cambridge Centre for AI in Medicine\) · 온라인 참가 · /);
    expect(html).not.toMatch(/<img[\s>]/);
  });
});
