// Sticky-nav mobile menu (HudNav P2-3 rulings and fix rounds 1–2; shared by HudNav and DataNav since P2-2).
// Open state: a fixed-width "×" plus a visually hidden 닫기/Close, the same text in aria-label (G-017), data-open on the root, a scrim, the
// body scroll lock by name. Escape is bound on document while open (focus may sit on <body>); Tab is trapped in
// [toggle, …panel focusables]; a panel link, a click outside, the ≥734px breakpoint and a bfcache restore all close it.
import { lockScroll, unlockScroll } from '../lib/scroll-lock';

const FOCUSABLE = 'a[href], button:not([disabled])';

/** Wires every nav root matching `rootSelector`; its toggle is [data-nav-toggle] with aria-controls = the panel id. */
export function initNavMenus(rootSelector: string): void {
  document.querySelectorAll<HTMLElement>(rootSelector).forEach((nav) => {
    const button = nav.querySelector<HTMLButtonElement>('[data-nav-toggle]');
    const panel = button ? document.getElementById(button.getAttribute('aria-controls') ?? '') : null;
    if (!button || !panel) return;
    const scrim = nav.querySelector<HTMLElement>('[data-nav-scrim]');
    const bar = panel.parentElement;
    const onDocumentEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      button.focus();
    };
    const setOpen = (open: boolean): void => {
      nav.dataset.open = String(open);
      button.setAttribute('aria-expanded', String(open));
      const closed = button.dataset.labelClosed ?? '메뉴';
      const openRaw = button.dataset.labelOpen ?? '닫기';
      // G-017: open state is a fixed-width "×" plus visually hidden Close/닫기 so the bar never widens.
      const accessible = openRaw.replace(/\s*×\s*/g, '').trim() || openRaw;
      if (open) {
        const mark = document.createElement('span');
        mark.setAttribute('aria-hidden', 'true');
        mark.textContent = '×';
        const sr = document.createElement('span');
        sr.className = 'sr-only';
        sr.textContent = accessible;
        button.replaceChildren(mark, sr);
      } else {
        button.textContent = closed;
      }
      button.setAttribute('aria-label', open ? accessible : closed);
      if (open) {
        lockScroll('nav');
        document.addEventListener('keydown', onDocumentEscape);
      } else {
        unlockScroll('nav');
        document.removeEventListener('keydown', onDocumentEscape);
      }
      // The bar can wrap at 320px: place the scrim under the bar's real bottom, not under a fixed --nav-h.
      if (open && scrim && bar) scrim.style.top = `${bar.getBoundingClientRect().bottom}px`;
    };
    button.addEventListener('click', () => setOpen(button.getAttribute('aria-expanded') !== 'true'));
    scrim?.addEventListener('click', () => {
      setOpen(false);
      button.focus();
    });
    nav.addEventListener('keydown', (event) => {
      if (nav.dataset.open !== 'true' || event.key !== 'Tab') return;
      const trapped = [button, ...Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))];
      const at = trapped.indexOf(document.activeElement as HTMLElement);
      if (at === -1) return;
      event.preventDefault();
      const next = at + (event.shiftKey ? -1 : 1);
      trapped[(next + trapped.length) % trapped.length]?.focus();
    });
    document.addEventListener('click', (event) => {
      if (nav.dataset.open === 'true' && event.target instanceof Node && !nav.contains(event.target)) setOpen(false);
    });
    panel.querySelectorAll<HTMLAnchorElement>('a').forEach((link) => link.addEventListener('click', () => setOpen(false)));
    if (typeof window.matchMedia === 'function') {
      window.matchMedia('(min-width: 734px)').addEventListener('change', (query) => {
        if (query.matches) setOpen(false);
      });
    }
    window.addEventListener('pageshow', (event) => {
      if (event.persisted) setOpen(false);
    });
  });
}

/** The language switch keeps location.hash (anchor ids are shared across languages), live on hashchange. */
export function initLangHashSync(linkSelector: string): void {
  const sync = (): void => {
    document.querySelectorAll<HTMLAnchorElement>(linkSelector).forEach((link) => {
      const base = (link.dataset.baseHref ??= link.getAttribute('href') ?? '');
      link.setAttribute('href', base + location.hash);
    });
  };
  sync();
  window.addEventListener('hashchange', sync);
}
