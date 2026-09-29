// P1-9b (P-03): dom tests of the live-total script (src/scripts/stats-live-total.ts) on the server markup of
// src/components/stats/StatsLiveTotal.astro (tests/helpers/hud-markup.ts; tests/astro/StatsLiveTotal.test.ts pins
// that markup). Ported one-for-one from the former React island tests.
import { screen, waitFor } from '@testing-library/dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initStatsLiveTotal } from '../../src/scripts/stats-live-total';
import { statsLiveTotalMarkup, type LiveTotalProps } from '../helpers/hud-markup';

const realFetch = globalThis.fetch;
const teardowns: Array<() => void> = [];
afterEach(() => {
  for (const teardown of teardowns.splice(0)) teardown();
  document.body.innerHTML = '';
  globalThis.fetch = realFetch;
});

const labels = {
  label: '지금까지 누적 방문 수',
  startingLabel: '방문 집계를 시작하는 중입니다.',
  unavailableLabel: '통계를 불러오지 못했습니다.',
} as const;

/** Mounts the server markup and runs the script on it, as the page does. */
function render(props: LiveTotalProps): { container: HTMLElement } {
  document.body.innerHTML = statsLiveTotalMarkup(props);
  const slot = document.querySelector<HTMLElement>('[data-stats-live-total]');
  if (!slot) throw new Error('no live-total slot');
  teardowns.push(initStatsLiveTotal(slot));
  return { container: document.body };
}

describe('StatsLiveTotal', () => {
  it('shows the parsed live total', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ count: '1 234', count_unique: '1 200' }) }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    render({ code: 'lunecid', initialTotal: null, lang: 'ko', ...labels });
    expect(await screen.findByText('1,234')).toBeInTheDocument();
    expect(screen.getByText('지금까지 누적 방문 수')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('https://lunecid.goatcounter.com/counter/TOTAL.json', expect.anything());
  });

  it('keeps the initial total on fetch failure', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('offline');
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    render({
      code: 'lunecid',
      initialTotal: 987,
      lang: 'en',
      label: 'Total visits so far',
      startingLabel: 'Visit counting is just getting started.',
      unavailableLabel: 'Could not load the statistics.',
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.getByText('987')).toBeInTheDocument();
  });

  it('shows unavailable when the live fetch fails and there is no build total (F-014)', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 400, json: async () => ({}) }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    render({ code: 'lunecid', initialTotal: null, lang: 'ko', ...labels });
    expect(await screen.findByText('통계를 불러오지 못했습니다.')).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('treats a live count of 0 as starting, not a large zero (F-014)', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ count: '0' }) }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    render({ code: 'lunecid', initialTotal: null, lang: 'ko', ...labels });
    expect(await screen.findByText('방문 집계를 시작하는 중입니다.')).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
    expect(screen.queryByText('통계를 불러오지 못했습니다.')).not.toBeInTheDocument();
  });

  it('reserves a min-height slot from the first paint', () => {
    const fetchMock = vi.fn(() => new Promise(() => undefined));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { container } = render({ code: 'lunecid', initialTotal: null, lang: 'ko', ...labels });
    expect(container.querySelector('.stats__live-slot')).toBeTruthy();
  });

  it('the slot stays the one root and holds exactly one line after the fetch settles', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ count: '42' }) }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { container } = render({ code: 'lunecid', initialTotal: 7, lang: 'en', label: 'Total visits so far', startingLabel: 's', unavailableLabel: 'u' });
    expect(container.querySelector('.stats__live-num')).toHaveTextContent('7');
    await waitFor(() => expect(container.querySelector('.stats__live-num')).toHaveTextContent('42'));
    const slot = container.querySelector('[data-stats-live-total]') as HTMLElement;
    expect(slot.children).toHaveLength(1);
    expect(slot.firstElementChild).toHaveClass('stats__live');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
