import { afterEach, describe, expect, it } from 'vitest';
import { lockScroll, unlockScroll } from '../../src/lib/scroll-lock';

afterEach(() => {
  // The module's own owner Set persists across tests (module-level state); leave it empty for the next test.
  unlockScroll('nav');
  unlockScroll('image-viewer');
  document.documentElement.classList.remove('is-scroll-locked');
});

describe('scroll-lock.ts (fix round 1 minor)', () => {
  it('locks and unlocks for a single owner', () => {
    expect(document.documentElement).not.toHaveClass('is-scroll-locked');
    lockScroll('nav');
    expect(document.documentElement).toHaveClass('is-scroll-locked');
    unlockScroll('nav');
    expect(document.documentElement).not.toHaveClass('is-scroll-locked');
  });

  it('one owner unlocking never removes another owner\'s lock', () => {
    lockScroll('image-viewer'); // e.g. an image <dialog> is open
    lockScroll('nav'); // the mobile menu also opened
    expect(document.documentElement).toHaveClass('is-scroll-locked');

    // HudNav's resize-to-desktop auto-close (or Escape, or a link click) unlocks its own "nav" ownership only.
    unlockScroll('nav');
    expect(document.documentElement, 'the image viewer still owns the lock').toHaveClass('is-scroll-locked');

    unlockScroll('image-viewer');
    expect(document.documentElement).not.toHaveClass('is-scroll-locked');
  });

  it('locking the same owner twice and unlocking once still unlocks (a Set, not a counter)', () => {
    lockScroll('nav');
    lockScroll('nav');
    unlockScroll('nav');
    expect(document.documentElement).not.toHaveClass('is-scroll-locked');
  });
});
