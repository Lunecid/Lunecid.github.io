// src/lib/scroll-lock.ts — shared body-scroll lock, keyed by a Set of named owners (fix round 1 minor).
// Both the mobile menu (HudNav.astro) and the certificate modal (CertificateModal.tsx) lock scroll via the same
// `html.is-scroll-locked` class (src/styles/base.css). Before this module existed, each toggled the class
// directly and unconditionally on its own close/open-to-close events — so if the menu happened to auto-close on a
// resize-to-desktop (window.matchMedia('(min-width: 734px)') change) while a certificate <dialog> was still open,
// the menu's close handler would strip the lock out from under the still-open modal, letting the page scroll
// behind it. Locking/unlocking by name means removing one owner's lock never clears another's.
const owners = new Set<string>();

export function lockScroll(owner: string): void {
  owners.add(owner);
  document.documentElement.classList.add('is-scroll-locked');
}

export function unlockScroll(owner: string): void {
  owners.delete(owner);
  if (owners.size === 0) document.documentElement.classList.remove('is-scroll-locked');
}
