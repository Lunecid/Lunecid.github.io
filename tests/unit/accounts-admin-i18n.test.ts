// AL-18: the management copy src/i18n/accounts-admin.ts (account-link spec §9.5, §4.7, §4.6). It sits outside ui.ts's
// ko/en pair checks, so it is checked here: equal key sets, matching placeholders, no Hangul in English, every error
// code and stage present, Korean sentences in the 합니다체/요청형 endings (label: keys are fragments and exempt), no
// digit literal or section sign, the spec's Korean strings verbatim, only ManagePanel imports it, and the visitor page
// in dist carries none of it.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { adminCopy, type AdminKey } from '../../src/i18n/accounts-admin';
import { ui } from '../../src/i18n/ui';

const ROOT = process.cwd();
const keys = (lang: 'ko' | 'en') => Object.keys(adminCopy[lang]).sort();
const entries = (lang: 'ko' | 'en') => Object.entries(adminCopy[lang]) as [AdminKey, string][];
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

/** Spec §4.7: every fixed code, the relay-unset notice and the fallback for unknown codes. */
const ERROR_KEYS = [
  'gh.denied', 'gh.state', 'gh.exchange', 'gh.not-owner', 'gh.no-access', 'gh.config', 'gh.upstream', 'gh.rate',
  'relay-unset', 'handle', 'ticket', 'forbidden', 'invalid', 'busy', 'rate', 'gh-perm', 'gh-rejected', 'dispatch',
  'upstream', 'config', 'unknown', 'steam.cancel', 'steam.invalid', 'steam.steam-busy', 'popup-blocked', 'network',
];
/** Spec §4.6: one line per stage. */
const STAGE_KEYS = ['stage.queued', 'stage.secrets-scan', 'stage.fetch-accounts', 'stage.build', 'stage.deploy', 'stage.fetch-health'];

describe('accounts-admin copy (spec §9.5)', () => {
  it('ko and en have the same keys, no empty value and the same placeholders per key', () => {
    expect(keys('en')).toEqual(keys('ko'));
    for (const lang of ['ko', 'en'] as const) for (const [key, value] of entries(lang)) expect(value.trim(), `${lang} ${key}`).not.toBe('');
    for (const [key, value] of entries('ko')) expect(placeholders(adminCopy.en[key]), key).toEqual(placeholders(value));
  });

  it('every error code of §4.7 (relay-unset and unknown included) and every stage of §4.6 has ko and en', () => {
    for (const key of [...ERROR_KEYS, ...STAGE_KEYS]) {
      expect(Object.hasOwn(adminCopy.ko, key), `ko ${key}`).toBe(true);
      expect(Object.hasOwn(adminCopy.en, key), `en ${key}`).toBe(true);
    }
  });

  it('no Hangul in English values', () => {
    for (const [key, value] of entries('en')) expect(value, key).not.toMatch(/[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/);
  });

  it('every Korean value that is not a label: fragment ends in 니다. or 세요.', () => {
    for (const [key, value] of entries('ko')) {
      if (key.startsWith('label:')) continue;
      expect(value, key).toMatch(/(니다|세요)\.$/);
    }
  });

  it('no value has a digit literal (digits inside a name such as SteamID64 pass) or a section sign', () => {
    // The plan's /(?<![A-Za-z])\d/ would flag the second digit of SteamID64; a digit run attached to a letter is a name.
    for (const lang of ['ko', 'en'] as const) {
      for (const [key, value] of entries(lang)) {
        expect(value, `${lang} ${key}`).not.toMatch(/(?<![A-Za-z\d])\d/);
        expect(value, `${lang} ${key}`).not.toContain('§');
      }
    }
  });

  it("the spec's Korean strings are verbatim (§4.1–§4.8, plan AL-18)", () => {
    const verbatim: Partial<Record<AdminKey, string>> = {
      owner: '사이트 주인 전용입니다. 사이트 주인의 GitHub 계정으로 로그인하지 않으면 아무것도 바꿀 수 없습니다.',
      notLinked: '아직 연동하지 않았습니다.',
      'state.unlinked': '아직 연동하지 않았거나 이번 빌드에서 데이터를 받지 못했습니다.',
      'state.error': '최근 빌드에서 데이터를 받지 못했습니다. 실행 기록의 요약에서 이유를 볼 수 있습니다.',
      'state.stale': '데이터가 오래되어 숨겼습니다.',
      'label:login': 'GitHub로 로그인',
      'label:sameTab': '같은 창에서 로그인',
      sameTabWarn: '저장하지 않은 변경이 사라집니다.',
      'label:loginAnyway': '그래도 로그인',
      'label:cancel': '취소',
      'label:status': 'GitHub 로그인됨 · Lunecid · {n}분 남음',
      'label:logout': '로그아웃',
      'label:perms': 'Variables 읽기: 가능 · Actions 읽기: 가능 · 쓰기는 저장·다시 빌드 때 확인됩니다',
      loginEnded: 'GitHub 로그인이 끝났습니다. 다시 로그인하면 저장할 수 있습니다.',
      idleWarn: '{n}분 뒤 GitHub 로그인이 끝납니다.',
      'label:stayIn': '계속 로그인',
      capWarn: '{n}분 뒤 로그인이 끝납니다. 지금 저장해 주세요.',
      steamNeedsLogin: 'GitHub에 로그인하면 Steam으로 연결할 수 있습니다.',
      steamHelp: 'Steam 로그인 창이 새로 열립니다. 비밀번호는 Steam 페이지에만 입력합니다.',
      'label:steamPublic': 'Steam: {name} · {id} · 프로필: 공개',
      'label:steamPrivate': 'Steam: {name} · {id} · 프로필: 비공개 — Steam 프로필을 공개로 두어야 합니다',
      'label:steamUnlink': 'Steam 연동 해제',
      steamIdHelp: 'Steam 프로필을 공개로 두어야 합니다. 게임 목록은 사이트 설정에서 켰을 때만 보입니다.',
      steamNameHelp: 'Steam 프로필 이름을 바꾸면 여기도 고쳐야 카드가 보입니다.',
      steamNameCache: 'Steam 이름을 방금 바꿨다면 {n}시간 뒤 다시 로그인하거나 직접 고쳐 주세요.',
      'label:enka': 'Enka.Network에서 확인',
      'label:opgg': 'op.gg에서 확인',
      'label:lolchess': 'lolchess.gg에서 확인',
      'label:newTab': '새 탭에서 열림',
      'label:unlinkConfirm': '이 계정 연동을 해제합니다',
      secret: '비밀값처럼 보입니다. 이 칸의 값은 공개 실행 기록에 남으므로 넣지 말아 주세요. 키는 GitHub Secrets에 직접 넣습니다.',
      'label:changed': '변경됨',
      'label:shown': '사이트에 표시 중',
      'label:notShown': '표시 안 됨',
      'label:save': '저장',
      saved: '저장했습니다. 모두 고친 뒤 [다시 빌드]를 눌러 주세요.',
      'gh.denied': 'GitHub 로그인을 취소했습니다.',
      'gh.state': '로그인 확인 시간이 지났거나 다른 창에서 시작된 로그인입니다. 다시 로그인해 주세요.',
      'gh.exchange': 'GitHub 로그인을 끝내지 못했습니다. 다시 시도해 주세요.',
      'gh.not-owner': '사이트 주인 계정이 아닙니다. 로그인한 GitHub 계정을 확인해 주세요.',
      'gh.no-access': 'GitHub App이 Lunecid.github.io에 설치되지 않았거나 권한이 부족합니다. README "연동 켜기"의 앱 설치 단계를 확인해 주세요.',
      'gh.config': '중계 서버 설정이 끝나지 않았습니다. README "연동 켜기"의 비밀 넣기 단계를 확인해 주세요.',
      'gh.upstream': 'GitHub가 응답하지 않아 로그인을 끝내지 못했습니다. 잠시 뒤 다시 로그인해 주세요.',
      'gh.rate': '로그인 시도가 너무 잦습니다. 잠시 뒤 다시 로그인해 주세요.',
      'relay-unset': '중계 서버 주소가 아직 설정되지 않았습니다. README "연동 켜기"의 Cloudflare 단계부터 마쳐 주세요. 그동안은 아래 "로그인 없이 하기"로 할 수 있습니다.',
      handle: 'GitHub 로그인이 끝났습니다. 다시 로그인해 주세요.',
      ticket: '로그인 확인 시간이 지났습니다. 다시 로그인해 주세요.',
      forbidden: '허용되지 않은 요청입니다.',
      invalid: '{field} 값이 형식에 맞지 않아 저장하지 않았습니다. 앞의 {n}개 항목은 저장했습니다.',
      busy: '이미 빌드가 진행 중입니다. 끝난 뒤 다시 눌러 주세요.',
      rate: '요청 한도에 도달했습니다. {time} 이후 다시 시도해 주세요.',
      'gh-perm': 'GitHub App 권한이 부족합니다. 앱 설정에서 Actions와 Variables를 Read and write로 두었는지 확인해 주세요.',
      'gh-rejected': 'GitHub가 값을 거부했습니다.',
      dispatch: '워크플로를 시작할 수 없습니다. 워크플로가 꺼져 있는지 확인해 주세요.',
      upstream: 'GitHub가 응답하지 않았습니다. 잠시 뒤 다시 시도해 주세요.',
      config: '중계 서버 설정이 끝나지 않았습니다. README "연동 켜기"의 비밀 넣기 단계를 확인해 주세요.',
      unknown: '알 수 없는 오류가 났습니다. 아래 "로그인 없이 하기"로 할 수 있습니다.',
      'steam.cancel': 'Steam 로그인을 끝내지 않았습니다.',
      'steam.invalid': 'Steam 로그인을 확인하지 못했습니다. 다시 시도하거나 SteamID64를 직접 넣어 주세요.',
      'steam.steam-busy': 'Steam이 지금 확인 요청을 받지 않습니다. 잠시 뒤 다시 시도하거나 SteamID64를 직접 넣어 주세요.',
      'popup-blocked': '팝업이 막혔습니다. 이 사이트의 팝업을 허용해 주세요.',
      network: '중계 서버에 연결하지 못했습니다. 아래 "로그인 없이 하기"로 할 수 있습니다.',
      'stage.queued': '앞선 배포가 끝나기를 기다리는 중입니다.',
      'stage.secrets-scan': '비밀값을 검사하는 중입니다.',
      'stage.fetch-accounts': '계정 데이터를 받는 중입니다.',
      'stage.build': '사이트를 만들고 검사하는 중입니다.',
      'stage.deploy': '배포하는 중입니다.',
      'stage.fetch-health': '외부 데이터 인증을 확인하는 중입니다.',
      'label:steps': '{done} / {total} 단계',
      'result.later': '배포는 끝났습니다. 잠시 뒤 새로 고침하면 보입니다.',
      'result.authFailed': '배포는 끝났습니다. 다만 외부 데이터 인증에 실패한 항목이 있습니다(STEAM_API_KEY, GH_PROFILE_TOKEN, GOATCOUNTER_TOKEN 중 하나). 실행 기록의 요약에서 확인해 주세요.',
      'result.steamHint': 'Steam이 표시되지 않았다면 STEAM_API_KEY를 먼저 확인해 주세요.',
      'result.failed': '빌드가 실패해 사이트는 이전 상태 그대로입니다. 테스트 실패일 수 있습니다.',
      'result.reasons': '실행 링크 → 왼쪽 Summary → 아래 "Account fetch" 표에서 이유를 볼 수 있습니다.',
      'result.loginEnded': '로그인이 끝나 진행 확인을 멈췄습니다. 실행 링크에서 결과를 볼 수 있습니다.',
      'label:rebuild': '다시 빌드',
      'label:refresh': '새로 고침',
      'label:checkResult': '결과 확인',
      'label:chip': '빌드 중 · {n}분',
      'label:game.shown': '{game} · 표시 중',
      'label:game.hidden': '{game} · 표시 안 됨',
      'label:noLogin': '로그인 없이 하기',
      ghInstall: 'gh를 설치하고 `gh auth login`을 한 번 실행해 주세요.',
      'label:psNote': 'Windows PowerShell 기준',
    };
    for (const [key, value] of Object.entries(verbatim)) expect(adminCopy.ko[key as AdminKey], key).toBe(value);
  });

  it("the spec's English strings where it gives them", () => {
    expect(adminCopy.en['label:login']).toBe('Sign in with GitHub');
    expect(adminCopy.en.steamNeedsLogin).toBe('Sign in with GitHub to connect Steam.');
    expect(adminCopy.en.steamHelp).toBe("A Steam sign-in window opens. You enter your password on Steam's page only.");
  });

  it('the "not official" help never claims a site is official', () => {
    expect(adminCopy.ko.checkHelp).toMatch(/공식 사이트가 아닌/);
    expect(adminCopy.ko.checkHelp.replace('공식 사이트가 아닌', '')).not.toContain('공식');
    expect(adminCopy.en.checkHelp).not.toMatch(/official/i);
  });

  it('only ManagePanel imports the management copy', () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
    const importers = walk(join(ROOT, 'src'))
      .filter((f) => /\.(ts|tsx|astro|mjs)$/.test(f) && /from\s+['"][./]*[\w/]*accounts-admin['"]/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(ROOT, f).split('\\').join('/'));
    expect(importers).toEqual(['src/islands/account/ManagePanel.tsx']);
  });

  // The page check needs a dist built from this tree: CI runs npm test before the build (no dist), and a dist older
  // than the management code would pass without proving anything, so both cases are skipped by name.
  const PAGES = { ko: 'dist/game/player-log/index.html', en: 'dist/en/game/player-log/index.html' } as const;
  const MANAGEMENT_SOURCES = ['src/i18n/accounts-admin.ts', 'src/islands/account/ManagePanel.tsx'];
  for (const lang of ['ko', 'en'] as const) {
    it(`the ${lang} visitor page in dist carries no management copy (skipped without a dist built after the management code)`, (ctx) => {
      const page = join(ROOT, PAGES[lang]);
      if (!existsSync(page)) ctx.skip(`no ${PAGES[lang]}`);
      const newest = Math.max(...MANAGEMENT_SOURCES.map((f) => statSync(join(ROOT, f)).mtimeMs));
      if (statSync(page).mtimeMs < newest) ctx.skip(`${PAGES[lang]} predates the management code: rebuild to check`);
      // Every stylesheet is inlined (inlineStylesheets: 'always'), the lazy panel's too: its selectors are not copy.
      const html = readFileSync(page, 'utf8').replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, '');
      // Visitor strings shared with ui.ts (e.g. 새 탭에서 열림) and short generic labels (저장 is inside 저장소; English
      // single words such as Cancel occur in prose) are not management text; every sentence and longer label is.
      const shared = new Set(Object.values(ui[lang]) as string[]);
      let checked = 0;
      for (const [key, value] of entries(lang)) {
        const generic = key.startsWith('label:') && ([...value].length < 6 || (lang === 'en' && !/\s/.test(value)));
        if (shared.has(value) || generic) continue;
        const literal = value.split(/\{\w+\}/).sort((a, b) => b.length - a.length)[0]?.trim() ?? '';
        if (literal.length < 4) continue;
        checked += 1;
        expect(html.includes(literal), `${lang} ${key}: "${literal}"`).toBe(false);
      }
      expect(checked).toBeGreaterThan(50);
    });
  }

  // The copy check above strips every <style>: that hides nothing only while the panel's stylesheet holds no text.
  it('ManagePanel.css carries no generated text (no content: with a string), so stripping <style> hides no copy', () => {
    const css = readFileSync(join(ROOT, 'src/islands/account/ManagePanel.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).not.toMatch(/\bcontent\s*:[^;}]*["']/);
  });
});
