import type { DocumentId } from '../config';
import type { AwardData, ProjectFrontmatter, PublicationFrontmatter, ResumeData } from '../content/schemas';
import type { Lang } from '../i18n/ui';
import { formatDate, formatDateSpan, formatPeriod, formatYm, localizeHref, t } from '../i18n/utils';
import { isExpired } from './records';
import { canonicalUrl } from './seo';
import { parseOrderItem, type OrderItem } from '../variants/types';

export const DOC_LANG: Record<DocumentId, Lang> = { 'resume-ko': 'ko', 'resume-en': 'en', 'cv-academic': 'en' };
export const DOC_FLAG: Record<DocumentId, 'ko' | 'en' | 'academic'> = { 'resume-ko': 'ko', 'resume-en': 'en', 'cv-academic': 'academic' };
/** Task 0 Q20: (a) paper abstract, (b) Presentations section on the Academic CV. Facts only, never filler (§8 #21). */
export const ACADEMIC_EXTRAS: { abstract: boolean; presentations: boolean } = { abstract: true, presentations: true };

const FORMAT_LABEL: Record<Lang, Record<PublicationFrontmatter['format'], string>> = {
  ko: { Oral: '구두 발표', Poster: '포스터 발표', Journal: '학술지 논문', Workshop: '워크숍 논문' },
  en: { Oral: 'Oral presentation', Poster: 'Poster', Journal: 'Journal article', Workshop: 'Workshop paper' },
};

/**
 * Final review fix 1 item 11: the '↗ …' link label names what the linked page is. The CoG page is the paper (abstract)
 * page since D-15; a status 'published' project page is a case study; a status 'summary' page is a short summary.
 */
export type PageKind = 'paper' | 'case-study' | 'summary';
export const PAGE_LINK_LABEL: Record<Lang, Record<PageKind, string>> = {
  ko: { paper: '논문 페이지', 'case-study': '사례 연구', summary: '프로젝트 요약' },
  en: { paper: 'paper page', 'case-study': 'case study', summary: 'project summary' },
};

export interface ResumeModel {
  doc: DocumentId; lang: Lang; builtOn: string;
  header: { name: string; headline: string; email: string; github: string; site: string; location: string; affiliation: string };
  tagline: string;
  researchInterests: string[];
  education: { school: string; degree: string; period: string; gpa: string; lab: string | null; thesis: string | null }[];
  publications: { citation: string; note: string; code: string | null; abstract: string | null }[];
  presentations: { title: string; venue: string; format: string; presentedAt: string }[];
  researchInProgress: string[];
  projects: { title: string; org: string; period: string; team: string; bullets: string[]; caseStudyHref: string | null; pageLabel: string | null }[];
  /** PDF-only, résumé-ko only: one merged line for the two card-status, page-less projects (batch 3b P1-20). */
  projectsNote: string | null;
  awards: { name: string; contest: string; org: string; date: string }[];
  activities: { text: string; date: string }[];
  certifications: { name: string; issuer: string; date: string }[];
  languages: { name: string; level: string; date: string | null; validUntil: string | null; expired: boolean }[];
  training: { name: string; org: string; period: string; hours: string | null }[];
  skills: { primary: string[]; familiar: string[] };
}

export interface ResumeInputs {
  resume: ResumeData;
  projects: { slug: string; lang: Lang; data: Pick<ProjectFrontmatter, 'title' | 'summary' | 'period' | 'org' | 'team' | 'role' | 'status'> }[];
  publications: {
    id: string;
    data: Pick<
      PublicationFrontmatter,
      'title' | 'shortTitle' | 'authors' | 'venue' | 'venueShort' | 'year' | 'format' | 'statusNote' | 'code' | 'abstract' | 'presentedAt' | 'caseStudy'
    >;
  }[];
  awards: AwardData[];
  doc: DocumentId;
  today: string;
  academicExtras: { abstract: boolean; presentations: boolean };
  identity: { headline: string; tagline: string };
  order: readonly OrderItem[];
}

type Flags = { ko: boolean; en: boolean; academic: boolean };

/** Filters every list by pdf[DOC_FLAG[doc]]; order as in resume.yaml; throws on an unresolved ref. */
export function buildResumeModel(input: ResumeInputs): ResumeModel {
  const { resume, doc, today, academicExtras } = input;
  const lang = DOC_LANG[doc];
  const flag = DOC_FLAG[doc];
  const academic = doc === 'cv-academic';
  const flagged = <T extends { pdf: Flags }>(items: readonly T[]): T[] => items.filter((item) => item.pdf[flag]);

  const project = (slug: string) => {
    const hit = input.projects.find((p) => p.slug === slug && p.lang === lang);
    if (!hit) throw new Error(`resume-model: unknown project ref: ${slug} (${lang})`);
    return hit.data;
  };
  const publication = (id: string) => {
    const hit = input.publications.find((p) => p.id === id);
    if (!hit) throw new Error(`resume-model: unknown publication ref: ${id}`);
    return hit.data;
  };
  const award = (id: string) => {
    const hit = input.awards.find((a) => a.id === id);
    if (!hit) throw new Error(`resume-model: unknown award ref: ${id}`);
    return hit;
  };

  const p = resume.profile;
  const pubs = flagged(resume.publications).map((r) => publication(r.ref));

  // Projects section (batch 3b P1-20/P2-32): the CoG paper (if flagged for this doc) plus every flagged
  // projects-collection ref.
  const caseStudyLink = (href: string | undefined | null): string | null => (href ? canonicalUrl(localizeHref(href, lang)) : null);
  // A-17: the version's pdfProjectOrder decides the order (the game list equals the old end-month sort); a row appears
  // when its pdf flag is set for this document, and every flagged row must be in the order list.
  const refRow = (r: ResumeData['projects'][number]): ResumeModel['projects'][number] => {
    const d = project(r.ref);
    return {
      title: d.title,
      org: d.org,
      period: formatPeriod(d.period.start, d.period.end, lang),
      team: d.team,
      bullets: r.resume ? r.resume[lang] : [d.summary, d.role],
      caseStudyHref: d.status === 'card' ? null : caseStudyLink(`/projects/${r.ref}/`),
      pageLabel: d.status === 'card' ? null : PAGE_LINK_LABEL[lang][d.status === 'summary' ? 'summary' : 'case-study'],
    };
  };
  const pp = resume.publicationProject;
  const pubRow = (): ResumeModel['projects'][number] => {
    if (!pp) throw new Error('resume-model: no publicationProject');
    const d = publication(pp.pub);
    return {
      title: d.shortTitle ? d.shortTitle[lang] : d.title,
      org: `${d.venueShort} · ${FORMAT_LABEL[lang][d.format]}`,
      period: formatPeriod(pp.period.start, pp.period.end, lang),
      team: pp.team[lang],
      bullets: pp.resume[lang],
      caseStudyHref: caseStudyLink(d.caseStudy),
      pageLabel: d.caseStudy ? PAGE_LINK_LABEL[lang].paper : null,
    };
  };
  const listed = new Set<string>(input.order);
  for (const r of resume.projects) if (r.pdf[flag] && !listed.has(`project:${r.ref}`)) throw new Error(`resume-model: ${doc} order misses project:${r.ref}`);
  if (pp && pp.pdf[flag] && !listed.has(`pub:${pp.pub}`)) throw new Error(`resume-model: ${doc} order misses pub:${pp.pub}`);
  const projectRows: ResumeModel['projects'] = input.order.flatMap((item) => {
    const ref = parseOrderItem(item);
    if (ref.kind === 'pub') {
      if (!pp || pp.pub !== ref.id) throw new Error(`resume-model: order item ${item} has no publicationProject`);
      return pp.pdf[flag] ? [pubRow()] : [];
    }
    const r = resume.projects.find((x) => x.ref === ref.slug);
    if (!r) throw new Error(`resume-model: order item ${item} is not in resume.yaml projects`);
    return r.pdf[flag] ? [refRow(r)] : [];
  });

  return {
    doc,
    lang,
    builtOn: formatDate(today, lang),
    header: {
      name: p.name[lang],
      headline: input.identity.headline,
      email: p.email,
      github: `github.com/${p.github}`,
      site: p.site.replace(/^https?:\/\//, '').replace(/\/$/, ''),
      location: p.location[lang],
      affiliation: p.affiliation[lang],
    },
    tagline: input.identity.tagline,
    researchInterests: p.researchInterests.pdf[flag] ? p.researchInterests.items.map((i) => i[lang]) : [],
    education: flagged(resume.education).map((e) => ({
      school: e.school[lang],
      degree: e.degree[lang],
      period: formatPeriod(e.start, e.end, lang, { expected: e.expected }),
      gpa: `${e.gpa.value}/${e.gpa.scale}`,
      lab: e.lab ? e.lab[lang] : null,
      thesis: e.thesis && e.thesis.pdf[flag] ? e.thesis[lang] : null,
    })),
    publications: pubs.map((d) => ({
      citation: `${d.authors.map((a) => a.name).join(', ')}. “${d.title}.” ${d.venue}, ${d.year}.`,
      note: [FORMAT_LABEL[lang][d.format], d.statusNote?.[lang]].filter((x): x is string => Boolean(x)).join(' · '),
      code: d.code,
      abstract: academic && academicExtras.abstract ? d.abstract : null,
    })),
    presentations:
      academic && academicExtras.presentations
        ? pubs
            .filter((d) => d.format === 'Oral' && d.presentedAt)
            .map((d) => ({
              title: d.title,
              venue: d.venue,
              format: FORMAT_LABEL.en.Oral,
              // One formatter for every CV date (P2-32): the venue name plus formatDateSpan, not a bare string.
              presentedAt: d.presentedAt ? `${d.presentedAt.venue} · ${formatDateSpan(d.presentedAt.start, d.presentedAt.end, 'en')}` : '',
            }))
        : [],
    researchInProgress: flagged(resume.researchInProgress).map((r) => r.text[lang]),
    projects: projectRows,
    projectsNote: resume.projectsNote && resume.projectsNote.pdf[flag] ? resume.projectsNote.ko : null,
    awards: flagged(resume.awards).map((r) => {
      const a = award(r.ref);
      return { name: a.name[lang], contest: a.contest[lang], org: a.org[lang], date: formatDate(a.date, lang) };
    }),
    activities: flagged(resume.activities).map((a) => ({
      text: a.text[lang],
      date: a.end ? formatPeriod(a.date, a.end, lang) : a.date.length === 4 ? a.date : formatYm(a.date, lang),
    })),
    certifications: flagged(resume.certifications).map((c) => ({ name: c.name[lang], issuer: c.issuer[lang], date: formatDate(c.date, lang) })),
    languages: flagged(resume.languages).map((l) => ({
      name: l.name[lang],
      level: l.level[lang],
      date: l.date ? formatDate(l.date, lang) : null,
      validUntil: l.validUntil ? formatDate(l.validUntil, lang) : null,
      expired: l.onExpire === 'mark' && isExpired(l.validUntil, today),
    })),
    training: flagged(resume.training).map((x) => ({
      name: x.name[lang],
      org: x.org[lang],
      period: x.start === x.end ? formatYm(x.start, lang) : formatPeriod(x.start, x.end, lang),
      hours: x.hours === undefined ? null : t(lang, 'records.hours', { n: x.hours }),
    })),
    skills: resume.skills.pdf[flag]
      ? { primary: resume.skills.primary.map((s) => s.name), familiar: resume.skills.familiar.map((s) => s.name) }
      : { primary: [], familiar: [] },
  };
}
