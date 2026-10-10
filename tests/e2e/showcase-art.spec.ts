// Showcase art for League of Legends and TFT only (owner ruling 2026-10-06): Ezreal on the LoL tab, Pengu on the TFT
// tab, no art on Hearthstone or Eternal Return (nor on Dungeon & Fighter or Cyphers, 2026-10-09: no published Neople
// permission found); Riot's Legal Jibber Jabber notice in the footer wherever that art is on the page; the built asset
// names stay neutral.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ui } from '../../src/i18n/ui';
import { containsTrademark } from '../../src/lib/seo';
import { test, expect, openAt } from './helpers';

const TABS = {
  ko: { lol: '리그 오브 레전드', tft: '전략적 팀 전투', hearthstone: '하스스톤', er: '이터널 리턴', dnf: '던전앤파이터', cyphers: '사이퍼즈', fm: '풋볼 매니저 시리즈' },
  en: { lol: 'League of Legends', tft: 'Teamfight Tactics', hearthstone: 'Hearthstone', er: 'Eternal Return', dnf: 'Dungeon & Fighter', cyphers: 'Cyphers', fm: 'Football Manager' },
} as const;

for (const [lang, route] of [['ko', '/game/player-log/'], ['en', '/en/game/player-log/']] as const) {
  test(`${route}: Ezreal on the LoL tab, Pengu on TFT, no art on Hearthstone, Eternal Return, Dungeon & Fighter, Cyphers or Football Manager; the Riot notice is in the footer`, async ({ page }) => {
    await openAt(page, route, 1280);
    await page.locator('#favorite-games').scrollIntoViewIfNeeded();
    // client:visible: a tab clicked before the island hydrates is lost (CI run 37973533306 clicked LoL and still showed
    // the first game's art, both tries), so wait for it as the other showcase specs do
    await expect(page.locator('#favorite-games astro-island:not([ssr])')).toHaveCount(1);
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
    for (const key of ['hearthstone', 'er', 'dnf', 'cyphers', 'fm'] as const) {
      await tab(TABS[lang][key]).click();
      await expect(scene, key).toHaveAttribute('data-art', 'off');
      await expect(page.locator('.fg__chr img'), key).toHaveCount(0);
    }
    // Football Manager (2026-10-10): its team's red and white instead of a crest or logo; no image of any kind
    await expect(page.locator('.fg__tint--red-white')).toHaveAttribute('data-on', 'true');
    await expect(page.locator('.fg__scene img')).toHaveCount(0);
    // nine tabs since 2026-10-10: the column (two lines per Korean tab) still ends above the credit, inside the card
    const [card, list, credit] = await Promise.all(['section.fg', '.fg__list', '.fg__credit'].map(async (s) => (await page.locator(s).boundingBox())!));
    expect(list.y + list.height, 'tab column above the credit').toBeLessThan(credit.y - 8);
    expect(list.y + list.height, 'tab column inside the card').toBeLessThanOrEqual(card.y + card.height);
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
