import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '../../src/config';
import { NAV_SECTIONS } from '../../src/types';
import {
  STORAGE_BLOCKED_EVENT,
  TRIGGER_EVENT,
  UNLOCK_EVENT,
  __resetAchievementMemory,
  availableAchievements,
  drainTriggers,
  emitTrigger,
  idsForTrigger,
  isStorageBlocked,
  isUnlocked,
  readUnlocked,
  recordVisit,
  toNavSection,
  unlock,
  type AchievementDef,
} from '../../src/lib/achievements';

const DEFS: AchievementDef[] = [
  {
    id: 'abstract-reader',
    trigger: 'open-abstract',
    hidden: false,
    title: { ko: '초록 펼치기', en: 'Abstract Opened' },
    description: { ko: '논문 초록을 펼쳐 읽었습니다.', en: 'Opened a paper abstract.' },
    hint: { ko: '논문의 [초록]을 눌러 보세요.', en: 'Try [Abstract] on a paper.' },
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

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 10));

beforeEach(() => {
  __resetAchievementMemory();
  window.__sbTriggers = [];
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('achievements runtime', () => {
  it('P-02 (F-091): a throwing storage write flags the shared store once and fires the blocked event once', () => {
    const listener = vi.fn();
    window.addEventListener(STORAGE_BLOCKED_EVENT, listener);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    expect(isStorageBlocked()).toBe(false);
    unlock('bgm-on');
    recordVisit(null, 'ko');
    expect(isStorageBlocked()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    __resetAchievementMemory();
    expect(isStorageBlocked()).toBe(false);
    window.removeEventListener(STORAGE_BLOCKED_EVENT, listener);
  });

  it('emitTrigger queues and dispatches sb:trigger', () => {
    const listener = vi.fn();
    window.addEventListener(TRIGGER_EVENT, listener);
    emitTrigger('bgm-on');
    expect(window.__sbTriggers).toEqual(['bgm-on']);
    expect(listener).toHaveBeenCalledTimes(1);
    expect((listener.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({ trigger: 'bgm-on' });
    window.removeEventListener(TRIGGER_EVENT, listener);
  });

  it('drainTriggers empties the queue', () => {
    emitTrigger('konami');
    emitTrigger('open-abstract');
    const queue = window.__sbTriggers;
    expect(drainTriggers()).toEqual(['konami', 'open-abstract']);
    expect(drainTriggers()).toEqual([]);
    expect(queue).toEqual([]); // emptied in place, so an early reference sees it too
  });

  it('unlock is idempotent and dispatches sb:achievement-unlocked once', () => {
    const listener = vi.fn();
    window.addEventListener(UNLOCK_EVENT, listener);
    expect(isUnlocked('konami')).toBe(false);
    expect(unlock('konami', new Date('2026-09-26T00:00:00Z'))).toBe(true);
    expect(unlock('konami')).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
    expect((listener.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({ id: 'konami' });
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.achievements) ?? '{}')).toEqual({ konami: '2026-09-26T00:00:00.000Z' });
    expect(isUnlocked('konami')).toBe(true);
    expect(readUnlocked()).toEqual({ konami: '2026-09-26T00:00:00.000Z' });
    window.removeEventListener(UNLOCK_EVENT, listener);
  });

  it('unlock survives a throwing localStorage via memory', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage denied');
    });
    expect(readUnlocked()).toEqual({});
    expect(unlock('konami')).toBe(true);
    expect(isUnlocked('konami')).toBe(true);
    expect(unlock('konami')).toBe(false);
    expect(Object.keys(readUnlocked())).toEqual(['konami']);
  });

  it('readUnlocked ignores malformed storage', () => {
    localStorage.setItem(STORAGE_KEYS.achievements, '{not json');
    expect(readUnlocked()).toEqual({});
    localStorage.setItem(STORAGE_KEYS.achievements, JSON.stringify(['konami']));
    expect(readUnlocked()).toEqual({});
    localStorage.setItem(STORAGE_KEYS.achievements, JSON.stringify({ konami: 5, 'game-over': '2026-01-01T00:00:00.000Z' }));
    expect(readUnlocked()).toEqual({ 'game-over': '2026-01-01T00:00:00.000Z' });
  });

  it('availableAchievements drops bgm-on only when there is no BGM file (P1-18)', () => {
    const defs = [{ trigger: 'bgm-on' as const, id: 'sound-on' }, { trigger: 'konami' as const, id: 'konami' }];
    expect(availableAchievements(defs, { bgm: true }).map((d) => d.id)).toEqual(['sound-on', 'konami']);
    expect(availableAchievements(defs, { bgm: false }).map((d) => d.id)).toEqual(['konami']);
  });

  it('idsForTrigger maps triggers to ids', () => {
    expect(idsForTrigger(DEFS, 'open-abstract')).toEqual(['abstract-reader']);
    expect(idsForTrigger(DEFS, 'konami')).toEqual(['konami']);
    expect(idsForTrigger(DEFS, 'bgm-on')).toEqual([]);
  });

  it('toNavSection accepts the 4 sections and maps anything else to null', () => {
    for (const section of NAV_SECTIONS) expect(toNavSection(section)).toBe(section);
    for (const value of [undefined, '', 'home', 'stats', 'Research', 'player log']) expect(toNavSection(value)).toBeNull();
  });

  it('recordVisit returns visit-all-sections after the 4th section and switch-language after both langs', () => {
    expect(recordVisit('research', 'ko')).toEqual([]);
    expect(recordVisit('projects', 'ko')).toEqual([]);
    expect(recordVisit(null, 'ko')).toEqual([]);
    expect(recordVisit('records', 'ko')).toEqual([]);
    expect(recordVisit('research', 'ko')).toEqual([]);
    expect(recordVisit('player-log', 'ko')).toEqual(['visit-all-sections']);
    expect(recordVisit(null, 'en')).toEqual(['visit-all-sections', 'switch-language']);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.visits) ?? 'null')).toEqual({
      sections: ['research', 'projects', 'records', 'player-log'],
      langs: ['ko', 'en'],
    });
  });

  it('recordVisit tolerates malformed and throwing storage', () => {
    localStorage.setItem(STORAGE_KEYS.visits, '{"sections":["research","bogus"],"langs":"ko"}');
    expect(recordVisit('projects', 'en')).toEqual([]);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.visits) ?? 'null')).toEqual({ sections: ['research', 'projects'], langs: ['en'] });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage denied');
    });
    expect(recordVisit('records', 'ko')).toEqual(['switch-language']);
    expect(recordVisit('player-log', 'ko')).toEqual(['visit-all-sections', 'switch-language']);
  });

  it('disclosure-trigger toggles the panel and emits open-abstract only when an abstract opens (final review fix 1 item 4)', async () => {
    document.body.innerHTML = [
      '<button id="abs" type="button" aria-expanded="false" aria-controls="abs-panel" data-trigger="open-abstract" data-disclosure>초록</button>',
      '<div id="abs-panel"><p>본문</p></div>',
      '<button id="bib" type="button" aria-expanded="false" aria-controls="bib-panel" data-disclosure>BibTeX</button>',
      '<div id="bib-panel"><pre>@x</pre></div>',
      '<button id="bad" type="button" aria-expanded="false" aria-controls="bad-panel" data-trigger="not-a-trigger" data-disclosure>x</button>',
      '<div id="bad-panel"></div>',
    ].join('');
    await import('../../src/scripts/disclosure-trigger');
    const button = (id: string) => document.getElementById(id) as HTMLButtonElement;
    const panel = (id: string) => document.getElementById(`${id}-panel`) as HTMLElement;
    for (const id of ['abs', 'bib', 'bad']) expect(button(id).hasAttribute('data-disclosure-bound'), id).toBe(true);

    button('abs').click();
    await tick();
    expect(button('abs').getAttribute('aria-expanded')).toBe('true');
    expect(panel('abs').hasAttribute('data-open')).toBe(true);
    const opened = drainTriggers();
    expect(opened.length).toBeGreaterThan(0);
    expect(new Set(opened)).toEqual(new Set(['open-abstract']));

    button('abs').click(); // closing emits nothing
    button('bib').click(); // no data-trigger
    button('bad').click(); // not an AchievementTrigger
    await tick();
    expect(button('abs').getAttribute('aria-expanded')).toBe('false');
    expect(panel('abs').hasAttribute('data-open')).toBe(false);
    expect(panel('bib').hasAttribute('data-open')).toBe(true);
    expect(drainTriggers()).toEqual([]);
  });

  it('§1.8: emitTrigger does nothing on a page without the achievements module', () => {
    document.documentElement.setAttribute('data-variant', 'data');
    const listener = vi.fn();
    window.addEventListener(TRIGGER_EVENT, listener);
    emitTrigger('open-certificate');
    expect(window.__sbTriggers).toEqual([]);
    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener(TRIGGER_EVENT, listener);
  });
});
