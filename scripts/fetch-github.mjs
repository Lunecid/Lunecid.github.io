// scripts/fetch-github.mjs — GitHub REST + GraphQL → src/data/generated/github.json (spec §7, stack-ops §7.2).
// Never exits non-zero: a failed fetch hides the GitHub section instead of blocking the deploy.
// Auth rule (contract Task 17): authFailed = true on any 401, and on 403 only with GH_PROFILE_TOKEN;
// a 403 with the Actions token (e.g. the GraphQL contribution query) only drops pinned/calendar (status 'partial').
// Importing this module never fetches or writes; the CLI body runs only when executed directly.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SITE } from '../src/config.ts';

export const LEVEL = Object.freeze({ NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 });

const MAX_AGE_DAYS = 7;
const TIMEOUT_MS = 15_000;
const NO_TOKEN_MESSAGE = 'no token: pinned repos and contribution calendar skipped';
const QUERY = `query ($login: String!) { user(login: $login) {
  pinnedItems(first: 6, types: REPOSITORY) { nodes { ... on Repository { name description url isPrivate stargazerCount
    primaryLanguage { name } repositoryTopics(first: 6) { nodes { topic { name } } } } } }
  contributionsCollection { contributionCalendar { totalContributions
    weeks { contributionDays { date contributionCount contributionLevel } } } } } }`;

class HttpError extends Error {
  /** @param {string} message @param {number} status */
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/** @param {string} level */
function levelOf(level) {
  return Object.hasOwn(LEVEL, level) ? LEVEL[/** @type {keyof typeof LEVEL} */ (level)] : 0;
}

/**
 * Shapes raw REST repos + GraphQL `data` into the GitHubData contract (src/lib/generated.ts).
 * @param {{ login: string, repos: any[] | null, graph: any | null, errors?: string[], authFailed?: boolean, now?: Date }} input
 */
export function shapeGithub({ login, repos, graph, errors = [], authFailed = false, now = new Date() }) {
  const errs = [...errors];
  const lower = login.toLowerCase();
  const shapedRepos = Array.isArray(repos)
    ? repos
        .filter((r) => r && !r.fork && !r.private && String(r.name).toLowerCase() !== lower && String(r.name).toLowerCase() !== `${lower}.github.io`)
        .map((r) => ({
          name: String(r.name),
          description: r.description ?? '',
          url: String(r.html_url),
          homepage: r.homepage || null,
          language: r.language ?? null,
          topics: Array.isArray(r.topics) ? r.topics : [],
          stars: Number(r.stargazers_count ?? 0),
          pushedAt: String(r.pushed_at),
          archived: Boolean(r.archived),
        }))
    : [];
  let pinned = null;
  let calendar = null;
  if (graph) {
    try {
      const user = graph.user;
      // Final review fix 1 item 7: like the REST list, never publish a private repository. Fail closed: a node
      // whose visibility is not explicitly public (isPrivate false) is dropped too.
      pinned = user.pinnedItems.nodes
        .filter((n) => n && n.isPrivate === false)
        .map((n) => ({
          name: String(n.name),
          description: n.description ?? '',
          url: String(n.url),
          language: n.primaryLanguage?.name ?? null,
          topics: (n.repositoryTopics?.nodes ?? []).map((t) => t.topic.name),
          stars: Number(n.stargazerCount ?? 0),
        }));
      const cal = user.contributionsCollection.contributionCalendar;
      calendar = {
        total: Number(cal.totalContributions),
        weeks: cal.weeks.map((w) =>
          w.contributionDays.map((d) => ({ date: String(d.date), count: Number(d.contributionCount), level: levelOf(d.contributionLevel) })),
        ),
      };
    } catch (e) {
      pinned = null;
      calendar = null;
      errs.push(`GraphQL shape: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const status = shapedRepos.length === 0 && calendar === null ? 'error' : errs.length > 0 ? 'partial' : 'ok';
  return {
    schemaVersion: 1,
    source: 'github',
    login,
    status,
    fetchedAt: now.toISOString(),
    maxAgeDays: MAX_AGE_DAYS,
    authFailed,
    repos: shapedRepos,
    pinned,
    calendar,
    errors: errs,
  };
}

/**
 * @param {{ login?: string, token?: string, tokenKind?: 'profile' | 'actions' | 'none', fetchImpl?: typeof fetch, now?: Date }} [options]
 */
export async function fetchGithub({ login = 'Lunecid', token = '', tokenKind = 'none', fetchImpl = fetch, now = new Date() } = {}) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'lunecid.github.io-build',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  /** @type {string[]} */
  const errors = [];
  let authFailed = false;
  /** @param {unknown} e */
  const record = (e) => {
    const status = e instanceof HttpError ? e.status : 0;
    if (status === 401 || (status === 403 && tokenKind === 'profile')) authFailed = true;
    errors.push(e instanceof Error ? e.message : String(e));
  };

  let repos = null;
  try {
    const path = `/users/${encodeURIComponent(login)}/repos?type=owner&sort=pushed&per_page=100`;
    const res = await fetchImpl(`https://api.github.com${path}`, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new HttpError(`REST ${path} -> ${res.status}`, res.status);
    repos = await res.json();
  } catch (e) {
    record(e);
  }

  let graph = null;
  if (token) {
    try {
      const res = await fetchImpl('https://api.github.com/graphql', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: QUERY, variables: { login } }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new HttpError(`GraphQL -> ${res.status} ${JSON.stringify(body?.message ?? '')}`, res.status);
      if (body.errors) throw new Error(`GraphQL errors ${JSON.stringify(body.errors)}`);
      graph = body.data ?? null;
    } catch (e) {
      record(e);
    }
  } else {
    errors.push(NO_TOKEN_MESSAGE);
  }

  return shapeGithub({ login, repos, graph, errors, authFailed, now });
}

/** @param {object} data @param {string} outDir @returns {Promise<string>} */
export async function writeGithub(data, outDir) {
  await mkdir(outDir, { recursive: true });
  const file = join(outDir, 'github.json');
  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
  return file;
}

async function main() {
  try {
    const profileToken = process.env.GH_PROFILE_TOKEN || '';
    const actionsToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
    const token = profileToken || actionsToken;
    const tokenKind = profileToken ? 'profile' : actionsToken ? 'actions' : 'none';
    const login = process.env.GH_PROFILE_LOGIN || SITE.githubLogin;
    const data = await fetchGithub({ login, token, tokenKind });
    const file = await writeGithub(data, 'src/data/generated');
    console.log(
      `github.json status=${data.status} repos=${data.repos.length} pinned=${data.pinned?.length ?? 'null'} ` +
        `calendarWeeks=${data.calendar?.weeks.length ?? 'null'} errors=${data.errors.length} authFailed=${data.authFailed} -> ${file}`,
    );
  } catch (e) {
    // Never block the deploy: the GitHub section simply stays hidden.
    console.error(`fetch-github: ${e instanceof Error ? e.message : String(e)}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
