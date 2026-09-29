import { describe, expect, it } from 'vitest';
import RankTable from '../../src/components/stats/RankTable.astro';
import { t } from '../../src/i18n/utils';
import { renderAstro } from './helpers';

describe('RankTable', () => {
  it('column headers and rows; direct referrer label; data-fetched-at present', async () => {
    const html = await renderAstro(RankTable, {
      props: {
        variant: 'neutral',
        lang: 'ko', id: 'referrers', title: t('ko', 'stats.referrers'),
        rows: [{ label: t('ko', 'stats.direct'), count: 1500 }, { label: 'github.com', count: 20 }],
        fetchedAt: '2026-09-30T18:00:00.000Z', maxAgeDays: 7,
      },
    });
    expect(html).toMatch(/<section[^>]*id="referrers"[^>]*data-fetched-at="2026-09-30T18:00:00.000Z"[^>]*data-max-age-days="7"/);
    const scroll = html.match(/<div class="stats__table-scroll"[^>]*>/)?.[0] ?? '';
    expect(scroll).toContain('tabindex="0"'); // keyboard-reachable scroll region (axe scrollable-region-focusable)
    expect(scroll).toContain('role="region"');
    expect(scroll).toContain('aria-labelledby="referrers-title"');
    expect(html).toMatch(/<h2 id="referrers-title"[^>]*>유입 경로<\/h2>/);
    expect(html.match(/<th scope="col"/g)).toHaveLength(2);
    expect(html).toMatch(/<th scope="col"[^>]*>유입 경로<\/th>/);
    expect(html).toMatch(/<th scope="col"[^>]*>방문 수<\/th>/);
    expect(html).toContain('직접 방문');
    expect(html).toContain('1,500');
    expect(html.match(/<tr[\s>]/g)).toHaveLength(3);
    expect(html).toMatch(/<script[^>]*type="module"/);

    const empty = await renderAstro(RankTable, { props: { variant: 'neutral', lang: 'en', id: 'top-pages', title: 'Top pages', rows: [], fetchedAt: '2026-09-30T18:00:00.000Z', maxAgeDays: 7 } });
    expect(empty).not.toContain('id="top-pages"');
  });
});
