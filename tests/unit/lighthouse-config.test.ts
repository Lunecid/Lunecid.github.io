// A-21 / spec §12 CI 시간: fewer Lighthouse runs, same budgets, every URL a real route.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { allRoutes, parseRoute } from '../../src/lib/routes';

interface Lhci {
  ci: {
    collect: { staticDistDir: string; url: string[]; numberOfRuns: number; settings: Record<string, unknown> };
    assert: { assertions: Record<string, unknown> };
    upload: { outputDir: string };
  };
}
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8')) as Lhci;
const paths = (c: Lhci) => c.ci.collect.url.map((u) => new URL(u).pathname);
const mobile = read('lighthouserc.json');
const secondary = read('lighthouserc.secondary.json');
const desktop = read('lighthouserc.desktop.json');

/**
 * The chooser's own budget (motion plan amendment A.2: mobile, median of 3 Lighthouse CLI runs on the MO preview port;
 * LCP = the reference median + 100 ms; LCP element inside .desk). Re-baselined 2026-10-05 after MO-23 (controller
 * ruling): the v6.4 desk measured / 2105 ms (perf 0.99) and /en/ 1434 ms (perf 1.00) after the non-design fixes, so the
 * MO-20 reference (/ 1670 ms, /en/ 1383 ms, measured on the old two-panel chooser) is replaced. MO-26/MO-31 compare
 * against these values. /en/ re-baselined again 2026-10-05 (owner ruling, chooser v6.12 desk after MO-36): measured
 * 1656 ms (median of six runs, bimodal 1505/1731; perf 0.99-1.00), was 1434. / re-baselined 2026-10-06 (controller
 * ruling): measured 2413 ms (idle median of five, 2407-2487; perf 0.97), was 2105. The budget is the reference + 100 ms
 * capped at the Core Web Vitals "good" ceiling of 2500 ms, which stays a guard on the budget itself (motion plan B.3:
 * a re-baseline needs perf >= 0.97 and LCP <= 2500 ms; controller ruling 2026-10-06 on the cap).
 */
const CHOOSER_BUDGET = {
  '/': { referenceLcpMs: 2413, lcpMs: 2500, minPerformance: 0.95 },
  '/en/': { referenceLcpMs: 1656, lcpMs: 1756, minPerformance: 0.95 },
} as const;

describe('Lighthouse budget (A-21, P1-19)', () => {
  it('MO-23: the chooser budget is the re-baselined reference + 100 ms, capped at, and within, Core Web Vitals "good" (LCP ≤ 2.5 s)', () => {
    for (const [route, b] of Object.entries(CHOOSER_BUDGET)) {
      expect(b.lcpMs, route).toBe(Math.min(b.referenceLcpMs + 100, 2500));
      expect(b.lcpMs, route).toBeLessThanOrEqual(2500);
      expect(b.minPerformance, route).toBeGreaterThanOrEqual(0.95);
      expect(paths(mobile).concat(paths(desktop)), route).toContain(route === '/en/' ? '/' : route);
    }
  });

  it('3 mobile runs for the chooser and both homes, 1 mobile run for the secondary list, 1 desktop run for all', () => {
    expect(paths(mobile)).toEqual(['/', '/game/', '/data/']);
    expect(mobile.ci.collect.numberOfRuns).toBe(3);
    expect(paths(secondary)).toEqual(['/en/game/', '/game/projects/', '/game/research/cog-2026-engagement/', '/game/records/', '/game/player-log/', '/data/projects/', '/data/projects/school-zone-blindspots/', '/data/research/cog-2026-engagement/', '/data/records/', '/stats/', '/404.html']);
    expect(secondary.ci.collect.numberOfRuns).toBe(1);
    expect(paths(desktop)).toEqual([...paths(mobile), ...paths(secondary)]);
    expect(desktop.ci.collect.numberOfRuns).toBe(1);
    expect(desktop.ci.collect.settings.preset).toBe('desktop');
    expect(mobile.ci.collect.settings.preset).toBeUndefined();
    expect(secondary.ci.collect.settings.preset).toBeUndefined();
    // Counts are computed from the configs (contract §2.1), never pinned; the budget only has to beat the pre-move
    // configs: 6 URLs × 3 mobile runs + 6 URLs × 3 desktop runs = 36.
    // P1-19: 9 + 9 + 12 = 30 runs; P2-13: 9 + 11 + 14 = 34 (contract A-21).
    const runs = paths(mobile).length * mobile.ci.collect.numberOfRuns + paths(secondary).length * secondary.ci.collect.numberOfRuns + paths(desktop).length * desktop.ci.collect.numberOfRuns;
    expect(runs).toBeLessThan(36);
    for (const p of paths(desktop)) expect([...allRoutes(), '/404.html'], p).toContain(p);
  });

  it('contract §0.1: every page kind is measured (chooser, both versions, a shared page, the 404)', () => {
    const kind = (p: string): string => {
      if (p === '/404.html') return 'not-found';
      const info = parseRoute(p);
      return info?.kind === 'variant' ? `variant:${info.variant}` : String(info?.kind);
    };
    expect([...new Set(paths(desktop).map(kind))].sort()).toEqual(['chooser', 'not-found', 'shared', 'variant:data', 'variant:game']);
    expect([...new Set([...paths(mobile), ...paths(secondary)].map(kind))].sort()).toEqual(['chooser', 'not-found', 'shared', 'variant:data', 'variant:game']);
  });

  it('the same budgets in every config: performance ≥ 0.9 (median run), accessibility ≥ 0.95; separate report folders', () => {
    for (const c of [mobile, secondary, desktop]) {
      expect(c.ci.collect.staticDistDir).toBe('./dist');
      expect(c.ci.assert.assertions['categories:performance']).toEqual(['error', { minScore: 0.9, aggregationMethod: 'median-run' }]);
      expect(c.ci.assert.assertions['categories:accessibility']).toEqual(['error', { minScore: 0.95 }]);
      expect(c.ci.collect.url.every((u) => u.startsWith('http://localhost/'))).toBe(true);
    }
    expect(new Set([mobile, secondary, desktop].map((c) => c.ci.upload.outputDir)).size).toBe(3);
  });

  it('npm run test:lh runs the three configs in order', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts['test:lh']).toBe('lhci autorun && lhci autorun --config=lighthouserc.secondary.json && lhci autorun --config=lighthouserc.desktop.json');
  });
});
