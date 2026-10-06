// The "맨 위로" button (components/common/BackToTop.astro): shown while the footer is on screen on a page at least
// 1.5 screens tall, faded in on the next frame so the transition runs; a click scrolls to the top (instantly when
// motion is reduced) and moves focus to <main>, so keyboard and screen-reader users land where the page starts.
import { prefersReducedNow } from '../lib/motion-pref';

const MIN_PAGE_SCREENS = 1.5;

export function initBackToTop(): void {
  const button = document.querySelector<HTMLButtonElement>('[data-to-top]');
  const footer = button?.closest('footer');
  if (!button || !footer || !('IntersectionObserver' in window)) return;

  let footerOnScreen = false;
  let frame = 0;
  const sync = (): void => {
    const show = footerOnScreen && document.documentElement.scrollHeight >= window.innerHeight * MIN_PAGE_SCREENS;
    cancelAnimationFrame(frame);
    if (show) {
      button.hidden = false;
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => button.setAttribute('data-shown', ''));
      });
    } else {
      button.removeAttribute('data-shown');
      button.hidden = true;
    }
  };

  new IntersectionObserver((entries) => {
    footerOnScreen = entries.some((entry) => entry.isIntersecting);
    sync();
  }).observe(footer);
  window.addEventListener('resize', sync, { passive: true });

  button.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: prefersReducedNow() ? 'auto' : 'smooth' });
    document.getElementById('main')?.focus({ preventScroll: true });
  });
}
