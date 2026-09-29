// Version order lists (spec §4.2, contract §1.6 comments). Explicit lists are reviewable (A-17); these tests keep them valid.
import { basename, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { z } from 'astro/zod';
import { describe, expect, it } from 'vitest';
import { projectSchema, publicationSchema, resumeSchema } from '../../src/content/schemas';
import { parseYamlDocument } from '../../src/content/yaml-loader';
import { orderedItems } from '../../src/lib/portfolio';
import { PROJECT_SLUGS } from '../../src/lib/routes';
import { VARIANT_IDS, getVariant, parseOrderItem, type OrderItem } from '../../src/variants';
import { listMarkdown, readFrontmatter } from '../content/helpers';

const ROOT = process.cwd();
const resume = resumeSchema.parse(parseYamlDocument(readFileSync(join(ROOT, 'src/data/resume.yaml'), 'utf8'), 'resume'));
const projects = listMarkdown(join(ROOT, 'src/content/projects/ko')).map((file) => ({
  id: `ko/${basename(file, '.md')}`,
  data: projectSchema(z.string()).parse(readFrontmatter(file)),
}));
const publications = listMarkdown(join(ROOT, 'src/content/publications')).map((file) => ({
  id: basename(file, '.md'),
  data: publicationSchema(z.string()).parse(readFrontmatter(file)),
}));
const hasPage = (item: OrderItem): boolean => {
  const ref = parseOrderItem(item);
  if (ref.kind === 'pub') return publications.find((p) => p.id === ref.id)?.data.caseStudy !== undefined;
  return projects.find((p) => p.id === `ko/${ref.slug}`)?.data.status !== 'card';
};
/** Which résumé flags each version's PDFs read (game: the two résumés and the Academic CV; data: the two résumés). */
const FLAGS_USED = { game: ['ko', 'en', 'academic'], data: ['ko', 'en'] } as const;

describe('version order lists', () => {
  it('the values fixed by spec §4.2 and contract §1.7', () => {
    const game = getVariant('game').orders;
    const data = getVariant('data').orders;
    expect(game.homeFeatured).toEqual(['pub:cog-2026-engagement', 'project:school-zone-blindspots', 'project:kickick-park']);
    expect(data.homeFeatured).toEqual(['project:school-zone-blindspots', 'project:youth-startup-location', 'project:kickick-park']);
    // P1 keeps today's order; P2 Task 6 (P-07, owner decision 13, audit 2026-09-29) changes game.projectsOrder to ['pub:cog-2026-engagement','project:school-zone-blindspots','project:kickick-park','project:kbo-attendance','project:seoul-apartment-automl','project:youth-startup-location'] and this pin with it; the span-2 selector of ProjectCartridge stays.
    expect(game.projectsOrder).toEqual(['pub:cog-2026-engagement', 'project:school-zone-blindspots', 'project:kickick-park', 'project:youth-startup-location', 'project:kbo-attendance', 'project:seoul-apartment-automl']);
    expect(data.projectsOrder).toEqual(['project:school-zone-blindspots', 'project:youth-startup-location', 'project:kickick-park', 'pub:cog-2026-engagement', 'project:kbo-attendance', 'project:seoul-apartment-automl']);
    expect(game.recordsProjectsOrder).toEqual(PROJECT_SLUGS.map((slug) => `project:${slug}`));
    expect(data.recordsProjectsOrder).toEqual(data.projectsOrder.filter((item) => item.startsWith('project:'))); // A-18
    expect(game.pdfProjectOrder).toEqual(['pub:cog-2026-engagement', 'project:youth-startup-location', 'project:school-zone-blindspots', 'project:kickick-park']);
    expect(data.pdfProjectOrder).toEqual(['project:school-zone-blindspots', 'project:youth-startup-location', 'project:kickick-park', 'pub:cog-2026-engagement']);
  });

  for (const id of VARIANT_IDS) {
    it(`${id}: every list is valid (contract §1.6)`, () => {
      const o = getVariant(id).orders;
      const unique = (list: readonly string[]) => expect(new Set(list).size, `${id} duplicates`).toBe(list.length);
      for (const list of [o.homeFeatured, o.projectsOrder, o.recordsProjectsOrder, o.pdfProjectOrder]) unique(list);
      expect(o.homeFeatured).toHaveLength(3);
      expect(o.homeFeatured.every(hasPage), 'homeFeatured: all with a page').toBe(true);
      const cards = publications.filter((p) => p.data.card).map((p) => `pub:${p.id}`);
      expect([...o.projectsOrder].sort()).toEqual([...PROJECT_SLUGS.map((slug) => `project:${slug}`), ...cards].sort());
      expect([...o.recordsProjectsOrder].sort()).toEqual(PROJECT_SLUGS.map((slug) => `project:${slug}`).sort());
      const flagged = (pdf: { ko: boolean; en: boolean; academic: boolean }) => FLAGS_USED[id].some((flag) => pdf[flag]);
      const expectedPdf = [
        ...resume.projects.filter((p) => flagged(p.pdf)).map((p) => `project:${p.ref}`),
        ...(resume.publicationProject && flagged(resume.publicationProject.pdf) ? [`pub:${resume.publicationProject.pub}`] : []),
      ];
      expect([...o.pdfProjectOrder].sort()).toEqual(expectedPdf.sort());
      expect(() => orderedItems(o.projectsOrder, projects, publications)).not.toThrow();
    });
  }

  it('orderedItems resolves entries in order and rejects unknown or duplicate items', () => {
    const items = orderedItems(['pub:cog-2026-engagement', 'project:kickick-park'], projects, publications);
    expect(items.map((i) => (i.kind === 'pub' ? i.id : i.slug))).toEqual(['cog-2026-engagement', 'kickick-park']);
    expect(items[1]?.entry.id).toBe('ko/kickick-park');
    expect(() => orderedItems(['project:kickick-park', 'project:kickick-park'], projects, publications)).toThrow(/duplicate/);
    expect(() => orderedItems(['pub:nope'], projects, publications)).toThrow(/unknown/);
    expect(() => parseOrderItem('project:nope' as OrderItem)).toThrow(/unknown project/);
    expect(() => parseOrderItem('x:y' as OrderItem)).toThrow(/order item/);
  });
});
