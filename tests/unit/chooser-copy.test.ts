import { describe, expect, it } from 'vitest';
import { chooserCopy } from '../../src/data/copy/chooser';
import { resolveDeep } from '../../src/lib/facts';
import { loadFactSource } from '../helpers/fact-source';

describe('chooser copy (P2-10, spec §6, B-13)', () => {
  const facts = loadFactSource();
  it('each side\'s evidence line resolves from the common frame', () => {
    const ko = resolveDeep(chooserCopy.ko, 'ko', facts);
    const en = resolveDeep(chooserCopy.en, 'en', facts);
    expect(ko.game.evidence).toBe('IEEE CoG 2026 구두 발표');
    expect(en.game.evidence).toBe('Oral at IEEE CoG 2026'); // P1-11's line and the spec §6 example, unchanged
    expect(ko.data.evidence).toBe('최우수상 2회');
    expect(en.data.evidence).toBe('Top Excellence Award ×2');
  });
  it('titles, the mode number and the calls to action', () => {
    expect([chooserCopy.ko.game.title, chooserCopy.ko.data.title]).toEqual(['게임 데이터 분석가', '데이터 분석가']);
    expect([chooserCopy.en.game.title, chooserCopy.en.data.title]).toEqual(['Game Data Analyst', 'Data Analyst']);
    expect(chooserCopy.ko.game.num).toBe('01');
    expect([chooserCopy.ko.game.cta, chooserCopy.ko.data.cta]).toEqual(['게임 버전 보기', '일반 버전 보기']);
    expect([chooserCopy.en.game.cta, chooserCopy.en.data.cta]).toEqual(['View game version', 'View general version']);
  });
});
