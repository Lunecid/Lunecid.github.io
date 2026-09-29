// src/lib/news.ts — news entries → PATCH NOTES rows (home).
import type { Lang, UiKey } from '../i18n/ui';
import { formatDate, localizeHref, t } from '../i18n/utils';
import type { NewsData } from '../content/schemas';

export interface PatchNoteItem {
  dateIso: string;
  dateLabel: string;
  /** HUD version tag from the date: '2026-09-01' → 'v2026.09' (P1-9); later entries of the same month get '.1', '.2', …
   *  (P-01/F-094), so no two rows share a version. */
  version: string;
  kindLabel: string;
  /** Short row title (the link); null when the entry has none: the sentence itself is then the title. */
  short: string | null;
  text: string;
  href: string | null;
}

/** '2026-09-01' → 'v2026.09'; with seq > 0 (the entry's place within its month, 0-based) → 'v2026.09.<seq>'. */
export function patchVersion(dateIso: string, seq = 0): string {
  const base = `v${dateIso.slice(0, 4)}.${dateIso.slice(5, 7)}`;
  return seq > 0 ? `${base}.${seq}` : base;
}

/**
 * P-01/F-094: the version of every entry, computed per month in date order over all entries (not only the shown slice):
 * the first entry of a month gets 'v2026.09', later ones 'v2026.09.1', '.2', … Same-date entries keep their input order.
 */
function patchVersions<T extends { data: NewsData }>(entries: readonly T[]): Map<T, string> {
  const seqByMonth = new Map<string, number>();
  const versions = new Map<T, string>();
  for (const entry of [...entries].sort((a, b) => a.data.date.localeCompare(b.data.date))) {
    const month = entry.data.date.slice(0, 7);
    const seq = seqByMonth.get(month) ?? 0;
    seqByMonth.set(month, seq + 1);
    versions.set(entry, patchVersion(entry.data.date, seq));
  }
  return versions;
}

const KIND_KEY = {
  research: 'news.kind.research',
  award: 'news.kind.award',
  site: 'news.kind.site',
} as const satisfies Record<NewsData['kind'], UiKey>;

/** Newest first (date desc), first `limit` (default 4); dateLabel = formatDate; version tag; kindLabel from ui news.kind.*; href localized. */
export function toPatchNotes(entries: readonly { data: NewsData }[], lang: Lang, limit = 4): PatchNoteItem[] {
  const versions = patchVersions(entries);
  return [...entries]
    .sort((a, b) => b.data.date.localeCompare(a.data.date))
    .slice(0, limit)
    .map((entry) => {
      const { data } = entry;
      return {
        dateIso: data.date,
        dateLabel: formatDate(data.date, lang),
        version: versions.get(entry) ?? patchVersion(data.date),
        kindLabel: t(lang, KIND_KEY[data.kind]),
        short: data.short ? data.short[lang] : null,
        text: data.title[lang],
        href: data.href === null ? null : localizeHref(data.href, lang),
      };
    });
}
