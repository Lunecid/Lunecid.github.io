// Contrast audit from computed colours (a port of the game palette prototype's audit.cjs): every visible text element's
// colour against its opaque-composited ground (ancestor backgrounds; the fill of a .cut plate, which a ::before or
// ::after layer paints). Runs in the page: pass it to page.evaluate. Text over an image is reported apart (img: true).
export interface AuditRow { sel: string; txt: string; fg: string; bg: string; ratio: number; img: boolean }

export function contrastAudit(): AuditRow[] {
  const parse = (s: string): number[] | null => {
    const m = /rgba?\(([^)]+)\)/.exec(s);
    if (!m) return null;
    const v = m[1]!.split(/[ ,/]+/).filter(Boolean).map(Number);
    return [v[0]!, v[1]!, v[2]!, v.length > 3 ? v[3]! : 1];
  };
  const over = (top: number[], bot: number[]) => [0, 1, 2].map((i) => top[i]! * top[3]! + bot[i]! * (1 - top[3]!));
  const lum = (c: number[]) => {
    const f = (x: number) => { const s = x / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(c[0]!) + 0.7152 * f(c[1]!) + 0.0722 * f(c[2]!);
  };
  const ratio = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05); };
  const groundOf = (el: Element) => {
    const chain: Element[] = [];
    for (let e: Element | null = el; e; e = e.parentElement) chain.unshift(e);
    let c = [255, 255, 255];
    let img = false;
    for (const e of chain) {
      const cs = getComputedStyle(e);
      const bc = parse(cs.backgroundColor);
      if (bc && bc[3]! > 0) c = over(bc, c);
      // a cut-corner plate: the fill is a pseudo-element layer (hud.css .cut::before; .cut--line paints it on ::after)
      if (e.classList.contains('cut')) {
        for (const pseudo of ['::before', '::after']) {
          const p = parse(getComputedStyle(e, pseudo).backgroundColor);
          if (p && p[3]! > 0 && getComputedStyle(e, pseudo).content !== 'none') c = over(p, c);
        }
      }
      if ((cs.backgroundImage !== 'none' && !/gradient\(/.test(cs.backgroundImage)) || e.tagName === 'IMG' || e.tagName === 'PICTURE') img = true;
    }
    return { c, img };
  };
  const out: AuditRow[] = [];
  const seen = new Set<Element>();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    if (!t.textContent!.trim()) continue;
    const el = t.parentElement;
    if (!el || seen.has(el)) continue;
    seen.add(el);
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (r.width < 1 || r.height < 1 || cs.visibility === 'hidden') continue;
    if (el.closest('.sr-only, [hidden], .crt, svg, .skip-link, .edge, dialog:not([open])')) continue;
    let hidden = false;
    for (let e: Element | null = el; e; e = e.parentElement) { const s = getComputedStyle(e); if (s.display === 'none' || Number(s.opacity) === 0) { hidden = true; break; } }
    if (hidden) continue;
    const fg = parse(cs.color)!;
    const { c: bg, img } = groundOf(el);
    const solid = fg[3]! < 1 ? over(fg, bg) : fg.slice(0, 3);
    out.push({
      sel: `${el.tagName.toLowerCase()}${typeof el.className === 'string' && el.className ? `.${el.className.split(' ')[0]}` : ''}`,
      txt: t.textContent!.trim().slice(0, 24),
      fg: `rgb(${solid.map(Math.round).join(', ')})`, bg: `rgb(${bg.map(Math.round).join(', ')})`, ratio: ratio(solid, bg), img,
    });
  }
  return out;
}
