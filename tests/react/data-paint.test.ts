// The deferred brush textures (src/scripts/data-paint.ts): tiles after the load event when idle; the stroke tile on the
// first hover or focus.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { STROKE_ATTR, TEX_ATTR, attachPaint } from '../../src/scripts/data-paint';

const root = document.documentElement;
afterEach(() => {
  root.removeAttribute(TEX_ATTR);
  root.removeAttribute(STROKE_ATTR);
  vi.useRealTimers();
});

describe('attachPaint', () => {
  it('waits for the load event, then for idle time, before attaching the tiles', () => {
    const idle: (() => void)[] = [];
    const listeners: (() => void)[] = [];
    const win = { requestIdleCallback: (cb: () => void) => idle.push(cb), addEventListener: (_: string, cb: () => void) => listeners.push(cb), setTimeout } as unknown as Window & typeof globalThis;
    const doc = { documentElement: root, readyState: 'interactive', addEventListener: () => {}, removeEventListener: () => {} } as unknown as Document;
    attachPaint(doc, win);
    expect(root.hasAttribute(TEX_ATTR)).toBe(false);
    expect(listeners).toHaveLength(1);
    listeners[0]!();
    expect(root.hasAttribute(TEX_ATTR), 'not before idle').toBe(false);
    idle[0]!();
    expect(root.hasAttribute(TEX_ATTR)).toBe(true);
  });

  it('after load already happened: attaches on the next idle moment (setTimeout without requestIdleCallback)', () => {
    vi.useFakeTimers();
    const win = { addEventListener: () => {}, setTimeout: globalThis.setTimeout } as unknown as Window & typeof globalThis;
    const doc = { documentElement: root, readyState: 'complete', addEventListener: () => {}, removeEventListener: () => {} } as unknown as Document;
    attachPaint(doc, win);
    expect(root.hasAttribute(TEX_ATTR)).toBe(false);
    vi.runAllTimers();
    expect(root.hasAttribute(TEX_ATTR)).toBe(true);
  });

  it.each(['pointerover', 'focusin'])('the stroke tile waits for the first %s', (type) => {
    attachPaint(document, window);
    expect(root.hasAttribute(STROKE_ATTR)).toBe(false);
    document.body.dispatchEvent(new Event(type, { bubbles: true }));
    expect(root.hasAttribute(STROKE_ATTR)).toBe(true);
  });
});
