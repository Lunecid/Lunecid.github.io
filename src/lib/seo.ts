import { SITE } from '../config';
import type { Lang } from '../i18n/ui';
import { otherLang, switchLocalePath } from '../i18n/utils';

/** '/' → 'home'; '/en/' → 'en/home'; '/projects/x/' → 'projects/x'; '/en/records/' → 'en/records'; '/404/' or '/404.html' → 'home'. */
export function ogSlugFor(pathname: string): string {
  const path = pathname.replace(/\.html$/, '').replace(/^\/+|\/+$/g, '');
  if (path === '' || path === '404' || path === 'en/404') return 'home';
  if (path === 'en') return 'en/home';
  return path;
}

/** Absolute URL of a page path, always with the trailing slash (trailingSlash: 'always'). */
export function canonicalUrl(pathname: string): string {
  const withSlash = pathname.endsWith('/') ? pathname : `${pathname}/`;
  return new URL(withSlash, SITE.url).href;
}

/** ko, en and x-default (= ko) alternates for a page path given in either language form. */
export function alternateLinks(pathname: string): { hreflang: 'ko' | 'en' | 'x-default'; href: string }[] {
  const ko = canonicalUrl(switchLocalePath(pathname, 'ko'));
  const en = canonicalUrl(switchLocalePath(pathname, 'en'));
  return [
    { hreflang: 'ko', href: ko },
    { hreflang: 'en', href: en },
    { hreflang: 'x-default', href: ko },
  ];
}

const PERSON = {
  name: { ko: '백성은', en: 'Seongeun Baek' },
  affiliation: {
    ko: '부산대학교 데이터사이언스전문대학원 데이터사이언스연구실(DataLab)',
    en: 'Data Science Lab (DataLab), Graduate School of Data Science, Pusan National University',
  },
} as const;

/** schema.org Person (spec §12): name everywhere; sameAs = GitHub + DACON + research ids that exist; jobTitle and url from the page (version headline or B-11 neutral title, A-25). */
export function personJsonLd(
  lang: Lang,
  page: { jobTitle: string; url: string },
  researchIds?: { scholar: string | null; orcid: string | null },
): Record<string, unknown> {
  const sameAs = [SITE.githubUrl, SITE.daconUrl, researchIds?.scholar ?? null, researchIds?.orcid ?? null].filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: PERSON.name[lang],
    alternateName: PERSON.name[otherLang(lang)],
    url: page.url,
    email: SITE.email,
    jobTitle: page.jobTitle,
    affiliation: { '@type': 'Organization', name: PERSON.affiliation[lang], url: SITE.labUrl },
    sameAs,
  };
}

/** Game trademarks that page URLs, hashes and <title>s never contain (Global Constraints → Routing and i18n). */
export const TRADEMARK_TERMS: readonly string[] = [
  '넥슨', 'NEXON', '메이플', 'MapleStory', '던전앤파이터', 'Dungeon & Fighter', '네오플', 'Neople',
  '원신', 'Genshin', '젠레스', 'Zenless', 'ZZZ',
  '리그 오브 레전드', 'League of Legends', 'LoL', 'Riot', '배틀그라운드', 'PUBG', 'Steam',
  'HoYoverse', '이터널 리턴', 'Eternal Return',
  'Hatsune Miku', '하츠네 미쿠', '初音ミク',
];

const ASCII = /^[\x20-\x7e]+$/;
const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Case-insensitive; URL separators (- _ . / #) count as spaces; Latin terms must stand alone ('Player Log' is not 'LoL'). */
export function containsTrademark(text: string): boolean {
  const haystack = text.toLowerCase().replace(/[-_./#]+/g, ' ');
  return TRADEMARK_TERMS.some((term) => {
    const needle = term.toLowerCase();
    if (!ASCII.test(term)) return haystack.includes(needle);
    return new RegExp(`(^|[^a-z0-9])${escapeRegExp(needle)}([^a-z0-9]|$)`).test(haystack);
  });
}
