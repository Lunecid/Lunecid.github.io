import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VIEWER_QUEUE_SCRIPT } from '../../src/lib/viewer-queue';

/** Swaps in a plain, settable stand-in for window.location so a fallback `location.href = …` can be observed
 * without jsdom's "Not implemented: navigation" noise; restored by the caller. */
function stubLocation(): { href: string } {
  const stub = { href: '' };
  Object.defineProperty(window, 'location', { value: stub, writable: true, configurable: true });
  return stub;
}

type Added = [EventTarget, string, EventListenerOrEventListenerObject, boolean | AddEventListenerOptions | undefined];
let added: Added[] = [];

/** Runs the inline script, recording the listeners it adds so afterEach can remove them (each run would otherwise
 * leave its document click + window pageshow listeners behind for every later test in this file). */
function runViewerQueueScript(): void {
  const onDocument = vi.spyOn(document, 'addEventListener');
  const onWindow = vi.spyOn(window, 'addEventListener');
  try {
    new Function(VIEWER_QUEUE_SCRIPT)();
  } finally {
    for (const [type, fn, options] of onDocument.mock.calls) if (fn) added.push([document, type, fn, options]);
    for (const [type, fn, options] of onWindow.mock.calls) if (fn) added.push([window, type, fn, options]);
    onDocument.mockRestore();
    onWindow.mockRestore();
  }
}

function click(el: Element, init: MouseEventInit = {}): boolean {
  return el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init }));
}

function viewerLink(href: string, id = 'busan-mayor-award'): HTMLAnchorElement {
  const a = document.createElement('a');
  a.setAttribute('href', href);
  a.dataset.viewer = 'certificates';
  a.dataset.certId = id;
  document.body.appendChild(a);
  return a;
}

/** What the browser fires when Back/Forward restores this page from the back/forward cache (persisted) — or, with
 * persisted=false, on an ordinary load. */
function pageshow(persisted: boolean): void {
  window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted }));
}

beforeEach(() => {
  document.body.innerHTML = '';
  delete window.__sbViewerReady;
  delete window.__sbViewerQueue;
  delete window.__sbViewerLeaving;
});

afterEach(() => {
  for (const [target, type, fn, options] of added) target.removeEventListener(type, fn, options);
  added = [];
  document.body.innerHTML = '';
});

describe('VIEWER_QUEUE_SCRIPT (P2-13)', () => {
  it('is self-contained (no imports/exports at runtime)', () => {
    expect(VIEWER_QUEUE_SCRIPT).not.toMatch(/\b(import|export|require)\b/);
    expect(VIEWER_QUEUE_SCRIPT.trim().startsWith('(function')).toBe(true);
  });

  it('sets window.__sbViewerReady = false, __sbViewerLeaving = false and an empty queue', () => {
    runViewerQueueScript();
    expect(window.__sbViewerReady).toBe(false);
    expect(window.__sbViewerLeaving).toBe(false);
    expect(window.__sbViewerQueue).toEqual([]);
  });

  it('a plain click on [data-viewer] before ready is queued and prevented', () => {
    runViewerQueueScript();
    const a = document.createElement('a');
    a.href = '/cert.webp';
    a.dataset.viewer = 'certificates';
    a.dataset.certId = 'busan-mayor-award';
    document.body.appendChild(a);
    const notPrevented = click(a);
    expect(notPrevented, 'preventDefault() makes dispatchEvent return false').toBe(false);
    expect(window.__sbViewerQueue).toEqual([a]);
  });

  it('a modifier or non-primary click is left alone (not queued, not prevented)', () => {
    runViewerQueueScript();
    const a = document.createElement('a');
    a.dataset.viewer = 'certificates';
    a.dataset.certId = 'busan-mayor-award';
    document.body.appendChild(a);
    expect(click(a, { ctrlKey: true })).toBe(true);
    expect(click(a, { button: 1 })).toBe(true);
    expect(window.__sbViewerQueue).toEqual([]);
  });

  it('a click outside any [data-viewer] is ignored', () => {
    runViewerQueueScript();
    const div = document.createElement('div');
    document.body.appendChild(div);
    expect(click(div)).toBe(true);
    expect(window.__sbViewerQueue).toEqual([]);
  });


  it('a click on a thumbnail img inside a figure whose trigger has data-viewer is queued', () => {
    runViewerQueueScript();
    const figure = document.createElement('figure');
    const img = document.createElement('img');
    img.src = '/thumb.webp';
    const a = document.createElement('a');
    a.setAttribute('href', '/full.webp');
    a.dataset.viewer = 'figures';
    figure.append(img, a);
    document.body.appendChild(figure);
    expect(click(img)).toBe(false);
    expect(window.__sbViewerQueue).toEqual([a]);
  });

  it('once __sbViewerReady is true, later clicks pass through untouched (the island takes over)', () => {
    runViewerQueueScript();
    window.__sbViewerReady = true;
    const a = document.createElement('a');
    a.dataset.viewer = 'certificates';
    a.dataset.certId = 'busan-mayor-award';
    document.body.appendChild(a);
    expect(click(a)).toBe(true);
    expect(window.__sbViewerQueue).toEqual([]);
  });

  it('fix round 1 minor: falls back to the no-JS link ~3s after a click if the island never becomes ready', () => {
    vi.useFakeTimers();
    const originalLocation = window.location;
    const location = stubLocation();
    try {
      runViewerQueueScript();
      const a = document.createElement('a');
      a.setAttribute('href', '/cert.webp');
      a.dataset.viewer = 'certificates';
    a.dataset.certId = 'busan-mayor-award';
      document.body.appendChild(a);
      click(a);
      expect(window.__sbViewerQueue).toEqual([a]);
      vi.advanceTimersByTime(2999);
      expect(location.href, 'not yet — still under the 3s grace period').toBe('');
      vi.advanceTimersByTime(1);
      expect(location.href, 'never swallowed: falls back to the plain link').toBe('/cert.webp');
    } finally {
      Object.defineProperty(window, 'location', { value: originalLocation, writable: true, configurable: true });
      vi.useRealTimers();
    }
  });

  it('fix round 2 item 7 / fix round 3 item 2: a fallback empties the queue and sets __sbViewerLeaving, so a late island cannot replay it', () => {
    vi.useFakeTimers();
    const originalLocation = window.location;
    stubLocation();
    try {
      runViewerQueueScript();
      expect(window.__sbViewerLeaving).toBe(false);
      const a = document.createElement('a');
      a.setAttribute('href', '/cert.webp');
      a.dataset.viewer = 'certificates';
    a.dataset.certId = 'busan-mayor-award';
      document.body.appendChild(a);
      click(a);
      expect(window.__sbViewerQueue).toEqual([a]);
      vi.advanceTimersByTime(3000); // fires the fallback: navigates, and must also empty the queue
      // A late ImageViewer mount (window.__sbViewerReady = true; checks __sbViewerLeaving before splicing the
      // queue) now finds nothing to replay for this click — no modal flash right before/after the navigation.
      expect(window.__sbViewerQueue).toEqual([]);
      expect(window.__sbViewerLeaving).toBe(true);
    } finally {
      Object.defineProperty(window, 'location', { value: originalLocation, writable: true, configurable: true });
      vi.useRealTimers();
    }
  });

  it('fix round 3 item 2: a second, still-pending click does NOT survive an earlier one falling back — the whole queue clears, not just the timed-out trigger', () => {
    vi.useFakeTimers();
    const originalLocation = window.location;
    const location = stubLocation();
    try {
      runViewerQueueScript();
      const first = document.createElement('a');
      first.setAttribute('href', '/cert-1.webp');
      first.dataset.viewer = 'certificates';
      first.dataset.certId = 'busan-mayor-award';
      document.body.appendChild(first);
      click(first);
      vi.advanceTimersByTime(2000);
      const second = document.createElement('a');
      second.setAttribute('href', '/cert-2.webp');
      second.dataset.viewer = 'certificates';
      second.dataset.certId = 'cds-encouragement-award';
      document.body.appendChild(second);
      click(second);
      expect(window.__sbViewerQueue).toEqual([first, second]);
      vi.advanceTimersByTime(1000); // first's 3s elapses; second still has 2s left on its own timer
      // Fix round 2's version of this fix only removed the timed-out trigger by reference, leaving `second`
      // queued for a late island to replay even though the page is already navigating away because of `first`.
      // The whole page is leaving now — nothing queued should survive that, regardless of whose timer fired.
      expect(location.href, "first's fallback committed to navigating").toBe('/cert-1.webp');
      expect(window.__sbViewerLeaving).toBe(true);
      expect(window.__sbViewerQueue, 'the whole queue is cleared, not just the timed-out trigger').toEqual([]);
    } finally {
      Object.defineProperty(window, 'location', { value: originalLocation, writable: true, configurable: true });
      vi.useRealTimers();
    }
  });

  it('does not navigate if the island became ready before the 3s timeout', () => {
    vi.useFakeTimers();
    const originalLocation = window.location;
    const location = stubLocation();
    try {
      runViewerQueueScript();
      const a = document.createElement('a');
      a.setAttribute('href', '/cert.webp');
      a.dataset.viewer = 'certificates';
    a.dataset.certId = 'busan-mayor-award';
      document.body.appendChild(a);
      click(a);
      window.__sbViewerReady = true; // the island mounted and replayed the click (ImageViewer.tsx)
      vi.advanceTimersByTime(3000);
      expect(location.href).toBe('');
    } finally {
      Object.defineProperty(window, 'location', { value: originalLocation, writable: true, configurable: true });
      vi.useRealTimers();
    }
  });

  describe('fix round 4 item 2: __sbViewerLeaving never outlives the page actually leaving', () => {
    let originalLocation: Location;
    let location: { href: string };
    beforeEach(() => {
      vi.useFakeTimers();
      originalLocation = window.location;
      location = stubLocation();
    });
    afterEach(() => {
      Object.defineProperty(window, 'location', { value: originalLocation, writable: true, configurable: true });
      vi.useRealTimers();
    });

    it('a bfcache restore (pageshow with persisted=true) resets __sbViewerLeaving and the queue; an ordinary load does not', () => {
      runViewerQueueScript();
      const a = viewerLink('/cert-a.webp');
      click(a);
      vi.advanceTimersByTime(3000); // the fallback fires: navigating to A's image, page flagged as leaving
      expect(location.href).toBe('/cert-a.webp');
      expect(window.__sbViewerLeaving).toBe(true);
      pageshow(false);
      expect(window.__sbViewerLeaving, 'an ordinary (non-persisted) pageshow is not a restore').toBe(true);
      pageshow(true); // Back: the same document comes back from the bfcache, with its JS state intact
      expect(window.__sbViewerLeaving).toBe(false);
      expect(window.__sbViewerQueue).toEqual([]);
    });

    it('a tap queued just before the page was frozen is dropped on restore: not left for a late island, and its stale timer never navigates away again', () => {
      runViewerQueueScript();
      const a = viewerLink('/cert-a.webp');
      const b = viewerLink('/cert-b.webp', 'cds-encouragement-award');
      click(a);
      vi.advanceTimersByTime(3000); // A's fallback: navigation to A's image starts…
      click(b); // …and B is tapped while the old page is still showing (the navigation has not committed yet)
      expect(window.__sbViewerQueue).toEqual([b]);
      // The page is frozen into the bfcache, then Back restores it (B's ~3s timer is still pending inside it).
      location.href = '';
      pageshow(true);
      expect(window.__sbViewerQueue, 'nothing from before the freeze is left to replay').toEqual([]);
      expect(window.__sbViewerLeaving).toBe(false);
      vi.advanceTimersByTime(3000); // B's pre-freeze timer fires on the restored page, island still not ready
      expect(location.href, 'Back is not undone by a stale fallback').toBe('');
    });

    it('a tap after a bfcache restore is never swallowed: with the island still not ready, it falls back itself', () => {
      runViewerQueueScript();
      const a = viewerLink('/cert-a.webp');
      click(a);
      vi.advanceTimersByTime(3000);
      location.href = '';
      pageshow(true);
      click(a);
      expect(window.__sbViewerQueue).toEqual([a]);
      vi.advanceTimersByTime(2999);
      expect(location.href).toBe('');
      vi.advanceTimersByTime(1);
      expect(location.href, 'the post-restore tap gets its own fallback').toBe('/cert-a.webp');
    });

    it('an aborted fallback navigation (the page is still here) does not swallow the next tap: queuing it clears __sbViewerLeaving', () => {
      runViewerQueueScript();
      const a = viewerLink('/cert-a.webp');
      click(a);
      vi.advanceTimersByTime(3000);
      expect(window.__sbViewerLeaving).toBe(true);
      // The navigation never commits (Stop pressed, or it failed): no pageshow, the same page simply stays.
      location.href = '';
      click(a);
      // The fallback already emptied the queue when it set the flag, so clearing it here can only ever let this
      // (or a later) tap through — never anything queued before the fallback fired.
      expect(window.__sbViewerLeaving, 'a tap made after the fallback is a new intent').toBe(false);
      expect(window.__sbViewerQueue).toEqual([a]);
    });
  });
});
