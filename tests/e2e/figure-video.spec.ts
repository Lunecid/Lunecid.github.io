// The LG Aimers figure animation (FigureVideo.astro, src/scripts/figure-video.ts) in a real browser: the still stays in
// the flow; with motion on the video plays over it once the figure is on screen, under reduced motion only the button
// starts it, nothing downloads before it plays, and print shows the still alone.
import { test, expect, openAt } from './helpers';

const GAME = '/game/projects/resort-menu-demand/';
const DATA_EN = '/en/data/projects/resort-menu-demand/';

for (const route of [GAME, DATA_EN]) {
  test(`${route}: with motion on, the animation plays over the still when the figure is on screen`, async ({ page }) => {
    await openAt(page, route, 1280);
    const box = page.locator('[data-figvid]');
    await expect(box).toHaveCount(1);
    await expect(box.locator('img')).toHaveCount(1); // the still stays in the flow (layout, alt text, print)
    await box.scrollIntoViewIfNeeded();
    await expect(box).toHaveAttribute('data-figvid-state', /^(playing|ended)$/);
    const video = box.locator('video');
    await expect(video).toBeVisible();
    await expect(video).toHaveAttribute('aria-label', route.startsWith('/en/') ? 'Figure 1 animation' : '그림 1 애니메이션');
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 10_000 }).toBeGreaterThan(0.5);
    // VP9 first: every Chromium plays it (Playwright's has no H.264); Safari falls back to the MP4
    expect(await video.evaluate((v: HTMLVideoElement) => v.currentSrc)).toMatch(/\/video\/resort-menu-pipeline\.webm$/);
    await expect(box.locator('[data-figvid-play]')).toBeHidden();
    // the video lies exactly over the still
    const [still, over] = await Promise.all([box.locator('img').boundingBox(), video.boundingBox()]);
    expect(Math.abs((over?.width ?? 0) - (still?.width ?? 0))).toBeLessThanOrEqual(1);
    expect(Math.abs((over?.y ?? 0) - (still?.y ?? 0))).toBeLessThanOrEqual(1);
  });
}

test('reduced motion: the still and a play button, nothing downloads; the button plays it and hands focus to the video', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', (req) => {
    if (req.url().includes('/video/')) requested.push(req.url());
  });
  await openAt(page, GAME, 1280, 900, { reducedMotion: true });
  const box = page.locator('[data-figvid]');
  await box.scrollIntoViewIfNeeded();
  await expect(box).toHaveAttribute('data-figvid-state', 'still');
  await expect(box.locator('video')).toBeHidden();
  const button = box.getByRole('button', { name: '애니메이션 재생' });
  await expect(button).toBeVisible();
  await page.waitForTimeout(500);
  expect(requested, 'preload="none" and no autoplay: no video request').toEqual([]);
  await button.click();
  await expect(box).toHaveAttribute('data-figvid-state', 'playing');
  await expect(box.locator('video')).toBeFocused();
  await expect.poll(() => box.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 10_000 }).toBeGreaterThan(0.2);
});

test('print: the still alone (no video, no button)', async ({ page }) => {
  await openAt(page, GAME, 1280);
  await page.emulateMedia({ media: 'print' });
  const box = page.locator('[data-figvid]');
  await expect(box.locator('img')).toBeVisible();
  await expect(box.locator('video')).toBeHidden();
  await expect(box.locator('[data-figvid-play]')).toBeHidden();
});
