// src/islands/AchievementHost.tsx — one per page (BaseLayout, client:idle). Drains triggers queued before hydration,
// listens for new ones, records the section/language visit, watches for the Konami code, and shows one toast per
// newly unlocked achievement: 0.3 s in / 0.2 s out, none of either under reduced motion (the toast simply
// appears/disappears, controller ruling 1 — fix round 1 removed the vestigial 0.15 s reduced-motion out-fade this
// comment used to describe), auto-dismiss after TOAST_MS, paused while hovered or focused. CSS animations only
// (no motion import) to keep every page light.
import { useCallback, useEffect, useState } from 'react';
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
import { useReducedMotionPref } from '../lib/motion-pref';
import './AchievementHost.css';

export interface AchievementHostProps {
  lang: Lang;
  defs: AchievementDef[];
  /** unlocked is not a prop: the toast kicker is the fixed HUD caption "ACHIEVEMENT UNLOCKED" (controller ruling 1). */
  labels: { region: string; close: string };
}

export const TOAST_MS = 6000;
const OUT_MS = 200;

export default function AchievementHost({ lang, defs, labels }: AchievementHostProps) {
  const reduce = useReducedMotionPref();
  const [queue, setQueue] = useState<string[]>([]);
  const [leaving, setLeaving] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const processTriggers = () => {
      const fresh: string[] = [];
      for (const trigger of drainTriggers()) {
        for (const id of idsForTrigger(defs, trigger)) {
          if (unlock(id)) fresh.push(id);
        }
      }
      if (fresh.length > 0) setQueue((q) => [...q, ...fresh]);
    };
    processTriggers(); // triggers emitted before hydration
    window.addEventListener(TRIGGER_EVENT, processTriggers);
    for (const trigger of recordVisit(toNavSection(document.documentElement.dataset.section), lang)) emitTrigger(trigger);
    const onKeyDown = createKonamiDetector(() => emitTrigger('konami'));
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener(TRIGGER_EVENT, processTriggers);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [defs, lang]);

  const current = queue[0];
  const def = current === undefined ? undefined : defs.find((d) => d.id === current);
  const dismiss = useCallback(() => setLeaving(true), []);

  useEffect(() => {
    if (current === undefined || paused || leaving) return;
    const timer = window.setTimeout(dismiss, TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [current, paused, leaving, dismiss]);

  useEffect(() => {
    if (!leaving) return;
    const clear = () => {
      setQueue((q) => q.slice(1));
      setLeaving(false);
      setPaused(false);
    };
    // Fix round 1 minor: reduced motion plays no exit animation at all (controller ruling 1: "none under reduced
    // motion", see AchievementHost.css) — the OUT_MS wait existed only to let that animation finish, so waiting
    // for it under reduced motion just left the dismissed toast frozen on screen for 150ms doing nothing.
    if (reduce) {
      clear();
      return;
    }
    const timer = window.setTimeout(clear, OUT_MS);
    return () => window.clearTimeout(timer);
  }, [leaving, reduce]);

  return (
    <div className="ach-toast-region" role="status" aria-live="polite" aria-atomic="true" aria-label={labels.region}>
      {def && (
        <div
          key={def.id}
          className="ach-toast cut cut--line"
          data-state={leaving ? 'out' : 'in'}
          onPointerEnter={() => setPaused(true)}
          onPointerLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
        >
          <span className="ach-toast__mark" aria-hidden="true">◆</span>
          <div className="ach-toast__body">
            <p className="ach-toast__kicker" lang="en">ACHIEVEMENT UNLOCKED</p>
            <p className="ach-toast__text">{def.title[lang]} — {def.description[lang]}</p>
          </div>
          <button type="button" className="ach-toast__close hit" aria-label={labels.close} onClick={dismiss}>
            <span aria-hidden="true">×</span>
          </button>
        </div>
      )}
    </div>
  );
}
