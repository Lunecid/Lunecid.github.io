import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('dom test setup', () => {
  it('jest-dom matchers are registered', () => {
    render(<button type="button" disabled aria-pressed="false">BGM</button>);
    const button = screen.getByRole('button', { name: 'BGM' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  it('matchMedia is stubbed with matches false', () => {
    expect(typeof window.matchMedia).toBe('function');
    expect(window.matchMedia('(prefers-reduced-motion: reduce)').matches).toBe(false);
  });

  it('storage written by one test is cleared before the next (part 1)', () => {
    localStorage.setItem('sb:motion', 'off');
    sessionStorage.setItem('sb:intro', '1');
    expect(localStorage.getItem('sb:motion')).toBe('off');
  });

  it('storage written by one test is cleared before the next (part 2)', () => {
    expect(localStorage.getItem('sb:motion')).toBeNull();
    expect(sessionStorage.getItem('sb:intro')).toBeNull();
    expect(document.body.innerHTML).toBe('');
  });
});
