// src/lib/motion-pref.ts — client helpers for the motion preference (spec §4 "모션 끄기"; mockup-port §1.5).
// <html data-motion="full|reduce"> is the single runtime flag: HEAD_INIT_SCRIPT sets it before first paint, the footer
// toggle changes it through setMotionOff(), and CSS keys on :root[data-motion="reduce"].
// Rule for islands: never branch markup on this value during SSR/hydration (server snapshot is false); use it only
// for timers, counters and client-only subtrees.
import { useSyncExternalStore } from 'react';
import { STORAGE_KEYS } from '../config';

export const MOTION_EVENT = 'sb:motion-change';
const REDUCE_QUERY = '(prefers-reduced-motion: reduce)';

// Used only while localStorage throws, so the footer toggle still works for the current page view.
let memoryOff: boolean | null = null;

/** true when the OS "reduce motion" setting is on (used by the footer toggle, P2-7: it shows pressed+disabled then). */
export function osPrefersReduce(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(REDUCE_QUERY).matches;
}

/** localStorage['sb:motion'] === 'off'. When storage throws: the choice made on this page, else false. */
export function isMotionOffStored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEYS.motion) === 'off';
  } catch {
    return memoryOff ?? false;
  }
}

/** Sets <html data-motion> from the stored choice and the OS setting, then dispatches MOTION_EVENT. */
export function applyMotionPref(): void {
  document.documentElement.setAttribute('data-motion', isMotionOffStored() || osPrefersReduce() ? 'reduce' : 'full');
  window.dispatchEvent(new Event(MOTION_EVENT));
}

/** Stores 'off' | 'on' (storage errors ignored), then re-applies the preference. */
export function setMotionOff(off: boolean): void {
  memoryOff = off;
  try {
    localStorage.setItem(STORAGE_KEYS.motion, off ? 'off' : 'on');
  } catch {
    /* storage blocked: memoryOff keeps the choice for this page view */
  }
  applyMotionPref();
}

/** true when <html data-motion="reduce">; false during SSR. */
export function prefersReducedNow(): boolean {
  return typeof document !== 'undefined' && document.documentElement.getAttribute('data-motion') === 'reduce';
}

// One `change` listener on the OS query serves every subscriber: it re-applies the preference, which dispatches
// MOTION_EVENT once however many subscribers (the achievement host, the footer toggles, islands) are listening.
let osQuery: MediaQueryList | null = null;
let subscribers = 0;
const onOsChange = (): void => applyMotionPref();

/**
 * Calls onChange on every MOTION_EVENT: the footer toggle, an OS setting change (through the shared listener) and
 * applyMotionPref(). It does not call onChange up front. Returns the unsubscribe; the last one removes the OS listener.
 */
export function subscribeMotion(onChange: () => void): () => void {
  if (subscribers++ === 0 && typeof window.matchMedia === 'function') {
    osQuery = window.matchMedia(REDUCE_QUERY);
    osQuery.addEventListener?.('change', onOsChange);
  }
  window.addEventListener(MOTION_EVENT, onChange);
  let active = true;
  return () => {
    if (!active) return; // a second call must not unbalance the count
    active = false;
    window.removeEventListener(MOTION_EVENT, onChange);
    if (--subscribers === 0) {
      osQuery?.removeEventListener?.('change', onOsChange);
      osQuery = null;
    }
  };
}

/** Hydration-safe reduced-motion flag for islands (server snapshot false). */
export function useReducedMotionPref(): boolean {
  return useSyncExternalStore(subscribeMotion, prefersReducedNow, () => false);
}
