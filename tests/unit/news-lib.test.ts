import { describe, expect, it } from 'vitest';
import type { NewsData } from '../../src/content/schemas';
import { formatDate } from '../../src/i18n/utils';
import { patchVersion, toPatchNotes } from '../../src/lib/news';

const items: { data: NewsData }[] = [
  {
    data: {
      date: '2025-07-11',
      kind: 'award',
      title: {
        ko: '2025 Big Data 활용 대회 빅데이터 분석 부문에서 최우수상(부산광역시장상)을 받았습니다.',
        en: 'Received the Top Excellence Award (Mayor of Busan Award) in the Big Data Analysis Division of the 2025 Big Data Utilization Contest.',
      },
      href: '/projects/school-zone-blindspots/',
    },
  },
  {
    data: {
      date: '2026-09-01',
      dateEnd: '2026-09-04',
      kind: 'research',
      title: { ko: 'IEEE CoG 2026에서 구두 발표했습니다.', en: 'Presented orally at IEEE CoG 2026.' },
      href: '/research/cog-2026-engagement/',
    },
  },
  { data: { date: '2024-03-12', kind: 'award', title: { ko: '오래된 소식', en: 'Old news' }, href: null } },
  { data: { date: '2026-10-01', kind: 'site', title: { ko: '사이트를 열었습니다.', en: 'Launched the site.' }, href: null } },
  { data: { date: '2026-06-18', kind: 'research', title: { ko: '논문이 채택되었습니다.', en: 'Paper accepted.' }, href: '/research/' } },
];

describe('toPatchNotes', () => {
  it('toPatchNotes sorts newest first, limits to 4 and localizes hrefs', () => {
    const ko = toPatchNotes(items, 'ko');
    expect(ko.map((n) => n.dateIso)).toEqual(['2026-10-01', '2026-09-01', '2026-06-18', '2025-07-11']);
    expect(ko.map((n) => n.kindLabel)).toEqual(['사이트', '연구', '연구', '수상']);
    expect(ko[3]).toEqual({
      dateIso: '2025-07-11',
      dateLabel: '2025.07.11',
      version: 'v2025.07',
      kindLabel: '수상',
      short: null,
      text: items[0]?.data.title.ko,
      href: '/projects/school-zone-blindspots/',
    });
    expect(ko[0]?.href).toBeNull();

    const en = toPatchNotes(items, 'en');
    expect(en.map((n) => n.href)).toEqual([null, '/en/research/cog-2026-engagement/', '/en/research/', '/en/projects/school-zone-blindspots/']);
    expect(en.map((n) => n.kindLabel)).toEqual(['Site', 'Research', 'Research', 'Award']);
    expect(en[3]?.dateLabel).toBe('Jul 11, 2025');
    expect(en.map((n) => n.dateLabel)).toEqual(en.map((n) => formatDate(n.dateIso, 'en')));
    expect(en[1]?.text).toBe('Presented orally at IEEE CoG 2026.');
  });

  it('P1-9: the version tag comes from the date and the short title from the entry when it has one', () => {
    expect(patchVersion('2026-09-01')).toBe('v2026.09');
    expect(patchVersion('2026-09-28', 1)).toBe('v2026.09.1');
    const withShort = [{ data: { ...items[1]!.data, short: { ko: 'CoG 2026 구두 발표', en: 'Oral at CoG 2026' } } }];
    expect(toPatchNotes(withShort, 'ko')[0]).toMatchObject({ version: expect.stringMatching(/v2026\.09(\.\d+)?/), short: 'CoG 2026 구두 발표', text: 'IEEE CoG 2026에서 구두 발표했습니다.' });
    expect(toPatchNotes(withShort, 'en')[0]?.short).toBe('Oral at CoG 2026');
  });

  it('P-01/F-094: later entries of a month get a sequence suffix, computed over all entries, so no two rows share a version', () => {
    const september = [...items, { data: { date: '2026-09-28', kind: 'site' as const, title: { ko: '사이트 개편', en: 'Site update' }, href: null } }];
    const shown = toPatchNotes(september, 'ko', 2);
    expect(shown.map((n) => [n.dateIso, n.version])).toEqual([['2026-10-01', 'v2026.10'], ['2026-09-28', 'v2026.09.1']]);
    const all = toPatchNotes(september, 'ko', september.length).map((n) => n.version);
    expect(new Set(all).size).toBe(all.length);
  });

  it('F-094: same-date entries are numbered by entry id, whatever the input order; the higher version is listed first', () => {
    const day = (id: string) => ({ id, data: { date: '2026-11-02', kind: 'site' as const, title: { ko: id, en: id }, href: null } });
    for (const input of [[day('a'), day('b')], [day('b'), day('a')]]) {
      expect(toPatchNotes(input, 'en').map((n) => [n.text, n.version])).toEqual([['b', 'v2026.11.1'], ['a', 'v2026.11']]);
    }
  });

  it('respects a custom limit and never reorders its input', () => {
    expect(toPatchNotes(items, 'ko', 2).map((n) => n.dateIso)).toEqual(['2026-10-01', '2026-09-01']);
    expect(items.map((i) => i.data.date)).toEqual(['2025-07-11', '2026-09-01', '2024-03-12', '2026-10-01', '2026-06-18']);
  });
});
