// The growth infographic's draw-on (src/scripts/growth-reveal.ts): a fake IntersectionObserver that reports the fake
// boxes (the script reads no layout at start-up: the observer's first report decides).
import { afterEach, describe, expect, it } from 'vitest';
import { initGrowthReveal } from '../../src/scripts/growth-reveal';

type Entry = { target: Element; isIntersecting: boolean; boundingClientRect: DOMRect };
type Callback = (entries: Entry[]) => void;
class FakeIO {
  static last: FakeIO | null = null;
  readonly observed = new Set<Element>();
  constructor(readonly callback: Callback, readonly options?: { rootMargin?: string }) {
    FakeIO.last = this;
  }
  observe(el: Element): void { this.observed.add(el); }
  unobserve(el: Element): void { this.observed.delete(el); }
  disconnect(): void { this.observed.clear(); }
  /** The observer's first report: every observed element with its box, intersecting when its top is in the root. */
  initial(): void {
    this.callback([...this.observed].map((el) => {
      const box = el.getBoundingClientRect();
      return { target: el, isIntersecting: box.height > 0 && box.top < 720 && box.bottom > 0, boundingClientRect: box };
    }));
  }
  fire(el: Element, isIntersecting = true): void { this.callback([{ target: el, isIntersecting, boundingClientRect: el.getBoundingClientRect() }]); }
}
const io = FakeIO as unknown as typeof IntersectionObserver;

function at<T extends Element>(el: T, top: number, size = 40): T {
  (el as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () =>
    ({ top, bottom: top + size, left: 0, right: size, width: size, height: size, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
  return el;
}

/** One figure: items 0 and 1 on the first screen (1 in its bottom tenth), 2–4 below it, 5 with no box. */
function figure(): { fig: HTMLElement; items: HTMLElement[] } {
  document.body.innerHTML = '';
  const fig = document.createElement('div');
  fig.setAttribute('data-gr-fig', '');
  const tops = [100, 760, 1200, 1400, 1600, 0];
  const items = tops.map((top, i) => {
    const el = document.createElement('div');
    el.setAttribute('data-gr-i', String(i));
    fig.append(el);
    return at(el, top, i === 5 ? 0 : 30);
  });
  document.body.append(fig);
  return { fig, items };
}

describe('initGrowthReveal (src/scripts/growth-reveal.ts)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    FakeIO.last = null;
  });

  it('the first report hides only parts below the first screen; one intersection draws every earlier part in order', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    const { fig, items } = figure();
    initGrowthReveal(document, { io, reduced: () => false });
    const obs = FakeIO.last!;
    expect(obs.options?.rootMargin).toBe('0px 0px -10% 0px');
    expect(fig.hasAttribute('data-gr-anim')).toBe(true);
    expect(fig.querySelectorAll('.gr-wait')).toHaveLength(0); // nothing is hidden before the observer reports
    obs.initial();
    expect(items.map((el) => el.classList.contains('gr-wait'))).toEqual([false, false, true, true, true, false]);
    expect([...obs.observed]).toEqual([items[2], items[3], items[4]]);
    obs.fire(items[3]!, false);
    expect(items[3]!.classList.contains('gr-wait')).toBe(true);
    obs.fire(items[3]!);
    expect(items.map((el) => el.classList.contains('gr-wait'))).toEqual([false, false, false, false, true, false]);
    expect(items[2]!.style.getPropertyValue('--gr-k')).toBe('0');
    expect(items[3]!.style.getPropertyValue('--gr-k')).toBe('1');
    expect(obs.observed.has(items[2]!)).toBe(false);
    obs.fire(items[4]!);
    expect(fig.querySelectorAll('.gr-wait')).toHaveLength(0);
    expect(obs.observed.size).toBe(0);
  });

  it('a part that a fast scroll carried above the fold line without an observer callback draws on the next scroll frame', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    const raf = window.requestAnimationFrame;
    window.requestAnimationFrame = ((cb: FrameRequestCallback) => { cb(0); return 0; }) as typeof window.requestAnimationFrame;
    try {
      const { items } = figure();
      initGrowthReveal(document, { io, reduced: () => false });
      FakeIO.last!.initial();
      at(items[2]!, -200);
      at(items[3]!, 300);
      window.dispatchEvent(new Event('scroll'));
      expect(items.map((el) => el.classList.contains('gr-wait'))).toEqual([false, false, false, false, true, false]);
      at(items[4]!, 100);
      window.dispatchEvent(new Event('scroll'));
      expect(document.querySelectorAll('.gr-wait')).toHaveLength(0);
    } finally {
      window.requestAnimationFrame = raf;
    }
  });

  it('reduced motion or no IntersectionObserver: the final state, nothing hidden, no data-gr-anim', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    let { fig } = figure();
    initGrowthReveal(document, { io, reduced: () => true });
    expect(FakeIO.last).toBeNull();
    expect(fig.hasAttribute('data-gr-anim')).toBe(false);
    expect(document.querySelectorAll('.gr-wait')).toHaveLength(0);

    const original = (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
    delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
    try {
      ({ fig } = figure());
      initGrowthReveal(document, { reduced: () => false });
      expect(fig.hasAttribute('data-gr-anim')).toBe(false);
      expect(document.querySelectorAll('.gr-wait')).toHaveLength(0);
    } finally {
      (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = original;
    }
  });

  it('reads no layout at start-up (no getBoundingClientRect before the observer reports)', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    const { items } = figure();
    let reads = 0;
    for (const el of items) {
      const real = el.getBoundingClientRect.bind(el);
      el.getBoundingClientRect = () => { reads++; return real(); };
    }
    initGrowthReveal(document, { io, reduced: () => false });
    expect(reads).toBe(0);
  });
});
