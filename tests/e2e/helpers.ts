import AxeBuilder from '@axe-core/playwright';
import { test as base, expect, type BrowserContext, type Locator, type Page, type Route } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { DOCUMENTS, NAV_HEIGHT_PX } from '../../src/config';
import type { Lang } from '../../src/i18n/ui';
import { E2E_RELAY_ORIGIN } from '../../src/lib/csp';
import { steamButtonAvailable } from '../../src/lib/public-assets';
import { allRoutes, anchorsFor, legacyRedirects, parseRoute, routePath, type RouteKind } from '../../src/lib/routes';
import type { VariantId } from '../../src/variants/ids';
import { ACCOUNTS_ORIGIN, ORIGIN } from './ports';

export { expect };

/** Height of the sticky HUD nav in CSS px (src/config.ts NAV_HEIGHT_PX = tokens.css --nav-h = 52). */
export const NAV_HEIGHT: number = NAV_HEIGHT_PX;

const DIST = join(process.cwd(), 'dist');

/** Section ids that render only with data or content (§5.4 "Conditional section ids"). */
const CONDITIONAL_IDS = ['github', 'details', 'figures', 'links', 'daily', 'top-pages', 'referrers'];

/** '/en/game/records/' → { lang: 'en', variant: 'game', base: '/records/' }; throws for anything outside the table. */
export function basePathOf(route: string): { lang: Lang; variant: VariantId | null; base: string } {
  const info = parseRoute(route);
  if (!info) throw new Error(`basePathOf: ${route} is not in the route table`);
  return { lang: info.lang, variant: info.variant, base: info.base };
}
/** routePath with lang default 'ko'. */
export function routeOf(base: string, opts: { lang?: Lang; variant: VariantId | null }): string {
  return routePath(base, opts.lang ?? 'ko', opts.variant);
}
export function gamePath(base: string, lang: Lang = 'ko'): string {
  return routeOf(base, { lang, variant: 'game' });
}
export function dataPath(base: string, lang: Lang = 'ko'): string {
  return routeOf(base, { lang, variant: 'data' });
}
/** Routes of allRoutes() whose page exists in dist, optionally filtered by kind, version and language. */
export function builtRoutes(filter: { kind?: RouteKind; variant?: VariantId | null; lang?: Lang } = {}): string[] {
  return allRoutes().filter((route) => {
    if (!existsSync(join(DIST, route, 'index.html'))) return false;
    const info = parseRoute(route);
    if (!info) return false;
    return (filter.kind === undefined || info.kind === filter.kind)
      && (filter.variant === undefined || info.variant === filter.variant)
      && (filter.lang === undefined || info.lang === filter.lang);
  });
}
/** True when the built page of `route` has an element with this id: a section that renders only with data (see stale-data.spec.ts). */
export function builtHasId(route: string, id: string): boolean {
  const file = join(DIST, route, 'index.html');
  return existsSync(file) && new RegExp(`<[a-z][a-z0-9-]*\\b[^>]*\\bid="${id}"[^>]*>`).test(readFileSync(file, 'utf8'));
}
/**
 * The real build's #acct-status (dist/game/player-log/): which account tiles it shows. Locally no ACCOUNT_* variable is set
 * and every tile is absent; on CI the owner's repository variables (owner ruling 2026-10-07) make the fetched games
 * shown. Specs about the real build assert whichever state the build has, read from the same JSON the page carries.
 */
export function realAccountStatus(): { runId: string | null; platforms: { slot: number; state: 'shown' | 'hidden' | 'absent' }[] } {
  const html = readFileSync(join(DIST, 'game/player-log/index.html'), 'utf8');
  const m = /<script[^>]*\bid="acct-status"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error('#acct-status not found in the built player log');
  return JSON.parse(m[1]!);
}
/** The old game URLs that now serve redirect stubs (P1-13). */
export function legacyPaths(): string[] {
  return legacyRedirects().map((r) => r.from);
}
const RESUME_HREFS: readonly string[] = Object.entries(DOCUMENTS).filter(([id]) => id.startsWith('resume-')).map(([, href]) => href);

/** '/en/records/' -> '/records/', '/en/' -> '/', Korean routes unchanged. */
export function koPathOf(route: string): string {
  return route.replace(/^\/en(?=\/)/, '');
}

/**
 * Every spec imports `test`/`expect` from here. The auto fixture stubs third parties for every page of the
 * test's context: the GoatCounter public counter answers with a fixed total and gc.zgo.at is aborted, so an
 * outage of a third party never fails a deploy.
 */
export const test = base.extend<{ thirdPartyStubs: void }>({
  thirdPartyStubs: [
    async ({ context }, use) => {
      await context.route('**/counter/TOTAL.json', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ count: '1 234', count_unique: '1 234' }),
        }),
      );
      await context.route('https://gc.zgo.at/**', (route) => route.abort());
      await use();
    },
    { auto: true },
  ],
});

/**
 * Starts collecting problems on `page` and returns the (live) list: uncaught page errors, console errors
 * raised by code from the preview origin (motion's reduced-motion notice excluded), and HTTP >= 400
 * responses from the preview origin. Call it before page.goto().
 */
export function collectProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const url = message.location().url ?? '';
    if (!url.startsWith(ORIGIN)) return;
    if (/Reduced Motion/i.test(message.text())) return;
    problems.push(`console error: ${message.text()} (${url})`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400 && response.url().startsWith(ORIGIN)) {
      problems.push(`HTTP ${response.status()} ${response.url()}`);
    }
  });
  return problems;
}

/**
 * Sorted ids of `main section[id]` plus every element whose id is in anchorsFor(base, variant) or in the conditional
 * list, excluding anything inside `.prose`, `section.footnotes` or `[data-footnotes]` (Markdown heading ids
 * and footnotes are language-specific by nature).
 */
export async function sectionIds(page: Page): Promise<string[]> {
  const info = parseRoute(new URL(page.url()).pathname);
  const wanted = [...(info ? anchorsFor(info.base, info.variant) : []), ...CONDITIONAL_IDS];
  return page.evaluate((ids: string[]) => {
    const excluded = (el: Element): boolean => el.closest('.prose, section.footnotes, [data-footnotes]') !== null;
    const found = new Set<string>();
    document.querySelectorAll('main section[id]').forEach((el) => {
      if (!excluded(el)) found.add(el.id);
    });
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el && !excluded(el)) found.add(id);
    }
    return [...found].sort();
  }, wanted);
}

/**
 * Sorted unique internal link targets inside <main>: `a[href^='/']` minus `a[hreflang]`, protocol-relative
 * `//…` hrefs and footnote fragments. Each target is normalised so ko and en pages compare equal: a leading
 * `/en` is stripped, and any résumé PDF of DOCUMENTS (the per-language résumés differ by design, §5.2)
 * becomes the token `<cv>`.
 */
export async function internalLinks(page: Page): Promise<string[]> {
  const hrefs = await page
    .locator("main a[href^='/']")
    .evaluateAll((anchors) =>
      anchors
        .filter((a) => !a.hasAttribute('hreflang'))
        .map((a) => a.getAttribute('href') ?? '')
        .filter((href) => href !== '' && !href.startsWith('//')),
    );
  const targets = new Set<string>();
  for (const href of hrefs) {
    const hashIndex = href.indexOf('#');
    const hash = hashIndex >= 0 ? href.slice(hashIndex) : '';
    if (/^#(fn|footnote|user-content-fn)/.test(hash)) continue;
    let target = href.replace(/^\/en(?=\/)/, '');
    if (RESUME_HREFS.includes(target)) target = '<cv>';
    targets.add(target);
  }
  return [...targets].sort();
}

/** Like internalLinks, but also strips /game and /data: the same base form on both versions (skeleton parity, §5.3). */
export async function baseLinks(page: Page): Promise<string[]> {
  return [...new Set((await internalLinks(page)).map((href) => href.replace(/^\/(?:game|data)(?=\/)/, '')))].sort();
}

/** Origin of the no-art build: playwright.config.ts's second web server (dist-no-art/, built with SB_NO_ART=1). */
export { NO_ART_ORIGIN } from './ports';

/** Waits for the CRT intro (home only) to finish and for web fonts, so layout is final. */
export async function settle(page: Page): Promise<void> {
  await page.waitForFunction(() => !document.documentElement.hasAttribute('data-intro'));
  await page.evaluate(() => document.fonts.ready.then(() => true));
}

/**
 * Opens `route` at a viewport (height 900 unless given) and settles. The viewport is set before the load, as pages do not
 * expect it to change after; `reducedMotion` emulates the OS setting, also before the load.
 */
export async function openAt(page: Page, route: string, width: number, height = 900, opts: { reducedMotion?: boolean } = {}): Promise<void> {
  if (opts.reducedMotion) await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width, height });
  await page.goto(route, { waitUntil: 'networkidle' });
  await settle(page);
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
/** The layout box of `locator`; the test fails when it has none. */
export async function box(locator: Locator): Promise<Box> {
  const b = await locator.boundingBox();
  expect(b, 'element has a layout box').toBeTruthy();
  return b as Box;
}

/** The WCAG 2.0 to 2.2 level A and AA rule tags every axe check of the suite uses. */
export const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
/** Runs axe on the page as it is now and fails with one line per violation: the rule id and its first three targets. */
export async function expectNoAxeViolations(page: Page, label = 'axe violations'): Promise<void> {
  const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`), label).toEqual([]);
}

/** Document scroll width vs. viewport width, and up to five elements that stick out and are not inside a scroller. */
export async function horizontalOverflow(page: Page): Promise<{ scrollWidth: number; width: number; offenders: string[] }> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const width = doc.clientWidth;
    const insideScroller = (el: Element): boolean => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const overflowX = getComputedStyle(p).overflowX;
        if (overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'hidden' || overflowX === 'clip') return true;
      }
      return false;
    };
    const offenders: string[] = [];
    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.right > width + 1 && !insideScroller(el)) {
        const cls = el.classList.length ? `.${Array.from(el.classList).join('.')}` : '';
        offenders.push(`${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${cls} (right ${Math.round(rect.right)})`);
        if (offenders.length >= 5) break;
      }
    }
    return { scrollWidth: doc.scrollWidth, width, offenders };
  });
}

/** Visible text rendered below 12px: HTML text by its computed size, SVG text by its size times the SVG's scale. */
export async function textBelow12px(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const found: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.trim();
      const el = node.parentElement;
      if (!text || !el) continue;
      if (el.closest('svg, script, style, noscript, template, .sr-only')) continue;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      const size = parseFloat(style.fontSize);
      if (size < 12) found.push(`<${el.tagName.toLowerCase()} class="${el.className}"> ${size}px "${text.slice(0, 30)}"`);
    }
    for (const t of Array.from(document.querySelectorAll('svg text, svg tspan'))) {
      const graphic = t as SVGGraphicsElement;
      const rect = graphic.getBoundingClientRect();
      const ctm = graphic.getScreenCTM();
      if (!ctm || (rect.width === 0 && rect.height === 0) || !t.textContent?.trim()) continue;
      const rendered = parseFloat(getComputedStyle(t).fontSize) * ctm.a;
      if (rendered < 12 - 0.01) found.push(`svg ${t.tagName} ${rendered.toFixed(1)}px "${t.textContent.trim().slice(0, 30)}"`);
    }
    return found;
  });
}

/**
 * The two screenshot producers (screenshots.spec.ts and the ghost-art dump) assert nothing. They run where the output is
 * used: in CI, whose workflow uploads test-results/screenshots, or on request with PW_SHOTS=1.
 */
export const SHOTS: boolean = Boolean(process.env.CI || process.env.PW_SHOTS);
export const SHOTS_SKIP = 'writes screenshots only; runs in CI or with PW_SHOTS=1';

/** Chromium version that the installed Playwright ships with (playwright-core's browsers.json), or null when unreadable. */
function shippedChromium(): { playwright: string; chromium: string } | null {
  try {
    const dir = dirname(createRequire(import.meta.url).resolve('playwright-core/package.json'));
    const playwright = (JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { version?: string }).version;
    const entries = (JSON.parse(readFileSync(join(dir, 'browsers.json'), 'utf8')) as { browsers?: { name: string; browserVersion?: string }[] }).browsers;
    const chromium = entries?.find((b) => b.name === 'chromium')?.browserVersion;
    return playwright && chromium ? { playwright, chromium } : null;
  } catch {
    return null;
  }
}

/**
 * Why a test that is only checked on the Chromium the installed Playwright ships with should be skipped: the running
 * browser (`browser.version()`) has a different major version, e.g. a container that links an older build for the
 * revision Playwright asks for. null (run the test) when the majors match, when a version cannot be read, and for an
 * installed-Chrome channel (PW_CHANNEL), which is not meant to match.
 */
export function chromiumMismatch(running: string): string | null {
  const shipped = process.env.PW_CHANNEL ? null : shippedChromium();
  if (!shipped || !/^\d+/.test(running)) return null;
  if (Number.parseInt(running, 10) === Number.parseInt(shipped.chromium, 10)) return null;
  return `Chromium ${running} is running; Playwright ${shipped.playwright} ships Chromium ${shipped.chromium}`;
}

/**
 * CSP check (account-link C0): call before the first navigation; every document the page loads from then on records its
 * `securitypolicyviolation` events as "<violated directive> <blocked URI>" (the listener is added before any page script).
 */
export async function watchViolations(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __cspv: string[] };
    w.__cspv = [];
    document.addEventListener('securitypolicyviolation', (e) => w.__cspv.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
}
/** The CSP violations the current document recorded since it loaded (needs `watchViolations` first). */
export async function collectViolations(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const list = (window as unknown as { __cspv?: string[] }).__cspv;
    if (!Array.isArray(list)) throw new Error('collectViolations: watchViolations(page) was not called before navigation');
    return [...list];
  });
}

/** The fixture build's relay origin: never deployed, and every request to it is answered by mockRelay. */
export const RELAY = E2E_RELAY_ORIGIN;
/** Fakes built at run time: the ticket has the relay's ticket shape, the run link the page's run-link shape. */
export const FAKE_TICKET = 'tk_' + 'A'.repeat(44);
export const FAKE_HANDLE = 'hd_' + 'H'.repeat(40);
export const FAKE_RUN_ID = 4242;
const FAKE_RUN_URL = `https://github.com/Lunecid/Lunecid.github.io/actions/runs/${FAKE_RUN_ID}`;
/** The spec's public example SteamID64 and a made-up persona name. */
export const FAKE_STEAM = { id: '76561197960435530', name: 'Robin' } as const;
/** The deploy workflow's jobs in pipeline order. */
const DEPLOY_JOBS = ['secrets-scan', 'fetch-accounts', 'build', 'deploy', 'fetch-health'] as const;
/** A 1×1 PNG: the stand-in for Valve's button image while the file is not in public/. */
const STAND_IN_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

export interface RelayMock {
  /** Every http(s) request of the context, popups included. */
  seen: string[];
  /** The requests off 127.0.0.1 that a route answered or cut. */
  routed: Set<string>;
  /** The /gh/login addresses the popup or the tab asked for. */
  logins: URL[];
  sessions: unknown[];
  /** The /gh/api bodies in order. */
  ops: Record<string, unknown>[];
  verifies: Record<string, unknown>[];
  /** run.get reports the run in progress (build at step 3 of 6) until finish(); then completed, every job a success. */
  finish(): void;
}

/** Serves the page `route` asks for from the preview server, with `edit` applied to its HTML. */
async function servePage(route: Route, edit: (html: string) => string): Promise<void> {
  const res = await route.fetch();
  const headers = { ...res.headers() };
  delete headers['content-length'];
  await route.fulfill({ status: res.status(), headers, body: edit(await res.text()) });
}

/**
 * The relay Worker and Steam's OpenID endpoint for the fixture build (spec §11.1). Every route is on the context, so it
 * covers the login popups too, and anything else off 127.0.0.1 is cut: no test reaches a real Worker, GitHub or Steam.
 * /gh/login answers the popup with /link-return/#gh=<ticket>&n=<its n> (mode=tab is cut: the test reads its address);
 * Steam's login answers /link-return/?s=<the s of its return_to>&openid.* (the test never needs the page's state);
 * /gh/api answers per op; the page read /game/player-log/?r=<run> gets the real page with that run id in #acct-status,
 * Steam hidden. `steam: true` turns the build's steamButton flag on in the served player log and answers Valve's image
 * with a stand-in while the file is not in public/, so the Steam popup path runs before the owner adds the file.
 */
export async function mockRelay(context: BrowserContext, opts: { steam?: boolean } = {}): Promise<RelayMock> {
  let done = false;
  const mock: RelayMock = { seen: [], routed: new Set(), logins: [], sessions: [], ops: [], verifies: [], finish: () => void (done = true) };
  context.on('request', (req) => {
    if (/^https?:/.test(req.url())) mock.seen.push(req.url());
  });
  const cors = { 'access-control-allow-origin': ACCOUNTS_ORIGIN, vary: 'Origin' };
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: body === undefined ? '' : JSON.stringify(body) });
  const job = (name: string, i: number) => {
    const state = done || i < 2 ? 'completed' : i === 2 ? 'in_progress' : 'queued';
    return { name, status: state, conclusion: state === 'completed' ? 'success' : null, stepsDone: state === 'completed' ? 6 : state === 'in_progress' ? 3 : 0, stepsTotal: 6 };
  };
  const api = (body: Record<string, unknown>): unknown => {
    switch (body.op) {
      case 'vars.list':
        return [];
      case 'workflow.get':
        return { state: 'active' };
      case 'vars.set':
      case 'vars.delete':
        return { ok: true };
      case 'dispatch':
        return { runId: FAKE_RUN_ID, htmlUrl: FAKE_RUN_URL };
      case 'run.get':
        return { status: done ? 'completed' : 'in_progress', conclusion: done ? 'success' : null, htmlUrl: FAKE_RUN_URL };
      case 'run.jobs':
        return DEPLOY_JOBS.map(job);
      default:
        return undefined;
    }
  };
  // registered first: the routes after it take precedence
  await context.route(
    (url) => url.hostname !== '127.0.0.1',
    (route) => {
      mock.routed.add(route.request().url());
      return route.abort();
    },
  );
  await context.route(
    (url) => url.origin === RELAY,
    (route) => {
      const req = route.request();
      mock.routed.add(req.url());
      if (req.method() === 'OPTIONS') {
        return route.fulfill({ status: 204, headers: { ...cors, 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'authorization, content-type' } });
      }
      const url = new URL(req.url());
      switch (url.pathname) {
        case '/gh/login':
          mock.logins.push(url);
          if (url.searchParams.get('mode') === 'tab') return route.abort();
          return route.fulfill({ status: 302, headers: { location: `${ACCOUNTS_ORIGIN}/link-return/#gh=${FAKE_TICKET}&n=${url.searchParams.get('n') ?? ''}` } });
        case '/gh/session':
          mock.sessions.push(req.postDataJSON());
          return json(route, { handle: FAKE_HANDLE, expiresIn: 3600 });
        case '/gh/logout':
          return json(route, undefined, 204);
        case '/openid/verify': {
          const body = req.postDataJSON() as Record<string, unknown>;
          mock.verifies.push(body);
          return json(route, { steamid: FAKE_STEAM.id, state: body.s, personaname: FAKE_STEAM.name, profilePublic: true });
        }
        case '/gh/api': {
          const body = req.postDataJSON() as Record<string, unknown>;
          mock.ops.push(body);
          return json(route, api(body));
        }
        default:
          return route.abort();
      }
    },
  );
  await context.route(
    (url) => url.origin === 'https://steamcommunity.com' && url.pathname === '/openid/login',
    (route) => {
      mock.routed.add(route.request().url());
      const returnTo = new URL(route.request().url()).searchParams.get('openid.return_to');
      if (returnTo === null) return route.abort();
      const claimed = `https://steamcommunity.com/openid/id/${FAKE_STEAM.id}`;
      const back = new URLSearchParams({
        s: new URL(returnTo).searchParams.get('s') ?? '',
        'openid.ns': 'http://specs.openid.net/auth/2.0',
        'openid.mode': 'id_res',
        'openid.op_endpoint': 'https://steamcommunity.com/openid/login',
        'openid.claimed_id': claimed,
        'openid.identity': claimed,
        'openid.return_to': returnTo,
        'openid.response_nonce': `${new Date().toISOString().slice(0, 19)}Z0`,
        'openid.assoc_handle': '1234567890',
        'openid.signed': 'signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle',
        'openid.sig': 'c2lnbmF0dXJl',
      });
      return route.fulfill({ status: 302, headers: { location: `${ACCOUNTS_ORIGIN}/link-return/?${back.toString()}` } });
    },
  );
  await context.route(
    (url) => url.origin === ACCOUNTS_ORIGIN && url.pathname === '/game/player-log/' && url.searchParams.has('r'),
    (route) => servePage(route, (html) => html.replace('"runId":null', `"runId":"${FAKE_RUN_ID}"`).replace('{"slot":2,"state":"shown"', '{"slot":2,"state":"hidden"')),
  );
  if (opts.steam && !steamButtonAvailable()) {
    await context.route(
      (url) => url.origin === ACCOUNTS_ORIGIN && url.pathname === '/game/player-log/' && !url.searchParams.has('r'),
      (route) => servePage(route, (html) => html.replace('steamButton&quot;:[0,false]', 'steamButton&quot;:[0,true]')),
    );
    await context.route(`${ACCOUNTS_ORIGIN}/img/sits_01.png`, (route) => route.fulfill({ status: 200, contentType: 'image/png', body: STAND_IN_PNG }));
  }
  return mock;
}
