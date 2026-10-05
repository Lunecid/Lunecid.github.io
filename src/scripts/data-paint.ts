// The general version's brush textures are deferred (paint.css): painted fields first show their flat paint (the
// tiles' mean colour), and the texture tiles attach only after the load event, when the browser is idle, so they never
// compete with the first render. The hover stroke's tile attaches on the first hover or focus. The swap has no
// transition (the same under reduced motion); without JavaScript the fields stay flat.
export const TEX_ATTR = 'data-paint-tex';
export const STROKE_ATTR = 'data-paint-stroke';

type Idle = (cb: () => void) => void;

export function attachPaint(doc: Document = document, win: Window & typeof globalThis = window): void {
  const root = doc.documentElement;
  const idle: Idle = typeof win.requestIdleCallback === 'function' ? (cb) => win.requestIdleCallback(cb, { timeout: 2000 }) : (cb) => win.setTimeout(cb, 1);
  const attach = (): void => idle(() => root.setAttribute(TEX_ATTR, ''));
  if (doc.readyState === 'complete') attach();
  else win.addEventListener('load', attach, { once: true });

  const stroke = (): void => {
    root.setAttribute(STROKE_ATTR, '');
    doc.removeEventListener('pointerover', stroke);
    doc.removeEventListener('focusin', stroke);
  };
  doc.addEventListener('pointerover', stroke, { passive: true });
  doc.addEventListener('focusin', stroke);
}
