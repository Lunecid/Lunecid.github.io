// src/lib/news.ts — news entries → PATCH NOTES rows (home).
import type { Lang, UiKey } from '../i18n/ui';
import { formatDate, localizeHref, t } from '../i18n/utils';
import type { NewsData } from '../content/schemas';

export interface PatchNoteItem {
  dateIso: string;
  dateLabel: string;
  /** HUD version tag from the date: '2026-09-01' → 'v2026.09' (P1-9). */
  version: string;
  kindLabel: string;
  /** Short row title (the link); null when the entry has none: the sentence itself is then the title. */
  short: string | null;
  text: string;
  href: string | null;
}

/** '2026-09-01' → 'v2026.09'. */
export function patchVersion(dateIso: string): string {
  return `v${dateIso.slice(0, 4)}.${dateIso.slice(5, 7)}`;
}

const KIND_KEY = {
  research: 'news.kind.research',
  award: 'news.kind.award',
  site: 'news.kind.site',
} as const satisfies Record<NewsData['kind'], UiKey>;

/** Newest first (date desc), first `limit` (default 4); dateLabel = formatDate; version tag; kindLabel from ui news.kind.*; href localized. */
export function toPatchNotes(entries: readonly { data: NewsData }[], lang: Lang, limit = 4): PatchNoteItem[] {
  return [...entries]
    .sort((a, b) => b.data.date.localeCompare(a.data.date))
    .slice(0, limit)
    .map(({ data }) => ({
      dateIso: data.date,
      dateLabel: formatDate(data.date, lang),
      version: patchVersion(data.date),
      kindLabel: t(lang, KIND_KEY[data.kind]),
      short: data.short ? data.short[lang] : null,
      text: data.title[lang],
      href: data.href === null ? null : localizeHref(data.href, lang),
    }));
}
