import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import CertificateModal, { type Certificate } from '../../src/islands/CertificateModal';
import { TRIGGER_EVENT } from '../../src/lib/achievements';
import { CERT_QUEUE_SCRIPT } from '../../src/lib/cert-queue';

const CERT: Certificate = {
  id: 'busan-mayor-award',
  src: '/_astro/busan.960w.webp',
  srcSet: '/_astro/busan.640w.webp 640w, /_astro/busan.960w.webp 960w',
  sizes: '(orientation: portrait) 88vw, 58vh',
  width: 1600,
  height: 2262,
  alt: '2025 Big Data 활용 대회 빅데이터 분석 부문 최우수상 상장',
  caption: '최우수상(부산광역시장상) · 2025 Big Data 활용 대회 · 빅데이터 분석 부문',
  fullSrc: '#full-busan',
};
const LABELS = { dialog: '상장', close: '닫기' };

beforeAll(() => {
  // jsdom has no working showModal()/close(); emulate the parts the island relies on.
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    writable: true,
    value(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    writable: true,
    value(this: HTMLDialogElement) {
      if (!this.hasAttribute('open')) return;
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    },
  });
});

beforeEach(() => {
  delete window.__sbTriggers;
  delete window.__sbCertReady;
  delete window.__sbCertQueue;
  delete window.__sbCertLeaving;
  document.documentElement.classList.remove('is-scroll-locked');
});

/** Runs the real inline queue script (src/lib/cert-queue.ts) as BaseLayout's <head> would, and returns a function
 * that removes the listeners it added (otherwise each run leaves a document click + window pageshow listener
 * behind for every later test in this file). */
function installCertQueue(): () => void {
  const onDocument = vi.spyOn(document, 'addEventListener');
  const onWindow = vi.spyOn(window, 'addEventListener');
  const added: Array<() => void> = [];
  try {
    new Function(CERT_QUEUE_SCRIPT)();
  } finally {
    for (const [type, fn, options] of onDocument.mock.calls) if (fn) added.push(() => document.removeEventListener(type, fn, options));
    for (const [type, fn, options] of onWindow.mock.calls) if (fn) added.push(() => window.removeEventListener(type, fn, options));
    onDocument.mockRestore();
    onWindow.mockRestore();
  }
  return () => added.forEach((remove) => remove());
}

/** A plain primary click, dispatched directly (userEvent would await real timers, which are faked here). */
function tap(el: Element): void {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
}

function setup() {
  const user = userEvent.setup();
  render(
    <>
      <a href={CERT.fullSrc} data-cert-id={CERT.id} aria-haspopup="dialog">
        상장 보기
      </a>
      <a href="#other" data-cert-id="cds-encouragement-award" aria-haspopup="dialog">
        다른 상장
      </a>
      <CertificateModal certificates={[CERT]} labels={LABELS} />
    </>,
  );
  const trigger = screen.getByRole('link', { name: '상장 보기' });
  const dialog = document.querySelector<HTMLDialogElement>('dialog.cert-modal');
  if (!dialog) throw new Error('dialog not rendered');
  return { user, trigger, dialog };
}

describe('CertificateModal', () => {
  it('plain click on [data-cert-id] opens the dialog and focuses close', async () => {
    const { user, trigger, dialog } = setup();
    expect(dialog).not.toHaveAttribute('open');
    expect(dialog).toHaveAttribute('data-state', 'closed');
    await user.click(trigger);
    expect(dialog).toHaveAttribute('open');
    expect(screen.getByRole('button', { name: LABELS.close })).toHaveFocus();
    expect(screen.getByRole('img', { name: CERT.alt })).toHaveAttribute('src', CERT.src);
    expect(screen.getByText(CERT.caption)).toBeInTheDocument();
    expect(document.documentElement).toHaveClass('is-scroll-locked');
    await waitFor(() => expect(dialog).toHaveAttribute('data-state', 'open'));
  });

  it('modifier click follows the link', () => {
    const { trigger, dialog } = setup();
    const notPrevented = fireEvent.click(trigger, { ctrlKey: true });
    expect(notPrevented).toBe(true);
    expect(dialog).not.toHaveAttribute('open');
  });

  it('a trigger without a known certificate is left alone', () => {
    const { dialog } = setup();
    const notPrevented = fireEvent.click(screen.getByRole('link', { name: '다른 상장' }));
    expect(notPrevented).toBe(true);
    expect(dialog).not.toHaveAttribute('open');
  });

  it('Esc closes and returns focus to the trigger', async () => {
    const { user, trigger, dialog } = setup();
    await user.click(trigger);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(dialog).not.toHaveAttribute('open'));
    expect(trigger).toHaveFocus();
    expect(dialog).toHaveAttribute('data-state', 'closed');
    expect(document.documentElement).not.toHaveClass('is-scroll-locked');
  });

  it('Tab wraps inside the dialog', async () => {
    const { user, trigger } = setup();
    await user.click(trigger);
    const close = screen.getByRole('button', { name: LABELS.close });
    expect(close).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();
    await user.tab({ shift: true });
    expect(close).toHaveFocus();
  });

  it('backdrop click closes', async () => {
    const { user, trigger, dialog } = setup();
    await user.click(trigger);
    fireEvent.click(screen.getByRole('img', { name: CERT.alt }));
    expect(dialog).not.toHaveAttribute('data-state', 'closing');
    fireEvent.click(dialog);
    expect(dialog).toHaveAttribute('data-state', 'closing');
    await waitFor(() => expect(dialog).not.toHaveAttribute('open'));
    expect(trigger).toHaveFocus();
  });

  it('closing (not opening) emits open-certificate, so its toast never races the open dialog (P2-2)', async () => {
    const seen: string[] = [];
    const onTrigger = (event: Event) => seen.push((event as CustomEvent<{ trigger: string }>).detail.trigger);
    window.addEventListener(TRIGGER_EVENT, onTrigger);
    try {
      const { user, trigger, dialog } = setup();
      await user.click(trigger);
      expect(dialog).toHaveAttribute('open');
      expect(seen, 'nothing emitted while the dialog is still open').toEqual([]);
      await user.keyboard('{Escape}');
      await waitFor(() => expect(dialog).not.toHaveAttribute('open'));
      expect(seen).toEqual(['open-certificate']);
      expect(window.__sbTriggers).toContain('open-certificate');
    } finally {
      window.removeEventListener(TRIGGER_EVENT, onTrigger);
    }
  });

  it('marks the pre-hydration queue ready once mounted', () => {
    delete window.__sbCertReady;
    delete window.__sbCertQueue;
    setup();
    expect(window.__sbCertReady).toBe(true);
  });

  it('replays a certificate click queued before the island hydrated (P2-13)', async () => {
    delete window.__sbCertReady;
    render(
      <a href={CERT.fullSrc} data-cert-id={CERT.id} aria-haspopup="dialog">
        상장 보기
      </a>,
    );
    const trigger = screen.getByRole('link', { name: '상장 보기' });
    window.__sbCertQueue = [trigger];
    render(<CertificateModal certificates={[CERT]} labels={LABELS} />);
    const dialog = document.querySelector<HTMLDialogElement>('dialog.cert-modal');
    if (!dialog) throw new Error('dialog not rendered');
    await waitFor(() => expect(dialog).toHaveAttribute('open'));
    expect(screen.getByRole('button', { name: LABELS.close })).toHaveFocus();
    expect(window.__sbCertQueue).toEqual([]);
    await userEvent.setup().keyboard('{Escape}');
    await waitFor(() => expect(dialog).not.toHaveAttribute('open'));
    expect(trigger, 'focus returns to the queued trigger, same as a live click').toHaveFocus();
  });

  it('fix round 3 item 2 / fix round 4 item 3: staggered pre-hydration taps (A at 0 s, B at +2 s) — an island mounting after A\'s fallback opens no modal', async () => {
    // Exercises the real inline script (src/lib/cert-queue.ts), not a hand-seeded queue. Fix round 3's version
    // tapped A and B at the same fake instant, so both ~3s timers fired together and even fix round 2's code (which
    // only removed each timed-out trigger from the queue by reference) ended up with an empty queue: that test told
    // the two apart only through a __sbCertLeaving assertion, never through what the user sees. Here B is tapped
    // 2 s after A, so when A's fallback commits to navigating B still has 2 s left on its own timer, and the island
    // mounts in that gap. Fix round 2 replays B there (it left B in the queue) and opens the modal on a page that is
    // already navigating away; the fixed code opens nothing. Asserted through showModal and the dialog only.
    vi.useFakeTimers();
    const originalLocation = window.location;
    const stub = { href: '' };
    Object.defineProperty(window, 'location', { value: stub, writable: true, configurable: true });
    let uninstall = (): void => {};
    try {
      delete window.__sbCertReady;
      delete window.__sbCertQueue;
      delete window.__sbCertLeaving;
      uninstall = installCertQueue();
      const showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal');

      render(
        <>
          <a href="#cert-a" data-cert-id={CERT.id} aria-haspopup="dialog">
            상장 보기 A
          </a>
          <a href="#cert-b" data-cert-id={CERT.id} aria-haspopup="dialog">
            상장 보기 B
          </a>
        </>,
      );
      const triggerA = screen.getByRole('link', { name: '상장 보기 A' });
      const triggerB = screen.getByRole('link', { name: '상장 보기 B' });

      tap(triggerA); // t = 0 s, before the island hydrates (a slow phone)
      vi.advanceTimersByTime(2000);
      tap(triggerB); // t = 2 s, still before hydration
      vi.advanceTimersByTime(1000); // t = 3 s: A's fallback fires and starts navigating to A's image
      expect(stub.href).toBe('#cert-a');

      vi.advanceTimersByTime(500); // t = 3.5 s: the island's chunk finally arrives; B's timer is 1.5 s away
      render(<CertificateModal certificates={[CERT]} labels={LABELS} />);
      const dialog = document.querySelector<HTMLDialogElement>('dialog.cert-modal');
      if (!dialog) throw new Error('dialog not rendered');
      await vi.advanceTimersByTimeAsync(0);
      expect(showModal, 'no modal opens once a fallback has fired').not.toHaveBeenCalled();
      expect(dialog).not.toHaveAttribute('open');

      await vi.advanceTimersByTimeAsync(2000); // t = 5.5 s: B's own timer has fired too (island ready: it returns)
      expect(showModal).not.toHaveBeenCalled();
      expect(dialog).not.toHaveAttribute('open');
      expect(stub.href, "still just A's navigation, nothing on top of it").toBe('#cert-a');
    } finally {
      uninstall();
      vi.restoreAllMocks();
      Object.defineProperty(window, 'location', { value: originalLocation, writable: true, configurable: true });
      vi.useRealTimers();
    }
  });

  describe('fix round 4 item 2: a pre-hydration tap made after the page stayed (or came back) is never swallowed', () => {
    // Fix round 3's __sbCertLeaving used to stay set for the rest of the document's life once any fallback fired:
    // after a bfcache Back (the same document, JS state intact) or an aborted fallback navigation, the next
    // pre-hydration tap was queued, then not replayed by the island (leaving=true), and its own ~3s timer returned
    // early too (the island was ready by then) — nothing happened at all.
    let originalLocation: Location;
    let location: { href: string };
    let uninstall: () => void;
    beforeEach(() => {
      vi.useFakeTimers();
      originalLocation = window.location;
      location = { href: '' };
      Object.defineProperty(window, 'location', { value: location, writable: true, configurable: true });
      uninstall = installCertQueue();
    });
    afterEach(() => {
      uninstall();
      Object.defineProperty(window, 'location', { value: originalLocation, writable: true, configurable: true });
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    async function tapFallBackThen(restore: () => void): Promise<void> {
      render(
        <a href={CERT.fullSrc} data-cert-id={CERT.id} aria-haspopup="dialog">
          상장 보기
        </a>,
      );
      const trigger = screen.getByRole('link', { name: '상장 보기' });
      tap(trigger); // before hydration (a slow phone)
      vi.advanceTimersByTime(3000); // the island is still not there: the fallback navigates to the image
      expect(location.href).toBe(CERT.fullSrc);
      location.href = '';
      restore();
      const showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal');
      tap(trigger); // the user is still (or again) on this page and taps once more — still before hydration
      render(<CertificateModal certificates={[CERT]} labels={LABELS} />); // the island finally hydrates
      const dialog = document.querySelector<HTMLDialogElement>('dialog.cert-modal');
      if (!dialog) throw new Error('dialog not rendered');
      await vi.advanceTimersByTimeAsync(0);
      expect(showModal, 'the post-reset tap opens the modal exactly once').toHaveBeenCalledTimes(1);
      expect(dialog).toHaveAttribute('open');
      await vi.advanceTimersByTimeAsync(3000); // that tap's own ~3s timer: the island is ready, so no fallback
      expect(location.href, 'no navigation on top of the open modal').toBe('');
      expect(showModal).toHaveBeenCalledTimes(1);
    }

    it('after a bfcache Back (pageshow with persisted=true)', async () => {
      await tapFallBackThen(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
    });

    it('after an aborted fallback navigation (no pageshow: the page simply stayed)', async () => {
      await tapFallBackThen(() => {});
    });
  });
});
