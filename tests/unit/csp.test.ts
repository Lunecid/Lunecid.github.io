import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ACCOUNT_ADMIN } from '../../src/config';
import { E2E_RELAY_ORIGIN, GOATCOUNTER_ORIGIN, RELAY_ORIGIN_RE, cspDirectives, relayOrigin, scriptResources, STYLE_RESOURCES } from '../../src/lib/csp';
import { HOST_RE } from '../../workers/account-relay/src/index.mjs';
import { finalizeHtml } from '../../scripts/csp/finalize.mjs';

const sha = async (s: string) => `'sha256-${Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))).toString('base64')}'`;

describe('CSP directives (spec §8.2, C0)', () => {
  it('relay null: connect-src has self and GoatCounter only; no workers.dev, no api.github.com', () => {
    expect(ACCOUNT_ADMIN.relay).toBeNull();
    expect(GOATCOUNTER_ORIGIN).toBe('https://lunecid.goatcounter.com');
    expect(cspDirectives({ relay: null })).toEqual([
      "default-src 'self'",
      "connect-src 'self' https://lunecid.goatcounter.com",
      "img-src 'self' data: https://lunecid.goatcounter.com",
      "media-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'none'",
    ]);
  });
  it('a relay adds exactly one origin before GoatCounter', () => {
    expect(cspDirectives({ relay: 'https://account-relay.x-1.workers.dev' })[1]).toBe("connect-src 'self' https://account-relay.x-1.workers.dev https://lunecid.goatcounter.com");
  });
  it('relayOrigin: committed value, or the e2e fixture only for SB_E2E_ACCOUNTS=1', () => {
    expect(relayOrigin({})).toBe(ACCOUNT_ADMIN.relay);
    expect(relayOrigin({ SB_E2E_ACCOUNTS: '1' })).toBe(E2E_RELAY_ORIGIN);
    expect(relayOrigin({ SB_E2E_ACCOUNTS: 'yes' })).toBe(ACCOUNT_ADMIN.relay);
  });
  it('script-src: self (plus the GoatCounter CDN only when the script is not self-hosted); style attributes only as unsafe-inline', () => {
    expect(scriptResources({ goatcounterCdn: false })).toEqual(["'self'"]);
    expect(scriptResources({ goatcounterCdn: true })).toEqual(["'self'", 'https://gc.zgo.at']);
    expect(STYLE_RESOURCES).toEqual(["'self'", { resource: "'unsafe-inline'", kind: 'attribute' }]);
  });
  it('the workflow never sets SB_E2E_ACCOUNTS', () => {
    expect(readFileSync('.github/workflows/deploy.yml', 'utf8')).not.toContain('SB_E2E_ACCOUNTS');
  });
});

describe('finalizeHtml (scripts/csp/finalize.mjs)', () => {
  const META = (c: string) => `<meta http-equiv="content-security-policy" content="${c}">`;
  it('moves the meta right after <meta charset> and replaces stale hashes with the current ones', async () => {
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><script>a()</script><style>b{}</style><script type="application/ld+json">{}</script><script type="module" src="/_astro/x.js"></script>${META("script-src 'self' 'sha256-OLD='; style-src 'self' 'sha256-OLD2='")}</head><body></body></html>`;
    const out = finalizeHtml(html);
    expect(out).toMatch(/<meta charset="utf-8"><meta http-equiv="content-security-policy"/);
    expect(out.match(/http-equiv="content-security-policy"/g)).toHaveLength(1);
    expect(out).not.toContain('sha256-OLD');
    expect(out).toContain(await sha('a()'));
    expect(out).toContain(await sha('b{}'));
    expect(out).not.toContain(await sha('{}')); // JSON-LD does not run
    expect(finalizeHtml(out)).toBe(out); // idempotent
  });
  it('writes hashes into script-src-elem / style-src-elem when Astro emitted those directives', async () => {
    const html = `<head><meta charset="utf-8"><script>a()</script>${META("script-src 'self'; script-src-elem 'self' 'sha256-OLD='; style-src 'self'")}</head>`;
    expect(finalizeHtml(html)).toMatch(new RegExp(`script-src-elem 'self' ${(await sha('a()')).replace(/[+/=]/g, '\\$&')}`));
  });
  it('throws on a page with inline code and no CSP meta', () => {
    expect(() => finalizeHtml('<head><meta charset="utf-8"><script>a()</script></head>')).toThrow(/no CSP meta/);
  });
  it('hashes every runnable script type, skips only JSON data blocks, and throws on an unknown type', async () => {
    const page = (s: string) => `<head><meta charset="utf-8">${s}${META("script-src 'self'; style-src 'self'")}</head>`;
    const out = finalizeHtml(page('<script type="module">m()</script><script type="text/javascript">t()</script><script type="application/javascript">j()</script><script type="application/json">{"a":1}</script>'));
    for (const body of ['m()', 't()', 'j()']) expect(out).toContain(await sha(body));
    expect(out).not.toContain(await sha('{"a":1}'));
    expect(() => finalizeHtml(page('<script type="text/x-new">x()</script>'), 'x.html')).toThrow('csp-finalize: x.html unknown script type "text/x-new"');
  });
  it('"<style>" text inside a script body is not a style element; the real <style> after it keeps its own hash', async () => {
    const script = 'var s="<style>fake{}</style>";';
    const out = finalizeHtml(`<head><meta charset="utf-8"><script>${script}</script><style>real{}</style>${META("script-src 'self'; style-src 'self'")}</head>`);
    expect(out).toContain(await sha(script));
    expect(out).toContain(await sha('real{}'));
    expect(out).not.toContain(await sha('fake{}'));
  });
  it('throws on several CSP metas and on a page without <meta charset>; hashes a <style> inside <noscript>', async () => {
    const two = `<head><meta charset="utf-8">${META("script-src 'self'")}${META("script-src 'self'")}</head>`;
    expect(() => finalizeHtml(two, 'two.html')).toThrow('csp-finalize: two.html has 2 CSP metas');
    expect(() => finalizeHtml(`<head><script>a()</script>${META("script-src 'self'")}</head>`, 'c.html')).toThrow('csp-finalize: c.html has no <meta charset="utf-8">');
    const out = finalizeHtml(`<head><meta charset="utf-8">${META("style-src 'self'")}</head><body><noscript><style>n{}</style></noscript></body>`);
    expect(out).toContain(await sha('n{}'));
  });
});

describe('ACCOUNT_ADMIN.relay is null or a lowercase bare origin (AL-17 note, AL-22)', () => {
  it('the committed value', () => {
    const r: string | null = ACCOUNT_ADMIN.relay;
    if (r === null) return;
    expect(r).toMatch(RELAY_ORIGIN_RE);
    expect(r).toBe(r.toLowerCase());
    expect(new URL(r).origin).toBe(r); // bare: no path, slash, query, fragment, default port
    expect(HOST_RE.test(new URL(r).hostname)).toBe(true); // the Worker answers on this host
    expect(relayOrigin({})).toBe(r);
  });
  it('the guard refuses every other form', () => {
    for (const bad of [
      'https://Account-Relay.x.workers.dev', 'https://account-relay.X.workers.dev',
      'https://account-relay.x.workers.dev/', 'https://account-relay.x.workers.dev/gh',
      'https://account-relay.x.workers.dev:443', 'http://account-relay.x.workers.dev',
      'https://account-relay.x.workers.dev.evil.com', 'https://account-relay.a.b.workers.dev',
      ' https://account-relay.x.workers.dev', 'https://account-relay.x.workers.dev\n',
    ]) expect(RELAY_ORIGIN_RE.test(bad), JSON.stringify(bad)).toBe(false);
    expect(RELAY_ORIGIN_RE.test('https://account-relay.x-1.workers.dev')).toBe(true);
  });
});
