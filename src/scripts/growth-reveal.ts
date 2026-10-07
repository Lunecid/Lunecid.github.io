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
  if (!IO) {
    // nothing can tell when the band is on screen: light the path at once (CSS hides an unlit desktop path)
    root.querySelectorAll<HTMLElement>('[data-gr-fig] [data-gr-path]').forEach((el) => el.classList.add('gr-lit'));
    return;
  }
  if ((opts.reduced ?? reducedNow)()) return;
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
    // Banded paths: the game version's desktop constellation and the general version's lanes charts. A band
    // ([data-gr-band="key"]) with a box holds the path parts that name it ([data-gr-path="key"]: lines, stars, marks,
    // dots). CSS hides them from the first paint (html.js, motion full, no .gr-lit) and they stay out of the per-part
    // rule; whenever their band comes on screen — already there at load, or by a scroll — they light in order (.gr-lit
    // with --gr-k), so the line is always seen growing (owner reports 2026-10-07: it drew while below the screen, stood
    // finished when on screen at load, and the general version's went by too fast). Phones (no band box) keep the
    // per-part rule; a path part that rule shows is lit too.
    const bands = new Map<string, HTMLElement>();
    for (const b of fig.querySelectorAll<HTMLElement>('[data-gr-band]')) bands.set(b.getAttribute('data-gr-band') ?? '', b);
    const isPath = (el: Element): boolean => el.hasAttribute('data-gr-path');
    const bandOf = (el: Element): HTMLElement | undefined => bands.get(el.getAttribute('data-gr-path') ?? '');
    const banded = (el: Element): boolean => (bandOf(el)?.getClientRects().length ?? 0) > 0;

    const reveal = (upTo: number): void => {
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
        if (isPath(el)) el.classList.add('gr-lit');
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
            if (isPath(el) && banded(el)) {
              io.unobserve(el); // the band lights it
              continue;
            }
            const box = entry.boundingClientRect;
            if ((box.width === 0 && box.height === 0) || entry.isIntersecting || box.top < window.innerHeight) {
              io.unobserve(el);
              if (isPath(el)) el.classList.add('gr-lit');
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
    for (const [key, band] of bands) {
      const bio = new IO(
        (entries) => {
          if (!entries.some((e) => e.isIntersecting) || band.getClientRects().length === 0) return;
          bio.disconnect();
          const path = parts
            .filter((el) => isPath(el) && el.getAttribute('data-gr-path') === key && !el.classList.contains('gr-lit'))
            .sort((a, b) => order(a) - order(b));
          let k = -1;
          let last = -1;
          for (const el of path) {
            if (order(el) !== last) {
              k++;
              last = order(el);
            }
            el.style.setProperty('--gr-k', String(k));
            el.classList.remove('gr-wait');
            el.classList.add('gr-lit');
          }
        },
        { rootMargin: '0px 0px -15% 0px' },
      );
      bio.observe(band);
    }
    addEventListener('scroll', onScroll, { passive: true });
  }
}
