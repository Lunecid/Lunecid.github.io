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
});
