// AL-11: useHudDialog — the native <dialog> shell the account dialog uses (account-link spec §3.2, §3.6, §3.7; plan
// DV-2: written after ImageViewer's pattern, ImageViewer untouched). The harness renders one <dialog> with an input,
// a close button and the hook's controls; jsdom has no working showModal()/close(), so both are emulated as in
// tests/react/ImageViewer.test.tsx.
import { act, render } from '@testing-library/react';
import { createElement, useEffect } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/sound', () => ({ playSfx: vi.fn(() => Promise.resolve()) }));
vi.mock('../../src/lib/scroll-lock', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/scroll-lock')>();
  return { lockScroll: vi.fn(actual.lockScroll), unlockScroll: vi.fn(actual.unlockScroll) };
});

import { lockScroll, unlockScroll } from '../../src/lib/scroll-lock';
import { playSfx } from '../../src/lib/sound';
import { useHudDialog, type HudDialog } from '../../src/lib/use-hud-dialog';

const CLOSE = 300;
const CLOSE_REDUCED = 150;

beforeAll(() => {
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

let api: HudDialog;
const onClosed = vi.fn();

function Harness(): ReturnType<typeof createElement> {
  const dlg = useHudDialog({ owner: 'account-dialog', closeMs: CLOSE, closeMsReduced: CLOSE_REDUCED, onClosed });
  useEffect(() => {
    api = dlg;
  });
  api = dlg;
  return createElement(
    'div',
    null,
    createElement('button', { type: 'button', id: 'origin' }, 'tile'),
    createElement(
      'dialog',
      { ref: dlg.dialogRef, 'data-state': dlg.state },
      createElement('button', { type: 'button', id: 'first', 'data-initial-focus': '' }, 'close'),
      createElement('input', { id: 'field', 'aria-label': 'field' }),
      createElement('button', { type: 'button', id: 'last' }, 'last'),
    ),
  );
}

function mount(): { dialog: HTMLDialogElement; origin: HTMLButtonElement; unmount: () => void } {
  const { container, unmount } = render(createElement(Harness));
  return { dialog: container.querySelector('dialog') as HTMLDialogElement, origin: container.querySelector('#origin') as HTMLButtonElement, unmount };
}

async function openIt(origin: HTMLElement): Promise<void> {
  await act(async () => {
    api.open(origin);
  });
  // opening → open after a frame
  await act(async () => {
    await new Promise((r) => setTimeout(r, 60));
  });
}

beforeEach(() => {
  vi.useRealTimers();
  onClosed.mockReset();
  vi.mocked(playSfx).mockClear();
  vi.mocked(lockScroll).mockClear();
  vi.mocked(unlockScroll).mockClear();
  document.documentElement.setAttribute('data-motion', 'full');
  document.documentElement.classList.remove('is-scroll-locked');
});

afterEach(() => {
  vi.useRealTimers();
  unlockScroll('account-dialog');
});

describe('useHudDialog', () => {
  it('opens with showModal, takes the account-dialog scroll lock, focuses the initial control, then releases the lock on close', async () => {
    const { dialog, origin } = mount();
    expect(api.state).toBe('closed');
    await openIt(origin);
    expect(dialog.hasAttribute('open')).toBe(true);
    expect(api.state).toBe('open');
    expect(lockScroll).toHaveBeenCalledWith('account-dialog');
    expect(document.documentElement).toHaveClass('is-scroll-locked');
    expect(document.activeElement?.id).toBe('first');
    await act(async () => {
      api.requestClose('button');
    });
    expect(api.state).toBe('closing');
    await act(async () => {
      await new Promise((r) => setTimeout(r, CLOSE + 30));
    });
    expect(api.state).toBe('closed');
    expect(dialog.hasAttribute('open')).toBe(false);
    expect(unlockScroll).toHaveBeenCalledWith('account-dialog');
    expect(document.documentElement).not.toHaveClass('is-scroll-locked');
    expect(onClosed).toHaveBeenCalledTimes(1);
    expect(onClosed).toHaveBeenCalledWith(origin);
  });

  for (const [motion, ms] of [['full', CLOSE], ['reduce', CLOSE_REDUCED]] as const) {
    it(`the close timer uses ${motion === 'full' ? 'closeMs' : 'closeMsReduced'} (${ms} ms) with data-motion="${motion}"`, async () => {
      const { dialog, origin } = mount();
      await openIt(origin);
      document.documentElement.setAttribute('data-motion', motion);
      vi.useFakeTimers();
      act(() => api.requestClose('button'));
      act(() => {
        vi.advanceTimersByTime(ms - 1);
      });
      expect(dialog.hasAttribute('open')).toBe(true);
      expect(api.state).toBe('closing');
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(dialog.hasAttribute('open')).toBe(false);
      expect(api.state).toBe('closed');
    });
  }

  it('a guard that holds blocks every close path (button, Esc, backdrop) until it is cleared', async () => {
    const { dialog, origin } = mount();
    await openIt(origin);
    const guard = vi.fn(() => true);
    act(() => api.setGuard(guard));
    await act(async () => {
      api.requestClose('button');
    });
    const cancel = new Event('cancel', { cancelable: true });
    await act(async () => {
      dialog.dispatchEvent(cancel);
    });
    expect(cancel.defaultPrevented).toBe(true);
    await act(async () => {
      dialog.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      dialog.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(guard).toHaveBeenCalledTimes(3);
    expect(api.state).toBe('open');
    act(() => api.setGuard(null));
    await act(async () => {
      api.requestClose('button');
    });
    expect(api.state).toBe('closing');
  });

  it('Esc: the cancel event is prevented and starts the animated close; so does an Escape keydown', async () => {
    const { dialog, origin } = mount();
    await openIt(origin);
    const cancel = new Event('cancel', { cancelable: true });
    await act(async () => {
      dialog.dispatchEvent(cancel);
    });
    expect(cancel.defaultPrevented).toBe(true);
    expect(api.state).toBe('closing');
  });

  it('Esc as a keydown inside the dialog is prevented and starts the animated close', async () => {
    const { dialog, origin } = mount();
    await openIt(origin);
    const key = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    await act(async () => {
      dialog.querySelector('#field')?.dispatchEvent(key);
    });
    expect(key.defaultPrevented).toBe(true);
    expect(api.state).toBe('closing');
  });

  it('backdrop: closes only when both pointerdown and click land on the <dialog> itself', async () => {
    const { dialog, origin } = mount();
    await openIt(origin);
    const field = dialog.querySelector('#field') as HTMLInputElement;
    // a drag that starts in the input and ends on the backdrop does not close
    await act(async () => {
      field.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      dialog.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(api.state).toBe('open');
    // a click on content does not close
    await act(async () => {
      field.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      field.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(api.state).toBe('open');
    // pointerdown on the backdrop, click inside: no close either
    await act(async () => {
      dialog.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      field.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(api.state).toBe('open');
    await act(async () => {
      dialog.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      dialog.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(api.state).toBe('closing');
  });

  it('Tab is trapped: Tab on the last control goes to the first, Shift+Tab on the first goes to the last', async () => {
    const { dialog, origin } = mount();
    await openIt(origin);
    const first = dialog.querySelector<HTMLElement>('#first');
    const last = dialog.querySelector<HTMLElement>('#last');
    last?.focus();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    last?.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);
    const back = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    first?.dispatchEvent(back);
    expect(back.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
  });

  it('plays the open and close sounds (playSfx is gated by moduleOn inside the hook and inside sound.ts)', async () => {
    const { origin } = mount();
    await openIt(origin);
    expect(playSfx).toHaveBeenCalledWith('open');
    await act(async () => {
      api.requestClose('button');
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, CLOSE + 30));
    });
    expect(playSfx).toHaveBeenLastCalledWith('close');
  });

  it('no sound call on a version without the sfx module (the data version)', async () => {
    document.documentElement.setAttribute('data-variant', 'data');
    const { origin } = mount();
    await openIt(origin);
    await act(async () => {
      api.requestClose('button');
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, CLOSE + 30));
    });
    expect(api.state).toBe('closed');
    expect(playSfx).not.toHaveBeenCalled();
  });

  it('a native close (the browser closed the dialog itself) still releases the lock and reports the return target', async () => {
    const { dialog, origin } = mount();
    await openIt(origin);
    await act(async () => {
      dialog.close();
    });
    expect(api.state).toBe('closed');
    expect(document.documentElement).not.toHaveClass('is-scroll-locked');
    expect(onClosed).toHaveBeenCalledWith(origin);
  });

  it('unmounting while open releases the scroll lock', async () => {
    const { origin, unmount } = mount();
    await openIt(origin);
    expect(document.documentElement).toHaveClass('is-scroll-locked');
    unmount();
    expect(document.documentElement).not.toHaveClass('is-scroll-locked');
  });
});
