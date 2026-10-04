// tests/helpers/os-media.ts — a controllable window.matchMedia for the reduced-motion tests. Every matchMedia() call
// returns the same query object; it records its 'change' listeners and `change()` flips the OS setting and fires them,
// so a test can see who is told, how often, and whether a listener is released.
import { vi } from 'vitest';

export interface OsMedia {
  /** The one MediaQueryList every matchMedia() call returns; addEventListener / removeEventListener are mocks. */
  query: MediaQueryList;
  /** The 'change' listeners registered right now. */
  listeners: Set<(event: Event) => void>;
  /** Sets the OS setting, then fires every registered 'change' listener, as the browser does. */
  change(matches: boolean): void;
}

export function stubOsMedia(matches = false): OsMedia {
  const listeners = new Set<(event: Event) => void>();
  const query = {
    matches,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addEventListener: vi.fn((_type: string, listener: (event: Event) => void) => {
      listeners.add(listener);
    }),
    removeEventListener: vi.fn((_type: string, listener: (event: Event) => void) => {
      listeners.delete(listener);
    }),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
  vi.stubGlobal('matchMedia', vi.fn(() => query));
  return {
    query: query as unknown as MediaQueryList,
    listeners,
    change(next) {
      query.matches = next;
      for (const listener of [...listeners]) listener(new Event('change'));
    },
  };
}
