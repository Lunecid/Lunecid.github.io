// src/scripts/stats-live-total.ts — the live visit total on /stats/ (src/components/stats/StatsLiveTotal.astro,
// F-014). P1-9b (P-03): a line-for-line port of the former React island src/islands/StatsLiveTotal.tsx to a plain
// script. Fetches the GoatCounter TOTAL counter (8 s timeout) once and re-renders the one reserved slot:
// 0 → "starting"; a count → the live total; no count and no build total after the fetch settled → "unavailable";
// a failed fetch keeps the build total the server rendered.
import type { Lang } from '../i18n/ui';
import { formatCount } from '../i18n/utils';
import { goatcounterCounterUrl, parseCount } from '../lib/analytics';

/** Binds one server-rendered `[data-stats-live-total]` slot. Returns a teardown (the dom tests use it). */
export function initStatsLiveTotal(slot: HTMLElement): () => void {
  const { code = '', label = '', startingLabel = '', unavailableLabel = '' } = slot.dataset;
  const lang: Lang = slot.dataset.lang === 'en' ? 'en' : 'ko';
  const initial = slot.dataset.total;
  let total: number | null = initial === undefined || initial === '' ? null : Number(initial);
  let settled = false;
  let alive = true;

  const render = () => {
    const p = document.createElement('p');
    if (total === 0) {
      p.className = 'stats__note stats__live-note';
      p.textContent = startingLabel;
    } else if (total !== null) {
      p.className = 'stats__live';
      const labelEl = document.createElement('span');
      labelEl.className = 'stats__live-label';
      labelEl.textContent = label;
      const num = document.createElement('strong');
      num.className = 'stats__live-num tnum';
      num.textContent = formatCount(total, lang);
      p.append(labelEl, ' ', num);
    } else if (settled) {
      p.className = 'stats__note stats__live-note';
      p.textContent = unavailableLabel;
    } else {
      p.className = 'stats__live stats__live--pending';
      p.setAttribute('aria-hidden', 'true');
    }
    const cur = slot.firstElementChild;
    if (slot.childNodes.length === 1 && cur instanceof HTMLElement && cur.isEqualNode(p)) return; // unchanged
    slot.replaceChildren(p);
  };

  const signal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(8000) : undefined;
  fetch(goatcounterCounterUrl(code), { signal })
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`counter ${res.status}`))))
    .then((body: { count?: unknown }) => {
      const n = parseCount(String(body.count ?? ''));
      if (!alive) return;
      if (n !== null) total = n;
      settled = true;
      render();
    })
    .catch(() => {
      if (!alive) return;
      settled = true;
      render();
    });

  return () => {
    alive = false;
  };
}
