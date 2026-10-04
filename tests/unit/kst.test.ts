import { describe, expect, it } from 'vitest';
import { formatAsOfKst, kstIsoDate } from '../../src/lib/kst';

describe('kstIsoDate', () => {
  it('is the Asia/Seoul calendar day, not the UTC one', () => {
    expect(kstIsoDate(new Date('2026-12-15T14:59:59Z'))).toBe('2026-12-15'); // 23:59:59 KST
    expect(kstIsoDate(new Date('2026-12-15T15:00:00Z'))).toBe('2026-12-16'); // 00:00 KST the next day
  });

  it('rolls over the month, the year and a leap day', () => {
    expect(kstIsoDate(new Date('2026-09-30T15:00:00Z'))).toBe('2026-10-01');
    expect(kstIsoDate(new Date('2026-12-31T15:00:00Z'))).toBe('2027-01-01');
    expect(kstIsoDate(new Date('2028-02-28T15:00:00Z'))).toBe('2028-02-29');
  });

  it('matches the +9 hour shift the site used before (no DST in Korea)', () => {
    for (const iso of ['2026-01-01T00:00:00.000Z', '2026-06-30T20:15:00.000Z', '2026-10-04T15:00:00.000Z']) {
      expect(kstIsoDate(new Date(iso))).toBe(new Date(Date.parse(iso) + 9 * 3_600_000).toISOString().slice(0, 10));
    }
  });
});

describe('formatAsOfKst', () => {
  it('ko YYYY.MM.DD HH:MM KST and en Mon D, YYYY HH:MM KST', () => {
    expect(formatAsOfKst('2026-09-29T18:31:02Z', 'ko')).toBe('2026.09.30 03:31 KST');
    expect(formatAsOfKst('2026-09-29T18:31:02Z', 'en')).toBe('Sep 30, 2026 03:31 KST');
  });

  it('takes the day and the time from the same instant (midnight in Seoul)', () => {
    expect(formatAsOfKst('2026-01-05T14:59:00Z', 'en')).toBe('Jan 5, 2026 23:59 KST');
    expect(formatAsOfKst('2026-01-05T15:00:00Z', 'ko')).toBe('2026.01.06 00:00 KST');
  });
});
