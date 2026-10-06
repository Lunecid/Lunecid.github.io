// The case-study overlay's copy (src/data/copy/case/cog-2026.ts). Fact lint (tests/unit/fact-lint.test.ts) already scans
// it: no digit outside a fact token. Here: both languages have the same shape, the same tokens and citations per string,
// the owner's wording rules hold, and every case.* token is used.
import { describe, expect, it } from 'vitest';
import { caseCopy } from '../../src/data/copy/case/cog-2026';
import { CASE_TOKEN_KEYS } from '../../src/data/research/cog-2026-case';
import { resolveDeep, tokensIn } from '../../src/lib/facts';
import { loadFactSource } from '../helpers/fact-source';

const facts = loadFactSource();

/** [path, string] for every string leaf. */
function leaves(value: unknown, path = ''): [string, string][] {
  if (typeof value === 'string') return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((v, i) => leaves(v, `${path}[${i}]`));
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));
  return [];
}
const shape = (value: unknown): unknown =>
  Array.isArray(value) ? value.map(shape) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape(v)])) : typeof value;
const cites = (text: string): string[] => [...text.matchAll(/\^\[([a-f](?:,[a-f])*)\]/g)].map((m) => m[1]!);
const sorted = (list: string[]) => [...list].sort();
const all = (lang: 'ko' | 'en') => leaves(caseCopy[lang]).map(([, text]) => text).join('\n');

describe('case copy', () => {
  it('ko and en have identical key trees (en may leave the ko-only English kicker empty)', () => {
    expect(shape(caseCopy.en)).toEqual(shape(caseCopy.ko));
  });

  it('per string, ko and en carry the same multiset of fact tokens and citations', () => {
    const en = new Map(leaves(caseCopy.en));
    for (const [path, ko] of leaves(caseCopy.ko)) {
      const other = en.get(path) ?? '';
      if (/\.en$/.test(path)) continue; // the ko page's English chapter kicker
      expect(sorted(tokensIn(other)), path).toEqual(sorted(tokensIn(ko)));
      expect(cites(other), path).toEqual(cites(ko));
    }
  });

  it('every string resolves in its language; no inline-mark residue but the four documented marks', () => {
    for (const lang of ['ko', 'en'] as const) {
      const resolved = leaves(resolveDeep(caseCopy[lang], lang, facts));
      for (const [path, text] of resolved) {
        expect(text, `${lang} ${path}`).not.toMatch(/[{}]|<\/?[a-z]/i);
        expect(text.replace(/\^\[[a-f](?:,[a-f])*\]/g, ''), `${lang} ${path}`).not.toMatch(/\^\[/);
      }
    }
  });

  it('every case.* token is used by the copy at least once', () => {
    const used = new Set(leaves(caseCopy).flatMap(([, text]) => tokensIn(text)));
    expect(CASE_TOKEN_KEYS.filter((key) => !used.has(`case.${key}`))).toEqual([]);
  });

  it('venue, year and format only through pub tokens; no repository path; no draft marks (D6, D7)', () => {
    for (const lang of ['ko', 'en'] as const) {
      const text = all(lang);
      expect(text).not.toMatch(/CoG 2026|IEEE/);
      expect(text).toContain('{pub.cog-2026-engagement.venueShort}');
      expect(text).not.toMatch(/src\/|\.ts\b|\.md\b|\.webp\b/);
      expect(text).not.toContain('초안');
      expect(text).not.toMatch(/ARI는 무엇과|what does ARI compare/i);
    }
  });

  it('seed wording (owner ruling): three-seed means are reported; the spread across seeds was not measured', () => {
    expect(caseCopy.ko.ch4.seedNote).toBe('세 시드 평균만 보고했고, 시드 간 편차(분산)는 재지 않았습니다.');
    expect(all('ko')).toContain('세 시드 평균');
    expect(caseCopy.en.ch4.seedNote).toBe('Only three-seed means are reported; the spread (variance) across seeds was not measured.');
    expect(all('en')).toContain('mean of three seeds');
  });

  it('D8: the stepper labels follow the chapter headings', () => {
    expect(caseCopy.ko.steps.map((s) => s.long)).toEqual(['질문', '측정 설계', '결과 ① 가능한가', '결과 ② 한계', '논의']);
    expect(caseCopy.ko.steps.map((s) => s.short)).toEqual(['질문', '설계', '가능?', '한계', '논의']);
    expect([caseCopy.ko.ch1.title, caseCopy.ko.ch2.title, caseCopy.ko.ch3.title, caseCopy.ko.ch4.title, caseCopy.ko.ch5.title]).toEqual(['질문', '측정 설계', '결과 ①: 가능한가', '결과 ②: 한계', '논의: 하한과 남은 가설']);
  });

  it('the leakage wording is “누수 방지” / “Leakage prevention”, never an audit', () => {
    expect(caseCopy.ko.ch2.more.leakH).toBe('누수 방지');
    expect(caseCopy.en.ch2.more.leakH).toBe('Leakage prevention');
  });
});
