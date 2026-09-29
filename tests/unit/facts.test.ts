import { describe, expect, it } from 'vitest';
import {
  FACT_TOKEN_PATTERNS, FORMAT_PHRASE, UnknownFactTokenError, factResolver, graduationEntry, resolveDeep, resolveFacts,
  resolveLocalizedDeep, tokensIn,
} from '../../src/lib/facts';
import { AWARD_LEVEL_MEDAL, AWARD_LEVEL_NAME } from '../../src/data/award-levels';
import { AWARD_LEVELS } from '../../src/types';
import type { VariantId } from '../../src/variants/ids';
import { loadFactSource } from '../helpers/fact-source';

const src = loadFactSource();
const both = (token: string): [string, string] => [resolveFacts(token, 'ko', src), resolveFacts(token, 'en', src)];

describe('fact tokens (R-4, contract §3)', () => {
  it('resolves the §3.2 catalogue from the committed data', () => {
    expect(both('{person.name}')).toEqual(['백성은', 'Seongeun Baek']);
    expect(both('{person.graduation}')).toEqual(['2027년 2월', 'February 2027']);
    expect(both('{person.graduationShort}')).toEqual(['2027년 2월', 'Feb 2027']);
    expect(both('{edu.ms-pnu.startYear}')).toEqual(['2025', '2025']);
    expect(both('{awards.count:top}')).toEqual(['2', '2']);
    expect(both('{awards.count:encouragement}')).toEqual(['1', '1']);
    expect(both('{awards.name:top}')).toEqual(['최우수상', 'Top Excellence Award']);
    expect(both('{awards.name:encouragement}')).toEqual(['장려상', 'Honorable Mention (Encouragement Award)']);
    expect(both('{award.busan-mayor-award.year}')).toEqual(['2025', '2025']);
    expect(both('{pub.cog-2026-engagement.venueShort}')).toEqual(['IEEE CoG 2026', 'IEEE CoG 2026']);
    expect(both('{pub.cog-2026-engagement.venueAbbr}')).toEqual(['CoG 2026', 'CoG 2026']);
    expect(both('{pub.cog-2026-engagement.year}')).toEqual(['2026', '2026']);
    expect(both('{pub.cog-2026-engagement.format}')).toEqual(['구두 발표', 'oral presentation']);
    expect(both('{pub.cog-2026-engagement.fact.window}')).toEqual(['30초', '30 seconds']);
    expect(both('{pub.cog-2026-engagement.fact.matchesShort}')).toEqual(['20.6만 경기', '206K matches']);
    expect(both('{project.kickick-park.title}')).toEqual(['킥킥파크', 'KickKick Park']);
    // CA-8 dropped (site-v1 e92f8f0): no project carries `facts`, so a project fact is unknown on the committed data.
    expect(() => resolveFacts('{project.kickick-park.fact.tableauFigures}', 'ko', src)).toThrow(UnknownFactTokenError);
    expect(both('{cert.adsp.short}')).toEqual(['ADsP', 'ADsP']);
    expect(both('{cert.cds-bigdata-2.short}')).toEqual(['CDS 빅데이터 2급', 'CDS Big Data Level 2']);
    expect(both('{cert.adsp.name}')).toEqual(['데이터분석 준전문가(ADsP)', 'Advanced Data Analytics Semi-Professional (ADsP)']);
  });

  it('rebuilds the old literal copy exactly (the P1-8 conversions)', () => {
    expect(resolveFacts('{awards.name:top} ×{awards.count:top} · {awards.name:encouragement} ×{awards.count:encouragement}', 'ko', src)).toBe('최우수상 ×2 · 장려상 ×1');
    expect(resolveFacts('{awards.name:top} ×{awards.count:top} · {awards.name:encouragement} ×{awards.count:encouragement}', 'en', src)).toBe('Top Excellence Award ×2 · Honorable Mention (Encouragement Award) ×1');
    expect(resolveFacts('FIG · {pub.cog-2026-engagement.venueAbbr} · AUC BY MODEL', 'en', src)).toBe('FIG · CoG 2026 · AUC BY MODEL');
    expect(resolveFacts('{cert.adsp.short} · {cert.cds-bigdata-2.short}', 'ko', src)).toBe('ADsP · CDS 빅데이터 2급');
  });

  it('table.* resolves only with a FactContext.table (job-fit scope)', () => {
    expect(resolveFacts('공고 {table.count}건 ({table.years})', 'ko', src, { table: { count: 13, years: '2024–2026' } })).toBe('공고 13건 (2024–2026)');
    expect(() => resolveFacts('{table.count}', 'ko', src)).toThrow(UnknownFactTokenError);
  });

  it('unknown tokens and stray braces throw UnknownFactTokenError', () => {
    expect(() => resolveFacts('{person.nickname}', 'ko', src)).toThrow(UnknownFactTokenError);
    expect(() => resolveFacts('{awards.count:gold}', 'ko', src)).toThrow(UnknownFactTokenError);
    expect(() => resolveFacts('최우수상 {awards.count:top', 'ko', src)).toThrow(UnknownFactTokenError);
    expect(() => resolveFacts('a } b', 'ko', src)).toThrow(UnknownFactTokenError);
    try {
      resolveFacts('x {pub.nope.venueShort} y', 'en', src);
    } catch (error) {
      expect((error as UnknownFactTokenError).token).toBe('{pub.nope.venueShort}');
      expect((error as UnknownFactTokenError).text).toBe('x {pub.nope.venueShort} y');
    }
    expect(resolveFacts('no tokens here', 'ko', src)).toBe('no tokens here');
  });

  it('resolveDeep, resolveLocalizedDeep, factResolver and tokensIn', () => {
    const copy = { a: '{person.name}', list: ['{awards.count:top}', 'x'], n: 1, nested: { b: '{pub.cog-2026-engagement.venueAbbr}' } };
    expect(resolveDeep(copy, 'en', src)).toEqual({ a: 'Seongeun Baek', list: ['2', 'x'], n: 1, nested: { b: 'CoG 2026' } });
    const localized = { id: 'degree', label: { ko: '재학({person.graduation} 졸업 예정)', en: 'expected {person.graduation}' }, bullets: { ko: ['{person.name}'], en: ['{person.name}'] } };
    expect(resolveLocalizedDeep(localized, src)).toEqual({
      id: 'degree',
      label: { ko: '재학(2027년 2월 졸업 예정)', en: 'expected February 2027' },
      bullets: { ko: ['백성은'], en: ['Seongeun Baek'] },
    });
    expect(factResolver(src, 'ko')('{person.name}')).toBe('백성은');
    expect(tokensIn('a {awards.count:top} b {person.name} c')).toEqual(['awards.count:top', 'person.name']);
  });

  it('never takes a version: the resolver has no version input, so one token is one string on both versions', () => {
    expect(resolveFacts.length).toBe(4);
    // Type-level: no parameter of resolveFacts can hold a VariantId. If one ever could, the type below becomes `false`
    // and `npm run check` fails on this line (tests are type-checked). The runtime cross-version check is in P1-8's fact lint.
    const noVersionParam: [Extract<Parameters<typeof resolveFacts>[number], VariantId>] extends [never] ? true : false = true;
    expect(noVersionParam).toBe(true);
  });

  it('pattern list, level tables, format phrases and the graduation entry', () => {
    expect(FACT_TOKEN_PATTERNS).toEqual(expect.arrayContaining(['person.name', 'awards.count:<level>', 'pub.<id>.fact.<key>', 'project.<slug>.fact.<key>', 'table.count']));
    expect(Object.keys(AWARD_LEVEL_NAME).sort()).toEqual([...AWARD_LEVELS].sort());
    expect(AWARD_LEVEL_MEDAL.top).toEqual({ tier: 'gold', label: { ko: '최우수', en: 'Top Excellence' } });
    expect(AWARD_LEVEL_MEDAL.encouragement).toEqual({ tier: 'silver', label: { ko: '장려', en: 'Honorable Mention' } });
    expect(FORMAT_PHRASE.ko.Oral).toBe('구두 발표');
    expect(FORMAT_PHRASE.en.Oral).toBe('oral presentation');
    expect(graduationEntry([{ end: '2025-02', expected: false }, { end: '2027-02', expected: true }])).toEqual({ end: '2027-02', expected: true });
    expect(graduationEntry([{ end: '2025-02', expected: false }, { end: '2023-02', expected: false }])).toEqual({ end: '2025-02', expected: false });
    expect(() => graduationEntry([])).toThrow();
  });
});
