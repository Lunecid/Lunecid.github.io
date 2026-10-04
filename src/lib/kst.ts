// Asia/Seoul dates, written once. The site shows build and fetch dates in Korea Standard Time (no DST) whatever the
// machine's own zone is. Plain module: no astro:* imports, so Node tests and src/lib files can import it.
import type { Lang } from '../i18n/ui';
import { formatDate } from '../i18n/utils';

/** The Asia/Seoul calendar day of `d` as YYYY-MM-DD. */
export function kstIsoDate(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const part = (type: 'year' | 'month' | 'day'): string => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** 'YYYY.MM.DD HH:MM KST' (ko) / 'Mon D, YYYY HH:MM KST' (en) for an ISO timestamp, in Asia/Seoul. */
export function formatAsOfKst(iso: string, lang: Lang): string {
  const d = new Date(iso);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  return `${formatDate(kstIsoDate(d), lang)} ${time} KST`;
}
