import { describe, expect, it, vi } from 'vitest';
import { KONAMI_SEQUENCE, createKonamiDetector } from '../../src/lib/konami';

const asTarget = (value: object | null): EventTarget | null => value as unknown as EventTarget | null;

function press(handler: ReturnType<typeof createKonamiDetector>, keys: readonly string[], target: object | null = null): void {
  for (const key of keys) handler({ key, target: asTarget(target) });
}

describe('createKonamiDetector', () => {
  it('uses the classic sequence', () => {
    expect(KONAMI_SEQUENCE).toEqual(['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']);
  });

  it('matches the full sequence (letters case-insensitive)', () => {
    const onMatch = vi.fn();
    const handler = createKonamiDetector(onMatch);
    press(handler, KONAMI_SEQUENCE.slice(0, 8));
    press(handler, ['B', 'A']);
    expect(onMatch).toHaveBeenCalledTimes(1);
    press(handler, KONAMI_SEQUENCE);
    expect(onMatch).toHaveBeenCalledTimes(2);
  });

  it('a wrong key resets', () => {
    const onMatch = vi.fn();
    const handler = createKonamiDetector(onMatch);
    press(handler, ['ArrowUp', 'ArrowUp', 'ArrowDown', 'x']);
    press(handler, KONAMI_SEQUENCE.slice(3));
    expect(onMatch).not.toHaveBeenCalled();
    press(handler, ['Enter', ...KONAMI_SEQUENCE]);
    expect(onMatch).toHaveBeenCalledTimes(1);
  });

  it('a fresh ArrowUp restarts the sequence, and an extra leading ArrowUp still matches', () => {
    const onMatch = vi.fn();
    const handler = createKonamiDetector(onMatch);
    press(handler, ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowUp']);
    press(handler, KONAMI_SEQUENCE.slice(1));
    expect(onMatch).toHaveBeenCalledTimes(1);
    press(handler, ['ArrowUp', ...KONAMI_SEQUENCE]);
    expect(onMatch).toHaveBeenCalledTimes(2);
  });

  it('ignores keys typed into inputs', () => {
    const onMatch = vi.fn();
    const handler = createKonamiDetector(onMatch);
    press(handler, KONAMI_SEQUENCE, { tagName: 'INPUT' });
    press(handler, KONAMI_SEQUENCE, { tagName: 'TEXTAREA' });
    press(handler, KONAMI_SEQUENCE, { tagName: 'SELECT' });
    press(handler, KONAMI_SEQUENCE, { isContentEditable: true });
    expect(onMatch).not.toHaveBeenCalled();
    // keys typed into a field do not break progress made outside it
    press(handler, KONAMI_SEQUENCE.slice(0, 5), { tagName: 'BODY' });
    press(handler, ['q', 'w'], { tagName: 'INPUT' });
    press(handler, KONAMI_SEQUENCE.slice(5), { tagName: 'BODY' });
    expect(onMatch).toHaveBeenCalledTimes(1);
  });
});
