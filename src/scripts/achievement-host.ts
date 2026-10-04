// src/scripts/achievement-host.ts — behaviour of the achievement toast host (src/components/hud/AchievementHost.astro;
// one per game page, BaseLayout). P1-9b (P-03): a line-for-line port of the former React island
// src/islands/AchievementHost.tsx to a plain script. Drains triggers queued before the script ran, listens for new
// ones, records the section/language visit, watches for the Konami code, and shows one toast per newly unlocked
// achievement: 0.3 s in / 0.2 s out, none of either under reduced motion (the toast simply appears/disappears,
// controller ruling 1), auto-dismiss after TOAST_MS, paused while hovered or focused. CSS animations only.
// N10: Esc + overlapping focusin dismiss; hold until intro-done + ~950ms (immediate under reduce); title only.
// The host root carries its strings: data-lang, data-close-label, aria-label (the region name) and data-defs (the
// reachable achievements as JSON, built from src/data/achievements.yaml). The neutral 404 (P1-16) has no host.
import type { Lang } from '../i18n/ui';
import {
  TRIGGER_EVENT,
  drainTriggers,
  emitTrigger,
  idsForTrigger,
  recordVisit,
  toNavSection,
  unlock,
  type AchievementDef,
} from '../lib/achievements';
import { createKonamiDetector } from '../lib/konami';
import { prefersReducedNow, subscribeMotion } from '../lib/motion-pref';

/** The fields the toast needs (the server serialises only these into data-defs). */
export type ToastDef = Pick<AchievementDef, 'id' | 'trigger' | 'title' | 'description'>;

export const TOAST_MS = 6000;
export const OUT_MS = 200;
/** F-028: after intro (or when absent), wait this long after the host starts before the first toast. */
export const ENTRANCE_HOLD_MS = 950;

function rectsIntersect(a: DOMRect, b: DOMRect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function readDefs(raw: string | undefined): ToastDef[] {
  try {
    const parsed: unknown = JSON.parse(raw ?? '[]');
    return Array.isArray(parsed) ? (parsed as ToastDef[]) : [];
  } catch {
    return [];
  }
}

interface State {
  queue: string[];
  leaving: boolean;
  paused: boolean;
  ready: boolean;
  dialogOpen: boolean;
  reduce: boolean;
}

/**
 * Binds one server-rendered `[data-achievement-host]` region. Returns a teardown that removes every listener and
 * timer (the page never calls it; the dom tests do, as React's unmount did).
 */
export function initAchievementHost(region: HTMLElement): () => void {
  const lang: Lang = region.dataset.lang === 'en' ? 'en' : 'ko';
  const closeLabel = region.dataset.closeLabel ?? '';
  const defs = readDefs(region.dataset.defs);
  const state: State = { queue: [], leaving: false, paused: false, ready: false, dialogOpen: false, reduce: prefersReducedNow() };
  let toast: HTMLDivElement | null = null;
  let toastId: string | null = null;

  // React-style effects: each runs again (after its cleanup) when its key changes.
  const effects = new Map<string, { key: string; cleanup: (() => void) | void }>();
  const effect = (name: string, key: string, fn: () => (() => void) | void) => {
    const prev = effects.get(name);
    if (prev && prev.key === key) return;
    prev?.cleanup?.();
    effects.set(name, { key, cleanup: undefined });
    const cleanup = fn();
    const cur = effects.get(name);
    if (cur && cur.key === key) cur.cleanup = cleanup;
  };

  let committing = false;
  let dirty = false;
  const set = (patch: Partial<State>) => {
    Object.assign(state, patch);
    commit();
  };
  const dismiss = () => set({ leaving: true });

  const createToast = (def: ToastDef): HTMLDivElement => {
    const el = document.createElement('div');
    el.className = 'ach-toast cut cut--line';
    const mark = document.createElement('span');
    mark.className = 'ach-toast__mark';
    mark.setAttribute('aria-hidden', 'true');
    mark.textContent = '◆';
    const body = document.createElement('div');
    body.className = 'ach-toast__body';
    const kicker = document.createElement('p');
    kicker.className = 'ach-toast__kicker';
    kicker.lang = 'en';
    kicker.textContent = 'ACHIEVEMENT UNLOCKED';
    // F-060: title only under the kicker; the full sentence stays visually hidden for aria-live.
    const text = document.createElement('p');
    text.className = 'ach-toast__text';
    text.textContent = def.title[lang];
    const sr = document.createElement('span');
    sr.className = 'sr-only';
    sr.textContent = `${def.title[lang]} — ${def.description[lang]}`;
    body.append(kicker, text, sr);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'ach-toast__close hit';
    close.setAttribute('aria-label', closeLabel);
    const x = document.createElement('span');
    x.setAttribute('aria-hidden', 'true');
    x.textContent = '×';
    close.append(x);
    close.addEventListener('click', dismiss);
    el.append(mark, body, close);
    el.addEventListener('pointerenter', () => set({ paused: true }));
    el.addEventListener('pointerleave', () => set({ paused: false }));
    el.addEventListener('focusin', () => set({ paused: true }));
    el.addEventListener('focusout', () => set({ paused: false }));
    return el;
  };

  function commit(): void {
    if (committing) {
      dirty = true;
      return;
    }
    committing = true;
    try {
      do {
        dirty = false;
        const current = state.queue[0];
        const def = current === undefined ? undefined : defs.find((d) => d.id === current);
        const showToast = state.ready && !state.dialogOpen && def !== undefined;

        // render
        if (showToast && def) {
          if (!toast || toastId !== def.id) {
            toast?.remove();
            toast = createToast(def);
            toastId = def.id;
            region.append(toast);
          }
          toast.setAttribute('data-state', state.leaving ? 'out' : 'in');
        } else if (toast) {
          toast.remove();
          toast = null;
          toastId = null;
        }

        // auto-dismiss timer (restarts whenever the toast, pause or leave state changes)
        effect('timer', `${showToast}|${current}|${state.paused}|${state.leaving}`, () => {
          if (!showToast || state.paused || state.leaving) return;
          const timer = window.setTimeout(dismiss, TOAST_MS);
          return () => window.clearTimeout(timer);
        });

        // leave: drop the current toast after the out animation (none under reduced motion)
        effect('leave', `${state.leaving}|${state.reduce}`, () => {
          if (!state.leaving) return;
          const clear = () => set({ queue: state.queue.slice(1), leaving: false, paused: false });
          // Reduced motion plays no exit animation at all (controller ruling 1), so nothing to wait for.
          if (state.reduce) {
            clear();
            return;
          }
          const timer = window.setTimeout(clear, OUT_MS);
          return () => window.clearTimeout(timer);
        });

        // F-004: Esc dismisses; focusin overlapping the toast from outside dismisses (focus is not moved).
        effect('dismissKeys', `${showToast}|${state.leaving}`, () => {
          if (!showToast || state.leaving) return;
          const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            if (document.querySelector('dialog[open]')) return;
            event.preventDefault();
            dismiss();
          };
          const onFocusIn = (event: FocusEvent) => {
            const target = event.target;
            if (!(toast instanceof HTMLElement) || !(target instanceof Element)) return;
            if (toast.contains(target)) return;
            if (rectsIntersect(toast.getBoundingClientRect(), target.getBoundingClientRect())) dismiss();
          };
          document.addEventListener('keydown', onKeyDown);
          document.addEventListener('focusin', onFocusIn);
          return () => {
            document.removeEventListener('keydown', onKeyDown);
            document.removeEventListener('focusin', onFocusIn);
          };
        });

        // F-028: hold the queue until sb:intro-done (or data-intro absent), then ~950ms. Immediate under reduce.
        effect('entrance', String(state.reduce), () => {
          if (state.reduce) {
            set({ ready: true });
            return;
          }
          let cancelled = false;
          let delayTimer = 0;
          const arm = () => {
            delayTimer = window.setTimeout(() => {
              if (!cancelled) set({ ready: true });
            }, ENTRANCE_HOLD_MS);
          };
          if (!document.documentElement.hasAttribute('data-intro')) {
            arm();
            return () => {
              cancelled = true;
              window.clearTimeout(delayTimer);
            };
          }
          const onDone = () => arm();
          window.addEventListener('sb:intro-done', onDone, { once: true });
          return () => {
            cancelled = true;
            window.clearTimeout(delayTimer);
            window.removeEventListener('sb:intro-done', onDone);
          };
        });
      } while (dirty);
    } finally {
      committing = false;
    }
  }

  // Triggers → unlocks → queue.
  const processTriggers = () => {
    const fresh: string[] = [];
    for (const trigger of drainTriggers()) {
      for (const id of idsForTrigger(defs as AchievementDef[], trigger)) {
        if (unlock(id)) fresh.push(id);
      }
    }
    if (fresh.length > 0) set({ queue: [...state.queue, ...fresh] });
  };
  processTriggers(); // triggers emitted before this script ran
  window.addEventListener(TRIGGER_EVENT, processTriggers);
  for (const trigger of recordVisit(toNavSection(document.documentElement.dataset.section), lang)) emitTrigger(trigger);
  const onKonamiKey = createKonamiDetector(() => emitTrigger('konami'));
  window.addEventListener('keydown', onKonamiKey);

  // The reduced-motion flag follows <html data-motion> (MOTION_EVENT) and the OS setting, as useReducedMotionPref did.
  const unsubscribeMotion = subscribeMotion(() => set({ reduce: prefersReducedNow() }));

  // F-028: keep holding while a dialog is open.
  const syncDialog = () => set({ dialogOpen: document.querySelector('dialog[open]') !== null });
  const mo = new MutationObserver(syncDialog);
  mo.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['open'] });
  syncDialog(); // also runs the first commit (entrance hold)

  return () => {
    window.removeEventListener(TRIGGER_EVENT, processTriggers);
    window.removeEventListener('keydown', onKonamiKey);
    unsubscribeMotion();
    mo.disconnect();
    for (const { cleanup } of effects.values()) cleanup?.();
    effects.clear();
  };
}
