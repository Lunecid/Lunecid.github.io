// The general version's one-time reveal (v5 motion): section openers (.ed-sh) rise once and the award badge
// (.ed-stamp) sets once as they enter the viewport. Only elements below the first viewport at load are touched, so
// nothing on the first screen waits; without IntersectionObserver nothing is hidden; under reduced motion (the page
// switch or the OS) the openers only fade and the badge is simply there. CSS (editorial.css): .is-waiting hides,
// .is-rise adds the transform, .is-in shows with the transition; print and both reduce paths show everything.
export const REVEAL_SELECTOR = '.ed-sh, .ed-stamp';

interface RevealOptions {
  io?: typeof IntersectionObserver;
  reduced?: () => boolean;
}

const reducedNow = (): boolean =>
  document.documentElement.dataset.motion === 'reduce' ||
  (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);

/** The element whose box stands for `el` (a display: contents opener has none of its own: its first child's). */
const boxOf = (el: Element): Element => (el.getClientRects().length > 0 ? el : (el.firstElementChild ?? el));

export function initReveal(root: ParentNode = document, opts: RevealOptions = {}): void {
  const IO = opts.io ?? (typeof IntersectionObserver === 'function' ? IntersectionObserver : undefined);
  if (!IO) return;
  const reduced = (opts.reduced ?? reducedNow)();
  const fold = window.innerHeight;
  const owners = new Map<Element, HTMLElement>();
  const io = new IO(
    (entries) => {
      for (const entry of entries) {
        const el = owners.get(entry.target);
        if (!el || !entry.isIntersecting) continue;
        el.classList.add('is-in');
        el.classList.remove('is-waiting');
        io.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px' },
  );
  for (const el of root.querySelectorAll<HTMLElement>(REVEAL_SELECTOR)) {
    if (reduced && el.classList.contains('ed-stamp')) continue; // under reduce the badge is simply there
    const box = boxOf(el);
    if (box.getBoundingClientRect().top < fold) continue; // on (or above) the first screen: never waits
    owners.set(box, el);
    el.classList.add('is-waiting');
    if (!reduced) el.classList.add('is-rise');
    io.observe(box);
  }
}
