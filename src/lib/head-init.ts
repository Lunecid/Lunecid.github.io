// src/lib/head-init.ts — inline <head> script: motion preference + CRT intro gate (spec §4, §5; mockup-port §1.5).
// BaseLayout renders it FIRST in <head> with <script is:inline set:html={HEAD_INIT_SCRIPT} />, so it runs before
// first paint and before any island hydrates. The string is self-contained: no imports, and the storage keys are
// the literals 'sb:motion', 'sb:intro' and 'sb:hero' (tests/react/head-init.test.ts checks they equal STORAGE_KEYS).
// Hero copy (H1): the game home's copy rise (or its reduced fade) plays on the first view of the session only;
// later views, a view-transition entry and unreadable storage get data-hero-seen (Hero.astro stops the animation).
// Timeline (ms from first-contentful-paint, N17 / F-016): overlay 0–400 → fade 400–700 → removed at 700 (≤1 s).
// Any keydown/pointerdown/wheel/touchstart skips: data-intro-skip switches the overlay to the short --dur-press
// fade (CrtIntro.astro), then done 150 ms later removes both attributes. Timers arm on FCP (or crt-on
// animationstart fallback); a 3 s safety calls done() only.
// CRT gate (A-19): only the game home plays the intro; this string cannot import VARIANT_MODULES, so tests/react/variant-runtime.test.ts pins the agreement.
// The chooser's opening (MO-41, chooser v6.12): on the neutral chooser, once per session (the same sb:intro, so the
// game home after it plays no CRT, D-2), never with ?choose, after the pre-paint redirect (window.__sbRedirect, set by
// the chooser's head script that runs before this one; a redirect does not spend sb:intro), under reduced motion or
// with unreadable storage. data-intro="opening" runs the CSS timeline in chooser.css; done at doneMs after FCP (the
// timeline ends at 2.398 s), safetyMs without FCP. Any input ends it at once (no fade): pointer and touch input leave
// window.__sbOpeningSkip = the event's timeStamp, so chooser.ts cancels that press's click (a press only ends it).

export const INTRO_TIMING = { releaseMs: 400, doneMs: 700, skipFadeMs: 150, safetyMs: 3000 } as const;
export const OPENING_TIMING = { doneMs: 2400, safetyMs: 3400 } as const;

export const HEAD_INIT_SCRIPT = `(function () {
  var d = document.documentElement;
  d.classList.add('js');
  var off = false;
  try { off = window.localStorage.getItem('sb:motion') === 'off'; } catch (e) { off = false; }
  var os = false;
  try { os = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { os = false; }
  var reduce = off || os;
  d.setAttribute('data-motion', reduce ? 'reduce' : 'full');
  var gameHome = d.getAttribute('data-variant') === 'game' && d.getAttribute('data-page') === 'home';
  if (gameHome) {
    var heroSeen = true;
    try {
      heroSeen = window.sessionStorage.getItem('sb:hero') === '1';
      if (!heroSeen) window.sessionStorage.setItem('sb:hero', '1');
    } catch (e) { heroSeen = true; }
    if (heroSeen) d.setAttribute('data-hero-seen', '');
    window.addEventListener('pagereveal', function (ev) {
      if (ev.viewTransition) d.setAttribute('data-hero-seen', '');
    });
  }
  var opening = d.getAttribute('data-variant') === 'neutral' && d.getAttribute('data-page') === 'chooser';
  if (opening ? reduce || window.__sbRedirect || /[?&]choose(?:[=&]|$)/.test(location.search) : reduce || !gameHome) return;
  var seen = true;
  try {
    seen = window.sessionStorage.getItem('sb:intro') === '1';
    window.sessionStorage.setItem('sb:intro', '1');
  } catch (e) { seen = true; }
  if (seen) return;
  d.setAttribute('data-intro', opening ? 'opening' : 'playing');
  if (!opening) d.setAttribute('data-intro-played', '');
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
    d.removeAttribute('data-intro-skip');
    window.dispatchEvent(new Event('sb:intro-done'));
  }
  function release() {
    if (d.getAttribute('data-intro') === 'playing') d.setAttribute('data-intro', 'fading');
  }
  function skip(ev) {
    if (finished || skipped) return;
    if (opening) {
      if (ev && (ev.type === 'pointerdown' || ev.type === 'touchstart')) window.__sbOpeningSkip = ev.timeStamp;
      done();
      return;
    }
    skipped = true;
    window.__sbIntroSkipped = true;
    window.clearTimeout(t1);
    window.clearTimeout(t2);
    d.setAttribute('data-intro-skip', '');
    release();
    t2 = window.setTimeout(done, ${INTRO_TIMING.skipFadeMs});
  }
  function start() {
    if (started || finished) return;
    started = true;
    window.clearTimeout(tSafety);
    if (!opening) t1 = window.setTimeout(release, ${INTRO_TIMING.releaseMs});
    t2 = window.setTimeout(done, opening ? ${OPENING_TIMING.doneMs} : ${INTRO_TIMING.doneMs});
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
  tSafety = window.setTimeout(done, opening ? ${OPENING_TIMING.safetyMs} : ${INTRO_TIMING.safetyMs});
  for (var j = 0; j < types.length; j++) window.addEventListener(types[j], skip, { capture: true, passive: true });
})();`;
