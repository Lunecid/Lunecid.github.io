// Rights-holder notice lines per NoticeKey (moved from SiteFooter.astro in P2-1; SiteFooter and DataFooter share it).
// notice.* are verbatim English rights-holder texts; footer.fanContent and footer.valveDisclaimer are in the page language.
import type { UiKey } from '../i18n/utils';
import { NOTICE_KEYS, type NoticeKey } from '../types';

export interface NoticeLine {
  key: UiKey;
  english: boolean;
}

export const NOTICE_LINES: Readonly<Record<NoticeKey, readonly NoticeLine[]>> = {
  cognosphere: [{ key: 'notice.cognosphere', english: true }],
  'zzz-fan-guide': [
    { key: 'notice.zzzCopyright', english: true },
    { key: 'notice.zzzLegalStatement', english: true },
  ],
  'fan-content': [{ key: 'footer.fanContent', english: false }],
  riot: [{ key: 'notice.riot', english: true }],
  // AL-9 (plan DV-7): the spec's one Korean sentence is split so that notice.* stays identical in ko and en —
  // the English trademark line, then the localised as-is / non-affiliation line.
  valve: [
    { key: 'notice.valve', english: true },
    { key: 'footer.valveDisclaimer', english: false },
  ],
};

/** The lines of the given notices, always in NOTICE_KEYS order. */
export function noticeLines(notices: readonly NoticeKey[]): NoticeLine[] {
  return NOTICE_KEYS.filter((key) => notices.includes(key)).flatMap((key) => [...NOTICE_LINES[key]]);
}
