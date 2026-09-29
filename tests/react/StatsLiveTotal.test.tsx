import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import StatsLiveTotal from '../../src/islands/StatsLiveTotal';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const labels = {
  label: '지금까지 누적 방문 수',
  startingLabel: '방문 집계를 시작하는 중입니다.',
  unavailableLabel: '통계를 불러오지 못했습니다.',
} as const;

describe('StatsLiveTotal', () => {
  it('shows the parsed live total', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ count: '1 234', count_unique: '1 200' }) }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    render(<StatsLiveTotal code="lunecid" initialTotal={null} lang="ko" {...labels} />);
    expect(await screen.findByText('1,234')).toBeInTheDocument();
    expect(screen.getByText('지금까지 누적 방문 수')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('https://lunecid.goatcounter.com/counter/TOTAL.json', expect.anything());
  });

  it('keeps the initial total on fetch failure', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('offline');
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    render(
      <StatsLiveTotal
        code="lunecid"
        initialTotal={987}
        lang="en"
        label="Total visits so far"
        startingLabel="Visit counting is just getting started."
        unavailableLabel="Could not load the statistics."
      />,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.getByText('987')).toBeInTheDocument();
  });

  it('shows unavailable when the live fetch fails and there is no build total (F-014)', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 400, json: async () => ({}) }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    render(<StatsLiveTotal code="lunecid" initialTotal={null} lang="ko" {...labels} />);
    expect(await screen.findByText('통계를 불러오지 못했습니다.')).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('treats a live count of 0 as starting, not a large zero (F-014)', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ count: '0' }) }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    render(<StatsLiveTotal code="lunecid" initialTotal={null} lang="ko" {...labels} />);
    expect(await screen.findByText('방문 집계를 시작하는 중입니다.')).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
    expect(screen.queryByText('통계를 불러오지 못했습니다.')).not.toBeInTheDocument();
  });

  it('reserves a min-height slot from the first paint', () => {
    const fetchMock = vi.fn(() => new Promise(() => undefined));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { container } = render(<StatsLiveTotal code="lunecid" initialTotal={null} lang="ko" {...labels} />);
    expect(container.querySelector('.stats__live-slot')).toBeTruthy();
  });
});
