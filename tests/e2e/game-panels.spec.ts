// GP-3 (game palette v4): dense and long text sits on off-white panels (game.css WHITE_PANELS) with ink text, a 3 px yellow
// top edge, ink links with a yellow highlighter strip, and an ink focus ring with a yellow halo.
import { test, expect, settle } from './helpers';
import type { Page } from '@playwright/test';

const PANELS: readonly (readonly [string, string])[] = [
  ['/game/', '.rh .paper'],
  ['/game/records/', '.rec__pubs'],
  ['/game/records/', '.psum'],
  ['/game/records/', '.creds__table'],
  ['/game/records/', '.skills__table'],
  ['/game/records/', '.jobfit__table'],
  ['/game/research/', '.pub__list'],
  ['/game/research/cog-2026-engagement/', '.paper-view__sheet'],
  ['/game/projects/school-zone-blindspots/', 'article.prose.read'],
  ['/game/projects/school-zone-blindspots/', '.pd__table'],
];
const en = (route: string) => route.replace('/game/', '/en/game/');
const WHITE = 'rgb(238, 238, 233)';
const CARD = 'rgb(247, 247, 243)';
const INK = 'rgb(26, 26, 26)';
const YELLOW = 'rgb(255, 230, 0)';
const CYAN = 'rgb(0, 229, 255)';

/** WCAG ratio of two rgb() strings (opaque). */
async function ratio(page: Page, a: string, b: string): Promise<number> {
  return page.evaluate(([x, y]) => {
    const lum = (s: string) => {
      const [r, g, bl] = (s.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number).map((v) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
    };
    const [hi, lo] = [lum(x!), lum(y!)].sort((p, q) => q - p);
    return (hi! + 0.05) / (lo! + 0.05);
  }, [a, b]);
}

test.describe('GP-3: white panels', () => {
  test.skip(({ browserName }) => browserName !== 'chromium');

  for (const lang of ['ko', 'en'] as const) {
    test(`GP-3: every WHITE_PANELS selector matches ≥ 1 element on its page (list above) — ${lang}`, async ({ page }) => {
      for (const [route, sel] of PANELS) {
        const url = lang === 'en' ? en(route) : route;
        await page.goto(url, { waitUntil: 'load' });
        expect(await page.locator(sel).count(), `${url} ${sel}`).toBeGreaterThanOrEqual(1);
      }
    });
  }

  test('GP-3: panel ground is rgb(238, 238, 233), body text rgb(26, 26, 26) ≥ 14:1, muted ≥ 6:1, top edge 3px yellow', async ({ page }) => {
    for (const [route, sel] of PANELS) {
      await page.goto(route, { waitUntil: 'load' });
      const look = await page.locator(sel).first().evaluate((el) => {
        const s = getComputedStyle(el);
        const muted = getComputedStyle(el).getPropertyValue('--read-muted').trim();
        const probe = document.createElement('span');
        probe.style.color = muted;
        el.appendChild(probe);
        const mutedRgb = getComputedStyle(probe).color;
        probe.remove();
        return { bg: s.backgroundColor, color: s.color, top: `${s.borderTopWidth} ${s.borderTopStyle} ${s.borderTopColor}`, muted: mutedRgb };
      });
      const label = `${route} ${sel}`;
      expect([WHITE, CARD], label).toContain(look.bg);
      expect(look.color, label).toBe(INK);
      expect(await ratio(page, look.color, look.bg), label).toBeGreaterThanOrEqual(14);
      expect(await ratio(page, look.muted, look.bg), label).toBeGreaterThanOrEqual(6);
      expect(look.top, label).toBe(`3px solid ${YELLOW}`);
    }
  });

  test('GP-3: links on white are ink with an underline; the yellow strip is present and no text is yellow or cyan', async ({ page }) => {
    for (const [route, sel] of PANELS) {
      await page.goto(route, { waitUntil: 'load' });
      const res = await page.locator(sel).first().evaluate((panel, bad) => {
        const offenders: string[] = [];
        const links: { color: string; line: string; strip: boolean; chip: boolean }[] = [];
        for (const el of [panel, ...Array.from(panel.querySelectorAll('*'))]) {
          const s = getComputedStyle(el);
          const hasText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent!.trim() !== '');
          if (hasText && bad.includes(s.color)) offenders.push(`${el.tagName}.${el.getAttribute('class') ?? ''} ${s.color}`);
          if (el.tagName === 'A' && (el.matches('a:not([class]), .jobfit__ev, .creds__ev'))) {
            const r = el.getBoundingClientRect();
            if (r.width === 0) continue;
            links.push({ color: s.color, line: s.textDecorationLine, strip: s.backgroundImage.includes('linear-gradient'), chip: el.matches('.jobfit__ev, .creds__ev') });
          }
        }
        return { offenders, links };
      }, [YELLOW, CYAN, 'rgb(255, 225, 74)']);
      expect(res.offenders, `${route} ${sel}`).toEqual([]);
      for (const l of res.links) {
        expect(l.color, `${route} ${sel} link`).toBe(INK);
        expect(l.line, `${route} ${sel} link`).toContain('underline');
        expect(l.strip, `${route} ${sel} link strip`).toBe(!l.chip);
      }
    }
    // the strip exists somewhere (records publications and summaries hold plain links)
    await page.goto('/game/records/', { waitUntil: 'load' });
    const strips = await page.locator('.creds__table a:not([class]), .rec__pubs a:not([class]), .psum a:not([class]), .jobfit__table a:not([class])').evaluateAll((els) =>
      els.filter((el) => getComputedStyle(el).backgroundImage.includes('255, 230, 0')).length,
    );
    const chips = await page.locator('.jobfit__ev').count();
    expect(strips + chips).toBeGreaterThan(0);
  });

  test('GP-3: focus inside a panel: 2px ink ring + yellow halo, not clipped by the chamfer', async ({ page }) => {
    await page.goto('/game/records/', { waitUntil: 'load' });
    await settle(page);
    await page.keyboard.press('Tab');
    for (const sel of ['.jobfit__table', '.rec__pubs', '.creds__table']) {
      const target = page.locator(`${sel} a[href], ${sel} button`).first();
      await target.scrollIntoViewIfNeeded();
      await target.evaluate((el) => (el as HTMLElement).focus());
      const ring = await target.evaluate((el) => {
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        const panel = el.closest('.jobfit__table, .rec__pubs, .creds__table')!.getBoundingClientRect();
        const reach = 2 + 2 + 5; // offset + ring + halo
        return {
          ring: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`, halo: s.boxShadow,
          inside: r.left - reach >= panel.left - 0.5 && r.right + reach <= panel.right + 0.5 && r.top - reach >= panel.top - 0.5,
        };
      });
      expect(ring.ring, sel).toBe(`solid 2px ${INK}`);
      expect(ring.halo, sel).toContain(YELLOW);
      expect(ring.halo, sel).toContain('5px');
      expect(ring.inside, `${sel}: the ring and halo stay inside the panel box`).toBe(true);
    }
  });

  test('GP-3: job-fit statuses differ at a glance and none is yellow', async ({ page }) => {
    await page.goto('/game/records/', { waitUntil: 'load' });
    const look = (status: string) =>
      page.locator(`#job-fit .jobfit__status--${status}`).first().evaluate((el) => {
        const s = getComputedStyle(el);
        return { bg: s.backgroundColor, color: s.color, border: s.borderTopStyle, borderColor: s.borderTopColor };
      });
    const [met, partial, progress, later] = await Promise.all(['met', 'partial', 'in-progress', 'later'].map(look));
    expect(met).toEqual({ bg: 'rgb(224, 244, 246)', color: 'rgb(0, 111, 128)', border: 'solid', borderColor: 'rgb(0, 111, 128)' });
    expect(partial.color).toBe(INK);
    expect(partial.borderColor).toBe('rgb(133, 133, 127)');
    expect(partial.bg).not.toBe(met.bg);
    expect(progress.border).toBe('dashed');
    expect(progress.color).toBe('rgb(85, 85, 79)');
    expect(later.border).toBe('solid');
    for (const s of [met, partial, progress, later]) {
      expect([s.bg, s.color, s.borderColor]).not.toContain(YELLOW);
      expect([s.bg, s.color, s.borderColor]).not.toContain('rgb(255, 225, 74)');
    }
  });

  test('GP-3: dark lists stay dark: education, awards, documents', async ({ page }) => {
    await page.goto('/game/records/', { waitUntil: 'load' });
    const grounds = await page.evaluate(() => {
      const out: Record<string, string> = {};
      for (const [name, sel] of [['education', '#education'], ['awards', '#awards'], ['documents', '#documents']] as const) {
        let el: Element | null = document.querySelector(sel);
        if (!el) { out[name] = 'missing'; continue; }
        let bg = 'rgba(0, 0, 0, 0)';
        while (el && (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent')) { bg = getComputedStyle(el).backgroundColor; el = el.parentElement; }
        out[name] = bg;
      }
      return out;
    });
    for (const [name, bg] of Object.entries(grounds)) {
      expect(bg, name).not.toBe('missing');
      const [r, g, b] = (bg.match(/\d+/g) ?? []).map(Number);
      expect(Math.max(r!, g!, b!), `${name} ground ${bg}`).toBeLessThan(40);
    }
  });
});
