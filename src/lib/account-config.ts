// src/lib/account-config.ts — committed fetch settings (spec §5.3). Import-free, erasable TypeScript only: the
// fetch-accounts job has no npm dependencies and cannot read favorites.yaml, so these switches live here.

export const STEAM_SHOW_GAMES: boolean = false; // Steam '게임 세부 정보'를 공개로 둔 뒤에만 true (spec §6.5; AL-24 after OWNER 8-4)
export const STEAM_GAME_FILTER: { readonly mode: 'exclude' | 'allow'; readonly appIds: readonly number[] } = { mode: 'exclude', appIds: [] }; // Q5: exclude list
export const STEAM_TOP_GAMES = 3;
export const STEAM_XML_CACHE_HOURS = 1; // steamcommunity.com ?xml=1 Cache-Control max-age=3600 (spec §5.7.3, confirmed 2026-09-29)
/** 미확인 maxima (spec §3.3, §14): null = show the value without a denominator until the owner confirms (OQ-4, AL-24). */
export const METRIC_MAX: { readonly ar: number | null; readonly abyssStars: number | null; readonly worldLevel: number | null; readonly ikLevel: number | null } = { ar: null, abyssStars: null, worldLevel: null, ikLevel: null };
/** 미확인 ZZZ medal Value units per MedalType (spec §6.3): a type without a confirmed unit is not shipped. */
export const MEDAL_UNITS: Readonly<Partial<Record<1 | 2 | 3 | 4, 'score' | 'stars'>>> = {};
export const ACCOUNT_MAX_AGE_DAYS = 7;
export const FREE_TEXT_MAX = 40;
