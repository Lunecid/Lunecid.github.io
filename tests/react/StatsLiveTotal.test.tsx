import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import StatsLiveTotal from '../../src/islands/StatsLiveTotal';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('StatsLiveTotal', () => {
  it('shows the parsed live total', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ count: '1 234', count_unique: '1 200' }) }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    render(<StatsLiveTotal code="lunecid" initialTotal={null} lang="ko" label="지금까지 누적 방문 수" />);
    expect(await screen.findByText('1,234')).toBeInTheDocument();
    expect(screen.getByText('지금까지 누적 방문 수')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('https://lunecid.goatcounter.com/counter/TOTAL.json', expect.anything());
  });

  it('keeps the initial total on fetch failure', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('offline');
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    render(<StatsLiveTotal code="lunecid" initialTotal={987} lang="en" label="Total visits so far" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.getByText('987')).toBeInTheDocument();
  });

  it('renders nothing when both are null', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 400, json: async () => ({}) }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { container } = render(<StatsLiveTotal code="lunecid" initialTotal={null} lang="ko" label="지금까지 누적 방문 수" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(container.innerHTML).toBe('');
  });
});
