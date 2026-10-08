import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import ProjectSummaryList from '../../src/components/records/ProjectSummaryList.astro';
import { resumeSchema, type ProjectFrontmatter } from '../../src/content/schemas';
import { parseYamlDocument } from '../../src/content/yaml-loader';
import type { Lang } from '../../src/i18n/ui';
import { projectSummaryItems } from '../../src/lib/records';
import { PROJECT_PAGE_SLUGS, PROJECT_SLUGS } from '../../src/lib/routes';
import { readFrontmatter } from '../content/helpers';
import { renderAstro } from './helpers';

const abs = (path: string): string => resolve(process.cwd(), path);
const resume = resumeSchema.parse(parseYamlDocument(readFileSync(abs('src/data/resume.yaml'), 'utf8'), 'resume'));
const projectsFor = (lang: Lang) =>
  PROJECT_SLUGS.map((slug) => ({
    id: `${lang}/${slug}`,
    data: readFrontmatter(abs(`src/content/projects/${lang}/${slug}.md`)) as ProjectFrontmatter,
  }));
const itemsFor = (lang: Lang) => projectSummaryItems(resume.projects, projectsFor(lang), { lang, variant: 'game' });
const render = (lang: Lang) => renderAstro(ProjectSummaryList, { props: { variant: 'game', lang, items: itemsFor(lang) } });
const hrefsOf = (html: string): string[] => [...html.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map((m) => m[1]);
const teamsOf = (html: string): string[] =>
  [...html.matchAll(/<span(?=[^>]*class="psum__team")[^>]*>([^<]*)<\/span>/g)].map((m) => m[1]);

describe('ProjectSummaryList.astro', () => {
  it("6 projects in the order passed in, localized links for projects with a page, 'N인 팀' text", async () => {
    const ko = await render('ko');
    expect(ko).toMatch(/<section(?=[^>]*\bid="projects")[^>]*>/);
    expect(ko).toMatch(/<h2[^>]*>프로젝트<\/h2>/);
    // The rows follow the refs passed in (here resume.yaml's list; the page passes recordsProjectsOrder).
    const withPage = resume.projects.filter((p) => (PROJECT_PAGE_SLUGS as readonly string[]).includes(p.ref));
    expect(hrefsOf(ko)).toEqual(withPage.map((p) => `/game/projects/${p.ref}/`));
    expect(hrefsOf(ko)).toHaveLength(5); // owner 2026-10-08: kbo-attendance became a page, resort-menu-demand was added
    // D-4: the Seoul apartment row keeps its title as plain text (no page to link to).
    expect(ko).toMatch(/<h3 class="psum__title"[^>]*>서울 아파트 매매가 예측<\/h3>/);
    expect(ko).not.toMatch(/seoul-apartment-automl/);
    expect(ko.match(/class="psum__item lh-row"/g)).toHaveLength(6);
    const teams = teamsOf(ko);
    expect(teams).toHaveLength(6);
    for (const team of teams) expect(team).toMatch(/^\d+인 팀$/);

    const en = await render('en');
    expect(hrefsOf(en)).toEqual(withPage.map((p) => `/en/game/projects/${p.ref}/`));
    for (const team of teamsOf(en)) expect(team).toMatch(/^\d+-person team$/);
  });

  it('shows the period of each project', async () => {
    const items = itemsFor('ko');
    const ko = await render('ko');
    expect(ko.match(/class="psum__item lh-row"/g)).toHaveLength(6);
    const periods = [...ko.matchAll(/<span(?=[^>]*class="psum__period tnum")[^>]*>([^<]*)<\/span>/g)].map((m) => m[1]);
    expect(periods).toEqual(items.map((item) => item.period));
  });
});
