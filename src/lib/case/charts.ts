// src/lib/case/charts.ts — the case-study overlay's charts (ported from the approved v4 prototype's renderers). Each is a
// pure (width, labels, id) → { h, svg } function: numbers from src/data/research/cog-2026-case.ts, words from the
// resolved copy (chartLabels), colours only as var(--cs-*), text sizes only through classes (12 px and up), motion only
// through the stylesheet's classes (cs-grow, cs-fade, … armed by .is-pre; lines draw on through a growing clip rect).
// Narrow layouts are chosen from the measured label widths (textWidth), never from the language.
import type { Lang } from '../../i18n/ui';
import {
  CASE_FACTS, CHANCE_AUC, PAIRS, PERFECT_AUC, fmtAuc, gapSteps, killGap, neuralBest, neuralRange, overallAuc, pairCounts,
} from '../../data/research/cog-2026-case';
import type { CaseCopy } from '../../data/copy/case/cog-2026';

export type ChartLabels = CaseCopy['charts'] & { views: Record<string, string> };
export type ChartId = 'res' | 'sampling' | 'pipe' | 'win' | 'split' | 'auc' | 'gap' | 'waffle' | 'gauge' | 'strata' | 'gap-ruler';
export interface ChartOut { h: number; svg: string }
export type Renderer = (w: number, L: ChartLabels, id: string) => ChartOut;

/** The chart words of one language (the copy's `charts`, resolved) plus the model input views of the AUC table. */
export function chartLabels(charts: CaseCopy['charts'], lang: Lang): ChartLabels {
  return { ...charts, views: Object.fromEntries(overallAuc.map((r) => [r.id, r.view[lang]])) };
}

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const r1 = (v: number): string => String(Math.round(v * 10) / 10);
const SEC = ' s';
const S = CASE_FACTS.snapshotSec;
const SPAN = 2 * S; // the illustrated axis: two snapshot intervals

/**
 * Estimated advance width of a label in the UI face (Open Sans / SB Sans metrics, averaged): Hangul 1 em, digits and
 * capitals about .62 em, lower case .53 em, narrow punctuation .3 em. Errs wide, so a branch that fits here fits on screen.
 */
export function textWidth(text: string, px = 12): number {
  let em = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp >= 0x1100) em += cp >= 0x2190 && cp < 0x2200 ? 1 : cp >= 0x2000 && cp < 0x2190 ? 0.62 : cp >= 0x25a0 && cp < 0x2600 ? 0.8 : 1;
    else if (ch === ' ') em += 0.28;
    else if (/[il.,:;'|!()[\]·]/.test(ch)) em += 0.32;
    else if (/[0-9A-Z+−–=≤≥×%]/.test(ch)) em += 0.64;
    else if (/[mwMW]/.test(ch)) em += 0.86;
    else em += 0.55;
  }
  return em * px;
}

/** <text> with the chart's classes; `cls` adds size/weight/colour classes (cs-f13, cs-b6, cs-t0, …). */
const text = (x: number, y: number, body: string, cls = '', anchor?: 'middle' | 'end', extra = ''): string =>
  `<text${cls ? ` class="${cls}"` : ''} x="${r1(x)}" y="${r1(y)}"${anchor ? ` text-anchor="${anchor}"` : ''}${extra}>${esc(body)}</text>`;
const anim = (kind: string, i: number): string => `cs-a cs-${kind}" style="--i:${r1(i)}`;

/** A path drawn on left to right: clipped by a rect that grows from scaleX(0). */
function wiped(id: string, d: string, attrs: string, i: number, box: { x: number; y: number; w: number; h: number }, long = false): string {
  return `<clipPath id="${id}"><rect class="cs-wipe${long ? ' cs-wipe--long' : ''}" style="--i:${i}" x="${r1(box.x)}" y="${r1(box.y)}" width="${r1(box.w)}" height="${r1(box.h)}"/></clipPath>`
    + `<path clip-path="url(#${id})" d="${d}" ${attrs}/>`;
}

// ── ch1: the two resolutions of the public records (schematic; only the 60 s spacing and the 30 s window are real) ──
const res: Renderer = (w, L) => {
  const col = Math.max(textWidth(L.snapshots), textWidth(L.events)) + 12;
  const Rr = 12, x = (t: number) => col + (t / SPAN) * (w - col - Rr);
  const y1 = 44, y2 = 88, ya = 120;
  const ev = [9, 22, 27, 51, 73, 76, 101, 113].map((t) => (t * SPAN) / 120); // illustrative positions
  let s = `<rect class="${anim('grow', 2)}" data-t0="40" data-t1="${40 + CASE_FACTS.windowSec}" x="${r1(x(40))}" y="18" width="${r1(x(40 + CASE_FACTS.windowSec) - x(40))}" height="${ya - 24}" fill="var(--cs-cy-10)" stroke="var(--cs-cy-dim)" stroke-dasharray="3 3"/>`;
  s += text((x(40) + x(40 + CASE_FACTS.windowSec)) / 2, 13, L.window, `cs-cy cs-b6 ${anim('fade', 3)}`, 'middle');
  s += text(0, y1 + 4, L.snapshots, 'cs-t1') + text(0, y2 + 4, L.events, 'cs-t1');
  s += `<line class="cs-grid" x1="${r1(col)}" x2="${w - Rr}" y1="${y1}" y2="${y1}"/><line class="cs-grid" x1="${r1(col)}" x2="${w - Rr}" y1="${y2}" y2="${y2}"/>`;
  [0, S, SPAN].forEach((t, i) => { s += `<rect class="${anim('pop', i)}" x="${r1(x(t) - 7)}" y="${y1 - 7}" width="14" height="14" fill="var(--cs-cy)"/>`; });
  ev.forEach((t, i) => { s += `<line class="${anim('fade', 4 + i * 0.6)}" x1="${r1(x(t))}" x2="${r1(x(t))}" y1="${y2 - 9}" y2="${y2 + 9}" stroke="var(--cs-t1)" stroke-width="2"/>`; });
  s += `<line class="cs-axis" x1="${r1(col)}" x2="${w - Rr}" y1="${ya}" y2="${ya}"/>`;
  [0, S, SPAN].forEach((t) => {
    s += `<line class="cs-axis" x1="${r1(x(t))}" x2="${r1(x(t))}" y1="${ya}" y2="${ya + 4}"/>`;
    s += text(x(t), ya + 18, `${t}${SEC}`, 'cs-num', t === 0 ? undefined : t === SPAN ? 'end' : 'middle');
  });
  return { h: 150, svg: s };
};

// ── ch1: what 60 s sampling keeps (schematic curves; samples at 0, 60, 120 s; the 30 s window at 40–70 s) ──
const smpFast = (t: number): number => 0.5 + 0.2 * Math.sin((2 * Math.PI * t) / 11 + 0.4) + 0.13 * Math.sin((2 * Math.PI * t) / 5.3 + 1.1) + 0.07 * Math.sin((2 * Math.PI * t) / 3.7 + 2.0);
const smpSlow = (t: number): number => 0.1 + 0.55 * (t / SPAN) + 0.18 / (1 + Math.exp(-(t - (80 * SPAN) / 120) / 4));
const sampling: Renderer = (w, L, id) => {
  const l = 8, r = 8, X = (t: number) => l + (t / SPAN) * (w - l - r);
  const SAMPLES = [0, S, SPAN];
  // a panel head and its verdict share a line when both fit; otherwise the verdict takes its own line
  const stackA = textWidth(L.fast) + textWidth(L.fastVerdict, 12) + 16 > w;
  const stackB = textWidth(L.slow) + textWidth(L.slowVerdict, 12) + 16 > w;
  const dA = stackA ? 16 : 0, dB = dA + (stackB ? 16 : 0);
  const bandTop = 18;
  const A = { head: 38, y0: 48 + dA, y1: 128 + dA };
  const B = { head: 158 + dA, y0: 168 + dB, y1: 222 + dB };
  const ay = 236 + dB;
  const dt = w < 420 ? 0.4 : 0.25;
  const fv: [number, number][] = [];
  for (let t = 0; t <= SPAN + 1e-9; t += dt) fv.push([t, smpFast(t)]);
  const fmin = Math.min(...fv.map((p) => p[1])), fmax = Math.max(...fv.map((p) => p[1]));
  const YA = (v: number) => A.y1 - ((v - fmin) / (fmax - fmin)) * (A.y1 - A.y0);
  const YB = (v: number) => B.y1 - v * (B.y1 - B.y0);
  const path = (pts: [number, number][]) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
  const fast = path(fv.map(([t, v]) => [X(t), YA(v)]));
  const sv: [number, number][] = [];
  for (let t = 0; t <= SPAN + 1e-9; t += 1) sv.push([X(t), YB(smpSlow(t))]);
  const slow = path(sv);
  const w0 = 40, w1 = 40 + CASE_FACTS.windowSec;
  let s = `<rect class="${anim('grow', 3)}" data-t0="${w0}" data-t1="${w1}" x="${r1(X(w0))}" y="${bandTop + 6}" width="${r1(X(w1) - X(w0))}" height="${ay - bandTop - 6}" fill="var(--cs-cy-10)" stroke="var(--cs-cy-dim)" stroke-dasharray="3 3"/>`;
  s += text((X(w0) + X(w1)) / 2, bandTop, L.window, `cs-t0 cs-b6 ${anim('fade', 4)}`, 'middle');
  SAMPLES.forEach((t) => { s += `<line class="cs-grid" x1="${r1(X(t))}" x2="${r1(X(t))}" y1="${A.y0 - 4}" y2="${ay}"/>`; });
  s += text(0, A.head, L.fast, 'cs-t1 cs-b6') + text(w, A.head + dA, L.fastVerdict, `cs-t0 cs-b7 ${anim('fade', 30)}`, 'end');
  s += text(0, B.head, L.slow, 'cs-t1 cs-b6') + text(w, B.head + (stackB ? 16 : 0), L.slowVerdict, `cs-t0 cs-b7 ${anim('fade', 30)}`, 'end');
  const curve = 'fill="none" stroke="var(--cs-cy)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"';
  s += wiped(`${id}-fast`, fast, curve, 0, { x: 0, y: A.y0 - 8, w, h: A.y1 - A.y0 + 16 }, true);
  s += wiped(`${id}-slow`, slow, curve, 2, { x: 0, y: B.y0 - 8, w, h: B.y1 - B.y0 + 16 }, true);
  const rec = (Y: (v: number) => number, f: (t: number) => number) => SAMPLES.map((t, i) => `${i ? 'L' : 'M'}${X(t).toFixed(1)} ${Y(f(t)).toFixed(1)}`).join('');
  s += `<path class="${anim('grow', 24)}" d="${rec(YA, smpFast)}" fill="none" stroke="var(--cs-t0)" stroke-width="2" stroke-dasharray="6 4"/>`;
  s += `<path class="${anim('grow', 25)}" d="${rec(YB, smpSlow)}" fill="none" stroke="var(--cs-t0)" stroke-width="2" stroke-dasharray="6 4"/>`;
  SAMPLES.forEach((t, i) => {
    s += `<circle class="${anim('drop', 17 + i * 2)}" data-t="${t}" cx="${r1(X(t))}" cy="${r1(YA(smpFast(t)))}" r="5" fill="var(--cs-cy)" stroke="var(--cs-leaf)" stroke-width="2"/>`;
    s += `<circle class="${anim('drop', 17.5 + i * 2)}" data-t="${t}" cx="${r1(X(t))}" cy="${r1(YB(smpSlow(t)))}" r="5" fill="var(--cs-cy)" stroke="var(--cs-leaf)" stroke-width="2"/>`;
  });
  s += `<line class="cs-axis" x1="${l}" x2="${w - r}" y1="${ay}" y2="${ay}"/>`;
  SAMPLES.forEach((t) => {
    s += `<line class="cs-axis" x1="${r1(X(t))}" x2="${r1(X(t))}" y1="${ay}" y2="${ay + 4}"/>`;
    s += text(X(t), ay + 18, `${t}${SEC}`, 'cs-num', t === 0 ? undefined : t === SPAN ? 'end' : 'middle');
  });
  const gapLabel = textWidth(L.spacing);
  const room = X(SPAN) - X(S) - textWidth(`${SPAN}${SEC}`) - textWidth(`${S}${SEC}`) / 2 - 16;
  if (gapLabel <= room) s += text((X(S) + X(SPAN)) / 2 - textWidth(`${SPAN}${SEC}`) / 4, ay + 18, L.spacing, '', 'middle');
  return { h: ay + 24, svg: s };
};

// ── ch2: the engagement pipeline (Fig. 1 top; kill positions illustrative) ──
const pipe: Renderer = (w, L) => {
  const l = 12, r = 12, h = 162, X = (f: number) => l + f * (w - l - r), ty = 74, fy = 140;
  const K = [0.06, 0.12, 0.17, 0.46, 0.52, 0.85];
  const A = [0.06, 0.17] as const, B = [0.46, 0.52] as const, C = 0.85;
  let s = text(l, ty - 56, L.kills);
  s += `<line class="cs-axis" x1="${l}" x2="${w - r}" y1="${ty}" y2="${ty}"/><path d="M${w - r - 6} ${ty - 4}l6 4-6 4" fill="none" stroke="var(--cs-ln)"/>`;
  K.forEach((f) => { s += `<line${f > 0.8 ? ' class="cs-fail3"' : ''} x1="${r1(X(f))}" x2="${r1(X(f))}" y1="${ty - 18}" y2="${ty}" stroke="var(--cs-red)" stroke-width="2.5"/>`; });
  s += text(l, fy - 12, L.frames);
  const nF = Math.max(4, Math.floor((w - l - r) / 70));
  const fw = (w - l - r) / nF;
  for (let i = 0; i < nF; i++) s += `<rect x="${r1(l + i * fw + 2)}" y="${fy - 4}" width="${r1(fw - 6)}" height="14" fill="var(--cs-k2)" stroke="var(--cs-ln-dash)"/>`;
  const bracket = (a: number, b: number, cls: string, label: string) => {
    const x0 = X(a) - 8, x1 = X(b) + 8;
    return `<g data-s="2" class="${cls}"><path d="M${r1(x0)} ${ty - 24}v-6h${r1(x1 - x0)}v6" fill="none" stroke="var(--cs-cy)" stroke-width="1.5"/>${label ? text((x0 + x1) / 2, ty - 36, label, 'cs-cy', 'middle') : ''}</g>`;
  };
  s += bracket(A[0], A[1], 'cs-hide4', L.cluster) + bracket(B[0], B[1], 'cs-hide4', '') + bracket(C, C, 'cs-fail3', '');
  const mark = (x: number, ok: boolean) => ok
    ? `<g data-s="3" class="cs-hide4"><circle cx="${r1(x)}" cy="${ty + 18}" r="8" fill="none" stroke="var(--cs-cy)"/><path d="M${r1(x - 4)} ${ty + 18}l3 3 5-6" fill="none" stroke="var(--cs-cy)" stroke-width="1.6"/></g>`
    : `<g data-s="3"><circle cx="${r1(x)}" cy="${ty + 18}" r="8" fill="none" stroke="var(--cs-t2)"/><path d="M${r1(x - 3.5)} ${ty + 14.5}l7 7M${r1(x + 3.5)} ${ty + 14.5}l-7 7" stroke="var(--cs-t2)" stroke-width="1.6"/></g>`;
  s += mark((X(A[0]) + X(A[1])) / 2, true) + mark((X(B[0]) + X(B[1])) / 2, true) + mark(X(C), false);
  s += `<g data-s="4"><path d="M${r1(X(A[0]) - 8)} ${ty - 24}v-6h${r1(X(B[1]) - X(A[0]) + 16)}v6" fill="none" stroke="var(--cs-cy)" stroke-width="2"/>${text((X(A[0]) + X(B[1])) / 2, ty - 36, L.merge, 'cs-cy', 'middle')}</g>`;
  // the two span ends share a line when their labels fit inside the span, else the latest-kill label drops a line
  const spanW = X(B[1]) - X(A[0]);
  const stack = textWidth(L.earliest) + textWidth(L.latest) + 12 > spanW + 4;
  s += `<g data-s="5"><rect x="${r1(X(A[0]))}" y="${ty - 18}" width="${r1(spanW)}" height="18" fill="var(--cs-cy-18)" stroke="var(--cs-cy)"/>`
    + text(X(A[0]) - 2, ty + 18, L.earliest, 'cs-t1')
    + text(Math.max(X(B[1]) + 2, X(A[0]) - 2 + textWidth(L.latest)), ty + (stack ? 34 : 18), L.latest, 'cs-t1', 'end') + '</g>';
  return { h, svg: s };
};

// ── ch2: the prediction window (Fig. 1 bottom), to scale: −30 … +60 s around onset ──
const win: Renderer = (w, L) => {
  const f = CASE_FACTS;
  const t0 = -f.windowSec, t1 = f.labelMaxSec;
  const l = 10, r = 14, X = (t: number) => l + ((t - t0) / (t1 - t0)) * (w - l - r);
  // the window's name takes its own line above when it does not fit before the label window's name
  const tight = textWidth(L.obsWindow) > X(0) + 6 - X(t0) - 8;
  const dy = tight ? 16 : 0;
  const by = 62 + dy, bh = 40, ay = 140 + dy;
  const bw = X(t0 + f.binSec) - X(t0);
  let s = text(X(t0), by - 26 - dy, L.obsWindow, 'cs-cy cs-b6') + text(X(t0), by - 10, L.binsNote);
  for (let i = 0; i < f.bins; i++) {
    const x0 = X(t0 + i * f.binSec);
    s += `<rect class="${anim('fade', i)}" data-bin="${i}" x="${r1(x0 + 1)}" y="${by}" width="${r1(bw - 2)}" height="${bh}" fill="var(--cs-cy-16)" stroke="var(--cs-cy)"/>`;
    const full = `${L.bin} ${i}`;
    s += text(x0 + bw / 2, by + bh / 2 + 4, textWidth(full) + 6 <= bw ? full : String(i), `cs-t1 cs-num ${anim('fade', i)}`, 'middle');
  }
  s += `<rect class="${anim('grow', 7)}" data-label="${f.labelMinSec}" x="${r1(X(0))}" y="${by}" width="${r1(X(f.labelMinSec) - X(0))}" height="${bh}" fill="var(--cs-ink-wash)" stroke="var(--cs-t1)"/>`;
  s += `<rect class="${anim('grow', 9)}" data-label="${f.labelMaxSec}" x="${r1(X(f.labelMinSec))}" y="${by}" width="${r1(X(f.labelMaxSec) - X(f.labelMinSec))}" height="${bh}" fill="none" stroke="var(--cs-t2)" stroke-dasharray="4 3"/>`;
  const room = w - r - (X(0) + 6);
  const rule = textWidth(L.labelRule) <= room ? L.labelRule : L.labelRuleShort;
  s += text(X(0) + 6, by - 26, L.labelWindow, `cs-t1 cs-b6 ${anim('fade', 8)}`) + text(X(0) + 6, by - 10, rule, anim('fade', 9));
  s += `<g class="${anim('fade', 8)}"><line x1="${r1(X(f.onsetLeadSec))}" x2="${r1(X(f.onsetLeadSec))}" y1="${by + bh}" y2="${by + bh + 12}" stroke="var(--cs-red)" stroke-width="2.5"/><path d="M${r1(X(f.onsetLeadSec))} ${by + 4}l5 6-5 6-5-6z" fill="var(--cs-red)"/></g>`;
  s += `<line x1="${r1(X(0))}" x2="${r1(X(0))}" y1="${by - 34}" y2="${ay}" stroke="var(--cs-y)" stroke-width="1.5" stroke-dasharray="3 3"/>`;
  s += `<line class="cs-axis" x1="${l}" x2="${w - r}" y1="${ay}" y2="${ay}"/>`;
  const ticks: [number, string][] = [[t0, `−${f.windowSec}${SEC}`], [0, '0'], [f.onsetLeadSec, `+${f.onsetLeadSec}`], [f.labelMinSec, `+${f.labelMinSec}`], [t1, `+${t1}${SEC}`]];
  ticks.forEach(([t, lab]) => {
    s += `<line class="cs-axis" x1="${r1(X(t))}" x2="${r1(X(t))}" y1="${ay}" y2="${ay + 4}"/>`;
    s += text(X(t), ay + 17, lab, 'cs-num', t === t0 ? undefined : t === t1 ? 'end' : 'middle');
  });
  // the onset label sits under 0; the earliest-kill note follows it on the same line when there is room, else below
  const onsetW = textWidth(L.onset), killW = textWidth(L.earliestKill);
  s += text(X(0), ay + 33, L.onset, 'cs-t1', 'middle');
  const kx = Math.min(X(f.onsetLeadSec) + 8, w - r - killW);
  const sameLine = kx >= X(0) + onsetW / 2 + 8;
  const kxx = sameLine ? kx : Math.max(0, Math.min(X(0) - onsetW / 2, w - r - killW));
  s += text(kxx, ay + (sameLine ? 33 : 49), L.earliestKill);
  return { h: ay + (sameLine ? 40 : 56), svg: s };
};

// ── ch3: the chronological patch split ──
const split: Renderer = (w, L) => {
  const l = 4, r = 4, h = 150, gap = 6, top = 40, bh = 44;
  const seedCol = 22 + 16 + textWidth(`${L.seed} ${CASE_FACTS.seeds}`) + 6 + 18 + textWidth(L.mean) + 4;
  const widest = Math.max(textWidth(L.train), textWidth(L.val), textWidth(L.test)) + 8;
  const cwWith = (w - l - r - seedCol - gap * 2) / 3;
  const narrow = cwWith < widest;
  const cw = narrow ? (w - l - r - gap * 2) / 3 : cwWith;
  const bx = (i: number) => l + i * (cw + gap);
  const names = [CASE_FACTS.patches.train, CASE_FACTS.patches.val, CASE_FACTS.patches.test];
  let s = '';
  names.forEach((name, i) => {
    const test = i === 2, val = i === 1;
    const fill = test ? 'var(--cs-k2)' : val ? 'var(--cs-cy-6)' : 'var(--cs-cy-14)';
    s += `<g class="${anim('rise', i * 1.5)}"><rect x="${r1(bx(i))}" y="${top}" width="${r1(cw)}" height="${bh}" fill="${fill}" stroke="${test ? 'var(--cs-t1)' : 'var(--cs-cy)'}" stroke-width="${test ? 2 : 1}"${val ? ' stroke-dasharray="4 3"' : ''}/>`
      + text(bx(i) + cw / 2, top + bh / 2 + 5, name, `cs-t0 cs-num ${test ? 'cs-f15 cs-b6' : 'cs-f13'}`, 'middle') + '</g>';
  });
  const brace = (i: number, label: string, i0: number, dash: boolean, ink: boolean) =>
    `<g class="${anim('fade', i0)}"><path d="M${r1(bx(i))} ${top - 8}v-6h${r1(cw)}v6" fill="none" stroke="${ink ? 'var(--cs-t1)' : 'var(--cs-cy)'}"${dash ? ' stroke-dasharray="3 2"' : ''}/>${text(bx(i) + cw / 2, top - 19, label, `${ink ? 'cs-t0' : 'cs-cy'} cs-b6`, 'middle')}</g>`;
  s += brace(0, L.train, 5, false, false) + brace(1, L.val, 5.5, true, false) + brace(2, L.test, 6, false, true);
  const wx = bx(2) - gap / 2;
  s += `<line class="${anim('growy', 6)}" x1="${r1(wx)}" x2="${r1(wx)}" y1="${top - 4}" y2="${top + bh + 8}" stroke="var(--cs-y)" stroke-width="2"/>`;
  const ay = top + bh + 26;
  s += `<line class="${anim('grow', 2)}" x1="${l}" x2="${r1(bx(2) + cw)}" y1="${ay}" y2="${ay}" stroke="var(--cs-ln-strong)"/><path d="M${r1(bx(2) + cw - 6)} ${ay - 4}l6 4-6 4" fill="none" stroke="var(--cs-ln-strong)"/>`;
  s += text(l, ay + 18, L.time);
  if (!narrow) {
    const sx = bx(2) + cw + 22;
    for (let k = 0; k < CASE_FACTS.seeds; k++) {
      s += `<circle class="${anim('pop', 8 + k * 0.6)}" cx="${r1(sx + 6)}" cy="${top + 6 + k * 16}" r="5" fill="var(--cs-t1)"/>` + text(sx + 16, top + 10 + k * 16, `${L.seed} ${k + 1}`, 'cs-num');
    }
    const mx = sx + 16 + textWidth(`${L.seed} ${CASE_FACTS.seeds}`) + 6;
    s += `<path class="${anim('grow', 10)}" d="M${r1(mx)} ${top + 22}h14" stroke="var(--cs-cy)" fill="none"/>` + text(mx + 18, top + 26, L.mean, `cs-cy cs-b6 ${anim('fade', 11)}`);
  } else {
    s += text(w - r, ay + 36, L.seedsShort, `cs-cy cs-b6 ${anim('fade', 8)}`, 'end');
  }
  return { h: narrow ? h + 18 : h, svg: s };
};

const aucScale = (w: number, left: number, right: number, lo = 0.5, hi = 0.7) => (v: number) => left + ((v - lo) / (hi - lo)) * (w - left - right);

// ── ch3: test AUC by model (Table I) ──
const auc: Renderer = (w, L) => {
  const nameW = Math.max(...overallAuc.map((d) => textWidth(d.model, 13)));
  const viewW = Math.max(...overallAuc.map((d) => textWidth(L.views[d.id] ?? '')));
  const wide = w - Math.max(nameW, viewW) - 12 - 46 >= 260;
  const col = (wide ? Math.max(nameW, viewW) : nameW) + 14;
  const Rr = 46, rowH = 34, top = 30;
  const X = aucScale(w, col, Rr);
  const rows: ({ head: string; y: number } | { d: (typeof overallAuc)[number]; y: number })[] = [];
  let y = top;
  rows.push({ head: L.tabular, y: y + 2 }); y += 18;
  overallAuc.filter((d) => d.group === 'tabular').forEach((d) => { rows.push({ d, y: y + rowH / 2 }); y += rowH; });
  y += 6; rows.push({ head: L.neural, y: y + 2 }); y += 18;
  const nnTop = y;
  overallAuc.filter((d) => d.group === 'neural').forEach((d) => { rows.push({ d, y: y + rowH / 2 }); y += rowH; });
  const nnBot = y, axY = y + 8;
  const [nnLo, nnHi] = neuralRange();
  let s = '';
  [0.55, 0.6, 0.65, 0.7].forEach((t) => { s += `<line class="cs-grid" x1="${r1(X(t))}" x2="${r1(X(t))}" y1="${top - 6}" y2="${axY}"/>`; });
  s += `<rect class="${anim('fade', 4)}" x="${r1(X(nnLo))}" y="${nnTop - 2}" width="${r1(X(nnHi) - X(nnLo))}" height="${nnBot - nnTop + 2}" fill="var(--cs-neutral-wash)"/>`;
  s += `<line class="cs-chance" x1="${r1(X(CHANCE_AUC))}" x2="${r1(X(CHANCE_AUC))}" y1="${top - 14}" y2="${axY}"/>` + text(X(CHANCE_AUC) + 5, top - 16, L.chance);
  let i = 0;
  for (const row of rows) {
    if ('head' in row) { s += text(0, row.y + 8, row.head, 'cs-b6'); continue; }
    const d = row.d, tab = d.group === 'tabular', best = !!d.highlight;
    const colr = tab ? 'var(--cs-cy)' : 'var(--cs-neutral-mark)';
    s += text(0, wide ? row.y - 2 : row.y + 4, d.model, `cs-f13 ${best ? 'cs-t0 cs-b7' : 'cs-t1'}`);
    if (wide) s += text(0, row.y + 13, L.views[d.id] ?? '');
    s += `<line class="${anim('grow', i)}" x1="${r1(X(CHANCE_AUC))}" x2="${r1(X(d.auc))}" y1="${row.y}" y2="${row.y}" stroke="${colr}" stroke-width="${best ? 3 : 2}"/>`;
    if (best) s += `<circle class="${anim('pop', i + 3)}" cx="${r1(X(d.auc))}" cy="${row.y}" r="10" fill="none" stroke="var(--cs-cy-dim)"/>`;
    s += `<circle class="${anim('pop', i + 3)}" data-v="${d.auc}" cx="${r1(X(d.auc))}" cy="${row.y}" r="${best ? 6 : 5}" fill="${colr}" stroke="var(--cs-leaf)" stroke-width="2"/>`;
    s += text(X(d.auc) + (best ? 14 : 10), row.y + 4, fmtAuc(d.auc), `cs-num ${tab ? 'cs-t0' : 'cs-t1'}${best ? ' cs-b6' : ''} ${anim('fade', i + 4)}`);
    s += `<rect class="cs-hit" data-tip="${esc(d.model)}|${esc(L.views[d.id] ?? '')}|${fmtAuc(d.auc)}" x="0" y="${row.y - rowH / 2}" width="${w}" height="${rowH}" fill="transparent"/>`;
    i++;
  }
  s += `<line class="cs-axis" x1="${r1(X(0.5))}" x2="${r1(X(0.7))}" y1="${axY}" y2="${axY}"/>`;
  [0.5, 0.55, 0.6, 0.65, 0.7].forEach((t) => { s += text(X(t), axY + 16, t.toFixed(2), 'cs-num', 'middle'); });
  s += text(X(0.7), axY + 31, L.aucAxis, '', 'end');
  return { h: axY + 40, svg: s };
};

// ── ch3: the gap in two steps (differences of Table I) ──
const gap: Renderer = (w, L) => {
  const g = gapSteps();
  const best = neuralBest();
  const steps = [
    { k: L.nnBest, sub: best.models.join(' · '), a: CHANCE_AUC, b: g.from, lab: fmtAuc(g.from), fill: 'var(--cs-neutral-mark)', kind: 'base' },
    { k: L.plusInput, sub: L.plusInputSub, a: g.from, b: g.mlp, lab: `+${fmtAuc(g.input)}`, fill: 'var(--cs-cy-50)', kind: 'd', d: g.input },
    { k: L.plusLearner, sub: 'MLP → LightGBM', a: g.mlp, b: g.to, lab: `+${fmtAuc(g.learner)}`, fill: 'var(--cs-cy)', kind: 'd', d: g.learner },
    { k: 'LightGBM', sub: L.total, a: CHANCE_AUC, b: g.to, lab: fmtAuc(g.to), fill: 'none', kind: 'total', d: g.total },
  ];
  const colNeed = Math.max(...steps.map((d) => Math.max(textWidth(d.k, 13), textWidth(d.sub)))) + 12;
  const stacked = colNeed > w * 0.42;
  const col = stacked ? 8 : colNeed;
  const Rr = 54, rowH = stacked ? 64 : 40, top = 10;
  const X = aucScale(w, col, Rr);
  let s = `<line class="cs-chance" x1="${r1(X(0.5))}" x2="${r1(X(0.5))}" y1="${top - 4}" y2="${top + steps.length * rowH}"/>`;
  steps.forEach((d, i) => {
    const y = top + i * rowH, bh = 18, by = stacked ? y + 36 : y + (rowH - bh) / 2;
    const last = i === 3;
    if (stacked) s += text(0, y + 13, d.k, `cs-f13 ${last ? 'cs-t0 cs-b7' : 'cs-t1'}`) + text(0, y + 28, d.sub);
    else s += text(0, y + rowH / 2 - 2, d.k, `cs-f13 ${last ? 'cs-t0 cs-b7' : 'cs-t1'}`) + text(0, y + rowH / 2 + 12, d.sub);
    const data = d.kind === 'd' ? ` data-d="${d.d}"` : d.kind === 'total' ? ` data-total="${d.d}"` : '';
    if (d.fill === 'none') s += `<rect class="${anim('grow', i * 3)}"${data} x="${r1(X(d.a))}" y="${by}" width="${r1(X(d.b) - X(d.a))}" height="${bh}" fill="var(--cs-cy-10)" stroke="var(--cs-cy)" stroke-width="1.5"/>`;
    else s += `<rect class="${anim('grow', i * 3)}"${data} x="${r1(X(d.a))}" y="${by}" width="${r1(Math.max(1, X(d.b) - X(d.a)))}" height="${bh}" fill="${d.fill}"/>`;
    s += text(X(d.b) + 6, by + 13, d.lab, `cs-num ${last ? 'cs-t0' : 'cs-t1'}${i >= 1 ? ' cs-b6' : ''} ${anim('fade', i * 3 + 2)}`);
    if (i < 2) s += `<line class="${anim('fade', i * 3 + 2)}" x1="${r1(X(d.b))}" x2="${r1(X(d.b))}" y1="${by + bh}" y2="${by + rowH}" stroke="var(--cs-ln)" stroke-dasharray="2 2"/>`;
  });
  const axY = top + steps.length * rowH + 4;
  s += `<line class="cs-axis" x1="${r1(X(0.5))}" x2="${r1(X(0.7))}" y1="${axY}" y2="${axY}"/>`;
  [0.5, 0.6, 0.7].forEach((t) => { s += text(X(t), axY + 15, t.toFixed(2), 'cs-num', X(t) < textWidth(t.toFixed(2)) / 2 ? undefined : 'middle'); });
  return { h: axY + 22, svg: s };
};

// ── ch3: AUC read as 200 pairs (expected counts, column-major: the first 100 cells are the left half) ──
const waffle: Renderer = (w, L) => {
  const p = pairCounts();
  const rows = 10, cols = PAIRS / rows, g = 2;
  const cell = Math.min(18, Math.floor((w - g * (cols - 1)) / cols));
  const gw = cols * cell + (cols - 1) * g;
  let s = '';
  for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
    const k = c * rows + r;
    const kind = k < p.chance ? 'chance' : k < p.right ? 'extra' : 'wrong';
    const fill = kind === 'chance' ? 'var(--cs-cy-38)' : kind === 'extra' ? 'var(--cs-cy)' : 'var(--cs-k2)';
    s += `<rect class="cs-wf-${kind}${kind === 'wrong' ? '' : ` ${anim('pop', c * 0.55)}`}" x="${c * (cell + g)}" y="${r * (cell + g)}" width="${cell}" height="${cell}" fill="${fill}"${kind === 'wrong' ? ' stroke="var(--cs-ln-dash)"' : ''}/>`;
  }
  const gy = rows * (cell + g);
  const mx = (p.chance / rows) * (cell + g) - g / 2;
  s += `<line x1="${r1(mx)}" x2="${r1(mx)}" y1="-6" y2="${gy + 2}" stroke="var(--cs-t1)" stroke-width="1.5" stroke-dasharray="3 3"/>` + text(mx, -10, L.chancePairs, 'cs-t1', 'middle');
  return { h: gy + 22, svg: `<g transform="translate(${r1(Math.max(0, (w - gw) / 2))},18)">${s}</g>` };
};

// ── ch3: between chance and perfect ──
const gauge: Renderer = (w, L) => {
  const g = gapSteps();
  const [nnLo, nnHi] = neuralRange();
  const l = 4, r = 8, top = 30, bh = 16;
  const X = (v: number) => l + ((v - CHANCE_AUC) / (PERFECT_AUC - CHANCE_AUC)) * (w - l - r);
  let s = `<rect x="${r1(X(CHANCE_AUC))}" y="${top}" width="${r1(X(PERFECT_AUC) - X(CHANCE_AUC))}" height="${bh}" fill="var(--cs-k2)" stroke="var(--cs-ln-dash)"/>`;
  s += `<rect class="${anim('grow', 0)}" data-v="${g.to}" x="${r1(X(CHANCE_AUC))}" y="${top}" width="${r1(X(g.to) - X(CHANCE_AUC))}" height="${bh}" fill="var(--cs-cy)"/>`;
  s += `<rect class="${anim('fade', 4)}" x="${r1(X(nnLo))}" y="${top + bh + 4}" width="${r1(Math.max(2, X(nnHi) - X(nnLo)))}" height="6" fill="var(--cs-neutral-mark)"/>`;
  s += `<path class="${anim('fade', 5)}" d="M${r1(X(g.mlp))} ${top + bh + 2}l-4 8h8z" fill="var(--cs-t1)"/>`;
  // the top line: chance on the left, perfect on the right, LightGBM's value centred over its mark when it fits between
  const lgbX = X(g.to), lgbW = textWidth(fmtAuc(g.to));
  const chanceW = textWidth(L.gaugeChance);
  const lgbClear = lgbX - lgbW / 2 > chanceW + 8 && lgbX + lgbW / 2 < X(PERFECT_AUC) - textWidth(L.gaugePerfect) - 8;
  s += text(X(CHANCE_AUC), top - 8, L.gaugeChance, `cs-num ${anim('fade', 6)}`) + text(X(PERFECT_AUC), top - 8, L.gaugePerfect, 'cs-num', 'end');
  if (lgbClear) s += text(lgbX, top - 8, fmtAuc(g.to), `cs-t0 cs-num cs-b6 ${anim('fade', 6)}`, 'middle');
  const mlpLine = `▲ MLP ${fmtAuc(g.mlp)}`;
  const lx = X(g.mlp) + 8;
  const oneLine = lx + textWidth(`${mlpLine} · ${L.gaugeNeural}`) <= w;
  s += text(lx, top + bh + 22, oneLine ? `${mlpLine} · ${L.gaugeNeural}` : mlpLine, anim('fade', 6));
  if (!oneLine) s += text(Math.min(lx, w - textWidth(L.gaugeNeural)), top + bh + 37, L.gaugeNeural, anim('fade', 6));
  s += text(lgbX - 6, top + bh / 2 + 4, L.gaugeShare, `cs-on cs-b7 ${anim('fade', 7)}`, 'end');
  const of = textWidth(L.gaugeOf) <= w - (lgbX + 6) ? L.gaugeOf : L.gaugeOfShort;
  const ofFits = textWidth(of) <= w - (lgbX + 6);
  s += text(ofFits ? lgbX + 6 : 0, ofFits ? top + bh / 2 + 4 : top + bh + (oneLine ? 37 : 52), ofFits ? of : L.gaugeOf, anim('fade', 7));
  const extra = (oneLine ? 0 : 15) + (ofFits ? 0 : 15);
  return { h: top + bh + 30 + extra, svg: s };
};

// ── ch4: AUC by group (Table II); the neural range = min–max of the five non-tabular baselines ──
const strata: Renderer = (w, L) => {
  const groups = [
    { head: L.phase, rows: CASE_FACTS.strata.phase },
    { head: L.gold, rows: CASE_FACTS.strata.gold },
  ];
  const col = Math.max(...groups.flatMap((g) => g.rows.map((r) => textWidth(L.strata[r.key], 13)))) + 14;
  const Rr = 46, rowH = 30, top = 26;
  const X = aucScale(w, col, Rr, 0.45, 0.85);
  let y = top, s = '', i = 0;
  const rows: ({ head: string; y: number } | { r: (typeof groups)[number]['rows'][number]; y: number })[] = [];
  groups.forEach((g, gi) => { if (gi) y += 8; rows.push({ head: g.head, y }); y += 18; g.rows.forEach((r) => { rows.push({ r, y: y + rowH / 2 }); y += rowH; }); });
  const axY = y + 6;
  [0.6, 0.7, 0.8].forEach((t) => { s += `<line class="cs-grid" x1="${r1(X(t))}" x2="${r1(X(t))}" y1="${top - 6}" y2="${axY}"/>`; });
  s += `<line class="cs-chance" x1="${r1(X(CHANCE_AUC))}" x2="${r1(X(CHANCE_AUC))}" y1="${top - 14}" y2="${axY}"/>` + text(X(CHANCE_AUC) + 5, top - 16, L.chance);
  for (const o of rows) {
    if ('head' in o) { s += text(0, o.y + 8, o.head, 'cs-b6'); continue; }
    const { key, lgbm, neural: [lo, hi] } = o.r;
    s += text(0, o.y + 4, L.strata[key], 'cs-t1 cs-f13');
    s += `<rect class="${anim('grow', i)}" data-lo="${lo}" data-hi="${hi}" x="${r1(X(lo))}" y="${o.y - 4}" width="${r1(Math.max(2, X(hi) - X(lo)))}" height="8" fill="var(--cs-neutral-mark)"/>`;
    s += `<line class="${anim('grow', i + 1)}" x1="${r1(X(hi))}" x2="${r1(X(lgbm))}" y1="${o.y}" y2="${o.y}" stroke="var(--cs-cy-dim)" stroke-width="1.5" stroke-dasharray="2 2"/>`;
    s += `<circle class="${anim('pop', i + 2)}" data-v="${lgbm}" cx="${r1(X(lgbm))}" cy="${o.y}" r="6" fill="var(--cs-cy)" stroke="var(--cs-leaf)" stroke-width="2"/>`;
    s += text(X(lgbm) + 10, o.y + 4, fmtAuc(lgbm), `cs-t0 cs-num cs-b6 ${anim('fade', i + 3)}`);
    i++;
  }
  s += `<line class="cs-axis" x1="${r1(X(0.45))}" x2="${r1(X(0.85))}" y1="${axY}" y2="${axY}"/>`;
  [0.5, 0.6, 0.7, 0.8].forEach((t) => { s += text(X(t), axY + 16, t.toFixed(1), 'cs-num', 'middle'); });
  s += text(X(0.85), axY + 31, L.aucAxis, '', 'end');
  return { h: axY + 38, svg: s };
};

// ── ch4 details: the follow-up kill-gap figure's printed values on a log axis ──
const gapRuler: Renderer = (w, L) => {
  const kg = killGap;
  const l = 10, r = 14, top = 40, ay = 112;
  const X = (v: number) => l + (Math.log10(v) / Math.log10(200)) * (w - l - r);
  const sec = (v: number) => `${v}${SEC}`;
  const P = [
    { v: kg.modes[0], lab: `${sec(kg.modes[0])} ${L.mode}`, key: `${L.mode} ${sec(kg.modes[0])}`, y: top + 14, col: 'var(--cs-cy)', anchor: 'end' as const, dx: -8 },
    { v: kg.valley, lab: `${sec(kg.valley)} ${L.valley}`, key: `${L.valleyG} ${sec(kg.valley)}`, y: top + 44, col: 'var(--cs-t2)', anchor: 'end' as const, dx: -8 },
    { v: kg.modes[1], lab: `${sec(kg.modes[1])} ${L.mode}`, key: `${L.mode} ${sec(kg.modes[1])}`, y: top + 14, col: 'var(--cs-cy)', anchor: undefined, dx: 8 },
  ];
  // labels beside the marks when every one fits on its side and clears the band's label; else numbered marks and a key
  const fits = P.every((p) => (p.anchor === 'end' ? X(p.v) + p.dx - textWidth(p.lab) >= 0 : X(p.v) + p.dx + textWidth(p.lab) <= w))
    && X(kg.modes[0]) - 8 - textWidth(P[0]!.lab) >= 0 && X(kg.valley) - 8 - textWidth(P[1]!.lab) > X(kg.modes[0]) + 6
    && X(18) + 6 + textWidth(L.paperRule) < X(kg.modes[1]) - 8;
  const narrow = !fits;
  let s = `<rect class="${anim('grow', 0)}" x="${r1(X(kg.ariBand[0]))}" y="${top - 10}" width="${r1(X(kg.ariBand[1]) - X(kg.ariBand[0]))}" height="${ay - top + 10}" fill="var(--cs-cy-16)"/>`;
  s += text((X(kg.ariBand[0]) + X(kg.ariBand[1])) / 2, top - 16, L.ariBand, `cs-cy cs-b6 ${anim('fade', 1)}`, 'middle');
  s += `<line class="cs-axis" x1="${l}" x2="${w - r}" y1="${ay}" y2="${ay}"/>`;
  [1, 2, 5, 10, 20, 50, 100, 200].forEach((t) => {
    s += `<line class="cs-axis" x1="${r1(X(t))}" x2="${r1(X(t))}" y1="${ay}" y2="${ay + 4}"/>` + text(X(t), ay + 17, String(t), 'cs-num', t === 200 ? 'end' : 'middle');
  });
  s += text(w - r, ay + 33, L.gapAxis, '', 'end');
  P.forEach((p, i) => {
    const lx = X(p.v);
    s += `<g class="${anim('rise', 2 + i)}"><line x1="${r1(lx)}" x2="${r1(lx)}" y1="${p.y}" y2="${ay}" stroke="${p.col}" stroke-width="1.5"/><circle cx="${r1(lx)}" cy="${p.y}" r="${narrow ? 8 : 4}" fill="${p.col}"/>`;
    s += narrow ? text(lx, p.y + 4, String(i + 1), 'cs-on cs-num cs-b7', 'middle') : text(lx + p.dx, p.y + 4, p.lab, 'cs-t1 cs-num', p.anchor);
    s += '</g>';
  });
  const rule = CASE_FACTS.clusterGapSec;
  s += `<g class="${anim('fade', 5)}"><line x1="${r1(X(rule))}" x2="${r1(X(rule))}" y1="${top - 4}" y2="${ay}" stroke="var(--cs-y)" stroke-width="2"/>`;
  s += narrow
    ? `<rect x="${r1(X(rule) - 8)}" y="${top + 54}" width="16" height="16" fill="var(--cs-y)"/>${text(X(rule), top + 66, String(P.length + 1), 'cs-on cs-num cs-b7', 'middle')}</g>`
    : `${text(X(rule) + 6, ay - 8, L.paperRule, 'cs-yt cs-num')}</g>`;
  let h = ay + 40;
  if (narrow) {
    const keys = [...P.map((p) => p.key), L.paperRule].map((k, i) => `${i + 1} · ${k}`);
    const two = Math.max(...keys.map((k) => textWidth(k))) + 12 <= w / 2;
    keys.forEach((k, i) => {
      const cx = two ? (i % 2) * (w / 2) : 0, cy = h + 12 + (two ? Math.floor(i / 2) : i) * 18;
      s += text(cx, cy, k, 'cs-t1');
    });
    h += 12 + (two ? 2 : 4) * 18;
  }
  return { h, svg: s };
};

export const CHARTS: Record<ChartId, Renderer> = { res, sampling, pipe, win, split, auc, gap, waffle, gauge, strata, 'gap-ruler': gapRuler };
