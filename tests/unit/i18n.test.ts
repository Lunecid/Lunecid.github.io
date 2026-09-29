import { describe, expect, it } from 'vitest';
import { defaultLang, languages, ui, type UiKey } from '../../src/i18n/ui';
import {
  LOCALES,
  formatDate,
  formatDateSpan,
  formatNumber,
  formatPeriod,
  formatYm,
  formatYmLong,
  hangulRuns,
  langPrefix,
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
    expect(noticeKeys).toEqual(['notice.cognosphere', 'notice.riot', 'notice.zzzCopyright', 'notice.zzzLegalStatement']);
    for (const key of noticeKeys) expect(ui.en[key], key).toBe(ui.ko[key]);
    expect(ui.ko['notice.cognosphere']).toBe('© All rights reserved by COGNOSPHERE. Other properties belong to their respective owners.');
    expect(ui.ko['notice.riot']).toMatch(/^Seongeun Baek's portfolio isn't endorsed by Riot Games /);
  });

  it('contract §5.3 keys carry the agreed strings', () => {
    expect(ui.ko['nav.brandSr']).toBe('백성은 홈');
    expect(ui.en['action.fullSize']).toBe('View full size');
    expect(ui.ko['project.figure']).toBe('그림 {n}');
    expect(ui.en['projects.count']).toBe('{n} projects');
    expect(ui.ko['stats.notCollecting']).toBe('아직 방문 통계를 모으지 않습니다.');
    expect(ui.en['github.contributionsTotal']).toBe('{n} contributions in the last year');
    expect(ui.ko['news.kind.award']).toBe('수상');
    expect(ui.en['playerLog.gameAchievementsLocked']).toBe('Game achievements appear here once an account is linked.');
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
  it('otherLang, langPrefix and pick', () => {
    expect(otherLang('ko')).toBe('en');
    expect(otherLang('en')).toBe('ko');
    expect(langPrefix('ko')).toBe('');
    expect(langPrefix('en')).toBe('/en');
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
