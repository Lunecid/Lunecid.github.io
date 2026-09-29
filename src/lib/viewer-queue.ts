// src/lib/viewer-queue.ts — inline <head> script (P2-13, generalised for ImageViewer): queues a plain click on
// [data-viewer] (or on a thumbnail <img> inside a <figure> whose trigger has data-viewer) until ImageViewer
// hydrates, so a click on a slow phone before the island's own listener attaches never falls through to the
// browser's default navigation (the bare WebP, with no site chrome).
// Same pattern as window.__sbTriggers (src/lib/achievements.ts): self-contained, no imports, so BaseLayout inlines
// it with <script is:inline set:html={VIEWER_QUEUE_SCRIPT} />. A capture-phase listener on `document` intercepts the
// click and remembers the trigger element while window.__sbViewerReady is false; ImageViewer.tsx sets it true
// and replays the last queued trigger once it mounts. After that this listener is a no-op — the island's own
// bubble-phase listener (added in the same effect) handles every later click, exactly as before.
// Fix round 1 minor: if the island never becomes ready (its chunk fails to load, a JS error, etc.), the click must
// not be swallowed forever — after ~3s a still-queued trigger falls back to the no-JS behaviour (follows the
// link, opening the image) instead of silently doing nothing.
// Fix round 2 item 7: falling back used to only *check* __sbViewerReady, never touch the queue — so a late island
// (its chunk finally arrives during/just after the location.href navigation the fallback already kicked off)
// would still find this trigger sitting in window.__sbViewerQueue and replay it, opening the modal for a flash of a
// frame before the browser actually unloads. Fix round 3 item 2: removing just *this* trigger (by reference) was
// still not enough — a repeated tap on the same trigger queues it twice ([A, A]), and indexOf/splice only ever
// drops the first copy; a second, different trigger queued before this one's timeout fires (queue [A, B]) is
// untouched by A's fallback entirely. Either way, once ANY fallback commits to navigating the whole page away,
// nothing else in the queue should ever be replayed — the page itself is leaving, not just this one click's
// target. Empty the whole queue and set window.__sbViewerLeaving, which ImageViewer.tsx's mount effect checks
// before replaying anything at all (not just before consulting the queue for this specific trigger).
// Fix round 4 item 2: the flag used to stay set for the rest of the document's life, but the page does not always
// actually leave. A bfcache Back restores this same document (JS state intact), and a fallback navigation can be
// aborted (Stop, a failed request) — either way the next pre-hydration tap was queued, then not replayed (the island
// saw leaving=true) and its own timer returned too (the island was ready by then): nothing happened at all. The
// rule now is that the flag only ever covers taps queued BEFORE it was set, and those are already gone — the
// fallback empties the queue in the same tick it sets the flag. So any fresh tap clears the flag before queuing
// itself: it is a new intent from a user who is evidently still on this page, and it gets the normal treatment
// (the island replays it, or its own ~3s fallback fires). Invariant: while the flag is true the queue is empty.
// A timer that clears the flag "if the page is still here N s after the fallback" was rejected: no N tells a slow
// navigation from an aborted one, and a tap queued inside that window would still be dropped by an island
// mounting inside it. Separately, a bfcache restore (pageshow with persisted=true) resets the flag and the queue
// and bumps `epoch`, so pre-freeze taps are neither replayed by a late island nor, through their still-pending
// timers, allowed to navigate away again right after the user pressed Back.
export const VIEWER_QUEUE_SCRIPT = `(function () {
  window.__sbViewerReady = false;
  window.__sbViewerLeaving = false;
  window.__sbViewerQueue = [];
  var epoch = 0;
  function findTrigger(target) {
    if (!target || !target.closest) return null;
    var direct = target.closest('[data-viewer]');
    if (direct) return direct;
    var img = target.closest('figure img');
    if (!img) return null;
    var figure = img.closest('figure');
    if (!figure) return null;
    return figure.querySelector('[data-viewer]');
  }
  document.addEventListener('click', function (event) {
    if (window.__sbViewerReady) return;
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    var trigger = findTrigger(event.target);
    if (!trigger) return;
    event.preventDefault();
    window.__sbViewerLeaving = false;
    window.__sbViewerQueue.push(trigger);
    var queuedIn = epoch;
    window.setTimeout(function () {
      if (window.__sbViewerReady) return; // the island took over (replayed this click, or a later one already did)
      if (queuedIn !== epoch) return; // queued before a bfcache restore: stale, dropped with the rest of that epoch
      window.__sbViewerLeaving = true;
      window.__sbViewerQueue = [];
      var href = trigger.getAttribute('href');
      if (href) location.href = href;
    }, 3000);
  }, true);
  window.addEventListener('pageshow', function (event) {
    if (!event.persisted) return;
    epoch++;
    window.__sbViewerLeaving = false;
    window.__sbViewerQueue = [];
  });
})();`;

declare global {
  interface Window {
    __sbViewerReady?: boolean;
    __sbViewerLeaving?: boolean;
    __sbViewerQueue?: HTMLElement[];
  }
}
