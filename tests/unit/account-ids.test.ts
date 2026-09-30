// AL-3: the account ID rules shared by the fetch job, the manage chunk and the relay Worker (spec §4.3, §5.2, R-13, R-14).
// Fixed vectors only: the spec's public examples, never the owner's IDs or names (A-10).
import { describe, expect, it } from 'vitest';
import * as ids from '../../src/lib/account-ids';

describe('normalize / sameName (spec §4.3)', () => {
  it('NFC + trim; rejects >64 chars, C0/C1 and bidi controls', () => {
    expect(ids.normalize('  닉네임 ')).toBe('닉네임');
    expect(ids.normalize('닉네임'.normalize('NFD'))).toBe('닉네임');
    expect(ids.normalize('a'.repeat(65))).toBeNull();
    for (const bad of ['a\u0000b', 'a\u0085b', 'a‮b', 'a⁦b']) expect(ids.normalize(bad), JSON.stringify(bad)).toBeNull();
  });
  it('sameName ignores case, NFC and outer spaces', () => {
    expect(ids.sameName(' Robin ', 'robin')).toBe(true);
    expect(ids.sameName('프로게이머에요'.normalize('NFD'), '프로게이머에요')).toBe(true);
    expect(ids.sameName('Robin', 'Robyn')).toBe(false);
  });
});
describe('ID parsers', () => {
  it('HoYo UID', () => {
    expect(ids.parseHoyoUid('618285856')).toBe('618285856');
    expect(ids.parseHoyoUid('1300025292')).toBe('1300025292');
    for (const bad of ['abc', '0618285856', '1', '12345678901', '6182 85856']) expect(ids.parseHoyoUid(bad), bad).toBeNull();
  });
  it('SteamID64: bare, profile URL, range; vanity and other hosts rejected', () => {
    expect(ids.parseSteamId64('76561197960435530')).toBe('76561197960435530');
    expect(ids.parseSteamId64('https://steamcommunity.com/profiles/76561197960435530/')).toBe('76561197960435530');
    expect(ids.parseSteamId64('76561197960265728')).toBeNull(); // offset 0
    expect(ids.parseSteamId64('76561202255233024')).toBeNull(); // offset 2^32
    for (const bad of ['https://steamcommunity.com/id/robinwalker', 'http://steamcommunity.com/profiles/76561197960435530', 'https://evil.example/profiles/76561197960435530', '7656119796043553']) expect(ids.parseSteamId64(bad), bad).toBeNull();
  });
  it('Riot ID: last #, 3–16 name, 3–5 tag, no outer spaces, NFC', () => {
    expect(ids.parseRiotId('Hide on bush#KR1')).toEqual({ gameName: 'Hide on bush', tagLine: 'KR1' });
    expect(ids.parseRiotId('프로게이머에요#KR1'.normalize('NFD'))).toEqual({ gameName: '프로게이머에요', tagLine: 'KR1' });
    for (const bad of ['Hide on bush', 'Hide on bush#', '#KR1', 'ab#KR1', 'Hide #KR1', 'Hide/on#KR1', 'Hide%on#KR1', 'Hide‮on#KR1', 'Hide on bush#K']) expect(ids.parseRiotId(bad), bad).toBeNull();
  });
});
describe('links', () => {
  it('riotLinks: %20 spaces, NFC percent-encoding, - separator, kr', () => {
    expect(ids.riotLinks('Hide on bush#KR1')).toEqual({ lol: 'https://op.gg/lol/summoners/kr/Hide%20on%20bush-KR1', tft: 'https://lolchess.gg/profile/kr/Hide%20on%20bush-KR1' });
    expect(ids.riotLinks('프로게이머에요#KR1'.normalize('NFD'))?.lol).toBe('https://op.gg/lol/summoners/kr/%ED%94%84%EB%A1%9C%EA%B2%8C%EC%9D%B4%EB%A8%B8%EC%97%90%EC%9A%94-KR1');
    expect(ids.riotLinks('no tag')).toBeNull();
    for (const href of Object.values(ids.riotLinks('Hide on bush#KR1')!)) expect(ids.HREF_ALLOW.lol.test(href) || ids.HREF_ALLOW.tft.test(href)).toBe(true);
  });
  it('enkaProfileUrl only for valid UIDs (Enka /u/ also takes Enka user names)', () => {
    expect(ids.enkaProfileUrl('genshin', '618285856')).toBe('https://enka.network/u/618285856/');
    expect(ids.enkaProfileUrl('zzz', '1300025292')).toBe('https://enka.network/zzz/1300025292/');
    for (const bad of ['abc', '0618285856', '1']) expect(ids.enkaProfileUrl('genshin', bad), bad).toBeNull();
  });
});
describe('secrets and variables', () => {
  it('looksLikeSecret', () => {
    const fake = (p: string) => p + '_' + 'A'.repeat(36); // built at run time (gitleaks)
    for (const s of ['0123456789abcdef0123456789ABCDEF', 'github' + '_pat_' + 'x'.repeat(30), fake('ghp'), fake('gho'), fake('ghu'), fake('ghs'), fake('ghr')]) expect(ids.looksLikeSecret(s)).toBe(true);
    for (const s of ['618285856', 'Hide on bush#KR1', '닉네임', '76561197960435530']) expect(ids.looksLikeSecret(s)).toBe(false);
  });
  it('validateVar: seven names, canonical values, secrets refused', () => {
    expect(ids.validateVar('ACCOUNT_OTHER', '1')).toEqual({ ok: false, reason: 'name' });
    expect(ids.validateVar('ACCOUNT_GENSHIN_UID', '618285856')).toEqual({ ok: true, value: '618285856' });
    expect(ids.validateVar('ACCOUNT_STEAM_ID64', 'https://steamcommunity.com/profiles/76561197960435530')).toEqual({ ok: true, value: '76561197960435530' });
    expect(ids.validateVar('ACCOUNT_GENSHIN_NAME', '0123456789abcdef0123456789abcdef')).toEqual({ ok: false, reason: 'secret' });
    expect(ids.validateVar('ACCOUNT_RIOT_ID', 'bad')).toEqual({ ok: false, reason: 'format' });
    expect(ids.validateVar('ACCOUNT_ZZZ_NAME', '   ')).toEqual({ ok: false, reason: 'format' });
  });
  it('ACCOUNT_VARS names follow the Actions rules (alnum/_; not GITHUB_; no leading digit)', () => {
    expect(ids.ACCOUNT_VARS).toHaveLength(7);
    for (const n of ids.ACCOUNT_VARS) { expect(n).toMatch(/^[A-Z_][A-Z0-9_]*$/); expect(n.startsWith('GITHUB_')).toBe(false); }
  });
});
