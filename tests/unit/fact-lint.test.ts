// R-4 / contract §3.3: copy holds facts only as tokens. Every string leaf of the scanned modules and job-fit fields,
// after removing well-formed tokens, has no digit, no award name, no English month name and no stray brace; every token
// resolves. Components never spell CoG 2026 / IEEE / an award name.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { awardSchema } from '../../src/content/schemas';
import { parseYamlList } from '../../src/content/yaml-loader';
import { AWARD_LEVEL_NAME } from '../../src/data/award-levels';
import { chooserCopy } from '../../src/data/copy/chooser';
import type { Lang } from '../../src/i18n/ui';
import { FACT_TOKEN, resolveDeep, resolveFacts, tokensIn, type FactContext } from '../../src/lib/facts';
import { dataVariant } from '../../src/variants/data';
import { gameVariant } from '../../src/variants/game';
import { resolveIdentity } from '../../src/variants';
import type { Variant } from '../../src/variants/types';
import { loadFactSource } from '../helpers/fact-source';
import { walk } from '../helpers/fs';

const ROOT = process.cwd();
const facts = loadFactSource();

/** Contract §3.3 skipped keys, plus the structural Variant fields that hold ids, not copy, plus `serial` (the chooser
 *  covers' file serials: label numbers like `num`). */
const SKIP_KEYS = new Set(['href', 'num', 'serial', 'id', 'figure', 'kind', 'frequency', 'asOf', 'orders', 'modules', 'prefix', 'layout', 'theme', 'jobfit', 'documents', 'nav']);
/** Label-number values (`num`, `serial`): letters, digits and label punctuation only, never a fact. */
const LABEL_NUMBER = /^[A-Z0-9 ./%-]*$/;
/** Placeholders the chooser covers fill in code (file count, build year, site host), not fact tokens. */
const CODE_FILLED = { where: 'src/data/copy/chooser-covers.ts coverCopy.', pattern: /\{(?:n|year|host|count)\}/g };
/** CA-9: literals that are not common-frame facts; each must match exactly once. */
const FACT_LINT_EXCEPTIONS: { where: string; literal: string; why: string }[] = [
  { where: 'src/data/jobfit.game.yaml rows[take-home].plan.ko', literal: '1쪽', why: "a planned deliverable's page count, pinned by tests/content/records.test.ts" },
];
/** Terms whose digit is part of the word, not a fact (stripped everywhere before the digit check). */
const TERMS: { literal: string; why: string }[] = [
  { literal: '제1저자', why: '"first author": a term (the growth infographic, src/data/growth.ts), not a count' },
];
const MONTH = /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\b/;
const awards = parseYamlList(readFileSync(join(ROOT, 'src/data/awards.yaml'), 'utf8')).map((a) => awardSchema.parse(a));
const AWARD_NAMES = [...new Set([...Object.values(AWARD_LEVEL_NAME).flatMap((n) => [n.ko, n.en]), ...awards.flatMap((a) => [a.name.ko, a.name.en])])];

interface Leaf { where: string; text: string; lang: Lang | null; ctx?: FactContext }

function leaves(value: unknown, where: string, lang: Lang | null, out: Leaf[], ctx?: FactContext): void {
  if (typeof value === 'string') out.push({ where, text: value, lang, ctx });
  else if (Array.isArray(value)) value.forEach((item, i) => leaves(item, `${where}[${i}]`, lang, out, ctx));
  else if (value !== null && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    for (const [key, child] of Object.entries(value)) {
      if (!SKIP_KEYS.has(key)) leaves(child, `${where}.${key}`, key === 'ko' || key === 'en' ? key : lang, out, ctx);
    }
  }
}

const modules = {
  ...import.meta.glob('../../src/data/copy/**/*.ts', { eager: true }),
  ...import.meta.glob('../../src/variants/*.ts', { eager: true }),
  ...import.meta.glob('../../src/data/research-page.ts', { eager: true }),
  ...import.meta.glob('../../src/data/growth.ts', { eager: true }),
} as Record<string, Record<string, unknown>>;

function scanned(): Leaf[] {
  const out: Leaf[] = [];
  for (const [file, exports] of Object.entries(modules)) {
    const rel = file.replace(/^(\.\.\/)+/, '');
    for (const [name, value] of Object.entries(exports)) leaves(value, `${rel} ${name}`, null, out);
  }
  for (const file of readdirSync(join(ROOT, 'src/data')).filter((f) => /^jobfit\..+\.yaml$/.test(f))) {
    const rel = `src/data/${file}`;
    const data = load(readFileSync(join(ROOT, rel), 'utf8')) as {
      sample: { count: number; years: string }; intro: unknown; sources: { note: unknown };
      rows: { id: string; requirement: unknown; plan: unknown; evidence: { label: unknown; short?: unknown; note?: unknown }[] }[];
    };
    const ctx: FactContext = { table: data.sample };
    leaves(data.intro, `${rel} intro`, null, out, ctx);
    leaves(data.sources.note, `${rel} sources.note`, null, out, ctx);
    for (const row of data.rows) {
      leaves(row.requirement, `${rel} rows[${row.id}].requirement`, null, out, ctx);
      leaves(row.plan, `${rel} rows[${row.id}].plan`, null, out, ctx);
      row.evidence.forEach((ev, i) => {
        leaves(ev.label, `${rel} rows[${row.id}].evidence[${i}].label`, null, out, ctx);
        if (ev.short !== undefined) leaves(ev.short, `${rel} rows[${row.id}].evidence[${i}].short`, null, out, ctx);
        if (ev.note !== undefined) leaves(ev.note, `${rel} rows[${row.id}].evidence[${i}].note`, null, out, ctx);
      });
    }
  }
  return out;
}

function stripComments(source: string): string {
  return source.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
}

describe('fact lint (R-4)', () => {
  it('scanned copy holds facts only as tokens', () => {
    const used = new Map<string, number>();
    const problems: string[] = [];
    for (const leaf of scanned()) {
      const text = leaf.where.startsWith(CODE_FILLED.where) ? leaf.text.replace(CODE_FILLED.pattern, '') : leaf.text;
      let rest = text.replace(FACT_TOKEN, '');
      for (const term of TERMS) rest = rest.split(term.literal).join('');
      for (const ex of FACT_LINT_EXCEPTIONS) {
        if (leaf.where === ex.where && rest.includes(ex.literal)) {
          rest = rest.replace(ex.literal, '');
          used.set(ex.where, (used.get(ex.where) ?? 0) + 1);
        }
      }
      if (/[0-9]/.test(rest)) problems.push(`${leaf.where}: digit in "${leaf.text}"`);
      for (const award of AWARD_NAMES) if (rest.includes(award)) problems.push(`${leaf.where}: award name "${award}" in "${leaf.text}"`);
      if (MONTH.test(rest)) problems.push(`${leaf.where}: month name in "${leaf.text}"`);
      if (/[{}]/.test(rest)) problems.push(`${leaf.where}: stray brace in "${leaf.text}"`);
      for (const lang of leaf.lang ? [leaf.lang] : (['ko', 'en'] as const)) {
        try {
          resolveFacts(text, lang, facts, leaf.ctx);
        } catch (error) {
          problems.push(`${leaf.where} (${lang}): ${(error as Error).message}`);
        }
      }
    }
    expect(problems).toEqual([]);
    for (const ex of FACT_LINT_EXCEPTIONS) expect(used.get(ex.where), `exception ${ex.where} must match exactly once`).toBe(1);
  });

  it('serial and num values are label numbers only', () => {
    const found: string[] = [];
    const visit = (value: unknown, where: string, key: string | null): void => {
      if (typeof value === 'string') {
        if (key === 'num' || key === 'serial') {
          found.push(where);
          expect(value, where).toMatch(LABEL_NUMBER);
        }
      } else if (Array.isArray(value)) value.forEach((item, i) => visit(item, `${where}[${i}]`, key));
      else if (value !== null && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
        for (const [k, child] of Object.entries(value)) visit(child, `${where}.${k}`, k);
      }
    };
    for (const [file, exports] of Object.entries(modules)) for (const [name, value] of Object.entries(exports)) visit(value, `${file.replace(/^(\.\.\/)+/, '')} ${name}`, null);
    // not vacuous: the chooser's file number, both covers' serials, the rail serial and the opening's node and percentage
    expect(found).toEqual(expect.arrayContaining(['src/data/copy/chooser.ts chooserCopy.ko.game.num', 'src/data/copy/chooser-covers.ts coverCopy.ko.game.serial', 'src/data/copy/chooser-covers.ts coverCopy.en.data.serial', 'src/data/copy/chooser-covers.ts coverCopy.ko.game.rail.serial', 'src/data/copy/chooser-covers.ts coverCopy.en.opening.node.num', 'src/data/copy/chooser-covers.ts coverCopy.ko.opening.pct.num']));
    expect('[ MODE 01 ]').not.toMatch(LABEL_NUMBER);
  });

  it('components, views and layouts never spell CoG 2026, IEEE or an award name (comments aside)', () => {
    const offenders: string[] = [];
    for (const dir of ['src/components', 'src/views', 'src/layouts']) {
      for (const file of walk(join(ROOT, dir)).filter((f) => f.endsWith('.astro'))) {
        const text = stripComments(readFileSync(file, 'utf8'));
        for (const needle of ['CoG 2026', 'IEEE', ...AWARD_NAMES]) {
          if (text.includes(needle)) offenders.push(`${relative(ROOT, file).split(sep).join('/')}: ${needle}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the same fact reads the same on both versions (spec §12)', () => {
    for (const lang of ['ko', 'en'] as const) {
      const copy = { game: versionCopy(gameVariant, lang), data: versionCopy(dataVariant, lang) };
      const tokensOf = (pairs: readonly (readonly [string, string])[]) => new Set(pairs.flatMap(([raw]) => tokensIn(raw)));
      const gameTokens = tokensOf(copy.game);
      const shared = [...tokensOf(copy.data)].filter((token) => gameTokens.has(token));
      // not vacuous: at least the graduation month and the CoG venue are shared facts
      expect(shared, `${lang} shared tokens`).toEqual(expect.arrayContaining(['person.graduation', 'pub.cog-2026-engagement.venueShort']));
      for (const token of shared) {
        const value = resolveFacts(`{${token}}`, lang, facts); // computed once per token and language
        for (const [version, pairs] of Object.entries(copy)) {
          for (const [raw, rendered] of pairs.filter(([text]) => tokensIn(text).includes(token))) {
            expect(rendered, `${version} ${lang} {${token}} in "${raw}"`).toContain(value);
            expect(rendered, `${version} ${lang} token residue`).not.toMatch(/[{}]/);
          }
        }
      }
      const game = resolveIdentity(gameVariant, lang, facts);
      const data = resolveIdentity(dataVariant, lang, facts);
      expect(game.status.startsWith(data.status), `${lang} graduation clause`).toBe(true);
    }
  });
});

/**
 * [raw, rendered] pairs of one version's copy in one language: the identity strings next to what resolveIdentity (the
 * views' only path) makes of them, then the version's chooser lines (chooserCopy) as ChooserView renders them (P1-11).
 */
function versionCopy(variant: Variant, lang: Lang): (readonly [string, string])[] {
  const { identity } = variant;
  const shown = resolveIdentity(variant, lang, facts);
  const chooser = resolveDeep(chooserCopy[lang], lang, facts)[variant.id];
  return [
    [identity.headline[lang], shown.headline],
    [identity.siteTitle[lang], shown.siteTitle],
    [identity.tagline[lang], shown.tagline],
    [identity.status[lang], shown.status],
    [identity.about[lang], shown.about],
    [identity.labNote.title[lang], shown.labNote.title],
    [identity.labNote.body[lang], shown.labNote.body],
    [chooserCopy[lang][variant.id].title, chooser.title],
    [chooserCopy[lang][variant.id].evidence, chooser.evidence],
  ];
}
