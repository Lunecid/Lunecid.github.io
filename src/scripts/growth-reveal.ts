// The growth infographic's draw-on (both versions): each figure ([data-gr-fig]) lists its parts in order
// ([data-gr-i]: path segments, stems, nodes, cards, chart marks). Parts already on the first screen at load are never
// hidden; the others wait (.gr-wait) and, when one scrolls into view, it and every earlier waiting part of the figure
// draw in order (--gr-k is the stagger index). Without IntersectionObserver, under reduced motion (the page switch or
// the OS) and in print nothing waits. CSS (growth-game.css, growth-data.css) animates transform and opacity only.

interface RevealOptions {
  io?: typeof IntersectionObserver;
  reduced?: () => boolean;
}

const reducedNow = (): boolean =>
  document.documentElement.dataset.motion === 'reduce' ||
  (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);

export function initGrowthReveal(root: ParentNode = document, opts: RevealOptions = {}): void {
  const IO = opts.io ?? (typeof IntersectionObserver === 'function' ? IntersectionObserver : undefined);
  if (!IO || (opts.reduced ?? reducedNow)()) return;
  const fold = window.innerHeight;
  for (const fig of root.querySelectorAll<HTMLElement>('[data-gr-fig]')) {
    const waiting: HTMLElement[] = [];
    for (const el of fig.querySelectorAll<HTMLElement>('[data-gr-i]')) {
      const box = el.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) continue; // not laid out at this width
      if (box.top < fold) continue; // on (or above) the first screen: never waits
      waiting.push(el);
    }
    if (waiting.length === 0) continue;
    const order = (el: HTMLElement): number => Number(el.dataset.grI);
    const io = new IO(
      (entries) => {
        let upTo = -1;
        for (const entry of entries) if (entry.isIntersecting) upTo = Math.max(upTo, order(entry.target as HTMLElement));
        if (upTo < 0) return;
        const due = waiting.filter((el) => el.classList.contains('gr-wait') && order(el) <= upTo).sort((a, b) => order(a) - order(b));
        let k = 0;
        let last = -1;
        for (const el of due) {
          if (order(el) !== last) {
            if (last !== -1) k++;
            last = order(el);
          }
          el.style.setProperty('--gr-k', String(k));
          el.classList.remove('gr-wait');
          io.unobserve(el);
        }
      },
      { rootMargin: '0px 0px -10% 0px' },
    );
    fig.setAttribute('data-gr-anim', '');
    for (const el of waiting) {
      el.classList.add('gr-wait');
      io.observe(el);
    }
  }
}
