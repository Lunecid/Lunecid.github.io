// src/islands/BgmToggle.tsx — BGM button in the HUD nav (client:idle; spec §4 소리, §5 BGM 버튼; mockup-port §12).
// Off by default; the track loads only after a click; gain 0.3 through Web Audio with a fade at the loop point;
// the remembered "on" is read after mount (SSR and the first client render are always aria-pressed="false"),
// tries play() immediately, and if autoplay is blocked waits with data-state="waiting" until the first
// pointer/key/touch gesture that is not on this button and not on a link that leaves the page. Position is
// saved to sessionStorage on pagehide (and visibility hidden as backup) and restored on the next page.
// Pauses while the tab is hidden.
import { useCallback, useEffect, useRef, useState } from 'react';
import { emitTrigger } from '../lib/achievements';
import { SOUND_EVENT, audioContext, setSoundOn, soundOn } from '../lib/sound';
import './BgmToggle.css';

export const BGM_VOLUME = 0.3,
  BGM_FADE_IN = 1.5,
  BGM_FADE_LOOP = 2.5,
  BGM_FADE_OUT = 0.3,
  /** Page-leave fade so a same-origin navigation is not an abrupt cut (N20 / F-027). */
  BGM_NAV_FADE_OUT = 0.25,
  /** Resume / remembered-on fade-in (N20). */
  BGM_RESUME_FADE_IN = 0.6,
  BGM_TIME_MAX_AGE_MS = 30 * 60 * 1000;

export const BGM_TIME_KEY = 'sb:bgm-t';

export type BgmTimeSave = { t: number; at: number };

export interface BgmToggleProps {
  src: string;
  label?: string;
}

/** Persist playback position for cross-page resume. Errors ignored. */
export function saveBgmTime(t: number, at: number = Date.now(), storage: Storage | null = defaultSession()): void {
  if (!storage || !Number.isFinite(t) || t < 0) return;
  try {
    const payload: BgmTimeSave = { t, at };
    storage.setItem(BGM_TIME_KEY, JSON.stringify(payload));
  } catch {
    /* storage blocked */
  }
}

/**
 * Read a saved position. Returns null when missing, malformed, older than maxAge, or past the track length.
 * The track loops, so a value at/beyond duration is ignored (start from 0 on the next play instead).
 */
export function readBgmTime(
  now: number = Date.now(),
  duration?: number,
  storage: Storage | null = defaultSession(),
  maxAgeMs: number = BGM_TIME_MAX_AGE_MS,
): number | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(BGM_TIME_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BgmTimeSave>;
    if (typeof parsed.t !== 'number' || typeof parsed.at !== 'number') return null;
    if (!Number.isFinite(parsed.t) || parsed.t < 0 || !Number.isFinite(parsed.at)) return null;
    if (now - parsed.at > maxAgeMs) return null;
    if (duration != null && Number.isFinite(duration) && duration > 0 && parsed.t >= duration) return null;
    return parsed.t;
  } catch {
    return null;
  }
}

/** True when the event target is (inside) an anchor that navigates away from this page. */
export function isLeavingLink(target: EventTarget | null, loc: Pick<Location, 'href' | 'origin' | 'pathname' | 'search'> = location): boolean {
  const el = target as Element | null;
  if (!el || typeof el.closest !== 'function') return false;
  const anchor = el.closest('a[href]');
  if (!(anchor instanceof HTMLAnchorElement)) return false;
  const hrefAttr = anchor.getAttribute('href');
  if (!hrefAttr || hrefAttr.startsWith('javascript:')) return false;
  if (anchor.hasAttribute('download')) return true;
  if (anchor.target && anchor.target !== '_self') return true;
  try {
    const url = new URL(hrefAttr, loc.href);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return true;
    // Same document, hash-only: stay on the page.
    if (url.origin === loc.origin && url.pathname === loc.pathname && url.search === loc.search) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Same-origin full navigation that will unload this tab (N20 leave fade).
 * Excludes download, new-tab targets, and modified/non-primary clicks that keep the page open.
 */
export function isSameOriginLeave(
  target: EventTarget | null,
  loc: Pick<Location, 'href' | 'origin' | 'pathname' | 'search'> = location,
  event?: Pick<MouseEvent, 'button' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>,
): boolean {
  if (event) {
    if (event.button !== 0) return false;
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return false;
  }
  const el = target as Element | null;
  if (!el || typeof el.closest !== 'function') return false;
  const anchor = el.closest('a[href]');
  if (!(anchor instanceof HTMLAnchorElement)) return false;
  if (anchor.hasAttribute('download')) return false;
  if (anchor.target && anchor.target !== '_self') return false;
  const hrefAttr = anchor.getAttribute('href');
  if (!hrefAttr || hrefAttr.startsWith('javascript:')) return false;
  try {
    const url = new URL(hrefAttr, loc.href);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    if (url.origin !== loc.origin) return false;
    if (url.pathname === loc.pathname && url.search === loc.search) return false;
    return true;
  } catch {
    return false;
  }
}

function defaultSession(): Storage | null {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  } catch {
    return null;
  }
}

function waitingHint(lang: string): string {
  return lang.startsWith('ko')
    ? '배경음악이 켜져 있습니다. 화면을 누르거나 키를 누르면 이어서 재생됩니다.'
    : 'Background music is on. Click elsewhere or press a key to resume.';
}

let waitingHintIdSeq = 0;

export default function BgmToggle({ src, label = 'BGM' }: BgmToggleProps) {
  const [on, setOn] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const onRef = useRef(false);
  const waitingRef = useRef(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const gain = useRef<GainNode | null>(null);
  const fadingOut = useRef(false);
  const stopTimer = useRef<number | undefined>(undefined);
  const resumeFade = useRef(false);
  const hintId = useRef(`bgm-wait-${++waitingHintIdSeq}`);

  const setWaitingState = useCallback((next: boolean) => {
    waitingRef.current = next;
    setWaiting(next);
  }, []);

  const ramp = useCallback((to: number, seconds: number) => {
    const g = gain.current;
    if (!g) return;
    const now = g.context.currentTime;
    g.gain.cancelScheduledValues(now);
    g.gain.setValueAtTime(g.gain.value, now);
    g.gain.linearRampToValueAtTime(to, now + seconds);
  }, []);

  const ensure = useCallback((): HTMLAudioElement => {
    if (audio.current) return audio.current;
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
      if (!fadingOut.current && a.duration && a.duration - a.currentTime <= BGM_FADE_LOOP) {
        fadingOut.current = true;
        ramp(0, Math.max(0.1, a.duration - a.currentTime));
      }
    });
    a.addEventListener('ended', () => {
      fadingOut.current = false;
      a.currentTime = 0;
      void a.play().catch(() => undefined);
      ramp(BGM_VOLUME, BGM_FADE_IN);
    });
    audio.current = a;
    gain.current = g;
    return a;
  }, [src, ramp]);

  const applySavedTime = useCallback((a: HTMLAudioElement) => {
    const duration = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : undefined;
    const saved = readBgmTime(Date.now(), duration);
    if (saved == null) return;
    try {
      a.currentTime = saved;
    } catch {
      /* ignore seek errors before metadata */
    }
  }, []);

  const start = useCallback(async () => {
    window.clearTimeout(stopTimer.current);
    try {
      const a = ensure();
      applySavedTime(a);
      await audioContext().resume();
      await a.play();
      const fade = resumeFade.current ? BGM_RESUME_FADE_IN : BGM_FADE_IN;
      resumeFade.current = false;
      ramp(BGM_VOLUME, fade);
      setWaitingState(false);
      return true;
    } catch {
      /* autoplay blocked or audio unsupported: keep the remembered ON + waiting state */
      setWaitingState(true);
      resumeFade.current = true;
      return false;
    }
  }, [ensure, ramp, applySavedTime, setWaitingState]);

  const stop = useCallback(() => {
    const a = audio.current;
    setWaitingState(false);
    resumeFade.current = false;
    try {
      sessionStorage.removeItem(BGM_TIME_KEY);
    } catch {
      /* ignore */
    }
    if (!a) return;
    ramp(0, BGM_FADE_OUT);
    window.clearTimeout(stopTimer.current);
    stopTimer.current = window.setTimeout(() => a.pause(), BGM_FADE_OUT * 1000);
  }, [ramp, setWaitingState]);

  const persistTime = useCallback(() => {
    const a = audio.current;
    if (!onRef.current || !a) return;
    if (a.paused && a.currentTime <= 0) return;
    saveBgmTime(a.currentTime);
  }, []);

  const toggle = () => {
    // While waiting for autoplay, the first press retries play from the saved position instead of turning off.
    if (waitingRef.current && onRef.current) {
      resumeFade.current = true;
      void start();
      return;
    }
    const next = !onRef.current;
    onRef.current = next;
    setOn(next);
    setSoundOn(next);
    if (next) {
      resumeFade.current = false;
      void start();
      emitTrigger('bgm-on');
    } else {
      stop();
    }
  };

  // Remembered "on": try play() on mount (restore position + resume fade). If blocked, wait for a gesture.
  useEffect(() => {
    if (!soundOn()) return;
    onRef.current = true;
    setOn(true);
    setWaitingState(true);
    resumeFade.current = true;
    let cleaned = false;
    const arm = () => {
      window.addEventListener('pointerdown', kick, true);
      window.addEventListener('keydown', kick, true);
      window.addEventListener('touchstart', kick, true);
    };
    const kick = (event: Event) => {
      if (cleaned) return;
      const target = event.target as Element | null;
      if (target && typeof target.closest === 'function' && target.closest('.bgm')) return;
      if (isLeavingLink(event.target)) return;
      if (!onRef.current) {
        cleanup();
        return;
      }
      resumeFade.current = true;
      void start().then((ok) => {
        if (ok || !onRef.current) cleanup();
        // failed resume: keep listeners armed for the next gesture
      });
    };
    function cleanup() {
      cleaned = true;
      window.removeEventListener('pointerdown', kick, true);
      window.removeEventListener('keydown', kick, true);
      window.removeEventListener('touchstart', kick, true);
    }
    void start().then((ok) => {
      if (cleaned || ok) return;
      arm();
    });
    return cleanup;
  }, [start, setWaitingState]);

  // Another control changed the preference: follow it (turning off stops the track; never starts a second one).
  useEffect(() => {
    const onChange = (event: Event) => {
      const next = (event as CustomEvent<boolean>).detail === true;
      if (next === onRef.current) return;
      onRef.current = next;
      setOn(next);
      if (!next) stop();
    };
    window.addEventListener(SOUND_EVENT, onChange);
    return () => window.removeEventListener(SOUND_EVENT, onChange);
  }, [stop]);

  // Pause in background tabs; save position when the page is being left or hidden.
  useEffect(() => {
    const onVisibility = () => {
      const a = audio.current;
      if (document.hidden) {
        persistTime();
        if (a) a.pause();
        return;
      }
      if (a && onRef.current && !waitingRef.current) void a.play().catch(() => undefined);
    };
    const onPageHide = () => persistTime();
    const onLeaveClick = (event: MouseEvent) => {
      if (!onRef.current || !audio.current || audio.current.paused) return;
      if (!isSameOriginLeave(event.target, location, event)) return;
      ramp(0, BGM_NAV_FADE_OUT);
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('click', onLeaveClick, true);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('click', onLeaveClick, true);
    };
  }, [persistTime, ramp]);

  useEffect(() => () => window.clearTimeout(stopTimer.current), []);

  const lang = typeof document !== 'undefined' ? document.documentElement.lang || 'en' : 'en';

  return (
    <>
      <button
        type="button"
        className="bgm"
        aria-label={label}
        aria-pressed={on}
        aria-describedby={waiting ? hintId.current : undefined}
        data-state={waiting ? 'waiting' : undefined}
        onClick={toggle}
      >
        <span className="bgm__glyph" aria-hidden="true">
          ♪
        </span>{' '}
        <span aria-hidden="true">{label}</span>{' '}
        <span className="bgm__state" aria-hidden="true">
          {on ? 'ON' : 'OFF'}
        </span>
      </button>
      {waiting && (
        <span id={hintId.current} className="sr-only">
          {waitingHint(lang)}
        </span>
      )}
    </>
  );
}
