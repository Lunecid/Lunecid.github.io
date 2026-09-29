// P1-9b (P-03): dom tests of the achievement host's plain script (src/scripts/achievement-host.ts) on the server
// markup of src/components/hud/AchievementHost.astro (tests/helpers/hud-markup.ts; tests/astro/AchievementHost.test.ts
// pins that markup). Ported one-for-one from the former React island tests: `act` is gone (the script updates the
// DOM synchronously) and `container` is the page body the host is mounted in.
import { fireEvent, screen } from '@testing-library/dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ENTRANCE_HOLD_MS as HOST_ENTRANCE_HOLD_MS, OUT_MS, TOAST_MS, initAchievementHost } from '../../src/scripts/achievement-host';
import { STORAGE_KEYS } from '../../src/config';
import { KONAMI_SEQUENCE } from '../../src/lib/konami';
import { __resetAchievementMemory, emitTrigger, isUnlocked, unlock, type AchievementDef } from '../../src/lib/achievements';
import { achievementHostMarkup } from '../helpers/hud-markup';

const DEFS: AchievementDef[] = [
  {
    id: 'sound-on',
    trigger: 'bgm-on',
    hidden: false,
    title: { ko: '소리 켜짐', en: 'Sound On' },
    description: { ko: '배경음악을 켰습니다.', en: 'Turned on the background music.' },
    hint: { ko: '상단의 소리 버튼을 눌러 보세요.', en: 'Try the sound button at the top.' },
  },
  {
    id: 'map-explored',
    trigger: 'visit-all-sections',
    hidden: false,
    title: { ko: '전 구역 탐색', en: 'Map Explored' },
    description: { ko: '연구, 프로젝트, 기록, 플레이 로그를 모두 둘러봤습니다.', en: 'Visited Research, Projects, Records, and Player Log.' },
    hint: { ko: '메뉴 01부터 04까지 모두 들어가 보세요.', en: 'Open every menu item from 01 to 04.' },
  },
  {
    id: 'konami',
    trigger: 'konami',
    hidden: true,
    title: { ko: '↑↑↓↓←→←→BA', en: '↑↑↓↓←→←→BA' },
    description: { ko: '코나미 커맨드를 입력했습니다.', en: 'Entered the Konami Code.' },
    hint: { ko: '오래된 게임의 비밀 명령어가 통합니다.', en: 'A classic cheat code works here.' },
  },
];
const LABELS = { region: 'Achievement notifications', close: 'Dismiss' };
const LABELS_KO = { region: '업적 알림', close: '알림 닫기' };
/** Must match AchievementHost ENTRANCE_HOLD_MS (F-028). */
const ENTRANCE_HOLD_MS = 950;

const teardowns: Array<() => void> = [];
const act = (fn: () => void) => fn();

/** Mounts the server markup (after `before`) and runs the host script on it, as the page does. */
function renderHost(lang: 'ko' | 'en' = 'en', before = ''): { container: HTMLElement } {
  document.body.innerHTML = `${before}${achievementHostMarkup(lang, DEFS, lang === 'ko' ? LABELS_KO : LABELS)}`;
  const region = document.querySelector<HTMLElement>('[data-achievement-host]');
  if (!region) throw new Error('no achievement host');
  teardowns.push(initAchievementHost(region));
  return { container: document.body };
}

/** Full-motion host: advance past the F-028 entrance hold so the toast can appear. */
function renderHostFull(lang: 'ko' | 'en' = 'en') {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  document.documentElement.setAttribute('data-motion', 'full');
  const result = renderHost(lang);
  act(() => {
    vi.advanceTimersByTime(ENTRANCE_HOLD_MS);
  });
  return result;
}

beforeEach(() => {
  __resetAchievementMemory();
  window.__sbTriggers = [];
  document.documentElement.removeAttribute('data-section');
  document.documentElement.removeAttribute('data-intro');
  // Most tests want an immediate toast (F-028 reduce path).
  document.documentElement.setAttribute('data-motion', 'reduce');
});

afterEach(() => {
  for (const teardown of teardowns.splice(0)) teardown();
  document.body.innerHTML = '';
  vi.useRealTimers();
  document.documentElement.removeAttribute('data-section');
  document.documentElement.removeAttribute('data-intro');
  document.documentElement.removeAttribute('data-motion');
});

describe('AchievementHost', () => {
  it('keeps the island timings (TOAST_MS 6000, OUT_MS 200, ENTRANCE_HOLD_MS 950)', () => {
    expect(TOAST_MS).toBe(6000);
    expect(OUT_MS).toBe(200);
    expect(HOST_ENTRANCE_HOLD_MS).toBe(ENTRANCE_HOLD_MS);
  });

  it('renders a polite status region', () => {
    renderHost();
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveAttribute('aria-atomic', 'true');
    expect(region).toHaveAccessibleName('Achievement notifications');
    expect(region).toBeEmptyDOMElement();
  });

  it('drains triggers queued before hydration and shows one toast', () => {
    emitTrigger('bgm-on');
    emitTrigger('bgm-on');
    renderHost();
    const region = screen.getByRole('status');
    // Controller ruling 1: the kicker is the fixed HUD caption "ACHIEVEMENT UNLOCKED" in every language.
    expect(region).toHaveTextContent('ACHIEVEMENT UNLOCKED');
    // F-060: title only under the kicker; full sentence is visually hidden for aria-live.
    expect(region).toHaveTextContent('Sound On');
    expect(region.querySelector('.ach-toast__text')).toHaveTextContent('Sound On');
    expect(region.querySelector('.ach-toast__text')).not.toHaveTextContent('Turned on');
    expect(region.querySelector('.sr-only')).toHaveTextContent('Sound On — Turned on the background music.');
    expect(screen.getAllByRole('button', { name: 'Dismiss' })).toHaveLength(1);
    expect(isUnlocked('sound-on')).toBe(true);
    expect(window.__sbTriggers).toEqual([]);
  });

  it('re-triggering an unlocked achievement shows no toast', () => {
    unlock('sound-on');
    renderHost();
    act(() => emitTrigger('bgm-on'));
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('close button dismisses', () => {
    const { container } = renderHostFull();
    act(() => emitTrigger('bgm-on'));
    const toast = container.querySelector('.ach-toast');
    expect(toast).toHaveAttribute('data-state', 'in');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(toast).toHaveAttribute('data-state', 'out');
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(container.querySelector('.ach-toast')).toBeNull();
  });

  it('fix round 1 minor: under reduced motion, dismissing removes the toast immediately (no lingering frozen frame)', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { container } = renderHost();
    act(() => emitTrigger('bgm-on'));
    const toast = container.querySelector('.ach-toast');
    expect(toast).toHaveAttribute('data-state', 'in');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    // Gone synchronously — controller ruling 1 plays no exit animation under reduced motion, so there is
    // nothing to wait 150ms (the old OUT_MS_REDUCED) for.
    expect(container.querySelector('.ach-toast')).toBeNull();
  });

  it('auto-dismisses after TOAST_MS and pauses on hover', () => {
    const { container } = renderHostFull();
    act(() => emitTrigger('bgm-on'));
    const toast = container.querySelector('.ach-toast') as HTMLElement;
    act(() => {
      vi.advanceTimersByTime(TOAST_MS - 1);
    });
    expect(toast).toHaveAttribute('data-state', 'in');
    fireEvent.pointerEnter(toast);
    act(() => {
      vi.advanceTimersByTime(TOAST_MS * 2);
    });
    expect(toast).toHaveAttribute('data-state', 'in');
    fireEvent.pointerLeave(toast);
    act(() => {
      vi.advanceTimersByTime(TOAST_MS);
    });
    expect(toast).toHaveAttribute('data-state', 'out');
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(container.querySelector('.ach-toast')).toBeNull();
  });

  it('queues several unlocks and shows them one after another', () => {
    renderHostFull();
    act(() => {
      emitTrigger('bgm-on');
      emitTrigger('konami');
    });
    expect(screen.getByRole('status')).toHaveTextContent('Sound On');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.getByRole('status').querySelector('.sr-only')).toHaveTextContent('Entered the Konami Code.');
  });

  it('konami keys unlock the konami achievement', () => {
    renderHost();
    for (const key of KONAMI_SEQUENCE) fireEvent.keyDown(window, { key });
    expect(isUnlocked('konami')).toBe(true);
    expect(screen.getByRole('status').querySelector('.ach-toast__text')).toHaveTextContent('↑↑↓↓←→←→BA');
    expect(screen.getByRole('status').querySelector('.sr-only')).toHaveTextContent(
      '↑↑↓↓←→←→BA — Entered the Konami Code.',
    );
  });

  it('konami keys typed into an input unlock nothing', () => {
    renderHost('en', '<input aria-label="search" />');
    const input = screen.getByRole('textbox', { name: 'search' });
    for (const key of KONAMI_SEQUENCE) fireEvent.keyDown(input, { key });
    expect(isUnlocked('konami')).toBe(false);
  });

  it('hidden achievements show their real title once unlocked', () => {
    renderHost('ko');
    for (const key of KONAMI_SEQUENCE) fireEvent.keyDown(window, { key });
    const region = screen.getByRole('status');
    expect(region).toHaveTextContent('ACHIEVEMENT UNLOCKED');
    expect(region.querySelector('.ach-toast__text')).toHaveTextContent('↑↑↓↓←→←→BA');
    expect(region.querySelector('.sr-only')).toHaveTextContent('↑↑↓↓←→←→BA — 코나미 커맨드를 입력했습니다.');
    expect(region).not.toHaveTextContent('???');
    expect(region).not.toHaveTextContent('오래된 게임의 비밀 명령어가 통합니다.');
  });

  it('records the page section on mount and celebrates the fourth section', () => {
    localStorage.setItem(STORAGE_KEYS.visits, JSON.stringify({ sections: ['research', 'projects', 'records'], langs: ['en'] }));
    document.documentElement.setAttribute('data-section', 'player-log');
    renderHost();
    expect(screen.getByRole('status')).toHaveTextContent('Map Explored');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.visits) ?? 'null')).toEqual({
      sections: ['research', 'projects', 'records', 'player-log'],
      langs: ['en'],
    });
  });

  it('F-004: Escape dismisses the toast', () => {
    const { container } = renderHostFull();
    act(() => emitTrigger('bgm-on'));
    expect(container.querySelector('.ach-toast')).toHaveAttribute('data-state', 'in');
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(container.querySelector('.ach-toast')).toHaveAttribute('data-state', 'out');
  });

  it('F-028: with data-intro it waits for intro-done + hold before showing', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    document.documentElement.setAttribute('data-motion', 'full');
    document.documentElement.setAttribute('data-intro', 'playing');
    const { container } = renderHost();
    act(() => emitTrigger('bgm-on'));
    expect(container.querySelector('.ach-toast')).toBeNull();
    act(() => {
      window.dispatchEvent(new Event('sb:intro-done'));
    });
    expect(container.querySelector('.ach-toast')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(ENTRANCE_HOLD_MS - 1);
    });
    expect(container.querySelector('.ach-toast')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(container.querySelector('.ach-toast')).toHaveAttribute('data-state', 'in');
  });

  it('F-028: holds the toast while a dialog is open, and Escape then leaves it alone', async () => {
    const { container } = renderHost('en', '<dialog open><p>viewer</p></dialog>');
    act(() => emitTrigger('bgm-on'));
    expect(container.querySelector('.ach-toast')).toBeNull();
    const dialog = container.querySelector('dialog') as HTMLDialogElement;
    dialog.removeAttribute('open');
    await vi.waitFor(() => expect(container.querySelector('.ach-toast')).toHaveAttribute('data-state', 'in'));
    dialog.setAttribute('open', '');
    await vi.waitFor(() => expect(container.querySelector('.ach-toast')).toBeNull());
    dialog.removeAttribute('open');
    await vi.waitFor(() => expect(container.querySelector('.ach-toast')).not.toBeNull());
    // a dialog opened without hiding the toast yet (same tick): Escape belongs to the dialog
    const other = document.createElement('dialog');
    other.setAttribute('open', '');
    document.body.append(other);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(container.querySelector('.ach-toast')).toHaveAttribute('data-state', 'in');
  });

  it('F-004: focus landing on an element under the toast dismisses it; focus elsewhere does not', () => {
    const { container } = renderHost('en', '<a id="under" href="#a">under</a><a id="away" href="#b">away</a>');
    act(() => emitTrigger('bgm-on'));
    const toast = container.querySelector('.ach-toast') as HTMLElement;
    const rect = (left: number, top: number, w: number, h: number) =>
      ({ left, top, right: left + w, bottom: top + h, width: w, height: h, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
    toast.getBoundingClientRect = () => rect(600, 700, 360, 80);
    (document.getElementById('away') as HTMLElement).getBoundingClientRect = () => rect(0, 0, 100, 40);
    (document.getElementById('under') as HTMLElement).getBoundingClientRect = () => rect(620, 720, 100, 40);
    (document.getElementById('away') as HTMLElement).focus();
    expect(toast).toHaveAttribute('data-state', 'in');
    (document.getElementById('under') as HTMLElement).focus();
    expect(container.querySelector('.ach-toast')).toBeNull(); // reduced motion: gone at once
  });

  it('turning reduced motion on while holding shows the queued toast at once', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    document.documentElement.setAttribute('data-motion', 'full');
    const { container } = renderHost();
    act(() => emitTrigger('bgm-on'));
    expect(container.querySelector('.ach-toast')).toBeNull();
    document.documentElement.setAttribute('data-motion', 'reduce');
    window.dispatchEvent(new Event('sb:motion-change'));
    expect(container.querySelector('.ach-toast')).toHaveAttribute('data-state', 'in');
  });

  it('reads its language and close label from the host attributes', () => {
    const { container } = renderHost('ko');
    act(() => emitTrigger('bgm-on'));
    expect(container.querySelector('.ach-toast__text')).toHaveTextContent('소리 켜짐');
    expect(screen.getByRole('button', { name: '알림 닫기' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAccessibleName('업적 알림');
  });
});
