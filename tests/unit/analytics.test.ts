import { describe, expect, it } from 'vitest';
import { GOATCOUNTER } from '../../src/config';
import { goatcounterCounterUrl, goatcounterDashboardUrl, goatcounterScript, parseCount } from '../../src/lib/analytics';

describe('analytics helpers', () => {
  it('goatcounterScript is null without a code', () => {
    expect(goatcounterScript(null, true)).toBeNull();
    expect(goatcounterScript(null, false)).toBeNull();
    expect(goatcounterScript('', false)).toBeNull();
  });

  it('self-hosted vs CDN src, both with the SRI', () => {
    expect(goatcounterScript('lunecid', true)).toEqual({
      src: '/js/count.v5.js',
      'data-goatcounter': 'https://lunecid.goatcounter.com/count',
      integrity: GOATCOUNTER.sri,
      crossorigin: 'anonymous',
    });
    const cdn = goatcounterScript('lunecid', false);
    expect(cdn?.src).toBe('https://gc.zgo.at/count.v5.js');
    expect(cdn?.integrity).toBe(GOATCOUNTER.sri);
    expect(cdn?.integrity).toMatch(/^sha384-/);
    expect(goatcounterCounterUrl('lunecid')).toBe('https://lunecid.goatcounter.com/counter/TOTAL.json');
    expect(goatcounterDashboardUrl('lunecid')).toBe('https://lunecid.goatcounter.com/');
  });

  it('parseCount handles spaces, commas and empty strings', () => {
    expect(parseCount('1 093 409')).toBe(1093409);
    expect(parseCount('1,093,409')).toBe(1093409);
    expect(parseCount('1 234')).toBe(1234);
    expect(parseCount('0')).toBe(0);
    expect(parseCount('')).toBeNull();
    expect(parseCount('n/a')).toBeNull();
  });
});
