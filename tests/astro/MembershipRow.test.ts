import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

const defs = parseYamlList(readFileSync(join(process.cwd(), 'src/data/achievements.yaml'), 'utf8')).map((a) => achievementSchema.parse(a));
// The committed photo stands in for character art (the tiles only need an ImageMetadata).
const tile = (id: FavoriteTile['id'], name: string): FavoriteTile => ({ id, name, caption: 'GENSHIN · FAVORITE', image: photo, objectPosition: '50% 10%' });
const THREE = [tile('remielle', '레미엘'), tile('eula', '유라'), tile('mona', '모나')];

const render = (tiles: FavoriteTile[], lang: 'ko' | 'en' = 'ko') =>
  renderAstro(MembershipRow, {
    props: { lang, membership: membershipCard(resolveDeep(playerLogCopy[lang], lang, loadFactSource()).membership, lang === 'ko' ? '게임 데이터 분석가 · 연구자' : 'Game Data Analyst · Researcher'), tiles, tileSlots: 3, achievements: defs },
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

  it('the row uses the HUD container and the 440px card column from 1068px', () => {
    const src = readSource('src/components/player-log/MembershipRow.astro');
    expect(src).toContain('class="container container--hud pl-intro__grid"');
    expect(src).toMatch(/@media \(min-width: 1068px\) \{[\s\S]*?grid-template-columns:\s*minmax\(0, 440px\) 1fr/);
  });
});

describe('AchievementMeter', () => {
  it('SSR shows the 0-unlocked count with the client template, one slot per achievement, the storage note and a link to the list', async () => {
    const html = await renderAstro(AchievementMeter, { props: { lang: 'ko', defs } });
    expect(html).toMatch(/<div class="ach-meter bracket"[^>]*data-ach-meter/);
    expect(html).toContain(`data-ids="${defs.map((d) => d.id).join(' ')}"`);
    expect(html).toMatch(new RegExp(`data-ach-meter-count[^>]*>0 \\/ ${defs.length} 달성<`));
    expect(html).toContain('data-template="{n} / {total} 달성"');
    expect(html.match(/data-ach-slot="/g)).toHaveLength(defs.length);
    expect(html).toMatch(/<ol class="ach-meter__slots" role="list" aria-hidden="true"/);
    expect(html).toContain('달성 기록은 이 브라우저에만 저장됩니다.');
    expect(html).toMatch(/<a class="sec-more" href="#site-achievements"[^>]*>업적 목록 보기 /);
    expect(html).toMatch(/<script[^>]*type="module"/);
    const en = await renderAstro(AchievementMeter, { props: { lang: 'en', defs }, url: '/en/game/player-log/' });
    expect(en).toMatch(new RegExp(`data-ach-meter-count[^>]*>0 \\/ ${defs.length} unlocked<`));
    expect(en).toContain('See all achievements');
  });
});
