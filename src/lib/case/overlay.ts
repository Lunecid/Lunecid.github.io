// src/lib/case/overlay.ts — the case-study overlay's runtime (the lazy chunk case-trigger.ts imports on intent): fetches
// the sheet of the page's language (/case/<id>/<lang>.json), shows it in a native modal <dialog> (a side sheet that
// slides in by transform), and runs the report: stepper (roving tabindex, ←/→/Home/End), scrollspy and progress,
// figures that play when 30 % visible (those inside a closed "details" when it opens), the pipeline autoplay, count-ups
// through formatNumber, hero numbers fitted after the fonts load, redraws on resize that keep final states, the BibTeX
// copy, the AUC tooltip, and the print path. History: opening pushes #case; Back, Esc, the close button and the scrim
// close it; the opener gets focus back. No sound, achievement or analytics event (D13).
// The stylesheet as a URL, linked on first use: a plain CSS import would be inlined into every page that renders a
// trigger (Astro collects the CSS of every module a page's scripts reach), defeating the lazy load.
import cssHref from './overlay.css?url';
import { formatNumber } from '../../i18n/utils';
import type { Lang } from '../../i18n/ui';
import { lockScroll, unlockScroll } from '../scroll-lock';
import { CHARTS, type ChartId, type ChartLabels } from './charts';

interface CaseData {
  lang: Lang;
  html: string;
  labels: ChartLabels;
  say: string[];
  strings: { copy: string; copied: string; copyDone: string; copyFail: string; tipAuc: string };
}
export interface OpenOptions { href: string; push: boolean }

const HASH = '#case';
const LOCK = 'case-overlay';
const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T | null => root.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T[] => [...root.querySelectorAll<T>(sel)];
const RMQ = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
const reduced = (): boolean => !!RMQ?.matches || document.documentElement.dataset.motion === 'reduce';
const nextFrame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

let css: Promise<void> | null = null;
/** The overlay stylesheet, linked once; resolves when it has loaded (so the sheet never shows unstyled). */
function stylesheet(): Promise<void> {
  return (css ??= new Promise<void>((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = cssHref;
    link.addEventListener('load', () => resolve(), { once: true });
    link.addEventListener('error', () => { css = null; link.remove(); reject(new Error('case overlay stylesheet failed')); }, { once: true });
    document.head.appendChild(link);
  }));
}

const data = new Map<string, Promise<CaseData>>();
/** The sheet of one case and language, fetched once per page. */
function sheetData(id: string, lang: Lang): Promise<CaseData> {
  const key = `${id}/${lang}`;
  let hit = data.get(key);
  if (!hit) {
    hit = fetch(`/case/${encodeURIComponent(id)}/${lang}.json`, { credentials: 'same-origin' }).then((r) => {
      if (!r.ok) throw new Error(`case sheet ${key}: HTTP ${r.status}`);
      return r.json() as Promise<CaseData>;
    });
    hit.catch(() => data.delete(key)); // a failed fetch may be retried on the next intent
    data.set(key, hit);
  }
  return hit;
}

const pageLang = (): Lang => (document.documentElement.lang === 'en' ? 'en' : 'ko');
/** Warms the sheet of the page's language (intent: hover, focus, touch). */
export function prefetch(id: string): void {
  void sheetData(id, pageLang()).catch(() => undefined);
  void stylesheet().catch(() => undefined);
}

let ui: Sheet | null = null;
export const isOpen = (): boolean => !!ui?.open;

/** Opens the sheet over the page; rejects when the sheet cannot load (the trigger then follows the link). */
export async function openCase(opener: HTMLElement, id: string, options: OpenOptions): Promise<void> {
  const [d] = await Promise.all([sheetData(id, pageLang()), stylesheet()]);
  if (!ui || ui.key !== `${id}/${d.lang}`) {
    ui?.destroy();
    ui = new Sheet(`${id}/${d.lang}`, d);
  }
  await ui.show(opener, options);
}

/** Back (or a hash change away from #case) closes the sheet; a return to #case is the trigger's to reopen. */
addEventListener('popstate', () => {
  if (ui?.open && location.hash !== HASH) ui.hide({ fromHistory: true });
});

class Sheet {
  readonly key: string;
  open = false;
  private readonly d: CaseData;
  private readonly dialog: HTMLDialogElement;
  private readonly sheet: HTMLElement;
  private readonly body: HTMLElement;
  private readonly steps: HTMLButtonElement[];
  private readonly chapters: HTMLElement[];
  private readonly vizzes: HTMLElement[];
  private readonly played = new WeakSet<Element>();
  private readonly timers = new WeakMap<Element, number>();
  private opener: HTMLElement | null = null;
  private pushed = false;
  private drawnWidth = -1;
  private closing = 0;
  private io: IntersectionObserver | null = null;
  private spyRaf = 0;
  private resizeTimer = 0;
  private reopened: HTMLDetailsElement[] = [];
  private readonly off: (() => void)[] = [];

  constructor(key: string, d: CaseData) {
    this.key = key;
    this.d = d;
    document.body.insertAdjacentHTML('beforeend', d.html);
    this.dialog = document.body.lastElementChild as HTMLDialogElement;
    this.sheet = $('.cs__sheet', this.dialog)!;
    this.body = $('.cs__body', this.dialog)!;
    this.steps = $$<HTMLButtonElement>('.cs-steps button', this.dialog);
    this.chapters = $$('.cs-ch', this.dialog);
    this.vizzes = $$('.cs-viz[data-viz]', this.dialog);
    this.bind();
  }

  destroy(): void {
    this.off.forEach((fn) => fn());
    this.io?.disconnect();
    this.dialog.remove();
  }

  private on<K extends keyof HTMLElementEventMap>(target: EventTarget, type: K | string, fn: (e: Event) => void, opts?: AddEventListenerOptions): void {
    target.addEventListener(type, fn, opts);
    this.off.push(() => target.removeEventListener(type, fn, opts));
  }

  async show(opener: HTMLElement, { href, push }: OpenOptions): Promise<void> {
    this.opener = opener;
    const paper = $<HTMLAnchorElement>('[data-case-paper]', this.dialog);
    if (paper) paper.href = href.split('#')[0]!;
    if (this.open) return;
    window.clearTimeout(this.closing);
    this.open = true;
    if (push && location.hash !== HASH) {
      history.pushState({ ...(typeof history.state === 'object' && history.state ? history.state : {}), casePushed: true }, '', HASH);
      this.pushed = true;
    } else this.pushed = false;
    lockScroll(LOCK);
    if (!this.dialog.open) this.dialog.showModal();
    this.sheet.focus({ preventScroll: true });
    // The sheet starts sliding in first; the figures below the cover are drawn and armed while it moves.
    if (!reduced()) await nextFrame();
    this.dialog.classList.add('is-open');
    this.drawAll();
    this.fitHeroes();
    void document.fonts?.ready.then(() => this.fitHeroes());
    this.spy();
    this.observe();
    this.runCounts($('[data-cover]', this.dialog)!, reduced());
  }

  /** Closes with the slide-out; `fromHistory` when Back already left #case. */
  hide({ fromHistory = false } = {}): void {
    if (!this.open) return;
    this.open = false;
    this.dialog.classList.remove('is-open');
    const finish = () => {
      if (this.dialog.open) this.dialog.close();
      unlockScroll(LOCK);
      if (this.opener?.isConnected) this.opener.focus({ preventScroll: true });
    };
    if (reduced()) finish();
    else this.closing = window.setTimeout(finish, this.duration());
    if (!fromHistory && location.hash === HASH) {
      if (this.pushed && (history.state as { casePushed?: boolean } | null)?.casePushed) history.back();
      else history.replaceState(history.state, '', location.pathname + location.search);
    }
    this.pushed = false;
  }

  private duration(): number {
    const ms = parseFloat(getComputedStyle(this.sheet).transitionDuration) * 1000;
    return (Number.isFinite(ms) ? ms : 380) + 40;
  }

  // ── events ──
  private bind(): void {
    const dlg = this.dialog;
    this.on(dlg, 'cancel', (e) => { e.preventDefault(); this.hide(); });
    this.on(dlg, 'close', () => { if (this.open) { this.open = false; dlg.classList.remove('is-open'); unlockScroll(LOCK); } });
    this.on(dlg, 'click', (e) => {
      const t = e.target as Element;
      if (t.closest('[data-close]')) { this.hide(); return; }
      const paper = t.closest<HTMLAnchorElement>('[data-case-paper]');
      if (paper && paper.href.split('#')[0] === location.href.split('#')[0]) { e.preventDefault(); this.hide(); return; }
      const go = t.closest<HTMLElement>('[data-go]');
      if (go) { this.go(go.dataset.go!); return; }
      const replay = t.closest('[data-replay], [data-play]');
      if (replay) { const viz = replay.closest<HTMLElement>('.cs-viz'); if (viz) this.play(viz); return; }
      const stage = t.closest<HTMLElement>('[data-stage]');
      if (stage) { const viz = stage.closest<HTMLElement>('.cs-viz')!; window.clearTimeout(this.timers.get(viz)); this.setStage(viz, Number(stage.dataset.stage)); return; }
      if (t.closest('[data-copy]')) void this.copyBibtex();
    });
    this.on(dlg, 'keydown', (e) => this.keydown(e as KeyboardEvent));
    this.on(this.body, 'scroll', () => {
      if (this.spyRaf) return;
      this.spyRaf = requestAnimationFrame(() => { this.spyRaf = 0; this.spy(); });
    }, { passive: true });
    for (const details of $$<HTMLDetailsElement>('details.cs-more', dlg)) {
      this.on(details, 'toggle', () => {
        if (!details.open) return;
        for (const viz of $$('.cs-viz[data-viz]', details)) { this.draw(viz); this.play(viz); this.played.add(viz); }
      });
    }
    this.bindTip();
    this.on(window, 'resize', () => {
      window.clearTimeout(this.resizeTimer);
      this.resizeTimer = window.setTimeout(() => {
        if (!this.open) return;
        this.drawnWidth = -1;
        this.drawAll();
        this.fitHeroes();
      }, 120);
    });
    this.on(window, 'beforeprint', () => this.beforePrint());
    this.on(window, 'afterprint', () => this.afterPrint());
  }

  private keydown(e: KeyboardEvent): void {
    if (e.key === 'Tab') {
      const focusable = $$('a[href], button:not([disabled]), summary, [tabindex]:not([tabindex="-1"])', this.sheet).filter((el) =>
        el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && !(el.closest('details:not([open])') && el.tagName !== 'SUMMARY'));
      if (focusable.length === 0) return;
      const first = focusable[0]!, last = focusable[focusable.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === this.sheet)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
      else if (!this.sheet.contains(active)) { e.preventDefault(); first.focus(); }
      return;
    }
    const i = this.steps.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    const n = this.steps.length;
    const j = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (i + 1) % n
      : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? (i - 1 + n) % n
        : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1;
    if (j < 0) return;
    e.preventDefault();
    this.steps.forEach((b, k) => { b.tabIndex = k === j ? 0 : -1; });
    this.steps[j]!.focus();
  }

  // ── stepper, scrollspy, progress ──
  private setCurrent(id: string): void {
    for (const b of this.steps) {
      const on = b.dataset.go === id;
      if (on) b.setAttribute('aria-current', 'step');
      else b.removeAttribute('aria-current');
      b.tabIndex = on ? 0 : -1;
    }
  }

  private go(id: string): void {
    const ch = this.dialog.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
    if (!ch) return;
    this.body.scrollTo({ top: ch.offsetTop, behavior: reduced() ? 'auto' : 'smooth' });
    this.setCurrent(id);
    $('.cs-ch__title', ch)?.focus({ preventScroll: true });
  }

  private spy(): void {
    const b = this.body;
    const max = b.scrollHeight - b.clientHeight;
    const bar = $('.cs__progress i', this.dialog);
    if (bar) bar.style.transform = `scaleX(${max > 0 ? (b.scrollTop / max).toFixed(4) : 0})`;
    const mark = b.scrollTop + b.clientHeight * 0.35;
    let cur = this.chapters[0]!.id;
    for (const c of this.chapters) if (c.offsetTop <= mark) cur = c.id;
    if (max > 0 && b.scrollTop >= max - 2) cur = this.chapters[this.chapters.length - 1]!.id;
    this.setCurrent(cur);
  }

  // ── figures ──
  private drawAll(): void {
    const width = this.body.clientWidth;
    if (width === this.drawnWidth) return;
    this.drawnWidth = width;
    for (const viz of this.vizzes) this.draw(viz);
  }

  private draw(viz: HTMLElement): void {
    const plot = $('[data-plot]', viz);
    const id = viz.dataset.viz as ChartId;
    const render = CHARTS[id];
    if (!plot || !render) return;
    const w = Math.max(240, Math.floor(plot.clientWidth || viz.clientWidth));
    const { h, svg } = render(w, this.d.labels, `cs-${id}`);
    plot.innerHTML = `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true" focusable="false">${svg}</svg>`;
    if (id === 'pipe') this.setStage(viz, this.timers.has(viz) ? Number(viz.dataset.stage ?? 5) : 5, false);
  }

  /** Jumps to the start state without transitions (long staggers would otherwise keep marks visible while arming). */
  private arm(...vizzes: HTMLElement[]): void {
    for (const viz of vizzes) viz.classList.add('is-snap', 'is-pre');
    void this.body.offsetWidth; // one style flush for the whole batch
    for (const viz of vizzes) viz.classList.remove('is-snap');
  }

  private play(viz: HTMLElement): void {
    if (reduced()) {
      viz.classList.remove('is-pre');
      this.runCounts(viz, true);
      if (viz.dataset.viz === 'pipe') this.setStage(viz, 5, false);
      return;
    }
    this.arm(viz);
    requestAnimationFrame(() => requestAnimationFrame(() => viz.classList.remove('is-pre')));
    this.runCounts(viz, false);
    if (viz.dataset.viz === 'pipe') this.autoplayPipe(viz);
  }

  private observe(): void {
    this.io?.disconnect();
    this.io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const el = e.target as HTMLElement;
        this.io?.unobserve(el);
        if (this.played.has(el)) continue;
        this.played.add(el);
        if (el.matches('.cs-viz')) this.play(el);
        else this.runCounts(el, reduced());
      }
    }, { root: this.body, threshold: 0.3 });
    const waiting = this.vizzes.filter((viz) => !viz.closest('details') && !this.played.has(viz));
    if (!reduced()) this.arm(...waiting);
    for (const viz of waiting) this.io.observe(viz);
    for (const h of $$('[data-hero-count]', this.dialog)) if (!this.played.has(h)) this.io.observe(h);
  }

  private runCounts(scope: Element, instant: boolean): void {
    for (const el of $$('[data-count]', scope)) {
      const to = Number(el.dataset.count);
      const dec = Number(el.dataset.dec ?? 0);
      const show = (v: number) => { el.textContent = dec ? v.toFixed(dec) : formatNumber(Math.round(v), this.d.lang); };
      if (instant) { show(to); continue; }
      const from = dec ? 0.5 : 0, t0 = performance.now(), D = 1100;
      const tick = (t: number) => {
        const p = Math.min(1, (t - t0) / D), eased = 1 - (1 - p) ** 3;
        show(from + (to - from) * eased);
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
  }

  // ── pipeline ──
  private setStage(viz: HTMLElement, k: number, announce = true): void {
    viz.dataset.stage = String(k);
    const plot = $('[data-plot]', viz);
    for (let i = 1; i <= 5; i++) plot?.classList.toggle(`on${i}`, i <= k);
    for (const b of $$('[data-stage]', viz)) {
      const n = Number(b.dataset.stage);
      b.setAttribute('aria-pressed', String(n === k));
      b.classList.toggle('is-done', n < k);
    }
    const say = $('[data-say]', viz);
    if (say && (announce || !say.innerHTML)) say.innerHTML = this.d.say[k - 1] ?? '';
  }

  private autoplayPipe(viz: HTMLElement): void {
    window.clearTimeout(this.timers.get(viz));
    let k = 1;
    this.setStage(viz, 1);
    const step = () => {
      k++;
      if (k > 5) { this.timers.delete(viz); return; }
      this.setStage(viz, k);
      this.timers.set(viz, window.setTimeout(step, 1300));
    };
    this.timers.set(viz, window.setTimeout(step, 1100));
  }

  // ── hero numbers: the largest size (≤ the stylesheet's) whose final text still fits the rail ──
  private fitHeroes(): void {
    for (const el of $$('.cs-hero__v', this.dialog)) {
      const cnt = $('[data-count]', el);
      const shown = cnt?.textContent ?? null;
      if (cnt) cnt.textContent = formatNumber(Number(cnt.dataset.count), this.d.lang);
      el.style.fontSize = '';
      const max = parseFloat(getComputedStyle(el).fontSize);
      const avail = el.parentElement?.clientWidth ?? 0;
      const need = el.getBoundingClientRect().width;
      if (avail > 0 && need > avail) el.style.fontSize = `${(Math.max(36, Math.floor((max * avail) / need)) / 16).toFixed(4)}rem`;
      if (cnt && shown !== null) cnt.textContent = shown;
    }
  }

  // ── AUC tooltip ──
  private bindTip(): void {
    const viz = $('.cs-viz[data-viz="auc"]', this.dialog);
    const plot = viz && $('[data-plot]', viz);
    if (!viz || !plot) return;
    const tip = document.createElement('div');
    tip.className = 'cs-tip';
    tip.setAttribute('aria-hidden', 'true');
    viz.appendChild(tip);
    this.on(plot, 'pointermove', (e) => {
      const ev = e as PointerEvent;
      const hit = (ev.target as Element).closest('.cs-hit');
      if (!hit) { tip.classList.remove('is-on'); return; }
      const [model, view, auc] = (hit.getAttribute('data-tip') ?? '').split('|');
      tip.textContent = `${model} · ${view} · ${this.d.strings.tipAuc} `;
      const b = document.createElement('b');
      b.textContent = auc ?? '';
      tip.appendChild(b);
      const box = viz.getBoundingClientRect();
      const x = Math.min(ev.clientX - box.left + 12, box.width - tip.offsetWidth - 6);
      tip.style.left = `${Math.max(6, x)}px`;
      tip.style.top = `${ev.clientY - box.top - 36}px`;
      tip.classList.add('is-on');
    });
    this.on(plot, 'pointerleave', () => tip.classList.remove('is-on'));
  }

  // ── BibTeX ──
  private async copyBibtex(): Promise<void> {
    const status = $('[data-copy-status]', this.dialog);
    const button = $('[data-copy]', this.dialog);
    const s = this.d.strings;
    try {
      await navigator.clipboard.writeText($('#cs-bibtex', this.dialog)?.textContent ?? '');
      if (status) status.textContent = s.copyDone;
      if (button) button.textContent = s.copied;
    } catch {
      if (status) status.textContent = s.copyFail;
    }
    window.setTimeout(() => { if (button) button.textContent = s.copy; }, 1600);
  }

  // ── print (D12) ──
  private beforePrint(): void {
    if (!this.open) return;
    document.documentElement.classList.add('cs-printing');
    this.reopened = $$<HTMLDetailsElement>('details', this.dialog).filter((d) => !d.open);
    for (const d of this.reopened) d.open = true;
    for (const viz of this.vizzes) { this.draw(viz); viz.classList.remove('is-pre'); if (viz.dataset.viz === 'pipe') this.setStage(viz, 5, false); }
    this.runCounts(this.dialog, true);
  }

  private afterPrint(): void {
    document.documentElement.classList.remove('cs-printing');
    for (const d of this.reopened) d.open = false;
    this.reopened = [];
  }
}
