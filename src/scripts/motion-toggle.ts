// The footer "모션 줄이기" toggle (SiteFooter fix rounds 1–3): the visible label never changes (WCAG 2.5.3); state is
// aria-pressed plus an aria-hidden ON/OFF chip; the OS-forced note is shown, and referenced by aria-describedby, only
// while the OS itself forces reduced motion. Shared by SiteFooter and DataFooter (P2-1).
import { isMotionOffStored, osPrefersReduce, setMotionOff, subscribeMotion } from '../lib/motion-pref';

export function initMotionToggles(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-motion-toggle]').forEach((button) => {
    const chip = button.querySelector<HTMLElement>('[data-motion-chip]');
    const note = document.getElementById('motion-os-note');
    const sync = (): void => {
      const osForced = osPrefersReduce();
      const off = osForced || isMotionOffStored();
      button.setAttribute('aria-pressed', String(off));
      button.disabled = osForced;
      if (chip) chip.textContent = off ? 'ON' : 'OFF';
      if (note) note.hidden = !osForced;
      if (osForced) button.setAttribute('aria-describedby', 'motion-os-note');
      else button.removeAttribute('aria-describedby');
    };
    sync();
    button.addEventListener('click', () => {
      setMotionOff(button.getAttribute('aria-pressed') !== 'true');
      sync();
    });
    subscribeMotion(sync); // an OS setting change arrives as MOTION_EVENT, like a click on any toggle
  });
}
