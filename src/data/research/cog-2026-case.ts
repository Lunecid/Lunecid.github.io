// The facts of the CoG 2026 case-study overlay (src/lib/case/*): every number the sheet shows, in one typed file.
// Values the site already states are re-exported from cog-2026.ts (the AUC table, chance, the kill-gap figure values) or
// checked against the publication frontmatter (tests/unit/case-facts.test.ts); paper-only values carry the section,
// table or figure of the paper (S. Baek and J. Kwon, IEEE CoG 2026, paper 308) they come from; derived values are
// functions, never typed. Copy reaches these numbers only through the {case.<key>} fact tokens (caseTokens below).
import { formatNumber, type Localized } from '../../i18n/utils';
import type { Lang } from '../../i18n/ui';
import { CHANCE_AUC, killGap, overallAuc } from './cog-2026';

export { CHANCE_AUC, killGap, overallAuc };

/** The top of the AUC scale (a perfect ranking), for the chance-to-perfect gauge. */
export const PERFECT_AUC = 1;

/** The case ids that have an overlay (src/lib/publications.ts CASE_IDS reads the publication id). */
export const CASE_ID = 'cog-2026-engagement';

/** The five baselines Table II's neural range summarizes (its note: Layered is not among them). */
export const NEURAL_STRATA_MODELS = ['Bi-GRU', 'Transformer', 'Cross-Attn', 'ST-GNN', 'GraphSAGE'] as const;

export interface StratumRow {
  key: 'early' | 'mid' | 'late' | 'close' | 'moderate' | 'oneSided';
  lgbm: number;
  /** Min–max of the five non-tabular neural baselines (Bi-GRU, Transformer, Cross-Attn, ST-GNN, GraphSAGE). */
  neural: readonly [number, number];
}

export const CASE_FACTS = {
  // paper §I, §III: the Match-Timeline API gives participant snapshots every 60 s
  snapshotSec: 60,
  // paper §III-C (and the publication fact `window`): the observation window before onset
  windowSec: 30,
  // paper §III-C: the window is divided into six 5 s bins
  bins: 6,
  // paper §III-C: bin width
  binSec: 5,
  // paper §III-C: onset t_e is placed 10 s before the earliest kill
  onsetLeadSec: 10,
  // paper §III-C: the label window lasts at least 30 s (or to the last kill if later) ...
  labelMinSec: 30,
  // paper §III-C: ... with a cap of 60 s, truncated at an ace
  labelMaxSec: 60,
  // paper §III-A: matches collected (Korean Master+ ranked solo/duo)
  collectedMatches: 210_000,
  // paper §III-A (and the publication fact `matches`): matches left after filtering incomplete timelines
  matches: 206_442,
  // paper §III-B (and the abstract): validated engagements
  engagements: 1_115_123,
  // paper §III-B: "about 5.4 per match" (perMatch() computes it; the test checks the two agree)
  perMatchStated: 5.4,
  // paper §III-B: consecutive kills within 18 s are grouped
  clusterGapSec: 18,
  // paper §III-B: a cluster with a spatial diameter above 4,000 game units is split
  splitDiameter: 4000,
  // paper §III-B: at least two alive players from each team ...
  minAlivePerTeam: 2,
  // paper §III-B: ... within 1,800 units of the earliest kill location
  proximity: 1800,
  // paper §III-B: adjacent validated candidates within 15 s ...
  mergeGapSec: 15,
  // paper §III-B: ... and 2,000 units are merged
  mergeDistance: 2000,
  // paper §III-B: positions are interpolated onto a 5 s grid for localization only
  interpGridSec: 5,
  // paper §III-C: blue-side positive rate
  bluePositivePct: 50.5,
  // paper §III-D: the tabular view after pruning
  features: 2980,
  // paper §III-D: neural models train for 15 epochs ...
  epochs: 15,
  // paper §III-D, §IV: ... with three random seeds; all values are three-seed means
  seeds: 3,
  // paper §III-A: the chronological patch-holdout split
  patches: { train: '15.14', val: '15.15', test: '15.16' },
  // Conditional test AUC by game phase and pre-engagement gold state; neural = min–max of the five non-tabular baselines
  // (Layered excluded, per the table note): paper Table II
  strata: {
    phase: [
      { key: 'early', lgbm: 0.616, neural: [0.524, 0.542] },
      { key: 'mid', lgbm: 0.712, neural: [0.589, 0.62] },
      { key: 'late', lgbm: 0.807, neural: [0.61, 0.629] },
    ],
    gold: [
      { key: 'close', lgbm: 0.621, neural: [0.495, 0.526] },
      { key: 'moderate', lgbm: 0.68, neural: [0.553, 0.584] },
      { key: 'oneSided', lgbm: 0.796, neural: [0.672, 0.707] },
    ],
  },
  // paper front matter: the CoG 2026 paper number (reference [S6])
  paperNumber: 308,
} as const;

/** Rounded to `d` decimals (the float noise of a difference of two table values). */
const round = (v: number, d: number): number => Math.round(v * 10 ** d) / 10 ** d;
const aucOf = (id: string): number => {
  const row = overallAuc.find((r) => r.id === id);
  if (!row) throw new Error(`cog-2026-case: no AUC row ${id}`);
  return row.auc;
};

/** Engagements per match (paper §III-B: "about 5.4"). */
export const perMatch = (): number => round(CASE_FACTS.engagements / CASE_FACTS.matches, 1);

/** The best non-tabular neural AUC and the models that reach it (ties). */
export function neuralBest(): { auc: number; models: string[] } {
  const neural = overallAuc.filter((r) => r.group === 'neural');
  const auc = Math.max(...neural.map((r) => r.auc));
  return { auc, models: neural.filter((r) => r.auc === auc).map((r) => r.model) };
}

/** Min–max of the non-tabular neural baselines of Table I. */
export function neuralRange(): [number, number] {
  const neural = overallAuc.filter((r) => r.group === 'neural').map((r) => r.auc);
  return [Math.min(...neural), Math.max(...neural)];
}

/** The gap from the best neural model to LightGBM in two steps: input representation (→ MLP), then learner (→ LightGBM). */
export function gapSteps(): { from: number; mlp: number; to: number; input: number; learner: number; total: number } {
  const from = neuralBest().auc;
  const mlp = aucOf('mlp');
  const to = aucOf('lightgbm');
  return { from, mlp, to, input: round(mlp - from, 3), learner: round(to - mlp, 3), total: round(to - from, 3) };
}

/** LightGBM's share of the distance from chance (0.5) to a perfect ranking (1.0). */
export const aboveChanceShare = (): number => round((aucOf('lightgbm') - CHANCE_AUC) / (PERFECT_AUC - CHANCE_AUC), 4);

/** Pairs of the "200 pairs" reading of AUC: the expected count ranked right (AUC × pairs), and its parts. */
export const PAIRS = 200;
export function pairCounts(): { pairs: number; right: number; chance: number; extra: number; wrong: number } {
  const right = Math.round(aucOf('lightgbm') * PAIRS);
  const chance = Math.round(CHANCE_AUC * PAIRS);
  return { pairs: PAIRS, right, chance, extra: right - chance, wrong: PAIRS - right };
}

/** Changes faster than twice the sampling interval cannot be recovered (Nyquist–Shannon): 2 × 60 s, in minutes. */
export const nyquistMinutes = (): number => (2 * CASE_FACTS.snapshotSec) / 60;

/** Table II's six strata, phase then gold. */
export const strataRows = (): readonly StratumRow[] => [...CASE_FACTS.strata.phase, ...CASE_FACTS.strata.gold];

/** AUC as the paper's tables print it on the site: three decimals. */
export const fmtAuc = (v: number): string => v.toFixed(3);
const range = ([lo, hi]: readonly [number, number]): string => `${fmtAuc(lo)}–${fmtAuc(hi)}`;

/** Literature the sheet cites in its "details" (bibliographic data, shown in the references list). */
export const CASE_LITERATURE = {
  shannon: { cite: 'Shannon, 1949', ref: 'C. E. Shannon, “Communication in the presence of noise,” <i>Proc. IRE</i>, vol. 37, no. 1, pp. 10–21, 1949.' },
  cover: { cite: 'Cover & Thomas, 2006', ref: 'T. M. Cover and J. A. Thomas, <i>Elements of Information Theory</i>, 2nd ed. Hoboken, NJ, USA: Wiley, 2006.' },
  grinsztajn: { cite: 'NeurIPS 2022', ref: 'L. Grinsztajn, E. Oyallon, and G. Varoquaux, “Why do tree-based models still outperform deep learning on typical tabular data?” in <i>Advances in Neural Information Processing Systems (NeurIPS)</i>, vol. 35, 2022, pp. 507–520.' },
} as const;

/**
 * The {case.<key>} token values (src/lib/facts.ts reads them): numbers formatted per language from CASE_FACTS, the AUC
 * table and the derived functions above.
 */
export function caseTokens(): Record<string, Localized> {
  const n = (v: number): Localized => ({ ko: formatNumber(v, 'ko'), en: formatNumber(v, 'en') });
  const same = (s: string): Localized => ({ ko: s, en: s });
  const loc = (ko: string, en: string): Localized => ({ ko, en });
  const f = CASE_FACTS;
  const gap = gapSteps();
  const minutes = f.snapshotSec / 60;
  const pairs = pairCounts();
  const strata = Object.fromEntries(strataRows().flatMap((r) => {
    const key = r.key === 'oneSided' ? 'one-sided' : r.key;
    return [[key, same(fmtAuc(r.lgbm))], [`${key}-nn`, same(range(r.neural))]];
  }));
  return {
    zero: n(0),
    'unit-sec': n(1),
    snapshot: n(f.snapshotSec),
    span: n(2 * f.snapshotSec),
    // the snapshot interval in minutes, as Korean and English phrase it (1분마다 / once a minute, 1분 / minute)
    'snapshot-every': loc(`${formatNumber(minutes, 'ko')}분마다`, minutes === 1 ? 'once a minute' : `every ${formatNumber(minutes, 'en')} minutes`),
    'snapshot-adj': loc(`${formatNumber(minutes, 'ko')}분`, minutes === 1 ? 'minute' : `${formatNumber(minutes, 'en')}-minute`),
    'sub-snapshot': loc(`${formatNumber(minutes, 'ko')}분 미만의`, minutes === 1 ? 'sub-minute' : `sub-${formatNumber(minutes, 'en')}-minute`),
    window: n(f.windowSec),
    bins: n(f.bins),
    bin: n(f.binSec),
    'bin-last': n(f.bins - 1),
    onset: n(f.onsetLeadSec),
    'label-min': n(f.labelMinSec),
    'label-max': n(f.labelMaxSec),
    engagements: n(f.engagements),
    'per-match': n(perMatch()),
    'cluster-gap': n(f.clusterGapSec),
    split: n(f.splitDiameter),
    alive: n(f.minAlivePerTeam),
    proximity: n(f.proximity),
    'merge-gap': n(f.mergeGapSec),
    'merge-dist': n(f.mergeDistance),
    grid: n(f.interpGridSec),
    blue: n(f.bluePositivePct),
    features: n(f.features),
    epochs: n(f.epochs),
    seeds: n(f.seeds),
    train: same(f.patches.train),
    val: same(f.patches.val),
    test: same(f.patches.test),
    chance: same(String(CHANCE_AUC)),
    perfect: same(PERFECT_AUC.toFixed(1)),
    'auc-lgbm': same(fmtAuc(aucOf('lightgbm'))),
    'auc-mlp': same(fmtAuc(aucOf('mlp'))),
    'nn-best': same(fmtAuc(gap.from)),
    'nn-range': same(range(neuralRange())),
    'gain-input': same(fmtAuc(gap.input)),
    'gain-learner': same(fmtAuc(gap.learner)),
    'gain-total': same(fmtAuc(gap.total)),
    share: n(round(aboveChanceShare() * 100, 1)),
    'share-frac': same(String(aboveChanceShare())),
    'nn-count': n(overallAuc.filter((r) => r.group === 'neural').length),
    'nn-strata-count': n(NEURAL_STRATA_MODELS.length),
    pairs: n(pairs.pairs),
    'pairs-right': n(pairs.right),
    'pairs-chance': n(pairs.chance),
    'pairs-extra': n(pairs.extra),
    'pairs-wrong': n(pairs.wrong),
    ...strata,
    'kg-n': n(killGap.n),
    'kg-mode1': same(String(killGap.modes[0])),
    'kg-mode2': same(String(killGap.modes[1])),
    'kg-valley': same(String(killGap.valley)),
    'kg-band': same(`${killGap.ariBand[0]}–${killGap.ariBand[1]}`),
    ari: same(String(killGap.ariMin)),
    nyquist: n(nyquistMinutes()),
    'half-period': same('T/2'),
    'sign-pos': same('+1'),
    'sign-neg': same('−1'),
    'y-pos': same('y = 1'),
    'cite-shannon': same(CASE_LITERATURE.shannon.cite),
    'cite-cover': loc(`${CASE_LITERATURE.cover.cite}, 2.8절`, `${CASE_LITERATURE.cover.cite}, §2.8`),
    'cite-grinsztajn': loc(`Grinsztajn 외, ${CASE_LITERATURE.grinsztajn.cite}`, `Grinsztajn et al., ${CASE_LITERATURE.grinsztajn.cite}`),
    'paper-fig': same('1'),
    'paper-eq': same('(1)'),
  };
}

/** Every {case.<key>} key, in declaration order. */
export const CASE_TOKEN_KEYS: readonly string[] = Object.keys(caseTokens());

/** Resolved token values for one language (charts and the sheet read numbers through the same strings as the copy). */
export const caseToken = (key: string, lang: Lang): string => {
  const value = caseTokens()[key];
  if (!value) throw new Error(`cog-2026-case: unknown case token ${key}`);
  return value[lang];
};
