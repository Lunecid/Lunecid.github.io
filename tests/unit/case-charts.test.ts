// @vitest-environment jsdom
// The case overlay's chart renderers (src/lib/case/charts.ts): pure (width, labels) → SVG. Parsed with the DOM parser.
import { describe, expect, it } from 'vitest';
import { caseCopy } from '../../src/data/copy/case/cog-2026';
import { CASE_FACTS, gapSteps, overallAuc, pairCounts, strataRows } from '../../src/data/research/cog-2026-case';
import { CHARTS, chartLabels, textWidth, type ChartId } from '../../src/lib/case/charts';
import { resolveDeep } from '../../src/lib/facts';
import { loadFactSource } from '../helpers/fact-source';

const facts = loadFactSource();
const labels = (lang: 'ko' | 'en') => chartLabels(resolveDeep(caseCopy[lang].charts, lang, facts), lang);
const parse = (id: ChartId, w: number, lang: 'ko' | 'en' = 'ko') => {
  const out = CHARTS[id](w, labels(lang), `t-${id}`);
  const doc = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${out.svg}</svg>`, 'image/svg+xml');
  expect(doc.querySelector('parsererror'), `${id} ${w} parses`).toBeNull();
  return { ...out, root: doc.documentElement };
};
const nums = (root: Element, sel: string, attr = 'data-v') => [...root.querySelectorAll(sel)].map((e) => Number(e.getAttribute(attr)));
const WIDTHS = [240, 343, 560, 780];
const IDS = Object.keys(CHARTS) as ChartId[];

describe('case charts', () => {
  it('renders every chart at 240, 343, 560 and 780 px in both languages without NaN', () => {
    expect(IDS.sort()).toEqual(['auc', 'gap', 'gap-ruler', 'gauge', 'pipe', 'res', 'sampling', 'split', 'strata', 'waffle', 'win'].sort());
    for (const id of IDS) for (const w of WIDTHS) for (const lang of ['ko', 'en'] as const) {
      const { h, svg } = parse(id, w, lang);
      expect(Number.isFinite(h) && h > 0, `${id} ${w} ${lang} h`).toBe(true);
      expect(svg, `${id} ${w} ${lang}`).not.toMatch(/NaN|undefined|Infinity/);
    }
  });

  it('no font-size attribute (sizes come from the stylesheet, 12 px and up) and no colour literal', () => {
    for (const id of IDS) for (const w of WIDTHS) {
      const { svg } = parse(id, w);
      expect(svg, id).not.toMatch(/font-size/);
      expect(svg.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/g) ?? [], id).toEqual([]);
      for (const m of svg.matchAll(/(?:fill|stroke)="([^"]+)"/g)) expect(m[1], id).toMatch(/^(?:var\(--cs-[\w-]+\)|none|transparent|url\(#[\w-]+\))$/);
    }
  });

  it('no stroke-dashoffset draw-on: curves draw through a clip rect that grows', () => {
    const { svg, root } = parse('sampling', 560);
    expect(svg).not.toMatch(/dashoffset/);
    const clipped = root.querySelectorAll('path[clip-path]');
    expect(clipped.length).toBe(2);
    for (const path of clipped) {
      const id = /url\(#([\w-]+)\)/.exec(path.getAttribute('clip-path')!)![1]!;
      expect(root.querySelector(`clipPath#${id} rect.cs-wipe`), id).not.toBeNull();
    }
  });

  it('strata: six LightGBM dots at the Table II values and six neural bands', () => {
    const { root } = parse('strata', 560);
    expect(nums(root, 'circle[data-v]')).toEqual(strataRows().map((r) => r.lgbm));
    expect(root.querySelectorAll('rect[data-lo]').length).toBe(6);
    expect(nums(root, 'rect[data-lo]', 'data-lo')).toEqual(strataRows().map((r) => r.neural[0]));
    expect(nums(root, 'rect[data-hi]', 'data-hi')).toEqual(strataRows().map((r) => r.neural[1]));
  });

  it('auc: eight rows in the order of overallAuc', () => {
    const { root } = parse('auc', 560);
    expect(nums(root, 'circle[data-v]')).toEqual(overallAuc.map((r) => r.auc));
    expect([...root.querySelectorAll('[data-tip]')].map((e) => e.getAttribute('data-tip')!.split('|')[0])).toEqual(overallAuc.map((r) => r.model));
  });

  it('gap: three steps that sum to the whole gap', () => {
    const { root } = parse('gap', 560);
    const steps = nums(root, 'rect[data-d]', 'data-d');
    expect(steps).toEqual([gapSteps().input, gapSteps().learner]);
    expect(nums(root, 'rect[data-total]', 'data-total')).toEqual([gapSteps().total]);
    expect(Math.round((steps[0]! + steps[1]!) * 1000)).toBe(Math.round(gapSteps().total * 1000));
  });

  it('waffle: 100 chance, 35 extra and 65 wrong cells', () => {
    const { root } = parse('waffle', 343);
    const p = pairCounts();
    expect(root.querySelectorAll('rect.cs-wf-chance').length).toBe(p.chance);
    expect(root.querySelectorAll('rect.cs-wf-extra').length).toBe(p.extra);
    expect(root.querySelectorAll('rect.cs-wf-wrong').length).toBe(p.wrong);
  });

  it('sampling: samples only at 0, 60 and 120 s and the 30 s window at 40–70 s', () => {
    for (const w of WIDTHS) {
      const { root } = parse('sampling', w);
      expect([...new Set(nums(root, 'circle[data-t]', 'data-t'))]).toEqual([0, CASE_FACTS.snapshotSec, 2 * CASE_FACTS.snapshotSec]);
      const band = root.querySelector('rect[data-t0]')!;
      expect([Number(band.getAttribute('data-t0')), Number(band.getAttribute('data-t1'))]).toEqual([40, 40 + CASE_FACTS.windowSec]);
    }
  });

  it('win: six bins before onset and the label window from 30 to 60 s', () => {
    const { root } = parse('win', 560);
    expect(root.querySelectorAll('rect[data-bin]').length).toBe(CASE_FACTS.bins);
    expect(nums(root, 'rect[data-label]', 'data-label')).toEqual([CASE_FACTS.labelMinSec, CASE_FACTS.labelMaxSec]);
  });

  it('labels never overlap each other at the column widths of 375, 768 and 1280 px viewports, in either language (measured, not keyed on the language)', () => {
    const problems: string[] = [];
    for (const w of [343, 466, 560, 780]) for (const lang of ['ko', 'en'] as const) for (const id of IDS) {
      const { root } = parse(id, w, lang);
      const boxes = [...root.querySelectorAll('text')].map((t) => {
        const x = Number(t.getAttribute('x')), y = Number(t.getAttribute('y'));
        const size = t.classList.contains('cs-f15') ? 15 : t.classList.contains('cs-f13') ? 13 : 12;
        const width = textWidth(t.textContent ?? '', size);
        const anchor = t.getAttribute('text-anchor');
        const x0 = anchor === 'middle' ? x - width / 2 : anchor === 'end' ? x - width : x;
        const g = t.closest('g[transform]');
        const dx = g ? Number(/translate\(([-\d.]+)/.exec(g.getAttribute('transform')!)?.[1] ?? 0) : 0;
        return { text: t.textContent, x0: x0 + dx, x1: x0 + dx + width, y0: y - size, y1: y + 2, data: t.closest('[data-s]')?.getAttribute('data-s') };
      });
      for (const b of boxes) {
        if (b.x0 < -1 || b.x1 > w + 1) problems.push(`${id} ${w} ${lang}: "${b.text}" leaves the plot (${Math.round(b.x0)}–${Math.round(b.x1)})`);
      }
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!, b = boxes[j]!;
        if (a.data && b.data && a.data !== b.data) continue; // pipeline stages never show together with every label
        const overlap = a.x0 < b.x1 - 1 && b.x0 < a.x1 - 1 && a.y0 < b.y1 - 1 && b.y0 < a.y1 - 1;
        if (overlap) problems.push(`${id} ${w} ${lang}: "${a.text}" overlaps "${b.text}"`);
      }
    }
    expect(problems).toEqual([]);
  });
});
