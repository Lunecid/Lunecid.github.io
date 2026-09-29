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

/**
 * CA-25: the chooser's counter loader (analytics="unless-redirecting"). A classic inline script that appends the
 * GoatCounter tag only when chooser-init did not start a redirect, so a returning visitor is counted once, on the page
 * they land on (§6 방문 통계). GOATCOUNTER.code is 'lunecid' (counting live since the 2026-09-28 launch), so this loader
 * decides live counts on '/' and '/en/'; HeadMeta renders nothing only if the code is ever set back to null.
 */
export function goatcounterLoaderScript(attrs: GoatcounterScriptAttrs): string {
  return `(function () {
  if (window.__sbRedirect === true) return;
  var s = document.createElement('script');
  s.async = true;
  s.src = ${JSON.stringify(attrs.src)};
  s.setAttribute('data-goatcounter', ${JSON.stringify(attrs['data-goatcounter'])});
  s.setAttribute('integrity', ${JSON.stringify(attrs.integrity)});
  s.setAttribute('crossorigin', 'anonymous');
  document.head.appendChild(s);
})();`;
}
