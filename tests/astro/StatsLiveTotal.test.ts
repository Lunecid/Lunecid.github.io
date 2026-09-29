// P1-9b (P-03): the live visit total is server markup plus a plain script. The dom tests
// (tests/react/StatsLiveTotal.test.tsx) run the script on tests/helpers/hud-markup.ts; this pins that markup.
import { describe, expect, it } from 'vitest';
import StatsLiveTotal from '../../src/components/stats/StatsLiveTotal.astro';
import { statsLiveTotalMarkup, type LiveTotalProps } from '../helpers/hud-markup';
import { renderAstro } from './helpers';

const KO: LiveTotalProps = {
  code: 'lunecid',
  initialTotal: null,
  lang: 'ko',
  label: '지금까지 누적 방문 수',
  startingLabel: '방문 집계를 시작하는 중입니다.',
  unavailableLabel: '통계를 불러오지 못했습니다.',
};

describe('StatsLiveTotal.astro', () => {
  it('renders the pre-fetch state the island rendered first, always inside one .stats__live-slot with the marker', async () => {
    for (const initialTotal of [null, 0, 1234]) {
      const props = { ...KO, initialTotal };
      const html = await renderAstro(StatsLiveTotal, { props });
      expect(html.startsWith(statsLiveTotalMarkup(props)), String(initialTotal)).toBe(true);
      expect(html.match(/data-stats-live-total/g)).toHaveLength(1);
      expect(html.match(/class="stats__live-slot"/g)).toHaveLength(1);
      expect(html).not.toContain('<astro-island');
    }
  });

  it('F-014: no SSR "unavailable" line; 0 is "starting", a count is the formatted total, null is the empty pending line', async () => {
    const pending = await renderAstro(StatsLiveTotal, { props: KO });
    expect(pending).toContain('<p class="stats__live stats__live--pending" aria-hidden="true"></p>');
    expect(pending).not.toContain('>통계를 불러오지 못했습니다.<');
    const zero = await renderAstro(StatsLiveTotal, { props: { ...KO, initialTotal: 0 } });
    expect(zero).toContain('<p class="stats__note stats__live-note">방문 집계를 시작하는 중입니다.</p>');
    const en = await renderAstro(StatsLiveTotal, { props: { ...KO, lang: 'en', label: 'Total visits so far', initialTotal: 1234567 } });
    expect(en).toContain('<strong class="stats__live-num tnum">1,234,567</strong>');
    expect(en).toMatch(/<script type="module"[^>]*src="[^"]*StatsLiveTotal\.astro\?astro&(?:amp;)?type=script/);
  });
});
