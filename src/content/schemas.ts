// src/content/schemas.ts — zod schema factories for every collection.
// Plain module (no astro:* imports) so Vitest can import it; content.config.ts passes image() in,
// tests pass z.string().
import { z } from 'astro/zod';
import { ACHIEVEMENT_TRIGGERS, AWARD_LEVELS, CERTIFICATE_IDS, CHARACTER_IDS, GAME_IDS, JOBFIT_IDS, JOBFIT_STATUSES, NOTICE_KEYS, type JobfitId } from '../types';
import { DOCUMENTS, type DocumentId } from '../config';
import { GAME_RECORD_NOTICES } from '../lib/game-records';
import { containsTrademark } from '../lib/seo';
import { TAG_KEYS, TAGS_EN, TAGS_KO } from './tags';

const isoMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'YYYY-MM, quoted');
const isoDate = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'YYYY-MM-DD, quoted');
export const localized = z.object({ ko: z.string().min(1), en: z.string().min(1) });
const pdfFlags = z.object({ ko: z.boolean(), en: z.boolean(), academic: z.boolean() });
const DOCUMENT_IDS = Object.keys(DOCUMENTS) as [DocumentId, ...DocumentId[]];
const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
const slug = z.string().regex(/^[a-z0-9-]+$/);
/** A fact key inside `facts` (token segment grammar, contract §3.1): camelCase allowed, e.g. matchesShort. */
const factKey = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9-]*$/);
/** Common-frame facts that copy reaches through {pub.<id>.fact.<key>} / {project.<slug>.fact.<key>} tokens (A-16). */
const facts = z.record(factKey, localized);

export function projectSchema<TImage extends z.ZodType>(image: TImage) {
  return z.object({
    title: z.string().min(1),
    summary: z.string().min(1),
    period: z.object({ start: isoMonth, end: isoMonth }),
    org: z.string().min(1),
    type: z.string().min(1),
    team: z.string().regex(/^(\d+인 팀|\d+-person team)$/), // a name here fails the build
    role: z.string().min(1),
    tools: z.array(z.string()).min(1), // the tools I used myself
    teamTools: z.array(z.string()).min(1).optional(), // tools only teammates used (D-9): a separate PROJECT DETAILS row
    tags: z.array(z.enum([...TAGS_KO, ...TAGS_EN])).max(4),
    award: z.object({ name: z.string(), org: z.string(), date: isoDate, certificate: z.enum(CERTIFICATE_IDS) }).optional(),
    // label: the short HUD caption under the PROJECT DETAILS figure, shown as "FIG · <label>" (P2-21). English HUD
    // text in both languages; a name for the figure, never a number headline (mockup-port §0 #17).
    // fit: 'contain' draws the whole figure on a white plate in the cartridge label (a chart with text, P1-6: never
    // cut mid-line); the default 'cover' fills the label (maps, photos).
    // caption (P-07 F-042): the cover's caption sentence, both languages in each file (the page picks its own), shown
    // under the "FIG · <label>" strip when the body does not cite the cover as a figure (a cited cover keeps the
    // caption of its `figures` entry). Only facts already in the cover's alt text and the figure captions.
    cover: z.object({ src: image, alt: z.string().min(1), label: z.string().regex(/^[A-Z][A-Z ·&/-]{2,32}$/), fit: z.enum(['cover', 'contain']).optional(), caption: localized.optional() }).optional(),
    // inlineAfter (P1-7): a snippet of the body text that first cites the figure ("그림 1" / "Figure 1"); the figure is
    // placed right after that paragraph, list or table (src/lib/figures.ts). Without it the figure stays in the list
    // after the body. A snippet the body does not contain fails the build.
    // table (P-06 F-007 step 2, contract §1.9): the figure's data as a "표로 보기" table under its caption (Figure.astro);
    // column headers are localized (resolved per page language), cells are shown as written. Values only from a source
    // in the repo (no invented facts).
    figures: z
      .array(
        z.object({
          src: image,
          alt: z.string().min(1),
          caption: z.string().min(1),
          inlineAfter: z.string().min(1).optional(),
          table: z.object({ columns: z.array(localized).min(1), rows: z.array(z.array(z.string())).min(1) }).optional(),
        }),
      )
      .default([]),
    links: z.object({ github: z.url().optional(), report: z.url().optional(), slides: z.url().optional() }).default({}),
    // spec §6 audience{game, research} (P1-8): "게임 팀에게 / 연구 기여" after the body. Every project with a page has
    // it with at least one part (tests/content/projects.test.ts); a part the owner has no text for is left out
    // (ProjectAudience then renders the other part alone). 'card' projects have no page and no audience.
    audience: z
      .object({ game: z.string().min(1).optional(), research: z.string().min(1).optional() })
      .refine((a) => a.game !== undefined || a.research !== undefined, { message: 'audience needs game or research' })
      .optional(),
    facts: facts.optional(),
    // published/summary: a case-study page at /projects/<slug>/. card: no page, only a short link-less card on
    // /projects/ and a line on /records/ (D-4); a card file has no Markdown body.
    status: z.enum(['published', 'summary', 'card']),
  });
}

export function publicationSchema<TImage extends z.ZodType>(image: TImage) {
  return z
    .object({
      title: z.string().min(1),
      titleKo: z.string().optional(),
      // Short display title (records skill evidence labels). The full paper title stays in `title`.
      shortTitle: localized.optional(),
      // affiliation: the lines of the paper's \IEEEauthorblockA without the e-mail (paper page, D-15).
      authors: z.array(z.object({ name: z.string(), nameKo: z.string().optional(), me: z.boolean(), affiliation: z.array(z.string().min(1)).optional() })).min(1),
      venue: z.string(),
      venueShort: z.string(),
      year: z.number().int(),
      format: z.enum(['Oral', 'Poster', 'Journal', 'Workshop']),
      status: z.enum(['accepted', 'presented', 'published', 'in-preparation']),
      // Structured so the PDFs can format the date span with the same formatter as every other CV date
      // (formatDateSpan, i18n/utils.ts). `venue` is the place name only (no dates); `presentation` below
      // stays the pre-formatted ko/en status line for the paper page.
      presentedAt: z.object({ venue: z.string().min(1), start: isoDate, end: isoDate }).optional(),
      // Human-readable format · place · dates for the paper page status line.
      presentation: localized.optional(),
      statusNote: localized.optional(),
      doi: z.string().nullable(),
      pdf: z.string().nullable(),
      code: z.url().nullable(),
      caseStudy: z.string().optional(), // '/research/<id>/': the paper page (abstract only since D-15; the key predates it)
      tldr: localized,
      bibtex: z.string().min(1),
      abstract: z.string().min(1),
      abstractKo: z.string().min(1),
      // The paper's IEEEkeywords block, verbatim ("Index Terms—" on the paper page); omitted when the paper has none.
      keywords: z.array(z.string().min(1)).optional(),
      thumbnail: z.object({ src: image, alt: z.string(), altKo: z.string() }),
      highlight: z.boolean().default(false),
      // The CoG card on home and /projects/ (A-16; was the CoG card copy of src/data/copy/home.ts, removed in P1-7b): tag keys and the tool line.
      card: z.object({ tags: z.array(z.enum(TAG_KEYS)).max(4), tools: z.array(z.string().min(1)).min(1) }).strict().optional(),
      facts: facts.optional(),
    })
    .refine((d) => d.pdf === null || d.doi !== null, { message: 'pdf requires doi (spec §8)' });
}

export const newsSchema = z.object({
  date: isoDate,
  dateEnd: isoDate.optional(),
  kind: z.enum(['research', 'award', 'site']),
  title: localized,
  // PATCH NOTES row title (P1-9): a few words, the only part of the row that is a link; `title` stays the sentence.
  short: localized.optional(),
  href: z.string().startsWith('/').nullable(), // Korean-based; EN pages localize it
});

export const legalSchema = z.object({ title: z.string().min(1), lang: z.enum(['ko', 'en']), updated: isoDate });

export const awardSchema = z.object({
  id: z.enum(CERTIFICATE_IDS),
  level: z.enum(AWARD_LEVELS), // A-15: medal and {awards.count:<level>} come from this
  name: localized, contest: localized, org: localized,
  date: isoDate,
  project: slug.nullable(), // project slug (lang-free); validated against PROJECT_SLUGS in tests
  certificate: z.object({ alt: localized }), // image = src/assets/certificates/<id>.webp
  // What the certificate image hides; left out when nothing is hidden (P2-19: "shown as issued" needs no caption).
  redactionNote: localized.optional(),
});

export const achievementSchema = z.object({
  id: slug, trigger: z.enum(ACHIEVEMENT_TRIGGERS), hidden: z.boolean(),
  title: localized, description: localized, hint: localized,
});

export const favoriteGameSchema = z
  .object({
    id: z.enum(GAME_IDS),
    locked: z.boolean(),
    reason: localized.optional(),
    title: localized,
    studio: z.string().min(1),
    characters: z.array(z.object({ id: z.enum(CHARACTER_IDS), name: localized, position: z.string().regex(/^\d{1,3}% \d{1,3}%$/), tint: hexColor })),
    why: localized.nullable(),
    meta: z.array(z.object({ label: localized, value: localized })),
    notices: z.array(z.enum(NOTICE_KEYS)),
    integration: z.object({ platform: z.string().regex(/^[a-z-]+$/), enabled: z.boolean() }),
    account: z.null(),
  })
  .refine((g) => !g.locked || g.reason !== undefined, { message: 'locked games need a reason' });

// Game records (game-records.yaml): the owner's achievements, each with an evidence screenshot. The id and the image
// name end up in asset file names and in the viewer's #view-… hash, so neither names a game trademark (A-9). A tier
// record names its tier; a rank record names its best rank and may name the tier that rank was held in.
const noTrademark = (name: string): boolean => !containsTrademark(name);
const gameRecordFields = {
  id: slug.refine(noTrademark, { message: 'record id names a game trademark (A-9)' }),
  game: z.enum(GAME_IDS),
  queue: localized,
  account: z.string().min(1).max(40), // a public game ID (R-14), never a login e-mail
  alt: z.boolean(), // the owner's alternate account
  date: isoDate,
  // capture: the screenshot's own capture time; saved: when the image was saved, so the record is from that day or before
  dateSource: z.enum(['capture', 'saved']),
  image: z.string().regex(/^[a-z0-9-]+\.(webp|png)$/).refine(noTrademark, { message: 'image name names a game trademark (A-9)' }), // src/assets/game-records/<image>
  imageAlt: z.object({ ko: z.string().min(1).max(200), en: z.string().min(1).max(200) }),
  notices: z.array(z.enum(GAME_RECORD_NOTICES)),
};
export const gameRecordSchema = z.discriminatedUnion('kind', [
  z.object({ ...gameRecordFields, kind: z.literal('tier'), tier: localized }).strict(),
  z.object({ ...gameRecordFields, kind: z.literal('rank'), rank: z.number().int().positive(), tier: localized.optional() }).strict(),
]);

// Skill evidence: project → /projects/<id>/, research → the paper page /research/<id>/, code → the publication's public
// code link (its `code` URL, e.g. the v1.0-cog2026 tag). The skill must be visible at the link target (D-9).
const skill = z.object({ name: z.string(), evidence: z.array(z.object({ kind: z.enum(['project', 'research', 'code']), id: slug })).min(1) });

// Résumé-style bullets for the PDF print path only (batch 3b): noun/"~함"/"~했다" endings, never the web's 합니다체.
// Facts only — every number/claim here must already exist in the content collection, publications or git history.
const resumeBullets = z.object({ ko: z.array(z.string().min(1)).min(1).max(3), en: z.array(z.string().min(1)).min(1).max(3) });

export const resumeSchema = z.object({
  id: z.literal('resume'),
  profile: z.object({
    name: localized,
    affiliation: localized, advisor: localized, location: localized,
    email: z.literal('todtjddms104204@pusan.ac.kr'),
    github: z.literal('Lunecid'),
    site: z.url(),
    researchInterests: z.object({ pdf: pdfFlags, items: z.array(localized).min(1) }),
  }),
  documents: z.array(z.object({ id: z.enum(DOCUMENT_IDS), label: localized, href: z.string().regex(/^\/cv\/[a-z0-9-]+\.pdf$/) })).length(DOCUMENT_IDS.length),
  education: z.array(z.object({
    id: slug, school: localized, degree: localized, start: isoMonth, end: isoMonth, expected: z.boolean(),
    gpa: z.object({ value: z.string(), scale: z.string() }),
    lab: z.object({ ko: z.string(), en: z.string(), href: z.url() }).optional(),
    thesis: z.object({ ko: z.string(), en: z.string(), pdf: pdfFlags }).optional(),
    pdf: pdfFlags,
  })).min(1),
  publications: z.array(z.object({ ref: slug, pdf: pdfFlags })),
  researchInProgress: z.array(z.object({ id: slug, text: localized, pdf: pdfFlags })),
  // resume: an optional PDF-only résumé-style bullet override (batch 3b P1-20/P2-32); when absent the PDF falls
  // back to the project's own summary/role (web copy). /records/ ignores both `resume` and `pdf` (records.ts).
  projects: z.array(z.object({ ref: slug, pdf: pdfFlags, resume: resumeBullets.optional() })),
  // A single PDF-only résumé line merging the two card-status projects (kbo-attendance, seoul-apartment-automl)
  // that have no page (D-4) and are otherwise too thin for their own bullet block (batch 3b P1-20). Korean only:
  // both projects are already pdf.en=false/pdf.academic=false, so there is nothing to merge into those docs.
  projectsNote: z.object({ ko: z.string().min(1), pdf: pdfFlags }).optional(),
  // The CoG paper as the résumés' first project (batch 3b P1-20): not a projects-collection entry, so it is kept
  // separate from `projects` above (which /records/ project-summary also reads — see records.ts) and points at
  // the publications collection instead. Academic CV excludes it (pdf.academic=false): it already gets the full
  // abstract + presentations treatment via `publications`/`researchInProgress` above.
  publicationProject: z
    .object({
      pub: slug,
      pdf: pdfFlags,
      team: localized,
      period: z.object({ start: isoMonth, end: isoMonth }),
      resume: z.object({ ko: z.array(z.string().min(1)).min(2).max(3), en: z.array(z.string().min(1)).min(2).max(3) }),
    })
    .optional(),
  awards: z.array(z.object({ ref: z.enum(CERTIFICATE_IDS), pdf: pdfFlags })),
  activities: z.array(z.object({ id: slug, text: localized, date: z.string().regex(/^\d{4}(-(0[1-9]|1[0-2]))?$/), end: isoMonth.optional(), href: z.url().optional(), pdf: pdfFlags })
    .refine((a) => a.end === undefined || /^\d{4}-\d{2}$/.test(a.date), { message: 'end requires date YYYY-MM' })),
  // display: end ? formatPeriod(date, end) : date.length === 4 ? date : formatYm(date)
  certifications: z.array(z.object({ id: slug, name: localized, short: localized.optional(), issuer: localized, date: isoDate, pdf: pdfFlags })),
  languages: z.array(z.object({
    id: slug, name: localized, level: localized, date: isoDate.optional(), validUntil: isoDate.optional(),
    onExpire: z.literal('mark').optional(), records: z.boolean().default(true), pdf: pdfFlags,
  })),
  training: z.array(z.object({ id: slug, name: localized, org: localized, start: isoMonth, end: isoMonth, hours: z.number().int().positive().optional(), pdf: pdfFlags })),
  skills: z.object({ pdf: pdfFlags, primary: z.array(skill).min(1), familiar: z.array(skill) }),
  researchIds: z.object({ scholar: z.url().nullable(), orcid: z.url().nullable() }),
});

/** CA-30: the job-fit tables, one collection entry per version (A-13). A missing file is the pending state (§2.6). */
export const JOBFIT_FILES: Readonly<Record<JobfitId, string>> = {
  game: 'src/data/jobfit.game.yaml',
  data: 'src/data/jobfit.data.yaml',
};

const FREQUENCY_PART = /^(\d+)\/(\d+)$/;

export const jobfitSchema = z
  .object({
    id: z.enum(JOBFIT_IDS),
    asOf: isoDate,
    // The posting survey behind the table: {table.count} and {table.years} in intro/sources come from here (R-4).
    sample: z.object({ count: z.number().int().positive(), years: z.string().regex(/^\d{4}–\d{4}$/) }).strict(),
    intro: localized,
    rows: z
      .array(
        z.object({
          id: slug,
          requirement: localized,
          frequency: z.string().regex(/^\d+\/\d+( · \d+\/\d+)*$/),
          // short: the label shown in the table from 734px (P1-11); a part of `label`, which stays the accessible name and title.
          // note (P2-8 P-09, contract §1.9/§2.6): an honesty or timing qualifier shown as a visible suffix after the link
          // (never only in the title tooltip); timing notes use tokens ('{person.graduation} 졸업 예정').
          evidence: z.array(z.object({ label: localized, short: localized.optional(), note: localized.optional(), href: z.string().min(1) })),
          status: z.enum(JOBFIT_STATUSES),
          // null = no next step: met rows and rows without a genuine skill step stay empty (D-6).
          plan: localized.nullable(),
        }),
      )
      .min(1),
    // One anonymized line (count and years): no company names or posting URLs on the site (D-6).
    sources: z.object({ note: localized }).strict(),
  })
  .superRefine((data, ctx) => {
    data.rows.forEach((row, i) => {
      for (const part of row.frequency.split(' · ')) {
        const match = FREQUENCY_PART.exec(part);
        if (!match) continue; // the regex above already reports it
        const [, n, d] = match;
        if (Number(d) !== data.sample.count) {
          ctx.addIssue({ code: 'custom', path: ['rows', i, 'frequency'], message: `denominator ${d} is not sample.count ${data.sample.count}` });
        }
        if (Number(n) > data.sample.count) {
          ctx.addIssue({ code: 'custom', path: ['rows', i, 'frequency'], message: `numerator ${n} exceeds sample.count ${data.sample.count}` });
        }
      }
    });
  });

// Inferred types (use these names everywhere)
export type ProjectFrontmatter = z.infer<ReturnType<typeof projectSchema<z.ZodString>>>; // image fields as strings (tests, resume model)
export type PublicationFrontmatter = z.infer<ReturnType<typeof publicationSchema<z.ZodString>>>;
export type NewsData = z.infer<typeof newsSchema>;
export type LegalData = z.infer<typeof legalSchema>;
export type AwardData = z.infer<typeof awardSchema>;
export type AchievementData = z.infer<typeof achievementSchema>;
export type FavoriteGameData = z.infer<typeof favoriteGameSchema>;
export type GameRecordData = z.infer<typeof gameRecordSchema>;
export type ResumeData = z.infer<typeof resumeSchema>;
export type JobfitData = z.infer<typeof jobfitSchema>;
