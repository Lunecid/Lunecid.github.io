// The growth infographic's draw-on (both versions): each figure ([data-gr-fig]) lists its parts in order
// ([data-gr-i]: path segments, stems, nodes, cards, chart marks). The observer's first report on each part decides:
// a part on (or above) the first screen, or without a box at this width, is never hidden; the others wait (.gr-wait)
// and, when one scrolls into view, it and every earlier waiting part of the figure draw in order (--gr-k is the
// stagger index). Nothing reads layout at start-up (the observer reports the boxes); a rAF-throttled scroll check
// catches parts a fast fling carried past the observer. Without IntersectionObserver, under reduced motion (the page
// switch or the OS) and in print nothing waits. CSS (growth-game.css, growth-data.css) animates transform and opacity
// only.

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
  // [data-gr-live] figures (the game version's constellation): data-gr-in while any of it is on screen, so its
  // twinkle (CSS, two rounds) runs only then; under reduced motion and without IntersectionObserver CSS shows it still.
  for (const fig of root.querySelectorAll<HTMLElement>('[data-gr-live]')) {
    new IO((entries) => {
      for (const entry of entries) fig.toggleAttribute('data-gr-in', entry.isIntersecting);
    }).observe(fig);
  }
  for (const fig of root.querySelectorAll<HTMLElement>('[data-gr-fig]')) {
    const parts = Array.from(fig.querySelectorAll<HTMLElement>('[data-gr-i]'));
    if (parts.length === 0) continue;
    const order = (el: Element): number => Number((el as HTMLElement).dataset.grI);
    const seen = new WeakSet<Element>();
    const waiting: HTMLElement[] = [];
    let queued = false;
    // A figure with a band ([data-gr-band], the game version's desktop path): its path parts ([data-gr-path]: lines and
    // stars) draw only once the band itself is on screen, all in order, so the line is seen growing. Without this the
    // cards above the band (they enter first) drew the path while it was still below the screen (owner report
    // 2026-10-07). A band without a box (phones: the rail) leaves the parts to the per-part rule.
    const band = fig.querySelector<HTMLElement>('[data-gr-band]');
    const bandHeld = (): boolean => band !== null && !bandIn && band.getClientRects().length > 0;
    let bandIn = false;

    const reveal = (upTo: number, pathOnly = false): void => {
      const due = waiting
        .filter((el) => el.classList.contains('gr-wait') && order(el) <= upTo && (pathOnly ? el.hasAttribute('data-gr-path') : !(el.hasAttribute('data-gr-path') && bandHeld())))
        .sort((a, b) => order(a) - order(b));
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
    };
    const onScroll = (): void => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        let upTo = -1;
        for (const el of waiting) if (el.classList.contains('gr-wait') && el.getBoundingClientRect().top < window.innerHeight * 0.9) upTo = Math.max(upTo, order(el));
        if (upTo >= 0) reveal(upTo);
        if (!waiting.some((el) => el.classList.contains('gr-wait'))) removeEventListener('scroll', onScroll);
      });
    };
    const io = new IO(
      (entries) => {
        let upTo = -1;
        for (const entry of entries) {
          const el = entry.target;
          if (!seen.has(el)) {
            // the first report: on (or above) the first screen, or without a box at this width → never waits
            seen.add(el);
            const box = entry.boundingClientRect;
            if ((box.width === 0 && box.height === 0) || entry.isIntersecting || box.top < window.innerHeight) {
              io.unobserve(el);
              continue;
            }
            el.classList.add('gr-wait');
            waiting.push(el as HTMLElement);
            continue;
          }
          if (entry.isIntersecting) upTo = Math.max(upTo, order(el));
        }
        if (upTo >= 0) reveal(upTo);
      },
      { rootMargin: '0px 0px -10% 0px' },
    );
    fig.setAttribute('data-gr-anim', '');
    for (const el of parts) io.observe(el);
    if (band) {
      const bio = new IO(
        (entries) => {
          if (!entries.some((e) => e.isIntersecting)) return;
          bandIn = true;
          bio.disconnect();
          reveal(Number.POSITIVE_INFINITY, true);
        },
        { rootMargin: '0px 0px -15% 0px' },
      );
      bio.observe(band);
    }
    addEventListener('scroll', onScroll, { passive: true });
  }
}
