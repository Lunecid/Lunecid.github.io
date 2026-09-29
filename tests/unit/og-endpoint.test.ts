import { afterEach, describe, expect, it, vi } from 'vitest';

describe('OG endpoint in the no-art build (A-21)', () => {
  afterEach(() => {
    delete process.env.SB_NO_ART;
    vi.resetModules();
  });

  it('emits no OG image when SB_NO_ART=1 (dist-no-art serves only the e2e layout checks and is never deployed)', async () => {
    process.env.SB_NO_ART = '1';
    const mod = await import('../../src/pages/og/[...slug].png.ts');
    expect(await mod.getStaticPaths()).toEqual([]);
  });
});
