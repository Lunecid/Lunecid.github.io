// What each chooser cover shows (v6.2): the file's title and CTA (chooserCopy, verbatim), the version's tagline, a
// contents line made of that version's nav labels in nav order, and the foot line's year and host. Nothing else from
// the site reaches a cover: no evidence, award, metric or chart. Plain module (no astro:*), so Node tests import it.
import { SITE } from '../config';
import { chooserCopy } from '../data/copy/chooser';
import type { Lang, UiKey } from '../i18n/ui';
import { t } from '../i18n/utils';
import type { NavSection } from '../types';
import { VARIANTS } from '../variants';
import { homeHref } from './links';

export type CoverId = 'game' | 'data';

export interface CoverData {
  id: CoverId;
  lang: Lang;
  href: string;
  title: string;
  cta: string;
  tagline: string;
  contents: { num: string; label: string }[];
  foot: { year: string; host: string };
}

/** DOM and Tab order on the desk: the printout (data) lies in front at rest. */
export const COVER_ORDER: readonly CoverId[] = ['data', 'game'];

const NAV_LABEL: Readonly<Record<NavSection, UiKey>> = { research: 'nav.research', projects: 'nav.projects', records: 'nav.records', 'player-log': 'nav.playerLog' };

/** `today` is YYYY-MM-DD (todayIso), so the foot line's year matches NeutralFooter's. */
export function buildCover(id: CoverId, lang: Lang, today: string): CoverData {
  const variant = VARIANTS[id];
  const copy = chooserCopy[lang][id];
  return {
    id,
    lang,
    href: homeHref(lang, id),
    title: copy.title,
    cta: copy.cta,
    tagline: variant.identity.tagline[lang],
    contents: variant.nav.map((item, i) => ({ num: String(i + 1).padStart(2, '0'), label: t(lang, NAV_LABEL[item.key]) })),
    foot: { year: today.slice(0, 4), host: new URL(SITE.url).host },
  };
}
