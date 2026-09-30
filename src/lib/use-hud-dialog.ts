// src/lib/use-hud-dialog.ts — the HUD dialog shell (account-link spec §3.2, §3.6, §3.7; plan AL-11, DV-2).
// Written after ImageViewer's pattern (src/islands/ImageViewer.tsx: native <dialog> + showModal(), states
// closed | opening | open | closing, a named scroll lock, Esc through the cancel event, Tab trapped, focus returned on
// close). ImageViewer exports no hook and is not edited; this is a copy of its pattern, not a refactor.
// Two close rules differ from the viewer (spec §3.2):
//   - backdrop: closes only when BOTH pointerdown and click land on the <dialog> element itself (a drag that starts
//     in an input and ends outside does not close);
//   - a guard (setGuard; the management section's unsaved input, AL-20) can hold every close path.
// The caller renders the <dialog ref={dialogRef} data-state={state}> and puts data-initial-focus on the control that
// takes focus on open (the account dialog: its close button).
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { prefersReducedNow } from './motion-pref';
import { lockScroll, unlockScroll } from './scroll-lock';
import { playSfx } from './sound';
import { moduleOn } from './variant-runtime';

export type HudDialogState = 'closed' | 'opening' | 'open' | 'closing';
export type HudCloseReason = 'esc' | 'button' | 'backdrop';

export interface HudDialogOptions {
  /** The scroll-lock owner name (the account dialog: 'account-dialog'). */
  owner: string;
  /** Close animation length with full motion; the dialog closes natively when it ends. */
  closeMs: number;
  /** Close animation length under reduced motion (either path: the site toggle or the OS setting). */
  closeMsReduced: number;
  /** After the native close: the element that opened the dialog (the caller decides where focus returns). */
  onClosed?: (returnTo: HTMLElement | null) => void;
}

export interface HudDialog {
  state: HudDialogState;
  dialogRef: RefObject<HTMLDialogElement | null>;
  open(origin: HTMLElement): void;
  requestClose(reason: HudCloseReason): void;
  /** A guard that returns true holds the close (every path); null removes it. */
  setGuard(guard: (() => boolean) | null): void;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

function sfx(name: 'open' | 'close'): void {
  if (moduleOn('sfx')) void playSfx(name);
}

export function useHudDialog(opts: HudDialogOptions): HudDialog {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<HudDialogState>('closed');
  const stateRef = useRef<HudDialogState>('closed');
  stateRef.current = state;
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const returnTo = useRef<HTMLElement | null>(null);
  const guardRef = useRef<(() => boolean) | null>(null);
  const downOnSelf = useRef(false);
  const locked = useRef(false);

  const open = useCallback((origin: HTMLElement) => {
    if (stateRef.current !== 'closed') return;
    returnTo.current = origin;
    stateRef.current = 'opening';
    setState('opening');
  }, []);

  const requestClose = useCallback((_reason: HudCloseReason) => {
    const s = stateRef.current;
    if (s !== 'open' && s !== 'opening') return;
    if (guardRef.current?.()) return;
    stateRef.current = 'closing';
    setState('closing');
  }, []);

  const setGuard = useCallback((guard: (() => boolean) | null) => {
    guardRef.current = guard;
  }, []);

  // The native listeners: bound whenever the <dialog> element exists (the caller may render it only after mount).
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onCancel = (event: Event) => {
      event.preventDefault();
      requestClose('esc');
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        requestClose('esc');
        return;
      }
      if (event.key !== 'Tab') return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.closest('[inert]'));
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
    const onPointerDown = (event: Event) => {
      downOnSelf.current = event.target === dialog;
    };
    const onClick = (event: Event) => {
      const both = event.target === dialog && downOnSelf.current;
      downOnSelf.current = false;
      if (both) requestClose('backdrop');
    };
    const onClose = () => {
      if (locked.current) {
        unlockScroll(optsRef.current.owner);
        locked.current = false;
      }
      downOnSelf.current = false;
      stateRef.current = 'closed';
      setState('closed');
      sfx('close');
      const back = returnTo.current;
      returnTo.current = null;
      optsRef.current.onClosed?.(back);
    };
    dialog.addEventListener('cancel', onCancel);
    dialog.addEventListener('keydown', onKeyDown);
    dialog.addEventListener('pointerdown', onPointerDown);
    dialog.addEventListener('click', onClick);
    dialog.addEventListener('close', onClose);
    return () => {
      dialog.removeEventListener('cancel', onCancel);
      dialog.removeEventListener('keydown', onKeyDown);
      dialog.removeEventListener('pointerdown', onPointerDown);
      dialog.removeEventListener('click', onClick);
      dialog.removeEventListener('close', onClose);
    };
  });

  // opening: showModal, lock, first focus, sound; one frame later 'open' (the CSS fades in on that state).
  useEffect(() => {
    if (state !== 'opening') return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    if (!locked.current) {
      lockScroll(optsRef.current.owner);
      locked.current = true;
    }
    const initial = dialog.querySelector<HTMLElement>('[data-initial-focus]') ?? dialog.querySelector<HTMLElement>(FOCUSABLE);
    initial?.focus();
    sfx('open');
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        if (stateRef.current !== 'opening') return;
        stateRef.current = 'open';
        setState('open');
      });
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [state]);

  // closing: the CSS fades out on data-state="closing"; the native close follows after the close time.
  useEffect(() => {
    if (state !== 'closing') return;
    const ms = prefersReducedNow() ? optsRef.current.closeMsReduced : optsRef.current.closeMs;
    const timer = window.setTimeout(() => dialogRef.current?.close(), ms);
    return () => window.clearTimeout(timer);
  }, [state]);

  // unmount while open: never leave the page locked
  useEffect(
    () => () => {
      if (locked.current) {
        unlockScroll(optsRef.current.owner);
        locked.current = false;
      }
    },
    [],
  );

  return { state, dialogRef, open, requestClose, setGuard };
}
