import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LEVEL, fetchGithub, shapeGithub, writeGithub } from '../../scripts/fetch-github.mjs';

const NOW = new Date('2026-09-26T00:00:00.000Z');
const TOKEN = 'test-token-value';

const RAW_REPOS = [
  {
    name: 'LOL_teamfight_Lab',
    description: 'CoG 2026 paper code',
    html_url: 'https://github.com/Lunecid/LOL_teamfight_Lab',
    homepage: '',
    language: 'Python',
    topics: ['league-of-legends'],
    stargazers_count: 3,
    pushed_at: '2026-09-20T00:00:00Z',
    archived: false,
    fork: false,
    private: false,
  },
  { name: 'forked-repo', description: 'x', html_url: 'https://github.com/Lunecid/forked-repo', homepage: null, language: 'Python', topics: [], stargazers_count: 0, pushed_at: '2026-09-19T00:00:00Z', archived: false, fork: true, private: false },
  { name: 'secret-repo', description: 'x', html_url: 'https://github.com/Lunecid/secret-repo', homepage: null, language: 'Python', topics: [], stargazers_count: 0, pushed_at: '2026-09-18T00:00:00Z', archived: false, fork: false, private: true },
  { name: 'Lunecid', description: 'profile', html_url: 'https://github.com/Lunecid/Lunecid', homepage: null, language: null, topics: [], stargazers_count: 0, pushed_at: '2026-09-17T00:00:00Z', archived: false, fork: false, private: false },
  { name: 'lunecid.github.io', description: 'site', html_url: 'https://github.com/Lunecid/lunecid.github.io', homepage: null, language: 'Astro', topics: [], stargazers_count: 0, pushed_at: '2026-09-16T00:00:00Z', archived: false, fork: false, private: false },
  { name: 'PUBG_Lab', description: null, html_url: 'https://github.com/Lunecid/PUBG_Lab', homepage: null, language: null, pushed_at: '2026-09-15T00:00:00Z', archived: true, fork: false, private: false, stargazers_count: 1 },
];

const GRAPH = {
  data: {
    user: {
      pinnedItems: {
        nodes: [
          {
            name: 'PUBG_Lab',
            description: null,
            url: 'https://github.com/Lunecid/PUBG_Lab',
            isPrivate: false,
            stargazerCount: 1,
            primaryLanguage: { name: 'Python' },
            repositoryTopics: { nodes: [{ topic: { name: 'pubg' } }] },
          },
        ],
      },
      contributionsCollection: {
        contributionCalendar: {
          totalContributions: 42,
          weeks: [
            {
              contributionDays: [
                { date: '2026-09-20', contributionCount: 0, contributionLevel: 'NONE' },
                { date: '2026-09-21', contributionCount: 9, contributionLevel: 'FOURTH_QUARTILE' },
                { date: '2026-09-22', contributionCount: 1, contributionLevel: 'FIRST_QUARTILE' },
                { date: '2026-09-23', contributionCount: 3, contributionLevel: 'SECOND_QUARTILE' },
                { date: '2026-09-24', contributionCount: 5, contributionLevel: 'THIRD_QUARTILE' },
                { date: '2026-09-25', contributionCount: 2, contributionLevel: 'SOMETHING_NEW' },
              ],
            },
          ],
        },
      },
    },
  },
};

type Route = () => Response;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function fakeFetch(routes: { rest?: Route; graphql?: Route }) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const impl = async (input: unknown, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    calls.push({ url, init });
    if (url === 'https://api.github.com/graphql') return (routes.graphql ?? (() => json(500, {})))();
    return (routes.rest ?? (() => json(500, {})))();
  };
  return { impl: impl as unknown as typeof fetch, calls };
}

function header(init: RequestInit | undefined, name: string): string | undefined {
  return (init?.headers as Record<string, string> | undefined)?.[name];
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('scripts/fetch-github.mjs', () => {
  it('importing the module performs no fetch and writes no file', async () => {
    const target = fileURLToPath(new URL('../../src/data/generated/github.json', import.meta.url));
    const before = existsSync(target) ? statSync(target).mtimeMs : null;
    const spy = vi.fn(() => {
      throw new Error('fetch must not run on import');
    });
    vi.stubGlobal('fetch', spy);
    vi.resetModules();
    const mod = await import('../../scripts/fetch-github.mjs');
    expect(typeof mod.fetchGithub).toBe('function');
    expect(spy).not.toHaveBeenCalled();
    expect(existsSync(target) ? statSync(target).mtimeMs : null).toBe(before);
  });

  it('filters forks, private, profile and site repos', () => {
    const data = shapeGithub({ login: 'Lunecid', repos: RAW_REPOS, graph: null, errors: [], authFailed: false, now: NOW });
    expect(data.repos.map((r: { name: string }) => r.name)).toEqual(['LOL_teamfight_Lab', 'PUBG_Lab']);
    expect(data.repos[0]).toEqual({
      name: 'LOL_teamfight_Lab',
      description: 'CoG 2026 paper code',
      url: 'https://github.com/Lunecid/LOL_teamfight_Lab',
      homepage: null,
      language: 'Python',
      topics: ['league-of-legends'],
      stars: 3,
      pushedAt: '2026-09-20T00:00:00Z',
      archived: false,
    });
    expect(data.repos[1]).toMatchObject({ description: '', topics: [], archived: true, language: null });
    expect(data).toMatchObject({ schemaVersion: 1, source: 'github', login: 'Lunecid', status: 'ok', fetchedAt: NOW.toISOString(), maxAgeDays: 7, authFailed: false });
  });

  it('maps contributionLevel to 0–4', () => {
    expect(LEVEL).toEqual({ NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 });
    const data = shapeGithub({ login: 'Lunecid', repos: RAW_REPOS, graph: GRAPH.data, errors: [], authFailed: false, now: NOW });
    // `?.`: the JSDoc-inferred type of `calendar` is `{ … } | null` (astro check runs strict null checks on tests)
    expect(data.calendar?.total).toBe(42);
    expect(data.calendar?.weeks[0]?.map((d: { level: number }) => d.level)).toEqual([0, 4, 1, 2, 3, 0]);
    expect(data.calendar?.weeks[0]?.[1]).toEqual({ date: '2026-09-21', count: 9, level: 4 });
    expect(data.pinned).toEqual([
      { name: 'PUBG_Lab', description: '', url: 'https://github.com/Lunecid/PUBG_Lab', language: 'Python', topics: ['pubg'], stars: 1 },
    ]);
  });

  it('final review fix 1 item 7: a private pinned repository (or one whose visibility is unknown) never reaches the data', () => {
    const privateNode = {
      name: 'course-project-private',
      description: 'private course repository',
      url: 'https://github.com/Lunecid/course-project-private',
      isPrivate: true,
      stargazerCount: 0,
      primaryLanguage: { name: 'Python' },
      repositoryTopics: { nodes: [] },
    };
    const unknownNode = { ...privateNode, name: 'visibility-unknown', url: 'https://github.com/Lunecid/visibility-unknown', isPrivate: undefined };
    const user = GRAPH.data.user;
    const graph = { user: { ...user, pinnedItems: { nodes: [privateNode, ...user.pinnedItems.nodes, unknownNode] } } };
    const data = shapeGithub({ login: 'Lunecid', repos: RAW_REPOS, graph, errors: [], authFailed: false, now: NOW });
    expect(data.pinned?.map((p: { name: string }) => p.name)).toEqual(['PUBG_Lab']);
    expect(JSON.stringify(data)).not.toMatch(/course-project-private|visibility-unknown/);
  });

  it('final review fix 1 item 7: the GraphQL query asks for each pinned repository\'s isPrivate', async () => {
    const { impl, calls } = fakeFetch({ rest: () => json(200, RAW_REPOS), graphql: () => json(200, GRAPH) });
    await fetchGithub({ login: 'Lunecid', token: TOKEN, tokenKind: 'profile', fetchImpl: impl, now: NOW });
    const body = JSON.parse(String(calls[1]?.init?.body)) as { query: string };
    expect(body.query).toMatch(/pinnedItems\([^)]*\)\s*\{\s*nodes\s*\{\s*\.\.\. on Repository\s*\{[^}]*\bisPrivate\b/);
  });

  it('no token → partial with pinned/calendar null', async () => {
    const { impl, calls } = fakeFetch({ rest: () => json(200, RAW_REPOS) });
    const data = await fetchGithub({ login: 'Lunecid', fetchImpl: impl, now: NOW });
    expect(data.status).toBe('partial');
    expect(data.pinned).toBeNull();
    expect(data.calendar).toBeNull();
    expect(data.authFailed).toBe(false);
    expect(data.errors).toEqual(['no token: pinned repos and contribution calendar skipped']);
    expect(calls.map((c) => c.url)).toEqual(['https://api.github.com/users/Lunecid/repos?type=owner&sort=pushed&per_page=100']);
    expect(header(calls[0]?.init, 'Authorization')).toBeUndefined();
    expect(header(calls[0]?.init, 'User-Agent')).toBe('lunecid.github.io-build');
  });

  it('a token fetches pinned repos and the calendar with a Bearer header', async () => {
    const { impl, calls } = fakeFetch({ rest: () => json(200, RAW_REPOS), graphql: () => json(200, GRAPH) });
    const data = await fetchGithub({ login: 'Lunecid', token: TOKEN, tokenKind: 'actions', fetchImpl: impl, now: NOW });
    expect(data.status).toBe('ok');
    expect(data.errors).toEqual([]);
    expect(data.pinned).toHaveLength(1);
    expect(data.calendar?.total).toBe(42);
    expect(calls).toHaveLength(2);
    for (const call of calls) expect(header(call.init, 'Authorization')).toBe(`Bearer ${TOKEN}`);
    const body = JSON.parse(String(calls[1]?.init?.body)) as { variables: { login: string } };
    expect(body.variables.login).toBe('Lunecid');
  });

  it('401 sets authFailed for any token; 403 only for the profile token', async () => {
    const cases = [
      { token: '', tokenKind: 'none', rest: 401, graphql: 200, expected: true },
      { token: TOKEN, tokenKind: 'actions', rest: 401, graphql: 200, expected: true },
      { token: TOKEN, tokenKind: 'profile', rest: 401, graphql: 200, expected: true },
      { token: TOKEN, tokenKind: 'profile', rest: 200, graphql: 403, expected: true },
      { token: TOKEN, tokenKind: 'profile', rest: 403, graphql: 200, expected: true },
      { token: TOKEN, tokenKind: 'actions', rest: 403, graphql: 200, expected: false },
    ] as const;
    for (const c of cases) {
      const { impl } = fakeFetch({
        rest: () => (c.rest === 200 ? json(200, RAW_REPOS) : json(c.rest, { message: 'denied' })),
        graphql: () => (c.graphql === 200 ? json(200, GRAPH) : json(c.graphql, { message: 'denied' })),
      });
      const data = await fetchGithub({ login: 'Lunecid', token: c.token, tokenKind: c.tokenKind, fetchImpl: impl, now: NOW });
      expect(data.authFailed, `${c.tokenKind} rest=${c.rest} graphql=${c.graphql}`).toBe(c.expected);
    }
  });

  it('403 on GraphQL with the Actions token → partial, authFailed false', async () => {
    const { impl } = fakeFetch({ rest: () => json(200, RAW_REPOS), graphql: () => json(403, { message: 'Resource not accessible by integration' }) });
    const data = await fetchGithub({ login: 'Lunecid', token: TOKEN, tokenKind: 'actions', fetchImpl: impl, now: NOW });
    expect(data.status).toBe('partial');
    expect(data.authFailed).toBe(false);
    expect(data.pinned).toBeNull();
    expect(data.calendar).toBeNull();
    expect(data.errors).toHaveLength(1);
    expect(data.errors[0]).toContain('403');
    expect(data.repos).toHaveLength(2);
  });

  it('REST failure and no calendar → status error', async () => {
    const { impl } = fakeFetch({ rest: () => json(500, { message: 'boom' }) });
    const data = await fetchGithub({ login: 'Lunecid', fetchImpl: impl, now: NOW });
    expect(data.status).toBe('error');
    expect(data.repos).toEqual([]);
    expect(data.authFailed).toBe(false);
    expect(data.errors[0]).toContain('500');
  });

  it('never throws when the network fails', async () => {
    const failing = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    const data = await fetchGithub({ login: 'Lunecid', token: TOKEN, tokenKind: 'actions', fetchImpl: failing, now: NOW });
    expect(data.status).toBe('error');
    expect(data.errors).toHaveLength(2);
    expect(data.authFailed).toBe(false);
  });

  it('writeGithub writes only into the given outDir', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fetch-github-'));
    try {
      const data = shapeGithub({ login: 'Lunecid', repos: RAW_REPOS, graph: null, errors: [], authFailed: false, now: NOW });
      const out = join(dir, 'nested');
      const file = await writeGithub(data, out);
      expect(file).toBe(join(out, 'github.json'));
      expect(readdirSync(dir)).toEqual(['nested']);
      expect(readdirSync(out)).toEqual(['github.json']);
      expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(data);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
