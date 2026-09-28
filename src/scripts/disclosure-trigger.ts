// src/scripts/disclosure-trigger.ts — side-effect module (no exports). Components include it with
// <script>import '../../scripts/disclosure-trigger';</script>. Every `<button aria-expanded aria-controls
// data-disclosure>` toggles the panel it names (the panel's `data-open` attribute) and, when the button also
// carries a `data-trigger` whose value is an AchievementTrigger, emits that trigger on open (e.g.
// data-trigger="open-abstract" on a paper's abstract button, P2-9). PaperLinks.astro includes it: the paper link
// row on /, /research/ and /records/ (final review fix 1 item 4 retired the <details>-based details-trigger.ts that
// the home highlight used).
//
// Fix round 1 item 7 (works without JS): the panel has no `hidden` attribute — a no-JS visitor simply reads the
// content inline, nothing is ever hidden from them. Fix round 2 item 5 (no open-then-collapse flash/CLS): the
// server now renders the button aria-expanded="false" to begin with, and the panel collapses *before first
// paint* via a CSS rule keyed on `html.js` + the absence of `data-open` (see PaperLinks.astro's `.pub__panel` rule)
// — this script only needs to bind the click handler, never to force an initial collapsed state itself, since
// the markup and the CSS already agree on it by the time this (deferred) module runs.
import { emitTrigger } from '../lib/achievements';
import { ACHIEVEMENT_TRIGGERS, type AchievementTrigger } from '../types';

function isTrigger(value: string | undefined): value is AchievementTrigger {
  return value !== undefined && (ACHIEVEMENT_TRIGGERS as readonly string[]).includes(value);
}

function bindDisclosureTriggers(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-disclosure]').forEach((button) => {
    if (button.hasAttribute('data-disclosure-bound')) return;
    const panel = document.getElementById(button.getAttribute('aria-controls') ?? '');
    if (!panel) return;
    button.setAttribute('data-disclosure-bound', '');
    button.addEventListener('click', () => {
      const open = button.getAttribute('aria-expanded') !== 'true';
      button.setAttribute('aria-expanded', String(open));
      if (open) panel.setAttribute('data-open', '');
      else panel.removeAttribute('data-open');
      const trigger = button.dataset.trigger;
      if (open && isTrigger(trigger)) emitTrigger(trigger);
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bindDisclosureTriggers, { once: true });
} else {
  bindDisclosureTriggers();
}
