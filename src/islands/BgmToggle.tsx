// src/islands/BgmToggle.tsx — BGM button in the HUD nav (client:idle; spec §4 소리, §5 BGM 버튼; mockup-port §12).
// Off by default; the track loads only after a click; gain 0.3 through Web Audio with a fade at the loop point;
// the remembered "on" is read after mount (SSR and the first client render are always aria-pressed="false") and
// resumes at the first pointer/key gesture outside the button; pauses while the tab is hidden.
import { useCallback, useEffect, useRef, useState } from 'react';
import { emitTrigger } from '../lib/achievements';
import { SOUND_EVENT, audioContext, setSoundOn, soundOn } from '../lib/sound';
import './BgmToggle.css';

export const BGM_VOLUME = 0.3,
  BGM_FADE_IN = 1.5,
  BGM_FADE_LOOP = 2.5,
  BGM_FADE_OUT = 0.3;

export interface BgmToggleProps {
  src: string;
  label?: string;
}

export default function BgmToggle({ src, label = 'BGM' }: BgmToggleProps) {
  const [on, setOn] = useState(false);
  const onRef = useRef(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const gain = useRef<GainNode | null>(null);
  const fadingOut = useRef(false);
  const stopTimer = useRef<number | undefined>(undefined);

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
    // streams the 8.8 MB track as it plays instead of the browser buffering the whole file up front.
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

  const start = useCallback(async () => {
    window.clearTimeout(stopTimer.current);
    try {
      const a = ensure();
      await audioContext().resume();
      await a.play();
      ramp(BGM_VOLUME, BGM_FADE_IN);
    } catch {
      /* autoplay blocked or audio unsupported: the button still reflects the choice */
    }
  }, [ensure, ramp]);

  const stop = useCallback(() => {
    const a = audio.current;
    if (!a) return;
    ramp(0, BGM_FADE_OUT);
    window.clearTimeout(stopTimer.current);
    stopTimer.current = window.setTimeout(() => a.pause(), BGM_FADE_OUT * 1000);
  }, [ramp]);

  const toggle = () => {
    const next = !onRef.current;
    onRef.current = next;
    setOn(next);
    setSoundOn(next);
    if (next) {
      void start();
      emitTrigger('bgm-on');
    } else {
      stop();
    }
  };

  // Remembered "on": read after mount, resume at the first gesture that is not on this button (autoplay policy).
  useEffect(() => {
    if (!soundOn()) return;
    onRef.current = true;
    setOn(true);
    const kick = (event: Event) => {
      const target = event.target as Element | null;
      if (target && typeof target.closest === 'function' && target.closest('.bgm')) return;
      cleanup();
      if (onRef.current) void start();
    };
    function cleanup() {
      window.removeEventListener('pointerdown', kick, true);
      window.removeEventListener('keydown', kick, true);
    }
    window.addEventListener('pointerdown', kick, true);
    window.addEventListener('keydown', kick, true);
    return cleanup;
  }, [start]);

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

  useEffect(() => {
    const onVisibility = () => {
      const a = audio.current;
      if (!a) return;
      if (document.hidden) a.pause();
      else if (onRef.current) void a.play().catch(() => undefined);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => () => window.clearTimeout(stopTimer.current), []);

  return (
    <button type="button" className="bgm" aria-pressed={on} onClick={toggle}>
      <span aria-hidden="true">♪</span> {label} <span className="bgm__state" aria-hidden="true">{on ? 'ON' : 'OFF'}</span>
    </button>
  );
}
