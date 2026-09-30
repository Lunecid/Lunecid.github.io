import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initChooser, isStacked } from '../../src/scripts/chooser';

const rect = (top: number, left: number, height = 100, width = 100): DOMRect =>
  ({ top, left, bottom: top + height, right: left + width, height, width, x: left, y: top, toJSON: () => ({}) }) as DOMRect;

function mount(): [HTMLAnchorElement, HTMLAnchorElement] {
  document.body.innerHTML = `<div data-chooser><a href="/game/" data-choose-variant="game">G</a><a href="/data/" data-choose-variant="data">D</a></div>`;
  const [game, data] = Array.from(document.querySelectorAll<HTMLAnchorElement>('a'));
  game!.addEventListener('click', (e) => e.preventDefault());
  data!.addEventListener('click', (e) => e.preventDefault());
  return [game!, data!];
}
const key = (el: Element, k: string): boolean => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

describe('chooser keyboard and memory (P2-10)', () => {
  let game: HTMLAnchorElement;
  let data: HTMLAnchorElement;
  beforeEach(() => {
    [game, data] = mount();
    initChooser();
  });

  it('side by side: ←/→ move between the halves; ↑/↓ are left to the page', () => {
    vi.spyOn(game, 'getBoundingClientRect').mockReturnValue(rect(0, 0));
    vi.spyOn(data, 'getBoundingClientRect').mockReturnValue(rect(0, 120));
    expect(isStacked(game, data)).toBe(false);
    game.focus();
    expect(key(game, 'ArrowRight')).toBe(false); // default prevented
    expect(document.activeElement).toBe(data);
    key(data, 'ArrowLeft');
    expect(document.activeElement).toBe(game);
    expect(key(game, 'ArrowDown')).toBe(true); // not handled: the page may scroll
    expect(document.activeElement).toBe(game);
  });

  it('stacked: ↑/↓ move too', () => {
    vi.spyOn(game, 'getBoundingClientRect').mockReturnValue(rect(0, 0));
    vi.spyOn(data, 'getBoundingClientRect').mockReturnValue(rect(100, 0));
    expect(isStacked(game, data)).toBe(true);
    game.focus();
    key(game, 'ArrowDown');
    expect(document.activeElement).toBe(data);
    key(data, 'ArrowUp');
    expect(document.activeElement).toBe(game);
  });

  it('a choice is remembered before the navigation', () => {
    data.click();
    expect(localStorage.getItem('sb:variant')).toBe('data');
    game.click();
    expect(localStorage.getItem('sb:variant')).toBe('game');
  });
});
