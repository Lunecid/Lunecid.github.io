// Shared by the print-component tests (CvAcademic, ResumeEn, ResumeKo): the ResumeModel of one document, built from the
// real content, and the HTML helpers they use.
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { z } from 'astro/zod';
import type { DocumentId } from '../../src/config';
import { awardSchema, projectSchema, publicationSchema, resumeSchema } from '../../src/content/schemas';
import { parseYamlDocument, parseYamlList } from '../../src/content/yaml-loader';
import { ACADEMIC_EXTRAS, DOC_LANG, buildResumeModel, type ResumeModel } from '../../src/lib/resume-model';
import { getVariant, resolveIdentity } from '../../src/variants';
import { gameVariant } from '../../src/variants/game';
import { listMarkdown, readFrontmatter } from '../content/helpers';
import { loadFactSource } from '../helpers/fact-source';

/** The model of `doc` as built from src/data and src/content, with the game identity and project order. */
export function modelOf(doc: DocumentId): ResumeModel {
  const root = process.cwd();
  const identity = resolveIdentity(gameVariant, DOC_LANG[doc], loadFactSource());
  return buildResumeModel({
    resume: resumeSchema.parse(parseYamlDocument(readFileSync(join(root, 'src/data/resume.yaml'), 'utf8'), 'resume')),
    projects: (['ko', 'en'] as const).flatMap((lang) =>
      listMarkdown(join(root, 'src/content/projects', lang)).map((f) => ({ slug: basename(f, '.md'), lang, data: projectSchema(z.string()).parse(readFrontmatter(f)) })),
    ),
    publications: listMarkdown(join(root, 'src/content/publications')).map((f) => ({ id: basename(f, '.md'), data: publicationSchema(z.string()).parse(readFrontmatter(f)) })),
    awards: parseYamlList(readFileSync(join(root, 'src/data/awards.yaml'), 'utf8')).map((a) => awardSchema.parse(a)),
    doc,
    today: '2026-09-26',
    academicExtras: ACADEMIC_EXTRAS,
    identity: { headline: identity.headline, tagline: identity.tagline },
    order: getVariant('game').orders.pdfProjectOrder,
  });
}

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Text as Astro renders it (the English tagline's apostrophe becomes &#39;). */
export const escHtml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
/** Index of each `<h2>` heading in `html` (-1 when it is missing), in the order given. */
export const positions = (html: string, headings: string[]): number[] => headings.map((h) => html.search(new RegExp(`<h2[^>]*>${esc(h)}</h2>`)));
