// scripts/accounts/reasons.mjs — one ko/en sentence per AccountFailReason for the "Account fetch" step summary
// (account-link spec §5.3). Import-free. The texts name what the owner does; they never carry a value, URL or number
// (the summary sits in a public run log, R-14). name-mismatch, not-public, http-424 and no-key are the spec's texts.

/**
 * @typedef {'invalid-id' | 'no-name' | 'name-mismatch' | 'http-400' | 'http-404' | 'http-424' | 'http-429' | 'http-5xx'
 *   | 'timeout' | 'not-public' | 'bad-response' | 'auth' | 'no-key'} AccountFailReason
 */

/** @type {(ko: string, en: string) => Readonly<{ ko: string; en: string }>} */
const t = (ko, en) => Object.freeze({ ko, en });

/** @type {Readonly<Record<AccountFailReason, Readonly<{ ko: string; en: string }>>>} */
export const REASON_TEXT = Object.freeze({
  'invalid-id': t(
    '저장된 계정 ID가 형식에 맞지 않아 받지 않았습니다. 연동 관리에서 ID를 고쳐 주세요.',
    'The saved account ID has the wrong format, so nothing was fetched. Fix it in account management.',
  ),
  'no-name': t(
    '계정 ID는 있지만 신원 확인에 쓸 닉네임이 없습니다. 연동 관리에서 닉네임을 넣어 주세요.',
    'The account ID is set but the name for the identity check is missing. Add it in account management.',
  ),
  'name-mismatch': t(
    '입력한 닉네임과 게임에 보이는 닉네임이 다릅니다. 연동 관리에서 닉네임을 고쳐 주세요.',
    'The name you entered differs from the in-game name. Fix it in account management.',
  ),
  'http-400': t(
    '데이터 제공처가 요청을 받아들이지 않았습니다. 연동 관리에서 계정 ID를 확인해 주세요.',
    'The data source refused the request. Check the account ID in account management.',
  ),
  'http-404': t(
    '데이터 제공처에서 이 계정을 찾지 못했습니다. 연동 관리에서 계정 ID를 확인해 주세요.',
    'The data source could not find this account. Check the account ID in account management.',
  ),
  'http-424': t(
    'Enka.Network가 게임 점검 직후라 받지 못했습니다. 다음 예약 빌드에서 다시 시도합니다.',
    'Enka.Network was updating after game maintenance. The next scheduled build retries.',
  ),
  'http-429': t(
    '데이터 제공처의 요청 한도에 걸렸습니다. 다음 예약 빌드에서 다시 시도합니다.',
    "The data source's rate limit was reached. The next scheduled build retries.",
  ),
  'http-5xx': t(
    '데이터 제공처 서버에 오류가 났습니다. 다음 예약 빌드에서 다시 시도합니다.',
    'The data source had a server error. The next scheduled build retries.',
  ),
  timeout: t(
    '데이터 제공처가 제한 시간 안에 응답하지 않았습니다. 다음 예약 빌드에서 다시 시도합니다.',
    'The data source did not answer in time. The next scheduled build retries.',
  ),
  'not-public': t('Steam 프로필이 비공개입니다. 프로필을 공개로 바꿔 주세요.', 'The Steam profile is private. Make it public.'),
  'bad-response': t(
    '받은 응답의 형식이 예상과 달라 저장하지 않았습니다. 같은 오류가 이어지면 받기 스크립트를 점검해 주세요.',
    'The response did not have the expected shape, so nothing was stored. If this repeats, check the fetch script.',
  ),
  auth: t(
    'Steam이 STEAM_API_KEY를 거부했습니다. README "연동 켜기"의 Steam 키 단계대로 키를 다시 넣어 주세요.',
    'Steam rejected STEAM_API_KEY. Put a valid key into the account-fetch environment.',
  ),
  'no-key': t(
    'STEAM_API_KEY가 account-fetch 환경에 없습니다. README "연동 켜기"의 Steam 키 단계를 확인해 주세요.',
    'STEAM_API_KEY is missing from the account-fetch environment.',
  ),
});
