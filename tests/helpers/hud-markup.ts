// tests/helpers/hud-markup.ts — the server markup of the three P1-9b components (BgmToggle.astro,
// AchievementHost.astro, StatsLiveTotal.astro), built by hand. The astro tests assert that each component renders
// exactly this markup; the dom tests (tests/react/{BgmToggle,AchievementHost,StatsLiveTotal}.test.tsx) mount it and
// run the component scripts on it, so the scripts are tested against the markup the build actually ships.
import type { AchievementDef } from '../../src/lib/achievements';
import type { Lang } from '../../src/i18n/ui';

const attr = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const text = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function bgmToggleMarkup(src: string, label = 'BGM'): string {
  return `<button type="button" class="bgm" aria-label="${attr(label)}" aria-pressed="false" data-bgm-toggle data-src="${attr(src)}"><span class="bgm__glyph" aria-hidden="true">♪</span> <span aria-hidden="true">${text(label)}</span> <span class="bgm__state" aria-hidden="true">OFF</span></button>`;
}

export function achievementHostMarkup(lang: Lang, defs: readonly AchievementDef[], labels: { region: string; close: string }): string {
  const json = JSON.stringify(defs.map(({ id, trigger, title, description }) => ({ id, trigger, title, description })));
  return `<div class="ach-toast-region" role="status" aria-live="polite" aria-atomic="true" aria-label="${attr(labels.region)}" data-achievement-host data-lang="${lang}" data-close-label="${attr(labels.close)}" data-defs="${attr(json)}"></div>`;
}

export type LiveTotalProps = {
  code: string;
  initialTotal: number | null;
  lang: Lang;
  label: string;
  startingLabel: string;
  unavailableLabel: string;
};

export function statsLiveTotalMarkup(p: LiveTotalProps): string {
  const total = p.initialTotal === null ? '' : ` data-total="${p.initialTotal}"`;
  const body =
    p.initialTotal === 0
      ? `<p class="stats__note stats__live-note">${text(p.startingLabel)}</p>`
      : p.initialTotal !== null
        ? `<p class="stats__live"><span class="stats__live-label">${text(p.label)}</span> <strong class="stats__live-num tnum">${new Intl.NumberFormat(p.lang === 'ko' ? 'ko-KR' : 'en-US').format(p.initialTotal)}</strong></p>`
        : '<p class="stats__live stats__live--pending" aria-hidden="true"></p>';
  return `<div class="stats__live-slot" data-stats-live-total data-code="${attr(p.code)}"${total} data-lang="${p.lang}" data-label="${attr(p.label)}" data-starting-label="${attr(p.startingLabel)}" data-unavailable-label="${attr(p.unavailableLabel)}">${body}</div>`;
}
