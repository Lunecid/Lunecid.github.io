// The chooser's keyboard and memory (spec §6): ←/→ move between the two halves, and ↑/↓ as well while they are stacked
// (phones); Enter follows the focused link (native); Tab keeps the DOM order, game → data. A choice is remembered
// (sb:variant, P1-14) before the navigation. Without JS the halves are plain links.
import { rememberVariant } from '../lib/variant-pref';
import { isVariantId } from '../variants/ids';

/**
 * True when the second half sits below the first (the stacked phone layout). Compared against the first half's middle,
 * not its bottom edge: the focused half is scaled up (1.02), so its drawn box reaches a few pixels past its neighbour.
 */
export function isStacked(first: Element, second: Element): boolean {
  const a = first.getBoundingClientRect();
  return second.getBoundingClientRect().top >= a.top + a.height / 2;
}

export function initChooser(root: ParentNode = document): void {
  const container = root.querySelector<HTMLElement>('[data-chooser]');
  if (!container) return;
  const links = Array.from(container.querySelectorAll<HTMLAnchorElement>('a[data-choose-variant]'));
  const [first, second] = links;
  if (!first || !second || links.length !== 2) return;
  container.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (!links.includes(document.activeElement as HTMLAnchorElement)) return;
    const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown';
    const back = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
    if (!forward && !back) return;
    if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && !isStacked(first, second)) return;
    event.preventDefault();
    (forward ? second : first).focus();
  });
  for (const link of links) {
    link.addEventListener('click', () => {
      const variant = link.dataset.chooseVariant;
      if (isVariantId(variant)) rememberVariant(variant);
    });
  }
}
