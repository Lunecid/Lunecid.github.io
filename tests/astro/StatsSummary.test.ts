import { describe, expect, it } from 'vitest';
import StatsSummary from '../../src/components/stats/StatsSummary.astro';
import type { StatsData } from '../../src/lib/generated';
import { t } from '../../src/i18n/utils';
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
  it('P2-33 (P2-11 neutral design): an offline panel (stats open after GoatCounter is connected, link to privacy) when code is null', async () => {
    const html = await renderAstro(StatsSummary, { props: { variant: 'neutral', lang: 'ko', stats: stats(), code: null } });
    expect(html).toMatch(/<section[^>]*id="summary"/);
    expect(html).toMatch(/<div[^>]*class="stats__offline nt-panel"[^>]*data-stats-offline/);
    expect(html).not.toMatch(/bracket|\[ OFFLINE \]/);
    expect(html).toContain(t('ko', 'stats.offline'));
    expect(html).toContain('방문 통계는 GoatCounter를 연결한 뒤 이 페이지에 공개합니다. 아직 방문 통계를 모으지 않습니다.');
    expect(html).toMatch(/<a href="\/privacy\/"[^>]*>통계를 켜면 모을 항목 보기 \(개인정보 처리방침\)<\/a>/);
    expect(html).not.toContain('<astro-island');
    expect(html).not.toContain('goatcounter.com');
    expect(html).not.toContain('data-fetched-at');
    const en = await renderAstro(StatsSummary, { props: { variant: 'neutral', lang: 'en', stats: stats(), code: null } });
    expect(en).toContain(t('en', 'stats.offline'));
    expect(en).toContain('Visitor statistics will be published on this page once GoatCounter is connected.');
    expect(en).toMatch(/<a href="\/en\/privacy\/"[^>]*>What would be collected \(privacy policy\)<\/a>/);
    // with a code there is no OFFLINE panel
    const on = await renderAstro(StatsSummary, { props: { variant: 'neutral', lang: 'ko', stats: stats(), code: 'lunecid' } });
    expect(on).not.toContain('OFFLINE');
  });

  it('stats.unavailable with a code but no usable stats is owned by the live slot (F-014)', async () => {
    for (const s of [undefined, stats({ status: 'error' }), stats({ fetchedAt: '2026-01-01T00:00:00.000Z' })]) {
      const html = await renderAstro(StatsSummary, { props: { variant: 'neutral', lang: 'ko', stats: s, code: 'lunecid' } });
      // No contradictory SSR pair: unavailable lives in the live slot's script; build numbers are absent.
      expect(html).not.toContain('data-fetched-at');
      expect(html).not.toMatch(/stats__total-num/);
      expect(html.match(/data-stats-live-total/g)).toHaveLength(1);
      expect(html).toContain('data-unavailable-label="통계를 불러오지 못했습니다."'); // for the script's render
      expect(html).toContain('data-starting-label="방문 집계를 시작하는 중입니다."');
      expect(html).not.toMatch(/data-stats-live-total[^>]*data-total=/); // initialTotal null
      expect(html).not.toContain('<astro-island');
    }
  });

  it('total, range and as-of with stats, inside a data-fetched-at element', async () => {
    const s = stats();
    const html = await renderAstro(StatsSummary, { props: { variant: 'neutral', lang: 'ko', stats: s, code: 'lunecid' } });
    const m = html.match(/class="stats__numbers"[^>]*data-fetched-at="([^"]+)"[^>]*data-max-age-days="7"/);
    expect(m?.[1]).toBe(s.fetchedAt);
    expect(html).toContain('최근 30일');
    expect(html).toContain('1,234');
    expect(html).toContain('기준 시각');
    expect(html).toContain(`<time datetime="${s.fetchedAt}"`);
    expect(html).toMatch(/<script[^>]*type="module"/); // stale-guard
    expect(html).toMatch(/data-stats-live-total[^>]*data-total="1234"/);
    const en = await renderAstro(StatsSummary, { props: { variant: 'neutral', lang: 'en', stats: s, code: 'lunecid' } });
    expect(en).toContain('Last 30 days');
    expect(en).toContain('As of');
  });

  it('live total slot and dashboard link only with a code', async () => {
    const withCode = await renderAstro(StatsSummary, { props: { variant: 'neutral', lang: 'ko', stats: stats(), code: 'lunecid' } });
    // P1-9b: server markup + script own the live slot (min-height reserved); initialTotal comes from build data.
    expect(withCode.match(/<div class="stats__live-slot" data-stats-live-total/g)).toHaveLength(1);
    expect(withCode).toContain('data-code="lunecid"');
    expect(withCode).toMatch(/<a[^>]*href="https:\/\/lunecid\.goatcounter\.com\/"[^>]*>GoatCounter 전체 대시보드 보기<\/a>/);
    const without = await renderAstro(StatsSummary, { props: { variant: 'neutral', lang: 'ko', stats: stats(), code: null } });
    expect(without).not.toContain('<astro-island');
    expect(without).not.toContain('data-stats-live-total');
    expect(without).not.toContain('대시보드');
  });
});
