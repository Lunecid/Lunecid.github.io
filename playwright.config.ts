import { defineConfig, devices } from '@playwright/test';
import { E2E_DISTS } from './scripts/e2e-dists.mjs';
import { ACCOUNTS_PORT, NO_ART_PORT, PORT } from './tests/e2e/ports';
const channel = process.env.PW_CHANNEL; // 'chrome' locally on Windows, unset in CI
const prebuilt = process.env.E2E_PREBUILT === '1';
const E2E_DIST_PORTS: Record<string, number> = { 'dist-no-art': NO_ART_PORT, 'dist-e2e-accounts': ACCOUNTS_PORT };
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  // Local runs print one dot per test and the failures at the end (a full run's `list` log is about 250 KB); CI keeps
  // the per-test list and the HTML report it uploads.
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'dot',
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: 'retain-on-failure', ...(channel ? { channel } : {}) },
  // --ignore-lock: a preview server for this project may already be running on another port (e.g. a manually
  // started one used to eyeball the site); astro's preview lock is per-project, not per-port, so without this
  // flag `astro preview` refuses to start a second instance and the whole e2e run fails before it begins.
  webServer: [
    { command: `npm run preview -- --host 127.0.0.1 --port ${PORT} --ignore-lock`, url: `http://127.0.0.1:${PORT}/`, reuseExistingServer: false, timeout: 60_000 },
    // The two test-only sites (scripts/e2e-dists.mjs, never deployed: the workflow uploads dist/ to Pages): the D-1 no-art
    // layouts (tests/e2e/art-variants.spec.ts) and the account-link fixture build (tests/e2e/accounts.spec.ts). Locally
    // each server builds its directory first. E2E_PREBUILT=1 (the CI e2e shards, which download the build job's
    // directories) serves them as they are, so no shard rebuilds the site.
    ...E2E_DISTS.map(({ outDir, env }) => {
      const port = E2E_DIST_PORTS[outDir];
      const preview = `npm run preview -- --outDir ${outDir} --host 127.0.0.1 --port ${port} --ignore-lock`;
      return {
        command: prebuilt ? preview : `npm run build -- --outDir ${outDir} && ${preview}`,
        env,
        url: `http://127.0.0.1:${port}/`,
        reuseExistingServer: false,
        timeout: prebuilt ? 60_000 : 240_000,
      };
    }),
  ],
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } }, testIgnore: /nojs\.spec\.ts/ },
    { name: 'tablet', use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } }, testMatch: /(responsive|screenshots)\.spec\.ts/ },
    { name: 'mobile-375', use: { ...devices['Pixel 7'], viewport: { width: 375, height: 812 } }, testMatch: /(responsive|nojs|keyboard|screenshots)\.spec\.ts/ },
    { name: 'mobile-320', use: { ...devices['Pixel 7'], viewport: { width: 320, height: 640 } }, testMatch: /(responsive|screenshots)\.spec\.ts/ },
  ],
});
