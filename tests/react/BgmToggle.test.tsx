import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BgmToggle, { BGM_FADE_IN, BGM_FADE_OUT, BGM_VOLUME } from '../../src/islands/BgmToggle';
import { STORAGE_KEYS } from '../../src/config';

const SRC = '/audio/bgm/everything-you-ever-dreamed.mp3';

class FakeAudio {
  static instances: FakeAudio[] = [];
  src: string;
  preload = '';
  loop = true;
  currentTime = 0;
  duration = Number.NaN;
  play = vi.fn(async () => undefined);
  pause = vi.fn();
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

function setHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
}

beforeEach(() => {
  FakeAudio.instances = [];
  FakeGain.instances = [];
  window.__sbTriggers = [];
});

afterEach(() => {
  Reflect.deleteProperty(document, 'hidden');
  Reflect.deleteProperty(document, 'visibilityState');
});

describe('BgmToggle', () => {
  it("renders an off BGM button named 'BGM'", () => {
    render(<BgmToggle src={SRC} />);
    const button = screen.getByRole('button', { name: 'BGM' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button).toHaveTextContent('♪ BGM OFF');
    expect(FakeAudio.instances).toHaveLength(0); // nothing loads before a click
  });

  it('SSR markup is aria-pressed=false even when sb:sound is on', () => {
    localStorage.setItem(STORAGE_KEYS.sound, 'on');
    const html = renderToString(<BgmToggle src={SRC} />);
    expect(html).toMatch(/<button[^>]*aria-pressed="false"/);
    expect(html).toContain('OFF');
    expect(html).not.toMatch(/>ON</);
  });

  it("click turns it on, stores 'on', emits bgm-on and starts playback", async () => {
    const user = userEvent.setup();
    render(<BgmToggle src={SRC} />);
    const button = screen.getByRole('button', { name: 'BGM' });
    expect(FakeAudio.instances, 'nothing loads before the visitor turns music on').toHaveLength(0);
    await user.click(button);
    expect(FakeAudio.instances).toHaveLength(1);
    expect(lastAudio().preload, "final fix 2 item 15: stream the 8.8 MB track, don't buffer it all").toBe('none');
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
    render(<BgmToggle src={SRC} />);
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

  it("remembered 'on' shows pressed after mount but waits for the first outside gesture", async () => {
    localStorage.setItem(STORAGE_KEYS.sound, 'on');
    render(
      <>
        <BgmToggle src={SRC} />
        <p>outside</p>
      </>,
    );
    const button = screen.getByRole('button', { name: 'BGM' });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(FakeAudio.instances).toHaveLength(0);
    fireEvent.pointerDown(button); // the button handles its own clicks
    expect(FakeAudio.instances).toHaveLength(0);
    fireEvent.pointerDown(screen.getByText('outside'));
    await vi.waitFor(() => expect(lastAudio().play).toHaveBeenCalledTimes(1));
    expect(window.__sbTriggers).not.toContain('bgm-on'); // resuming is not a new opt-in
  });

  it('hidden tab pauses and visible tab resumes when on', async () => {
    const user = userEvent.setup();
    render(<BgmToggle src={SRC} />);
    await user.click(screen.getByRole('button', { name: 'BGM' }));
    const audio = lastAudio();
    await vi.waitFor(() => expect(audio.play).toHaveBeenCalledTimes(1));
    setHidden(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(audio.pause).toHaveBeenCalledTimes(1);
    setHidden(false);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(audio.play).toHaveBeenCalledTimes(2);
  });
});
