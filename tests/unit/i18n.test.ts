import { describe, expect, it } from 'vitest';
import { defaultLang, languages, ui, type UiKey } from '../../src/i18n/ui';
import { PLAYER_LOG_COPY_STATUS } from '../../src/data/copy/player-log-status';
import {
  LOCALES,
  formatDate,
  formatDateSpan,
  formatNumber,
  formatPeriod,
  formatYm,
  formatYmLong,
  hangulRuns,
  localizeHref,
  otherLang,
  pick,
  splitEntryId,
  switchLocalePath,
  t,
  useTranslations,
} from '../../src/i18n/utils';

const koKeys = Object.keys(ui.ko).sort();
const enKeys = Object.keys(ui.en).sort();
const placeholders = (s: string): string[] => (s.match(/\{\w+\}/g) ?? []).sort();

describe('ui.ts', () => {
  it('ko and en have identical key sets', () => {
    expect(koKeys).toEqual(enKeys);
    expect(Object.keys(languages)).toEqual(['ko', 'en']);
    expect(defaultLang).toBe('ko');
  });

  it('no empty strings', () => {
    for (const lang of LOCALES) {
      for (const [key, value] of Object.entries(ui[lang])) {
        expect(value.trim(), `${lang} ${key}`).not.toBe('');
      }
    }
  });

  it('placeholders match per key', () => {
    for (const key of koKeys as UiKey[]) {
      expect(placeholders(ui.en[key]), key).toEqual(placeholders(ui.ko[key]));
    }
  });

  it('notice.* strings are identical across locales', () => {
    const noticeKeys = (koKeys as UiKey[]).filter((k) => k.startsWith('notice.'));
    // PL-4 (named change): notice.blizzard and notice.riotAssets join the list
    expect(noticeKeys).toEqual(['notice.blizzard', 'notice.cognosphere', 'notice.riot', 'notice.riotAssets', 'notice.valve', 'notice.zzzCopyright', 'notice.zzzLegalStatement']);
    for (const key of noticeKeys) expect(ui.en[key], key).toBe(ui.ko[key]);
    expect(ui.ko['notice.cognosphere']).toBe('© All rights reserved by COGNOSPHERE. Other properties belong to their respective owners.');
    expect(ui.ko['notice.riot']).toMatch(/^Seongeun Baek's portfolio isn't endorsed by Riot Games /);
    // AL-9 (DV-7): the spec's Korean notice.valve sentence is split; notice.valve is the English trademark line.
    expect(ui.ko['notice.valve']).toBe('© Valve Corporation. Steam and the Steam logo are trademarks and/or registered trademarks of Valve Corporation in the U.S. and/or other countries.');
    expect(ui.ko['footer.valveDisclaimer']).toBe('Steam 데이터는 Steam Web API로 받아 있는 그대로 보여 드립니다. 이 사이트는 Valve와 제휴하거나 보증받지 않았습니다.');
    expect(ui.en['footer.valveDisclaimer']).not.toBe(ui.ko['footer.valveDisclaimer']);
  });

  it('AL-9: accounts.* values have no digit literal outside {…} placeholders (spec §9.5)', () => {
    const accountKeys = (koKeys as UiKey[]).filter((k) => k.startsWith('accounts.'));
    expect(accountKeys.length).toBeGreaterThan(40);
    for (const lang of LOCALES) {
      for (const key of accountKeys) {
        const bare = ui[lang][key].replace(/\{\w+\}/g, '');
        expect(/\d/.test(bare), `${lang} ${key}: "${ui[lang][key]}"`).toBe(false);
      }
    }
  });

  it('AL-9: the spec\'s Korean account strings are verbatim', () => {
    const ko: Partial<Record<UiKey, string>> = {
      'accounts.caption': '연동 계정',
      'accounts.game.genshin': '원신',
      'accounts.game.zzz': '젠레스 존 제로',
      'accounts.game.lol': '리그 오브 레전드',
      'accounts.game.tft': '전략적 팀 전투',
      'accounts.game.steam': 'Steam',
      'accounts.close': '닫기',
      'accounts.prev': '이전 계정: {game}',
      'accounts.next': '다음 계정: {game}',
      'accounts.position': '{n} / {total}',
      'accounts.fetchedAt': '기준 시각',
      'accounts.data': '데이터: {source}',
      'accounts.stat.ar': '모험 등급',
      'accounts.stat.achievements': '업적',
      'accounts.stat.abyss': '나선 비경',
      'accounts.stat.theater': '환상극',
      'accounts.stat.worldLevel': '세계 레벨',
      'accounts.stat.ikLevel': '인터노트 레벨',
      'accounts.stat.medal.1': '시유 방어전',
      'accounts.stat.medal.2': '모의 전투 타워',
      'accounts.stat.medal.3': '위험 강습',
      'accounts.stat.medal.4': '최후의 결전',
      'accounts.stat.steamLevel': 'Steam 레벨',
      'accounts.stat.ownedGames': '보유 게임',
      'accounts.stat.playtimeTotal': '총 플레이',
      'accounts.stat.playtime2w': '최근 {n}주',
      'accounts.value.abyss': '{floor}층 {chamber}방',
      'accounts.value.theater': '{act}막',
      'accounts.value.hours': '{n}시간',
      'accounts.teaser.genshin': 'AR {n}',
      'accounts.teaser.zzz': 'LV {n}',
      'accounts.teaser.steam': '{n} H',
      'accounts.teaser.lol': 'op.gg',
      'accounts.teaser.tft': 'lolchess.gg',
      'accounts.teaserSr.genshin': '모험 등급 {n}',
      'accounts.teaserSr.zzz': '인터노트 레벨 {n}',
      'accounts.teaserSr.steam': '총 플레이 {n}시간',
      'accounts.teaserSr.lol': 'op.gg 전적 링크',
      'accounts.teaserSr.tft': 'lolchess.gg 전적 링크',
      'accounts.riot.lol': 'LoL 전적 보기 (op.gg)',
      'accounts.riot.tft': 'TFT 전적 보기 (lolchess.gg)',
      'accounts.riot.external': '외부 전적 사이트로 이동합니다. 이 사이트와 관계가 없는 사이트이며 새 탭에서 열립니다.',
      'accounts.newTab': '새 탭에서 열림',
      'accounts.state.unlinked': '미연동',
      'accounts.state.error': '오류',
      'accounts.state.stale': '오래됨',
      'accounts.manage': '연동 관리',
      'accounts.unsaved': '저장하지 않은 변경이 있습니다.',
      'accounts.discard': '버리고 닫기',
      'accounts.keepEditing': '계속 편집',
      'accounts.avatarAlt': '{title} 프로필 이미지',
      'accounts.framed': '이 화면은 다른 페이지 안에서 열 수 없습니다.',
    };
    for (const [key, value] of Object.entries(ko)) expect(ui.ko[key as UiKey], key).toBe(value);
    for (const key of ['accounts.caption', 'accounts.teaser.genshin', 'accounts.teaser.zzz', 'accounts.teaser.steam', 'accounts.teaser.lol', 'accounts.teaser.tft'] as const) {
      expect(ui.en[key], key).toMatch(/^[\x20-\x7e]+$/);
    }
    expect(ui.en['accounts.caption']).toBe('LINKED ACCOUNTS');
    for (const key of (koKeys as UiKey[]).filter((k) => k.startsWith('accounts.'))) expect(ui.en[key], key).not.toMatch(/[가-힣]/);
  });

  it('contract §5.3 keys carry the agreed strings', () => {
    expect(ui.ko['nav.brandSr']).toBe('백성은 홈');
    expect(ui.en['action.fullSize']).toBe('View full size');
    expect(ui.ko['project.figure']).toBe('그림 {n}');
    expect(ui.en['projects.count']).toBe('{n} projects');
    expect(ui.ko['stats.notCollecting']).toBe('아직 방문 통계를 모으지 않습니다.');
    expect(ui.en['github.contributionsTotal']).toBe('{n} contributions in the last year');
    expect(ui.ko['news.kind.award']).toBe('수상');
    // PL-4 (named change): playerLog.gameAchievementsLocked is gone with the account-feed wait; the section title is the owner's
    expect(ui.ko['playerLog.gameAchievements']).toBe('내 게임 업적');
  });

  it("PL-4: notice.riotAssets is Riot's Legal Jibber Jabber sentence with the site's project title", () => {
    expect(ui.ko['notice.riotAssets']).toBe(
      'Seongeun Baek\'s portfolio was created under Riot Games\' "Legal Jibber Jabber" policy using assets owned by Riot Games. Riot Games does not endorse or sponsor this project.',
    );
    expect(ui.en['notice.riotAssets']).toBe(ui.ko['notice.riotAssets']);
    expect(ui.ko['notice.blizzard']).toMatch(/^Hearthstone and Blizzard Entertainment are trademarks or registered trademarks of Blizzard Entertainment, Inc\./);
    expect(Object.keys(ui.ko)).not.toContain('playerLog.gameAchievementsLocked');
  });

  it('PL-4: every registered key exists in ko and en', () => {
    const keys = Object.keys(PLAYER_LOG_COPY_STATUS) as UiKey[];
    expect(keys.length).toBeGreaterThanOrEqual(12);
    for (const key of keys) {
      expect(ui.ko[key], key).toBeTruthy();
      expect(ui.en[key], key).toBeTruthy();
      for (const lang of ['ko', 'en'] as const) expect(['owner', 'placeholder'], key).toContain(PLAYER_LOG_COPY_STATUS[key]?.[lang]);
    }
    for (const key of ['gameRecords.tier', 'gameRecords.rank', 'gameRecords.alt', 'gameRecords.dateCapture', 'gameRecords.dateSaved', 'gameRecords.evidence', 'gameRecords.viewerLabel', 'notice.blizzard', 'notice.riotAssets'] as const) {
      expect(keys, key).toContain(key);
    }
    expect(PLAYER_LOG_COPY_STATUS['playerLog.gameAchievements']).toEqual({ ko: 'owner', en: 'placeholder' });
  });
});

describe('t()', () => {
  it('t() replaces {n} and throws on a leftover placeholder', () => {
    expect(t('ko', 'project.figure', { n: 2 })).toBe('그림 2');
    expect(t('en', 'project.figure', { n: 2 })).toBe('Figure 2');
    expect(t('en', 'achievement.progress', { n: 3, total: 8 })).toBe('3 / 8 unlocked');
    expect(t('ko', 'nav.research')).toBe('연구');
    expect(() => t('ko', 'project.figure')).toThrow(/\{n\}/);
    expect(() => t('en', 'achievement.progress', { n: 1 })).toThrow(/\{total\}/);
  });

  it('useTranslations binds the language', () => {
    const tr = useTranslations('en');
    expect(tr('nav.projects')).toBe('Projects');
    expect(tr('records.hours', { n: 956 })).toBe('956 hours');
  });
});

describe('locale helpers', () => {
  it('otherLang and pick', () => {
    expect(otherLang('ko')).toBe('en');
    expect(otherLang('en')).toBe('ko');
    expect(pick({ ko: '연구', en: 'Research' }, 'en')).toBe('Research');
    expect(pick({ ko: 1, en: 2 }, 'ko')).toBe(1);
  });

  it('localizeHref table', () => {
    const cases = [
      ['/', 'en', '/en/'],
      ['/records/#job-fit', 'en', '/en/records/#job-fit'],
      ['/projects/kickick-park/', 'en', '/en/projects/kickick-park/'],
      ['/research/#in-progress', 'ko', '/research/#in-progress'],
      ['/en/projects/', 'en', '/en/projects/'],
      ['/cv/seongeun-baek-resume-ko.pdf', 'en', '/cv/seongeun-baek-resume-ko.pdf'],
      ['/og/home.png', 'en', '/og/home.png'],
      ['https://github.com/Lunecid', 'en', 'https://github.com/Lunecid'],
      ['mailto:todtjddms104204@pusan.ac.kr', 'en', 'mailto:todtjddms104204@pusan.ac.kr'],
      ['#job-fit', 'en', '#job-fit'],
      ['/game/records/#job-fit', 'en', '/en/game/records/#job-fit'],
    ] as const;
    for (const [href, lang, expected] of cases) expect(localizeHref(href, lang), `${href} (${lang})`).toBe(expected);
  });

  it('localizeHref leaves protocol-relative URLs and /en itself alone', () => {
    expect(localizeHref('//example.com/x/', 'en')).toBe('//example.com/x/');
    expect(localizeHref('/en/', 'en')).toBe('/en/');
    expect(localizeHref('/research/cog-2026-engagement/#bibtex', 'en')).toBe('/en/research/cog-2026-engagement/#bibtex');
  });

  it('switchLocalePath table', () => {
    const cases = [
      ['/', 'en', '/en/'],
      ['/en/', 'ko', '/'],
      ['/projects/sample-project/', 'en', '/en/projects/sample-project/'],
      ['/en/projects/sample-project', 'ko', '/projects/sample-project/'],
      ['/records/', 'en', '/en/records/'],
      ['/en/records/', 'ko', '/records/'],
      ['/en/data/', 'ko', '/data/'],
    ] as const;
    for (const [from, target, expected] of cases) expect(switchLocalePath(from, target), `${from} -> ${target}`).toBe(expected);
  });

  it('splitEntryId splits and rejects ids without a locale', () => {
    expect(splitEntryId('ko/kickick-park')).toEqual({ lang: 'ko', slug: 'kickick-park' });
    expect(splitEntryId('en/cog-2026-engagement')).toEqual({ lang: 'en', slug: 'cog-2026-engagement' });
    expect(() => splitEntryId('kickick-park')).toThrow('Entry id must start with a locale folder: kickick-park');
    expect(() => splitEntryId('ja/kickick-park')).toThrow(/locale folder/);
    expect(() => splitEntryId('ko/')).toThrow(/locale folder/);
  });
});

describe('formatters', () => {
  it('formatYm/formatDate/formatPeriod in both languages', () => {
    expect(formatYm('2025-05', 'ko')).toBe('2025.05');
    expect(formatYm('2025-05', 'en')).toBe('May 2025');
    expect(formatYm('2024-12', 'en')).toBe('Dec 2024');
    expect(formatDate('2025-07-11', 'ko')).toBe('2025.07.11');
    expect(formatDate('2025-07-11', 'en')).toBe('Jul 11, 2025');
    expect(formatDate('2026-09-01', 'en')).toBe('Sep 1, 2026');
    expect(formatPeriod('2025-05', '2025-07', 'ko')).toBe('2025.05 – 2025.07');
    expect(formatPeriod('2025-05', '2025-07', 'en')).toBe('May 2025 – Jul 2025');
    expect(formatPeriod('2025-03', null, 'ko')).toBe('2025.03 – 현재');
    expect(formatPeriod('2025-03', undefined, 'en')).toBe('Mar 2025 – Present');
    expect(formatPeriod('2025-03', '2027-02', 'ko', { expected: true })).toBe('2025.03 – 2027.02 (졸업 예정)');
    expect(formatPeriod('2025-03', '2027-02', 'en', { expected: true })).toBe('Mar 2025 – Feb 2027 (expected)');
  });

  it('formatYmLong: ko 2027년 2월, en February 2027', () => {
    expect(formatYmLong('2027-02', 'ko')).toBe('2027년 2월');
    expect(formatYmLong('2027-02', 'en')).toBe('February 2027');
    expect(formatYmLong('2025-12', 'en')).toBe('December 2025');
    expect(() => formatYmLong('2027-2', 'ko')).toThrow();
  });

  it('formatters reject malformed input instead of printing garbage', () => {
    expect(() => formatYm('2025-5', 'ko')).toThrow(/YYYY-MM/);
    expect(() => formatDate('2025-07', 'en')).toThrow(/YYYY-MM-DD/);
  });

  // batch 3b P2-32: the Academic CV's presentation date used to be a bare 'YYYY-MM-DD–DD' string, unlike every
  // other CV date (formatDate). formatDateSpan gives it the same one-formatter treatment.
  it('formatDateSpan: same-month span in one formatter, cross-month falls back to two formatDate calls', () => {
    expect(formatDateSpan('2026-09-01', '2026-09-04', 'ko')).toBe('2026.09.01–04');
    expect(formatDateSpan('2026-09-01', '2026-09-04', 'en')).toBe('Sep 1–4, 2026');
    expect(formatDateSpan('2026-09-30', '2026-10-02', 'en')).toBe('Sep 30, 2026 – Oct 2, 2026');
    expect(formatDateSpan('2026-09-30', '2026-10-02', 'ko')).toBe('2026.09.30 – 2026.10.02');
    expect(() => formatDateSpan('2026-09-1', '2026-09-04', 'en')).toThrow(/YYYY-MM-DD/);
  });

  it('formatNumber groups digits per locale', () => {
    expect(formatNumber(1093409, 'ko')).toBe('1,093,409');
    expect(formatNumber(1093409, 'en')).toBe('1,093,409');
    expect(formatNumber(0, 'en')).toBe('0');
  });
});

describe('hangulRuns (final review fix 1 item 20)', () => {
  it('on English pages splits Hangul runs out so they can carry lang="ko"; Korean pages get one run', () => {
    expect(hangulRuns('Try EN / KO at the top. On a phone, it is Menu → 한국어.', 'en')).toEqual([
      { text: 'Try EN / KO at the top. On a phone, it is Menu → ', ko: false },
      { text: '한국어', ko: true },
      { text: '.', ko: false },
    ]);
    expect(hangulRuns('두 언어 모두', 'en')).toEqual([{ text: '두 언어 모두', ko: true }]);
    expect(hangulRuns('No Korean here.', 'en')).toEqual([{ text: 'No Korean here.', ko: false }]);
    expect(hangulRuns('', 'en')).toEqual([{ text: '', ko: false }]);
    expect(hangulRuns('메뉴 → 한국어', 'ko')).toEqual([{ text: '메뉴 → 한국어', ko: false }]);
  });
});
