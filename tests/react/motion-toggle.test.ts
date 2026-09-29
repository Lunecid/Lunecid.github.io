import { beforeEach, describe, expect, it } from 'vitest';
import { STORAGE_KEYS } from '../../src/config';
import { initMotionToggles } from '../../src/scripts/motion-toggle';

describe('initMotionToggles (P2-1: the footer motion toggle, shared by SiteFooter and DataFooter)', () => {
  beforeEach(() => {
    document.documentElement.setAttribute('data-motion', 'full');
    document.body.innerHTML =
      '<button type="button" aria-pressed="false" data-motion-toggle>모션 줄이기 <span data-motion-chip>OFF</span></button>' +
      '<p id="motion-os-note" hidden>기기 설정으로 꺼져 있습니다.</p>';
  });

  it('turns motion off and back on, keeping aria-pressed, the chip, storage and <html data-motion> in sync', () => {
    initMotionToggles();
    const button = document.querySelector<HTMLButtonElement>('[data-motion-toggle]')!;
    const chip = button.querySelector('[data-motion-chip]')!;
    button.click();
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(chip.textContent).toBe('ON');
    expect(localStorage.getItem(STORAGE_KEYS.motion)).toBe('off');
    expect(document.documentElement.getAttribute('data-motion')).toBe('reduce');
    button.click();
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(chip.textContent).toBe('OFF');
    expect(localStorage.getItem(STORAGE_KEYS.motion)).toBe('on');
  });

  it('points aria-describedby at the OS note only while the OS forces reduced motion (never here: matchMedia is false)', () => {
    initMotionToggles();
    const button = document.querySelector('[data-motion-toggle]')!;
    expect(button.hasAttribute('aria-describedby')).toBe(false);
    expect((document.getElementById('motion-os-note') as HTMLElement).hidden).toBe(true);
  });
});
