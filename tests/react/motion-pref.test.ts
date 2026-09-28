import { act, cleanup, renderHook } from '@testing-library/react';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '../../src/config';
import {
  MOTION_EVENT,
  applyMotionPref,
  isMotionOffStored,
  prefersReducedNow,
  setMotionOff,
  useReducedMotionPref,
} from '../../src/lib/motion-pref';

const root = document.documentElement;

function mediaStub(matches: boolean) {
  return vi.fn((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', mediaStub(false));
  root.setAttribute('data-motion', 'full');
});

afterEach(() => {
  cleanup(); // unmount hooks before the reset below dispatches MOTION_EVENT
  vi.restoreAllMocks();
  setMotionOff(false); // leaves storage and the in-memory fallback at "motion on"
  root.setAttribute('data-motion', 'full');
});

describe('motion-pref', () => {
  it('setMotionOff stores and applies', () => {
    const onChange = vi.fn();
    window.addEventListener(MOTION_EVENT, onChange);
    setMotionOff(true);
    expect(localStorage.getItem(STORAGE_KEYS.motion)).toBe('off');
    expect(root.getAttribute('data-motion')).toBe('reduce');
    expect(isMotionOffStored()).toBe(true);
    expect(prefersReducedNow()).toBe(true);
    setMotionOff(false);
    expect(localStorage.getItem(STORAGE_KEYS.motion)).toBe('on');
    expect(root.getAttribute('data-motion')).toBe('full');
    expect(prefersReducedNow()).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(2);
    window.removeEventListener(MOTION_EVENT, onChange);
  });

  it('OS reduced motion wins even when the site toggle is on', () => {
    vi.stubGlobal('matchMedia', mediaStub(true));
    applyMotionPref();
    expect(root.getAttribute('data-motion')).toBe('reduce');
  });

  it('storage errors are ignored', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage denied');
    });
    expect(isMotionOffStored()).toBe(false);
    expect(() => setMotionOff(true)).not.toThrow();
    expect(root.getAttribute('data-motion')).toBe('reduce'); // honoured for this page view
    expect(isMotionOffStored()).toBe(true);
    expect(() => setMotionOff(false)).not.toThrow();
    expect(root.getAttribute('data-motion')).toBe('full');
  });

  it('useReducedMotionPref re-renders on sb:motion-change', () => {
    const { result } = renderHook(() => useReducedMotionPref());
    expect(result.current).toBe(false);
    act(() => setMotionOff(true));
    expect(result.current).toBe(true);
    act(() => {
      root.setAttribute('data-motion', 'full');
      window.dispatchEvent(new Event(MOTION_EVENT));
    });
    expect(result.current).toBe(false);
  });

  it('server render reports full motion regardless of the document state', () => {
    root.setAttribute('data-motion', 'reduce');
    function Probe() {
      return createElement('p', null, useReducedMotionPref() ? 'reduce' : 'full');
    }
    expect(renderToString(createElement(Probe))).toContain('full');
  });

  it('works when window.matchMedia is missing', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(() => applyMotionPref()).not.toThrow();
    expect(root.getAttribute('data-motion')).toBe('full');
    const { result, unmount } = renderHook(() => useReducedMotionPref());
    expect(result.current).toBe(false);
    act(() => setMotionOff(true));
    expect(result.current).toBe(true);
    unmount();
  });
});
