import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import SkillList from '../../src/components/records/SkillList.astro';
import { resumeSchema } from '../../src/content/schemas';
import { parseYamlDocument } from '../../src/content/yaml-loader';
import type { Lang } from '../../src/i18n/ui';
import { skillGroups } from '../../src/lib/records';
import { PROJECT_SLUGS } from '../../src/lib/routes';
import { readFrontmatter } from '../content/helpers';
import { anchorBlock, renderAstro } from './helpers';

const abs = (path: string): string => resolve(process.cwd(), path);
const resume = resumeSchema.parse(parseYamlDocument(readFileSync(abs('src/data/resume.yaml'), 'utf8'), 'resume'));
const titleOf = (path: string): string => (readFrontmatter(abs(path)) as { title: string }).title;
const shortTitleOf = (path: string, lang: Lang): string => (readFrontmatter(abs(path)) as { shortTitle: Record<Lang, string> }).shortTitle[lang];
const titlesFor = (lang: Lang) => ({
  projects: Object.fromEntries(PROJECT_SLUGS.map((slug) => [slug, titleOf(`src/content/projects/${lang}/${slug}.md`)])),
  stories: { 'cog-2026-engagement': shortTitleOf('src/content/publications/cog-2026-engagement.md', lang) },
  codes: {
    'cog-2026-engagement': {
      href: 'https://github.com/Lunecid/LOL_teamfight_Lab/tree/v1.0-cog2026',
      label: lang === 'ko' ? 'IEEE CoG 2026 논문 코드' : 'IEEE CoG 2026 paper code',
    },
  },
});
const decode = (s: string): string =>
  s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
// P2-14: an external (http) evidence link now carries a trailing aria-hidden ↗ span; the captured text is still
// just the label (group 2), so every other linkTexts() assertion is unaffected.
const linkTexts = (html: string): Map<string, string> =>
  new Map(
    [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([^<]*)(?: <span aria-hidden="true"[^>]*>↗<\/span>)?<\/a>/g)].map((m) => [m[1], decode(m[2])]),
  );

describe('SkillList.astro', () => {
  it('primary and familiar with evidence links labelled by title, no bars', async () => {
    const titles = titlesFor('ko');
    const html = await renderAstro(SkillList, { props: { variant: 'game', lang: 'ko', ...skillGroups(resume.skills, { lang: 'ko', variant: 'game' }, titles) } });
    expect(html).toMatch(/<section(?=[^>]*\bid="skills")[^>]*>/);
    expect(html).toMatch(/<h2[^>]*>기술<\/h2>/);
    // P1-9: one two-column table, "skill | evidence chips", primary / also-used as row groups
    expect(html.match(/<table\b/g)).toHaveLength(1);
    expect(html).toMatch(/<thead[^>]*>\s*<tr[^>]*><th scope="col"[^>]*>기술<\/th><th scope="col"[^>]*>근거<\/th><\/tr>/);
    expect(html).toMatch(/<th colspan="2" scope="rowgroup"[^>]*>주력<\/th>/);
    expect(html).toMatch(/<th colspan="2" scope="rowgroup"[^>]*>사용해 본 기술<\/th>/);
    expect(html.match(/class="skills__item"/g)).toHaveLength(resume.skills.primary.length + resume.skills.familiar.length);
    expect(html.match(/<th scope="row" class="skills__name" lang="en"/g)).toHaveLength(resume.skills.primary.length + resume.skills.familiar.length);
    expect(html).toMatch(/<a class="lh-chip" href="\/game\/research\/cog-2026-engagement\/"/);
    const links = linkTexts(html);
    expect(links.get('/game/research/cog-2026-engagement/')).toBe(titles.stories['cog-2026-engagement']);
    expect(links.get('/game/projects/school-zone-blindspots/')).toBe(titles.projects['school-zone-blindspots']);
    // pandas/PyTorch/Python evidence for the CoG work is the tagged code, where those libraries are visible
    expect(links.get('https://github.com/Lunecid/LOL_teamfight_Lab/tree/v1.0-cog2026')).toBe('IEEE CoG 2026 논문 코드');
    // P2-14/D-7: ↗ marks a link that leaves the site (GitHub) — the internal /research/ evidence link does not get
    // one (anchorBlock: tests/astro/helpers.ts, shared with JobFitTable.test.ts).
    expect(anchorBlock(html, 'https://github.com/Lunecid/LOL_teamfight_Lab/tree/v1.0-cog2026')).toContain('↗');
    expect(anchorBlock(html, '/game/research/cog-2026-engagement/')).not.toContain('↗');
    expect(html).not.toMatch(/<progress|<meter|role="progressbar"|skills__bar|%<\//);
    expect(html).not.toMatch(/>SQL</); // SQL waits for the certificate (spec §2 later #7)

    const enTitles = titlesFor('en');
    const en = await renderAstro(SkillList, { props: { variant: 'game', lang: 'en', ...skillGroups(resume.skills, { lang: 'en', variant: 'game' }, enTitles) } });
    expect(linkTexts(en).get('/en/game/research/cog-2026-engagement/')).toBe(enTitles.stories['cog-2026-engagement']);
    expect(en).toMatch(/<th colspan="2" scope="rowgroup"[^>]*>Primary<\/th>/);
  });

  it('omits an empty familiar group', async () => {
    const titles = titlesFor('ko');
    const groups = skillGroups(resume.skills, { lang: 'ko', variant: 'game' }, titles);
    const html = await renderAstro(SkillList, { props: { variant: 'game', lang: 'ko', primary: groups.primary, familiar: [] } });
    expect(html).toMatch(/scope="rowgroup"[^>]*>주력<\/th>/);
    expect(html).not.toContain('사용해 본 기술');
  });
});
