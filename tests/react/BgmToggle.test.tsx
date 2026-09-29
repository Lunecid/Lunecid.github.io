// P1-9b (P-03): dom tests of the BGM button's plain script (src/scripts/bgm-toggle.ts) on the server markup of
// src/components/hud/BgmToggle.astro (tests/helpers/hud-markup.ts; tests/astro/BgmToggle.test.ts pins that markup).
// Ported one-for-one from the former React island tests; the helpers now live in src/lib/bgm.ts.
import { fireEvent, screen } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BGM_FADE_IN,
  BGM_FADE_OUT,
  BGM_NAV_FADE_OUT,
  BGM_RESUME_FADE_IN,
  BGM_TIME_KEY,
  BGM_TIME_MAX_AGE_MS,
  BGM_VOLUME,
  isLeavingLink,
  isSameOriginLeave,
  readBgmTime,
  saveBgmTime,
} from '../../src/lib/bgm';
import { initBgmToggle } from '../../src/scripts/bgm-toggle';
import { STORAGE_KEYS } from '../../src/config';
import { bgmToggleMarkup } from '../helpers/hud-markup';

const SRC = '/audio/bgm/everything-you-ever-dreamed.mp3';

class FakeAudio {
  static instances: FakeAudio[] = [];
  static playImpl: () => Promise<void> = async () => undefined;
  src: string;
  preload = '';
  loop = true;
  currentTime = 0;
  duration = Number.NaN;
  paused = true;
  play = vi.fn(async () => {
    await FakeAudio.playImpl();
    this.paused = false;
  });
  pause = vi.fn(() => {
    this.paused = true;
  });
  addEventListener = vi.fn();
  constructor(src: string) {
    this.src = src;
    FakeAudio.instances.push(this);
  }
}

class FakeGain {
  static instances: FakeGain[] = [];
  gain = { value: 0, cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() };
  context = { currentTime: 0 };
  connect = vi.fn((node: unknown) => node);
  constructor() {
    FakeGain.instances.push(this);
  }
}

class FakeAudioContext {
  state = 'running';
  destination = {};
  resume = vi.fn(async () => undefined);
  createGain = vi.fn(() => new FakeGain());
  createMediaElementSource = vi.fn(() => ({ connect: vi.fn((node: unknown) => node) }));
}

vi.stubGlobal('Audio', FakeAudio);
vi.stubGlobal('AudioContext', FakeAudioContext);

function lastAudio(): FakeAudio {
  const audio = FakeAudio.instances.at(-1);
  if (!audio) throw new Error('no Audio element was created');
  return audio;
}

function lastGain(): FakeGain {
  const gain = FakeGain.instances.at(-1);
  if (!gain) throw new Error('no GainNode was created');
  return gain;
}

const teardowns: Array<() => void> = [];

/** Mounts the server markup (plus `extra` siblings) and runs the component script on it, as the page does. */
function mount(extra = ''): HTMLButtonElement {
  document.body.innerHTML = `${bgmToggleMarkup(SRC)}${extra}`;
  const button = document.querySelector<HTMLButtonElement>('button[data-bgm-toggle]');
  if (!button) throw new Error('no BGM button');
  teardowns.push(initBgmToggle(button));
  return button;
}

function setHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
}

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, String(value));
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    key: (index: number) => [...map.keys()][index] ?? null,
  };
}

beforeEach(() => {
  FakeAudio.instances = [];
  FakeGain.instances = [];
  FakeAudio.playImpl = async () => undefined;
  window.__sbTriggers = [];
  sessionStorage.clear();
  localStorage.clear();
  document.body.innerHTML = '';
  document.documentElement.lang = 'en';
});

afterEach(() => {
  for (const teardown of teardowns.splice(0)) teardown();
  Reflect.deleteProperty(document, 'hidden');
  Reflect.deleteProperty(document, 'visibilityState');
});

describe('bgm time helpers', () => {
  it('saves and restores a position within the age and duration window', () => {
    const storage = memoryStorage();
    const now = 1_000_000;
    saveBgmTime(42.5, now, storage);
    expect(JSON.parse(storage.getItem(BGM_TIME_KEY)!)).toEqual({ t: 42.5, at: now });
    expect(readBgmTime(now + 1000, 180, storage)).toBe(42.5);
  });

  it('ignores stale, negative, past-duration and malformed saves', () => {
    const storage = memoryStorage();
    const now = 1_000_000;
    saveBgmTime(10, now - BGM_TIME_MAX_AGE_MS - 1, storage);
    expect(readBgmTime(now, 180, storage)).toBeNull();
    saveBgmTime(200, now, storage);
    expect(readBgmTime(now, 180, storage)).toBeNull();
    storage.setItem(BGM_TIME_KEY, '{');
    expect(readBgmTime(now, 180, storage)).toBeNull();
    storage.setItem(BGM_TIME_KEY, JSON.stringify({ t: -1, at: now }));
    expect(readBgmTime(now, 180, storage)).toBeNull();
  });

  it('isLeavingLink is true for navigations off the page and false for hash-only', () => {
    const loc = { href: 'http://127.0.0.1/records/', origin: 'http://127.0.0.1', pathname: '/records/', search: '' };
    document.body.innerHTML = `
      <a id="nav" href="/projects/">projects</a>
      <a id="hash" href="#awards">awards</a>
      <a id="ext" href="https://example.com/">ext</a>
      <a id="cv" href="/cv.pdf" download>cv</a>
      <button id="btn">x</button>
    `;
    expect(isLeavingLink(document.getElementById('nav'), loc)).toBe(true);
    expect(isSameOriginLeave(document.getElementById('nav'), loc)).toBe(true);
    expect(isLeavingLink(document.getElementById('hash'), loc)).toBe(false);
    expect(isLeavingLink(document.getElementById('ext'), loc)).toBe(true);
    expect(isSameOriginLeave(document.getElementById('ext'), loc)).toBe(false);
    expect(isLeavingLink(document.getElementById('cv'), loc)).toBe(true);
    expect(isSameOriginLeave(document.getElementById('cv'), loc)).toBe(false);
    expect(isLeavingLink(document.getElementById('btn'), loc)).toBe(false);
    expect(
      isSameOriginLeave(document.getElementById('nav'), loc, {
        button: 0,
        ctrlKey: true,
        metaKey: false,
        shiftKey: false,
        altKey: false,
      }),
    ).toBe(false);
  });
});

describe('BgmToggle', () => {
  it("renders an off BGM button named 'BGM'", () => {
    mount();
    const button = screen.getByRole('button', { name: 'BGM' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button).toHaveTextContent('♪ BGM OFF');
    expect(button).not.toHaveAttribute('data-state');
    expect(FakeAudio.instances).toHaveLength(0); // nothing loads before a click
  });

  it('server markup is aria-pressed=false even when sb:sound is on (the script reads the choice)', () => {
    localStorage.setItem(STORAGE_KEYS.sound, 'on');
    const html = bgmToggleMarkup(SRC);
    expect(html).toMatch(/<button[^>]*aria-pressed="false"/);
    expect(html).toContain('OFF');
    expect(html).not.toMatch(/>ON</);
  });

  it("click turns it on, stores 'on', emits bgm-on and starts playback", async () => {
    const user = userEvent.setup();
    mount();
    const button = screen.getByRole('button', { name: 'BGM' });
    expect(FakeAudio.instances, 'nothing loads before the visitor turns music on').toHaveLength(0);
    await user.click(button);
    expect(FakeAudio.instances).toHaveLength(1);
    expect(lastAudio().preload, 'final fix 2 item 15: stream the track, do not buffer it all').toBe('none');
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button).toHaveTextContent('♪ BGM ON');
    expect(localStorage.getItem(STORAGE_KEYS.sound)).toBe('on');
    expect(window.__sbTriggers).toContain('bgm-on');
    const audio = lastAudio();
    expect(audio.src).toBe(SRC);
    await vi.waitFor(() => expect(audio.play).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(lastGain().gain.linearRampToValueAtTime).toHaveBeenCalledWith(BGM_VOLUME, BGM_FADE_IN));
  });

  it('second click fades out and pauses', async () => {
    const user = userEvent.setup();
    mount();
    const button = screen.getByRole('button', { name: 'BGM' });
    await user.click(button);
    const audio = lastAudio();
    await vi.waitFor(() => expect(lastGain().gain.linearRampToValueAtTime).toHaveBeenCalledWith(BGM_VOLUME, BGM_FADE_IN));
    await user.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(localStorage.getItem(STORAGE_KEYS.sound)).toBe('off');
    expect(lastGain().gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, BGM_FADE_OUT);
    expect(audio.pause).not.toHaveBeenCalled(); // fade first
    await vi.waitFor(() => expect(audio.pause).toHaveBeenCalledTimes(1), { timeout: 1000 });
  });

  it("remembered 'on' tries play on mount and clears waiting when it succeeds", async () => {
    localStorage.setItem(STORAGE_KEYS.sound, 'on');
    sessionStorage.setItem(BGM_TIME_KEY, JSON.stringify({ t: 33, at: Date.now() }));
    mount();
    const button = document.querySelector('.bgm') as HTMLButtonElement;
    expect(button).toHaveAttribute('aria-pressed', 'true');
    await vi.waitFor(() => expect(FakeAudio.instances).toHaveLength(1));
    expect(lastAudio().currentTime).toBe(33);
    await vi.waitFor(() => expect(lastAudio().play).toHaveBeenCalled());
    await vi.waitFor(() => expect(lastGain().gain.linearRampToValueAtTime).toHaveBeenCalledWith(BGM_VOLUME, BGM_RESUME_FADE_IN));
    await vi.waitFor(() => expect(button).not.toHaveAttribute('data-state'));
    expect(button).toHaveAccessibleName('BGM');
    expect(window.__sbTriggers).not.toContain('bgm-on');
  });

  it("remembered 'on' stays waiting when autoplay is blocked, then resumes from the saved time on a gesture", async () => {
    localStorage.setItem(STORAGE_KEYS.sound, 'on');
    sessionStorage.setItem(BGM_TIME_KEY, JSON.stringify({ t: 17.5, at: Date.now() }));
    FakeAudio.playImpl = async () => {
      throw new DOMException('NotAllowedError');
    };
    mount('<p>outside</p><a href="/projects/">leave</a>');
    const button = await screen.findByRole('button', { name: 'BGM' });
    await vi.waitFor(() => expect(button).toHaveAttribute('data-state', 'waiting'));
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button).toHaveTextContent('♪ BGM ON');
    expect(button).toHaveAccessibleDescription(/Background music is on/);
    expect(lastAudio().currentTime).toBe(17.5);

    FakeAudio.playImpl = async () => undefined;
    const playsBeforeLeave = lastAudio().play.mock.calls.length;
    fireEvent.pointerDown(screen.getByText('leave')); // leaving link must not kick
    expect(lastAudio().play.mock.calls.length).toBe(playsBeforeLeave);

    fireEvent.pointerDown(screen.getByText('outside'));
    await vi.waitFor(() => expect(lastAudio().play.mock.calls.length).toBeGreaterThan(playsBeforeLeave));
    expect(lastAudio().currentTime).toBe(17.5);
    await vi.waitFor(() => expect(button).not.toHaveAttribute('data-state'));
    expect(window.__sbTriggers).not.toContain('bgm-on');
  });

  it('while waiting, clicking the BGM button retries play instead of turning off', async () => {
    localStorage.setItem(STORAGE_KEYS.sound, 'on');
    FakeAudio.playImpl = async () => {
      throw new DOMException('NotAllowedError');
    };
    const user = userEvent.setup();
    mount();
    const button = await screen.findByRole('button', { name: 'BGM' });
    await vi.waitFor(() => expect(button).toHaveAttribute('data-state', 'waiting'));
    FakeAudio.playImpl = async () => undefined;
    await user.click(button);
    await vi.waitFor(() => expect(button).not.toHaveAttribute('data-state'));
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem(STORAGE_KEYS.sound)).toBe('on');
  });

  it('pagehide saves currentTime and a same-origin leave click starts the nav fade', async () => {
    const user = userEvent.setup();
    mount('<a href="/records/">records</a><a href="/cv.pdf" download>cv</a>');
    await user.click(screen.getByRole('button', { name: 'BGM' }));
    const audio = lastAudio();
    await vi.waitFor(() => expect(audio.play).toHaveBeenCalled());
    audio.currentTime = 55;
    const rampsBefore = lastGain().gain.linearRampToValueAtTime.mock.calls.length;
    fireEvent.click(screen.getByText('cv')); // download must not fade
    expect(lastGain().gain.linearRampToValueAtTime.mock.calls.length).toBe(rampsBefore);
    fireEvent.click(screen.getByText('records'));
    expect(lastGain().gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, BGM_NAV_FADE_OUT);
    window.dispatchEvent(new Event('pagehide'));
    expect(JSON.parse(sessionStorage.getItem(BGM_TIME_KEY)!)).toMatchObject({ t: 55 });
  });

  it('hidden tab pauses and visible tab resumes when on', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('button', { name: 'BGM' }));
    const audio = lastAudio();
    await vi.waitFor(() => expect(audio.play).toHaveBeenCalledTimes(1));
    audio.currentTime = 12;
    setHidden(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(audio.pause).toHaveBeenCalledTimes(1);
    expect(JSON.parse(sessionStorage.getItem(BGM_TIME_KEY)!)).toMatchObject({ t: 12 });
    setHidden(false);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(audio.play).toHaveBeenCalledTimes(2);
  });

  it('the waiting hint is a sr-only sibling after the button, in the page language, and goes away once playing', async () => {
    document.documentElement.lang = 'ko';
    localStorage.setItem(STORAGE_KEYS.sound, 'on');
    FakeAudio.playImpl = async () => {
      throw new DOMException('NotAllowedError');
    };
    const button = mount('<p>outside</p>');
    await vi.waitFor(() => expect(button).toHaveAttribute('data-state', 'waiting'));
    const hint = button.nextElementSibling as HTMLElement;
    expect(hint).toHaveClass('sr-only');
    expect(button.getAttribute('aria-describedby')).toBe(hint.id);
    expect(hint).toHaveTextContent('배경음악이 켜져 있습니다. 화면을 누르거나 키를 누르면 이어서 재생됩니다.');
    await new Promise((resolve) => setTimeout(resolve, 0)); // the failed first play() arms the gesture listeners
    FakeAudio.playImpl = async () => undefined;
    fireEvent.keyDown(screen.getByText('outside'), { key: 'a' });
    await vi.waitFor(() => expect(button).not.toHaveAttribute('aria-describedby'));
    expect(document.querySelector('.sr-only')).toBeNull();
  });
});
