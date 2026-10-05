// The chooser desk (spec §6; motion plan amendment, MO-24). Two links, data (in front) then game: the arrows move
// between them on both axes (the files overlap at every width), Enter follows the focused link (native), and a choice
// is remembered (sb:variant, P1-14) before the navigation. Pointing at or focusing the game file slides the printout
// aside in CSS (:has, works without JS); this script measures where the sheet goes, and adds the touch rule: the first
// tap on the game file only reveals it (.is-aside), the second follows its link, a tap anywhere else (the aside sheet
// included) or Escape puts the sheet back. A hint (touch and JS only) says what the next tap does. Entering the game
// file (MO-25) inks and strikes its "기밀 해제" stamp, then follows the link after ENTER_DELAY_MS.
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

/** The stamp's moment before the game page opens: the ring (--dur-strike-ring .42s) has spread; colour only under reduced motion. */
export const ENTER_DELAY_MS = { full: 440, reduce: 150 } as const;

const reducedMotion = (): boolean => matches('(prefers-reduced-motion: reduce)') || document.documentElement.dataset.motion === 'reduce';
const plain = (e: MouseEvent): boolean => e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey;

/**
 * An unmodified primary activation of the game link that nothing else consumed (the first-tap rule calls
 * preventDefault first) inks and strikes the stamp, remembers the choice and navigates after the delay. The strike
 * comes at the press for mouse and pen (instant feedback), at the click for keyboard and assistive tech. Modified,
 * middle and repeated clicks stay native; a second activation during the delay is ignored; a page restored from the
 * back/forward cache starts clean.
 */
export function initEnter(link: HTMLAnchorElement, stamp: HTMLElement, opts: { reduced: () => boolean; navigate?: (href: string) => void }): void {
  const navigate = opts.navigate ?? ((href: string) => window.location.assign(href));
  let pending = false;
  const strike = () => {
    stamp.classList.add('is-declassified');
    stamp.classList.remove('is-struck');
    if (opts.reduced()) return;
    void stamp.offsetWidth; // restart the keyframes
    stamp.classList.add('is-struck');
  };
  const face = link.closest('.file') ?? link;
  face.addEventListener('pointerdown', (e) => {
    const ev = e as PointerEvent;
    if (pending || (ev.pointerType !== 'mouse' && ev.pointerType !== 'pen') || !plain(ev)) return;
    if (ev.target instanceof Element && ev.target.closest('a') === link) strike();
  });
  link.addEventListener('click', (e) => {
    if (e.defaultPrevented) return; // the first tap only revealed the file
    if (pending) {
      e.preventDefault();
      return;
    }
    if (!plain(e) || e.detail > 1) return;
    e.preventDefault();
    pending = true;
    if (!stamp.classList.contains('is-declassified')) strike();
    const variant = link.dataset.chooseVariant;
    if (isVariantId(variant)) rememberVariant(variant);
    const href = link.getAttribute('href') ?? link.href;
    window.setTimeout(() => {
      pending = false;
      navigate(href);
    }, opts.reduced() ? ENTER_DELAY_MS.reduce : ENTER_DELAY_MS.full);
  });
  // a stamp inked by a press that never became a click goes away with the next press elsewhere
  document.addEventListener('pointerdown', (e) => {
    if (!pending && !(e.target instanceof Element && e.target.closest('a') === link)) stamp.classList.remove('is-declassified', 'is-struck');
  }, { capture: true });
  window.addEventListener('pageshow', (e) => {
    if (!(e as PageTransitionEvent).persisted) return;
    pending = false;
    stamp.classList.remove('is-declassified', 'is-struck');
    link.closest('.desk')?.classList.remove('is-aside');
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
  const gameLink = links.find((l) => l.dataset.chooseVariant === 'game');
  const stamp = gameLink?.closest('.file')?.querySelector<HTMLElement>('.stamp');
  if (gameLink && stamp) initEnter(gameLink, stamp, { reduced: reducedMotion, navigate: opts.navigate });
}
