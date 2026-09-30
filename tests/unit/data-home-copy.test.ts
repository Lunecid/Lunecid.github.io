import { describe, expect, it } from 'vitest';
import { dataHomeCopy } from '../../src/data/copy/data/home';
import { resolveDeep } from '../../src/lib/facts';
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
});
