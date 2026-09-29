import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import ImageViewer from '../../src/islands/ImageViewer';
import { TRIGGER_EVENT } from '../../src/lib/achievements';
import { VIEWER_QUEUE_SCRIPT } from '../../src/lib/viewer-queue';

const CERT = {
  id: 'busan-mayor-award',
  src: '#full-busan',
  width: 1600,
  height: 2262,
  alt: '2025 Big Data 활용 대회 빅데이터 분석 부문 최우수상 상장',
  caption: '최우수상(부산광역시장상) · 2025 Big Data 활용 대회 · 빅데이터 분석 부문',
  label: '상장',
};
const FIG = {
  id: 'fig-a',
  src: '#full-fig-a',
  width: 1200,
  height: 800,
  alt: 'Figure A',
  caption: 'Caption A',
  label: 'FIG · A',
};
const FIG_B = {
  id: 'fig-b',
  src: '#full-fig-b',
  width: 1200,
  height: 800,
  alt: 'Figure B',
  caption: 'Caption B',
  label: 'FIG · B',
};
const LABELS = { dialog: '이미지 보기', close: '닫기', previous: '이전 이미지', next: '다음 이미지', counter: '{current} / {total}' };

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
  if (typeof Element.prototype.setPointerCapture !== 'function') {
    Element.prototype.setPointerCapture = function setPointerCapture() {};
    Element.prototype.releasePointerCapture = function releasePointerCapture() {};
  }
});

beforeEach(() => {
  vi.useRealTimers();
  delete window.__sbTriggers;
  delete window.__sbViewerReady;
  delete window.__sbViewerQueue;
  delete window.__sbViewerLeaving;
  document.documentElement.classList.remove('is-scroll-locked');
  document.documentElement.setAttribute('data-motion', 'full');
  if (history.state && typeof history.state === 'object' && history.state !== null && ('viewer' in history.state || 'viewerPushed' in history.state)) {
    const rest = { ...(history.state as Record<string, unknown>) };
    delete rest.viewer;
    delete rest.viewerPushed;
    history.replaceState(Object.keys(rest).length ? rest : null, '', `${location.pathname}${location.search}`);
  } else if (location.hash) {
    history.replaceState(history.state, '', `${location.pathname}${location.search}`);
  }
});

afterEach(() => {
  document.querySelectorAll('dialog.image-viewer[open]').forEach((dialog) => {
    (dialog as HTMLDialogElement).close();
  });
  document.body.innerHTML = '';
});

/** Runs the real inline queue script (src/lib/viewer-queue.ts) as BaseLayout's <head> would, and returns a function
 * that removes the listeners it added (otherwise each run leaves a document click + window pageshow listener
 * behind for every later test in this file). */
function installViewerQueue(): () => void {
  const onDocument = vi.spyOn(document, 'addEventListener');
  const onWindow = vi.spyOn(window, 'addEventListener');
  const added: Array<() => void> = [];
  try {
    new Function(VIEWER_QUEUE_SCRIPT)();
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

function certTrigger(overrides: Partial<typeof CERT> & { name?: string } = {}) {
  const c = { ...CERT, ...overrides };
  return (
    <a
      href={c.src}
      data-viewer="certificates"
      data-cert-id={c.id}
      data-viewer-w={c.width}
      data-viewer-h={c.height}
      data-viewer-label={c.label}
      data-viewer-caption={c.caption}
      data-viewer-alt={c.alt}
      aria-haspopup="dialog"
    >
      {overrides.name ?? '상장 보기'}
    </a>
  );
}

function figTrigger(fig: typeof FIG, name = '크게 보기') {
  return (
    <figure>
      <img src="/thumb.webp" alt={fig.alt} width={200} height={120} />
      <a
        href={fig.src}
        data-viewer="figures"
        data-viewer-w={fig.width}
        data-viewer-h={fig.height}
        data-viewer-label={fig.label}
        data-viewer-caption={fig.caption}
        data-viewer-alt={fig.alt}
        aria-haspopup="dialog"
      >
        {name}
      </a>
    </figure>
  );
}

function mediaScale(dialog: HTMLElement): string {
  const media = dialog.querySelector('.image-viewer__media') as HTMLElement;
  return media.style.getPropertyValue('--zs') || '1';
}

function setup() {
  const user = userEvent.setup();
  render(
    <>
      {certTrigger()}
      <ImageViewer labels={LABELS} />
    </>,
  );
  const trigger = screen.getByRole('link', { name: '상장 보기' });
  const dialog = document.querySelector<HTMLDialogElement>('dialog.image-viewer');
  if (!dialog) throw new Error('dialog not rendered');
  return { user, trigger, dialog };
}

describe('ImageViewer', () => {
  it('plain click on [data-viewer] opens the dialog and focuses close', async () => {
    const { user, trigger, dialog } = setup();
    expect(dialog).not.toHaveAttribute('open');
    expect(dialog).toHaveAttribute('data-state', 'closed');
    await user.click(trigger);
    expect(dialog).toHaveAttribute('open');
    expect(screen.getByRole('button', { name: LABELS.close })).toHaveFocus();
    expect(within(dialog).getByRole('img', { name: CERT.alt })).toHaveAttribute('src', CERT.src);
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

  it('a trigger whose href is empty is left alone', () => {
    render(
      <>
        <a data-viewer="certificates" data-cert-id="cds-encouragement-award" aria-haspopup="dialog">
          다른 상장
        </a>
        <ImageViewer labels={LABELS} />
      </>,
    );
    const dialog = document.querySelector<HTMLDialogElement>('dialog.image-viewer')!;
    const other = document.querySelector<HTMLAnchorElement>('a[data-cert-id="cds-encouragement-award"]')!;
    expect(other.getAttribute('href')).toBeNull();
    const notPrevented = fireEvent.click(other);
    expect(notPrevented).toBe(true);
    expect(dialog).not.toHaveAttribute('open');
  });

  it('a link without data-viewer is left alone', () => {
    render(
      <>
        <a href="#elsewhere">일반 링크</a>
        <ImageViewer labels={LABELS} />
      </>,
    );
    const dialog = document.querySelector<HTMLDialogElement>('dialog.image-viewer')!;
    const link = screen.getByRole('link', { name: '일반 링크' });
    const notPrevented = fireEvent.click(link);
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

  it('Tab wraps across close / prev / next when a group is open', async () => {
    const user = userEvent.setup();
    render(
      <>
        {figTrigger(FIG, '크게 보기 A')}
        {figTrigger(FIG_B, '크게 보기 B')}
        <ImageViewer labels={LABELS} />
      </>,
    );
    await user.click(screen.getByRole('link', { name: '크게 보기 A' }));
    const dialog = document.querySelector<HTMLDialogElement>('dialog.image-viewer')!;
    await waitFor(() => expect(dialog).toHaveAttribute('data-state', 'open'));
    const close = within(dialog).getByRole('button', { name: LABELS.close });
    const prev = within(dialog).getByRole('button', { name: LABELS.previous });
    const next = within(dialog).getByRole('button', { name: LABELS.next });
    expect(close).toHaveFocus();
    await user.tab();
    expect(prev).toHaveFocus();
    await user.tab();
    expect(next).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();
  });

  it('backdrop click closes', async () => {
    const { user, trigger, dialog } = setup();
    await user.click(trigger);
    fireEvent.click(within(dialog).getByRole('img', { name: CERT.alt }));
    expect(dialog).not.toHaveAttribute('data-state', 'closing');
    fireEvent.click(dialog);
    await waitFor(() => expect(dialog).toHaveAttribute('data-state', 'closing'));
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
    delete window.__sbViewerReady;
    delete window.__sbViewerQueue;
    setup();
    expect(window.__sbViewerReady).toBe(true);
  });

  it('replays a certificate click queued before the island hydrated (P2-13)', async () => {
    delete window.__sbViewerReady;
    render(
      <a href={CERT.src} data-viewer="certificates" data-cert-id={CERT.id} data-viewer-w={CERT.width} data-viewer-h={CERT.height} data-viewer-alt={CERT.alt} data-viewer-caption={CERT.caption} data-viewer-label={CERT.label} aria-haspopup="dialog">
        상장 보기
      </a>,
    );
    const trigger = screen.getByRole('link', { name: '상장 보기' });
    window.__sbViewerQueue = [trigger];
    render(<ImageViewer labels={LABELS} />);
    const dialog = document.querySelector<HTMLDialogElement>('dialog.image-viewer');
    if (!dialog) throw new Error('dialog not rendered');
    await waitFor(() => expect(dialog).toHaveAttribute('open'));
    expect(screen.getByRole('button', { name: LABELS.close })).toHaveFocus();
    expect(window.__sbViewerQueue).toEqual([]);
    await userEvent.setup().keyboard('{Escape}');
    await waitFor(() => expect(dialog).not.toHaveAttribute('open'));
    expect(trigger, 'focus returns to the queued trigger, same as a live click').toHaveFocus();
  });

  it('fix round 3 item 2 / fix round 4 item 3: staggered pre-hydration taps (A at 0 s, B at +2 s) — an island mounting after A\'s fallback opens no modal', async () => {
    vi.useFakeTimers();
    const originalLocation = window.location;
    const stub = { href: '' };
    Object.defineProperty(window, 'location', { value: stub, writable: true, configurable: true });
    let uninstall = (): void => {};
    try {
      delete window.__sbViewerReady;
      delete window.__sbViewerQueue;
      delete window.__sbViewerLeaving;
      uninstall = installViewerQueue();
      const showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal');

      render(
        <>
          <a href="#cert-a" data-viewer="certificates" data-cert-id={CERT.id} data-viewer-w={CERT.width} data-viewer-h={CERT.height} data-viewer-alt={CERT.alt} data-viewer-caption={CERT.caption} data-viewer-label={CERT.label} aria-haspopup="dialog">
            상장 보기 A
          </a>
          <a href="#cert-b" data-viewer="certificates" data-cert-id={CERT.id} data-viewer-w={CERT.width} data-viewer-h={CERT.height} data-viewer-alt={CERT.alt} data-viewer-caption={CERT.caption} data-viewer-label={CERT.label} aria-haspopup="dialog">
            상장 보기 B
          </a>
        </>,
      );
      const triggerA = screen.getByRole('link', { name: '상장 보기 A' });
      const triggerB = screen.getByRole('link', { name: '상장 보기 B' });

      tap(triggerA);
      vi.advanceTimersByTime(2000);
      tap(triggerB);
      vi.advanceTimersByTime(1000);
      expect(stub.href).toBe('#cert-a');

      vi.advanceTimersByTime(500);
      render(<ImageViewer labels={LABELS} />);
      const dialog = document.querySelector<HTMLDialogElement>('dialog.image-viewer');
      if (!dialog) throw new Error('dialog not rendered');
      await vi.advanceTimersByTimeAsync(0);
      expect(showModal, 'no modal opens once a fallback has fired').not.toHaveBeenCalled();
      expect(dialog).not.toHaveAttribute('open');

      await vi.advanceTimersByTimeAsync(2000);
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
    let originalLocation: Location;
    let location: { href: string };
    let uninstall: () => void;
    beforeEach(() => {
      vi.useFakeTimers();
      originalLocation = window.location;
      location = { href: '' };
      Object.defineProperty(window, 'location', { value: location, writable: true, configurable: true });
      uninstall = installViewerQueue();
    });
    afterEach(() => {
      uninstall();
      Object.defineProperty(window, 'location', { value: originalLocation, writable: true, configurable: true });
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    async function tapFallBackThen(restore: () => void): Promise<void> {
      render(
        <a href={CERT.src} data-viewer="certificates" data-cert-id={CERT.id} data-viewer-w={CERT.width} data-viewer-h={CERT.height} data-viewer-alt={CERT.alt} data-viewer-caption={CERT.caption} data-viewer-label={CERT.label} aria-haspopup="dialog">
          상장 보기
        </a>,
      );
      const trigger = screen.getByRole('link', { name: '상장 보기' });
      tap(trigger);
      vi.advanceTimersByTime(3000);
      expect(location.href).toBe(CERT.src);
      location.href = '';
      restore();
      const showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal');
      tap(trigger);
      render(<ImageViewer labels={LABELS} />);
      const dialog = document.querySelector<HTMLDialogElement>('dialog.image-viewer');
      if (!dialog) throw new Error('dialog not rendered');
      await vi.advanceTimersByTimeAsync(0);
      expect(showModal, 'the post-reset tap opens the modal exactly once').toHaveBeenCalledTimes(1);
      expect(dialog).toHaveAttribute('open');
      await vi.advanceTimersByTimeAsync(3000);
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

  it('group order: ←/→ stop at ends; counter text updates; aria-disabled at ends', async () => {
    const user = userEvent.setup();
    render(
      <>
        {figTrigger(FIG, '크게 보기 A')}
        {figTrigger(FIG_B, '크게 보기 B')}
        <ImageViewer labels={LABELS} />
      </>,
    );
    const dialog = document.querySelector<HTMLDialogElement>('dialog.image-viewer')!;
    await user.click(screen.getByRole('link', { name: '크게 보기 A' }));
    await waitFor(() => expect(dialog).toHaveAttribute('open'));
    await waitFor(() => expect(dialog).toHaveAttribute('data-state', 'open'));
    await waitFor(() => expect(within(dialog).getByRole('status')).toHaveTextContent('1 / 2'));
    expect(within(dialog).getByRole('button', { name: LABELS.previous })).toHaveAttribute('aria-disabled', 'true');
    // S10: wait past the nav swap window so a wrap-below-0 mutant cannot pass on the pre-swap poll.
    await user.keyboard('{ArrowLeft}');
    await new Promise((r) => setTimeout(r, 220));
    expect(within(dialog).getByRole('status')).toHaveTextContent('1 / 2');
    expect((history.state as { viewer?: string } | null)?.viewer).toBe('full-fig-a');
    await user.keyboard('{ArrowRight}');
    await waitFor(() => expect(within(dialog).getByRole('status')).toHaveTextContent('2 / 2'));
    await waitFor(() => expect(within(dialog).getByRole('img', { name: FIG_B.alt })).toBeInTheDocument());
    expect(within(dialog).getByRole('button', { name: LABELS.next })).toHaveAttribute('aria-disabled', 'true');
    const viewerBefore = (history.state as { viewer?: string } | null)?.viewer;
    await user.keyboard('{ArrowRight}');
    await new Promise((r) => setTimeout(r, 220));
    expect(within(dialog).getByRole('status')).toHaveTextContent('2 / 2');
    expect((history.state as { viewer?: string } | null)?.viewer).toBe(viewerBefore);
  });

  it('reduced motion: stage never gets a scale/translate transform while opening', async () => {
    document.documentElement.setAttribute('data-motion', 'reduce');
    const user = userEvent.setup();
    render(
      <>
        {figTrigger(FIG)}
        <ImageViewer labels={LABELS} />
      </>,
    );
    const dialog = document.querySelector<HTMLDialogElement>('dialog.image-viewer')!;
    const recorded: string[] = [];
    const observer = new MutationObserver(() => {
      const stage = dialog.querySelector('.image-viewer__stage') as HTMLElement | null;
      if (stage) recorded.push(stage.style.transform || '');
    });
    observer.observe(dialog, { attributes: true, subtree: true, attributeFilter: ['style', 'data-flip', 'data-state'] });
    await user.click(screen.getByRole('link', { name: '크게 보기' }));
    await waitFor(() => expect(dialog).toHaveAttribute('open'));
    await waitFor(() => expect(dialog).toHaveAttribute('data-state', 'open'));
    observer.disconnect();
    const stage = dialog.querySelector('.image-viewer__stage') as HTMLElement;
    expect(stage.getAttribute('data-flip')).toBe('off');
    for (const value of recorded) {
      expect(value === '' || value === 'none').toBe(true);
      expect(value).not.toMatch(/scale\(|translate\(/);
    }
    document.documentElement.setAttribute('data-motion', 'full');
  });

  it('zoom resets on navigation', async () => {
    const user = userEvent.setup();
    render(
      <>
        {figTrigger(FIG, '크게 보기 A')}
        {figTrigger(FIG_B, '크게 보기 B')}
        <ImageViewer labels={LABELS} />
      </>,
    );
    const dialog = document.querySelector<HTMLDialogElement>('dialog.image-viewer')!;
    await user.click(screen.getByRole('link', { name: '크게 보기 A' }));
    await waitFor(() => expect(dialog).toHaveAttribute('open'));
    await waitFor(() => expect(dialog).toHaveAttribute('data-state', 'open'));
    const media = dialog.querySelector('.image-viewer__media') as HTMLElement;
    fireEvent.doubleClick(media);
    expect(mediaScale(dialog)).toBe('2');
    await user.keyboard('{ArrowRight}');
    await waitFor(() => expect(within(dialog).getByRole('status')).toHaveTextContent('2 / 2'));
    await waitFor(() => expect(mediaScale(dialog)).toBe('1'));
  });

  it('mouse double-click sequence (pointerup×2 + dblclick) ends at scale 2, not 1 (B4)', async () => {
    const user = userEvent.setup();
    render(
      <>
        {figTrigger(FIG)}
        <ImageViewer labels={LABELS} />
      </>,
    );
    const dialog = document.querySelector<HTMLDialogElement>('dialog.image-viewer')!;
    await user.click(screen.getByRole('link', { name: '크게 보기' }));
    await waitFor(() => expect(dialog).toHaveAttribute('data-state', 'open'));
    const media = dialog.querySelector('.image-viewer__media') as HTMLElement;
    const tip = { pointerType: 'mouse' as const, pointerId: 1, clientX: 100, clientY: 80, bubbles: true };
    fireEvent.pointerDown(media, tip);
    fireEvent.pointerUp(media, tip);
    fireEvent.pointerDown(media, tip);
    fireEvent.pointerUp(media, tip);
    fireEvent.doubleClick(media, { clientX: 100, clientY: 80 });
    expect(mediaScale(dialog)).toBe('2');
  });

  it('touch double-tap + synthesized dblclick ends at scale 2, not 1 (B4/R12)', async () => {
    const user = userEvent.setup();
    render(
      <>
        {figTrigger(FIG)}
        <ImageViewer labels={LABELS} />
      </>,
    );
    const dialog = document.querySelector<HTMLDialogElement>('dialog.image-viewer')!;
    await user.click(screen.getByRole('link', { name: '크게 보기' }));
    await waitFor(() => expect(dialog).toHaveAttribute('data-state', 'open'));
    const media = dialog.querySelector('.image-viewer__media') as HTMLElement;
    Object.defineProperty(media, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 0, top: 0, width: 200, height: 160, right: 200, bottom: 160, x: 0, y: 0, toJSON: () => ({}) }),
    });
    const tip = { pointerType: 'touch' as const, pointerId: 1, clientX: 100, clientY: 80, bubbles: true };
    fireEvent.pointerDown(media, tip);
    fireEvent.pointerUp(media, tip);
    fireEvent.pointerDown(media, tip);
    fireEvent.pointerUp(media, tip);
    fireEvent.doubleClick(media, { clientX: 100, clientY: 80 });
    expect(mediaScale(dialog)).toBe('2');
  });

  it('a tap after pinch does not reset zoom (B4/R1)', async () => {
    const user = userEvent.setup();
    render(
      <>
        {figTrigger(FIG)}
        <ImageViewer labels={LABELS} />
      </>,
    );
    const dialog = document.querySelector<HTMLDialogElement>('dialog.image-viewer')!;
    await user.click(screen.getByRole('link', { name: '크게 보기' }));
    await waitFor(() => expect(dialog).toHaveAttribute('data-state', 'open'));
    const media = dialog.querySelector('.image-viewer__media') as HTMLElement;
    Object.defineProperty(media, 'clientWidth', { configurable: true, get: () => 200 });
    Object.defineProperty(media, 'clientHeight', { configurable: true, get: () => 160 });
    Object.defineProperty(media, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 0, top: 0, width: 200, height: 160, right: 200, bottom: 160, x: 0, y: 0, toJSON: () => ({}) }),
    });
    fireEvent.pointerDown(media, { pointerType: 'touch', pointerId: 1, clientX: 80, clientY: 80, bubbles: true });
    fireEvent.pointerDown(media, { pointerType: 'touch', pointerId: 2, clientX: 120, clientY: 80, bubbles: true });
    fireEvent.pointerMove(media, { pointerType: 'touch', pointerId: 1, clientX: 40, clientY: 80, bubbles: true });
    fireEvent.pointerMove(media, { pointerType: 'touch', pointerId: 2, clientX: 160, clientY: 80, bubbles: true });
    fireEvent.pointerUp(media, { pointerType: 'touch', pointerId: 2, clientX: 160, clientY: 80, bubbles: true });
    fireEvent.pointerUp(media, { pointerType: 'touch', pointerId: 1, clientX: 40, clientY: 80, bubbles: true });
    const afterPinch = Number(mediaScale(dialog));
    expect(afterPinch).toBeGreaterThan(1);
    fireEvent.pointerDown(media, { pointerType: 'touch', pointerId: 3, clientX: 100, clientY: 80, bubbles: true });
    fireEvent.pointerUp(media, { pointerType: 'touch', pointerId: 3, clientX: 100, clientY: 80, bubbles: true });
    expect(Number(mediaScale(dialog))).toBeGreaterThan(1);
  });

  it('swipe left on pointer moves the counter from 1/N to 2/N (B3)', async () => {
    const user = userEvent.setup();
    render(
      <>
        {figTrigger(FIG, '크게 보기 A')}
        {figTrigger(FIG_B, '크게 보기 B')}
        <ImageViewer labels={LABELS} />
      </>,
    );
    const dialog = document.querySelector<HTMLDialogElement>('dialog.image-viewer')!;
    await user.click(screen.getByRole('link', { name: '크게 보기 A' }));
    await waitFor(() => expect(dialog).toHaveAttribute('data-state', 'open'));
    await waitFor(() => expect(within(dialog).getByRole('status')).toHaveTextContent('1 / 2'));
    const media = dialog.querySelector('.image-viewer__media') as HTMLElement;
    fireEvent.pointerDown(media, { pointerType: 'touch', pointerId: 1, clientX: 200, clientY: 100, bubbles: true });
    fireEvent.pointerMove(media, { pointerType: 'touch', pointerId: 1, clientX: 100, clientY: 100, bubbles: true });
    fireEvent.pointerUp(media, { pointerType: 'touch', pointerId: 1, clientX: 100, clientY: 100, bubbles: true });
    await waitFor(() => expect(within(dialog).getByRole('status')).toHaveTextContent('2 / 2'));
  });

  it('B2: ←/→ replaceState never writes viewerPushed when the entry was not owned', async () => {
    const user = userEvent.setup();
    render(
      <>
        {figTrigger(FIG, '크게 보기 A')}
        {figTrigger(FIG_B, '크게 보기 B')}
        <ImageViewer labels={LABELS} />
      </>,
    );
    const dialog = document.querySelector<HTMLDialogElement>('dialog.image-viewer')!;
    await user.click(screen.getByRole('link', { name: '크게 보기 A' }));
    await waitFor(() => expect(dialog).toHaveAttribute('data-state', 'open'));
    // Simulate a deep-link entry that never claimed ownership (viewerPushed absent).
    history.replaceState({ viewer: 'full-fig-a' }, '', `${location.pathname}${location.search}${location.hash}`);
    const replace = vi.spyOn(history, 'replaceState');
    await user.keyboard('{ArrowRight}');
    await waitFor(() => expect(within(dialog).getByRole('status')).toHaveTextContent('2 / 2'));
    const last = replace.mock.calls[replace.mock.calls.length - 1]![0] as { viewer?: string; viewerPushed?: boolean };
    expect(last.viewer).toBe('full-fig-b');
    expect(last).not.toHaveProperty('viewerPushed');
    replace.mockRestore();
  });

  it('S1: Esc during navigation clears pending nav timers so the dialog still closes', async () => {
    const user = userEvent.setup();
    render(
      <>
        {figTrigger(FIG, '크게 보기 A')}
        {figTrigger(FIG_B, '크게 보기 B')}
        <ImageViewer labels={LABELS} />
      </>,
    );
    const dialog = document.querySelector<HTMLDialogElement>('dialog.image-viewer')!;
    await user.click(screen.getByRole('link', { name: '크게 보기 A' }));
    await waitFor(() => expect(dialog).toHaveAttribute('data-state', 'open'));
    await user.keyboard('{ArrowRight}');
    await new Promise((r) => setTimeout(r, 20));
    const clearSpy = vi.spyOn(window, 'clearTimeout');
    await user.keyboard('{Escape}');
    // Discriminator: clearNavTimers runs synchronously inside requestClose.
    expect(clearSpy.mock.calls.length).toBeGreaterThan(0);
    clearSpy.mockRestore();
    await waitFor(() => expect(dialog).not.toHaveAttribute('open'), { timeout: 2000 });
    await new Promise((r) => setTimeout(r, 400));
    expect(dialog).not.toHaveAttribute('open');
    expect(dialog).toHaveAttribute('data-state', 'closed');
  });

  it('S4: dialog.close() while owned calls history.back exactly once', async () => {
    const back = vi.spyOn(history, 'back').mockImplementation(() => {
      history.replaceState(null, '', `${location.pathname}${location.search}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    const user = userEvent.setup();
    render(
      <>
        {certTrigger()}
        <ImageViewer labels={LABELS} />
      </>,
    );
    const dialog = document.querySelector<HTMLDialogElement>('dialog.image-viewer')!;
    await user.click(screen.getByRole('link', { name: '상장 보기' }));
    await waitFor(() => expect(dialog).toHaveAttribute('data-state', 'open'));
    expect((history.state as { viewerPushed?: boolean } | null)?.viewerPushed).toBe(true);
    dialog.close();
    await waitFor(() => expect(dialog).not.toHaveAttribute('open'));
    expect(back).toHaveBeenCalledTimes(1);
    back.mockRestore();
  });

  it('S5: double-click zooms toward the pointer, not the centre', async () => {
    const user = userEvent.setup();
    render(
      <>
        {figTrigger(FIG)}
        <ImageViewer labels={LABELS} />
      </>,
    );
    const dialog = document.querySelector<HTMLDialogElement>('dialog.image-viewer')!;
    await user.click(screen.getByRole('link', { name: '크게 보기' }));
    await waitFor(() => expect(dialog).toHaveAttribute('data-state', 'open'));
    const media = dialog.querySelector('.image-viewer__media') as HTMLElement;
    Object.defineProperty(media, 'clientWidth', { configurable: true, get: () => 200 });
    Object.defineProperty(media, 'clientHeight', { configurable: true, get: () => 160 });
    Object.defineProperty(media, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 0, top: 0, width: 200, height: 160, right: 200, bottom: 160, x: 0, y: 0, toJSON: () => ({}) }),
    });
    fireEvent.pointerDown(media, { pointerType: 'mouse', pointerId: 1, clientX: 180, clientY: 40, bubbles: true });
    fireEvent.pointerUp(media, { pointerType: 'mouse', pointerId: 1, clientX: 180, clientY: 40, bubbles: true });
    fireEvent.doubleClick(media, { clientX: 180, clientY: 40 });
    expect(mediaScale(dialog)).toBe('2');
    const zx = Number(media.style.getPropertyValue('--zx').replace('px', '') || '0');
    const zy = Number(media.style.getPropertyValue('--zy').replace('px', '') || '0');
    expect(zx).not.toBe(0);
    expect(zy).not.toBe(0);
  });

  it('R5: a deferred popstate after Esc does not call history.back twice', async () => {
    const deferred: { pop: (() => void) | null } = { pop: null };
    const back = vi.spyOn(history, 'back').mockImplementation(() => {
      deferred.pop = () => {
        history.replaceState(null, '', `${location.pathname}${location.search}`);
        window.dispatchEvent(new PopStateEvent('popstate'));
      };
    });
    const user = userEvent.setup();
    render(
      <>
        {certTrigger()}
        <ImageViewer labels={LABELS} />
      </>,
    );
    const dialog = document.querySelector<HTMLDialogElement>('dialog.image-viewer')!;
    await user.click(screen.getByRole('link', { name: '상장 보기' }));
    await waitFor(() => expect(dialog).toHaveAttribute('data-state', 'open'));
    await user.keyboard('{Escape}');
    // Fallback timer (50ms) starts close while popstate is still outstanding.
    await new Promise((r) => setTimeout(r, 80));
    await waitFor(() => expect(dialog).toHaveAttribute('data-state', 'closing'));
    await waitFor(() => expect(dialog).not.toHaveAttribute('open'), { timeout: 2000 });
    expect(back).toHaveBeenCalledTimes(1);
    deferred.pop?.();
    await new Promise((r) => setTimeout(r, 50));
    expect(back).toHaveBeenCalledTimes(1);
    back.mockRestore();
  });

  it('certificate achievement fires only for certificates, not figures', async () => {
    const seen: string[] = [];
    const onTrigger = (event: Event) => seen.push((event as CustomEvent<{ trigger: string }>).detail.trigger);
    window.addEventListener(TRIGGER_EVENT, onTrigger);
    try {
      const user = userEvent.setup();
      render(
        <>
          {figTrigger(FIG)}
          <ImageViewer labels={LABELS} />
        </>,
      );
      const dialog = document.querySelector<HTMLDialogElement>('dialog.image-viewer')!;
      await user.click(screen.getByRole('link', { name: '크게 보기' }));
      await waitFor(() => expect(dialog).toHaveAttribute('open'));
      await user.keyboard('{Escape}');
      await waitFor(() => expect(dialog).not.toHaveAttribute('open'), { timeout: 2000 });
      expect(seen).toEqual([]);
    } finally {
      window.removeEventListener(TRIGGER_EVENT, onTrigger);
    }
  });

  describe('history contract', () => {
    it('open pushes one entry; ←/→ replace it; Esc calls back once', async () => {
      const push = vi.spyOn(history, 'pushState');
      const replace = vi.spyOn(history, 'replaceState');
      const back = vi.spyOn(history, 'back').mockImplementation(() => {
        history.replaceState(null, '', `${location.pathname}${location.search}`);
        window.dispatchEvent(new PopStateEvent('popstate'));
      });
      const user = userEvent.setup();
      render(
        <>
          {figTrigger(FIG, '크게 보기 A')}
          {figTrigger(FIG_B, '크게 보기 B')}
          <ImageViewer labels={LABELS} />
        </>,
      );
      const dialog = document.querySelector<HTMLDialogElement>('dialog.image-viewer')!;
      await user.click(screen.getByRole('link', { name: '크게 보기 A' }));
      await waitFor(() => expect(dialog).toHaveAttribute('data-state', 'open'));
      expect(push).toHaveBeenCalledTimes(1);
      expect(push.mock.calls[0]![0]).toMatchObject({ viewer: 'full-fig-a', viewerPushed: true });
      const replacesBefore = replace.mock.calls.length;
      await user.keyboard('{ArrowRight}');
      await waitFor(() => expect(within(dialog).getByRole('status')).toHaveTextContent('2 / 2'));
      expect(replace.mock.calls.length).toBeGreaterThan(replacesBefore);
      const lastReplace = replace.mock.calls[replace.mock.calls.length - 1]![0] as { viewer?: string; viewerPushed?: boolean };
      expect(lastReplace.viewer).toBe('full-fig-b');
      expect(lastReplace.viewerPushed).toBe(true);
      await user.keyboard('{Escape}');
      await waitFor(() => expect(dialog).not.toHaveAttribute('open'));
      expect(back).toHaveBeenCalledTimes(1);
      push.mockRestore();
      replace.mockRestore();
      back.mockRestore();
    });

    it('a popstate while open closes the viewer', async () => {
      const user = userEvent.setup();
      render(
        <>
          {certTrigger()}
          <ImageViewer labels={LABELS} />
        </>,
      );
      const dialog = document.querySelector<HTMLDialogElement>('dialog.image-viewer')!;
      await user.click(screen.getByRole('link', { name: '상장 보기' }));
      await waitFor(() => expect(dialog).toHaveAttribute('data-state', 'open'));
      history.replaceState(null, '', `${location.pathname}${location.search}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
      await waitFor(() => expect(dialog).toHaveAttribute('data-state', 'closing'));
      await waitFor(() => expect(dialog).not.toHaveAttribute('open'));
    });

    it('mounting with #view-<id> in the URL opens that item', async () => {
      history.replaceState(null, '', `${location.pathname}${location.search}#view-busan-mayor-award`);
      render(
        <>
          {certTrigger()}
          <ImageViewer labels={LABELS} />
        </>,
      );
      const dialog = document.querySelector<HTMLDialogElement>('dialog.image-viewer')!;
      await waitFor(() => expect(dialog).toHaveAttribute('open'));
      expect(within(dialog).getByRole('img', { name: CERT.alt })).toBeInTheDocument();
    });
  });
});
