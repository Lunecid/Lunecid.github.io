import { useEffect, useState, type JSX } from 'react';
import type { Lang } from '../i18n/ui';
import { formatNumber } from '../i18n/utils';
import { goatcounterCounterUrl, parseCount } from '../lib/analytics';

export interface StatsLiveTotalProps {
  code: string;
  initialTotal: number | null;
  lang: Lang;
  label: string;
  startingLabel: string;
  unavailableLabel: string;
}

/**
 * One reserved slot for the live visit total (F-014).
 * - 0 → "starting" (do not show a large 0 or pair it with "unavailable")
 * - null after a failed/empty fetch with no build data → unavailable only
 * - a positive count → the live total
 * Keep initialTotal when the live fetch fails so build data still shows.
 */
export default function StatsLiveTotal({
  code,
  initialTotal,
  lang,
  label,
  startingLabel,
  unavailableLabel,
}: StatsLiveTotalProps): JSX.Element {
  const [total, setTotal] = useState<number | null>(initialTotal);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    let alive = true;
    const signal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(8000) : undefined;
    fetch(goatcounterCounterUrl(code), { signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`counter ${res.status}`))))
      .then((body: { count?: unknown }) => {
        const n = parseCount(String(body.count ?? ''));
        if (!alive) return;
        if (n !== null) setTotal(n);
        setSettled(true);
      })
      .catch(() => {
        if (alive) setSettled(true);
      });
    return () => {
      alive = false;
    };
  }, [code]);

  let body: JSX.Element;
  if (total === 0) {
    body = <p className="stats__note stats__live-note">{startingLabel}</p>;
  } else if (total !== null) {
    body = (
      <p className="stats__live">
        <span className="stats__live-label">{label}</span>{' '}
        <strong className="stats__live-num tnum">{formatNumber(total, lang)}</strong>
      </p>
    );
  } else if (settled) {
    body = <p className="stats__note stats__live-note">{unavailableLabel}</p>;
  } else {
    body = <p className="stats__live stats__live--pending" aria-hidden="true" />;
  }

  return <div className="stats__live-slot">{body}</div>;
}
