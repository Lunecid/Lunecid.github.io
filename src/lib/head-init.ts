// src/lib/head-init.ts — inline <head> script: motion preference + CRT intro gate (spec §4, §5; mockup-port §1.5).
// BaseLayout renders it FIRST in <head> with <script is:inline set:html={HEAD_INIT_SCRIPT} />, so it runs before
// first paint and before any island hydrates. The string is self-contained: no imports, and the storage keys are
// the literals 'sb:motion' and 'sb:intro' (tests/react/head-init.test.ts checks they equal STORAGE_KEYS).
// Timeline (ms from first-contentful-paint, N17 / F-016): overlay 0–400 → fade 400–700 → removed at 700 (≤1 s).
// Any keydown/pointerdown/wheel/touchstart skips: fade, then done 150 ms later. Timers arm on FCP (or crt-on
// animationstart fallback); a 3 s safety calls done() only.

export const INTRO_TIMING = { releaseMs: 400, doneMs: 700, skipFadeMs: 150, safetyMs: 3000 } as const;

export const HEAD_INIT_SCRIPT = `(function () {
  var d = document.documentElement;
  d.classList.add('js');
  var off = false;
  try { off = window.localStorage.getItem('sb:motion') === 'off'; } catch (e) { off = false; }
  var os = false;
  try { os = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { os = false; }
  var reduce = off || os;
  d.setAttribute('data-motion', reduce ? 'reduce' : 'full');
  if (reduce || d.getAttribute('data-page') !== 'home') return;
  var seen = true;
  try {
    seen = window.sessionStorage.getItem('sb:intro') === '1';
    window.sessionStorage.setItem('sb:intro', '1');
  } catch (e) { seen = true; }
  if (seen) return;
  d.setAttribute('data-intro', 'playing');
  d.setAttribute('data-intro-played', '');
  var types = ['keydown', 'pointerdown', 'wheel', 'touchstart'];
  var finished = false;
  var skipped = false;
  var started = false;
  var t1 = 0;
  var t2 = 0;
  var tSafety = 0;
  function done() {
    if (finished) return;
    finished = true;
    window.clearTimeout(t1);
    window.clearTimeout(t2);
    window.clearTimeout(tSafety);
    for (var i = 0; i < types.length; i++) window.removeEventListener(types[i], skip, true);
    try { if (po) po.disconnect(); } catch (e) {}
    d.removeEventListener('animationstart', onAnim, true);
    d.removeAttribute('data-intro');
    window.dispatchEvent(new Event('sb:intro-done'));
  }
  function release() {
    if (d.getAttribute('data-intro') === 'playing') d.setAttribute('data-intro', 'fading');
  }
  function skip() {
    if (finished || skipped) return;
    skipped = true;
    window.__sbIntroSkipped = true;
    window.clearTimeout(t1);
    window.clearTimeout(t2);
    release();
    t2 = window.setTimeout(done, ${INTRO_TIMING.skipFadeMs});
  }
  function start() {
    if (started || finished) return;
    started = true;
    window.clearTimeout(tSafety);
    t1 = window.setTimeout(release, ${INTRO_TIMING.releaseMs});
    t2 = window.setTimeout(done, ${INTRO_TIMING.doneMs});
  }
  function onAnim(ev) {
    if (ev && ev.animationName === 'crt-on') start();
  }
  var po = null;
  try {
    var paints = performance.getEntriesByType('paint');
    for (var p = 0; p < paints.length; p++) {
      if (paints[p].name === 'first-contentful-paint') { start(); break; }
    }
  } catch (e) {}
  if (!started && typeof PerformanceObserver === 'function') {
    try {
      po = new PerformanceObserver(function (list) {
        var entries = list.getEntries();
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].name === 'first-contentful-paint') {
            try { po.disconnect(); } catch (e) {}
            start();
            return;
          }
        }
      });
      po.observe({ type: 'paint', buffered: true });
    } catch (e) { po = null; }
  }
  d.addEventListener('animationstart', onAnim, true);
  tSafety = window.setTimeout(done, ${INTRO_TIMING.safetyMs});
  for (var j = 0; j < types.length; j++) window.addEventListener(types[j], skip, { capture: true, passive: true });
})();`;
