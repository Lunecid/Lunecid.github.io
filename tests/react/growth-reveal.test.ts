// The growth infographic's draw-on (src/scripts/growth-reveal.ts): a fake IntersectionObserver and fake boxes.
import { afterEach, describe, expect, it } from 'vitest';
import { initGrowthReveal } from '../../src/scripts/growth-reveal';

type Callback = (entries: { target: Element; isIntersecting: boolean }[]) => void;
class FakeIO {
  static last: FakeIO | null = null;
  readonly observed = new Set<Element>();
  constructor(readonly callback: Callback) {
    FakeIO.last = this;
  }
  observe(el: Element): void { this.observed.add(el); }
  unobserve(el: Element): void { this.observed.delete(el); }
  disconnect(): void { this.observed.clear(); }
  fire(el: Element, isIntersecting = true): void { this.callback([{ target: el, isIntersecting }]); }
}
const io = FakeIO as unknown as typeof IntersectionObserver;

function at<T extends Element>(el: T, top: number, size = 40): T {
  (el as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () =>
    ({ top, bottom: top + size, left: 0, right: size, width: size, height: size, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
  return el;
}

/** One figure: items 0 and 1 on the first screen, 2–4 below it, 5 with no box (display: none at this width). */
function figure(): { fig: HTMLElement; items: HTMLElement[] } {
  document.body.innerHTML = '';
  const fig = document.createElement('div');
  fig.setAttribute('data-gr-fig', '');
  const tops = [100, 500, 1200, 1400, 1600, 0];
  const items = tops.map((top, i) => {
    const el = document.createElement('div');
    el.setAttribute('data-gr-i', String(i));
    fig.append(el);
    return at(el, top, i === 5 ? 0 : 40);
  });
  document.body.append(fig);
  return { fig, items };
}

describe('initGrowthReveal (src/scripts/growth-reveal.ts)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    FakeIO.last = null;
  });

  it('hides only items below the first screen; one intersection draws every earlier item in order', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    const { fig, items } = figure();
    initGrowthReveal(document, { io, reduced: () => false });
    expect(fig.hasAttribute('data-gr-anim')).toBe(true);
    expect(items.map((el) => el.classList.contains('gr-wait'))).toEqual([false, false, true, true, true, false]);
    const obs = FakeIO.last!;
    expect([...obs.observed]).toEqual([items[2], items[3], items[4]]);
    obs.fire(items[3]!, false);
    expect(items[3]!.classList.contains('gr-wait')).toBe(true);
    obs.fire(items[3]!);
    // 2 and 3 draw (in order: the stagger index), 4 still waits
    expect(items.map((el) => el.classList.contains('gr-wait'))).toEqual([false, false, false, false, true, false]);
    expect(items[2]!.style.getPropertyValue('--gr-k')).toBe('0');
    expect(items[3]!.style.getPropertyValue('--gr-k')).toBe('1');
    expect(obs.observed.has(items[2]!)).toBe(false);
    obs.fire(items[4]!);
    expect(fig.querySelectorAll('.gr-wait')).toHaveLength(0);
    expect(obs.observed.size).toBe(0);
  });

  it('reduced motion or no IntersectionObserver: the final state, nothing hidden, no data-gr-anim', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    let { fig } = figure();
    initGrowthReveal(document, { io, reduced: () => true });
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
});
