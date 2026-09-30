// AL-16 (account-link spec §4.2, §4.3, §10, §11.1): /link-return/ is the popup relay page. It reads the Steam OpenID
// query or the GitHub `#gh` / `#gh-error` fragment, posts one message on BroadcastChannel('acct-link') to the opener's
// tab, clears its own URL and tries to close itself. It is a utility page: outside the route table, noindex, no
// canonical, no analytics, no module script. The two "close this window" sentences are always visible.
// The ticket and nonce below are fakes built at run time; nothing leaves 127.0.0.1.
import AxeBuilder from '@axe-core/playwright';
import type { BrowserContext, Page } from '@playwright/test';
import { collectViolations, expect, test, watchViolations } from './helpers';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const KO = '이 창을 닫아 주세요.';
const EN = 'You can close this window.';
const TICKET = 'tk_' + 'A'.repeat(44);
const NONCE = 'n0' + 'B'.repeat(22);

/** A same-origin tab that records every acct-link message. */
async function listener(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.goto('/404.html');
  await page.evaluate(() => {
    const w = window as unknown as { __msgs: unknown[] };
    w.__msgs = [];
    const ch = new BroadcastChannel('acct-link');
    ch.onmessage = (e) => w.__msgs.push(e.data);
  });
  return page;
}

const messages = (page: Page) => page.evaluate(() => (window as unknown as { __msgs: unknown[] }).__msgs);

/**
 * Opens the relay page in a tab the test created (not by script) after another page, so the page's window.close() is
 * refused and the tab can still be inspected afterwards.
 */
async function relayTab(context: BrowserContext, path: string): Promise<{ page: Page; requests: string[] }> {
  const page = await context.newPage();
  await page.goto('/404.html');
  await watchViolations(page);
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.goto(path, { waitUntil: 'load' });
  return { page, requests };
}

test('Steam: the openid.* query and s are posted as { kind: "steam", params, s }', async ({ context }) => {
  const rx = await listener(context);
  const { page } = await relayTab(context, '/link-return/?s=abc&openid.mode=id_res&openid.claimed_id=x');
  await expect.poll(() => messages(rx)).toEqual([{ kind: 'steam', params: { 'openid.mode': 'id_res', 'openid.claimed_id': 'x' }, s: 'abc' }]);
  expect(new URL(page.url()).search).toBe('');
});

test('GitHub: #gh and n are posted as { kind: "gh", ticket, n } and the URL keeps no fragment', async ({ context }) => {
  const rx = await listener(context);
  const { page } = await relayTab(context, `/link-return/#gh=${TICKET}&n=${NONCE}`);
  await expect.poll(() => messages(rx)).toEqual([{ kind: 'gh', ticket: TICKET, n: NONCE }]);
  expect(page.url()).not.toContain('#');
  expect(page.url()).not.toContain(TICKET);
  expect(new URL(page.url()).pathname).toBe('/link-return/');
});

test('GitHub errors: #gh-error without n posts n: null; with n it posts that n', async ({ context }) => {
  const rx = await listener(context);
  await relayTab(context, '/link-return/#gh-error=denied');
  await expect.poll(() => messages(rx)).toEqual([{ kind: 'gh-error', code: 'denied', n: null }]);
  await relayTab(context, `/link-return/#gh-error=state&n=${NONCE}`);
  await expect.poll(() => messages(rx)).toEqual([{ kind: 'gh-error', code: 'denied', n: null }, { kind: 'gh-error', code: 'state', n: NONCE }]);
});

test('nothing to relay: no message, the sentences stay', async ({ context }) => {
  const rx = await listener(context);
  const { page } = await relayTab(context, '/link-return/?other=1#x=y');
  await expect(page.getByText(KO)).toBeVisible();
  await page.waitForTimeout(300);
  expect(await messages(rx)).toEqual([]);
  expect(page.url()).not.toContain('#');
});

test('opened as a popup by the management tab (as in the real flow), the page posts and closes itself', async ({ context }) => {
  const rx = await listener(context);
  const popup = context.waitForEvent('page');
  await rx.evaluate(() => {
    const w = window.open('about:blank', 'acct-gh', 'popup,width=600,height=720');
    if (w === null) throw new Error('popup blocked');
    w.opener = null;
    w.location.replace('/link-return/#gh-error=denied');
  });
  const page = await popup;
  await page.waitForEvent('close', { timeout: 10_000 });
  await expect.poll(() => messages(rx)).toEqual([{ kind: 'gh-error', code: 'denied', n: null }]);
});

test('head and body: noindex, data-utility-page, lang ko, no canonical/hreflang/analytics/module script; both sentences visible; one request; no CSP violation; axe 0', async ({ context, request }) => {
  const html = await (await request.get('/link-return/')).text();
  expect(html).toMatch(/^<!DOCTYPE html><html lang="ko" data-utility-page/i);
  expect(html).toContain('<meta name="robots" content="noindex">');
  expect(html).toContain('<title>이 창을 닫아 주세요</title>');
  for (const link of ['<link rel="icon" href="/favicon.ico" sizes="32x32">', '<link rel="icon" type="image/svg+xml" href="/favicon.svg">', '<link rel="apple-touch-icon" href="/apple-touch-icon.png">']) {
    expect(html).toContain(link);
  }
  expect(html).not.toContain('rel="canonical"');
  expect(html).not.toContain('hreflang');
  // No analytics: the site-wide CSP meta names the GoatCounter origin; nothing else on the page may.
  expect(html.replace(/<meta http-equiv="content-security-policy" content="[^"]*">/, '')).not.toMatch(/goatcounter|gc\.zgo\.at|data-goatcounter/i);
  expect(html).not.toMatch(/<script[^>]*type="module"/);
  expect(html).not.toContain('astro-island');
  expect(html).not.toContain('og:image');
  expect(html.match(/<script\b/g)?.length).toBe(1);
  // The CSP meta is the second element of <head>, right after <meta charset>.
  expect(html).toMatch(/<head><meta charset="utf-8"><meta http-equiv="content-security-policy" content="[^"]+">/);

  const { page, requests } = await relayTab(context, '/link-return/?s=abc&openid.mode=id_res');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
  await expect(page.locator('html')).toHaveAttribute('data-utility-page', '');
  await expect(page.getByText(KO)).toBeVisible();
  await expect(page.locator('p[lang="en"]')).toHaveText(EN);
  await expect(page.locator('p[lang="en"]')).toBeVisible();
  await page.waitForTimeout(300);
  expect(requests.filter((u) => !u.startsWith('data:'))).toEqual([expect.stringMatching(/\/link-return\/\?s=abc&openid\.mode=id_res$/)]);
  expect(await collectViolations(page)).toEqual([]);
  const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  // (axe needs page scripts, so it runs in the JavaScript case above; the markup is the same.)
  test('both sentences are visible (the English one with lang="en")', async ({ page }) => {
    await page.goto('/link-return/#gh=whatever');
    await expect(page.getByText(KO)).toBeVisible();
    await expect(page.locator('p[lang="en"]')).toHaveText(EN);
    await expect(page.locator('p[lang="en"]')).toBeVisible();
    expect(page.url()).toContain('#gh=whatever');
  });
});
