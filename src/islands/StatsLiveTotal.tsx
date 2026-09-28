import { useEffect, useState, type JSX } from 'react';
import type { Lang } from '../i18n/ui';
import { formatNumber } from '../i18n/utils';
import { goatcounterCounterUrl, parseCount } from '../lib/analytics';

export interface StatsLiveTotalProps {
  code: string;
  initialTotal: number | null;
  lang: Lang;
  label: string;
}

/** Running total from GoatCounter's public counter (CORS *, no token). Keeps initialTotal on failure; renders nothing when both are null. */
export default function StatsLiveTotal({ code, initialTotal, lang, label }: StatsLiveTotalProps): JSX.Element | null {
  const [total, setTotal] = useState<number | null>(initialTotal);

  useEffect(() => {
    let alive = true;
    const signal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(8000) : undefined;
    fetch(goatcounterCounterUrl(code), { signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`counter ${res.status}`))))
      .then((body: { count?: unknown }) => {
        const n = parseCount(String(body.count ?? ''));
        if (alive && n !== null) setTotal(n);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [code]);

  if (total === null) return null;
  return (
    <p className="stats__live">
      <span className="stats__live-label">{label}</span> <strong className="stats__live-num tnum">{formatNumber(total, lang)}</strong>
    </p>
  );
}
