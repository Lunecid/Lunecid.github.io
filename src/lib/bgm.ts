// src/lib/bgm.ts — BGM position and page-leave helpers (N20), moved unchanged from the former React island
// src/islands/BgmToggle.tsx (P1-9b, P-03): same names, signatures and values. The HUD BGM button
// (src/components/hud/BgmToggle.astro + src/scripts/bgm-toggle.ts) imports them from here. BGM_TIME_KEY must equal
// STORAGE_KEYS.bgmTime once P1-14 adds it (contract §1.9).

export const BGM_VOLUME = 0.3,
  BGM_FADE_IN = 1.5,
  BGM_FADE_LOOP = 2.5,
  BGM_FADE_OUT = 0.3,
  /** Page-leave fade so a same-origin navigation is not an abrupt cut (N20 / F-027). */
  BGM_NAV_FADE_OUT = 0.25,
  /** Resume / remembered-on fade-in (N20). */
  BGM_RESUME_FADE_IN = 0.6,
  BGM_TIME_MAX_AGE_MS = 30 * 60 * 1000;

export const BGM_TIME_KEY = 'sb:bgm-t';

export type BgmTimeSave = { t: number; at: number };

/** Persist playback position for cross-page resume. Errors ignored. */
export function saveBgmTime(t: number, at: number = Date.now(), storage: Storage | null = defaultSession()): void {
  if (!storage || !Number.isFinite(t) || t < 0) return;
  try {
    const payload: BgmTimeSave = { t, at };
    storage.setItem(BGM_TIME_KEY, JSON.stringify(payload));
  } catch {
    /* storage blocked */
  }
}

/**
 * Read a saved position. Returns null when missing, malformed, older than maxAge, or past the track length.
 * The track loops, so a value at/beyond duration is ignored (start from 0 on the next play instead).
 */
export function readBgmTime(
  now: number = Date.now(),
  duration?: number,
  storage: Storage | null = defaultSession(),
  maxAgeMs: number = BGM_TIME_MAX_AGE_MS,
): number | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(BGM_TIME_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BgmTimeSave>;
    if (typeof parsed.t !== 'number' || typeof parsed.at !== 'number') return null;
    if (!Number.isFinite(parsed.t) || parsed.t < 0 || !Number.isFinite(parsed.at)) return null;
    if (now - parsed.at > maxAgeMs) return null;
    if (duration != null && Number.isFinite(duration) && duration > 0 && parsed.t >= duration) return null;
    return parsed.t;
  } catch {
    return null;
  }
}

/** True when the event target is (inside) an anchor that navigates away from this page. */
export function isLeavingLink(target: EventTarget | null, loc: Pick<Location, 'href' | 'origin' | 'pathname' | 'search'> = location): boolean {
  const el = target as Element | null;
  if (!el || typeof el.closest !== 'function') return false;
  const anchor = el.closest('a[href]');
  if (!(anchor instanceof HTMLAnchorElement)) return false;
  const hrefAttr = anchor.getAttribute('href');
  if (!hrefAttr || hrefAttr.startsWith('javascript:')) return false;
  if (anchor.hasAttribute('download')) return true;
  if (anchor.target && anchor.target !== '_self') return true;
  try {
    const url = new URL(hrefAttr, loc.href);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return true;
    // Same document, hash-only: stay on the page.
    if (url.origin === loc.origin && url.pathname === loc.pathname && url.search === loc.search) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Same-origin full navigation that will unload this tab (N20 leave fade).
 * Excludes download, new-tab targets, and modified/non-primary clicks that keep the page open.
 */
export function isSameOriginLeave(
  target: EventTarget | null,
  loc: Pick<Location, 'href' | 'origin' | 'pathname' | 'search'> = location,
  event?: Pick<MouseEvent, 'button' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>,
): boolean {
  if (event) {
    if (event.button !== 0) return false;
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return false;
  }
  const el = target as Element | null;
  if (!el || typeof el.closest !== 'function') return false;
  const anchor = el.closest('a[href]');
  if (!(anchor instanceof HTMLAnchorElement)) return false;
  if (anchor.hasAttribute('download')) return false;
  if (anchor.target && anchor.target !== '_self') return false;
  const hrefAttr = anchor.getAttribute('href');
  if (!hrefAttr || hrefAttr.startsWith('javascript:')) return false;
  try {
    const url = new URL(hrefAttr, loc.href);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    if (url.origin !== loc.origin) return false;
    if (url.pathname === loc.pathname && url.search === loc.search) return false;
    return true;
  } catch {
    return false;
  }
}

function defaultSession(): Storage | null {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  } catch {
    return null;
  }
}
