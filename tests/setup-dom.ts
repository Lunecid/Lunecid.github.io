import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
if (typeof window.matchMedia !== 'function') {
  vi.stubGlobal('matchMedia', vi.fn((q: string) => ({ matches: false, media: q, onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() })));
}
afterEach(() => { cleanup(); localStorage.clear(); sessionStorage.clear(); });
