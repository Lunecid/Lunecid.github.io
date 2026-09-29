// src/i18n/utils.ts — every locale helper lives here (strings live in ./ui.ts).
import { ui, type Lang, type UiKey } from './ui';

export type { Lang, UiKey };
export type Localized<T = string> = { ko: T; en: T };
export const LOCALES: readonly Lang[] = ['ko', 'en'];

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const MONTHS_EN_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;
const EXPECTED_SUFFIX: Localized = { ko: ' (졸업 예정)', en: ' (expected)' };
const PLACEHOLDER = /\{(\w+)\}/g;

export function otherLang(lang: Lang): Lang {
  return lang === 'ko' ? 'en' : 'ko';
}

/** ui[lang][key] with {name} placeholders replaced; throws on an unknown placeholder left in the output. */
export function t(lang: Lang, key: UiKey, vars?: Record<string, string | number>): string {
  const template: string = ui[lang][key];
  const out = template.replace(PLACEHOLDER, (match: string, name: string) =>
    vars !== undefined && Object.hasOwn(vars, name) ? String(vars[name]) : match,
  );
  const leftover = /\{\w+\}/.exec(out);
  if (leftover) throw new Error(`t(${lang}, ${key}): no value for ${leftover[0]}`);
  return out;
}

export function useTranslations(lang: Lang): (key: UiKey, vars?: Record<string, string | number>) => string {
  return (key, vars) => t(lang, key, vars);
}

export function pick<T>(value: Localized<T>, lang: Lang): T {
  return value[lang];
}

export function langPrefix(lang: Lang): '' | '/en' {
  return lang === 'en' ? '/en' : '';
}

/**
 * Adds '/en' to Korean-based internal page links on English pages.
 * Only hrefs whose pathname starts with '/', is not already '/en' or '/en/…', and ends with '/' get the prefix
 * (files such as /cv/*.pdf or /og/*.png, external URLs, mailto: and bare #hash links are returned unchanged).
 */
export function localizeHref(href: string, lang: Lang): string {
  if (lang === 'ko') return href;
  if (!href.startsWith('/') || href.startsWith('//')) return href;
  const cut = href.search(/[?#]/);
  const pathname = cut === -1 ? href : href.slice(0, cut);
  if (pathname === '/en' || pathname.startsWith('/en/')) return href;
  if (!pathname.endsWith('/')) return href;
  return `/en${href}`;
}

/** '/' -> en '/en/'; '/en/projects/x' -> ko '/projects/x/'. Assumes trailingSlash: 'always'. */
export function switchLocalePath(pathname: string, target: Lang): string {
  const withSlash = pathname.endsWith('/') ? pathname : `${pathname}/`;
  const bare = withSlash.startsWith('/en/') ? withSlash.slice(3) : withSlash;
  return target === 'ko' ? bare : `/en${bare}`;
}

/** 'ko/kickick-park' -> { lang: 'ko', slug: 'kickick-park' }. */
export function splitEntryId(id: string): { lang: Lang; slug: string } {
  const [head, ...rest] = id.split('/');
  const slug = rest.join('/');
  if ((head !== 'ko' && head !== 'en') || slug === '') {
    throw new Error(`Entry id must start with a locale folder: ${id}`);
  }
  return { lang: head, slug };
}

function parseYm(ym: string): { year: string; month: number } {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(ym);
  if (!m) throw new Error(`formatYm: expected YYYY-MM, got '${ym}'`);
  return { year: m[1] as string, month: Number(m[2]) };
}

/** '2025-05' -> ko '2025.05', en 'May 2025'. */
export function formatYm(ym: string, lang: Lang): string {
  const { year, month } = parseYm(ym);
  return lang === 'ko' ? `${year}.${String(month).padStart(2, '0')}` : `${MONTHS_EN[month - 1]} ${year}`;
}

/** '2027-02' -> ko '2027년 2월', en 'February 2027' (fact token {person.graduation}). */
export function formatYmLong(ym: string, lang: Lang): string {
  const { year, month } = parseYm(ym);
  return lang === 'ko' ? `${year}년 ${month}월` : `${MONTHS_EN_LONG[month - 1]} ${year}`;
}

/** '2025-07-11' -> ko '2025.07.11', en 'Jul 11, 2025' (string parsing, no Date/time zone). */
export function formatDate(iso: string, lang: Lang): string {
  const m = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.exec(iso);
  if (!m) throw new Error(`formatDate: expected YYYY-MM-DD, got '${iso}'`);
  const [, year, month, day] = m as unknown as [string, string, string, string];
  return lang === 'ko' ? `${year}.${month}.${day}` : `${MONTHS_EN[Number(month) - 1]} ${Number(day)}, ${year}`;
}

/** '2025-05','2025-07' -> ko '2025.05 – 2025.07', en 'May 2025 – Jul 2025'; end null -> '… – 현재' / '… – Present'; expected adds ' (졸업 예정)' / ' (expected)'. */
export function formatPeriod(start: string, end: string | null | undefined, lang: Lang, opts?: { expected?: boolean }): string {
  const to = end === null || end === undefined ? t(lang, 'records.present') : formatYm(end, lang);
  const suffix = opts?.expected === true ? EXPECTED_SUFFIX[lang] : '';
  return `${formatYm(start, lang)} – ${to}${suffix}`;
}

/**
 * Same-month day span with one formatter (batch 3b P2-32: the Academic CV's presentation date used a bare
 * 'YYYY-MM-DD–DD' string while every other CV date ran through formatDate).
 * '2026-09-01','2026-09-04' -> ko '2026.09.01–04', en 'Sep 1–4, 2026'.
 * Different months/years fall back to two formatDate calls: '2026.09.01 – 2026.10.02' / 'Sep 1, 2026 – Oct 2, 2026'.
 */
export function formatDateSpan(startIso: string, endIso: string, lang: Lang): string {
  const re = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
  const s = re.exec(startIso);
  const e = re.exec(endIso);
  if (!s || !e) throw new Error(`formatDateSpan: expected YYYY-MM-DD, got '${startIso}'/'${endIso}'`);
  const [, sy, sm, sd] = s as unknown as [string, string, string, string];
  const [, ey, em, ed] = e as unknown as [string, string, string, string];
  if (sy === ey && sm === em) {
    return lang === 'ko' ? `${sy}.${sm}.${sd}–${ed}` : `${MONTHS_EN[Number(sm) - 1]} ${Number(sd)}–${Number(ed)}, ${sy}`;
  }
  return `${formatDate(startIso, lang)} – ${formatDate(endIso, lang)}`;
}

/** ko-KR / en-US digit grouping. */
export function formatNumber(n: number, lang: Lang): string {
  return new Intl.NumberFormat(lang === 'ko' ? 'ko-KR' : 'en-US').format(n);
}

/**
 * Final review fix 1 item 20 (WCAG 3.1.2): text split into runs so that, on an English page, each run of Hangul
 * (e.g. the Korean menu label "한국어" in an English hint) can be marked lang="ko". Korean pages get one run.
 */
export function hangulRuns(text: string, lang: Lang): { text: string; ko: boolean }[] {
  if (lang === 'ko') return [{ text, ko: false }];
  const runs: { text: string; ko: boolean }[] = [];
  let last = 0;
  for (const match of text.matchAll(/\p{Script=Hangul}+(?:\s+\p{Script=Hangul}+)*/gu)) {
    const at = match.index ?? 0;
    if (at > last) runs.push({ text: text.slice(last, at), ko: false });
    runs.push({ text: match[0], ko: true });
    last = at + match[0].length;
  }
  if (last < text.length || runs.length === 0) runs.push({ text: text.slice(last), ko: false });
  return runs;
}
