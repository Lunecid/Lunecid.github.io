// Showcase art for League of Legends and TFT only (owner ruling 2026-10-06): Ezreal on the LoL tab, Pengu on the TFT
// tab, no art on Hearthstone or Eternal Return; Riot's Legal Jibber Jabber notice in the footer wherever that art is
// on the page; the built asset names stay neutral.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ui } from '../../src/i18n/ui';
import { containsTrademark } from '../../src/lib/seo';
import { test, expect, openAt } from './helpers';

const TABS = {
  ko: { lol: '리그 오브 레전드', tft: '전략적 팀 전투', hearthstone: '하스스톤', er: '이터널 리턴' },
  en: { lol: 'League of Legends', tft: 'Teamfight Tactics', hearthstone: 'Hearthstone', er: 'Eternal Return' },
} as const;

for (const [lang, route] of [['ko', '/game/player-log/'], ['en', '/en/game/player-log/']] as const) {
  test(`${route}: Ezreal on the LoL tab, Pengu on TFT, no art on Hearthstone or Eternal Return; the Riot notice is in the footer`, async ({ page }) => {
    await openAt(page, route, 1280);
    await page.locator('#favorite-games').scrollIntoViewIfNeeded();
    const tab = (name: string) => page.locator('.fg__tab', { hasText: name }).first();
    const scene = page.locator('.fg__scene');
    for (const [key, file] of [['lol', 'showcase-1'], ['tft', 'showcase-2']] as const) {
      await tab(TABS[lang][key]).click();
      await expect(scene, key).toHaveAttribute('data-art', 'on');
      const img = page.locator('.fg__chr img').first();
      await expect(img, key).toHaveAttribute('src', new RegExp(`/_astro/${file}\\.`));
      await expect(img, key).toHaveAttribute('alt', '');
      await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0), { message: key }).toBe(true);
      await expect(page.locator(`.fg__tint--${key === 'lol' ? 'ezreal' : 'pengu'}`)).toHaveAttribute('data-on', 'true');
    }
    for (const key of ['hearthstone', 'er'] as const) {
      await tab(TABS[lang][key]).click();
      await expect(scene, key).toHaveAttribute('data-art', 'off');
      await expect(page.locator('.fg__chr img'), key).toHaveCount(0);
    }
    await expect(page.locator('.site-footer__notices')).toContainText(ui.en['notice.riotAssets']);
    await expect(page.locator('.fg__credit')).toContainText('© Riot Games');
    // stage art only: the membership row keeps its three favourite-character tiles
    await expect(page.locator('#membership .fav-tiles img')).toHaveCount(3);
  });
}

test('built showcase art names are neutral: no character, game or trademark name under dist/_astro', () => {
  const names = readdirSync(join(process.cwd(), 'dist/_astro'));
  expect(names.filter((n) => n.startsWith('showcase-')).length, 'the showcase files are built').toBeGreaterThan(0);
  expect(names.filter((n) => /ezreal|pengu/i.test(n) || containsTrademark(n))).toEqual([]);
});
