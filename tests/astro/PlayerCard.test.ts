import { describe, expect, it } from 'vitest';
import PlayerCard from '../../src/components/hud/PlayerCard.astro';
import { renderAstro } from './helpers';

const PROPS = {
  lang: 'ko' as const,
  label: '플레이어 카드',
  classLine: '게임 데이터 분석가 · 연구자',
  badges: ['IEEE CoG 2026 ORAL', '최우수상 ×2'],
  photoAlt: '백성은 증명사진',
};

describe('PlayerCard.astro', () => {
  it('photo has the given alt and 46px width', async () => {
    const html = await renderAstro(PlayerCard, { props: PROPS });
    const img = html.match(/<img[^>]*>/)?.[0] ?? '';
    expect(img).toContain('alt="백성은 증명사진"');
    expect(img).toContain('width="46"');
    expect(img).toMatch(/height="\d+"/); // intrinsic ratio kept (61 for the 360×480 source; Q15 may supply another photo)
    expect(img).toContain('loading="eager"');
    expect(html).toMatch(/<div class="player-card cut cut--line" role="group" aria-label="플레이어 카드"/);
  });

  it('shows the class line in the page language and one tier badge per item', async () => {
    const ko = await renderAstro(PlayerCard, { props: PROPS });
    expect(ko).toMatch(/<p class="player-card__class" lang="ko"[^>]*>게임 데이터 분석가 · 연구자<\/p>/);
    expect(ko.match(/<li class="badge badge--tier"/g)).toHaveLength(2);
    expect(ko).toMatch(/<li class="badge badge--tier" lang="en"[^>]*>[\s\S]*IEEE CoG 2026 ORAL/);
    expect(ko).toContain('최우수상 ×2');
    expect(ko).not.toMatch(/\d{3},\d{3}/); // no granular-number headline on the player card

    const en = await renderAstro(PlayerCard, {
      props: { ...PROPS, lang: 'en', label: 'Player card', classLine: 'GAME DATA ANALYST · RESEARCHER', photoAlt: 'Seongeun Baek ID photo' },
      url: '/en/',
    });
    expect(en).toMatch(/<p class="player-card__class" lang="en"[^>]*>GAME DATA ANALYST · RESEARCHER<\/p>/);
  });
});
