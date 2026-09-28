// src/lib/head-init.ts — inline <head> script: motion preference + CRT intro gate (spec §4, §5; mockup-port §1.5).
// BaseLayout renders it FIRST in <head> with <script is:inline set:html={HEAD_INIT_SCRIPT} />, so it runs before
// first paint and before any island hydrates. The string is self-contained: no imports, and the storage keys are
// the literals 'sb:motion' and 'sb:intro' (tests/react/head-init.test.ts checks they equal STORAGE_KEYS).
// Timeline (ms from first paint): overlay 0–400 → fade 400–700 → removed at 700 (≤1 s, spec §5).
// Any keydown/pointerdown/wheel/touchstart skips: fade, then done 150 ms later.

export const INTRO_TIMING = { releaseMs: 400, doneMs: 700, skipFadeMs: 150 } as const;

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
  var t1 = 0;
  var t2 = 0;
  function done() {
    if (finished) return;
    finished = true;
    window.clearTimeout(t1);
    window.clearTimeout(t2);
    for (var i = 0; i < types.length; i++) window.removeEventListener(types[i], skip, true);
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
  t1 = window.setTimeout(release, ${INTRO_TIMING.releaseMs});
  t2 = window.setTimeout(done, ${INTRO_TIMING.doneMs});
  for (var j = 0; j < types.length; j++) window.addEventListener(types[j], skip, { capture: true, passive: true });
})();`;
