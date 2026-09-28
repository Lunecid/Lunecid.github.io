// Pure headroom math for /print/* PDF builds (no browser). Used by scripts/build-pdfs.mjs
// before page.pdf() so a near-full last page fails the build instead of only failing later in CI.

/** @typedef {{ pages: number; minFreePercent: number }} HeadroomBudget */

/** Documents with a fixed page budget and a required free % on the last budgeted page. */
export const HEADROOM_BUDGETS = /** @type {Readonly<Record<string, HeadroomBudget>>} */ ({
  'resume-en': { pages: 1, minFreePercent: 8 },
  'resume-ko': { pages: 2, minFreePercent: 5 },
});

/**
 * Free space on the last budgeted page as a percentage of one printable page height.
 * Negative when content overflows the budget.
 * @param {number} contentHeight
 * @param {number} printableHeight
 * @param {number} pageBudget
 */
export function lastPageFreePercent(contentHeight, printableHeight, pageBudget) {
  if (!(printableHeight > 0)) throw new Error(`printableHeight must be > 0, got ${printableHeight}`);
  if (!(pageBudget > 0)) throw new Error(`pageBudget must be > 0, got ${pageBudget}`);
  return ((pageBudget * printableHeight - contentHeight) / printableHeight) * 100;
}

/**
 * Local Chrome vs CI Chromium lay text out at slightly different heights. The local
 * minFreePercent is a Windows gate; in CI only real overflow (free < 0%) fails the build.
 * @param {HeadroomBudget} budget
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 */
export function effectiveMinFree(budget, env) {
  const ci = env.CI;
  if (ci === 'true' || ci === '1') return 0;
  return budget.minFreePercent;
}

/**
 * @param {string} id
 * @param {number} freePercent
 * @param {number} minFreePercent
 */
export function assertMinFree(id, freePercent, minFreePercent) {
  if (freePercent < minFreePercent) {
    const n = Math.floor(freePercent);
    throw new Error(`${id}: only ${n}% free on the last page; budget needs ≥ ${minFreePercent}%`);
  }
}
