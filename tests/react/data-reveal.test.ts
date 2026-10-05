// The general version's one-time reveal (src/scripts/data-reveal.ts): a fake IntersectionObserver and fake boxes.
import { afterEach, describe, expect, it } from 'vitest';
import { initReveal } from '../../src/scripts/data-reveal';

type Callback = (entries: { target: Element; isIntersecting: boolean }[]) => void;
class FakeIO {
  static last: FakeIO | null = null;
  readonly observed = new Set<Element>();
  constructor(readonly callback: Callback, readonly options?: { rootMargin?: string }) {
    FakeIO.last = this;
  }
  observe(el: Element): void { this.observed.add(el); }
  unobserve(el: Element): void { this.observed.delete(el); }
  disconnect(): void { this.observed.clear(); }
  fire(el: Element, isIntersecting = true): void { this.callback([{ target: el, isIntersecting }]); }
}
const io = FakeIO as unknown as typeof IntersectionObserver;

/** An element whose box starts at `top` (jsdom has no layout). */
function at<T extends HTMLElement>(el: T, top: number): T {
  el.getBoundingClientRect = () => ({ top, bottom: top + 40, left: 0, right: 100, width: 100, height: 40, x: 0, y: top, toJSON: () => ({}) });
  el.getClientRects = () => [el.getBoundingClientRect()] as unknown as DOMRectList;
  return el;
}

function page(): { above: HTMLElement; first: HTMLElement; below: HTMLElement; contents: HTMLElement; title: HTMLElement; stamp: HTMLElement; plain: HTMLElement } {
  document.body.innerHTML = '';
  const make = (cls: string, top: number) => {
    const el = document.createElement('header');
    el.className = cls;
    document.body.append(el);
    return at(el, top);
  };
  const above = make('ed-sh', -300);
  const first = make('ed-sh', 200);
  const below = make('ed-sh', 2000);
  // an opener laid out with display: contents has no box of its own: its first child stands for it
  const contents = document.createElement('header');
  contents.className = 'ed-sh';
  contents.getClientRects = () => [] as unknown as DOMRectList;
  const title = at(document.createElement('h2'), 3000);
  contents.append(title);
  document.body.append(contents);
  const stamp = make('ed-stamp', 2500);
  const plain = make('ed-other', 2600);
  return { above, first, below, contents, title, stamp, plain };
}

describe('initReveal (src/scripts/data-reveal.ts)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    FakeIO.last = null;
  });

  it('marks only openers below the viewport; reveals on intersection; never hides without IO; reduce = no transform class', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    // 1. below the first screen only, once, with the rootMargin of the plan
    let p = page();
    initReveal(document, { io, reduced: () => false });
    const obs = FakeIO.last!;
    expect(obs.options?.rootMargin).toBe('0px 0px -8% 0px');
    for (const el of [p.above, p.first, p.plain]) expect(el.className, el.className).not.toMatch(/is-/);
    for (const el of [p.below, p.contents, p.stamp]) expect(el.classList.contains('is-waiting') && el.classList.contains('is-rise')).toBe(true);
    expect([...obs.observed]).toEqual([p.below, p.title, p.stamp]);
    obs.fire(p.below, false);
    expect(p.below.classList.contains('is-waiting')).toBe(true);
    obs.fire(p.below);
    expect(p.below.classList.contains('is-in')).toBe(true);
    expect(p.below.classList.contains('is-waiting')).toBe(false);
    expect(obs.observed.has(p.below)).toBe(false); // once
    obs.fire(p.title);
    expect(p.contents.classList.contains('is-in')).toBe(true);

    // 2. no IntersectionObserver: nothing is hidden
    const original = (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
    delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
    try {
      p = page();
      initReveal(document, { reduced: () => false });
      expect(document.querySelectorAll('.is-waiting')).toHaveLength(0);
    } finally {
      if (original !== undefined) (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = original;
    }

    // 3. reduced motion: openers only fade (no transform class); the badge is simply there
    p = page();
    initReveal(document, { io, reduced: () => true });
    expect(p.below.classList.contains('is-waiting')).toBe(true);
    expect(document.querySelectorAll('.is-rise')).toHaveLength(0);
    expect(p.stamp.className).toBe('ed-stamp');
  });
});
