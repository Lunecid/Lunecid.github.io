import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '../../src/config';

class FakeGain {
  gain = { value: 1 };
  connect = vi.fn((node: unknown) => node);
}

class FakeBufferSource {
  buffer: unknown = null;
  connect = vi.fn();
  start = vi.fn();
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  state = 'running';
  destination = {};
  gains: FakeGain[] = [];
  sources: FakeBufferSource[] = [];
  resume = vi.fn(async () => {
    this.state = 'running';
  });
  createGain = vi.fn(() => {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  });
  createBufferSource = vi.fn(() => {
    const source = new FakeBufferSource();
    this.sources.push(source);
    return source;
  });
  decodeAudioData = vi.fn(async (_data: ArrayBuffer) => ({ duration: 0.2 }));
  constructor() {
    FakeAudioContext.instances.push(this);
  }
}

const fetchMock = vi.fn(async (_url: string) => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }));

async function loadSound() {
  vi.resetModules(); // fresh AudioContext singleton and buffer cache per test
  return import('../../src/lib/sound');
}

function setHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
}

beforeEach(() => {
  FakeAudioContext.instances = [];
  fetchMock.mockClear();
  fetchMock.mockImplementation(async (_url: string) => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }));
  vi.stubGlobal('AudioContext', FakeAudioContext);
  vi.stubGlobal('fetch', fetchMock);
  document.documentElement.removeAttribute('data-sfx');
});

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, 'hidden');
  Reflect.deleteProperty(document, 'visibilityState');
  document.documentElement.removeAttribute('data-sfx');
});

describe('sound', () => {
  it('soundOn defaults false and tolerates throwing storage', async () => {
    const { setSoundOn, soundOn, SOUND_EVENT } = await loadSound();
    expect(soundOn()).toBe(false);
    const listener = vi.fn();
    window.addEventListener(SOUND_EVENT, listener);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage denied');
    });
    expect(soundOn()).toBe(false);
    expect(() => setSoundOn(true)).not.toThrow();
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(SOUND_EVENT, listener);
  });

  it('soundMuted: true only for "off"; false when unset, "on", or storage throws', async () => {
    const { soundMuted } = await loadSound();
    localStorage.removeItem('sb:sound');
    expect(soundMuted()).toBe(false);
    localStorage.setItem('sb:sound', 'on');
    expect(soundMuted()).toBe(false);
    localStorage.setItem('sb:sound', 'off');
    expect(soundMuted()).toBe(true);
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(soundMuted()).toBe(false);
    spy.mockRestore();
    localStorage.removeItem('sb:sound');
  });

  it('setSoundOn stores and dispatches sb:sound-change', async () => {
    const { setSoundOn, soundOn, sfxUrl, SOUND_EVENT } = await loadSound();
    expect(SOUND_EVENT).toBe('sb:sound-change');
    const details: unknown[] = [];
    const listener = (event: Event) => details.push((event as CustomEvent<boolean>).detail);
    window.addEventListener(SOUND_EVENT, listener);
    setSoundOn(true);
    expect(localStorage.getItem(STORAGE_KEYS.sound)).toBe('on');
    expect(soundOn()).toBe(true);
    setSoundOn(false);
    expect(localStorage.getItem(STORAGE_KEYS.sound)).toBe('off');
    expect(soundOn()).toBe(false);
    expect(details).toEqual([true, false]);
    expect(sfxUrl('open')).toBe('/audio/sfx/open.mp3');
    window.removeEventListener(SOUND_EVENT, listener);
  });

  it('playSfx does nothing without html[data-sfx=on]', async () => {
    const { playSfx, setSoundOn } = await loadSound();
    setSoundOn(true);
    await playSfx('move');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(FakeAudioContext.instances).toHaveLength(0);
  });

  it('playSfx does nothing when sound is off or the tab is hidden', async () => {
    const { playSfx, setSoundOn } = await loadSound();
    document.documentElement.setAttribute('data-sfx', 'on');
    await playSfx('move');
    expect(fetchMock).not.toHaveBeenCalled();
    setSoundOn(true);
    setHidden(true);
    await playSfx('move');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(FakeAudioContext.instances).toHaveLength(0);
  });

  it('playSfx fetches /audio/sfx/<name>.mp3 once and reuses the buffer', async () => {
    const { playSfx, setSoundOn } = await loadSound();
    document.documentElement.setAttribute('data-sfx', 'on');
    setSoundOn(true);
    await playSfx('select');
    await playSfx('select');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/audio/sfx/select.mp3');
    expect(FakeAudioContext.instances).toHaveLength(1);
    const ctx = FakeAudioContext.instances[0]!;
    expect(ctx.decodeAudioData).toHaveBeenCalledTimes(1);
    expect(ctx.sources).toHaveLength(2);
    for (const source of ctx.sources) expect(source.start).toHaveBeenCalledTimes(1);
    expect(ctx.gains[0]?.gain.value).toBe(0.3);
  });

  it('a failed fetch is swallowed and retried on the next call', async () => {
    const { playSfx, setSoundOn } = await loadSound();
    document.documentElement.setAttribute('data-sfx', 'on');
    setSoundOn(true);
    fetchMock.mockImplementationOnce(async () => {
      throw new Error('offline');
    });
    await expect(playSfx('open')).resolves.toBeUndefined();
    await playSfx('open');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(FakeAudioContext.instances[0]?.sources).toHaveLength(1);
  });

  it('audioContext is a lazy singleton that resumes when suspended', async () => {
    const { audioContext } = await loadSound();
    expect(FakeAudioContext.instances).toHaveLength(0);
    const first = audioContext() as unknown as FakeAudioContext;
    first.state = 'suspended';
    const second = audioContext() as unknown as FakeAudioContext;
    expect(second).toBe(first);
    expect(FakeAudioContext.instances).toHaveLength(1);
    expect(first.resume).toHaveBeenCalledTimes(1);
  });

  it('§1.8: playSfx is a no-op on a page whose version has no sfx module, even with data-sfx=on and sound on', async () => {
    const { playSfx, setSoundOn } = await loadSound();
    setSoundOn(true);
    document.documentElement.setAttribute('data-sfx', 'on');
    document.documentElement.setAttribute('data-variant', 'data');
    await playSfx('open');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(FakeAudioContext.instances).toHaveLength(0);
  });
});
