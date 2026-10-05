// src/lib/csp.ts — the site's Content-Security-Policy directives (account-link spec §8.2, C0). Plain-Node safe: the
// only runtime import is the import-free src/config.ts. astro.config.mjs uses it; scripts/csp/finalize.mjs then
// re-hashes the inline blocks of the built pages under these directives.
import { ACCOUNT_ADMIN, GOATCOUNTER } from '../config.ts';

export const RELAY_ORIGIN_RE = /^https:\/\/account-relay\.[a-z0-9-]+\.workers\.dev$/;
/** Test builds only (SB_E2E_ACCOUNTS=1 → dist-e2e-accounts, never deployed). */
export const E2E_RELAY_ORIGIN = 'https://account-relay.e2e-fixture.workers.dev';
export const GOATCOUNTER_ORIGIN: string | null = GOATCOUNTER.code === null ? null : `https://${GOATCOUNTER.code}.goatcounter.com`;

export function relayOrigin(env: Record<string, string | undefined>): string | null {
  const origin = env.SB_E2E_ACCOUNTS === '1' ? E2E_RELAY_ORIGIN : ACCOUNT_ADMIN.relay;
  if (origin !== null && !RELAY_ORIGIN_RE.test(origin)) throw new Error(`csp: ${origin} is not https://account-relay.<subdomain>.workers.dev`);
  return origin;
}

export function cspDirectives(opts: { relay: string | null }): string[] {
  const gc = GOATCOUNTER_ORIGIN === null ? [] : [GOATCOUNTER_ORIGIN];
  return [
    "default-src 'self'",
    ['connect-src', "'self'", ...(opts.relay === null ? [] : [opts.relay]), ...gc].join(' '),
    // data: is spec-driven (account-link spec §8.2), not used by any page yet; the GoatCounter origin is for the
    // <img> beacon count.v5.js falls back to.
    ['img-src', "'self'", 'data:', ...gc].join(' '),
    "media-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'", // GitHub and Steam logins are window.open popups or location.assign, never a <form>
  ];
}

export function scriptResources(opts: { goatcounterCdn: boolean }): string[] {
  // 'self': island scripts and the lazy management chunk are /_astro/*.js files (no inline hash can match them).
  return ["'self'", ...(opts.goatcounterCdn ? ['https://gc.zgo.at'] : [])];
}

// 'self': Vite links a lazy chunk's CSS as <link rel="stylesheet">. Style attributes: React SSR style props of the
// frozen islands and --acct-tint; <style> elements stay hash-only.
export const STYLE_RESOURCES = ["'self'", { resource: "'unsafe-inline'", kind: 'attribute' as const }];
