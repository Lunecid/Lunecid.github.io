// src/scripts/stale-guard.ts — side-effect module (spec §7.1: "기한이 지나면 브라우저에서 카드를 숨긴다").
// Included by GitHubSection, StatsSummary, DailyChart and RankTable with
//   <script>import '../../scripts/stale-guard';</script>
// Every element carrying data-fetched-at (+ data-max-age-days) is hidden once its data is older than maxAgeDays.
// A fetchedAt later than the visitor's clock means that clock is behind: the element stays visible
// (the build already rejected truly future data through usableGitHub/usableStats).
import { isFresh } from '../lib/freshness';

/** Hides every stale [data-fetched-at] element in the document (module-private; this file exports nothing). */
function run(): void {
  const now = Date.now();
  for (const el of Array.from(document.querySelectorAll<HTMLElement>('[data-fetched-at]'))) {
    const fetchedAt = el.dataset.fetchedAt ?? '';
    const fetched = Date.parse(fetchedAt);
    if (Number.isNaN(fetched) || fetched >= now) continue;
    if (!isFresh({ fetchedAt, maxAgeDays: Number(el.dataset.maxAgeDays) }, now)) el.hidden = true;
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();
}
