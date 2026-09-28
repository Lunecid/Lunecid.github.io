import { afterEach, describe, expect, it, vi } from 'vitest';

const DAY = 86_400_000;

function section(id: string, fetchedAt: string, maxAgeDays?: number): HTMLElement {
  const el = document.createElement('section');
  el.id = id;
  el.dataset.fetchedAt = fetchedAt;
  if (maxAgeDays !== undefined) el.dataset.maxAgeDays = String(maxAgeDays);
  document.body.append(el);
  return el;
}

async function runGuardModule(): Promise<void> {
  vi.resetModules();
  await import('../../src/scripts/stale-guard');
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('stale-guard', () => {
  it('hides a [data-fetched-at] element older than data-max-age-days', async () => {
    const stale = section('github', new Date(Date.now() - 8 * DAY).toISOString(), 7);
    const staleDefaultAge = section('daily', new Date(Date.now() - 8 * DAY).toISOString());
    await runGuardModule();
    expect(stale.hidden).toBe(true);
    expect(staleDefaultAge.hidden).toBe(true);
  });

  it('keeps fresh and future-dated elements visible', async () => {
    const fresh = section('github', new Date(Date.now() - DAY).toISOString(), 7);
    const future = section('summary', new Date(Date.now() + 2 * DAY).toISOString(), 7);
    const unparseable = section('referrers', 'not a date', 7);
    await runGuardModule();
    expect(fresh.hidden).toBe(false);
    expect(future.hidden).toBe(false);
    expect(unparseable.hidden).toBe(false);
  });

  it("uses each element's own data-max-age-days", async () => {
    const now = Date.parse('2026-09-26T00:00:00.000Z');
    vi.useFakeTimers({ now, toFake: ['Date'] });
    try {
      const old = section('a', new Date(now - 31 * DAY).toISOString(), 30);
      const recent = section('b', new Date(now - 29 * DAY).toISOString(), 30);
      await runGuardModule();
      expect(old.hidden).toBe(true);
      expect(recent.hidden).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
