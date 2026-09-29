import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
if (typeof window.matchMedia !== 'function') {
  vi.stubGlobal('matchMedia', vi.fn((q: string) => ({ matches: false, media: q, onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() })));
}
// §1.8: runtime hooks are gated by <html data-variant>; the dom tests exercise the game version unless they set another.
beforeEach(() => document.documentElement.setAttribute('data-variant', 'game'));
afterEach(() => { cleanup(); localStorage.clear(); sessionStorage.clear(); });
