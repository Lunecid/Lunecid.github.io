// Pins the shape of .github/workflows/deploy.yml (Task 31) and the behaviour of scripts/check-fetch-status.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { load } from 'js-yaml';

const WORKFLOW = '.github/workflows/deploy.yml';
const SCRIPT = 'scripts/check-fetch-status.mjs';

const EXPECTED_ACTIONS = [
  'actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9',
  'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
  'actions/deploy-pages@368f82528645a54fb793d4d04e342629a3f51346',
  'actions/download-artifact@37930b1c2abaa49bbe596cd826c3c89aef350131',
  'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
  'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',
  'actions/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9',
  'gitleaks/gitleaks-action@e0c47f4f8be36e29cdc102c57e68cb5cbf0e8d1e',
];

function readWorkflow() {
  const text = readFileSync(WORKFLOW, 'utf8').replace(/\r\n/g, '\n');
  return { text, wf: load(text) };
}

function allSteps(wf) {
  return Object.entries(wf.jobs).flatMap(([job, def]) => (def.steps ?? []).map((step, index) => ({ job, index, step })));
}

/** Dotted paths of every string value that references `needle` (default secrets.*) */
function secretPaths(node, path = [], needle = 'secrets.') {
  if (typeof node === 'string') return node.includes(needle) ? [path.join('.')] : [];
  if (Array.isArray(node)) return node.flatMap((value, i) => secretPaths(value, [...path, String(i)], needle));
  if (node && typeof node === 'object') return Object.entries(node).flatMap(([key, value]) => secretPaths(value, [...path, key], needle));
  return [];
}

const ACCOUNT_VARS = [
  'ACCOUNT_GENSHIN_UID',
  'ACCOUNT_GENSHIN_NAME',
  'ACCOUNT_ZZZ_UID',
  'ACCOUNT_ZZZ_NAME',
  'ACCOUNT_STEAM_ID64',
  'ACCOUNT_STEAM_NAME',
  'ACCOUNT_RIOT_ID',
];

/** Index of the fetch-accounts job's fetch step. */
function accountStepIndex(wf) {
  return wf.jobs['fetch-accounts'].steps.findIndex((s) => s.name === 'Fetch linked game accounts');
}

/** Every job whose needs chain (direct or transitive) reaches `target`. */
function dependents(wf, target) {
  const needsOf = (job) => [wf.jobs[job].needs ?? []].flat();
  const reaches = (job, seen = new Set()) => needsOf(job).some((n) => n === target || (!seen.has(n) && (seen.add(n), reaches(n, seen))));
  return Object.keys(wf.jobs).filter((job) => reaches(job));
}

function fixtureDir(files) {
  const dir = mkdtempSync(join(tmpdir(), 'fetch-status-'));
  for (const [rel, content] of Object.entries(files)) {
    const file = join(dir, rel);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
  }
  return dir;
}

function runScript(args, env = {}) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', env: { ...process.env, ...env } });
}

// ── workflow ──────────────────────────────────────────────────────────────

test('every uses: is pinned to a 40-hex SHA', () => {
  const { wf } = readWorkflow();
  const uses = allSteps(wf).map(({ step }) => step.uses).filter(Boolean);
  for (const ref of uses) assert.match(ref, /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/, ref);
  assert.deepEqual([...new Set(uses)].sort(), EXPECTED_ACTIONS, 'exactly the stack-ops §1 actions (download-artifact v7.0.0 for the account feeds)');
});

test('secrets.* appear only in the fetch step, the ops-test PII_DENYLIST env, the gitleaks step and the fetch-accounts step', () => {
  const { text, wf } = readWorkflow();
  const build = wf.jobs.build.steps;
  const fetchIndex = build.findIndex((s) => s.name === 'Fetch build-time data');
  const opsIndex = build.findIndex((s) => s.run === 'npm run test:ops');
  const leakIndex = wf.jobs['secrets-scan'].steps.findIndex((s) => String(s.uses ?? '').startsWith('gitleaks/gitleaks-action@'));
  const accountIndex = accountStepIndex(wf);
  assert.ok(fetchIndex >= 0 && opsIndex >= 0 && leakIndex >= 0 && accountIndex >= 0, 'fetch, ops, gitleaks and fetch-accounts steps exist');
  const expected = [
    `jobs.build.steps.${fetchIndex}.env.GH_PROFILE_TOKEN`,
    `jobs.build.steps.${fetchIndex}.env.GITHUB_TOKEN`,
    `jobs.build.steps.${fetchIndex}.env.GOATCOUNTER_TOKEN`,
    `jobs.build.steps.${opsIndex}.env.PII_DENYLIST`,
    `jobs.secrets-scan.steps.${leakIndex}.env.GITHUB_TOKEN`,
    `jobs.fetch-accounts.steps.${accountIndex}.env.STEAM_API_KEY`,
  ].sort();
  assert.deepEqual(secretPaths(wf).sort(), expected);
  assert.equal((text.match(/\$\{\{\s*secrets\./g) ?? []).length, 6, 'no secrets.* anywhere else in the file');
  assert.deepEqual(wf.jobs['fetch-accounts'].steps[accountIndex].env, {
    ...Object.fromEntries(ACCOUNT_VARS.map((name) => [name, `\${{ vars.${name} }}`])),
    STEAM_API_KEY: '${{ secrets.STEAM_API_KEY }}',
  });
  assert.deepEqual(build[fetchIndex].env, {
    GH_PROFILE_TOKEN: '${{ secrets.GH_PROFILE_TOKEN }}',
    GITHUB_TOKEN: '${{ secrets.GITHUB_TOKEN }}',
    GOATCOUNTER_TOKEN: '${{ secrets.GOATCOUNTER_TOKEN }}',
  });
  assert.deepEqual(build[opsIndex].env, { PII_DENYLIST: '${{ secrets.PII_DENYLIST }}' });
  assert.deepEqual(wf.jobs['secrets-scan'].steps[leakIndex].env, { GITHUB_TOKEN: '${{ secrets.GITHUB_TOKEN }}' });
});

test('the workflow never sets GOATCOUNTER_CODE', () => {
  const { text } = readWorkflow();
  assert.equal(text.includes('GOATCOUNTER_CODE'), false);
});

test('cron is 30 18 * * *', () => {
  const { wf } = readWorkflow();
  assert.deepEqual(wf.on.schedule, [{ cron: '30 18 * * *' }]);
  assert.deepEqual(wf.on.push, { branches: ['main'] });
  assert.ok('workflow_dispatch' in wf.on);
});

test('account-link AL-7: triggers stay push main, input-free workflow_dispatch and the cron; no PR or workflow_run trigger', () => {
  const { wf } = readWorkflow();
  assert.deepEqual(Object.keys(wf.on).sort(), ['push', 'schedule', 'workflow_dispatch']);
  const dispatch = wf.on.workflow_dispatch;
  assert.ok(dispatch === null || (typeof dispatch === 'object' && !('inputs' in dispatch)), 'workflow_dispatch has no inputs');
  for (const name of ['pull_request', 'pull_request_target', 'workflow_run']) assert.equal(name in wf.on, false, name);
});

test('account-link AL-7: vars.* appear only in the fetch-accounts step env; no run: contains ${{', () => {
  const { text, wf } = readWorkflow();
  const accountIndex = accountStepIndex(wf);
  assert.deepEqual(
    secretPaths(wf, [], 'vars.').sort(),
    ACCOUNT_VARS.map((name) => `jobs.fetch-accounts.steps.${accountIndex}.env.${name}`).sort(),
  );
  assert.equal((text.match(/\$\{\{\s*vars\./g) ?? []).length, ACCOUNT_VARS.length, 'no vars.* expression anywhere else in the file');
  for (const { job, index, step } of allSteps(wf)) {
    if (step.run !== undefined) assert.doesNotMatch(String(step.run), /\$\{\{/, `${job}.steps.${index}.run has no expression`);
  }
});

test('account-link AL-7: fetch-accounts runs in the account-fetch environment with contents: read, no npm and only the fetcher', () => {
  const { wf } = readWorkflow();
  const job = wf.jobs['fetch-accounts'];
  assert.ok(job, 'job fetch-accounts exists');
  assert.equal(job['runs-on'], 'ubuntu-latest');
  assert.equal(job['timeout-minutes'], 5);
  assert.equal(job.environment, 'account-fetch');
  assert.deepEqual(job.permissions, { contents: 'read' });
  assert.equal(job.needs, undefined, 'fetch-accounts waits for no job');
  assert.equal('continue-on-error' in job, false, 'no job-level continue-on-error (result-based if: downstream instead)');
  assert.equal('if' in job, false, 'the job always runs; with no variables it writes nothing');
  assert.deepEqual(
    job.steps.map((s) => String(s.uses ?? '').split('@')[0]).filter(Boolean),
    ['actions/checkout', 'actions/setup-node', 'actions/upload-artifact'],
  );
  const runs = job.steps.map((s) => s.run).filter((r) => r !== undefined);
  assert.deepEqual(runs, ['node scripts/fetch-accounts.mjs --out account-feeds'], 'the zero-dependency fetcher is the only command');
  for (const run of runs) assert.doesNotMatch(run, /npm/);
  const checkout = job.steps.find((s) => String(s.uses ?? '').startsWith('actions/checkout@'));
  assert.equal(checkout.with['persist-credentials'], false);
  const setup = job.steps.find((s) => String(s.uses ?? '').startsWith('actions/setup-node@'));
  assert.equal(setup.with['node-version'], 24);
  assert.equal('cache' in setup.with, false, 'no npm cache in the key job');
  const upload = job.steps.find((s) => String(s.uses ?? '').startsWith('actions/upload-artifact@'));
  assert.equal(upload.uses, 'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a');
  assert.deepEqual(upload.with, { name: 'account-feeds', path: 'account-feeds/', 'retention-days': 1, 'if-no-files-found': 'ignore' });
  assert.ok(job.steps.indexOf(upload) > accountStepIndex(wf), 'the artifact is uploaded after the fetch');
});

test('account-link AL-7: build waits for fetch-accounts but runs unless cancelled, and brings in the feeds between npm ci and the fetch', () => {
  const { wf } = readWorkflow();
  const build = wf.jobs.build;
  assert.deepEqual(build.needs, ['fetch-accounts']);
  assert.equal(build.if, '${{ !cancelled() }}');
  const steps = build.steps;
  const ciIndex = steps.findIndex((s) => s.run === 'npm ci');
  const fetchIndex = steps.findIndex((s) => s.name === 'Fetch build-time data');
  const downloads = steps.filter((s) => String(s.uses ?? '').startsWith('actions/download-artifact@'));
  assert.equal(downloads.length, 1, 'one download step');
  const dlIndex = steps.indexOf(downloads[0]);
  assert.ok(ciIndex >= 0 && ciIndex < dlIndex && dlIndex < fetchIndex, 'after npm ci, before "Fetch build-time data"');
  const dl = steps[dlIndex];
  assert.equal(dl.name, 'Bring in account feeds');
  assert.equal(dl.uses, 'actions/download-artifact@37930b1c2abaa49bbe596cd826c3c89aef350131');
  assert.equal(dl['continue-on-error'], true);
  assert.deepEqual(dl.with, { name: 'account-feeds', path: 'src/data/generated' });
  assert.equal(dl.env, undefined);
});

test('account-link AL-7: deploy and fetch-health use result-based conditions; every job after fetch-accounts survives its failure', () => {
  const { wf } = readWorkflow();
  assert.equal(wf.jobs.deploy.if, "${{ !cancelled() && needs.build.result == 'success' && needs.secrets-scan.result == 'success' }}");
  assert.deepEqual(wf.jobs.deploy.needs, ['build', 'secrets-scan']);
  assert.equal(
    wf.jobs['fetch-health'].if,
    "${{ !cancelled() && needs.deploy.result == 'success' && needs.build.outputs.auth_failed == 'true' }}",
  );
  const after = dependents(wf, 'fetch-accounts').sort();
  assert.deepEqual(after, ['build', 'deploy', 'fetch-health']);
  for (const job of after) {
    const cond = String(wf.jobs[job].if ?? '');
    assert.match(cond, /!cancelled\(\)/, `${job}: !cancelled()`);
    if (job !== 'build') assert.match(cond, /needs\.[\w-]+\.result == 'success'/, `${job}: result-based needs check`);
  }
});

test('top-level permissions are empty and deploy has pages/id-token write', () => {
  const { wf } = readWorkflow();
  assert.deepEqual(wf.permissions, {});
  assert.deepEqual(wf.jobs.deploy.permissions, { pages: 'write', 'id-token': 'write' });
  assert.deepEqual(wf.jobs.build.permissions, { contents: 'read' });
  assert.deepEqual(wf.jobs['secrets-scan'].permissions, { contents: 'read' });
  assert.deepEqual(wf.jobs.deploy.needs, ['build', 'secrets-scan']);
  assert.equal(wf.jobs.deploy.environment.name, 'github-pages');
  assert.deepEqual(wf.concurrency, { group: 'pages', 'cancel-in-progress': false });
});

test('node-version 24 and build timeout 30', () => {
  const { wf } = readWorkflow();
  const setup = wf.jobs.build.steps.find((s) => String(s.uses ?? '').startsWith('actions/setup-node@'));
  assert.equal(setup.with['node-version'], 24);
  assert.equal(setup.with.cache, 'npm');
  assert.equal(wf.jobs.build['timeout-minutes'], 30);
});

test('build steps run in the contract order', () => {
  const { wf } = readWorkflow();
  const runs = wf.jobs.build.steps.map((s) => s.run).filter(Boolean).map((r) => r.trim().split('\n')[0]);
  assert.deepEqual(runs, [
    'npm ci',
    'npm run fetch',
    'node scripts/check-fetch-status.mjs src/data/generated --github-output',
    'npm run check',
    'npm test',
    'npm run build',
    'npm exec -- playwright install --with-deps chromium',
    'npm run build:pdf',
    'npm run test:ops',
    'npm run test:e2e',
    'npm run test:links',
    'npm run test:lh',
  ]);
  const steps = wf.jobs.build.steps;
  const cacheIndex = steps.findIndex((s) => String(s.uses ?? '').startsWith('actions/cache@'));
  const buildIndex = steps.findIndex((s) => s.run === 'npm run build');
  assert.ok(cacheIndex >= 0 && cacheIndex < buildIndex, 'image cache is restored before the build');
  assert.equal(steps[cacheIndex].with.path, 'node_modules/.astro');
  assert.equal(steps[cacheIndex].with.key, "astro-${{ hashFiles('src/assets/**', 'package-lock.json') }}");
  assert.match(steps.find((s) => String(s.run ?? '').startsWith('npm exec -- playwright install')).run, /apt-get install -y --no-install-recommends poppler-utils/);
  assert.ok(String(steps.at(-1).uses).startsWith('actions/upload-pages-artifact@'), 'the Pages artifact is uploaded last');
});

test('fetch-health has no uses:, depends on build and deploy, and runs only when build output auth_failed is true', () => {
  const { wf } = readWorkflow();
  const build = wf.jobs.build;
  assert.deepEqual(build.outputs, { auth_failed: '${{ steps.fetchstatus.outputs.auth_failed }}' });
  const fetchIndex = build.steps.findIndex((s) => s.name === 'Fetch build-time data');
  const statusIndex = build.steps.findIndex((s) => s.id === 'fetchstatus');
  assert.equal(statusIndex, fetchIndex + 1, 'status is recorded right after the fetch');
  const health = wf.jobs['fetch-health'];
  assert.deepEqual(health.needs, ['build', 'deploy']);
  assert.equal(health.if, "${{ !cancelled() && needs.deploy.result == 'success' && needs.build.outputs.auth_failed == 'true' }}");
  assert.deepEqual(health.permissions, {});
  assert.ok(health.steps.length > 0 && health.steps.every((s) => !('uses' in s)));
  assert.match(health.steps.map((s) => s.run).join('\n'), /exit 1/);
});

test('final review fix 1 item 10: every checkout drops its credentials (no job pushes)', () => {
  const { wf } = readWorkflow();
  const checkouts = allSteps(wf).filter(({ step }) => String(step.uses ?? '').startsWith('actions/checkout@'));
  assert.deepEqual(checkouts.map(({ job }) => job).sort(), ['build', 'fetch-accounts', 'secrets-scan']);
  for (const { job, step } of checkouts) assert.equal(step.with?.['persist-credentials'], false, `${job}: persist-credentials false`);
  assert.equal(wf.jobs['secrets-scan'].steps.find((s) => String(s.uses ?? '').startsWith('actions/checkout@')).with['fetch-depth'], 0);
});

/** The secrets-scan step that points the pinned gitleaks action's BASE_REF override at a base below the root commit. */
function baseRefStep(wf) {
  const steps = wf.jobs['secrets-scan'].steps;
  const leakIndex = steps.findIndex((s) => String(s.uses ?? '').startsWith('gitleaks/gitleaks-action@'));
  const index = steps.findIndex((s) => /BASE_REF=/.test(String(s.run ?? '')));
  return { step: steps[index], index, leakIndex };
}

test('final review fix 1 item 10: on a push that starts at the root commit, gitleaks gets a BASE_REF that reaches the root (action stays pinned)', () => {
  const { wf } = readWorkflow();
  const { step, index, leakIndex } = baseRefStep(wf);
  assert.ok(step, 'a step sets BASE_REF for the gitleaks action');
  assert.ok(index >= 0 && index < leakIndex, 'it runs before the gitleaks step');
  assert.equal(step.if, "github.event_name == 'push'");
  // Fix round 2 item 7: the push scan keeps --no-merges --first-parent, so it reaches the root, not "the full history".
  assert.equal(step.name, 'Scan from the root commit when the push starts there');
  const { text } = readWorkflow();
  assert.match(text, /The push scan still passes --no-merges --first-parent/);
  assert.doesNotMatch(text, /full-history scan/);
  assert.equal(step.env.FIRST_PUSHED, '${{ github.event.commits[0].id }}');
  assert.equal(step.uses, undefined);
  assert.match(step.run, /git rev-parse --verify --quiet "\$\{FIRST_PUSHED\}\^"/);
  assert.match(step.run, />> "\$GITHUB_ENV"/);
  assert.equal(wf.jobs['secrets-scan'].steps[leakIndex].uses, 'gitleaks/gitleaks-action@e0c47f4f8be36e29cdc102c57e68cb5cbf0e8d1e');
});

/** Git Bash on Windows, bash elsewhere; null when there is none (the behaviour test is then skipped). */
function findBash() {
  const candidates = process.platform === 'win32' ? [join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Git', 'bin', 'bash.exe')] : ['bash'];
  for (const bash of candidates) {
    const probe = spawnSync(bash, ['-c', 'git --version'], { encoding: 'utf8' });
    if (probe.status === 0) return bash;
  }
  return null;
}

test('final review fix 1 item 10: when a push starts at the root, the BASE_REF step makes the push scan reach the root commit (first-parent line, no merges); later pushes are left alone', (t) => {
  const bash = findBash();
  if (!bash) {
    t.skip('no bash with git on this machine');
    return;
  }
  const { wf } = readWorkflow();
  const { step } = baseRefStep(wf);
  const repo = mkdtempSync(join(tmpdir(), 'gitleaks-base-'));
  // A throwaway repository isolated from this machine's git config (like the CI runner's clean config).
  const emptyConfig = join(repo, '..', `${repo.split(/[\\/]/).pop()}.gitconfig`);
  writeFileSync(emptyConfig, '');
  const identity = {
    GIT_CONFIG_GLOBAL: emptyConfig,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 't',
    GIT_AUTHOR_EMAIL: 't@example.invalid',
    GIT_COMMITTER_NAME: 't',
    GIT_COMMITTER_EMAIL: 't@example.invalid',
  };
  const sh = (script, env = {}) => spawnSync(bash, ['--noprofile', '--norc', '-eo', 'pipefail', '-c', script], { cwd: repo, encoding: 'utf8', env: { ...process.env, ...identity, ...env } });
  try {
    const setup = sh('git init -q . && for i in 1 2 3; do git commit -q --allow-empty -m "c$i"; done && git rev-list --reverse HEAD');
    assert.equal(setup.status, 0, setup.stderr);
    const commits = setup.stdout.trim().split('\n');
    assert.equal(commits.length, 3);
    const run = (first) => {
      const envFile = join(repo, `github-env-${first.slice(0, 7)}`);
      writeFileSync(envFile, '');
      const r = sh(step.run, { ...step.env, FIRST_PUSHED: first, GITHUB_ENV: envFile });
      assert.equal(r.status, 0, r.stderr);
      return readFileSync(envFile, 'utf8');
    };
    // First push of a new repository: commits[0] is the root commit.
    const env = run(commits[0]);
    const baseRef = /^BASE_REF=([0-9a-f]{40})$/m.exec(env)?.[1];
    assert.ok(baseRef, `BASE_REF written: ${JSON.stringify(env)}`);
    // What the pinned action then runs: git log --no-merges --first-parent <BASE_REF>^..<head>.
    const scanned = sh(`git log --no-merges --first-parent --format=%H ${baseRef}^..${commits[2]}`);
    assert.equal(scanned.status, 0, scanned.stderr);
    assert.deepEqual(scanned.stdout.trim().split('\n').reverse(), commits, 'the whole first-parent line, root included');
    // A later push (commits[0] has a parent): nothing is overridden.
    assert.equal(run(commits[1]), '');
  } finally {
    rmSync(repo, { recursive: true, force: true });
    rmSync(emptyConfig, { force: true });
  }
});

test('the screenshots artifact is uploaded with if: always()', () => {
  const { wf } = readWorkflow();
  const upload = wf.jobs.build.steps.find((s) => String(s.uses ?? '').startsWith('actions/upload-artifact@') && s.with?.name === 'screenshots');
  assert.ok(upload, 'screenshots upload step exists');
  assert.match(String(upload.if), /always\(\)/);
  assert.equal(upload.with.path, 'test-results/screenshots/');
  assert.equal(upload.with['retention-days'], 14);
  const report = wf.jobs.build.steps.find((s) => s.with?.name === 'playwright-report');
  assert.match(String(report.if), /failure\(\)/);
});

test('the CV PDFs artifact is uploaded with if: always()', () => {
  const { wf } = readWorkflow();
  const upload = wf.jobs.build.steps.find((s) => String(s.uses ?? '').startsWith('actions/upload-artifact@') && s.with?.name === 'cv-pdfs');
  assert.ok(upload, 'cv-pdfs upload step exists');
  assert.match(String(upload.if), /always\(\)/);
  assert.equal(upload.with.path, 'dist/cv/*.pdf');
  assert.equal(upload.with['retention-days'], 14);
  assert.equal(upload.with['if-no-files-found'], 'ignore');
  assert.equal(upload.uses, 'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a');
  const screenshots = wf.jobs.build.steps.findIndex((s) => s.with?.name === 'screenshots');
  const pdfs = wf.jobs.build.steps.findIndex((s) => s.with?.name === 'cv-pdfs');
  const pages = wf.jobs.build.steps.findIndex((s) => String(s.uses ?? '').startsWith('actions/upload-pages-artifact@'));
  assert.ok(screenshots >= 0 && pdfs > screenshots && pages > pdfs, 'cv-pdfs sits between screenshots and the Pages artifact');
});

// ── scripts/check-fetch-status.mjs ───────────────────────────────────────

// Each import below uses its own query string, so Node evaluates a fresh module instance (no cached import).

test('importing the module performs no fetch and writes no file', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fetch-status-import-'));
  const outFile = join(dir, 'github-output.txt');
  const saved = { fetch: globalThis.fetch, output: process.env.GITHUB_OUTPUT };
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error('no network in tests');
  };
  process.env.GITHUB_OUTPUT = outFile;
  try {
    await import('../../scripts/check-fetch-status.mjs?import=no-fetch');
    assert.equal(fetchCalls, 0);
    assert.equal(existsSync(outFile), false);
    assert.deepEqual(readdirSync(dir), []);
  } finally {
    globalThis.fetch = saved.fetch;
    if (saved.output === undefined) delete process.env.GITHUB_OUTPUT;
    else process.env.GITHUB_OUTPUT = saved.output;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('importing the module performs no work', async () => {
  const exitCode = process.exitCode;
  const mod = await import('../../scripts/check-fetch-status.mjs?import=no-work');
  assert.deepEqual(Object.keys(mod), ['findAuthFailures'], 'only the pure export; main() stays behind the argv guard');
  assert.equal(typeof mod.findAuthFailures, 'function');
  assert.equal(process.exitCode, exitCode, 'importing never sets an exit code');
});

test('finds authFailed in nested accounts/ files', async () => {
  const { findAuthFailures } = await import('../../scripts/check-fetch-status.mjs');
  const dir = fixtureDir({
    'github.json': { status: 'ok', authFailed: false },
    'stats.json': { status: 'skipped', authFailed: false },
    'accounts/nexon.json': { status: 'error', authFailed: true },
    'accounts/broken.json': '{ not json',
    'notes.txt': '{"authFailed": true}',
  });
  try {
    assert.deepEqual(await findAuthFailures(dir), ['accounts/nexon.json']);
    assert.deepEqual(await findAuthFailures(join(dir, 'missing')), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--github-output writes auth_failed=true and exits 0', () => {
  const failing = fixtureDir({ 'github.json': { authFailed: false }, 'accounts/riot.json': { authFailed: true } });
  const clean = fixtureDir({ 'github.json': { authFailed: false } });
  try {
    const out1 = join(failing, 'gh-output.txt');
    const r1 = runScript([failing, '--github-output'], { GITHUB_OUTPUT: out1 });
    assert.equal(r1.status, 0, r1.stderr);
    assert.equal(readFileSync(out1, 'utf8'), 'auth_failed=true\n');

    const out2 = join(clean, 'gh-output.txt');
    const r2 = runScript([clean, '--github-output'], { GITHUB_OUTPUT: out2 });
    assert.equal(r2.status, 0, r2.stderr);
    assert.equal(readFileSync(out2, 'utf8'), 'auth_failed=false\n');
  } finally {
    rmSync(failing, { recursive: true, force: true });
    rmSync(clean, { recursive: true, force: true });
  }
});

test('default mode exits 1 when any file has authFailed true', () => {
  const failing = fixtureDir({ 'stats.json': { authFailed: false }, 'accounts/steam.json': { authFailed: true } });
  const clean = fixtureDir({ 'stats.json': { authFailed: false } });
  try {
    const r1 = runScript([failing]);
    assert.equal(r1.status, 1);
    assert.match(r1.stderr, /accounts\/steam\.json/);
    const r2 = runScript([clean]);
    assert.equal(r2.status, 0, r2.stderr);
    assert.match(r2.stdout, /no authFailed in/);
  } finally {
    rmSync(failing, { recursive: true, force: true });
    rmSync(clean, { recursive: true, force: true });
  }
});
