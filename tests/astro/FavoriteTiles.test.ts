import { describe, expect, it } from 'vitest';
import photo from '../../src/assets/photo/photo-id.webp';
import FavoriteTiles from '../../src/components/player-log/FavoriteTiles.astro';
import { renderAstro } from './helpers';

describe('FavoriteTiles', () => {
  it('renders nothing without tiles; decorative images', async () => {
    const empty = await renderAstro(FavoriteTiles, { props: { lang: 'ko', tiles: [] } });
    expect(empty.trim()).toBe('');

    // The committed photo stands in for character art (character PNGs are optional in the repo).
    const html = await renderAstro(FavoriteTiles, {
      props: { lang: 'ko', tiles: [{ id: 'eula', name: '유라', caption: 'GENSHIN · FAVORITE', image: photo, objectPosition: '52% 8%' }] },
    });
    expect(html).toMatch(/<ul[^>]*class="fav-tiles"[^>]*aria-label="최애 캐릭터"/);
    expect(html.match(/<li[\s>]/g)).toHaveLength(1);
    expect(html).toMatch(/<img[^>]*\salt(?:="")?[\s>]/); // Astro 7 renders alt="" as a bare `alt` attribute
    expect(html).toMatch(/<img[^>]*aria-hidden="true"/);
    expect(html).toContain('object-position: 52% 8%');
    // final fix 2 item 8: the " · FAVORITE" tag is its own span (hidden on phones), so no line ends in a dangling dot
    expect(html).toMatch(/<span class="fav-tile__kicker" lang="en"[^>]*>GENSHIN<span class="fav-tile__tag"[^>]*> · FAVORITE<\/span><\/span><strong[^>]*>유라<\/strong>/);
    // final fix 2 item 13: the tiles are the first screen's largest images on phones, so they never load lazily
    expect(html).toMatch(/<img[^>]*loading="eager"/);
    expect(html).toMatch(/<img[^>]*fetchpriority="high"/);
    expect(html).not.toContain('loading="lazy"');

    const en = await renderAstro(FavoriteTiles, {
      props: { lang: 'en', tiles: [{ id: 'eula', name: 'Eula', caption: 'GENSHIN · FAVORITE', image: photo, objectPosition: '52% 8%' }] },
    });
    expect(en).toMatch(/aria-label="Favorite characters"/);
  });
});
