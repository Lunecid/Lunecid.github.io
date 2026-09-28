import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useCountUp } from '../../src/lib/use-count-up';

// Deterministic requestAnimationFrame: frames run only when flush(t) is called with a timestamp.
let frames: FrameRequestCallback[] = [];
const realRaf = globalThis.requestAnimationFrame;
const realCaf = globalThis.cancelAnimationFrame;

beforeEach(() => {
  frames = [];
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    frames.push(cb);
    return frames.length;
  }) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = (() => undefined) as typeof cancelAnimationFrame;
});

afterEach(() => {
  globalThis.requestAnimationFrame = realRaf;
  globalThis.cancelAnimationFrame = realCaf;
});

function flush(t: number): void {
  const run = frames;
  frames = [];
  act(() => {
    for (const cb of run) cb(t);
  });
}

describe('useCountUp', () => {
  it('reaches the target after duration; returns target when reduce', () => {
    const { result } = renderHook(() => useCountUp(1000, { durationMs: 800 }));
    expect(result.current).toBe(0);
    flush(100); // first frame fixes the start time (p = 0)
    expect(result.current).toBe(0);
    flush(500); // p = 0.5 → 1000 · (1 − 0.5³) = 875
    expect(result.current).toBe(875);
    flush(900); // p = 1
    expect(result.current).toBe(1000);
    expect(frames).toHaveLength(0); // no more frames once finished

    const reduced = renderHook(() => useCountUp(42, { reduce: true }));
    expect(reduced.result.current).toBe(42);
  });

  it('waits for delayMs before counting', () => {
    const { result } = renderHook(() => useCountUp(100, { delayMs: 200, durationMs: 400 }));
    flush(0);
    flush(200); // still inside the delay
    expect(result.current).toBe(0);
    flush(400); // p = 0.5 → 87.5 → 88
    expect(result.current).toBe(88);
  });
});
