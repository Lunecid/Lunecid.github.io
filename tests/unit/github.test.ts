import { describe, expect, it } from 'vitest';
import { GITHUB_DESCRIPTIONS, GITHUB_EXCLUDED, GITHUB_FIRST } from '../../src/data/github-repos';
import { githubRepoList, GITHUB_MAX_REPOS } from '../../src/lib/github';
import type { GitHubPinned, GitHubRepo } from '../../src/lib/generated';

const repo = (name: string, pushedAt: string, overrides: Partial<GitHubRepo> = {}): GitHubRepo => ({
  name,
  description: `About ${name}`,
  url: `https://github.com/Lunecid/${name}`,
  homepage: null,
  language: 'Python',
  topics: [],
  stars: 0,
  pushedAt,
  archived: false,
  ...overrides,
});
const pin = (name: string, overrides: Partial<GitHubPinned> = {}): GitHubPinned => ({
  name,
  description: `About ${name}`,
  url: `https://github.com/Lunecid/${name}`,
  language: 'Python',
  topics: [],
  stars: 0,
  ...overrides,
});

describe('githubRepoList (P1-17)', () => {
  it('the site lists: PUBG_Lab and AudioSync excluded (with the reason in a comment), the CoG code first', () => {
    expect([...GITHUB_EXCLUDED].sort()).toEqual(['AudioSync', 'Child_Abuse', 'PUBG_Lab']);
    expect(GITHUB_FIRST).toEqual(['LOL_teamfight_Lab']);
    expect(GITHUB_DESCRIPTIONS['LOL_teamfight_Lab']?.en).toBe('Code for the IEEE CoG 2026 paper (v1.0-cog2026)');
    for (const [name, text] of Object.entries(GITHUB_DESCRIPTIONS)) expect(text.en, name).not.toMatch(/[가-힣]/);
    // fix round 1: the public KickKick service keeps fixed points per photo; the model was trained elsewhere, so the
    // repository description claims no photo judgment.
    expect(GITHUB_DESCRIPTIONS['MultiCamp_Final']?.ko).not.toContain('판정');
    expect(GITHUB_DESCRIPTIONS['MultiCamp_Final']?.en).not.toMatch(/judg/i);
  });

  it('recent repos by last push, archived and excluded dropped, GITHUB_FIRST moved up, capped', () => {
    const repos = [
      repo('old', '2023-01-01T00:00:00Z'),
      repo('PUBG_Lab', '2026-09-25T00:00:00Z'),
      repo('LOL_teamfight_Lab', '2026-09-20T00:00:00Z'),
      repo('newest', '2026-09-26T00:00:00Z'),
      repo('gone', '2026-09-24T00:00:00Z', { archived: true }),
      repo('AudioSync', '2026-07-01T00:00:00Z'),
    ];
    expect(githubRepoList({ repos, pinned: null }, 'ko').map((r) => r.name)).toEqual(['LOL_teamfight_Lab', 'newest', 'old']);
    const many = Array.from({ length: 10 }, (_, i) => repo(`r${i}`, `2026-01-${String(10 + i)}T00:00:00Z`));
    expect(githubRepoList({ repos: many, pinned: null }, 'ko')).toHaveLength(GITHUB_MAX_REPOS);
  });

  it('Child_Abuse is excluded for ko and en even when newest and described', () => {
    const repos = [
      repo('Child_Abuse', '2026-09-28T12:00:00Z', { description: 'Code for a manuscript under review' }),
      repo('visible-a', '2026-09-27T00:00:00Z'),
      repo('visible-b', '2026-09-26T00:00:00Z'),
    ];
    for (const lang of ['ko', 'en'] as const) {
      const names = githubRepoList({ repos, pinned: null }, lang).map((r) => r.name);
      expect(names, lang).not.toContain('Child_Abuse');
      expect(names, lang).toEqual(['visible-a', 'visible-b']);
    }
  });

  it('prefers pinned repos when the data has them, without duplicates', () => {
    const repos = [repo('a', '2026-09-26T00:00:00Z'), repo('b', '2026-09-25T00:00:00Z'), repo('LOL_teamfight_Lab', '2026-09-01T00:00:00Z')];
    const pinned = [pin('b', { stars: 3 }), pin('LOL_teamfight_Lab'), pin('PUBG_Lab')];
    const list = githubRepoList({ repos, pinned }, 'ko');
    expect(list.map((r) => r.name)).toEqual(['LOL_teamfight_Lab', 'b', 'a']);
    expect(list.find((r) => r.name === 'b')?.stars).toBe(3);
  });

  it('fix round 1: a repository with neither a GitHub nor a site-side description is not listed (data-driven)', () => {
    const repos = [
      repo('insta_practice', '2026-09-26T00:00:00Z', { description: '' }),
      repo('blank', '2026-09-25T00:00:00Z', { description: '   ' }),
      repo('LOL_teamfight_Lab', '2026-09-24T00:00:00Z', { description: '' }), // has a site-side description
      repo('TIL', '2026-09-23T00:00:00Z', { description: 'Today I learned ' }),
    ];
    expect(githubRepoList({ repos, pinned: null }, 'ko').map((r) => r.name)).toEqual(['LOL_teamfight_Lab', 'TIL']);
    // a new repository that gets a GitHub description later appears without any code change
    const described = repos.map((r) => (r.name === 'insta_practice' ? { ...r, description: 'Now described' } : r));
    expect(githubRepoList({ repos: described, pinned: null }, 'ko').map((r) => r.name)).toContain('insta_practice');
    // the same rule applies to pinned repositories
    expect(githubRepoList({ repos: [], pinned: [pin('empty-pin', { description: '' })] }, 'ko')).toEqual([]);
  });

  it('site-side descriptions per language; on /en/ a Hangul GitHub description is dropped, an English one kept', () => {
    const repos = [
      repo('LOL_teamfight_Lab', '2026-09-20T00:00:00Z', { description: '' }),
      repo('ko-only', '2026-09-19T00:00:00Z', { description: '한국어 설명' }),
      repo('TIL', '2026-09-18T00:00:00Z', { description: 'Today I learned ' }),
    ];
    const ko = Object.fromEntries(githubRepoList({ repos, pinned: null }, 'ko').map((r) => [r.name, r.description]));
    expect(ko).toEqual({ LOL_teamfight_Lab: 'IEEE CoG 2026 논문 코드 (v1.0-cog2026)', 'ko-only': '한국어 설명', TIL: 'Today I learned' });
    const en = Object.fromEntries(githubRepoList({ repos, pinned: null }, 'en').map((r) => [r.name, r.description]));
    expect(en).toEqual({ LOL_teamfight_Lab: 'Code for the IEEE CoG 2026 paper (v1.0-cog2026)', 'ko-only': '', TIL: 'Today I learned' });
  });

  // P2-14 (src/lib/github.ts:59-63): a site-side description present but with an explicit empty string for this
  // language (as opposed to no site-side entry at all) must fall back to the GitHub description, not render blank.
  // `site ?? fallback` alone let `''` (falsy but defined) win over `??`, since `??` only falls through on
  // null/undefined.
  it('a site-side description with an empty en string falls back to the GitHub description on /en/', () => {
    const repos = [repo('half-described', '2026-09-20T00:00:00Z', { description: 'An English GitHub description' })];
    const descriptions = { 'half-described': { ko: '한국어 설명만 있음', en: '' } };
    const ko = githubRepoList({ repos, pinned: null }, 'ko', { descriptions });
    expect(ko[0]?.description).toBe('한국어 설명만 있음');
    const en = githubRepoList({ repos, pinned: null }, 'en', { descriptions });
    expect(en[0]?.description, 'never blank when the GitHub description could fill in').toBe('An English GitHub description');
  });
});
