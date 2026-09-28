import { GOATCOUNTER, MEDIA } from '../config';

export interface GoatcounterScriptAttrs {
  src: string;
  'data-goatcounter': string;
  integrity: string;
  crossorigin: 'anonymous';
}

/** Attributes of the GoatCounter page script, or null when no site code is configured (not collecting). */
export function goatcounterScript(code: string | null, selfHosted: boolean): GoatcounterScriptAttrs | null {
  if (!code) return null;
  return {
    src: selfHosted ? MEDIA.goatcounterSelfHosted : GOATCOUNTER.cdnSrc,
    'data-goatcounter': `https://${code}.goatcounter.com/count`,
    integrity: GOATCOUNTER.sri,
    crossorigin: 'anonymous',
  };
}

/** Public, unauthenticated site total (stack-ops §6.2). */
export function goatcounterCounterUrl(code: string): string {
  return `https://${code}.goatcounter.com/counter/TOTAL.json`;
}

export function goatcounterDashboardUrl(code: string): string {
  return `https://${code}.goatcounter.com/`;
}

/** "1 093 409" / "1,093,409" → 1093409; '' or no digits → null. */
export function parseCount(value: string): number | null {
  const digits = value.replace(/[^0-9]/g, '');
  return digits === '' ? null : Number(digits);
}
