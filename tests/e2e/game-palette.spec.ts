// GP-8 (game palette v4): numbers instead of eyes on every game page — contrast from computed colours, the yellow +
// cyan share of the fold, no lime or gold, and no horizontal scroll at any width.
import { test, expect, builtRoutes, horizontalOverflow, settle } from './helpers';
import { contrastAudit } from '../helpers/contrast-audit';
import { areaShare } from '../helpers/area-share';

const ROUTES = builtRoutes({ variant: 'game' });
const MAIN = ['/game/', '/game/records/', '/game/projects/', '/game/research/', '/game/player-log/', '/game/projects/school-zone-blindspots/'];

test.describe('GP-8: the game palette, measured', () => {
  test.describe.configure({ timeout: 180_000 });

  test('the game routes are all here', () => {
    expect(ROUTES).toHaveLength(18);
  });

  for (const width of [375, 1280]) {
    test(`GP-8: every visible text on the 18 game routes reads ≥ 4.5:1 on its computed ground at ${width}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      const fails: string[] = [];
      const lowest: string[] = [];
      for (const route of ROUTES) {
        await page.goto(route, { waitUntil: 'networkidle' });
        await settle(page);
        const rows = (await page.evaluate(contrastAudit)).filter((r) => !r.img);
        expect(rows.length, route).toBeGreaterThan(20);
        for (const r of rows) if (r.ratio < 4.5) fails.push(`${route} ${r.ratio.toFixed(2)} ${r.sel} "${r.txt}" ${r.fg} on ${r.bg}`);
        const five = [...rows].sort((a, b) => a.ratio - b.ratio).slice(0, 5).map((r) => `${r.ratio.toFixed(2)} ${r.sel}`);
        lowest.push(`${route} @${width}: ${five.join(' · ')}`);
      }
      info.annotations.push({ type: 'lowest pairs', description: lowest.join('\n') });
      expect(fails.slice(0, 20)).toEqual([]);
    });
  }

  for (const width of [1280, 375]) {
    test(`GP-8: yellow + cyan ≤ 10 % of the fold at ${width} (images excluded) on the main routes`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: width === 375 ? 812 : 800 });
      const shares: string[] = [];
      for (const route of MAIN) {
        await page.goto(route, { waitUntil: 'networkidle' });
        await settle(page);
        await page.evaluate(() => document.fonts.ready);
        const boxes = await page.evaluate(() => Array.from(document.querySelectorAll('img, picture, video, svg image')).map((e) => {
          const r = e.getBoundingClientRect();
          return [r.left, r.top, r.right, r.bottom].map((v) => Math.round(v * devicePixelRatio));
        }).filter((r) => r[2]! - r[0]! > 2 && r[3]! > 0));
        const share = await areaShare(await page.screenshot(), boxes);
        const yc = share.yellow + share.cyan;
        shares.push(`${route} @${width}: Y ${(share.yellow * 100).toFixed(2)}% C ${(share.cyan * 100).toFixed(2)}% = ${(yc * 100).toFixed(2)}%`);
        expect(yc, route).toBeLessThanOrEqual(0.1);
      }
      info.annotations.push({ type: 'area shares', description: shares.join('\n') });
    });
  }

  test('GP-8: no lime, gold or olive on the 18 game routes at 375, nor with the viewer open on /game/records/', async ({ page }) => {
    const bad = ['rgb(200, 240, 60)', 'rgb(245, 179, 1)', 'rgb(79, 107, 0)', 'rgb(138, 90, 0)'];
    const scan = (route: string) => page.evaluate(([b, r]) => {
      const out: string[] = [];
      const props = ['color', 'background-color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
        'outline-color', 'text-decoration-color', 'fill', 'stroke', 'background-image', 'box-shadow', 'text-shadow'];
      for (const el of [document.documentElement, ...Array.from(document.body.querySelectorAll('*'))]) {
        for (const pseudo of [null, '::before', '::after']) {
          const s = getComputedStyle(el, pseudo);
          for (const p of props) { const v = s.getPropertyValue(p); for (const c of b!) if (v.includes(c)) out.push(`${r} ${el.tagName}.${el.getAttribute('class') ?? ''}${pseudo ?? ''} ${p}`); }
        }
      }
      return out;
    }, [bad, route] as const);
    await page.setViewportSize({ width: 375, height: 812 });
    const hits: string[] = [];
    for (const route of ROUTES) {
      await page.goto(route, { waitUntil: 'networkidle' });
      hits.push(...(await scan(route)));
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/game/records/', { waitUntil: 'networkidle' });
    await settle(page);
    await page.locator('#awards a[data-cert-id]').first().click();
    await expect(page.locator('dialog.image-viewer[open]')).toBeVisible();
    hits.push(...(await scan('/game/records/ (viewer open)')));
    expect(hits.slice(0, 20)).toEqual([]);
  });

  for (const width of [320, 375, 768, 1280, 1440, 2560]) {
    test(`GP-8: no horizontal scroll on the 18 game routes at ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const problems: string[] = [];
      for (const route of ROUTES) {
        await page.goto(route, { waitUntil: 'load' });
        const o = await horizontalOverflow(page);
        if (o.scrollWidth > o.width) problems.push(`${route}: ${o.scrollWidth} > ${o.width} ${o.offenders.join(', ')}`);
      }
      expect(problems).toEqual([]);
    });
  }
});
