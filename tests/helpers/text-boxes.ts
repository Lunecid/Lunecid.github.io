// Visible text and control boxes of a page, clipped by their clipping ancestors and the viewport (a port of the game
// palette prototype's edgecheck.cjs / tilt-check.cjs geometry). Runs in the page: pass it to page.evaluate.
// Returns [left, top, right, bottom, label] per text-node line box and per focusable control, skipping `skip`'s subtree.
export type TextBox = [number, number, number, number, string];

export function visibleTextBoxes(skip: string | null): TextBox[] {
  const skipEl = skip ? document.querySelector(skip) : null;
  const clipR = (el: Element, r: DOMRect): [number, number, number, number] | null => {
    let [l, t, rr, bb] = [r.left, r.top, r.right, r.bottom];
    for (let a: Element | null = el; a && a !== document.documentElement; a = a.parentElement) {
      const s = getComputedStyle(a);
      if (s.clip && s.clip !== 'auto') return null;
      if (s.overflowX !== 'visible' || s.overflowY !== 'visible' || s.clipPath !== 'none') {
        const q = a.getBoundingClientRect();
        if (s.overflowX !== 'visible' || s.clipPath !== 'none') { l = Math.max(l, q.left); rr = Math.min(rr, q.right); }
        if (s.overflowY !== 'visible' || s.clipPath !== 'none') { t = Math.max(t, q.top); bb = Math.min(bb, q.bottom); }
      }
    }
    l = Math.max(l, 0); rr = Math.min(rr, innerWidth); t = Math.max(t, 0); bb = Math.min(bb, innerHeight);
    return rr - l > 1 && bb - t > 1 ? [l, t, rr, bb] : null;
  };
  const vis = (el: Element) => {
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0;
  };
  const out: TextBox[] = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode() as Text | null; n; n = w.nextNode() as Text | null) {
    const parent = n.parentElement;
    if (!n.data.trim() || !parent || (skipEl && skipEl.contains(n)) || !vis(parent)) continue;
    if (parent.closest('.sr-only, [hidden]')) continue;
    const rg = document.createRange();
    rg.selectNodeContents(n);
    for (const r of Array.from(rg.getClientRects())) {
      const c = clipR(parent, r);
      if (c) out.push([...c, n.data.trim().slice(0, 24)]);
    }
  }
  for (const el of Array.from(document.querySelectorAll('a, button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])'))) {
    if ((skipEl && skipEl.contains(el)) || !vis(el) || el.closest('.sr-only')) continue;
    const c = clipR(el, el.getBoundingClientRect());
    if (c) out.push([...c, `<${el.tagName.toLowerCase()}>${(el.textContent ?? '').trim().slice(0, 16)}`]);
  }
  return out;
}
