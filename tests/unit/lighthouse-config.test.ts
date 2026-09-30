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

describe('Lighthouse budget (A-21, P1-19)', () => {
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
