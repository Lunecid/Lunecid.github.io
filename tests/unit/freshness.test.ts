import { describe, expect, it, vi } from 'vitest';
import { isFresh } from '../../src/lib/freshness';

const DAY = 86_400_000;
const NOW = Date.parse('2026-09-26T00:00:00.000Z');
const at = (ms: number): string => new Date(ms).toISOString();

describe('isFresh', () => {
  it('isFresh: missing, future, exactly maxAgeDays, older', () => {
    expect(isFresh(undefined, NOW)).toBe(false);
    expect(isFresh({}, NOW)).toBe(false);
    expect(isFresh({ fetchedAt: 'not a date', maxAgeDays: 7 }, NOW)).toBe(false);
    // more than 5 minutes in the future: rejected
    expect(isFresh({ fetchedAt: at(NOW + 10 * 60_000), maxAgeDays: 7 }, NOW)).toBe(false);
    // within 5 minutes of clock skew: accepted
    expect(isFresh({ fetchedAt: at(NOW + 60_000), maxAgeDays: 7 }, NOW)).toBe(true);
    // exactly maxAgeDays old is still fresh, one millisecond more is not
    expect(isFresh({ fetchedAt: at(NOW - 7 * DAY), maxAgeDays: 7 }, NOW)).toBe(true);
    expect(isFresh({ fetchedAt: at(NOW - 7 * DAY - 1), maxAgeDays: 7 }, NOW)).toBe(false);
    expect(isFresh({ fetchedAt: at(NOW - 20 * DAY), maxAgeDays: 30 }, NOW)).toBe(true);
  });

  it('defaults maxAgeDays to 7 when it is missing or not a finite number', () => {
    expect(isFresh({ fetchedAt: at(NOW - 6 * DAY) }, NOW)).toBe(true);
    expect(isFresh({ fetchedAt: at(NOW - 8 * DAY) }, NOW)).toBe(false);
    expect(isFresh({ fetchedAt: at(NOW - 8 * DAY), maxAgeDays: Number.NaN }, NOW)).toBe(false);
    expect(isFresh({ fetchedAt: at(NOW - 6 * DAY), maxAgeDays: Number.NaN }, NOW)).toBe(true);
  });

  it('uses the current time when now is omitted', () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    try {
      expect(isFresh({ fetchedAt: at(NOW - DAY), maxAgeDays: 7 })).toBe(true);
      expect(isFresh({ fetchedAt: at(NOW - 9 * DAY), maxAgeDays: 7 })).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
