// The case-study overlay's facts (src/data/research/cog-2026-case.ts): every number the sheet shows comes from this one
// typed file. Values the site already states equal their site source; paper-only values carry a source comment and are
// pinned by a snapshot (a change is deliberate); derived values are computed, never typed.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CASE_FACTS, CASE_TOKEN_KEYS, PERFECT_AUC, aboveChanceShare, caseTokens, gapSteps, neuralBest, neuralRange, nyquistMinutes,
  pairCounts, perMatch, strataRows,
} from '../../src/data/research/cog-2026-case';
import { CHANCE_AUC, figureCopy, killGap, overallAuc } from '../../src/data/research/cog-2026';
import { FACT_TOKEN_PATTERNS, resolveFacts } from '../../src/lib/facts';
import { formatNumber } from '../../src/i18n/utils';
import { loadFactSource } from '../helpers/fact-source';

const facts = loadFactSource();
const auc = (id: string): number => overallAuc.find((row) => row.id === id)!.auc;
const SOURCE = readFileSync('src/data/research/cog-2026-case.ts', 'utf8');

describe('case facts: values the site already states', () => {
  it('re-exports the AUC table and chance from cog-2026.ts (nothing duplicated)', () => {
    expect(SOURCE).toMatch(/from '\.\/cog-2026'/);
    expect(SOURCE).not.toMatch(/0\.675|0\.626|0\.581|0\.569|10,?417,?458|5\.72|62\.73|13\.72/);
    expect(neuralBest()).toEqual({ auc: 0.581, models: ['Bi-GRU', 'Layered'] });
    expect(neuralRange()).toEqual([0.569, 0.581]);
    expect(CHANCE_AUC).toBe(0.5);
    expect(PERFECT_AUC).toBe(1);
  });

  it('the match count and the window equal the publication facts', () => {
    for (const lang of ['ko', 'en'] as const) {
      expect(formatNumber(CASE_FACTS.matches, lang)).toBe(resolveFacts('{pub.cog-2026-engagement.fact.matches}', lang, facts));
      expect(resolveFacts('{pub.cog-2026-engagement.fact.window}', lang, facts)).toContain(String(CASE_FACTS.windowSec));
    }
  });

  it('the kill-gap values are numbers in cog-2026.ts that its caption and alt texts spell out', () => {
    expect(killGap).toEqual({ n: 10_417_458, modes: [5.72, 62.73], valley: 13.72, ariBand: [10, 18], ariMin: 0.9 });
    for (const lang of ['ko', 'en'] as const) {
      const caption = figureCopy.killGap.caption[lang];
      expect(caption).toContain(formatNumber(killGap.n, lang));
      for (const v of [...killGap.modes, killGap.valley, killGap.ariMin]) expect(caption).toContain(String(v));
      expect(caption).toContain(`${killGap.ariBand[0]}–${killGap.ariBand[1]}`);
      for (const v of [...killGap.modes, killGap.valley]) expect(figureCopy.killGap.alt[lang]).toContain(String(v));
    }
  });
});

describe('case facts: paper-only values', () => {
  it('each entry of CASE_FACTS carries a source comment (paper section, table or figure; or the site file)', () => {
    const body = /export const CASE_FACTS = \{([\s\S]*?)\n\} as const;/.exec(SOURCE)?.[1] ?? '';
    const keys = [...body.matchAll(/^ {2}(\w+):/gm)].map((m) => m[1]!);
    expect(keys.length).toBeGreaterThan(20);
    expect(keys.sort()).toEqual(Object.keys(CASE_FACTS).sort());
    const lines = body.split('\n');
    for (const key of keys) {
      const i = lines.findIndex((line) => line.startsWith(`  ${key}:`));
      const comment = [lines[i - 1], lines[i]].map((line) => /\/\/(.*)$/.exec(line ?? '')?.[1] ?? '').join(' ');
      expect(comment, key).toMatch(/\b(?:paper (?:§|Table|Fig\.|abstract|front matter)|site |follow-up )/);
    }
  });

  it('pins the paper values (paper 308: §III-A to §III-D, §IV, Table II)', () => {
    expect(CASE_FACTS).toMatchInlineSnapshot(`
      {
        "binSec": 5,
        "bins": 6,
        "bluePositivePct": 50.5,
        "clusterGapSec": 18,
        "collectedMatches": 210000,
        "engagements": 1115123,
        "epochs": 15,
        "features": 2980,
        "interpGridSec": 5,
        "labelMaxSec": 60,
        "labelMinSec": 30,
        "matches": 206442,
        "mergeDistance": 2000,
        "mergeGapSec": 15,
        "minAlivePerTeam": 2,
        "onsetLeadSec": 10,
        "paperNumber": 308,
        "patches": {
          "test": "15.16",
          "train": "15.14",
          "val": "15.15",
        },
        "perMatchStated": 5.4,
        "proximity": 1800,
        "seeds": 3,
        "snapshotSec": 60,
        "splitDiameter": 4000,
        "strata": {
          "gold": [
            {
              "key": "close",
              "lgbm": 0.621,
              "neural": [
                0.495,
                0.526,
              ],
            },
            {
              "key": "moderate",
              "lgbm": 0.68,
              "neural": [
                0.553,
                0.584,
              ],
            },
            {
              "key": "oneSided",
              "lgbm": 0.796,
              "neural": [
                0.672,
                0.707,
              ],
            },
          ],
          "phase": [
            {
              "key": "early",
              "lgbm": 0.616,
              "neural": [
                0.524,
                0.542,
              ],
            },
            {
              "key": "mid",
              "lgbm": 0.712,
              "neural": [
                0.589,
                0.62,
              ],
            },
            {
              "key": "late",
              "lgbm": 0.807,
              "neural": [
                0.61,
                0.629,
              ],
            },
          ],
        },
        "windowSec": 30,
      }
    `);
  });

  it('the window is the six bins; the stated 5.4 per match is the computed ratio', () => {
    expect(CASE_FACTS.bins * CASE_FACTS.binSec).toBe(CASE_FACTS.windowSec);
    expect(perMatch()).toBe(CASE_FACTS.perMatchStated);
    expect(strataRows().map((r) => r.key)).toEqual(['early', 'mid', 'late', 'close', 'moderate', 'oneSided']);
  });
});

describe('case facts: derived values are computed', () => {
  it('the gap steps are differences of the AUC table and sum to the whole gap', () => {
    const steps = gapSteps();
    expect(steps.input).toBeCloseTo(auc('mlp') - 0.581, 9);
    expect(steps.input).toBe(0.045);
    expect(steps.learner).toBe(0.049);
    expect(steps.total).toBe(0.094);
    expect(Math.round((steps.input + steps.learner) * 1000)).toBe(Math.round(steps.total * 1000));
  });

  it('35 % of the way from chance to perfect; 135 of 200 pairs; 2 minutes is twice the snapshot interval', () => {
    expect(aboveChanceShare()).toBe(0.35);
    expect((auc('lightgbm') - CHANCE_AUC) / (PERFECT_AUC - CHANCE_AUC)).toBeCloseTo(aboveChanceShare(), 9);
    expect(pairCounts()).toEqual({ pairs: 200, right: 135, chance: 100, extra: 35, wrong: 65 });
    expect(nyquistMinutes()).toBe(2);
  });
});

describe('case.* fact tokens', () => {
  it('the resolver accepts case.<key> and every key resolves in both languages', () => {
    expect(FACT_TOKEN_PATTERNS).toContain('case.<key>');
    expect(CASE_TOKEN_KEYS.length).toBeGreaterThan(40);
    for (const key of CASE_TOKEN_KEYS) {
      for (const lang of ['ko', 'en'] as const) {
        const value = resolveFacts(`{case.${key}}`, lang, facts);
        expect(value, `${key} ${lang}`).not.toBe('');
        expect(value).toBe(caseTokens()[key]![lang]);
      }
    }
  });

  it('numbers are formatted per language from the data, never typed', () => {
    const both = (key: string) => [resolveFacts(`{case.${key}}`, 'ko', facts), resolveFacts(`{case.${key}}`, 'en', facts)];
    expect(both('engagements')).toEqual(['1,115,123', '1,115,123']);
    expect(both('auc-lgbm')).toEqual(['0.675', '0.675']);
    expect(both('gain-input')).toEqual(['0.045', '0.045']);
    expect(both('share')).toEqual(['35', '35']);
    expect(both('test')).toEqual(['15.16', '15.16']);
    expect(both('kg-n')).toEqual(['10,417,458', '10,417,458']);
    expect(both('nn-range')).toEqual(['0.569–0.581', '0.569–0.581']);
    expect(both('perfect')).toEqual(['1.0', '1.0']);
  });
});
