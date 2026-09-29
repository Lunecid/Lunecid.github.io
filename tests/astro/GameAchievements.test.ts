import { describe, expect, it } from 'vitest';
import GameAchievements from '../../src/components/player-log/GameAchievements.astro';
import { playerLogCopy } from '../../src/data/copy/player-log';
import type { AccountFeed } from '../../src/lib/generated';
import { renderAstro } from './helpers';

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

/** A fake account feed, as scripts would write it to src/data/generated/accounts/<platform>.json. */
const FEED: AccountFeed = {
  schemaVersion: 1,
  platform: 'enka-zzz',
  status: 'ok',
  fetchedAt: '2026-09-25T00:00:00.000Z',
  maxAgeDays: 7,
  attribution: 'Enka.Network',
  cards: [{ title: 'Lunecid', stats: [] }],
};

describe('GameAchievements', () => {
  it('D-13: renders nothing (no #game-achievements) while no account feed exists', async () => {
    const html = await renderAstro(GameAchievements, { props: { variant: 'game', lang: 'ko', platforms: playerLogCopy.ko.gamePlatforms, accounts: {} } });
    expect(html.trim()).toBe('');
  });

  it('once an account feed exists: section#game-achievements lists the platforms and the note, no numbers', async () => {
    const accounts = { 'enka-zzz': FEED };
    const html = await renderAstro(GameAchievements, { props: { variant: 'game', lang: 'ko', platforms: playerLogCopy.ko.gamePlatforms, accounts } });
    expect(html).toMatch(/<section[^>]*id="game-achievements"/);
    expect(html.match(/class="game-ach__item"/g)).toHaveLength(5);
    for (const name of ['League of Legends', 'Dungeon & Fighter', 'Steam', 'Genshin Impact', 'Zenless Zone Zero']) {
      // text() decodes &amp; so an ampersand in a title (Dungeon & Fighter) matches the rendered, HTML-escaped markup.
      expect(text(html)).toContain(name);
    }
    expect(text(html).match(/LOCKED/g)).toHaveLength(5);
    expect(html).toContain('계정을 연동하면 게임 업적이 여기에 표시됩니다.');
    expect(text(html)).not.toMatch(/\d/); // no invented levels, counts or rates

    const en = await renderAstro(GameAchievements, { props: { variant: 'game', lang: 'en', platforms: playerLogCopy.en.gamePlatforms, accounts } });
    expect(en).toContain('Game achievements appear here once an account is linked.');
    expect(text(en)).not.toMatch(/\d/);
  });
});
