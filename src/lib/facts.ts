// src/lib/facts.ts — fact tokens (R-4, contract §3): '{awards.count:top}' in copy → the common frame's value per
// language. Pure module (no astro:* imports): views, OG, JSON-LD, PDFs and tests resolve copy through it. Resolution
// never takes a version, so the same token yields the same string on both versions (spec §1 success criterion 3).
import type { AwardData, ProjectFrontmatter, PublicationFrontmatter, ResumeData } from '../content/schemas';
import { AWARD_LEVEL_NAME } from '../data/award-levels';
import { caseTokens } from '../data/research/cog-2026-case';
import type { Lang } from '../i18n/ui';
import { formatNumber, formatYm, formatYmLong, type Localized } from '../i18n/utils';
import { AWARD_LEVELS } from '../types';

/** token := '{' path [ ':' arg ] '}' ; path := segment ( '.' segment )* ; segment := [A-Za-z0-9][A-Za-z0-9-]* ; arg := [a-z0-9-]+ */
export const FACT_TOKEN = /\{([A-Za-z0-9][A-Za-z0-9-]*(?:\.[A-Za-z0-9][A-Za-z0-9-]*)*)(?::([a-z0-9-]+))?\}/g;

/** CA-7: the resolver reads only these fields, so Astro entries (ImageMetadata) and zod-string fixtures both fit. */
export interface FactInputs {
  resume: ResumeData;
  awards: AwardData[];
  publications: { id: string; data: Pick<PublicationFrontmatter, 'venueShort' | 'year' | 'format' | 'shortTitle' | 'facts'> }[];
  projects: { slug: string; lang: Lang; data: Pick<ProjectFrontmatter, 'title' | 'facts'> }[];
}

/** Normalized snapshot of every token value; build it only with buildFactSource. Keys are 'path' or 'path:arg'. */
export interface FactSource {
  readonly values: ReadonlyMap<string, Localized>;
}

/** Job-fit table scope (§3.2 `table.*`). */
export interface FactContext {
  table?: { count: number; years: string };
}

/** CA-5: format phrases, shared by {pub.<id>.format} and the CoG card sticker. */
export const FORMAT_PHRASE: Readonly<Record<Lang, Readonly<Record<PublicationFrontmatter['format'], string>>>> = {
  ko: { Oral: '구두 발표', Poster: '포스터 발표', Journal: '학술지 논문', Workshop: '워크숍 논문' },
  en: { Oral: 'oral presentation', Poster: 'poster presentation', Journal: 'journal article', Workshop: 'workshop paper' },
};

/** Every token name the resolver accepts, as patterns (docs and lint). */
export const FACT_TOKEN_PATTERNS: readonly string[] = [
  'person.name', 'person.graduation', 'person.graduationShort', 'person.affiliation',
  'edu.<id>.school', 'edu.<id>.degree', 'edu.<id>.startYear',
  'awards.count:<level>', 'awards.name:<level>',
  'award.<id>.name', 'award.<id>.contest', 'award.<id>.year',
  'pub.<id>.venueShort', 'pub.<id>.venueAbbr', 'pub.<id>.year', 'pub.<id>.shortTitle', 'pub.<id>.format', 'pub.<id>.fact.<key>',
  'project.<slug>.title', 'project.<slug>.fact.<key>',
  'cert.<id>.short', 'cert.<id>.name',
  'case.<key>',
  'table.count', 'table.years',
];

/** CA-5: the education entry with expected: true, else the one with the latest end month. */
export function graduationEntry<T extends { end: string; expected: boolean }>(education: readonly T[]): T {
  const expected = education.find((e) => e.expected);
  if (expected) return expected;
  const latest = [...education].sort((a, b) => b.end.localeCompare(a.end))[0];
  if (!latest) throw new Error('facts: resume.yaml has no education entry');
  return latest;
}

export function buildFactSource(input: FactInputs): FactSource {
  const values = new Map<string, Localized>();
  const put = (key: string, value: Localized): void => {
    if (values.has(key)) throw new Error(`facts: duplicate token ${key}`);
    values.set(key, value);
  };
  const same = (text: string): Localized => ({ ko: text, en: text });
  const { resume, awards } = input;

  put('person.name', resume.profile.name);
  put('person.affiliation', resume.profile.affiliation);
  const grad = graduationEntry(resume.education);
  put('person.graduation', { ko: formatYmLong(grad.end, 'ko'), en: formatYmLong(grad.end, 'en') });
  put('person.graduationShort', { ko: formatYmLong(grad.end, 'ko'), en: formatYm(grad.end, 'en') });
  for (const e of resume.education) {
    put(`edu.${e.id}.school`, e.school);
    put(`edu.${e.id}.degree`, e.degree);
    put(`edu.${e.id}.startYear`, same(e.start.slice(0, 4)));
  }

  for (const level of AWARD_LEVELS) {
    const n = awards.filter((a) => a.level === level).length;
    put(`awards.count:${level}`, { ko: formatNumber(n, 'ko'), en: formatNumber(n, 'en') });
    put(`awards.name:${level}`, AWARD_LEVEL_NAME[level]);
  }
  for (const a of awards) {
    put(`award.${a.id}.name`, a.name);
    put(`award.${a.id}.contest`, a.contest);
    put(`award.${a.id}.year`, same(a.date.slice(0, 4)));
  }

  for (const { id, data } of input.publications) {
    put(`pub.${id}.venueShort`, same(data.venueShort));
    put(`pub.${id}.venueAbbr`, same(data.venueShort.replace(/^IEEE /, '')));
    put(`pub.${id}.year`, same(String(data.year)));
    put(`pub.${id}.format`, { ko: FORMAT_PHRASE.ko[data.format], en: FORMAT_PHRASE.en[data.format] });
    if (data.shortTitle) put(`pub.${id}.shortTitle`, data.shortTitle);
    for (const [key, value] of Object.entries(data.facts ?? {})) put(`pub.${id}.fact.${key}`, value);
  }

  for (const slug of [...new Set(input.projects.map((p) => p.slug))]) {
    const of = (lang: Lang) => {
      const hit = input.projects.find((p) => p.slug === slug && p.lang === lang);
      if (!hit) throw new Error(`facts: project ${slug} has no ${lang} entry`);
      return hit.data;
    };
    const ko = of('ko');
    const en = of('en');
    put(`project.${slug}.title`, { ko: ko.title, en: en.title });
    for (const key of new Set([...Object.keys(ko.facts ?? {}), ...Object.keys(en.facts ?? {})])) {
      const k = ko.facts?.[key];
      const e = en.facts?.[key];
      if (!k || !e) throw new Error(`facts: project ${slug} fact "${key}" must exist in both the ko and the en file`);
      put(`project.${slug}.fact.${key}`, { ko: k.ko, en: e.en });
    }
  }

  for (const c of resume.certifications) {
    put(`cert.${c.id}.name`, c.name);
    put(`cert.${c.id}.short`, c.short ?? c.name);
  }
  // The case-study overlay's numbers (src/data/research/cog-2026-case.ts), formatted per language.
  for (const [key, value] of Object.entries(caseTokens())) put(`case.${key}`, value);
  return { values };
}

export class UnknownFactTokenError extends Error {
  readonly token: string;
  readonly text: string;
  constructor(token: string, text: string) {
    super(`Unknown fact token ${token} in "${text}" (known patterns: FACT_TOKEN_PATTERNS in src/lib/facts.ts)`);
    this.name = 'UnknownFactTokenError';
    this.token = token;
    this.text = text;
  }
}

function lookup(path: string, arg: string | undefined, lang: Lang, src: FactSource, ctx: FactContext | undefined): string | undefined {
  if (path === 'table.count') return arg === undefined && ctx?.table ? formatNumber(ctx.table.count, lang) : undefined;
  if (path === 'table.years') return arg === undefined && ctx?.table ? ctx.table.years : undefined;
  return src.values.get(arg === undefined ? path : `${path}:${arg}`)?.[lang];
}

/** Replaces every token; throws UnknownFactTokenError on an unknown token and on a stray '{' or '}'. */
export function resolveFacts(text: string, lang: Lang, src: FactSource, ctx?: FactContext): string {
  const stray = /[{}]/.exec(text.replace(FACT_TOKEN, ''));
  if (stray) throw new UnknownFactTokenError(stray[0], text);
  return text.replace(FACT_TOKEN, (whole: string, path: string, arg: string | undefined) => {
    const value = lookup(path, arg, lang, src, ctx);
    if (value === undefined) throw new UnknownFactTokenError(whole, text);
    return value;
  });
}

export function factResolver(src: FactSource, lang: Lang, ctx?: FactContext): (text: string) => string {
  return (text) => resolveFacts(text, lang, src, ctx);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function mapStrings(value: unknown, fn: (text: string, key: string | null) => string, key: string | null): unknown {
  if (typeof value === 'string') return fn(value, key);
  if (Array.isArray(value)) return value.map((item) => mapStrings(item, fn, key));
  if (isPlainObject(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mapStrings(v, fn, k)]));
  return value;
}

/** Resolves every string leaf of a copy object (arrays and plain objects; other values untouched). */
export function resolveDeep<T>(value: T, lang: Lang, src: FactSource, ctx?: FactContext): T {
  return mapStrings(value, (text) => resolveFacts(text, lang, src, ctx), null) as T;
}

/** CA-6: a string under a 'ko'/'en' key (or in an array under one) resolves in that language; other strings stay. */
export function resolveLocalizedDeep<T>(value: T, src: FactSource, ctx?: FactContext): T {
  return mapStrings(value, (text, key) => (key === 'ko' || key === 'en' ? resolveFacts(text, key, src, ctx) : text), null) as T;
}

/** Token names in `text` ('awards.count:top', 'person.name', …), in order. */
export function tokensIn(text: string): string[] {
  return [...text.matchAll(FACT_TOKEN)].map((m) => (m[2] === undefined ? (m[1] ?? '') : `${m[1] ?? ''}:${m[2]}`));
}
