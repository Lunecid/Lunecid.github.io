// src/lib/account-ids.ts — the account ID rules (spec §4.3, §5.2, §5.3). Import-free, erasable TypeScript only.
// Used by the manage chunk (Vite), scripts/accounts (Node type stripping) and workers/account-relay (esbuild).
// Browser checks are for usability; the Worker and the fetch job re-check and fail closed.
// The values these rules accept are public (R-14): Actions variables are printed in the run log's `env:` block.

/** The seven Actions variables (spec §5.2). Names follow the Actions rules: alnum/_, not GITHUB_, no leading digit. */
export const ACCOUNT_VARS = ['ACCOUNT_GENSHIN_UID', 'ACCOUNT_GENSHIN_NAME', 'ACCOUNT_ZZZ_UID', 'ACCOUNT_ZZZ_NAME', 'ACCOUNT_STEAM_ID64', 'ACCOUNT_STEAM_NAME', 'ACCOUNT_RIOT_ID'] as const;
export type AccountVar = (typeof ACCOUNT_VARS)[number];

/** Riot links use the Korean server only (Q8). */
export const RIOT_REGION = 'kr';

/** The only outbound profile links a visitor card may carry. */
export const HREF_ALLOW = {
  lol: /^https:\/\/op\.gg\/lol\/summoners\/kr\/[^/?#]+$/,
  tft: /^https:\/\/lolchess\.gg\/profile\/kr\/[^/?#]+$/,
  steam: /^https:\/\/steamcommunity\.com\/profiles\/7656119\d{10}$/,
} as const;

const RAW_MAX = 64;
// C0/C1 control characters (Unicode Cc: U+0000–001F, U+007F–009F) and the bidi controls U+202A–202E, U+2066–2069.
const CONTROL = /[\p{Cc}‪-‮⁦-⁩]/u;

/**
 * Common input rule (spec §4.3): more than 64 characters → null; NFC; trim; any C0/C1 or bidi control left → null.
 * The length is counted in UTF-16 code units before trimming (a strict upper bound on the input size).
 */
export function normalize(raw: string): string | null {
  if (typeof raw !== 'string' || raw.length > RAW_MAX) return null;
  const value = raw.normalize('NFC').trim();
  return CONTROL.test(value) ? null : value;
}

/** Identity check (R-13, spec §6.1): both sides normalized, then compared case-insensitively. */
export function sameName(fetched: string, expected: string): boolean {
  const a = normalize(fetched);
  const b = normalize(expected);
  if (a === null || b === null) return false;
  return a.toLowerCase() === b.toLowerCase();
}

// HoYo UID: the digit rule is unconfirmed (미확인, spec §4.3); the real judge is Enka's 400 (format) / 404 (missing).
const HOYO_UID = /^[1-9][0-9]{7,9}$/;

export function parseHoyoUid(raw: string): string | null {
  const value = normalize(raw);
  return value !== null && HOYO_UID.test(value) ? value : null;
}

// SteamID64: the format comes from a secondary source (미확인, spec §4.3). A bare id or a /profiles/<id> URL on
// https://steamcommunity.com only; vanity /id/<name> URLs are refused (Q6).
const STEAM_ID64 = /^7656119[0-9]{10}$/;
const STEAM_PROFILE_URL = /^https:\/\/steamcommunity\.com\/profiles\/(7656119[0-9]{10})\/?$/;
const STEAM_BASE = 76561197960265728n;
const STEAM_OFFSET_MAX = 2n ** 32n - 1n;

export function parseSteamId64(raw: string): string | null {
  const value = normalize(raw);
  if (value === null) return null;
  const id = STEAM_ID64.test(value) ? value : (STEAM_PROFILE_URL.exec(value)?.[1] ?? null);
  if (id === null) return null;
  const offset = BigInt(id) - STEAM_BASE;
  return offset >= 1n && offset <= STEAM_OFFSET_MAX ? id : null;
}

// Riot ID: Riot's FAQ says name 3–16 and tag 3–5 "alphanumeric" characters; whether Hangul and spaces count as
// "alphanumeric" is not in the FAQ (미확인, spec §4.3; Korean names exist in practice). `/ ? # % \` fail naturally.
const RIOT_NAME = /^[\p{L}\p{N}](?:[\p{L}\p{N} ]{1,14})[\p{L}\p{N}]$/u;
const RIOT_TAG = /^[\p{L}\p{N}]{3,5}$/u;

/** Splits at the last '#'; the name keeps inner spaces but may not start or end with one. */
export function parseRiotId(raw: string): { gameName: string; tagLine: string } | null {
  const value = normalize(raw);
  if (value === null) return null;
  const i = value.lastIndexOf('#');
  if (i < 0) return null;
  const gameName = value.slice(0, i);
  const tagLine = value.slice(i + 1);
  return RIOT_NAME.test(gameName) && RIOT_TAG.test(tagLine) ? { gameName, tagLine } : null;
}

// The spec §3.4 builder, verbatim (%20 for spaces, NFC before percent-encoding, '-' separator, region kr).
const seg = (s: string) => encodeURIComponent(s.trim().normalize('NFC'));
export function riotLinks(riotId: string): { lol: string; tft: string } | null { // "Hide on bush#KR1"
  const i = riotId.lastIndexOf('#');
  if (i < 1 || i === riotId.length - 1) return null;   // no tag → hide the links
  const path = `kr/${seg(riotId.slice(0, i))}-${seg(riotId.slice(i + 1))}`;
  return { lol: `https://op.gg/lol/summoners/${path}`, tft: `https://lolchess.gg/profile/${path}` };
}

/**
 * The owner's check button target (spec §4.3). Enka's /u/ also accepts Enka user names, so only a value that passes
 * parseHoyoUid makes a URL. The trailing '/' avoids a 308. The page format is observed, not documented (미확인).
 */
export function enkaProfileUrl(game: 'genshin' | 'zzz', uid: string): string | null {
  const value = parseHoyoUid(uid);
  if (value === null) return null;
  return game === 'genshin' ? `https://enka.network/u/${value}/` : `https://enka.network/zzz/${value}/`;
}

// A Steam Web API key shape, or a GitHub token prefix (spec §4.3). Variables are printed in the run log (R-14).
const SECRET_HEX = /^[0-9A-Fa-f]{32}$/;
const SECRET_PREFIXES = ['github_pat_', 'ghp_', 'gho_', 'ghu_', 'ghs_', 'ghr_'] as const;

export function looksLikeSecret(value: string): boolean {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  return SECRET_HEX.test(v) || SECRET_PREFIXES.some((p) => v.startsWith(p));
}

export type VarCheck = { ok: true; value: string } | { ok: false; reason: 'name' | 'secret' | 'format' };

function canonical(name: AccountVar, value: string): string | null {
  switch (name) {
    case 'ACCOUNT_GENSHIN_UID':
    case 'ACCOUNT_ZZZ_UID':
      return parseHoyoUid(value);
    case 'ACCOUNT_GENSHIN_NAME':
    case 'ACCOUNT_ZZZ_NAME':
    case 'ACCOUNT_STEAM_NAME': {
      const v = normalize(value);
      return v ? v : null;
    }
    case 'ACCOUNT_STEAM_ID64':
      return parseSteamId64(value);
    case 'ACCOUNT_RIOT_ID':
      return parseRiotId(value) ? normalize(value) : null;
  }
}

/** One variable write (manage chunk, Worker): the name, then the secret guard, then the per-field rule. */
export function validateVar(name: string, value: string): VarCheck {
  if (!(ACCOUNT_VARS as readonly string[]).includes(name)) return { ok: false, reason: 'name' };
  if (looksLikeSecret(value)) return { ok: false, reason: 'secret' };
  const v = typeof value === 'string' ? canonical(name as AccountVar, value) : null;
  return v === null ? { ok: false, reason: 'format' } : { ok: true, value: v };
}
