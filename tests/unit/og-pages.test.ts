import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { buildOgMap, type OgSources } from '../../src/lib/og-pages';
import { allRoutes, PROJECT_PAGE_SLUGS, STORY_SLUGS } from '../../src/lib/routes';
import { containsTrademark, ogSlugFor, TRADEMARK_TERMS } from '../../src/lib/seo';
import { PAGE_META } from '../../src/data/copy/pages';
import type { Lang } from '../../src/i18n/ui';

const LANGS: Lang[] = ['ko', 'en'];

function fixtureSources(): OgSources {
  return {
    projects: LANGS.flatMap((lang) =>
      PROJECT_PAGE_SLUGS.map((slug) => ({ lang, slug, title: `Project ${slug}`, summary: `Summary of ${slug}` })),
    ),
    papers: LANGS.flatMap((lang) => STORY_SLUGS.map((slug) => ({ lang, slug }))),
  };
}

/** Frontmatter of a committed Markdown file, parsed with js-yaml 4 (same parser as Astro). */
function frontmatter(repoRelPath: string): Record<string, unknown> {
  const text = readFileSync(new URL(`../../${repoRelPath}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const match = /^---\n([\s\S]*?)\n---/.exec(text);
  if (!match) throw new Error(`no frontmatter in ${repoRelPath}`);
  return load(match[1]) as Record<string, unknown>;
}

/** The real titles/summaries that getOgPages() feeds into buildOgMap() (paper pages need only their slug). */
function realSources(): OgSources {
  return {
    projects: LANGS.flatMap((lang) =>
      PROJECT_PAGE_SLUGS.map((slug) => {
        const fm = frontmatter(`src/content/projects/${lang}/${slug}.md`);
        return { lang, slug, title: String(fm.title), summary: String(fm.summary) };
      }),
    ),
    papers: LANGS.flatMap((lang) =>
      STORY_SLUGS.map((slug) => {
        expect(frontmatter(`src/content/publications/${slug}.md`).caseStudy).toBe(`/research/${slug}/`);
        return { lang, slug };
      }),
    ),
  };
}

describe('buildOgMap', () => {
  it('buildOgMap has a key for ogSlugFor(route) of all 24 routes', () => {
    const map = buildOgMap(fixtureSources());
    const expected = allRoutes().map(ogSlugFor).sort();
    expect(expected).toHaveLength(24);
    expect(map['projects/kbo-attendance']).toBeUndefined(); // D-4: no page, so no OG card
    expect(Object.keys(map).sort()).toEqual(expected);
    expect(map['home'].eyebrow).toBe('PORTFOLIO');
    expect(map['en/projects/kickick-park']).toEqual({
      eyebrow: 'PROJECT',
      title: 'Project kickick-park',
      subtitle: 'Summary of kickick-park',
    });
    expect(map['en/records'].eyebrow).toBe('RECORDS');
    expect(map['player-log'].eyebrow).toBe('PLAYER LOG');
    expect(map['stats'].eyebrow).toBe('STATS');
    expect(map['en/privacy'].eyebrow).toBe('PRIVACY');
    expect(map['credits'].eyebrow).toBe('CREDITS');
  });

  it('no OG title contains a trademark', () => {
    const map = buildOgMap(realSources());
    const offenders = Object.entries(map)
      .filter(([, og]) => containsTrademark(og.title))
      .map(([key, og]) => `${key}: ${og.title}`);
    expect(offenders).toEqual([]);
  });

  it("a paper page's OG card is the research-story PAGE_META title without the name suffix + its description", () => {
    const map = buildOgMap(fixtureSources());
    expect(map['research/cog-2026-engagement'].title).toBe('교전 결과 예측 논문');
    expect(map['en/research/cog-2026-engagement'].title).toBe('Engagement Outcome Prediction Paper');
    expect(`${map['research/cog-2026-engagement'].title} · 백성은`).toBe(PAGE_META['research-story'].ko.title);
    expect(`${map['en/research/cog-2026-engagement'].title} · Seongeun Baek`).toBe(PAGE_META['research-story'].en.title);
    expect(map['research/cog-2026-engagement'].subtitle).toBe(PAGE_META['research-story'].ko.description);
    expect(map['en/research/cog-2026-engagement'].subtitle).toBe(PAGE_META['research-story'].en.description);
    expect(map['research/cog-2026-engagement'].eyebrow).toBe('RESEARCH');
  });

  it('fixed pages use the PAGE_META title and the description as subtitle', () => {
    const map = buildOgMap(fixtureSources());
    expect(map['research']).toEqual({ eyebrow: 'RESEARCH', title: PAGE_META.research.ko.title, subtitle: PAGE_META.research.ko.description });
    expect(map['en/records'].title).toBe(PAGE_META.records.en.title);
    expect(map['en/home'].title).toBe(PAGE_META.home.en.title);
    expect(map['projects'].eyebrow).toBe('PROJECT');
  });

  it('P2-36: each card names its artifact: the photo, the paper title block, the CoG figure, a project cover or plate', () => {
    const photo = { kind: 'photo', path: '/p.webp' } as const;
    const paper = { kind: 'paper', venue: 'V', title: 'T', authors: 'A' } as const;
    const projects = { kind: 'figure', path: '/k.webp', label: 'KILL-GAP KDE' } as const;
    const src = fixtureSources();
    src.projects = src.projects.map((p) => ({ ...p, artifact: { kind: 'figure', path: `/${p.slug}.webp`, label: 'FIG' } as const }));
    const map = buildOgMap({ ...src, artifacts: { photo, paper, projects } });
    for (const k of ['home', 'en/home', 'records', 'en/records', 'player-log', 'stats', 'privacy', 'credits']) expect(map[k]?.artifact, k).toEqual(photo);
    for (const k of ['research', 'en/research', 'research/cog-2026-engagement', 'en/research/cog-2026-engagement']) expect(map[k]?.artifact, k).toEqual(paper);
    expect(map['projects']?.artifact).toEqual(projects);
    expect(map['en/projects/kickick-park']?.artifact).toEqual({ kind: 'figure', path: '/kickick-park.webp', label: 'FIG' });
    // no artifacts given (unit fixtures): text-only cards, no artifact key at all
    expect('artifact' in buildOgMap(fixtureSources())['home']!).toBe(false);
  });

  it('throws when a route has no source entry', () => {
    const src = fixtureSources();
    const withoutOne = src.projects.filter((p) => !(p.lang === 'en' && p.slug === 'kickick-park'));
    expect(() => buildOgMap({ ...src, projects: withoutOne })).toThrow('og: no project entry en/kickick-park');
    const noEnPaper = src.papers.filter((p) => p.lang !== 'en');
    expect(() => buildOgMap({ ...src, papers: noEnPaper })).toThrow('og: no paper entry en/cog-2026-engagement');
  });

  it('throws when a title names a game trademark', () => {
    const src = fixtureSources();
    src.projects[0] = { ...src.projects[0], title: `${TRADEMARK_TERMS[0]} dashboard` };
    expect(() => buildOgMap(src)).toThrow(/og: title names a game trademark/);
  });
});
