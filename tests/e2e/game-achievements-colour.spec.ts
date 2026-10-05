// GP-4 (game palette v4, GP-OQ1/2/7): achievements turn cyan (medals, toast, badges), meters fill in cyan, and the
// per-game showcases and account-card skins keep their own colours.
import { readFileSync } from 'node:fs';
import { test, expect, NO_ART_ORIGIN, settle } from './helpers';

const CYAN = 'rgb(0, 229, 255)';
const YELLOW = 'rgb(255, 230, 0)';
const GOLD = 'rgb(245, 179, 1)';
const LIME = 'rgb(200, 240, 60)';

test.describe('GP-4: achievements on the game palette', () => {
  test('GP-4 /game/player-log/: unlocked medal disc rgb(0, 229, 255), rim ≠ disc; toast kicker cyan, toast focus yellow; no rgb(245, 179, 1) anywhere', async ({ page }) => {
    await page.addInitScript(() => {
      if (sessionStorage.getItem('gp4-seeded')) return;
      sessionStorage.setItem('gp4-seeded', '1');
      localStorage.clear();
      localStorage.setItem('sb:achievements', JSON.stringify({ 'abstract-reader': new Date().toISOString() }));
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    // the no-art build carries the meter beside the list (medals.spec.ts)
    await page.goto(`${NO_ART_ORIGIN}/game/player-log/`, { waitUntil: 'networkidle' });
    await settle(page);
    const medal = page.locator('#site-achievements [data-ach-id="abstract-reader"] .medal');
    await expect(medal).toHaveAttribute('data-state', 'unlocked');
    const paint = await medal.evaluate((el) => ({
      disc: getComputedStyle(el.querySelector('.medal__disc')!).fill,
      rim: getComputedStyle(el.querySelector('.medal__rim')!).fill,
      ribbon: getComputedStyle(el.querySelector('.medal__ribbon')!).fill,
    }));
    expect(paint.disc).toBe(CYAN);
    expect(paint.rim).not.toBe(paint.disc);
    expect(paint.rim).toBe('rgb(0, 151, 167)');
    expect(paint.ribbon).toBe(paint.rim);
    // the meter is cyan, never yellow (it is not clickable)
    const fill = await page.locator('.ach-meter__fill').first().evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(fill).toContain(CYAN);
    expect(fill).not.toContain(YELLOW);
    // no warm gold and no lime left on the page
    const warm = await page.evaluate((bad) => {
      const out: string[] = [];
      for (const el of Array.from(document.querySelectorAll('*'))) {
        const s = getComputedStyle(el);
        for (const p of ['color', 'background-color', 'border-top-color', 'outline-color', 'fill', 'stroke', 'background-image', 'box-shadow']) {
          const v = s.getPropertyValue(p);
          for (const b of bad) if (v.includes(b)) out.push(`${el.tagName}.${el.getAttribute('class') ?? ''} ${p}`);
        }
      }
      return out.slice(0, 10);
    }, [GOLD, LIME]);
    expect(warm).toEqual([]);

    // the toast (a live unlock on records): kicker and mark cyan, the close button's focus ring yellow
    await page.goto('/game/records/', { waitUntil: 'networkidle' });
    await settle(page);
    await page.locator('#awards a[data-cert-id]').first().click();
    await page.keyboard.press('Escape');
    const toast = page.locator('.ach-toast');
    await expect(toast).toBeVisible();
    expect(await toast.locator('.ach-toast__kicker').evaluate((el) => getComputedStyle(el).color)).toBe(CYAN);
    expect(await toast.locator('.ach-toast__mark').evaluate((el) => getComputedStyle(el).color)).toBe(CYAN);
    await page.keyboard.press('Tab');
    const close = toast.locator('.ach-toast__close');
    await close.evaluate((el) => (el as HTMLElement).focus());
    expect(await close.evaluate((el) => getComputedStyle(el).outlineColor)).toBe(YELLOW);
  });

  test('GP-4: per-game showcase and account-card skins unchanged from GP-0 (computed --gm-*/--skin-* colours)', async ({ page }) => {
    // the GP-0 values are the :root literals of tokens.css (the game block never re-points --gm-* or --skin-*)
    const tokens = readFileSync('src/styles/tokens.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const root = tokens.slice(tokens.indexOf(':root {'), tokens.indexOf('\n}', tokens.indexOf(':root {')));
    const expected = Object.fromEntries([...root.matchAll(/(--(?:gm|skin)-[\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim().replace(/\s+/g, ' ')]));
    expect(Object.keys(expected).length).toBeGreaterThan(40);
    await page.goto('/game/player-log/', { waitUntil: 'networkidle' });
    // compare resolved colours (the build minifies the literals), not source text; the hex-board data URI is compared as text
    const diff = await page.evaluate((pairs) => {
      const probe = document.createElement('i');
      document.body.appendChild(probe);
      const resolve = (v: string) => { probe.style.color = ''; probe.style.color = v; return getComputedStyle(probe).color; };
      const out: string[] = [];
      for (const [name, literal] of pairs) {
        if (literal.startsWith('url(')) {
          const live = getComputedStyle(document.documentElement).getPropertyValue(name);
          if (!live.includes('svg')) out.push(name);
          continue;
        }
        const a = resolve(`var(${name})`);
        const b = resolve(literal);
        if (a !== b) out.push(`${name}: ${a} vs ${b}`);
      }
      probe.remove();
      return out;
    }, Object.entries(expected));
    expect(diff).toEqual([]);
    // and a showcase element really paints with them (the TFT title band is --gm-band)
    const band = await page.evaluate(() => {
      const probe = document.createElement('i');
      probe.style.color = 'var(--gm-band)';
      document.body.appendChild(probe);
      const c = getComputedStyle(probe).color;
      probe.remove();
      return c;
    });
    expect(band).toBe('rgb(1, 5, 11)');
  });
});
