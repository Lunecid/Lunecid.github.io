// The chooser desk (spec §6; motion plan amendment, MO-24). Two links, data (in front) then game: the arrows move
// between them on both axes (the files overlap at every width), Enter follows the focused link (native), and a choice
// is remembered (sb:variant, P1-14) before the navigation. Pointing at or focusing the game file slides the printout
// aside in CSS (:has, works without JS); this script measures where the sheet goes, and adds the touch rule: the first
// tap on the game file only reveals it (.is-aside), the second follows its link, a tap anywhere else (the aside sheet
// included) or Escape puts the sheet back. A hint (touch and JS only) says what the next tap does. Entering the game
// file inks and strikes its "기밀 해제" stamp (MO-25), then plays its exit, the waveform (MO-38), before the link is
// followed.
import exitSheet from '../styles/chooser-exit.css?url';
import { rememberVariant } from '../lib/variant-pref';
import { isVariantId } from '../variants/ids';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A click counts as the first tap only when its own touch pointerdown on the game file came this recently. */
const FIRST_TAP_MS = 600;

/**
 * Pure: where the sheet goes when it slides aside. Side by side (tablet and up) → to the right of the game cover, its
 * turned left edge clear of the cover by `gap`; stacked (phone) → below it, its highest turned corner clear by `gap`.
 * Boxes are untransformed offsets inside the desk: the tablet's body (bezel included) and the sheet.
 * `cx` centres the game cover on the desk while it plays alone (the opening, MO-26).
 */
export function asideGeometry(game: Box, sheet: Box, tiltDeg: number, asideDeg: number, gap = 24): { side: boolean; ax: number; ay: number; cx: number } {
  const side = sheet.x - game.x > 40;
  const th = ((tiltDeg + asideDeg) * Math.PI) / 180;
  const sin = Math.abs(Math.sin(th));
  const cos = Math.cos(th);
  if (side) {
    const spill = (sheet.h / 2) * sin - (sheet.w / 2) * (1 - cos);
    return { side, ax: Math.round(game.x + game.w + gap + spill - sheet.x), ay: 18, cx: Math.round((sheet.x + sheet.w - game.x - game.w) / 2) };
  }
  const spill = (sheet.w / 2) * sin - (sheet.h / 2) * (1 - cos);
  return { side, ax: 12, ay: Math.round(game.y + game.h + gap + spill - sheet.y), cx: 0 };
}

/** An element's untransformed layout box inside `root` (offsets summed up the offsetParent chain). */
const boxIn = (el: HTMLElement, root: HTMLElement): Box => {
  let x = 0;
  let y = 0;
  for (let e: HTMLElement | null = el; e && e !== root; e = e.offsetParent as HTMLElement | null) {
    x += e.offsetLeft;
    y += e.offsetTop;
  }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
};
const degrees = (value: string): number => parseFloat(value) || 0;
const matches = (query: string): boolean => {
  try {
    return window.matchMedia(query).matches;
  } catch {
    return false;
  }
};

/** How long each exit plays before the next page loads (ms): the game file's waveform (MO-38, the sum of its --x-*
 *  tokens), the general file's page turn (MO-39), and the reduced form of either (a 140 ms fade, --x-fade). */
export const EXIT_MS = { game: 880, data: 800, reduce: 150 } as const;
export type ExitKind = 'game' | 'data';

const reducedMotion = (): boolean => matches('(prefers-reduced-motion: reduce)') || document.documentElement.dataset.motion === 'reduce';
const plain = (e: MouseEvent): boolean => e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey;

/** Where the game exit's line leaves the screen and how far it must stretch to cross the page (four custom properties
 *  on the page layer, written once at the click). */
function lineGeometry(desk: HTMLElement, layer: HTMLElement | null): void {
  if (!layer) return;
  const screen = desk.querySelector<HTMLElement>('.file--game .dev__screen') ?? desk.querySelector<HTMLElement>('.file--game');
  const r = screen?.getBoundingClientRect();
  if (!r) return;
  const w = Math.max(1, r.width);
  const cx = r.left + w / 2;
  const vw = document.documentElement.clientWidth || window.innerWidth;
  layer.style.setProperty('--xl-x', `${Math.round(r.left)}px`);
  layer.style.setProperty('--xl-y', `${Math.round(r.top + r.height / 2 - 1)}px`);
  layer.style.setProperty('--xl-w', `${Math.round(w)}px`);
  layer.style.setProperty('--xl-k', ((2 * Math.max(cx, vw - cx)) / w + 0.05).toFixed(3));
}

/**
 * The exit of one link (MO-38): an unmodified primary activation that nothing else consumed (the first-tap rule calls
 * preventDefault first) remembers the choice and plays the exit: data-exit="game" on the desk (CSS keyframes; the
 * game file's stamp strikes first, at the press for mouse and pen, at the click for keyboard and assistive tech), or
 * data-exit="fade" under either reduced-motion path or forced colours; the page opens after EXIT_MS. Modified, middle
 * and repeated clicks stay native; while leaving, every other activation on the desk is ignored; a page restored from
 * the back/forward cache starts clean.
 */
export function initExit(desk: HTMLElement, link: HTMLAnchorElement, kind: ExitKind, opts: { stamp?: HTMLElement | null; reduced?: () => boolean; navigate?: (href: string) => void }): void {
  const navigate = opts.navigate ?? ((href: string) => window.location.assign(href));
  const reduced = opts.reduced ?? reducedMotion;
  const stamp = opts.stamp ?? null;
  const layer = document.querySelector<HTMLElement>('.xnav');
  const leaving = () => desk.hasAttribute('data-exit');
  const strike = () => {
    if (!stamp) return;
    stamp.classList.add('is-declassified');
    stamp.classList.remove('is-struck');
    if (reduced() || matches('(forced-colors: active)')) return;
    void stamp.offsetWidth; // restart the keyframes
    stamp.classList.add('is-struck');
  };
  if (stamp) {
    const face = link.closest('.file') ?? link;
    face.addEventListener('pointerdown', (e) => {
      const ev = e as PointerEvent;
      if (leaving() || (ev.pointerType !== 'mouse' && ev.pointerType !== 'pen') || !plain(ev)) return;
      if (ev.target instanceof Element && ev.target.closest('a') === link) strike();
    });
    // a stamp inked by a press that never became a click goes away with the next press elsewhere
    document.addEventListener('pointerdown', (e) => {
      if (!leaving() && !(e.target instanceof Element && e.target.closest('a') === link)) stamp.classList.remove('is-declassified', 'is-struck');
    }, { capture: true });
  }
  link.addEventListener('click', (e) => {
    if (e.defaultPrevented) return; // the first tap only revealed the file, or the desk is already leaving
    if (!plain(e) || e.detail > 1) return;
    e.preventDefault();
    const variant = link.dataset.chooseVariant;
    if (isVariantId(variant)) rememberVariant(variant);
    const fade = reduced() || matches('(forced-colors: active)');
    if (!stamp?.classList.contains('is-declassified')) strike();
    desk.dataset.exitTo = kind;
    desk.dataset.exit = fade ? 'fade' : kind;
    if (!fade && kind === 'game') {
      desk.classList.add('is-aside'); // the sheet makes way for the screen
      lineGeometry(desk, layer);
    }
    const href = link.getAttribute('href') ?? link.href;
    window.setTimeout(() => navigate(href), fade ? EXIT_MS.reduce : EXIT_MS[kind]);
  });
  window.addEventListener('pageshow', (e) => {
    if (!(e as PageTransitionEvent).persisted) return;
    delete desk.dataset.exit;
    delete desk.dataset.exitTo;
    desk.classList.remove('is-aside');
    stamp?.classList.remove('is-declassified', 'is-struck');
    layer?.removeAttribute('style');
  });
}

/** One wiring per desk (initChooser and a direct call share it). */
const wired = new WeakMap<HTMLElement, () => void>();

/** Wires the reveal on one desk; returns a cleanup. */
export function initDesk(desk: HTMLElement, hint: HTMLElement | null): () => void {
  const existing = wired.get(desk);
  if (existing) return existing;
  const gameFile = desk.querySelector<HTMLElement>('.file--game');
  const dataFile = desk.querySelector<HTMLElement>('.file--data');
  const gameLink = gameFile?.querySelector<HTMLAnchorElement>('a[data-choose-variant]');
  if (!gameFile || !dataFile || !gameLink) return () => {};
  const gameBody = gameFile.querySelector<HTMLElement>('.dev__body') ?? gameFile;
  const off: (() => void)[] = [];
  const on = (target: EventTarget, type: string, fn: (e: Event) => void, opts?: AddEventListenerOptions) => {
    target.addEventListener(type, fn, opts);
    off.push(() => target.removeEventListener(type, fn, opts));
  };

  const measure = () => {
    const st = getComputedStyle(desk);
    // the tablet's body (bezel included), not the article round it (MO-34)
    const g = asideGeometry(boxIn(gameBody, desk), boxIn(dataFile, desk), degrees(st.getPropertyValue('--tilt')), degrees(st.getPropertyValue('--arot')));
    desk.style.setProperty('--ax', `${g.ax}px`);
    desk.style.setProperty('--ay', `${g.ay}px`);
    desk.style.setProperty('--cx', `${g.cx}px`);
  };
  measure();
  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(() => measure());
    ro.observe(desk);
    off.push(() => ro.disconnect());
  } else on(window, 'resize', measure);

  // the hint: touch screens only (no hover, coarse pointer), filled by the script so it never shows without it
  const touchHint = hint !== null && matches('(hover: none)') && matches('(pointer: coarse)');
  const setAside = (aside: boolean) => {
    desk.classList.toggle('is-aside', aside);
    if (touchHint) hint.textContent = (aside ? hint.dataset.aside : hint.dataset.rest) ?? '';
  };
  setAside(false);

  // the first tap: this click's own touch pointerdown hit the game file while the sheet lay on it
  let armed: { at: number; wasAside: boolean } | null = null;
  on(gameFile, 'pointerdown', (e) => {
    armed = (e as PointerEvent).pointerType === 'touch' ? { at: performance.now(), wasAside: desk.classList.contains('is-aside') } : null;
  });
  on(dataFile, 'pointerdown', () => {
    armed = null;
  });
  on(gameLink, 'click', (e) => {
    const ev = e as MouseEvent;
    const tap = armed;
    armed = null;
    if (ev.detail > 0 && tap && !tap.wasAside && performance.now() - tap.at <= FIRST_TAP_MS) {
      ev.preventDefault();
      setAside(true);
    }
  });
  // a tap anywhere but the game file puts the sheet back (on the aside sheet without following its link)
  on(
    document,
    'click',
    (e) => {
      if (!desk.classList.contains('is-aside')) return;
      const target = e.target instanceof Element ? e.target : null;
      if (target && gameFile.contains(target)) return;
      if (target && dataFile.contains(target)) e.preventDefault();
      setAside(false);
    },
    { capture: true },
  );
  on(document, 'keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Escape' && desk.classList.contains('is-aside')) setAside(false);
  });
  const cleanup = () => {
    for (const fn of off.splice(0)) fn();
    wired.delete(desk);
  };
  wired.set(desk, cleanup);
  return cleanup;
}

/** The exits' sheet (looks and keyframes of the exit layers) is attached once the page has loaded: exits only follow a
 *  click, so their bytes stay out of the first render. */
export function attachExitSheet(doc: Document = document): void {
  if (doc.querySelector('link[data-chooser-exit]')) return;
  const add = () => {
    if (doc.querySelector('link[data-chooser-exit]')) return;
    const link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = exitSheet;
    link.dataset.chooserExit = '';
    doc.head.append(link);
  };
  if (doc.readyState === 'complete') add();
  else window.addEventListener('load', add, { once: true });
}

export function initChooser(root: ParentNode = document, opts: { navigate?: (href: string) => void } = {}): void {
  const container = root.querySelector<HTMLElement>('[data-chooser]');
  if (!container) return;
  const links = Array.from(container.querySelectorAll<HTMLAnchorElement>('a[data-choose-variant]'));
  const [first, second] = links;
  if (!first || !second || links.length !== 2) return;
  // the desk first: its first-tap rule must see the click before the memory does
  if (container.hasAttribute('data-desk')) initDesk(container, root.querySelector<HTMLElement>('.desk__hint'));
  container.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (!links.includes(document.activeElement as HTMLAnchorElement)) return;
    const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown';
    const back = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
    if (!forward && !back) return;
    event.preventDefault();
    (forward ? second : first).focus();
  });
  for (const link of links) {
    link.addEventListener('click', (event) => {
      if (event.defaultPrevented) return; // the first tap only reveals: not a choice
      const variant = link.dataset.chooseVariant;
      if (isVariantId(variant)) rememberVariant(variant);
    });
  }
  // while the desk is leaving, every other activation on it is ignored (capture: before the links' own listeners)
  container.addEventListener('click', (event) => {
    if (container.hasAttribute('data-exit') && event.target instanceof Element && event.target.closest('a')) event.preventDefault();
  }, { capture: true });
  attachExitSheet();
  const gameLink = links.find((l) => l.dataset.chooseVariant === 'game');
  if (gameLink) initExit(container, gameLink, 'game', { stamp: gameLink.closest('.file')?.querySelector<HTMLElement>('.stamp'), navigate: opts.navigate });
}
