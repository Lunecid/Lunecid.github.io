import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  HEADROOM_BUDGETS,
  assertMinFree,
  effectiveMinFree,
  lastPageFreePercent,
} from '../../scripts/pdf-headroom.mjs';

test('lastPageFreePercent is free height on the last budgeted page as % of one page', () => {
  assert.equal(lastPageFreePercent(92, 100, 1), 8);
  assert.equal(lastPageFreePercent(195, 100, 2), 5);
  assert.equal(lastPageFreePercent(50, 100, 1), 50);
  assert.equal(lastPageFreePercent(210, 100, 2), -10);
});

test('lastPageFreePercent rejects non-positive sizes', () => {
  assert.throws(() => lastPageFreePercent(10, 0, 1), /printableHeight/);
  assert.throws(() => lastPageFreePercent(10, 100, 0), /pageBudget/);
});

test('assertMinFree throws the build message when below threshold', () => {
  assert.throws(() => assertMinFree('resume-en', 7.9, 8), /resume-en: only 7% free on the last page; budget needs ≥ 8%/);
  assert.doesNotThrow(() => assertMinFree('resume-en', 8, 8));
  assert.doesNotThrow(() => assertMinFree('resume-ko', 5.4, 5));
});

test('effectiveMinFree keeps the budget locally and returns 0 in CI', () => {
  const budget = { pages: 1, minFreePercent: 8 };
  assert.equal(effectiveMinFree(budget, {}), 8);
  assert.equal(effectiveMinFree(budget, { CI: undefined }), 8);
  assert.equal(effectiveMinFree(budget, { CI: 'true' }), 0);
  assert.equal(effectiveMinFree(budget, { CI: '1' }), 0);
});

test('assertMinFree with CI floor (0) only rejects real overflow', () => {
  assert.throws(() => assertMinFree('resume-en', -1, 0), /resume-en: only -1% free on the last page; budget needs ≥ 0%/);
  assert.doesNotThrow(() => assertMinFree('resume-en', 3, 0));
});

test('HEADROOM_BUDGETS cover the four résumés', () => {
  assert.deepEqual(HEADROOM_BUDGETS['resume-en'], { pages: 1, minFreePercent: 8 });
  assert.deepEqual(HEADROOM_BUDGETS['resume-ko'], { pages: 2, minFreePercent: 5 });
  assert.deepEqual(HEADROOM_BUDGETS['resume-data-en'], { pages: 1, minFreePercent: 8 });
  assert.deepEqual(HEADROOM_BUDGETS['resume-data-ko'], { pages: 2, minFreePercent: 5 });
  assert.equal(HEADROOM_BUDGETS['cv-academic'], undefined);
});
