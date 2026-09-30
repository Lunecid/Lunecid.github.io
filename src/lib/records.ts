// Helpers for /records/ (Tasks 23a/23b) and the résumé PDFs (Task 27 uses todayIso and isExpired).
// Plain module: no astro:* imports, so Node tests and src/lib/resume-model.ts can import it.
import type { AwardData, ProjectFrontmatter, ResumeData } from '../content/schemas';
import { AWARD_LEVEL_MEDAL } from '../data/award-levels';
import type { Lang } from '../i18n/ui';
import { formatDate, formatPeriod, formatYm, t } from '../i18n/utils';
import type { CertificateId } from '../types';
import { pageHref, paperBase, projectBase, type HrefContext } from './links';

/** Today's date as YYYY-MM-DD in Asia/Seoul (the build date: drives the TOEIC expiry badge and the PDFs). */
export function todayIso(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: 'year' | 'month' | 'day'): string => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** true when `today` (YYYY-MM-DD) is after `validUntil`; the last valid day is not expired; no date = never. */
export function isExpired(validUntil: string | undefined, today: string): boolean {
  return validUntil !== undefined && today > validUntil;
}

/** Drops items marked `records: false` (PDF-only entries such as "Korean — Native"). */
export function visibleOnRecords<T extends { records?: boolean }>(items: readonly T[]): T[] {
  return items.filter((item) => item.records !== false);
}

/** Page link of a skill's evidence (pageHref): the project page or the paper page of the version. */
export function evidenceHref(kind: 'project' | 'research', id: string, ctx: HrefContext): string {
  return pageHref(kind === 'project' ? projectBase(id) : paperBase(id), ctx);
}

export interface ProjectSummaryItem {
  /** null for a status 'card' project: it has no page (D-4), so the title is not a link. */
  href: string | null;
  title: string;
  period: string;
  org: string;
  team: string;
  summary: string;
}

/**
 * Rows of the /records/ project summary in the order of `refs` (RecordsView passes the version's
 * recordsProjectsOrder, P1-7b; all items, pdf flags ignored).
 * `projects` are the page language's collection entries (ids `<lang>/<slug>`).
 */
export function projectSummaryItems(
  refs: readonly { ref: string }[],
  projects: readonly { id: string; data: Pick<ProjectFrontmatter, 'title' | 'summary' | 'period' | 'org' | 'team' | 'status'> }[],
  ctx: HrefContext,
): ProjectSummaryItem[] {
  const lang = ctx.lang;
  return refs.map(({ ref }) => {
    const entry = projects.find((project) => project.id === `${lang}/${ref}`);
    if (!entry) throw new Error(`records: unknown project ref "${ref}" (${lang})`);
    const data = entry.data;
    return {
      href: data.status === 'card' ? null : pageHref(projectBase(ref), ctx),
      title: data.title,
      period: formatPeriod(data.period.start, data.period.end, lang),
      org: data.org,
      team: data.team,
      summary: data.summary,
    };
  });
}

/** Evidence link label: the project title (kind 'project') or the paper's short title (kind 'research') in the page language. */
export function evidenceLabel(
  kind: 'project' | 'research',
  id: string,
  lang: Lang,
  titles: { projects: Record<string, string>; stories: Record<string, string> },
): string {
  const label: string | undefined = kind === 'project' ? titles.projects[id] : titles.stories[id];
  if (label === undefined) throw new Error(`records: no title for ${kind} "${id}" (${lang})`);
  return label;
}

/** One education line for the profile blocks (home #hello, /records/ #profile): school · degree · period (P2-29). */
export function educationLine(
  e: Pick<ResumeData['education'][number], 'school' | 'degree' | 'start' | 'end' | 'expected'>,
  lang: Lang,
): string {
  return `${e.school[lang]} · ${e.degree[lang]} · ${formatPeriod(e.start, e.end, lang, { expected: e.expected })}`;
}

/** Activity date display (schema rule): end → period, 'YYYY' → as is, 'YYYY-MM' → formatYm. */
export function activityDate(a: { date: string; end?: string }, lang: Lang): string {
  if (a.end) return formatPeriod(a.date, a.end, lang);
  return a.date.length === 4 ? a.date : formatYm(a.date, lang);
}

export interface CredentialItem {
  primary: string;
  secondary?: string;
  meta?: string;
  badge?: string;
  /** Optional evidence URL (e.g. DACON competition record). Shown on /records/ only; PDFs omit the link. */
  href?: string;
}

/**
 * F-059 (P-08): the date column of a credential row as its ' · ' parts ('Dec 15, 2024', 'Valid until Dec 15, 2026'),
 * so CredentialList can keep each part on one line from 734px (a date never splits inside a part). No meta: [].
 */
export function metaSegments(item: Pick<CredentialItem, 'meta'>): string[] {
  return item.meta ? item.meta.split(' · ').filter((part) => part.trim() !== '') : [];
}

/** Items for the four CredentialList sections. Languages with `records: false` are PDF-only and skipped. */
export function credentialItems(
  resume: Pick<ResumeData, 'activities' | 'certifications' | 'languages' | 'training'>,
  lang: Lang,
  today: string,
): { activities: CredentialItem[]; certifications: CredentialItem[]; languages: CredentialItem[]; training: CredentialItem[] } {
  return {
    activities: resume.activities.map((a) => ({
      primary: a.text[lang],
      meta: activityDate(a, lang),
      ...(a.href ? { href: a.href } : {}),
    })),
    certifications: resume.certifications.map((c) => ({
      primary: c.name[lang],
      secondary: c.issuer[lang],
      meta: formatDate(c.date, lang),
    })),
    languages: visibleOnRecords(resume.languages).map((l) => {
      const meta = [
        l.date ? formatDate(l.date, lang) : null,
        l.validUntil ? t(lang, 'records.validUntil', { date: formatDate(l.validUntil, lang) }) : null,
      ]
        .filter((part): part is string => part !== null)
        .join(' · ');
      const expired = l.onExpire === 'mark' && isExpired(l.validUntil, today);
      return {
        primary: l.name[lang],
        secondary: l.level[lang],
        meta: meta || undefined,
        badge: expired ? t(lang, 'records.expired') : undefined,
      };
    }),
    training: resume.training.map((tr) => {
      const period = tr.start === tr.end ? formatYm(tr.start, lang) : formatPeriod(tr.start, tr.end, lang);
      return {
        primary: tr.name[lang],
        secondary: tr.org[lang],
        meta: tr.hours === undefined ? period : `${period} · ${t(lang, 'records.hours', { n: tr.hours })}`,
      };
    }),
  };
}

export interface AwardItem {
  id: CertificateId;
  title: string;
  contest: string;
  org: string;
  date: string;
  dateIso: string;
  medal: { tier: 'gold' | 'silver'; label: string };
  certHref: string | null;
  certWidth: number | null;
  certHeight: number | null;
  certSrcSet: string | null;
  certSizes: string | null;
  certAlt: string | null;
  certCaption: string | null;
  /** null when nothing on the certificate is hidden (P2-19): no caption then. */
  redactionNote: string | null;
  projectHref: string | null;
}

export interface AwardCertMeta {
  href: string;
  width: number;
  height: number;
  srcSet?: string;
  sizes?: string;
  alt: string;
  caption: string;
}

/** Award cards in resume.yaml `awards[]` order; certHref = the certificate's no-JS WebP link (null without an image). */
export function awardItems(
  refs: readonly { ref: CertificateId }[],
  awards: readonly AwardData[],
  ctx: HrefContext,
  certs: Partial<Record<CertificateId, string | AwardCertMeta>>,
): AwardItem[] {
  const lang = ctx.lang;
  return refs.map(({ ref }) => {
    const award = awards.find((a) => a.id === ref);
    if (!award) throw new Error(`records: unknown award ref "${ref}"`);
    const medal = AWARD_LEVEL_MEDAL[award.level];
    const cert = certs[award.id];
    const meta = typeof cert === 'string' ? { href: cert, width: null, height: null, srcSet: null, sizes: null, alt: null, caption: null } : cert ?? null;
    return {
      id: award.id,
      title: award.name[lang],
      contest: award.contest[lang],
      org: award.org[lang],
      date: formatDate(award.date, lang),
      dateIso: award.date,
      medal: { tier: medal.tier, label: medal.label[lang] },
      certHref: meta?.href ?? null,
      certWidth: meta && typeof meta.width === 'number' ? meta.width : null,
      certHeight: meta && typeof meta.height === 'number' ? meta.height : null,
      certSrcSet: meta && typeof meta.srcSet === 'string' ? meta.srcSet : null,
      certSizes: meta && typeof meta.sizes === 'string' ? meta.sizes : null,
      certAlt: meta && typeof meta.alt === 'string' ? meta.alt : null,
      certCaption: meta && typeof meta.caption === 'string' ? meta.caption : null,
      redactionNote: award.redactionNote ? award.redactionNote[lang] : null,
      projectHref: award.project ? pageHref(projectBase(award.project), ctx) : null,
    };
  });
}

export interface SkillItem {
  name: string;
  evidence: { label: string; href: string }[];
}

/**
 * Primary / familiar skills with evidence links labelled by project title or paper short title (no proficiency levels).
 * Evidence of kind 'code' links the publication's public code (`codes[id]`: external href + label), for skills the
 * paper page itself does not show.
 */
export function skillGroups(
  skills: Pick<ResumeData['skills'], 'primary' | 'familiar'>,
  ctx: HrefContext,
  titles: { projects: Record<string, string>; stories: Record<string, string>; codes?: Record<string, { href: string; label: string }> },
): { primary: SkillItem[]; familiar: SkillItem[] } {
  const lang = ctx.lang;
  const toEvidence = (e: ResumeData['skills']['primary'][number]['evidence'][number]): { label: string; href: string } => {
    if (e.kind === 'code') {
      const code = titles.codes?.[e.id];
      if (!code) throw new Error(`records: no code link for "${e.id}" (${lang})`);
      return { label: code.label, href: code.href };
    }
    return { label: evidenceLabel(e.kind, e.id, lang, titles), href: evidenceHref(e.kind, e.id, ctx) };
  };
  const toItem = (skill: ResumeData['skills']['primary'][number]): SkillItem => ({ name: skill.name, evidence: skill.evidence.map(toEvidence) });
  return { primary: skills.primary.map(toItem), familiar: skills.familiar.map(toItem) };
}
