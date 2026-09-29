import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import GitHubSection from '../../src/components/github/GitHubSection.astro';
import { usableGitHub, type GitHubData, type GitHubDay, type GitHubRepo } from '../../src/lib/generated';
import { renderAstro } from './helpers';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const HAS_GHOST = existsSync(join(process.cwd(), 'src/assets/ghost/miku-v6.webp')); // GhostArt renders nothing without its asset

const FIXED_NOW = new Date('2026-09-26T00:00:00.000Z');
const DAY = 86_400_000;

function calendar(): { total: number; weeks: GitHubDay[][] } {
  const start = Date.UTC(2025, 8, 21); // a Sunday
  const weeks: GitHubDay[][] = [];
  for (let w = 0; w < 53; w += 1) {
    const week: GitHubDay[] = [];
    for (let d = 0; d < 7; d += 1) {
      const i = w * 7 + d;
      week.push({ date: new Date(start + i * DAY).toISOString().slice(0, 10), count: i % 5, level: (i % 5) as GitHubDay['level'] });
    }
    weeks.push(week);
  }
  return { total: 740, weeks };
}

function repo(i: number, overrides: Partial<GitHubRepo> = {}): GitHubRepo {
  return {
    name: `repo-${i}`,
    description: `Repository ${i}`,
    url: `https://github.com/Lunecid/repo-${i}`,
    homepage: null,
    language: 'Python',
    topics: [],
    stars: i,
    pushedAt: new Date(FIXED_NOW.getTime() - i * DAY).toISOString(),
    archived: false,
    ...overrides,
  };
}

function fixture(overrides: Partial<GitHubData> = {}): GitHubData {
  return {
    schemaVersion: 1,
    source: 'github',
    login: 'Lunecid',
    status: 'ok',
    fetchedAt: '2026-09-25T18:30:00.000Z',
    maxAgeDays: 7,
    authFailed: false,
    repos: [repo(1), repo(2, { archived: true }), repo(3), repo(4), repo(5), repo(6), repo(7), repo(8)],
    pinned: [
      { name: 'LOL_teamfight_Lab', description: 'CoG 2026 paper code', url: 'https://github.com/Lunecid/LOL_teamfight_Lab', language: 'Python', topics: ['lol'], stars: 3 },
    ],
    calendar: calendar(),
    errors: [],
    ...overrides,
  };
}

const withoutScripts = (html: string): string => html.replace(/<script\b[\s\S]*?<\/script>/g, '').trim();

beforeEach(() => {
  vi.useFakeTimers({ now: FIXED_NOW, toFake: ['Date'] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GitHubSection.astro', () => {
  it('renders nothing for undefined, error or stale data', async () => {
    const cases: (GitHubData | undefined)[] = [
      undefined,
      fixture({ status: 'error', repos: [], pinned: null, calendar: null }),
      fixture({ fetchedAt: '2026-09-10T00:00:00.000Z' }),
    ];
    for (const data of cases) {
      const filtered = await renderAstro(GitHubSection, { props: { lang: 'ko', variant: 'game', data: usableGitHub(data) } });
      expect(withoutScripts(filtered)).toBe('');
      const raw = await renderAstro(GitHubSection, { props: { lang: 'ko', variant: 'game', data } });
      expect(withoutScripts(raw)).toBe('');
    }
  });

  it('renders one list of at most 6 repos (pinned first, archived dropped) and a 53-week calendar with level classes', async () => {
    const html = await renderAstro(GitHubSection, { props: { lang: 'ko', variant: 'game', data: fixture() } });
    expect(html).toMatch(/<section[^>]*id="github"[^>]*class="gh read read-sec"/);
    // P1-9: light-HUD rows with a mono index, not a card grid; square calendar cells in a bracketed frame
    expect(html.match(/class="gh__repo lh-row"/g)).toHaveLength(6);
    expect(html).toMatch(/class="gh__cal-frame lh-frame bracket bracket--sm"/);
    expect(html).not.toMatch(/<rect[^>]*\brx=/);
    // P1-17: one list; the pinned CoG code first, then the non-archived repos by last push, 6 in all.
    const names = [...html.matchAll(/class="gh__name"[^>]*>([^<]+)</g)].map((m) => m[1]);
    expect(names).toEqual(['LOL_teamfight_Lab', 'repo-1', 'repo-3', 'repo-4', 'repo-5', 'repo-6']);
    expect(html).not.toContain('repo-2');
    expect(html).not.toContain('repo-8');
    expect(html.match(/<rect\b/g) ?? []).toHaveLength(371);
    expect(html.match(/<title\b/g) ?? []).toHaveLength(371);
    for (const level of [0, 1, 2, 3, 4]) expect(html).toContain(`gh__day--l${level}`);
    expect(html).not.toMatch(/<text\b/);
    expect(html).toMatch(/<div[^>]*class="gh__cal-scroll"/);
    expect(html).toContain('지난 1년 기여 740회');
  });

  it('carries data-fetched-at and data-max-age-days and includes the stale-guard script', async () => {
    const html = await renderAstro(GitHubSection, { props: { lang: 'ko', variant: 'game', data: fixture() } });
    expect(html).toMatch(/<section[^>]*data-fetched-at="2026-09-25T18:30:00.000Z"[^>]*data-max-age-days="7"/);
    expect(html).toMatch(/<script\b[^>]*src="[^"]*GitHubSection\.astro\?astro&(?:amp;)?type=script/);
  });

  it('shows the as-of date', async () => {
    const ko = await renderAstro(GitHubSection, { props: { lang: 'ko', variant: 'game', data: fixture() } });
    expect(ko).toContain('기준 시각');
    expect(ko).toMatch(/<time[^>]*datetime="2026-09-25T18:30:00.000Z"[^>]*>2026\.09\.26<\/time>/);
    const en = await renderAstro(GitHubSection, { props: { lang: 'en', variant: 'game', data: fixture() } });
    expect(en).toContain('As of');
    expect(en).toMatch(/<time[^>]*datetime="2026-09-25T18:30:00.000Z"[^>]*>Sep 26, 2026<\/time>/);
    expect(en).toContain('Public repositories');
    expect(en).toContain('740 contributions in the last year');
  });

  it('partial data without pinned repos or calendar still lists repositories', async () => {
    const html = await renderAstro(GitHubSection, {
      props: { lang: 'ko', variant: 'game', data: fixture({ status: 'partial', pinned: null, calendar: null, errors: ['no token'] }) },
    });
    expect(html).toMatch(/id="github"/);
    expect(html).not.toMatch(/<svg\b/);
    expect(html).not.toContain('gh__pin');
    expect(html).toContain('repo-1');
  });

  it('P1-17: hides 0-star counts, excludes AudioSync and PUBG_Lab, puts the CoG code first with a site-side description', async () => {
    const data = fixture({
      pinned: null,
      repos: [
        repo(1, { name: 'PUBG_Lab', description: '', stars: 0 }),
        repo(2, { name: 'MultiCamp_Final', description: '멀티캠퍼스 최종 프로젝트 최우수상', stars: 0, language: 'HTML' }),
        repo(3, { name: 'busan-school-zone-blindspots', description: '2025 부산 Big Data 활용대회 최우수상', stars: 0, language: null }),
        repo(4, { name: 'LOL_teamfight_Lab', description: '', stars: 0 }),
        repo(5, { name: 'AudioSync', description: '', stars: 0, language: 'C#' }),
        repo(6, { name: 'new-repo', description: '새 저장소', stars: 2 }),
      ],
    });
    const ko = await renderAstro(GitHubSection, { props: { lang: 'ko', variant: 'game', data } });
    const names = [...ko.matchAll(/class="gh__name"[^>]*>([^<]+)</g)].map((m) => m[1]);
    expect(names).toEqual(['LOL_teamfight_Lab', 'MultiCamp_Final', 'busan-school-zone-blindspots', 'new-repo']);
    expect(ko).not.toMatch(/PUBG_Lab|AudioSync/);
    expect(ko).not.toContain('별 0');
    expect(ko).toContain('별 2');
    expect(ko).toContain('IEEE CoG 2026 논문 코드 (v1.0-cog2026)');
    // the site-side text replaces GitHub's own (whose contest name differs from the one used on the site)
    expect(ko).not.toContain('부산 Big Data 활용대회');
    expect(ko).toContain('새 저장소'); // a repo without a site entry keeps its GitHub description on /ko/
    // list title before the profile link (P1-17)
    expect(ko.indexOf('공개 저장소')).toBeLessThan(ko.indexOf('GitHub 프로필 @Lunecid'));

    const en = await renderAstro(GitHubSection, { props: { lang: 'en', variant: 'game', data } });
    const text = en.replace(/<script\b[\s\S]*?<\/script>/g, '');
    expect(text).not.toMatch(/[가-힣]/); // no Hangul on /en/
    expect(text).toContain('Code for the IEEE CoG 2026 paper (v1.0-cog2026)');
    expect(text).not.toContain('0 stars');
    expect(text).toContain('2 stars');
  });

  it('§1.8: the ghost art (characterArt) renders only on the game version', async () => {
    const game = await renderAstro(GitHubSection, { props: { lang: 'ko', variant: 'game', data: fixture() } });
    const data = await renderAstro(GitHubSection, { props: { lang: 'ko', variant: 'data', data: fixture() } });
    expect(game.match(/data-ghost-art="left"/g) ?? []).toHaveLength(HAS_GHOST ? 1 : 0);
    expect(data).not.toContain('ghost-art');
  });
});

describe('GitHubSection.astro on the general version (P2-6)', () => {
  // The file-level hooks already fix Date to FIXED_NOW (vi.useFakeTimers({ now: FIXED_NOW, toFake: ['Date'] })); no
  // nested fake timers here (full fake timers would also freeze setTimeout under the container render).
  it('editorial rows without the mono index, a black-and-grey calendar, serif sub-heads, the profile link underlined with ↗', async () => {
    const html = await renderAstro(GitHubSection, { props: { variant: 'data', lang: 'ko', data: fixture() } });
    expect(html).toMatch(/<section id="github" class="gh ed-sec"/);
    expect(html).toMatch(/<ol class="ed-list"/);
    expect(html).toMatch(/<h3 class="gh__h" data-serif/);
    expect(html).toMatch(/<svg class="gh__cal gh__cal--ed"/);
    expect(html).toMatch(/<a class="ed-link" href="https:\/\/github\.com\/Lunecid"[^>]*>[^<]*@Lunecid <span aria-hidden="true"[^>]*>↗<\/span><\/a>/);
    expect(html).not.toMatch(/lh-idx|lh-rows|lh-chip|bracket|ghost-art/);
  });
});
