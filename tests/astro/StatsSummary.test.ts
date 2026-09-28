import { describe, expect, it } from 'vitest';
import StatsSummary from '../../src/components/stats/StatsSummary.astro';
import type { StatsData } from '../../src/lib/generated';
import { renderAstro } from './helpers';

function stats(over: Partial<StatsData> = {}): StatsData {
  return {
    schemaVersion: 1, source: 'goatcounter', status: 'ok',
    fetchedAt: new Date(Date.now() - 3_600_000).toISOString(), maxAgeDays: 7, authFailed: false,
    range: { start: '2026-08-27T18:00:00.000Z', end: '2026-09-26T18:00:00.000Z' }, total: 1234,
    daily: [{ day: '2026-09-25', count: 60 }], pages: [{ path: '/', title: '백성은', count: 70 }],
    referrers: [{ name: null, count: 50 }], errors: [],
    ...over,
  };
}

describe('StatsSummary', () => {
  it('P2-33: an OFFLINE panel (stats open after GoatCounter is connected, link to privacy) when code is null', async () => {
    const html = await renderAstro(StatsSummary, { props: { lang: 'ko', stats: stats(), code: null } });
    expect(html).toMatch(/<section[^>]*id="summary"/);
    expect(html).toMatch(/<div[^>]*class="stats__offline bracket bracket--sm"[^>]*data-stats-offline/);
    expect(html).toMatch(/<p[^>]*class="stats__offline-tag"[^>]*lang="en"[^>]*>\[ OFFLINE \]<\/p>/);
    expect(html).toContain('방문 통계는 GoatCounter를 연결한 뒤 이 페이지에 공개합니다. 아직 방문 통계를 모으지 않습니다.');
    expect(html).toMatch(/<a href="\/privacy\/"[^>]*>통계를 켜면 모을 항목 보기 \(개인정보 처리방침\)<\/a>/);
    expect(html).not.toContain('<astro-island');
    expect(html).not.toContain('goatcounter.com');
    expect(html).not.toContain('data-fetched-at');
    const en = await renderAstro(StatsSummary, { props: { lang: 'en', stats: stats(), code: null } });
    expect(en).toContain('[ OFFLINE ]');
    expect(en).toContain('Visitor statistics will be published on this page once GoatCounter is connected.');
    expect(en).toMatch(/<a href="\/en\/privacy\/"[^>]*>What would be collected \(privacy policy\)<\/a>/);
    // with a code there is no OFFLINE panel
    const on = await renderAstro(StatsSummary, { props: { lang: 'ko', stats: stats(), code: 'lunecid' } });
    expect(on).not.toContain('OFFLINE');
  });

  it('stats.unavailable with a code but no usable stats', async () => {
    for (const s of [undefined, stats({ status: 'error' }), stats({ fetchedAt: '2026-01-01T00:00:00.000Z' })]) {
      const html = await renderAstro(StatsSummary, { props: { lang: 'ko', stats: s, code: 'lunecid' } });
      expect(html).toContain('통계를 불러오지 못했습니다.');
      expect(html).not.toContain('data-fetched-at');
    }
  });

  it('total, range and as-of with stats, inside a data-fetched-at element', async () => {
    const s = stats();
    const html = await renderAstro(StatsSummary, { props: { lang: 'ko', stats: s, code: 'lunecid' } });
    const m = html.match(/class="stats__numbers"[^>]*data-fetched-at="([^"]+)"[^>]*data-max-age-days="7"/);
    expect(m?.[1]).toBe(s.fetchedAt);
    expect(html).toContain('최근 30일');
    expect(html).toContain('1,234');
    expect(html).toContain('기준 시각');
    expect(html).toContain(`<time datetime="${s.fetchedAt}"`);
    expect(html).toMatch(/<script[^>]*type="module"/); // stale-guard
    const en = await renderAstro(StatsSummary, { props: { lang: 'en', stats: s, code: 'lunecid' } });
    expect(en).toContain('Last 30 days');
    expect(en).toContain('As of');
  });

  it('live total island and dashboard link only with a code', async () => {
    const withCode = await renderAstro(StatsSummary, { props: { lang: 'ko', stats: stats(), code: 'lunecid' } });
    // client:idle, not client:visible: the island SSR-renders nothing (initialTotal null), and Astro's visible
    // directive observes the island's children, so an empty island would never hydrate.
    expect(withCode).toMatch(/<astro-island[^>]*client="idle"/);
    expect(withCode).toContain('&quot;lunecid&quot;');
    expect(withCode).toMatch(/<a[^>]*href="https:\/\/lunecid\.goatcounter\.com\/"[^>]*>GoatCounter 전체 대시보드 보기<\/a>/);
    const without = await renderAstro(StatsSummary, { props: { lang: 'ko', stats: stats(), code: null } });
    expect(without).not.toContain('<astro-island');
    expect(without).not.toContain('대시보드');
  });
});
