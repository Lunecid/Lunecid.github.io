// Certificate modal (spec §5 상장 모달, mockup-port §7): native <dialog> + showModal(), blurred backdrop,
// Esc / close button / backdrop click close it, Tab stays inside, focus returns to the trigger.
// Triggers are plain links rendered by Astro anywhere on the page:
//   <a href={cert.fullSrc} data-cert-id={id} aria-haspopup="dialog">상장 보기</a>
// Without JS (or before hydration) the link simply opens the 1280w WebP. No motion import: CSS transitions.
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { CertificateId } from '../types';
import { emitTrigger } from '../lib/achievements';
import { prefersReducedNow } from '../lib/motion-pref';
import { playSfx } from '../lib/sound';
import { lockScroll, unlockScroll } from '../lib/scroll-lock';
import './CertificateModal.css';

export interface Certificate {
  id: CertificateId;
  src: string;
  srcSet: string;
  sizes: string;
  width: number;
  height: number;
  alt: string;
  caption: string;
  fullSrc: string;
}

export interface CertificateModalProps {
  certificates: Certificate[];
  labels: { dialog: string; close: string };
}

export type ModalState = 'closed' | 'opening' | 'open' | 'closing';

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';
const CLOSE_MS = 250;
const CLOSE_MS_REDUCED = 150;

export default function CertificateModal({ certificates, labels }: CertificateModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const [cert, setCert] = useState<Certificate | null>(null);
  const [state, setState] = useState<ModalState>('closed');

  // Delegated plain left clicks on [data-cert-id]; modifier clicks (Ctrl/Cmd/Shift/Alt) keep the browser's link behaviour.
  // P2-13: window.__sbCertReady / __sbCertQueue (src/lib/cert-queue.ts, inlined in <head>) queue a click that lands
  // before this effect runs; once it does, we take over from that inline listener and replay the last queued one.
  useEffect(() => {
    const openFor = (trigger: HTMLElement): void => {
      const found = certificates.find((c) => c.id === trigger.dataset.certId);
      if (!found) return;
      returnTo.current = trigger;
      setCert(found);
      setState('opening');
    };
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target : null;
      const trigger = target?.closest<HTMLElement>('[data-cert-id]') ?? null;
      if (!trigger) return;
      // Only claim the click once it names a real certificate: an unknown id is left alone (the browser's own
      // link behaviour), same as before the pre-hydration queue (P2-13) existed.
      if (!certificates.some((c) => c.id === trigger.dataset.certId)) return;
      event.preventDefault();
      openFor(trigger);
    };
    document.addEventListener('click', onClick);
    window.__sbCertReady = true;
    // Fix round 3 item 2: __sbCertLeaving (src/lib/cert-queue.ts) is set once any queued click's ~3s fallback has
    // already committed to navigating the whole page away — at that point nothing queued should ever be replayed
    // (a repeated tap on the same trigger, or an entirely different second trigger queued just before the first
    // one's fallback fired, would otherwise still open the modal for a flash right before/after that navigation).
    // Fix round 4 item 2: the flag covers only taps queued BEFORE it was set (the fallback emptied the queue in the
    // same tick). cert-queue.ts clears it again on the next tap and on a bfcache restore, so a tap made after an
    // aborted fallback navigation or a Back is replayed here normally instead of being swallowed.
    if (!window.__sbCertLeaving) {
      const queued = window.__sbCertQueue?.splice(0) ?? [];
      const lastQueued = queued[queued.length - 1];
      if (lastQueued) openFor(lastQueued);
    }
    return () => {
      document.removeEventListener('click', onClick);
      window.__sbCertReady = false;
    };
  }, [certificates]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (state !== 'opening' || !dialog) return;
    if (!dialog.open) dialog.showModal();
    // Fix round 1 minor: locked by name (src/lib/scroll-lock.ts) — HudNav's own resize-to-desktop auto-close
    // must never strip this lock out from under the still-open dialog.
    lockScroll('cert-modal');
    closeRef.current?.focus();
    void playSfx('open');
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setState('open'));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [state]);

  const close = useCallback(() => {
    setState((s) => (s === 'open' || s === 'opening' ? 'closing' : s));
  }, []);

  useEffect(() => {
    if (state !== 'closing') return;
    const timer = window.setTimeout(() => dialogRef.current?.close(), prefersReducedNow() ? CLOSE_MS_REDUCED : CLOSE_MS);
    return () => window.clearTimeout(timer);
  }, [state]);

  // Fires for every close path (our timer, or a browser-forced close).
  // P2-2 (controller ruling 1): open-certificate fires here, not on open, so its achievement toast never races
  // with the open <dialog> (the dialog is native top-layer and would otherwise bury the toast for its whole run).
  const onClose = () => {
    unlockScroll('cert-modal');
    setState('closed');
    setCert(null);
    void playSfx('close');
    emitTrigger('open-certificate');
    const back = returnTo.current;
    returnTo.current = null;
    back?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
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

  return (
    <dialog
      ref={dialogRef}
      className="cert-modal"
      data-state={state}
      aria-label={labels.dialog}
      aria-describedby={cert ? 'cert-modal-cap' : undefined}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      onKeyDown={onKeyDown}
    >
      <button ref={closeRef} type="button" className="cert-modal__close" onClick={close} aria-label={labels.close}>
        <span aria-hidden="true">×</span>
      </button>
      {cert && (
        <figure className="cert-modal__figure">
          <img src={cert.src} srcSet={cert.srcSet} sizes={cert.sizes} width={cert.width} height={cert.height} alt={cert.alt} decoding="async" />
          <figcaption id="cert-modal-cap" className="cert-modal__cap">
            {cert.caption}
          </figcaption>
        </figure>
      )}
    </dialog>
  );
}
