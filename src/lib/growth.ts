// The growth infographic's model (src/data/growth.ts): a pure builder over the fact collections, so vitest checks every
// derived value against its source and ResearchView passes the result to GrowthQuestLog / GrowthReport.
import type { AwardData, ProjectFrontmatter, PublicationFrontmatter, ResumeData } from '../content/schemas';
import { growthCopy, growthFuture, growthPairings, growthSteps, type GrowthLevel, type GrowthStepDef } from '../data/growth';
import { overallAuc } from '../data/research/cog-2026';
import { RESEARCH_STATUS, WORKING_TITLE, researchPage } from '../data/research-page';
import type { Lang } from '../i18n/ui';
import { formatDate, formatYm, type Localized } from '../i18n/utils';
import { FORMAT_PHRASE, resolveFacts, type FactSource } from './facts';

export interface GrowthInputs {
  /** One language's projects (slug + frontmatter). */
  projects: readonly { slug: string; data: ProjectFrontmatter | Omit<ProjectFrontmatter, 'cover' | 'figures'> }[];
  awards: readonly AwardData[];
  resume: Pick<ResumeData, 'activities' | 'publicationProject' | 'education' | 'profile'>;
  publications: readonly { id: string; data: Pick<PublicationFrontmatter, 'shortTitle' | 'venueShort' | 'format' | 'presentation' | 'authors'> }[];
  facts: FactSource;
}

export type GrowthAwardKind = 'award' | 'rank' | 'talk';

export interface GrowthScalePoint { value: number; label: string; unit: string; approx: boolean }

export interface GrowthStep {
  id: string;
  /** 'YYYY-MM' of the start (and end), for ordering and the axis. */
  start: string;
  end: string;
  period: string;
  title: string;
  sub: string | null;
  org: string;
  type: string;
  team: { size: number; label: string } | null;
  role: { level: GrowthLevel; name: string; text: string };
  /** Teammates' tools (teamTools) or the co-author: never the owner's skill. */
  teamPart: { label: string; text: string } | null;
  /** The modelling or analysis that was not the owner's, labelled 팀원 담당 or 팀 작업. */
  teamNote: { label: string; text: string } | null;
  method: { level: GrowthLevel; name: string; text: string } | null;
  data: string | null;
  scale: GrowthScalePoint[];
  award: { kind: GrowthAwardKind; name: string; sub: string | null } | null;
}

export interface GrowthStage { n: 1 | 2 | 3; years: string; head: string; items: GrowthStep[] }
/** An open slot: a short title, the work's own title under it (tentative ones behind "가제"), the status. */
export interface GrowthFuture { id: string; title: string; sub: string | null; status: string; kind: 'inProgress' | 'planned' }

type Pick1<T> = T extends Localized<infer U> ? U : T extends object ? { [K in keyof T]: Pick1<T[K]> } : T;
export type GrowthCopy = Pick1<typeof growthCopy>;

export interface GrowthModel {
  lang: Lang;
  copy: GrowthCopy;
  years: { start: string; end: string };
  steps: GrowthStep[];
  future: GrowthFuture[];
  stages: GrowthStage[];
  scaleTicks: { value: number; label: string }[];
  /** log10 domain of the scale lane. */
  scaleDomain: [number, number];
}

const isLocalized = (v: unknown): v is Localized<unknown> =>
  typeof v === 'object' && v !== null && 'ko' in v && 'en' in v && Object.keys(v).length === 2;

/** The copy in one language, every token resolved. */
function pickCopy<T>(value: T, lang: Lang, facts: FactSource): Pick1<T> {
  if (isLocalized(value)) {
    const v = value[lang];
    return (typeof v === 'string' ? resolveFacts(v, lang, facts) : v) as Pick1<T>;
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, pickCopy(v, lang, facts)])) as Pick1<T>;
  }
  return value as Pick1<T>;
}

/** A number as the site writes it: '240,064', '약 100만', '~1M'. Throws on anything else (no guessing). */
export function parseSiteNumber(text: string): number {
  const t = text.trim().replace(/^(약|~)\s*/, '');
  let m = /^(\d{1,3}(?:,\d{3})*|\d+)$/.exec(t);
  if (m) return Number(m[1]?.replace(/,/g, ''));
  m = /^(\d+(?:\.\d+)?)\s*(만|억|K|M)$/.exec(t);
  if (m) return Number(m[1]) * { 만: 1e4, 억: 1e8, K: 1e3, M: 1e6 }[m[2] as '만' | '억' | 'K' | 'M'];
  throw new Error(`growth: "${text}" is not a number the site states`);
}

const span = (start: string, end: string, lang: Lang): string =>
  start === end ? formatYm(start, lang) : `${formatYm(start, lang)}–${formatYm(end, lang)}`;

function teamOf(label: string): { size: number; label: string } {
  const n = /^(\d+)/.exec(label);
  if (!n) throw new Error(`growth: team "${label}" has no size`);
  return { size: Number(n[1]), label };
}

/** The resume activity text split into title, task and rank; the parts re-join to the text exactly (tests). */
function splitActivity(text: string, lang: Lang): { title: string; sub: string; rank: string } {
  const m = (lang === 'ko' ? /^(.+?)\((.+?)\) (.+)$/ : /^(.+?), (.+?) — (.+)$/).exec(text);
  if (!m) throw new Error(`growth: activity "${text}" does not split into title, task and rank`);
  return { title: m[1] ?? '', sub: m[2] ?? '', rank: m[3] ?? '' };
}

function stepFrom(def: GrowthStepDef, input: GrowthInputs, lang: Lang, copy: GrowthCopy): GrowthStep {
  const res = (l: Localized | undefined): string | null => (l ? resolveFacts(l[lang], lang, input.facts) : null);
  const base = {
    id: def.id,
    teamNote: def.teamNote ? { label: copy[def.teamNoteBy ?? 'teamPart'], text: res(def.teamNote) ?? '' } : null,
    data: res(def.data),
    scale: (def.scale ?? []).map((p) => {
      const label = resolveFacts(p.token, lang, input.facts);
      return { value: parseSiteNumber(label), label, unit: p.unit[lang], approx: /^(약|~)/.test(label) };
    }),
  };
  const role = (text: string) => ({ level: def.role, name: copy.role[def.role], text });
  const method = (text: string | null) =>
    def.method === null ? null : { level: def.method, name: copy.method[def.method], text: text ?? copy.method[def.method] };

  if (def.source.kind === 'project') {
    const { slug } = def.source;
    const p = input.projects.find((x) => x.slug === slug)?.data;
    if (!p) throw new Error(`growth: no project ${slug}`);
    const end = p.period.end ?? p.period.start;
    const award = p.award ? input.awards.find((a) => a.id === p.award?.certificate) : undefined;
    if (p.award && !award) throw new Error(`growth: ${slug} award ${p.award.certificate} is not in awards.yaml`);
    return {
      ...base,
      start: p.period.start,
      end,
      period: span(p.period.start, end, lang),
      title: p.title,
      sub: null,
      org: p.org,
      type: p.type,
      team: teamOf(p.team),
      role: role(p.role),
      teamPart: p.teamTools ? { label: copy.teamPart, text: p.teamTools.join(' · ') } : null,
      method: method(res(def.methodText)),
      award: award ? { kind: 'award', name: award.name[lang], sub: `${award.org[lang]} · ${formatDate(award.date, lang)}` } : null,
    };
  }

  if (def.source.kind === 'activity') {
    const { id } = def.source;
    const act = input.resume.activities.find((a) => a.id === id);
    if (!act) throw new Error(`growth: no resume activity ${id}`);
    const parts = splitActivity(act.text[lang], lang);
    const end = act.end ?? act.date;
    return {
      ...base,
      start: act.date,
      end,
      period: span(act.date, end, lang),
      title: parts.title,
      sub: parts.sub,
      org: res(def.org) ?? '',
      type: res(def.type) ?? '',
      team: null,
      role: role(res(def.roleText) ?? ''),
      teamPart: null,
      method: method(res(def.methodText)),
      award: { kind: 'rank', name: parts.rank, sub: null },
    };
  }

  const { id } = def.source;
  const pub = input.publications.find((x) => x.id === id)?.data;
  const pp = input.resume.publicationProject;
  if (!pub || pp?.pub !== id) throw new Error(`growth: publication ${id} needs resume.yaml publicationProject`);
  const lab = input.resume.education.find((e) => e.expected)?.lab?.[lang];
  const best = overallAuc.find((r) => r.highlight);
  const [, ...where] = (pub.presentation?.[lang] ?? '').split(' · ');
  return {
    ...base,
    start: pp.period.start,
    end: pp.period.end,
    period: span(pp.period.start, pp.period.end, lang),
    title: pub.shortTitle?.[lang] ?? '',
    sub: pub.venueShort,
    org: lab ?? '',
    type: res(def.type) ?? '',
    team: { size: pub.authors.length, label: pp.team[lang] },
    role: role(res(def.roleText) ?? ''),
    teamPart: { label: copy.coAuthor, text: input.resume.profile.advisor[lang] },
    method: method(`${growthPairings[lang](overallAuc.length)} + ${res(def.methodText) ?? ''}${best ? ` (${best.model})` : ''}`),
    award: { kind: 'talk', name: `${pub.venueShort} ${FORMAT_PHRASE[lang][pub.format]}`, sub: where.length ? where.join(' · ') : null },
  };
}

const COMPACT: Record<Lang, Intl.NumberFormat> = {
  ko: new Intl.NumberFormat('ko-KR', { notation: 'compact' }),
  en: new Intl.NumberFormat('en-US', { notation: 'compact' }),
};

export function buildGrowth(input: GrowthInputs, lang: Lang): GrowthModel {
  const copy = pickCopy(growthCopy, lang, input.facts);
  const steps = growthSteps.map((def) => stepFrom(def, input, lang, copy));
  for (let i = 1; i < steps.length; i++) {
    const a = steps[i - 1];
    const b = steps[i];
    if (a && b && (a.start > b.start || (a.start === b.start && a.end > b.end))) throw new Error(`growth: ${b.id} is out of time order`);
  }

  const future = growthFuture.map((f): GrowthFuture => {
    const ongoing = researchPage.ongoing.find((o) => o.id === f.ongoing);
    if (!ongoing) throw new Error(`growth: no research-page ongoing item ${f.ongoing}`);
    const short = 'label' in ongoing ? ongoing.label[lang] : null;
    const title = f.label?.[lang] ?? short ?? resolveFacts(ongoing.title[lang], lang, input.facts);
    const work = 'workTitle' in ongoing ? ongoing.workTitle : null;
    const sub = work ? (work.tentative ? `${WORKING_TITLE[lang]}: ${work.text[lang]}` : work.text[lang]) : null;
    return { id: f.id, title, sub, status: RESEARCH_STATUS[ongoing.state][lang], kind: ongoing.state };
  });

  const stageOf = (lv: GrowthLevel): 1 | 2 | 3 => (lv <= 2 ? 1 : lv === 3 ? 2 : 3);
  const stages = ([1, 2, 3] as const).map((n): GrowthStage => {
    const items = steps.filter((s) => s.team !== null && stageOf(s.role.level) === n);
    const y0 = items.map((s) => s.start.slice(0, 4)).sort()[0] ?? '';
    const y1 = items.map((s) => s.end.slice(0, 4)).sort().at(-1) ?? '';
    return { n, years: y0 === y1 ? y0 : `${y0}–${y1}`, head: copy.stages[n], items };
  });

  const values = steps.flatMap((s) => s.scale.map((p) => p.value));
  const top = Math.ceil(Math.log10(Math.max(...values)));
  const ticks = [];
  for (let e = 4; e <= top; e++) ticks.push({ value: 10 ** e, label: COMPACT[lang].format(10 ** e) });

  return {
    lang,
    copy,
    years: { start: steps[0]?.start.slice(0, 4) ?? '', end: steps.at(-1)?.end.slice(0, 4) ?? '' },
    steps,
    future,
    stages,
    scaleTicks: ticks,
    scaleDomain: [4, top + 0.15],
  };
}
