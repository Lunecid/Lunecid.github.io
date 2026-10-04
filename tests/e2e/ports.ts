// Ports and origins of the three preview servers that playwright.config.ts starts: dist/ (PORT), dist-no-art/
// (NO_ART_PORT) and dist-e2e-accounts/ (ACCOUNTS_PORT). The config and the specs read them from here so each default is
// written once; the E2E_* variables move a port when a preview started by hand already holds it. No imports: the
// config loads this file before any spec does.
export const PORT = Number(process.env.E2E_PORT ?? 4329);
export const NO_ART_PORT = Number(process.env.E2E_NO_ART_PORT ?? 4330);
export const ACCOUNTS_PORT = Number(process.env.E2E_ACCOUNTS_PORT ?? 4332);

export const ORIGIN = `http://127.0.0.1:${PORT}`;
export const NO_ART_ORIGIN = `http://127.0.0.1:${NO_ART_PORT}`;
export const ACCOUNTS_ORIGIN = `http://127.0.0.1:${ACCOUNTS_PORT}`;
