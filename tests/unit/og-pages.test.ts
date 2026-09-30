import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { buildOgMap, ogTemplateFor, type OgSources } from '../../src/lib/og-pages';
import { allRoutes, PROJECT_PAGE_SLUGS, STORY_SLUGS } from '../../src/lib/routes';
import { containsTrademark, ogSlugFor, TRADEMARK_TERMS } from '../../src/lib/seo';
import { PAGE_META } from '../../src/data/copy/pages';
import type { Lang } from '../../src/i18n/ui';
import { pageMetaFor } from '../../src/variants';
import { gameVariant } from '../../src/variants/game';
import { loadFactSource } from '../helpers/fact-source';

const LANGS: Lang[] = ['ko', 'en'];
const facts = loadFactSource();

function fixtureSources(): OgSources {
  return {
    projects: LANGS.flatMap((lang) =>
      PROJECT_PAGE_SLUGS.map((slug) => ({ lang, slug, title: `Project ${slug}`, summary: `Summary of ${slug}` })),
    ),
    papers: LANGS.flatMap((lang) => STORY_SLUGS.map((slug) => ({ lang, slug }))),
    facts: loadFactSource(),
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
    facts: loadFactSource(),
  };
}

describe('buildOgMap', () => {
  it('buildOgMap has a key for ogSlugFor(route) of every route', () => {
    const map = buildOgMap(fixtureSources());
    const expected = allRoutes().map(ogSlugFor).sort();
    expect(new Set(expected).size).toBe(allRoutes().length);
    expect(map['game/projects/kbo-attendance']).toBeUndefined(); // D-4: no page, so no OG card
    expect(Object.keys(map).sort()).toEqual(expected);
    expect(map['home'].eyebrow).toBe('백성은'); // P2-12: the chooser card is neutral, named by the site title
    expect(map['en/game/projects/kickick-park']).toEqual({
      template: 'hud',
      eyebrow: 'PROJECT',
      title: 'Project kickick-park',
      subtitle: 'Summary of kickick-park',
    });
    expect(map['en/game/records'].eyebrow).toBe('RECORDS');
    expect(map['game/player-log'].eyebrow).toBe('PLAYER LOG');
    // P2-12: shared cards are neutral, named by their page's nav label
    expect(map['stats'].eyebrow).toBe('방문 통계');
    expect(map['en/privacy'].eyebrow).toBe('Privacy');
    expect(map['credits'].eyebrow).toBe('출처·고지');
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
    expect(map['game/research/cog-2026-engagement'].title).toBe('교전 결과 예측 논문');
    expect(map['en/game/research/cog-2026-engagement'].title).toBe('Engagement Outcome Prediction Paper');
    expect(`${map['game/research/cog-2026-engagement'].title} · 백성은`).toBe(PAGE_META['research-story'].ko.title);
    expect(`${map['en/game/research/cog-2026-engagement'].title} · Seongeun Baek`).toBe(PAGE_META['research-story'].en.title);
    expect(map['game/research/cog-2026-engagement'].subtitle).toBe(pageMetaFor('research-story', 'ko', 'game', loadFactSource()).description);
    expect(map['en/game/research/cog-2026-engagement'].subtitle).toBe(pageMetaFor('research-story', 'en', 'game', loadFactSource()).description);
    expect(map['game/research/cog-2026-engagement'].eyebrow).toBe('RESEARCH');
  });

  it('fixed pages use the PAGE_META title and the description as subtitle', () => {
    const map = buildOgMap(fixtureSources());
    expect(map['game/research']).toEqual({ template: 'hud', eyebrow: 'RESEARCH', title: PAGE_META.research.ko.title, subtitle: PAGE_META.research.ko.description });
    expect(map['en/game/records'].title).toBe(gameVariant.pageMeta.records.en.title);
    expect(map['en/home'].title).toBe(pageMetaFor('chooser', 'en', null, facts).title);
    expect(map['en/game'].title).toBe(gameVariant.pageMeta.home.en.title);
    expect(map['game/projects'].eyebrow).toBe('PROJECT');
  });

  it('P2-36: each card names its artifact: the photo, the paper title block, the CoG figure, a project cover or plate', () => {
    const photo = { kind: 'photo', path: '/p.webp' } as const;
    const paper = { kind: 'paper', venue: 'V', title: 'T', authors: 'A' } as const;
    const projects = { kind: 'figure', path: '/k.webp', label: 'KILL-GAP KDE' } as const;
    const src = fixtureSources();
    src.projects = src.projects.map((p) => ({ ...p, artifact: { kind: 'figure', path: `/${p.slug}.webp`, label: 'FIG' } as const }));
    const map = buildOgMap({ ...src, artifacts: { photo, paper, projects } });
    // the chooser ('home', 'en/home') shows both versions since P2-12 (tested in 'OG templates per page kind')
    for (const k of ['game', 'en/game', 'game/records', 'en/game/records', 'game/player-log', 'stats', 'privacy', 'credits']) expect(map[k]?.artifact, k).toEqual(photo);
    for (const k of ['game/research', 'en/game/research', 'game/research/cog-2026-engagement', 'en/game/research/cog-2026-engagement']) expect(map[k]?.artifact, k).toEqual(paper);
    expect(map['game/projects']?.artifact).toEqual(projects);
    expect(map['en/game/projects/kickick-park']?.artifact).toEqual({ kind: 'figure', path: '/kickick-park.webp', label: 'FIG' });
    // no artifacts given (unit fixtures): text-only cards, no artifact key at all
    expect('artifact' in buildOgMap(fixtureSources())['game']!).toBe(false);
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

  it('Review Focus 2: no OG title or subtitle carries a fact token', () => {
    const map = buildOgMap(realSources());
    const residue = Object.entries(map).filter(([, og]) => /[{}]/.test(`${og.title} ${og.subtitle ?? ''}`)).map(([k]) => k);
    expect(residue).toEqual([]);
    expect(map['game/research/cog-2026-engagement']?.subtitle).toBe('교전 직전 30초의 공개 경기 기록으로 교전 뒤 이득을 예측한 IEEE CoG 2026 구두 발표 논문의 초록과 BibTeX.');
  });
});

describe('OG templates per page kind (P2-12)', () => {
  it('game pages keep the HUD card, general pages are editorial, the chooser and the shared pages neutral', () => {
    expect(['/game/', '/en/game/records/', '/data/', '/en/data/records/', '/', '/en/', '/privacy/'].map(ogTemplateFor)).toEqual(
      ['hud', 'hud', 'editorial', 'editorial', 'neutral', 'neutral', 'neutral'],
    );
    const map = buildOgMap(fixtureSources());
    for (const route of allRoutes()) expect(map[ogSlugFor(route)]!.template, route).toBe(ogTemplateFor(route));
  });

  it('editorial cards say no game word and take the editorial captions as eyebrows (Review Focus 3)', () => {
    const map = buildOgMap(realSources());
    const VOCAB = /PLAYER|PATCH NOTES|SELECT YOUR|GAME OVER|\bMODE\b|\[\s*■?\s*\]|게임 팀에게|Game Data Analyst|게임 데이터 분석가/;
    for (const route of allRoutes().filter((r) => ogTemplateFor(r) === 'editorial')) {
      const og = map[ogSlugFor(route)]!;
      expect(`${og.eyebrow} ${og.title} ${og.subtitle ?? ''}`, route).not.toMatch(VOCAB);
      expect(og.eyebrow, route).not.toMatch(/^[A-Z][A-Z ]+$/);
    }
    expect(map[ogSlugFor('/data/')]!.eyebrow).toBe('포트폴리오');
    expect(map[ogSlugFor('/en/data/records/')]!.eyebrow).toBe('Portfolio');
  });

  it('the chooser card shows both versions; shared cards are named by the page; the general home card shows the B-12 heatmap', () => {
    const heatmap = { kind: 'figure', path: '/x/risk-heatmap.webp', label: 'RISK HEATMAP' } as const;
    const photo = { kind: 'photo', path: '/x/photo.webp' } as const;
    const map = buildOgMap({ ...fixtureSources(), artifacts: { projects: heatmap, photo } });
    expect(map[ogSlugFor('/')]!.artifact).toEqual({ kind: 'versions', game: { mode: '[ MODE 01 ]', title: '게임 데이터 분석가' }, data: { kicker: '일반 버전', title: '데이터 분석가' } });
    expect(map[ogSlugFor('/en/')]!.artifact).toEqual({ kind: 'versions', game: { mode: '[ MODE 01 ]', title: 'Game Data Analyst' }, data: { kicker: 'General version', title: 'Data Analyst' } });
    expect(map[ogSlugFor('/en/privacy/')]!.eyebrow).toBe('Privacy');
    expect(map[ogSlugFor('/data/')]!.artifact).toEqual(heatmap);
    expect(map[ogSlugFor('/game/')]!.artifact).toEqual(photo);
  });
});
