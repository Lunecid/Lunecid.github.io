import { describe, expect, it } from 'vitest';
import { dataHomeCopy } from '../../src/data/copy/data/home';
import { resolveDeep, tokensIn } from '../../src/lib/facts';
import { loadFactSource } from '../helpers/fact-source';

describe('general home copy (P2-7, spec §10.2, R-4)', () => {
  const facts = loadFactSource();
  it('the evidence line resolves from the common frame only', () => {
    expect(resolveDeep(dataHomeCopy.ko, 'ko', facts).evidence).toBe('최우수상 2회 · IEEE CoG 2026 구두 발표');
    expect(resolveDeep(dataHomeCopy.en, 'en', facts).evidence).toBe('Top Excellence Award ×2 · oral presentation at IEEE CoG 2026');
  });
  it('the hero figure caption names the project through its token; hrefs are base form', () => {
    const ko = resolveDeep(dataHomeCopy.ko, 'ko', facts);
    expect(ko.heroFigure.caption.startsWith('사각지대를 예측하다 — ')).toBe(true);
    expect(resolveDeep(dataHomeCopy.en, 'en', facts).heroFigure.caption.startsWith('Predicting the Blind Spots — ')).toBe(true);
    for (const lang of ['ko', 'en'] as const) {
      expect(dataHomeCopy[lang].cta.projects.href).toBe('/projects/');
      expect(dataHomeCopy[lang].heroFigure.href).toBe('/projects/school-zone-blindspots/');
    }
  });
  it('the research sentence tells the paper as it is (§10.2) and uses no game word beyond the fact', () => {
    expect(dataHomeCopy.ko.researchSentence).toBe('공개 경기 기록으로 교전 결과를 예측한 연구입니다.');
    expect(dataHomeCopy.en.researchSentence).toBe('A study that predicts engagement outcomes from public match records.');
  });

  it('DS-4: stat definitions use fact tokens only and resolve to the same values ko/en', async () => {
    const { readFileSync } = await import('node:fs');
    const md = readFileSync('src/content/publications/cog-2026-engagement.md', 'utf8');
    const block = (key: string): string => (new RegExp(`^${key}: >-\\n((?:  .*\\n?)+)`, 'm').exec(md)?.[1] ?? '').replace(/\s+/g, ' ');
    const abstract = { ko: block('abstractKo'), en: block('abstract') };
    const digits = (s: string): string => s.replace(/[^\d]/g, '');
    for (const key of ['heroStats', 'researchStats'] as const) {
      const ko = dataHomeCopy.ko[key];
      const en = dataHomeCopy.en[key];
      expect(ko).toHaveLength(3);
      expect(en.length, key).toBe(ko.length);
      // no digit outside a fact token (the numbers come from the common frame only)
      expect(JSON.stringify([ko, en]).replace(/\{[^}]*\}/g, ''), key).not.toMatch(/\d/);
      // ko and en tiles carry the same facts (the same tokens in the value, in the same order)
      ko.forEach((tile, i) => expect(tokensIn(tile.value), `${key}[${i}]`).toEqual(tokensIn(en[i]?.value ?? '')));
      ko.forEach((tile, i) => expect(tokensIn(tile.value).length, `${key}[${i}] holds a fact`).toBeGreaterThan(0));
      // numbers that are plain digits in both languages resolve identically (counts, AUC, the match count)
      const rko = resolveDeep(ko, 'ko', facts);
      const ren = resolveDeep(en, 'en', facts);
      rko.forEach((tile, i) => {
        if (!/[년월]/.test(tile.value)) expect(digits(tile.value), `${key}[${i}]`).toBe(digits(ren[i]?.value ?? ''));
      });
    }
    // the hero tiles are the status and evidence sentences, in their order
    const hko = resolveDeep(dataHomeCopy.ko.heroStats, 'ko', facts).map((s) => (s.labelFirst ? `${s.label} ${s.value}` : `${s.value} ${s.label}`));
    expect(hko).toEqual(['2027년 2월 석사 졸업 예정', '최우수상 2회', 'IEEE CoG 2026 구두 발표']);
    expect(resolveDeep(dataHomeCopy.ko, 'ko', facts).evidence).toBe(`${hko[1]} · ${hko[2]}`);
    const hen = resolveDeep(dataHomeCopy.en.heroStats, 'en', facts).map((s) => (s.labelFirst ? `${s.label} ${s.value}` : `${s.value} ${s.label}`));
    expect(hen).toEqual(['M.S. expected February 2027', 'Top Excellence Award ×2', 'oral presentation IEEE CoG 2026']);
    // the research tiles' words are fragments of the same-language abstract
    for (const lang of ['ko', 'en'] as const) {
      for (const tile of resolveDeep(dataHomeCopy[lang].researchStats, lang, facts)) {
        expect(abstract[lang], `${lang} label`).toContain(tile.label);
        if (tile.unit) expect(abstract[lang], `${lang} unit`).toContain(tile.unit);
        for (const end of tile.value.split('–')) expect(abstract[lang], `${lang} value`).toContain(end);
      }
    }
    expect(resolveDeep(dataHomeCopy.ko.researchStats, 'ko', facts)[0]).toMatchObject({ label: '한국 서버 마스터 이상 솔로 랭크', value: '206,442', unit: '경기' });
  });
});
