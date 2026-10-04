import { describe, expect, it } from 'vitest';
import { NOTICE_LINES, noticeLines } from '../../src/lib/notices';
import { NOTICE_KEYS } from '../../src/types';

describe('noticeLines (P2-1: shared by SiteFooter and DataFooter)', () => {
  it('returns the lines of the given notices in NOTICE_KEYS order', () => {
    expect(noticeLines(['riot', 'cognosphere'])).toEqual([...NOTICE_LINES.cognosphere, ...NOTICE_LINES.riot]);
    expect(noticeLines([])).toEqual([]);
  });
  it('has lines for every notice key; the rights-holder texts are English, the fan-content line is not', () => {
    for (const key of NOTICE_KEYS) expect(NOTICE_LINES[key].length, key).toBeGreaterThan(0);
    expect(NOTICE_LINES['fan-content']).toEqual([{ key: 'footer.fanContent', english: false }]);
    expect(NOTICE_LINES.riot).toEqual([{ key: 'notice.riot', english: true }]);
  });
  it('AL-9 (DV-7): valve = the English trademark line, then the localised as-is/non-affiliation line; NOTICE_KEYS order', () => {
    expect(noticeLines(['valve'])).toEqual([
      { key: 'notice.valve', english: true },
      { key: 'footer.valveDisclaimer', english: false },
    ]);
    // PL-4 (named change): riot-assets and blizzard join the list
    expect(NOTICE_KEYS).toEqual(['cognosphere', 'zzz-fan-guide', 'fan-content', 'riot', 'valve', 'riot-assets', 'blizzard']);
    expect(noticeLines(['valve', 'cognosphere', 'riot'])).toEqual([...NOTICE_LINES.cognosphere, ...NOTICE_LINES.riot, ...NOTICE_LINES.valve]);
  });
  it('PL-4: riot-assets and blizzard are one English line each', () => {
    expect(NOTICE_LINES['riot-assets']).toEqual([{ key: 'notice.riotAssets', english: true }]);
    expect(NOTICE_LINES.blizzard).toEqual([{ key: 'notice.blizzard', english: true }]);
    expect(noticeLines(['blizzard', 'riot-assets', 'cognosphere'])).toEqual([...NOTICE_LINES.cognosphere, ...NOTICE_LINES['riot-assets'], ...NOTICE_LINES.blizzard]);
  });
});
