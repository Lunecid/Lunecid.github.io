// P1-9b (P-03): the achievement toast host is server markup plus a plain script. The dom tests
// (tests/react/AchievementHost.test.tsx) run the script on tests/helpers/hud-markup.ts; this pins that markup.
import { describe, expect, it } from 'vitest';
import AchievementHost from '../../src/components/hud/AchievementHost.astro';
import type { AchievementDef } from '../../src/lib/achievements';
import { achievementHostMarkup } from '../helpers/hud-markup';
import { readSource, renderAstro } from './helpers';

const DEFS: AchievementDef[] = [
  {
    id: 'konami',
    trigger: 'konami',
    hidden: true,
    title: { ko: '↑↑↓↓←→←→BA', en: '↑↑↓↓←→←→BA' },
    description: { ko: '코나미 커맨드를 "입력"했습니다 & 끝.', en: 'Entered the Konami Code.' },
    hint: { ko: '오래된 게임의 비밀 명령어가 통합니다.', en: 'A classic cheat code works here.' },
  },
];
const LABELS = { region: '업적 알림', close: '알림 닫기' };

describe('AchievementHost.astro', () => {
  it('renders exactly the markup the dom tests mount: an empty polite status region with the marker once', async () => {
    const html = await renderAstro(AchievementHost, { props: { lang: 'ko', defs: DEFS, labels: LABELS } });
    expect(html.startsWith(achievementHostMarkup('ko', DEFS, LABELS))).toBe(true);
    expect(html.match(/data-achievement-host/g)).toHaveLength(1);
    expect(html).toMatch(/<div class="ach-toast-region" role="status" aria-live="polite" aria-atomic="true" aria-label="업적 알림"[^>]*><\/div>/);
    expect(html).not.toContain('<astro-island');
    expect(html).toMatch(/<script type="module"[^>]*src="[^"]*AchievementHost\.astro\?astro&(?:amp;)?type=script/);
  });

  it('carries only the toast fields as JSON (no hints): hidden achievements stay unspoiled in the markup text', async () => {
    const html = await renderAstro(AchievementHost, { props: { lang: 'en', defs: DEFS, labels: { region: 'Achievement notifications', close: 'Dismiss' } } });
    const raw = html.match(/data-defs="([^"]*)"/)?.[1] ?? '';
    const json = JSON.parse(raw.replace(/&quot;/g, '"').replace(/&amp;/g, '&')) as unknown;
    expect(json).toEqual([{ id: 'konami', trigger: 'konami', title: DEFS[0]!.title, description: DEFS[0]!.description }]);
    expect(html).not.toContain('A classic cheat code works here.');
    expect(html).toContain('data-lang="en"');
    expect(html).toContain('data-close-label="Dismiss"');
  });

  it('keeps the island stylesheet (moved unchanged)', () => {
    expect(readSource('src/components/hud/AchievementHost.astro')).toContain("import './AchievementHost.css';");
    const css = readSource('src/components/hud/AchievementHost.css');
    expect(css).toContain(":root[data-motion='reduce'] .ach-toast[data-state='in']");
    expect(css).toMatch(/\.ach-toast\[data-state='out'\] \{\s*animation: ach-out \.2s/);
  });
});
