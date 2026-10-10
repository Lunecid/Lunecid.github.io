// F-038 (audit 2026-09-29, reworked 2026-10-10): quick picks in the favourite-games showcase. However short the gaps
// between clicks, every burst settles on its last pick: one scene, the panel labelled by that tab, the game's title,
// fully shown. Until 2026-10-10 a pick made while the scene changed, or an art decode ending after the tab changed,
// could freeze the stage for good on another game (see the notes on `busy` and `chrTarget` in FavoriteGames.tsx).
import { test, expect, openAt } from './helpers';

/** Tab positions to click (0 ZZZ, 1 Genshin, 2 LoL and 3 TFT with art, 4 DnF … 8 FM) and the ms to wait after each
 *  click but the last: around a scene's exit (TL.exit = 150 ms, plus a frame or two) and across it. Fixed, so a
 *  failure reruns the same way; the first LoL and TFT picks also decode their art while the scene changes. */
const BURSTS: { picks: number[]; gaps: number[] }[] = [
  { picks: [2, 4], gaps: [150] },
  { picks: [3, 8], gaps: [0] },
  { picks: [5, 2, 6], gaps: [140, 10] },
  { picks: [0, 1, 7], gaps: [160, 160] },
  { picks: [3, 2], gaps: [60] },
  { picks: [8, 0, 3, 5], gaps: [150, 150, 150] },
  { picks: [6, 2], gaps: [170] },
  { picks: [4, 1, 0, 8], gaps: [20, 20, 20] },
];

for (const width of [1440, 375]) {
  test(`${width}px: every burst of quick picks settles on its last pick, and the stage keeps following the tabs`, async ({ page }) => {
    await openAt(page, '/game/player-log/', width);
    await page.locator('#favorite-games').scrollIntoViewIfNeeded();
    await expect(page.locator('#favorite-games astro-island:not([ssr])')).toHaveCount(1);
    const ids = await page.locator('.fg__tab:not([aria-disabled="true"])').evaluateAll((tabs) => tabs.map((t) => t.id));
    expect(ids.length, 'nine playable games').toBe(9);
    for (const [n, { picks, gaps }] of BURSTS.entries()) {
      const plan = picks.map((p) => ids[p]);
      await page.evaluate(async ({ plan, gaps }) => {
        for (const [i, id] of plan.entries()) {
          document.getElementById(id)!.click();
          if (i < gaps.length) await new Promise((r) => setTimeout(r, gaps[i]));
        }
      }, { plan, gaps });
      // the settled stage; on a Korean page each tab's caption is its game's English title in capitals
      const stage = () => page.evaluate(() => {
        const selected = [...document.querySelectorAll<HTMLElement>('.fg__tab[aria-selected="true"]')].map((t) => t.id);
        const scenes = [...document.querySelectorAll<HTMLElement>('.fg__scene')];
        const title = scenes[0]?.querySelector<HTMLElement>('.fg__title');
        const caption = document.querySelector(`[id="${selected[0]}"] small`)?.textContent ?? '';
        return {
          selected: selected.join(),
          labelledBy: document.querySelector('[role="tabpanel"]')?.getAttribute('aria-labelledby'),
          scenes: scenes.length,
          titleMatchesTab: (title?.innerText ?? '').replace(/\s+/g, ' ').toUpperCase() === caption.trim(),
          shown: scenes.length === 1 && getComputedStyle(scenes[0]).opacity === '1' && title !== null && getComputedStyle(title).opacity === '1',
        };
      });
      const last = plan[plan.length - 1];
      await expect.poll(stage, { message: `burst ${n + 1} (picks ${picks.join(' → ')})`, timeout: 4_000 })
        .toEqual({ selected: last, labelledBy: last, scenes: 1, titleMatchesTab: true, shown: true });
    }
  });
}
