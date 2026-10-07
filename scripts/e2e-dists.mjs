// The two test-only sites the e2e run serves next to dist/ (never deployed: the workflow's Pages artifact is dist/).
// playwright.config.ts reads this list for its second and third web servers; `npm run build:e2e` runs this file to
// build them ahead of time (the CI build job, so the e2e shards only serve them). The switches stay in this file, so
// the workflow never names them.
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/**
 * Output directory and build-time switch of each test-only site, in web-server order.
 * @type {readonly { outDir: string; env: Record<string, string> }[]}
 */
export const E2E_DISTS = [
  // D-1 no-art layouts (tests/e2e/art-variants.spec.ts): the site built as if no character art existed (src/lib/characters.ts).
  { outDir: 'dist-no-art', env: { SB_NO_ART: '1' } },
  // Account-link fixture build (tests/e2e/accounts.spec.ts): the @generated alias points at tests/fixtures/generated and
  // the relay at the fixture origin.
  { outDir: 'dist-e2e-accounts', env: { SB_E2E_ACCOUNTS: '1' } },
];

/** Builds each site in turn with the same command the local web servers run; stops at the first failure. */
function main() {
  for (const { outDir, env } of E2E_DISTS) {
    // GITHUB_RUN_ID left out: on CI it would stamp the real run into #acct-status (src/lib/account-state.ts), and the
    // mocked relay's run (tests/e2e/helpers.ts FAKE_RUN_ID) could never match it. These sites are never deployed.
    const { GITHUB_RUN_ID: _run, ...base } = process.env;
    const r = spawnSync('npm', ['run', 'build', '--', '--outDir', outDir], { stdio: 'inherit', shell: process.platform === 'win32', env: { ...base, ...env } });
    if (r.status !== 0) {
      console.error(`build of ${outDir} failed`);
      process.exit(r.status ?? 1);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
