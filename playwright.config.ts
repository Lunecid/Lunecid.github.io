import { defineConfig, devices } from '@playwright/test';
const PORT = Number(process.env.E2E_PORT ?? 4329);
const NO_ART_PORT = Number(process.env.E2E_NO_ART_PORT ?? 4330);
const E2E_ACCOUNTS_PORT = Number(process.env.E2E_ACCOUNTS_PORT ?? 4332);
const channel = process.env.PW_CHANNEL; // 'chrome' locally on Windows, unset in CI
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: 'retain-on-failure', ...(channel ? { channel } : {}) },
  // --ignore-lock: a preview server for this project may already be running on another port (e.g. a manually
  // started one used to eyeball the site); astro's preview lock is per-project, not per-port, so without this
  // flag `astro preview` refuses to start a second instance and the whole e2e run fails before it begins.
  webServer: [
    { command: `npm run preview -- --host 127.0.0.1 --port ${PORT} --ignore-lock`, url: `http://127.0.0.1:${PORT}/`, reuseExistingServer: false, timeout: 60_000 },
    // D-1 no-art layouts (tests/e2e/no-art.spec.ts): the same site built as if no character art existed, via the
    // test-only SB_NO_ART switch (src/lib/characters.ts), into dist-no-art/ (never deployed; the workflow uploads dist/).
    {
      command: `npm run build -- --outDir dist-no-art && npm run preview -- --outDir dist-no-art --host 127.0.0.1 --port ${NO_ART_PORT} --ignore-lock`,
      env: { SB_NO_ART: '1' },
      url: `http://127.0.0.1:${NO_ART_PORT}/`,
      reuseExistingServer: false,
      timeout: 240_000,
    },
    // Account-link fixture build (tests/e2e/accounts.spec.ts): the test-only SB_E2E_ACCOUNTS switch points the
    // @generated alias at the synthetic feeds of tests/fixtures/generated and the relay at the fixture origin, into
    // dist-e2e-accounts/ (never deployed; the workflow never sets the switch).
    {
      command: `npm run build -- --outDir dist-e2e-accounts && npm run preview -- --outDir dist-e2e-accounts --host 127.0.0.1 --port ${E2E_ACCOUNTS_PORT} --ignore-lock`,
      env: { SB_E2E_ACCOUNTS: '1' },
      url: `http://127.0.0.1:${E2E_ACCOUNTS_PORT}/`,
      reuseExistingServer: false,
      timeout: 240_000,
    },
  ],
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } }, testIgnore: /nojs\.spec\.ts/ },
    { name: 'tablet', use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } }, testMatch: /(responsive|screenshots)\.spec\.ts/ },
    { name: 'mobile-375', use: { ...devices['Pixel 7'], viewport: { width: 375, height: 812 } }, testMatch: /(responsive|nojs|keyboard|screenshots)\.spec\.ts/ },
    { name: 'mobile-320', use: { ...devices['Pixel 7'], viewport: { width: 320, height: 640 } }, testMatch: /(responsive|screenshots)\.spec\.ts/ },
  ],
});
