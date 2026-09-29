import { describe, expect, it } from 'vitest';
import DailyChart from '../../src/components/stats/DailyChart.astro';
import { renderAstro } from './helpers';

const daily = Array.from({ length: 30 }, (_, i) => ({ day: `2026-09-${String(i + 1).padStart(2, '0')}`, count: (i * 7) % 23 }));
const fetchedAt = '2026-09-30T18:00:00.000Z';

describe('DailyChart', () => {
  it('one bar per day plus a table fallback, inside a scroll wrapper', async () => {
    const html = await renderAstro(DailyChart, { props: { lang: 'ko', daily, fetchedAt, maxAgeDays: 7 } });
    expect(html).toMatch(/<section[^>]*id="daily"[^>]*data-fetched-at="2026-09-30T18:00:00.000Z"[^>]*data-max-age-days="7"/);
    expect(html).toMatch(/class="stats__chart-scroll"[^>]*>\s*<svg[^>]*role="img"/);
    // Every horizontal scroller is a keyboard-reachable, named region (axe scrollable-region-focusable).
    const chartScroll = html.match(/<div class="stats__chart-scroll"[^>]*>/)?.[0] ?? '';
    const tableScroll = html.match(/<div class="stats__table-scroll"[^>]*>/)?.[0] ?? '';
    for (const tag of [chartScroll, tableScroll]) {
      expect(tag).toContain('tabindex="0"');
      expect(tag).toContain('role="region"');
    }
    expect(chartScroll).toContain('aria-labelledby="stats-daily-title"');
    expect(tableScroll).toContain('aria-labelledby="stats-daily-title stats-daily-table-label"');
    expect(html).toMatch(/<h2 id="stats-daily-title"/);
    expect(html).toMatch(/<summary id="stats-daily-table-label"[^>]*>표로 보기<\/summary>/);
    expect(html.match(/<rect[\s>]/g)).toHaveLength(30);
    expect(html).toMatch(/class="stats__chart-max tnum"[^>]*>22</); // F-064: dashed max line label
    expect(html).toMatch(/<line class="stats__max-line"/);
    expect(html).not.toMatch(/<text[\s>]/); // bar labels stay in HTML (12px rule at every width)
    expect(html).toMatch(/<details[^>]*>[\s\S]*<summary[^>]*>표로 보기<\/summary>[\s\S]*<table/);
    expect(html.match(/<tr[\s>]/g)).toHaveLength(31); // header + 30 days
    expect(html).toContain('2026.09.01');
    expect(html).toMatch(/<script[^>]*type="module"/); // stale-guard

    const empty = await renderAstro(DailyChart, { props: { lang: 'ko', daily: [], fetchedAt, maxAgeDays: 7 } });
    expect(empty).not.toContain('id="daily"');
  });
});
