// Cross-document page transitions (motion audit V1, V2, D-1). An init script logs every pageswap / pagereveal into
// sessionStorage (it survives the same-origin navigation) and, once a revealed transition is ready, the running
// ::view-transition-* animations with their timing and the size/position keyframes of the groups.
import type { Page } from '@playwright/test';
import { test, expect } from './helpers';

type Anim = { pe: string; name: string; delay: number; duration: number; kf: { transform?: string; width?: string; height?: string }[] };
type Entry =
  | { ev: 'pageswap' | 'pagereveal'; url: string; vt: boolean; types: string[] }
  | { ev: 'ready'; url: string; types: string[]; anims: Anim[] };

async function instrument(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try { sessionStorage.setItem('sb:intro', '1'); } catch { /* no CRT in these tests */ }
    const push = (entry: unknown) => {
      try {
        const list = JSON.parse(sessionStorage.getItem('vt-log') ?? '[]');
        list.push(entry);
        sessionStorage.setItem('vt-log', JSON.stringify(list));
      } catch { /* storage off: the test fails on an empty log */ }
    };
    type VtEvent = Event & { viewTransition: (ViewTransition & { types?: Set<string> }) | null };
    const typesOf = (vt: VtEvent['viewTransition']) => (vt && vt.types ? [...vt.types] : []);
    addEventListener('pageswap', (e) => {
      const vt = (e as VtEvent).viewTransition;
      push({ ev: 'pageswap', url: location.pathname, vt: !!vt, types: typesOf(vt) });
    });
    addEventListener('pagereveal', (e) => {
      const vt = (e as VtEvent).viewTransition;
      push({ ev: 'pagereveal', url: location.pathname, vt: !!vt, types: typesOf(vt) });
      if (!vt) return;
      vt.ready.then(() => {
        const anims = document.getAnimations()
          .filter((a) => ((a.effect as KeyframeEffect | null)?.pseudoElement ?? '').startsWith('::view-transition'))
          .map((a) => {
            const effect = a.effect as KeyframeEffect;
            const t = effect.getTiming();
            return {
              pe: effect.pseudoElement,
              name: (a as CSSAnimation).animationName ?? '',
              delay: Number(t.delay ?? 0),
              duration: Number(t.duration),
              kf: effect.getKeyframes().map((k) => ({ transform: k.transform as string | undefined, width: k.width as string | undefined, height: k.height as string | undefined })),
            };
          });
        push({ ev: 'ready', url: location.pathname, types: typesOf(vt), anims });
      }, () => push({ ev: 'ready', url: location.pathname, types: [], anims: [] }));
    });
  });
}

const log = (page: Page): Promise<Entry[]> => page.evaluate(() => JSON.parse(sessionStorage.getItem('vt-log') ?? '[]'));
const clearLog = (page: Page): Promise<void> => page.evaluate(() => sessionStorage.removeItem('vt-log'));

/** The animations of the transition that revealed `url` (waits for its ready entry). */
async function transitionInto(page: Page, url: string): Promise<{ swap: Entry | undefined; reveal: Entry | undefined; anims: Anim[]; types: string[] }> {
  await expect.poll(async () => (await log(page)).some((e) => e.ev === 'ready' && e.url === url), { timeout: 5000 }).toBe(true);
  const entries = await log(page);
  const ready = entries.find((e) => e.ev === 'ready' && e.url === url) as Extract<Entry, { ev: 'ready' }>;
  return {
    swap: entries.find((e) => e.ev === 'pageswap'),
    reveal: entries.find((e) => e.ev === 'pagereveal' && e.url === url),
    anims: ready.anims,
    types: ready.types,
  };
}
const pseudos = (anims: Anim[]): string[] => [...new Set(anims.map((a) => a.pe))];
const anim = (anims: Anim[], pe: string): Anim | undefined => anims.find((a) => a.pe === pe);

test.beforeEach(async ({ page }) => {
  await instrument(page);
});

test('V1: a nav click /game/ → /game/projects/ runs a transition of type page; the nav pairs; the root fades through in .09 + .16 s', async ({ page }) => {
  await page.goto('/game/');
  await clearLog(page);
  await page.locator('.hud-nav__list a[href="/game/projects/"]').click();
  await expect(page).toHaveURL(/\/game\/projects\/$/);
  const { swap, reveal, anims, types } = await transitionInto(page, '/game/projects/');
  expect(swap).toMatchObject({ ev: 'pageswap', url: '/game/', vt: true });
  expect(reveal).toMatchObject({ vt: true });
  expect(types).toContain('page');
  expect(pseudos(anims)).toEqual(expect.arrayContaining(['::view-transition-old(nav-game)', '::view-transition-new(nav-game)']));
  const oldRoot = anim(anims, '::view-transition-old(root)');
  const newRoot = anim(anims, '::view-transition-new(root)');
  expect(oldRoot?.name).toBe('vt-out');
  expect(oldRoot?.delay).toBeCloseTo(0, 3);
  expect(oldRoot?.duration).toBeCloseTo(90, 3);
  expect(newRoot?.name).toBe('vt-in');
  expect(newRoot?.delay).toBeCloseTo(90, 3);
  expect(newRoot?.duration).toBeCloseTo(160, 3);
  expect(anim(anims, '::view-transition-group(nav-game)')?.duration).toBeCloseTo(100, 3);
});

test('V1: page.goto and reload run no transition', async ({ page }) => {
  await page.goto('/game/');
  await page.goto('/game/projects/');
  await page.reload();
  await page.goto('/data/');
  const entries = await log(page);
  expect(entries.filter((e) => e.ev === 'pagereveal').length).toBeGreaterThanOrEqual(4);
  expect(entries.filter((e) => 'vt' in e && e.vt)).toEqual([]);
  expect(entries.filter((e) => e.ev === 'ready')).toEqual([]);
});

test('V1: / with a stored choice redirects before the first paint without a transition', async ({ page }) => {
  await page.goto('/game/');
  await page.evaluate(() => localStorage.setItem('sb:variant', 'game'));
  await clearLog(page);
  // a document-initiated navigation (eligible for a transition), to the chooser, which forwards before its first paint
  await page.evaluate(() => { location.href = '/'; });
  await expect(page).toHaveURL(/\/game\/$/);
  await page.waitForLoadState('load');
  await page.waitForTimeout(500);
  const entries = await log(page);
  // the chooser is never revealed, and the version home arrives without a transition
  expect(entries.filter((e) => e.ev === 'pagereveal' && e.url === '/')).toEqual([]);
  expect(entries.filter((e) => e.ev === 'pagereveal' && e.url === '/game/')).toEqual([expect.objectContaining({ vt: false })]);
  expect(entries.filter((e) => e.ev === 'ready')).toEqual([]);
});

test('V2: the version switch /game/projects/ → /data/projects/ fades through; the two navs do not pair', async ({ page }) => {
  await page.goto('/game/projects/');
  await clearLog(page);
  await page.locator('.hud-nav__tools a[data-switch-variant]').click();
  await expect(page).toHaveURL(/\/data\/projects\/$/);
  const { anims, types } = await transitionInto(page, '/data/projects/');
  expect(types).toContain('page');
  const list = pseudos(anims);
  expect(list).toContain('::view-transition-old(nav-game)');
  expect(list).not.toContain('::view-transition-new(nav-game)');
  expect(list).toContain('::view-transition-new(nav-data)');
  expect(list).not.toContain('::view-transition-old(nav-data)');
  // an unpaired nav fades with the root
  expect(anim(anims, '::view-transition-old(nav-game)')).toMatchObject({ name: 'vt-out' });
  expect(anim(anims, '::view-transition-new(nav-data)')).toMatchObject({ name: 'vt-in' });
  expect(anim(anims, '::view-transition-new(nav-data)')?.delay).toBeCloseTo(90, 3);
  expect(anim(anims, '::view-transition-old(root)')?.duration).toBeCloseTo(90, 3);
});

test('V2: the language switch /game/ → /en/game/ fades through with the nav paired', async ({ page }) => {
  await page.goto('/game/');
  await clearLog(page);
  await page.locator('.hud-nav__lang--bar a[hreflang="en"]').click();
  await expect(page).toHaveURL(/\/en\/game\/$/);
  const { anims, types } = await transitionInto(page, '/en/game/');
  expect(types).toContain('page');
  expect(pseudos(anims)).toEqual(expect.arrayContaining(['::view-transition-old(nav-game)', '::view-transition-new(nav-game)']));
  expect(anim(anims, '::view-transition-new(root)')?.name).toBe('vt-in');
});

test('D-1: under reduced motion the opacity fade stays and no named group changes position or size', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/game/');
  expect(await page.evaluate(() => document.documentElement.dataset.motion)).toBe('reduce');
  await clearLog(page);
  await page.locator('.hud-nav__list a[href="/game/projects/"]').click();
  await expect(page).toHaveURL(/\/game\/projects\/$/);
  const { anims } = await transitionInto(page, '/game/projects/');
  expect(anim(anims, '::view-transition-old(root)')?.name).toBe('vt-out');
  expect(anim(anims, '::view-transition-new(root)')?.name).toBe('vt-in');
  const groups = anims.filter((a) => a.pe.startsWith('::view-transition-group(') && a.kf.length > 0);
  expect(groups.map((g) => g.pe)).toEqual(expect.arrayContaining(['::view-transition-group(root)', '::view-transition-group(nav-game)']));
  for (const g of groups) {
    const first = g.kf[0];
    const last = g.kf[g.kf.length - 1];
    expect({ transform: last.transform ?? first.transform, width: last.width ?? first.width, height: last.height ?? first.height }, g.pe).toEqual({ transform: first.transform, width: first.width, height: first.height });
  }
});

test('V1: at rest no element has a view-transition-name; the HUD nav keeps its backdrop blur', async ({ page }) => {
  const check = async () => {
    const named = await page.evaluate(() => [...document.querySelectorAll('body, body *')].filter((el) => getComputedStyle(el).viewTransitionName !== 'none').map((el) => el.className));
    expect(named).toEqual([]);
    // the blur sits on the nav's ::before (HudNav.astro); a name on .hud-nav would make it a backdrop root
    expect(await page.locator('.hud-nav').evaluate((el) => getComputedStyle(el, '::before').backdropFilter)).toContain('blur');
  };
  await page.goto('/game/');
  await check();
  await clearLog(page);
  await page.locator('.hud-nav__list a[href="/game/projects/"]').click();
  await transitionInto(page, '/game/projects/');
  await page.waitForFunction(() => document.getAnimations().every((a) => !((a.effect as KeyframeEffect | null)?.pseudoElement ?? '').startsWith('::view-transition')));
  await check();
});

test("V1: the image viewer's #view- hash and history.pushState are not cross-document transitions", async ({ page }) => {
  await page.goto('/game/research/', { waitUntil: 'networkidle' });
  const before = (await log(page)).length;
  const trigger = page.locator('#interests a[data-viewer="figures"]').first();
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  await expect(page.locator('dialog.image-viewer')).toHaveAttribute('open', '');
  await expect(page).toHaveURL(/#view-/);
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog.image-viewer')).not.toHaveAttribute('open', '');
  await page.waitForTimeout(300);
  expect((await log(page)).slice(before)).toEqual([]);
});

test('R1: a tag click on /game/projects/ runs a same-document transition; remaining cards move over --dur-reflow; the root does not animate', async ({ page }) => {
  type R1 = { types: string[]; anims: (Anim & { easing: string })[] } | { skipped: true };
  await page.addInitScript(() => {
    const original = Document.prototype.startViewTransition;
    Document.prototype.startViewTransition = function (this: Document, arg?: Parameters<Document['startViewTransition']>[0]) {
      const vt = original.call(this, arg) as ViewTransition & { types?: Set<string> };
      const w = window as Window & { __r1?: unknown };
      vt.ready.then(() => {
        w.__r1 = {
          types: vt.types ? [...vt.types] : [],
          anims: document.getAnimations()
            .filter((a) => ((a.effect as KeyframeEffect | null)?.pseudoElement ?? '').startsWith('::view-transition'))
            .map((a) => {
              const effect = a.effect as KeyframeEffect;
              const kf = effect.getKeyframes();
              return {
                pe: effect.pseudoElement,
                name: (a as CSSAnimation).animationName ?? '',
                delay: Number(effect.getTiming().delay ?? 0),
                duration: Number(effect.getTiming().duration),
                easing: String(kf[0]?.easing ?? ''),
                kf: kf.map((k) => ({ transform: k.transform as string | undefined, width: k.width as string | undefined, height: k.height as string | undefined })),
              };
            }),
        };
      }, () => { w.__r1 = { skipped: true }; });
      return vt;
    };
  });
  await page.goto('/game/projects/');
  await clearLog(page);
  await page.locator('.tag-filter button[data-tag="viz"]').click();
  await page.waitForFunction(() => (window as Window & { __r1?: unknown }).__r1 !== undefined);
  const r1 = await page.evaluate(() => (window as Window & { __r1?: unknown }).__r1) as R1;
  expect(r1).not.toHaveProperty('skipped');
  const { types, anims } = r1 as Exclude<R1, { skipped: true }>;
  expect(types).toEqual(['filter']);
  // the root neither fades nor slides: no old/new root image animation
  expect(anims.filter((a) => /^::view-transition-(old|new)\(root\)$/.test(a.pe))).toEqual([]);
  // every card group moves over --dur-reflow with --ease-wipe, and at least one card really moves
  const cards = anims.filter((a) => a.pe.startsWith('::view-transition-group(') && a.pe !== '::view-transition-group(root)');
  expect(cards.length).toBeGreaterThanOrEqual(3);
  for (const g of cards) {
    expect(g.duration, g.pe).toBeCloseTo(300, 3);
    expect(g.easing, g.pe).toBe('cubic-bezier(0.65, 0, 0.35, 1)');
  }
  expect(cards.some((g) => g.kf[0]?.transform !== g.kf[g.kf.length - 1]?.transform)).toBe(true);
  // a same-document transition: no page swap or reveal
  expect(await log(page)).toEqual([]);
  await expect(page.locator('#project-grid > [data-tags]:not([hidden])')).toHaveCount(3);
});
