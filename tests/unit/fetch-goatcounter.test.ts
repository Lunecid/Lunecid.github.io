import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchStats, resolveCode, shapeStats, writeStats } from '../../scripts/fetch-goatcounter.mjs';
import { GOATCOUNTER } from '../../src/config';

type Route = { status: number; body: unknown };
function fakeFetch(routes: Record<string, Route>) {
  const calls: { url: URL; headers: Record<string, string> }[] = [];
  const impl = vi.fn(async (url: URL, init: { headers: Record<string, string> }) => {
    calls.push({ url, headers: init.headers });
    const hit = routes[url.pathname];
    if (!hit) throw new Error(`unexpected request ${url.href}`);
    return new Response(JSON.stringify(hit.body), { status: hit.status, headers: { 'Content-Type': 'application/json' } });
  });
  return { impl, calls };
}

const TOTAL = {
  total: 1234, total_events: 3, total_utc: 1234,
  stats: [{ day: '2026-09-24', daily: 40, hourly: [] }, { day: '2026-09-25', daily: 60, hourly: [] }],
};
const HITS = {
  hits: [
    { path_id: 1, path: '/', title: '백성은', event: false, count: 70 },
    { path_id: 2, path: 'cv-download', title: '', event: true, count: 5 },
    { path_id: 3, path: '/en/', title: 'Seongeun Baek', event: false, count: 30 },
  ],
  total: 105, more: false,
};
const REFS = { stats: [{ id: 1, name: '', count: 50 }, { id: 2, name: 'github.com', count: 20 }], more: false };
const OK: Record<string, Route> = {
  '/api/v0/stats/total': { status: 200, body: TOTAL },
  '/api/v0/stats/hits': { status: 200, body: HITS },
  '/api/v0/stats/toprefs': { status: 200, body: REFS },
};
const NOW = new Date('2026-09-26T18:42:13.500Z');
const tempDirs: string[] = [];

afterEach(() => {
  vi.unstubAllGlobals();
  for (const d of tempDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('fetch-goatcounter', () => {
  it('importing the module performs no fetch and writes no file', async () => {
    const target = join(process.cwd(), 'src/data/generated/stats.json');
    const before = existsSync(target) ? statSync(target).mtimeMs : null;
    const fetchSpy = vi.fn(() => {
      throw new Error('fetch must not run on import');
    });
    vi.stubGlobal('fetch', fetchSpy);
    vi.resetModules();
    const mod = await import('../../scripts/fetch-goatcounter.mjs');
    expect(typeof mod.fetchStats).toBe('function');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(existsSync(target) ? statSync(target).mtimeMs : null).toBe(before);
  });

  it('resolveCode uses GOATCOUNTER.code when env is unset and rejects a different env code', () => {
    expect(resolveCode(undefined, GOATCOUNTER.code)).toEqual({ code: GOATCOUNTER.code, error: null });
    expect(resolveCode('', 'lunecid')).toEqual({ code: 'lunecid', error: null });
    expect(resolveCode(' lunecid ', 'lunecid')).toEqual({ code: 'lunecid', error: null });
    expect(resolveCode('someone-else', 'lunecid')).toEqual({ code: null, error: 'GOATCOUNTER_CODE differs from src/config.ts' });
    expect(resolveCode('lunecid', null)).toEqual({ code: null, error: 'GOATCOUNTER_CODE differs from src/config.ts' });
  });

  it('no code or token → skipped', async () => {
    const { impl } = fakeFetch(OK);
    const noCode = await fetchStats({ code: null, token: 'tok', fetchImpl: impl, now: NOW, pauseMs: 0 });
    expect(noCode).toMatchObject({ schemaVersion: 1, source: 'goatcounter', status: 'skipped', total: null, range: null, authFailed: false, maxAgeDays: 7 });
    expect(noCode.fetchedAt).toBe(NOW.toISOString());
    const noToken = await fetchStats({ code: 'lunecid', token: '', fetchImpl: impl, now: NOW, pauseMs: 0 });
    expect(noToken.status).toBe('skipped');
    expect(noToken.errors[0]).toMatch(/GOATCOUNTER_TOKEN/);
    expect(impl).not.toHaveBeenCalled();
  });

  it('shapes total, daily, pages (events dropped) and referrers (empty name → null)', async () => {
    const { impl } = fakeFetch(OK);
    const data = await fetchStats({ code: 'lunecid', token: 'tok', fetchImpl: impl, now: NOW, pauseMs: 0 });
    expect(data.status).toBe('ok');
    expect(data.total).toBe(1234);
    expect(data.daily).toEqual([{ day: '2026-09-24', count: 40 }, { day: '2026-09-25', count: 60 }]);
    expect(data.pages).toEqual([{ path: '/', title: '백성은', count: 70 }, { path: '/en/', title: 'Seongeun Baek', count: 30 }]);
    expect(data.referrers).toEqual([{ name: null, count: 50 }, { name: 'github.com', count: 20 }]);
    expect(data.errors).toEqual([]);
    expect(shapeStats({ status: 'ok', total: TOTAL, hits: HITS, refs: REFS, now: NOW }).pages).toHaveLength(2);
  });

  it('final review fix 1 item 8: hostile paths and referrers never reach stats.json', async () => {
    const hostileHits = {
      hits: [
        ...HITS.hits,
        { path_id: 4, path: '/<script>alert(1)</script>', title: '<script>alert(1)</script>', event: false, count: 900 },
        { path_id: 5, path: '/buy-cheap-pills/', title: 'spam', event: false, count: 800 },
        { path_id: 6, path: `/records/?${'x'.repeat(5000)}`, title: 'long', event: false, count: 700 },
        { path_id: 7, path: '/game/records/?utm_source=newsletter', title: '기록', event: false, count: 4 },
        { path_id: 8, path: '/game/records/', title: '기록', event: false, count: 6 },
        { path_id: 9, path: '/records/', title: '기록', event: false, count: 40 }, // legacy game URL: dropped (A-9)
      ],
      total: 2000,
      more: false,
    };
    const hostileRefs = {
      stats: [
        ...REFS.stats,
        { id: 3, name: `https://${'a'.repeat(400)}.example/`, count: 999 },
        { id: 4, name: 'javascript:alert(1)', count: 500 },
        { id: 5, name: '<img src=x onerror=alert(1)>', count: 400 },
        { id: 6, name: 'Buy cheap pills now', count: 300 },
        { id: 7, name: 'https://github.com/Lunecid?tab=repositories', count: 2 },
      ],
      more: false,
    };
    const { impl } = fakeFetch({
      ...OK,
      '/api/v0/stats/hits': { status: 200, body: hostileHits },
      '/api/v0/stats/toprefs': { status: 200, body: hostileRefs },
    });
    const data = await fetchStats({ code: 'lunecid', token: 'tok', fetchImpl: impl, now: NOW, pauseMs: 0 });
    expect(data.status).toBe('ok');
    expect(data.pages.map((p: { path: string; count: number }) => [p.path, p.count])).toEqual([
      ['/', 70],
      ['/en/', 30],
      ['/game/records/', 10],
    ]);
    expect(data.pages.map((p: { path: string }) => p.path), 'A-9: legacy paths leave the top pages').not.toContain('/records/');
    expect(data.referrers).toEqual([{ name: null, count: 50 }, { name: 'github.com', count: 22 }]);
    const json = JSON.stringify(data);
    for (const bad of ['<script', 'buy-cheap-pills', 'javascript:', 'onerror', 'Buy cheap', 'xxxxxxxxxx', 'aaaaaaaaaa']) expect(json, bad).not.toContain(bad);
  });

  it('final review fix 1 round 2 item 6: spam rows at the top cannot crowd the real routes out; the published lists stay top 10', async () => {
    const spamHits = Array.from({ length: 30 }, (_, i) => ({ path_id: 100 + i, path: `/spam-${i}/`, title: 'spam', event: false, count: 1000 - i }));
    const realHits = ['/', '/en/', '/game/records/', '/game/research/', '/game/projects/', '/en/game/records/', '/game/player-log/', '/stats/', '/privacy/', '/credits/', '/en/game/research/'].map(
      (path, i) => ({ path_id: i + 1, path, title: '', event: false, count: 50 - i }),
    );
    const spamRefs = Array.from({ length: 30 }, (_, i) => ({ id: 100 + i, name: `<b>spam ${i}</b>`, count: 1000 - i }));
    const realRefs = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, name: `site${i}.example`, count: 40 - i }));
    const { impl, calls } = fakeFetch({
      ...OK,
      '/api/v0/stats/hits': { status: 200, body: { hits: [...spamHits, ...realHits], more: true } },
      '/api/v0/stats/toprefs': { status: 200, body: { stats: [...spamRefs, ...realRefs], more: true } },
    });
    const data = await fetchStats({ code: 'lunecid', token: 'tok', fetchImpl: impl, now: NOW, pauseMs: 0 });
    expect(calls[1].url.searchParams.get('limit')).toBe('50');
    expect(calls[2].url.searchParams.get('limit')).toBe('50');
    expect(data.pages.map((p: { path: string }) => p.path)).toEqual(realHits.slice(0, 10).map((h) => h.path));
    expect(data.referrers.map((r: { name: string | null }) => r.name)).toEqual(realRefs.slice(0, 10).map((r) => r.name));
  });

  it('non-ok response → error with message', async () => {
    const { impl } = fakeFetch({ ...OK, '/api/v0/stats/hits': { status: 500, body: {} } });
    const data = await fetchStats({ code: 'lunecid', token: 'tok', fetchImpl: impl, now: NOW, pauseMs: 0 });
    expect(data.status).toBe('error');
    expect(data.errors).toEqual(['GoatCounter /stats/hits -> 500']);
    expect(data.authFailed).toBe(false);
    expect(data.total).toBeNull();
    expect(data.daily).toEqual([]);
  });

  it('401/403 → authFailed', async () => {
    for (const status of [401, 403]) {
      const { impl } = fakeFetch({ ...OK, '/api/v0/stats/total': { status, body: {} } });
      const data = await fetchStats({ code: 'lunecid', token: 'tok', fetchImpl: impl, now: NOW, pauseMs: 0 });
      expect(data.status).toBe('error');
      expect(data.authFailed).toBe(true);
      expect(data.errors).toEqual([`GoatCounter /stats/total -> ${status}`]);
    }
  });

  it('range is the last 30 days rounded to the hour', async () => {
    const { impl, calls } = fakeFetch(OK);
    const data = await fetchStats({ code: 'lunecid', token: 'tok', fetchImpl: impl, now: NOW, pauseMs: 0 });
    expect(data.range).toEqual({ start: '2026-08-27T18:00:00.000Z', end: '2026-09-26T18:00:00.000Z' });
    expect(calls.map((c) => c.url.pathname)).toEqual(['/api/v0/stats/total', '/api/v0/stats/hits', '/api/v0/stats/toprefs']);
    for (const c of calls) {
      expect(c.url.host).toBe('lunecid.goatcounter.com');
      expect(c.url.searchParams.get('start')).toBe('2026-08-27T18:00:00.000Z');
      expect(c.url.searchParams.get('end')).toBe('2026-09-26T18:00:00.000Z');
      expect(c.headers.Authorization).toBe('Bearer tok');
    }
    expect(calls[1].url.searchParams.get('limit')).toBe('50'); // round 2 item 6: fetch more than the published top 10, then clean
    expect(calls[2].url.searchParams.get('limit')).toBe('50');
  });

  it('writeStats writes only into the given outDir', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sb-stats-'));
    tempDirs.push(dir);
    const data = shapeStats({ status: 'skipped', errors: ['GOATCOUNTER_TOKEN not set'], now: NOW });
    const written = await writeStats(data, dir);
    expect(written).toBe(join(dir, 'stats.json'));
    expect(readdirSync(dir)).toEqual(['stats.json']);
    expect(JSON.parse(readFileSync(written, 'utf8'))).toEqual(data);
  });
});
