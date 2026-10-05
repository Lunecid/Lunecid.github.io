// src/lib/sound.ts — shared sound preference, lazy Web Audio context and menu SFX (spec §4 소리).
// localStorage['sb:sound'] = 'on' | 'off' (default off). SFX play only when <html data-sfx="on"> (BaseLayout sets it
// only when all four SFX files exist), sound is on and the tab is visible. Web Audio gain is used because iOS Safari
// ignores HTMLMediaElement.volume. Sound is decoration: every error is swallowed.
import { MEDIA, STORAGE_KEYS } from '../config';
import type { SfxName } from '../types';
import { moduleOn } from './variant-runtime';

export const SOUND_EVENT = 'sb:sound-change';

const SFX_GAIN = 0.3;
let ctx: AudioContext | null = null;
let sfxBus: GainNode | null = null;
const buffers = new Map<SfxName, Promise<AudioBuffer>>();

/** localStorage['sb:sound'] === 'on'; false on error. */
export function soundOn(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEYS.sound) === 'on';
  } catch {
    return false;
  }
}

/** localStorage['sb:sound'] === 'off': the visitor muted sound. False when unset, 'on', or on error (the chooser's
 *  page-turn sound plays unless muted, MO-40; the game pages' sound stays off unless turned on, soundOn). */
export function soundMuted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEYS.sound) === 'off';
  } catch {
    return false;
  }
}

/** Stores 'on' | 'off' (errors ignored) and dispatches SOUND_EVENT with the new value. */
export function setSoundOn(on: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEYS.sound, on ? 'on' : 'off');
  } catch {
    /* storage blocked: the choice lasts for this page view */
  }
  window.dispatchEvent(new CustomEvent<boolean>(SOUND_EVENT, { detail: on }));
}

/** Lazy singleton; resumes it when the browser suspended it. Call only after a user gesture. */
export function audioContext(): AudioContext {
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  return ctx;
}

export function sfxUrl(name: SfxName): string {
  return `${MEDIA.sfxDir}${name}.mp3`;
}

export async function playSfx(name: SfxName): Promise<void> {
  if (typeof document === 'undefined') return;
  if (!moduleOn('sfx')) return; // §1.8: no sound on a version without the sfx module
  if (document.documentElement.dataset.sfx !== 'on' || !soundOn() || document.hidden) return;
  try {
    const c = audioContext();
    if (!sfxBus) {
      sfxBus = c.createGain();
      sfxBus.gain.value = SFX_GAIN;
      sfxBus.connect(c.destination);
    }
    const bus = sfxBus;
    let pending = buffers.get(name);
    if (!pending) {
      pending = fetch(sfxUrl(name))
        .then((response) => {
          if (!response.ok) throw new Error(`SFX ${name}: HTTP ${response.status}`);
          return response.arrayBuffer();
        })
        .then((data) => c.decodeAudioData(data));
      buffers.set(name, pending);
      pending.catch(() => buffers.delete(name)); // retry on the next call
    }
    const buffer = await pending; // a failed fetch/decode throws here, before any node is created
    const source = c.createBufferSource();
    source.buffer = buffer;
    source.connect(bus);
    source.start();
  } catch {
    /* sound is decoration: never break the page */
  }
}
