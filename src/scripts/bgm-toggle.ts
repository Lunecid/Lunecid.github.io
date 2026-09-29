// src/scripts/bgm-toggle.ts — behaviour of the HUD BGM button (src/components/hud/BgmToggle.astro; spec §4 소리,
// §5 BGM 버튼; mockup-port §12). P1-9b (P-03): a line-for-line port of the former React island
// src/islands/BgmToggle.tsx to a plain script, so game pages no longer ship React for it.
// Off by default; the track loads only after a click; gain 0.3 through Web Audio with a fade at the loop point;
// the remembered "on" is read after load (the server markup is always aria-pressed="false"), tries play()
// immediately, and if autoplay is blocked waits with data-state="waiting" until the first pointer/key/touch gesture
// that is not on this button and not on a link that leaves the page. Position is saved to sessionStorage on
// pagehide (and visibility hidden as backup) and restored on the next page. Pauses while the tab is hidden.
import { emitTrigger } from '../lib/achievements';
import {
  BGM_FADE_IN,
  BGM_FADE_LOOP,
  BGM_FADE_OUT,
  BGM_NAV_FADE_OUT,
  BGM_RESUME_FADE_IN,
  BGM_TIME_KEY,
  BGM_VOLUME,
  isLeavingLink,
  isSameOriginLeave,
  readBgmTime,
  saveBgmTime,
} from '../lib/bgm';
import { SOUND_EVENT, audioContext, setSoundOn, soundOn } from '../lib/sound';

function waitingHint(lang: string): string {
  return lang.startsWith('ko')
    ? '배경음악이 켜져 있습니다. 화면을 누르거나 키를 누르면 이어서 재생됩니다.'
    : 'Background music is on. Click elsewhere or press a key to resume.';
}

let waitingHintIdSeq = 0;

/**
 * Binds one server-rendered `button[data-bgm-toggle]` (data-src = track URL). Returns a teardown that removes every
 * listener (the page never calls it; the dom tests do, as React's unmount did).
 */
export function initBgmToggle(button: HTMLButtonElement): () => void {
  const src = button.dataset.src ?? '';
  const stateEl = button.querySelector<HTMLElement>('.bgm__state');
  const hintId = `bgm-wait-${++waitingHintIdSeq}`;
  let on = false;
  let waiting = false;
  let audio: HTMLAudioElement | null = null;
  let gain: GainNode | null = null;
  let fadingOut = false;
  let stopTimer: number | undefined;
  let resumeFade = false;
  let hint: HTMLSpanElement | null = null;

  /** Mirrors the island's render: aria-pressed, ON/OFF, data-state and the sr-only hint while waiting. */
  const render = () => {
    button.setAttribute('aria-pressed', String(on));
    if (stateEl) stateEl.textContent = on ? 'ON' : 'OFF';
    if (waiting) {
      button.setAttribute('aria-describedby', hintId);
      button.setAttribute('data-state', 'waiting');
      if (!hint) {
        hint = document.createElement('span');
        hint.id = hintId;
        hint.className = 'sr-only';
        button.after(hint);
      }
      hint.textContent = waitingHint(document.documentElement.lang || 'en');
    } else {
      button.removeAttribute('aria-describedby');
      button.removeAttribute('data-state');
      hint?.remove();
      hint = null;
    }
  };

  const setOn = (next: boolean) => {
    on = next;
    render();
  };

  const setWaitingState = (next: boolean) => {
    waiting = next;
    render();
  };

  const ramp = (to: number, seconds: number) => {
    const g = gain;
    if (!g) return;
    const now = g.context.currentTime;
    g.gain.cancelScheduledValues(now);
    g.gain.setValueAtTime(g.gain.value, now);
    g.gain.linearRampToValueAtTime(to, now + seconds);
  };

  const ensure = (): HTMLAudioElement => {
    if (audio) return audio;
    const c = audioContext();
    const a = new Audio(src);
    // Final fix 2 item 15: 'none', not 'auto'. The element exists only once the visitor turns music on, and play()
    // streams the track as it plays instead of the browser buffering the whole file up front (N20: target ≤3.6 MB
    // at 128 kbps; re-encode when an encoder is available).
    a.preload = 'none';
    a.loop = false; // looped by hand so the gain can fade out before the end and back in after the restart
    const g = c.createGain();
    g.gain.value = 0;
    c.createMediaElementSource(a).connect(g).connect(c.destination);
    a.addEventListener('timeupdate', () => {
      if (!fadingOut && a.duration && a.duration - a.currentTime <= BGM_FADE_LOOP) {
        fadingOut = true;
        ramp(0, Math.max(0.1, a.duration - a.currentTime));
      }
    });
    a.addEventListener('ended', () => {
      fadingOut = false;
      a.currentTime = 0;
      void a.play().catch(() => undefined);
      ramp(BGM_VOLUME, BGM_FADE_IN);
    });
    audio = a;
    gain = g;
    return a;
  };

  const applySavedTime = (a: HTMLAudioElement) => {
    const duration = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : undefined;
    const saved = readBgmTime(Date.now(), duration);
    if (saved == null) return;
    try {
      a.currentTime = saved;
    } catch {
      /* ignore seek errors before metadata */
    }
  };

  const start = async (): Promise<boolean> => {
    window.clearTimeout(stopTimer);
    try {
      const a = ensure();
      applySavedTime(a);
      await audioContext().resume();
      await a.play();
      const fade = resumeFade ? BGM_RESUME_FADE_IN : BGM_FADE_IN;
      resumeFade = false;
      ramp(BGM_VOLUME, fade);
      setWaitingState(false);
      return true;
    } catch {
      /* autoplay blocked or audio unsupported: keep the remembered ON + waiting state */
      setWaitingState(true);
      resumeFade = true;
      return false;
    }
  };

  const stop = () => {
    const a = audio;
    setWaitingState(false);
    resumeFade = false;
    try {
      sessionStorage.removeItem(BGM_TIME_KEY);
    } catch {
      /* ignore */
    }
    if (!a) return;
    ramp(0, BGM_FADE_OUT);
    window.clearTimeout(stopTimer);
    stopTimer = window.setTimeout(() => a.pause(), BGM_FADE_OUT * 1000);
  };

  const persistTime = () => {
    const a = audio;
    if (!on || !a) return;
    if (a.paused && a.currentTime <= 0) return;
    saveBgmTime(a.currentTime);
  };

  const toggle = () => {
    // While waiting for autoplay, the first press retries play from the saved position instead of turning off.
    if (waiting && on) {
      resumeFade = true;
      void start();
      return;
    }
    const next = !on;
    setOn(next);
    setSoundOn(next);
    if (next) {
      resumeFade = false;
      void start();
      emitTrigger('bgm-on');
    } else {
      stop();
    }
  };
  button.addEventListener('click', toggle);

  // Remembered "on": try play() on load (restore position + resume fade). If blocked, wait for a gesture.
  let cleaned = false;
  const kick = (event: Event) => {
    if (cleaned) return;
    const target = event.target as Element | null;
    if (target && typeof target.closest === 'function' && target.closest('.bgm')) return;
    if (isLeavingLink(event.target)) return;
    if (!on) {
      cleanupKick();
      return;
    }
    resumeFade = true;
    void start().then((ok) => {
      if (ok || !on) cleanupKick();
      // failed resume: keep listeners armed for the next gesture
    });
  };
  const arm = () => {
    window.addEventListener('pointerdown', kick, true);
    window.addEventListener('keydown', kick, true);
    window.addEventListener('touchstart', kick, true);
  };
  function cleanupKick() {
    cleaned = true;
    window.removeEventListener('pointerdown', kick, true);
    window.removeEventListener('keydown', kick, true);
    window.removeEventListener('touchstart', kick, true);
  }
  if (soundOn()) {
    on = true;
    waiting = true;
    render();
    resumeFade = true;
    void start().then((ok) => {
      if (cleaned || ok) return;
      arm();
    });
  }

  // Another control changed the preference: follow it (turning off stops the track; never starts a second one).
  const onChange = (event: Event) => {
    const next = (event as CustomEvent<boolean>).detail === true;
    if (next === on) return;
    setOn(next);
    if (!next) stop();
  };
  window.addEventListener(SOUND_EVENT, onChange);

  // Pause in background tabs; save position when the page is being left or hidden.
  const onVisibility = () => {
    const a = audio;
    if (document.hidden) {
      persistTime();
      if (a) a.pause();
      return;
    }
    if (a && on && !waiting) void a.play().catch(() => undefined);
  };
  const onPageHide = () => persistTime();
  const onLeaveClick = (event: MouseEvent) => {
    if (!on || !audio || audio.paused) return;
    if (!isSameOriginLeave(event.target, location, event)) return;
    ramp(0, BGM_NAV_FADE_OUT);
  };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide);
  document.addEventListener('click', onLeaveClick, true);

  return () => {
    cleanupKick();
    button.removeEventListener('click', toggle);
    window.removeEventListener(SOUND_EVENT, onChange);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', onPageHide);
    document.removeEventListener('click', onLeaveClick, true);
    window.clearTimeout(stopTimer);
  };
}
