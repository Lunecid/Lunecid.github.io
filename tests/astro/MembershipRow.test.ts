import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import photo from '../../src/assets/photo/photo-id.webp';
import MembershipRow from '../../src/components/player-log/MembershipRow.astro';
import AchievementMeter from '../../src/components/player-log/AchievementMeter.astro';
import { achievementSchema } from '../../src/content/schemas';
import { parseYamlList } from '../../src/content/yaml-loader';
import { membershipCard, playerLogCopy } from '../../src/data/copy/player-log';
import { resolveDeep } from '../../src/lib/facts';
import type { FavoriteTile } from '../../src/lib/favorites';
import { loadFactSource } from '../helpers/fact-source';
import { readSource, renderAstro } from './helpers';

// jsdom ships no type declarations; the node project only needs its parser here.
const { JSDOM } = createRequire(import.meta.url)('jsdom') as { JSDOM: new (html: string) => { window: { document: Document } } };
const defs = parseYamlList(readFileSync(join(process.cwd(), 'src/data/achievements.yaml'), 'utf8')).map((a) => achievementSchema.parse(a));
// The committed photo stands in for character art (the tiles only need an ImageMetadata).
const tile = (id: FavoriteTile['id'], name: string): FavoriteTile => ({ id, name, caption: 'GENSHIN · FAVORITE', image: photo, objectPosition: '50% 10%' });
const THREE = [tile('remielle', '레미엘'), tile('eula', '유라'), tile('mona', '모나')];

const render = (tiles: FavoriteTile[], lang: 'ko' | 'en' = 'ko', slots?: Record<string, string>) =>
  renderAstro(MembershipRow, {
    props: { lang, membership: membershipCard(resolveDeep(playerLogCopy[lang], lang, loadFactSource()).membership, lang === 'ko' ? '게임 데이터 분석가 · 연구자' : 'Game Data Analyst · Researcher'), tiles, tileSlots: 3, achievements: defs },
    slots,
    url: lang === 'en' ? '/en/game/player-log/' : '/game/player-log/',
  });

describe('MembershipRow (Player Log first row)', () => {
  it('with all three tiles: card + tiles, no progress panel (the mockup row)', async () => {
    const html = await render(THREE);
    expect(html).toMatch(/<section id="membership" class="pl-intro hud-grid"[^>]*aria-label="회원 카드"/);
    expect(html).toContain('class="mcard"');
    expect(html.match(/<li class="fav-tile"/g)).toHaveLength(3);
    expect(html).not.toContain('data-ach-meter');
    expect(html).not.toContain('pl-intro--meter');
  });

  it('D-1 no art: the card pairs with the site-achievement progress instead of an empty column', async () => {
    for (const lang of ['ko', 'en'] as const) {
      const html = await render([], lang);
      expect(html).toMatch(/<section id="membership" class="pl-intro hud-grid pl-intro--meter"/);
      expect(html).not.toContain('fav-tile');
      expect(html).toContain('data-ach-meter');
      expect(html.indexOf('data-ach-meter')).toBeGreaterThan(html.indexOf('class="mcard"'));
    }
  });

  it('one missing character: the remaining tiles stay and the progress panel fills the rest of the column', async () => {
    const html = await render(THREE.slice(0, 2));
    expect(html.match(/<li class="fav-tile"/g)).toHaveLength(2);
    expect(html).toContain('data-ach-meter');
    expect(html.indexOf('data-ach-meter')).toBeGreaterThan(html.lastIndexOf('fav-tile'));
  });

  it('AL-10: the accounts slot renders inside the HUD container, after the card grid (not inside it)', async () => {
    for (const tiles of [THREE, []]) {
      const html = await render(tiles, 'ko', { accounts: '<div class="acct-probe">probe</div>' });
      const doc = new JSDOM(html).window.document;
      const probe = doc.querySelector('.acct-probe');
      expect(probe).not.toBeNull();
      const container = probe?.parentElement;
      expect(container?.matches('#membership > .container.container--hud')).toBe(true);
      expect(probe?.closest('.pl-intro__grid')).toBeNull();
      expect(probe?.previousElementSibling?.classList.contains('pl-intro__grid')).toBe(true);
      expect(container?.querySelector('.pl-intro__grid .mcard')).not.toBeNull();
    }
    // without slot content the container holds only the grid (no empty wrapper, no stray node)
    const bare = new JSDOM(await render(THREE)).window.document;
    expect(bare.querySelector('#membership > .container.container--hud')?.children).toHaveLength(1);
  });

  it('the row uses the HUD container and the 440px card column from 1068px', () => {
    const src = readSource('src/components/player-log/MembershipRow.astro');
    // AL-10: the container holds the card grid and, after it, the LINKED ACCOUNTS slot (tiles align with the card column)
    expect(src).toMatch(/<div class="container container--hud">\s*<div class="pl-intro__grid">/);
    expect(src).toMatch(/<\/div>\s*<slot name="accounts" \/>\s*<\/div>\s*<\/section>/);
    expect(src).toMatch(/@media \(min-width: 1068px\) \{[\s\S]*?grid-template-columns:\s*minmax\(0, 440px\) 1fr/);
  });
});

describe('AchievementMeter', () => {
  it('SSR shows the 0-unlocked count with the client template, one slot per achievement, the storage note and a link to the list', async () => {
    const html = await renderAstro(AchievementMeter, { props: { variant: 'game', lang: 'ko', defs } });
    expect(html).toMatch(/<div class="ach-meter bracket"[^>]*data-ach-meter/);
    expect(html).toContain(`data-ids="${defs.map((d) => d.id).join(' ')}"`);
    expect(html).toMatch(new RegExp(`data-ach-meter-count[^>]*>0 \\/ ${defs.length} 달성<`));
    expect(html).toContain('data-template="{n} / {total} 달성"');
    expect(html.match(/data-ach-slot="/g)).toHaveLength(defs.length);
    expect(html).toMatch(/<ol class="ach-meter__slots" role="list" aria-hidden="true"/);
    expect(html).toContain('달성 기록은 이 브라우저에만 저장됩니다.');
    expect(html).toMatch(/<a class="sec-more" href="#site-achievements"[^>]*>업적 목록 보기 /);
    expect(html).toMatch(/<script[^>]*type="module"/);
    const en = await renderAstro(AchievementMeter, { props: { variant: 'game', lang: 'en', defs }, url: '/en/game/player-log/' });
    expect(en).toMatch(new RegExp(`data-ach-meter-count[^>]*>0 \\/ ${defs.length} unlocked<`));
    expect(en).toContain('See all achievements');
  });

  it('PL-2: the meter slots hold small medals inside the aria-hidden list; no ★', async () => {
    const html = await renderAstro(AchievementMeter, { props: { variant: 'game', lang: 'ko', defs } });
    expect(html).not.toContain('★');
    const doc = new JSDOM(html).window.document;
    const list = doc.querySelector('ol.ach-meter__slots');
    expect(list?.getAttribute('aria-hidden')).toBe('true');
    const slots = [...doc.querySelectorAll('[data-ach-slot]')];
    expect(slots).toHaveLength(defs.length);
    for (const d of defs) {
      const slot = doc.querySelector(`[data-ach-slot="${d.id}"]`);
      expect(slot?.closest('ol')).toBe(list);
      const medals = slot?.querySelectorAll('.medal') ?? [];
      expect(medals, d.id).toHaveLength(1);
      expect(medals[0]!.classList.contains('medal--meter')).toBe(true);
      expect(medals[0]!.getAttribute('data-medal')).toBe(d.id);
      expect(medals[0]!.getAttribute('data-state')).toBe(d.hidden ? 'hidden' : 'locked');
    }
    // AL-13's pop after the fill now runs on the medal; neither reduce path animates it
    const src = readSource('src/components/player-log/AchievementMeter.astro');
    expect(src).toMatch(/\.ach-meter__slot\[data-unlocked="true"\] :global\(\.medal\) \{\s*animation: medal-mint var\(--dur-medal\) var\(--ease-out\) var\(--dur-enter\) backwards;/);
    expect(src).not.toMatch(/ach-slot-pop|250ms/);
    expect(src).toMatch(/:global\(:root\[data-motion="reduce"\]\) \.ach-meter__slot\[data-unlocked="true"\] :global\(\.medal\) \{\s*animation: none;/);
    expect(src).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.ach-meter__slot\[data-unlocked="true"\] :global\(\.medal\) \{\s*animation: none;/);
  });
});
