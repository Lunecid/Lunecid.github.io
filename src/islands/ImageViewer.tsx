// Image viewer (figures + certificates): native <dialog> + showModal(), FLIP from thumbnail into a HUD frame,
// Esc / close / backdrop / browser Back close it. Triggers are plain links rendered by Astro anywhere:
//   <a href={fullSrc} data-viewer={group} data-viewer-w … data-viewer-h … aria-haspopup="dialog">
// Without JS (or before hydration) the link opens the WebP. Thumbnail clicks inside the same <figure> also open.
// History: pushState({ viewer, viewerPushed:true }, '', '#view-' + id); ←/→ replaceState; UI close history.back() once when owned.
import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { emitTrigger } from '../lib/achievements';
import { prefersReducedNow } from '../lib/motion-pref';
import { playSfx } from '../lib/sound';
import { lockScroll, unlockScroll } from '../lib/scroll-lock';
import './ImageViewer.css';

export interface ImageViewerLabels {
  dialog: string;
  close: string;
  previous: string;
  next: string;
  /** Template with {current} and {total}, e.g. '{current} / {total}'. */
  counter: string;
}

export interface ImageViewerProps {
  labels: ImageViewerLabels;
}

export type ViewerState = 'closed' | 'opening' | 'open' | 'closing' | 'navigating';

interface ViewerItem {
  id: string;
  group: string;
  src: string;
  srcSet: string | undefined;
  sizes: string | undefined;
  width: number;
  height: number;
  label: string;
  caption: string;
  alt: string;
  certId: string | undefined;
  trigger: HTMLElement;
}

type Shift = 'none' | 'next' | 'prev' | 'from-next' | 'from-prev';

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';
/** F-068 (P-11): = --dur-panel-out (.18s), shorter than the .3s open (--dur-panel-in). */
const CLOSE_MS = 180;
const CLOSE_MS_REDUCED = 150;
const NAV_MS = 180;
const HASH_PREFIX = '#view-';
const OWNER = 'image-viewer';
const DIALOG_PAD = 32;
/** Chrome row above the frame: ≥44px close + 12px gap + slack for caption fit (B6). */
const LABEL_STRIP = 64;
/** Extra top padding when a counter is shown (16 + --tap + 8 − base 16). */
const COUNTER_TOP_EXTRA = 52;
/** Fallback when the caption has not been measured yet (R8). */
const CAPTION_RESERVE_FALLBACK = 90;
/** Extra bottom reserve at narrow widths so caption clears relocated nav (R14). */
const NARROW_NAV_RESERVE = 60;
const NARROW_MQ = '(max-width: 733.98px)';

function reduced(): boolean {
  return prefersReducedNow();
}

function narrowViewport(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(NARROW_MQ).matches;
}

function captionReservePx(capPx: number | null | undefined): number {
  const base = capPx != null && capPx > 0 ? capPx : CAPTION_RESERVE_FALLBACK;
  return base + (narrowViewport() ? NARROW_NAV_RESERVE : 0);
}

function topReserve(hasCounter: boolean): number {
  return DIALOG_PAD + LABEL_STRIP + (hasCounter ? COUNTER_TOP_EXTRA : 0);
}

function findTriggerFromEventTarget(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const direct = target.closest<HTMLElement>('[data-viewer]');
  if (direct) return direct;
  const img = target.closest('figure img');
  if (!img) return null;
  const figure = img.closest('figure');
  return figure?.querySelector<HTMLElement>('[data-viewer]') ?? null;
}

function originEl(trigger: HTMLElement): HTMLElement {
  const figure = trigger.closest('figure');
  const img = figure?.querySelector('img');
  return img ?? trigger;
}

function originRect(trigger: HTMLElement): DOMRect {
  return originEl(trigger).getBoundingClientRect();
}

function originIsFigureImage(trigger: HTMLElement): boolean {
  const figure = trigger.closest('figure');
  return Boolean(figure?.querySelector('img'));
}

function itemId(trigger: HTMLElement, index: number): string {
  if (trigger.dataset.viewerId) return trigger.dataset.viewerId;
  if (trigger.dataset.certId) return trigger.dataset.certId;
  const href = trigger.getAttribute('href') ?? '';
  const file = href.split('/').pop() ?? '';
  const base = file.split('.')[0] ?? '';
  const cleaned = base.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '');
  return cleaned || `item-${index}`;
}

function readItems(): ViewerItem[] {
  const used = new Set<string>();
  return Array.from(document.querySelectorAll<HTMLElement>('[data-viewer]')).map((trigger, index) => {
    let id = itemId(trigger, index);
    if (used.has(id)) id = `item-${index}`;
    used.add(id);
    const w = Number(trigger.dataset.viewerW) || 1600;
    const h = Number(trigger.dataset.viewerH) || 900;
    return {
      id,
      group: trigger.dataset.viewer ?? 'figures',
      src: trigger.getAttribute('href') ?? '',
      srcSet: trigger.dataset.viewerSrcset,
      sizes: trigger.dataset.viewerSizes,
      width: w,
      height: h,
      label: trigger.dataset.viewerLabel ?? '',
      caption: trigger.dataset.viewerCaption ?? '',
      alt: trigger.dataset.viewerAlt ?? '',
      certId: trigger.dataset.certId,
      trigger,
    };
  });
}

function fitBox(
  w: number,
  h: number,
  capPx: number | null | undefined,
  hasCaption: boolean,
  hasCounter: boolean,
): { width: number; height: number } {
  const cap = hasCaption ? captionReservePx(capPx) : 24 + (narrowViewport() ? NARROW_NAV_RESERVE : 0);
  const reserve = topReserve(hasCounter) + cap;
  const maxW = Math.min(window.innerWidth * 0.92, w);
  const maxH = Math.min(window.innerHeight - reserve, h);
  const scale = Math.min(maxW / w, maxH / h, 1);
  return { width: Math.max(1, w * scale), height: Math.max(1, h * scale) };
}

function boxVars(item: ViewerItem, capPx?: number | null, hasCounter = false): CSSProperties {
  const hasCaption = Boolean(item.caption);
  const box = fitBox(item.width, item.height, capPx, hasCaption, hasCounter);
  const cap = hasCaption ? captionReservePx(capPx) : 24 + (narrowViewport() ? NARROW_NAV_RESERVE : 0);
  return {
    ['--viewer-ar' as string]: String(item.width / Math.max(item.height, 1)),
    ['--viewer-w-px' as string]: `${item.width}px`,
    ['--viewer-cap' as string]: hasCaption ? `${capPx ?? CAPTION_RESERVE_FALLBACK}px` : '24px',
    ['--viewer-reserve' as string]: `${topReserve(hasCounter) + cap}px`,
    ['--viewer-w' as string]: `${box.width}px`,
    ['--viewer-h' as string]: `${box.height}px`,
  };
}

function flipTransform(
  from: DOMRect,
  to: { left: number; top: number; width: number; height: number },
  uniform = false,
): string {
  const sx = from.width / Math.max(to.width, 1);
  const sy = from.height / Math.max(to.height, 1);
  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  const dy = from.top + from.height / 2 - (to.top + to.height / 2);
  if (uniform) {
    const s = Math.min(sx, sy);
    return `translate(${dx}px, ${dy}px) scale(${s})`;
  }
  return `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
}

function hashFor(id: string): string {
  return `${HASH_PREFIX}${id}`;
}

function idFromHash(hash: string | null | undefined): string | null {
  if (!hash || !hash.startsWith(HASH_PREFIX)) return null;
  const id = hash.slice(HASH_PREFIX.length);
  return id || null;
}

function historyViewerPushed(): boolean {
  return Boolean(
    history.state &&
      typeof history.state === 'object' &&
      (history.state as { viewerPushed?: unknown }).viewerPushed === true,
  );
}

function stripViewerFromState(state: unknown): unknown {
  if (!state || typeof state !== 'object') return state;
  const rest = Object.fromEntries(Object.entries(state as Record<string, unknown>).filter(([key]) => key !== 'viewer' && key !== 'viewerPushed'));
  return Object.keys(rest).length ? rest : null;
}

export default function ImageViewer({ labels }: ImageViewerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const mediaRef = useRef<HTMLDivElement>(null);
  const capRef = useRef<HTMLParagraphElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const shownCert = useRef(false);
  const closingViaHistory = useRef(false);
  const historyOwned = useRef(false);
  const ignoreNextPop = useRef(false);
  const closingStarted = useRef(false);
  const backPending = useRef(false);
  const navTimers = useRef<number[]>([]);
  const zoomRef = useRef({ scale: 1, x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchStart = useRef<{ dist: number; scale: number; x: number; y: number; mx: number; my: number } | null>(null);
  const panStart = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const lastTap = useRef(0);
  const lastPointerType = useRef<string>('mouse');
  const gesturePinched = useRef(false);
  const capHeight = useRef<number | null>(null);
  const itemsRef = useRef<ViewerItem[]>([]);
  const captionId = useId();

  const [item, setItem] = useState<ViewerItem | null>(null);
  const [groupItems, setGroupItems] = useState<ViewerItem[]>([]);
  const [index, setIndex] = useState(0);
  const [state, setState] = useState<ViewerState>('closed');
  const [placeholderSrc, setPlaceholderSrc] = useState<string | null>(null);
  const [fullReady, setFullReady] = useState(false);
  const [shift, setShift] = useState<Shift>('none');
  const [zoom, setZoom] = useState({ scale: 1, x: 0, y: 0 });
  const [stageStyle, setStageStyle] = useState<CSSProperties>({});
  const [flipMode, setFlipMode] = useState<'on' | 'off'>('on');

  const clearNavTimers = useCallback(() => {
    for (const id of navTimers.current) window.clearTimeout(id);
    navTimers.current = [];
  }, []);

  const resetZoom = useCallback(() => {
    zoomRef.current = { scale: 1, x: 0, y: 0 };
    setZoom({ scale: 1, x: 0, y: 0 });
  }, []);

  const syncZoomStyle = useCallback((next: { scale: number; x: number; y: number }) => {
    zoomRef.current = next;
    setZoom(next);
  }, []);

  const openItem = useCallback(
    (trigger: HTMLElement, { fromHash = false }: { fromHash?: boolean } = {}) => {
      const items = readItems();
      itemsRef.current = items;
      const found = items.find((entry) => entry.trigger === trigger) ?? items.find((entry) => entry.id === itemId(trigger, -1));
      if (!found || !found.src) return;
      const group = items.filter((entry) => entry.group === found.group);
      const idx = group.findIndex((entry) => entry.id === found.id);
      returnTo.current = trigger;
      shownCert.current = Boolean(found.certId);
      closingStarted.current = false;
      setGroupItems(group);
      setIndex(Math.max(0, idx));
      setItem(found);
      setFullReady(false);
      setShift('none');
      resetZoom();
      const figure = trigger.closest('figure');
      const thumb = figure?.querySelector('img');
      setPlaceholderSrc(thumb?.currentSrc || thumb?.src || null);

      const multiGroup = group.length > 1;
      const box = fitBox(found.width, found.height, capHeight.current, Boolean(found.caption), multiGroup);
      const origin = originRect(trigger);
      const uniform = !originIsFigureImage(trigger);
      const reduce = reduced();
      setFlipMode(reduce ? 'off' : 'on');
      const vars = boxVars(found, capHeight.current, multiGroup);

      if (reduce) {
        setStageStyle({
          ...vars,
          opacity: 0,
          transform: 'none',
        });
      } else {
        // Approximate final position (centred); refined after showModal in layout effect.
        const approx = {
          left: (window.innerWidth - box.width) / 2,
          top: (window.innerHeight - box.height) / 2,
          width: box.width,
          height: box.height,
        };
        setStageStyle({
          ...vars,
          transform: flipTransform(origin, approx, uniform),
          ...(uniform ? { opacity: 0.35 } : {}),
        });
      }

      setState('opening');

      if (!fromHash) {
        try {
          const url = `${location.pathname}${location.search}${hashFor(found.id)}`;
          history.pushState(
            { ...(typeof history.state === 'object' && history.state ? history.state : {}), viewer: found.id, viewerPushed: true },
            '',
            url,
          );
          historyOwned.current = true;
        } catch {
          historyOwned.current = false;
        }
      } else {
        historyOwned.current = historyViewerPushed();
      }
    },
    [resetZoom],
  );

  // Delegated clicks on [data-viewer] and figure thumbnails; modifier clicks keep native link behaviour.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const trigger = findTriggerFromEventTarget(event.target);
      if (!trigger?.dataset.viewer) return;
      const href = trigger.getAttribute('href');
      if (!href) return;
      event.preventDefault();
      openItem(trigger);
    };
    document.addEventListener('click', onClick);
    window.__sbViewerReady = true;
    let openedFromQueue = false;
    if (!window.__sbViewerLeaving) {
      const queued = window.__sbViewerQueue?.splice(0) ?? [];
      const lastQueued = queued[queued.length - 1];
      if (lastQueued) {
        openItem(lastQueued);
        openedFromQueue = true;
      }
    }
    if (!openedFromQueue) {
      const hashId = idFromHash(typeof location.hash === 'string' ? location.hash : '');
      if (hashId) {
        const match = readItems().find((entry) => entry.id === hashId);
        if (match) openItem(match.trigger, { fromHash: true });
      }
    }
    return () => {
      document.removeEventListener('click', onClick);
      window.__sbViewerReady = false;
    };
  }, [openItem]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (state !== 'opening' || !dialog || !item) return;
    if (!dialog.open) dialog.showModal();
    lockScroll(OWNER);
    closeRef.current?.focus();
    void playSfx('open');

    const stage = stageRef.current;
    const reduce = reduced();
    const uniform = !originIsFigureImage(item.trigger);
    const vars = boxVars(item, capHeight.current, groupItems.length > 1);

    let inner = 0;
    const outer = requestAnimationFrame(() => {
      if (stage && !reduce) {
        // Measure final rect with transform cleared so FLIP starts from the real thumbnail size (B1).
        stage.style.transition = 'none';
        stage.style.transform = 'none';
        if (uniform) stage.style.opacity = '1';
        const finalRect = stage.getBoundingClientRect();
        const origin = originRect(item.trigger);
        stage.style.transform = flipTransform(origin, finalRect, uniform);
        if (uniform) stage.style.opacity = '0.35';
        void stage.offsetWidth;
        stage.style.transition = '';
        setStageStyle({
          ...vars,
          transform: 'none',
          ...(uniform ? { opacity: 1 } : {}),
        });
      } else {
        setStageStyle({
          ...vars,
          opacity: 1,
          transform: 'none',
        });
      }
      inner = requestAnimationFrame(() => setState('open'));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [state, item, groupItems.length]);

  // Decode full image, then fade it in over the thumbnail placeholder (S2).
  useEffect(() => {
    if (!item?.src) return;
    const src = item.src;
    const srcSet = item.srcSet;
    const sizes = item.sizes;
    setFullReady(false);
    let cancelled = false;
    const img = new Image();
    img.src = src;
    if (srcSet) img.srcset = srcSet;
    if (sizes) img.sizes = sizes;
    const finish = () => {
      if (!cancelled) setFullReady(true);
    };
    if (typeof img.decode === 'function') {
      void img.decode().then(finish).catch(finish);
    } else {
      img.onload = finish;
      img.onerror = finish;
    }
    return () => {
      cancelled = true;
    };
  }, [item?.src, item?.srcSet, item?.sizes]);

  const finishClose = useCallback(() => {
    dialogRef.current?.close();
  }, []);

  const requestClose = useCallback(() => {
    closingStarted.current = true;
    clearNavTimers();
    setState((s) => {
      if (s !== 'open' && s !== 'opening' && s !== 'navigating') return s;
      return 'closing';
    });
  }, [clearNavTimers]);

  const closeFromUi = useCallback(() => {
    if (historyOwned.current && historyViewerPushed()) {
      if (closingViaHistory.current) return;
      closingViaHistory.current = true;
      backPending.current = true;
      history.back();
      // Environments that swallow popstate (or have nowhere to go back) still need the dialog to close.
      window.setTimeout(() => {
        if (!closingViaHistory.current) return;
        historyOwned.current = false;
        closingViaHistory.current = false;
        // Keep backPending true until onPopState or onClose so a late pop cannot double-back (R5).
        requestClose();
      }, 50);
      return;
    }
    requestClose();
  }, [requestClose]);

  useEffect(() => {
    if (state !== 'closing' || !item) return;
    const stage = stageRef.current;
    const reduce = reduced();
    const origin = originRect(item.trigger);
    const uniform = !originIsFigureImage(item.trigger);
    const onScreen =
      origin.bottom > 0 && origin.top < window.innerHeight && origin.right > 0 && origin.left < window.innerWidth;

    if (stage && !reduce) {
      if (onScreen) {
        const finalRect = stage.getBoundingClientRect();
        setFlipMode('on');
        setStageStyle((prev) => ({
          ...prev,
          transform: flipTransform(origin, finalRect, uniform),
          ...(uniform ? { opacity: 0.35 } : {}),
        }));
      } else {
        setFlipMode('off');
        setStageStyle((prev) => ({
          ...prev,
          opacity: 0,
          transform: 'scale(.96)',
        }));
      }
    } else {
      setStageStyle((prev) => ({ ...prev, opacity: 0, transform: 'none' }));
    }

    const timer = window.setTimeout(finishClose, reduce ? CLOSE_MS_REDUCED : CLOSE_MS);
    return () => window.clearTimeout(timer);
  }, [state, item, finishClose]);

  const onClose = () => {
    unlockScroll(OWNER);
    clearNavTimers();
    const wasCert = shownCert.current;
    const owned = historyViewerPushed();
    const pendingBack = backPending.current;
    setState('closed');
    setItem(null);
    setGroupItems([]);
    setPlaceholderSrc(null);
    setFullReady(false);
    resetZoom();
    historyOwned.current = false;
    closingViaHistory.current = false;
    closingStarted.current = false;
    // S4 / R5: back only when we still own the entry and closeFromUi has not already called back().
    if (owned && !pendingBack) {
      ignoreNextPop.current = true;
      history.back();
    } else if (!pendingBack && idFromHash(typeof location.hash === 'string' ? location.hash : '')) {
      // Direct `#view-<id>` loads never pushed a history entry; strip the hash so Esc doesn't leave a stale deep link.
      history.replaceState(stripViewerFromState(history.state), '', `${location.pathname}${location.search}`);
    }
    backPending.current = false;
    void playSfx('close');
    if (wasCert) emitTrigger('open-certificate');
    const back = returnTo.current;
    returnTo.current = null;
    shownCert.current = false;
    back?.focus();
  };

  // Browser Back / hash load / CloseWatcher cancel → popstate or dialog cancel.
  useEffect(() => {
    const onPopState = () => {
      if (ignoreNextPop.current) {
        ignoreNextPop.current = false;
        return;
      }
      backPending.current = false;
      const hashId = idFromHash(typeof location.hash === 'string' ? location.hash : '');
      if (hashId) {
        const match = readItems().find((entry) => entry.id === hashId);
        if (match && (!item || item.id !== hashId)) {
          openItem(match.trigger, { fromHash: true });
          return;
        }
      }
      if (state === 'closed' && !closingViaHistory.current) return;
      historyOwned.current = false;
      closingViaHistory.current = false;
      requestClose();
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [state, item, openItem, requestClose]);

  const goTo = useCallback(
    (nextIndex: number, direction: 'prev' | 'next') => {
      // Allow while still 'opening' so a fast ←/→ after open is not dropped (rAF may not have flipped to 'open' yet).
      if (state !== 'open' && state !== 'opening' && state !== 'navigating') return;
      if (nextIndex < 0 || nextIndex >= groupItems.length) return;
      const next = groupItems[nextIndex];
      if (!next) return;
      resetZoom();
      const reduce = reduced();
      clearNavTimers();
      setShift(reduce ? 'none' : direction);
      setState('navigating');
      setFullReady(false);
      // R7: keep the current placeholder until the swap so the outgoing image fades into empty space, not the next thumb.

      const swapDelay = reduce ? 0 : NAV_MS / 2;
      const t1 = window.setTimeout(() => {
        if (closingStarted.current) return;
        // R6: only retarget return focus once the visible item actually swaps.
        shownCert.current = Boolean(next.certId);
        returnTo.current = next.trigger;
        const figure = next.trigger.closest('figure');
        const thumb = figure?.querySelector('img');
        setPlaceholderSrc(thumb?.currentSrc || thumb?.src || null);
        setItem(next);
        setIndex(nextIndex);
        if (!reduce) {
          setShift(direction === 'next' ? 'from-next' : 'from-prev');
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              if (!closingStarted.current) setShift('none');
            });
          });
        } else {
          setShift('none');
        }
        setStageStyle((prev) => ({
          ...prev,
          ...boxVars(next, capHeight.current, groupItems.length > 1),
          transform: 'none',
        }));
        const url = `${location.pathname}${location.search}${hashFor(next.id)}`;
        // Keep viewerPushed if present; never claim ownership for a deep-link entry (B2).
        history.replaceState(
          { ...(typeof history.state === 'object' && history.state ? history.state : {}), viewer: next.id },
          '',
          url,
        );
        const t2 = window.setTimeout(() => {
          if (closingStarted.current) return;
          setState((s) => (s === 'navigating' ? 'open' : s));
        }, reduce ? 0 : NAV_MS);
        navTimers.current.push(t2);
      }, swapDelay);
      navTimers.current.push(t1);
    },
    [state, groupItems, resetZoom, clearNavTimers],
  );

  // B8: while open, arrows work from a document listener so focus on a disabled-looking nav still navigates.
  useEffect(() => {
    if (state !== 'open' && state !== 'opening' && state !== 'navigating') return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goTo(index - 1, 'prev');
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        goTo(index + 1, 'next');
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [state, index, goTo]);

  const clampPan = useCallback((scale: number, x: number, y: number) => {
    const media = mediaRef.current;
    if (!media || scale <= 1) return { scale: 1, x: 0, y: 0 };
    const maxX = ((scale - 1) * media.clientWidth) / 2;
    const maxY = ((scale - 1) * media.clientHeight) / 2;
    return {
      scale: Math.min(4, Math.max(1, scale)),
      x: Math.min(maxX, Math.max(-maxX, x)),
      y: Math.min(maxY, Math.max(-maxY, y)),
    };
  }, []);

  const zoomToward = useCallback(
    (nextScale: number, clientX: number, clientY: number) => {
      const media = mediaRef.current;
      const { scale: s, x, y } = zoomRef.current;
      const s2 = Math.min(4, Math.max(1, nextScale));
      if (s2 <= 1 || !media) return { scale: 1, x: 0, y: 0 };
      const rect = media.getBoundingClientRect();
      const px = clientX - (rect.left + rect.width / 2);
      const py = clientY - (rect.top + rect.height / 2);
      const denom = Math.max(s, 0.001);
      return clampPan(s2, x + ((x - px) * (s2 - s)) / denom, y + ((y - py) * (s2 - s)) / denom);
    },
    [clampPan],
  );

  // S6 / R8: re-clamp zoom / refresh box vars on resize; observe caption height for reserve.
  useEffect(() => {
    if (state !== 'open' && state !== 'navigating' && state !== 'opening') return;
    const applyCap = (height: number) => {
      capHeight.current = height + 12;
      if (!item) return;
      setStageStyle((prev) => ({
        ...prev,
        ...boxVars(item, capHeight.current, groupItems.length > 1),
        transform: prev.transform ?? 'none',
      }));
    };
    const onResize = () => {
      if (!item) return;
      const measured = capRef.current?.getBoundingClientRect().height;
      if (measured != null && measured > 0) applyCap(measured);
      else {
        setStageStyle((prev) => ({
          ...prev,
          ...boxVars(item, capHeight.current, groupItems.length > 1),
          transform: prev.transform ?? 'none',
        }));
      }
      const z = zoomRef.current;
      if (z.scale > 1) syncZoomStyle(clampPan(z.scale, z.x, z.y));
      else resetZoom();
    };
    window.addEventListener('resize', onResize);
    const cap = capRef.current;
    let ro: ResizeObserver | null = null;
    if (cap && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver((entries) => {
        const h = entries[0]?.contentRect.height ?? 0;
        if (h > 0) applyCap(h);
      });
      ro.observe(cap);
      const initial = cap.getBoundingClientRect().height;
      if (initial > 0) applyCap(initial);
    }
    return () => {
      window.removeEventListener('resize', onResize);
      ro?.disconnect();
    };
  }, [state, item, groupItems.length, resetZoom, syncZoomStyle, clampPan]);

  const onKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeFromUi();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (state !== 'open') return;
    lastPointerType.current = event.pointerType;
    if (typeof event.currentTarget.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      gesturePinched.current = true;
      const pts = [...pointers.current.values()];
      const dist = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
      const mx = (pts[0]!.x + pts[1]!.x) / 2;
      const my = (pts[0]!.y + pts[1]!.y) / 2;
      pinchStart.current = { dist, scale: zoomRef.current.scale, x: zoomRef.current.x, y: zoomRef.current.y, mx, my };
      panStart.current = null;
    } else if (zoomRef.current.scale > 1) {
      panStart.current = { x: event.clientX, y: event.clientY, ox: zoomRef.current.x, oy: zoomRef.current.y };
    } else {
      panStart.current = { x: event.clientX, y: event.clientY, ox: 0, oy: 0 };
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2 && pinchStart.current) {
      const pts = [...pointers.current.values()];
      const dist = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
      const mx = (pts[0]!.x + pts[1]!.x) / 2;
      const my = (pts[0]!.y + pts[1]!.y) / 2;
      const nextScale = pinchStart.current.scale * (dist / Math.max(pinchStart.current.dist, 1));
      syncZoomStyle(zoomToward(nextScale, mx, my));
      return;
    }
    if (panStart.current && zoomRef.current.scale > 1) {
      const dx = event.clientX - panStart.current.x;
      const dy = event.clientY - panStart.current.y;
      syncZoomStyle(clampPan(zoomRef.current.scale, panStart.current.ox + dx, panStart.current.oy + dy));
    }
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const hadPinch = pointers.current.size >= 2;
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) {
      pinchStart.current = null;
    }
    // S5: when dropping from 2 → 1 while zoomed, reseed pan from the remaining pointer.
    if (pointers.current.size === 1 && zoomRef.current.scale > 1) {
      const remaining = [...pointers.current.values()][0]!;
      panStart.current = { x: remaining.x, y: remaining.y, ox: zoomRef.current.x, oy: zoomRef.current.y };
      return;
    }
    if (pointers.current.size === 0) {
      const wasPan = panStart.current;
      panStart.current = null;
      // R1/B4: after a pinch, the last finger lift must not seed a double-tap.
      if (gesturePinched.current || hadPinch) {
        gesturePinched.current = false;
        lastTap.current = 0;
        return;
      }
      const now = performance.now();
      const dx = wasPan ? event.clientX - wasPan.x : 0;
      const dy = wasPan ? event.clientY - wasPan.y : 0;
      const moved = wasPan && (Math.abs(dx) > 8 || Math.abs(dy) > 8);

      // B3: swipe check runs when the finger actually moved.
      if (moved && zoomRef.current.scale === 1 && Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
        goTo(index + (dx < 0 ? 1 : -1), dx < 0 ? 'next' : 'prev');
        lastTap.current = 0;
        return;
      }

      // B4: double-tap zoom only for non-mouse; mouse uses onDoubleClick.
      if (!moved && event.pointerType !== 'mouse' && now - lastTap.current < 300) {
        const next =
          zoomRef.current.scale > 1 ? { scale: 1, x: 0, y: 0 } : zoomToward(2, event.clientX, event.clientY);
        syncZoomStyle(next);
        lastTap.current = 0;
      } else if (!moved) {
        lastTap.current = now;
      }
    }
  };

  const onDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    // R1/R12: Chrome synthesizes dblclick after touch double-tap; only mouse owns this path.
    if (lastPointerType.current !== 'mouse') return;
    const next =
      zoomRef.current.scale > 1 ? { scale: 1, x: 0, y: 0 } : zoomToward(2, event.clientX, event.clientY);
    syncZoomStyle(next);
  };

  const multi = groupItems.length > 1;
  const counterText = labels.counter.replace('{current}', String(index + 1)).replace('{total}', String(groupItems.length));
  const atStart = index <= 0;
  const atEnd = index >= groupItems.length - 1;
  const mediaZoomStyle = {
    ['--zx' as string]: `${zoom.x}px`,
    ['--zy' as string]: `${zoom.y}px`,
    ['--zs' as string]: String(zoom.scale),
    background: placeholderSrc ? undefined : 'var(--hud-bg)',
  } as CSSProperties;

  return (
    <dialog
      ref={dialogRef}
      className="image-viewer"
      data-state={state}
      aria-label={labels.dialog}
      aria-describedby={item?.caption ? captionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        closeFromUi();
      }}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) closeFromUi();
      }}
      onKeyDown={onKeyDown}
    >
      {item && (
        <div className="image-viewer__column">
          <div className="image-viewer__chrome">
            {item.label ? <p className="image-viewer__strip">{item.label}</p> : <span className="image-viewer__chrome-spacer" />}
            <button
              ref={closeRef}
              type="button"
              className="image-viewer__close cut cut--line"
              style={{ ['--c' as string]: '8px', ['--cut-line' as string]: 'var(--accent)', ['--cut-fill' as string]: 'var(--hud-bg)' }}
              onClick={closeFromUi}
              aria-label={labels.close}
            >
              <span className="image-viewer__close-x" aria-hidden="true">
                ×
              </span>
              <span className="image-viewer__close-label" aria-hidden="true">
                {labels.close}
              </span>
            </button>
          </div>
          <div ref={stageRef} className="image-viewer__stage" data-flip={flipMode} style={stageStyle}>
            <div className="image-viewer__frame" aria-hidden="true">
              <span className="image-viewer__corner image-viewer__corner--tl" />
              <span className="image-viewer__corner image-viewer__corner--tr" />
              <span className="image-viewer__corner image-viewer__corner--bl" />
              <span className="image-viewer__corner image-viewer__corner--br" />
            </div>
            <div
              ref={mediaRef}
              className="image-viewer__media"
              style={mediaZoomStyle}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onDoubleClick={onDoubleClick}
            >
              <div className="image-viewer__slide" data-shift={shift === 'none' ? undefined : shift}>
                {placeholderSrc && (
                  <img className="image-viewer__placeholder" src={placeholderSrc} alt="" aria-hidden="true" draggable={false} />
                )}
                <img
                  key={item.id}
                  className="image-viewer__img"
                  src={item.src}
                  srcSet={item.srcSet}
                  sizes={item.sizes}
                  width={item.width}
                  height={item.height}
                  alt={item.alt}
                  decoding="async"
                  draggable={false}
                  data-ready={fullReady ? 'true' : 'false'}
                />
              </div>
            </div>
          </div>
          {item.caption && (
            <p id={captionId} ref={capRef} className="image-viewer__cap">
              {item.caption}
            </p>
          )}
        </div>
      )}
      {multi && (
        <>
          <button
            type="button"
            className="image-viewer__nav image-viewer__nav--prev cut cut--line"
            aria-label={labels.previous}
            aria-disabled={atStart ? 'true' : undefined}
            onClick={() => goTo(index - 1, 'prev')}
          >
            <span aria-hidden="true">‹</span>
          </button>
          <button
            type="button"
            className="image-viewer__nav image-viewer__nav--next cut cut--line"
            aria-label={labels.next}
            aria-disabled={atEnd ? 'true' : undefined}
            onClick={() => goTo(index + 1, 'next')}
          >
            <span aria-hidden="true">›</span>
          </button>
          <p className="image-viewer__counter" role="status" aria-live="polite">
            {counterText}
          </p>
        </>
      )}
    </dialog>
  );
}
