// The chooser covers' framing words (coverCopy): the same keys in both languages, a status and a glyph limit per key,
// no facts (digits only in label-number keys), only the four code-filled placeholders, glyphs the site's fonts carry,
// no game trademark. Every key but the owner's "기밀 해제" stays a placeholder until the owner's wording lands.
import { describe, expect, it } from 'vitest';
import { ALWAYS_SYMBOLS } from '../../scripts/fonts/glyphs.mjs';
import { SITE } from '../../src/config';
import { COVER_COPY_STATUS, COVER_LIMITS, coverCopy } from '../../src/data/copy/chooser-covers';
import { containsTrademark } from '../../src/lib/seo';
import { VARIANT_IDS } from '../../src/variants/ids';

const LANGS = ['ko', 'en'] as const;
const LABEL_NUMBER_KEYS = new Set(['num', 'serial']);
const FILLED = /\{(n|year|host|count)\}/g;
const FILL: Record<string, string> = { n: String(VARIANT_IDS.length), year: '2026', host: new URL(SITE.url).host, count: String(VARIANT_IDS.length) };

/** Dotted key → value (arrays stay whole: 'game.display' is one key). */
function flat(value: Record<string, unknown>, prefix = ''): Map<string, string | string[]> {
  const out = new Map<string, string | string[]>();
  for (const [k, v] of Object.entries(value)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string' || Array.isArray(v)) out.set(key, v as string | string[]);
    else for (const [kk, vv] of flat(v as Record<string, unknown>, key)) out.set(kk, vv);
  }
  return out;
}
const entries = (lang: (typeof LANGS)[number]): [string, string[]][] =>
  [...flat(coverCopy[lang] as unknown as Record<string, unknown>)].map(([k, v]) => [k, Array.isArray(v) ? v : [v]]);
const lastKey = (key: string): string => key.split('.').pop()!;
const graphemes = (s: string): number => [...new Intl.Segmenter('und', { granularity: 'grapheme' }).segment(s)].length;
const HANGUL = /[ᄀ-ᇿ㄰-㆏ꥠ-꥿가-힯ힰ-퟿]/u;

describe('coverCopy (chooser covers, v6.2)', () => {
  it('ko and en have the same keys; every key has a status and a limit', () => {
    const ko = entries('ko').map(([k]) => k).sort();
    const en = entries('en').map(([k]) => k).sort();
    expect(en).toEqual(ko);
    expect(Object.keys(COVER_COPY_STATUS).sort()).toEqual(ko);
    expect(Object.keys(COVER_LIMITS).sort()).toEqual(ko);
    expect(ko).toHaveLength(25);
    for (const lang of LANGS) {
      expect(coverCopy[lang].game.display, lang).toHaveLength(3);
      expect(coverCopy[lang].data.banner, lang).toHaveLength(2);
    }
  });

  it('no digit outside num/serial keys; only the four named placeholders', () => {
    const placeholders = new Set<string>();
    for (const lang of LANGS) {
      for (const [key, values] of entries(lang)) {
        for (const value of values) {
          for (const m of value.matchAll(/\{[^}]*\}/g)) placeholders.add(`${key} ${m[0]}`);
          const rest = value.replace(FILLED, '');
          expect(rest, `${lang} ${key}: stray brace`).not.toMatch(/[{}]/);
          if (!LABEL_NUMBER_KEYS.has(lastKey(key))) expect(value, `${lang} ${key}`).not.toMatch(/[0-9]/);
        }
      }
    }
    expect([...placeholders].sort()).toEqual(['foot {host}', 'foot {year}', 'mast.files {n}', 'opening.request {count}']);
    // the label-number keys do hold label numbers (the rule is not vacuous)
    expect(coverCopy.ko.game.serial).toMatch(/[0-9]/);
  });

  it('every character is printable ASCII, Hangul or in ALWAYS_SYMBOLS', () => {
    for (const lang of LANGS) {
      for (const [key, values] of entries(lang)) {
        for (const ch of values.join('')) {
          const ok = (ch >= ' ' && ch <= '~') || HANGUL.test(ch) || ALWAYS_SYMBOLS.includes(ch);
          expect(ok, `${lang} ${key}: U+${ch.codePointAt(0)!.toString(16).toUpperCase()} "${ch}"`).toBe(true);
        }
      }
    }
  });

  it('every value fits its limit (graphemes)', () => {
    for (const lang of LANGS) {
      for (const [key, values] of entries(lang)) {
        for (const value of values) {
          const shown = value.replace(FILLED, (_, name: string) => FILL[name]);
          expect(graphemes(shown), `${lang} ${key} "${shown}" (limit ${COVER_LIMITS[key]})`).toBeLessThanOrEqual(COVER_LIMITS[key]);
        }
      }
    }
    expect(graphemes('기밀 해제')).toBe(5);
  });

  it('no value names a game trademark (containsTrademark)', () => {
    for (const lang of LANGS) {
      for (const [key, values] of entries(lang)) for (const value of values) expect(containsTrademark(value), `${lang} ${key}: "${value}"`).toBe(false);
    }
    expect(containsTrademark('GAME_ANALYST.DOC · Steam')).toBe(true);
  });

  it('the digit-bearing labels keep the prototype values verbatim, each in a num/serial key', () => {
    for (const lang of LANGS) {
      expect(coverCopy[lang].game.rail, lang).toEqual({ serial: 'SN PDL-26/01-G' });
      expect(coverCopy[lang].opening.node, lang).toEqual({ num: 'NODE 02' });
      expect(coverCopy[lang].opening.pct, lang).toEqual({ num: '100%' });
    }
    const keys = entries('ko').map(([k]) => k);
    expect(keys).toEqual(expect.arrayContaining(['game.rail.serial', 'opening.node.num', 'opening.pct.num']));
    expect(keys).not.toEqual(expect.arrayContaining(['game.rail']));
    expect(Object.keys(COVER_COPY_STATUS)).not.toContain('opening.pct');
  });

  it('game.stamp is owner-written; everything else is a placeholder until MO-30', () => {
    expect(coverCopy.ko.game.stamp).toBe('기밀 해제');
    expect(COVER_COPY_STATUS['game.stamp']).toBe('owner');
    const others = Object.entries(COVER_COPY_STATUS).filter(([key]) => key !== 'game.stamp');
    expect(others.length).toBeGreaterThan(0);
    for (const [key, status] of others) expect(status, key).toBe('placeholder');
  });
});
