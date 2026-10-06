// src/scripts/case-trigger.ts — side-effect module (CaseTrigger.astro includes it). Every element with data-case="<id>"
// opens that publication's case-study overlay: a plain left click on a link (or a click on the paper page's button) is
// taken over; modifier and middle clicks and no-JS keep the link to the paper page. Intent (pointer over, focus,
// touch) loads the lazy chunk and warms the sheet once; nothing is requested before it. A page loaded with #case, or
// a history step back to it, opens the sheet. When the chunk or the sheet cannot load, the link is followed: never a
// dead click.
const SEL = '[data-case]';
type Overlay = typeof import('../lib/case/overlay');
let chunk: Promise<Overlay> | null = null;
const load = (): Promise<Overlay> => (chunk ??= import('../lib/case/overlay'));
const triggerOf = (target: EventTarget | null): HTMLElement | null => (target instanceof Element ? target.closest<HTMLElement>(SEL) : null);
const hrefOf = (el: HTMLElement): string => (el instanceof HTMLAnchorElement ? el.href : location.href);

function open(el: HTMLElement, push: boolean): void {
  load()
    .then((m) => (m.isOpen() ? undefined : m.openCase(el, el.dataset.case!, { href: hrefOf(el), push })))
    .catch(() => {
      if (el instanceof HTMLAnchorElement) location.assign(el.href);
    });
}

let warmed = false;
const warm = (e: Event): void => {
  const el = triggerOf(e.target);
  if (warmed || !el) return;
  warmed = true;
  load().then((m) => m.prefetch(el.dataset.case!), () => undefined);
};
for (const type of ['pointerover', 'focusin', 'touchstart']) document.addEventListener(type, warm, { passive: true });

document.addEventListener('click', (e) => {
  const el = triggerOf(e.target);
  if (!el || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  open(el, true);
});

/** #case on load or on a history step: the paper page's own button, else the first trigger of the page. */
const fromHash = (): void => {
  if (location.hash !== '#case') return;
  const el = document.querySelector<HTMLElement>('button[data-case]') ?? document.querySelector<HTMLElement>(SEL);
  if (el) open(el, false);
};
addEventListener('popstate', fromHash);
fromHash();
