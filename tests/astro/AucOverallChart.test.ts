import { describe, expect, it } from 'vitest';
import AucOverallChart from '../../src/components/research/AucOverallChart.astro';
import { overallAuc } from '../../src/data/research/cog-2026';
import { readSource, renderAstro } from './helpers';

const CAPTION = '15.16 패치 테스트 AUC, 세 시드 평균. 세로선은 우연 수준(0.5)입니다.';
const ALT = '모델별 AUC 점 그래프. LightGBM 0.675, 같은 입력의 MLP 0.626, Bi-GRU 0.581.';

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function classesOf(tag: string): string[] {
  return (/\sclass="([^"]*)"/.exec(tag)?.[1] ?? '').split(/\s+/);
}
function openTags(html: string, tag: string, cls: string): string[] {
  return [...html.matchAll(new RegExp(`<${tag}\\b[^>]*>`, 'g'))].map((m) => m[0]).filter((t) => classesOf(t).includes(cls));
}
function attr(tag: string, name: string): string | undefined {
  return new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
}
function texts(html: string, cls: string): string[] {
  return [...html.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)].filter((m) => classesOf(m[1]).includes(cls)).map((m) => m[2]);
}
const render = (lang: 'ko' | 'en', tone?: 'read' | 'hud') =>
  renderAstro(AucOverallChart, { props: { lang, rows: overallAuc, caption: CAPTION, alt: ALT, ...(tone ? { tone } : {}) } });

// P0-1 + batch 4: the chart renders three SVGs (CSS container queries pick one by the chart's own width) so no box
// ever needs horizontal scroll to show every model's dot and value. This helper scopes assertions to one layout.
type LayoutName = 'wide' | 'compact' | 'narrow';
const LAYOUTS: LayoutName[] = ['wide', 'compact', 'narrow'];
function layoutOf(html: string, name: LayoutName): string {
  const start = html.indexOf(`<div class="chart__scroll chart__scroll--${name}"`);
  expect(start, `${name} layout present`).toBeGreaterThan(-1);
  const end = html.indexOf('</svg>', start);
  return html.slice(start, end + '</svg>'.length);
}
function viewBoxWidth(part: string): number {
  const svg = openTags(part, 'svg', 'chart__svg')[0];
  return Number((attr(svg, 'viewBox') ?? '').split(/\s+/)[2]);
}

describe('AucOverallChart.astro', () => {
  it('svg role=img with title/desc in every layout; ids never repeat', async () => {
    const html = await render('ko');
    const titleIds = LAYOUTS.map((name) => {
      const part = layoutOf(html, name);
      const svg = openTags(part, 'svg', 'chart__svg')[0];
      expect(svg).toBeDefined();
      expect(attr(svg, 'role')).toBe('img');
      const titleId = attr(svg, 'aria-labelledby');
      const descId = attr(svg, 'aria-describedby');
      expect(titleId).toBeTruthy();
      expect(descId).toBeTruthy();
      expect(part).toMatch(new RegExp(`<title[^>]*id="${titleId}"[^>]*>모델별 AUC 점 그래프</title>`));
      expect(part).toMatch(new RegExp(`<desc[^>]*id="${descId}"[^>]*>${escapeRe(ALT)}</desc>`));
      return titleId;
    });
    // All three SVGs are always in the DOM (CSS, not markup, picks the visible one), so their ids differ.
    expect(new Set(titleIds).size).toBe(3);
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('8 rows in table order with 3-decimal labels, in every layout', async () => {
    const html = await render('ko');
    for (const name of LAYOUTS) {
      const part = layoutOf(html, name);
      expect(texts(part, 'chart__label'), name).toEqual(overallAuc.map((row) => row.model));
      expect(texts(part, 'chart__value'), name).toEqual(['0.675', '0.626', '0.581', '0.581', '0.576', '0.571', '0.569', '0.569']);
      const ys = openTags(part, 'circle', 'chart__dot').map((c) => Number(attr(c, 'cy')));
      expect(ys).toHaveLength(8);
      expect([...ys].sort((a, b) => a - b)).toEqual(ys); // top to bottom in table order
      // A visible gap separates the tabular pair (LightGBM, MLP) from the neural group.
      expect(ys[2] - ys[1]).toBeGreaterThan(ys[1] - ys[0]);
      // Higher AUC sits further right (x encodes AUC, no bars).
      const xs = openTags(part, 'circle', 'chart__dot').map((c) => Number(attr(c, 'cx')));
      expect(xs[0]).toBeGreaterThan(xs[1]);
      expect(xs[1]).toBeGreaterThan(xs[2]);
      expect(part).not.toMatch(/<rect\b/);
      // One highlighted dot per layout: LightGBM.
      expect(openTags(part, 'circle', 'chart__dot--hl')).toHaveLength(1);
      expect(part.split(/<g\b/).find((chunk) => chunk.includes('data-model="lightgbm"'))).toContain('chart__dot--hl');
    }
  });

  it('P0-1: every dot and value of the narrow and compact layouts sits inside its viewBox (no horizontal scroll needed)', async () => {
    const html = await render('ko');
    for (const [name, maxWidth] of [['narrow', 320], ['compact', 280]] as const) {
      const part = layoutOf(html, name);
      const vbWidth = viewBoxWidth(part);
      expect(vbWidth, name).toBeLessThanOrEqual(maxWidth); // narrow: fits the smallest supported viewport (320px)
      const dots = openTags(part, 'circle', 'chart__dot');
      expect(dots).toHaveLength(8);
      for (const dot of dots) expect(Number(attr(dot, 'cx')) + 7).toBeLessThan(vbWidth);
      // Value text sits to the right of its dot; its start x plus ~40 units for "0.XXX" at 13px must still fit.
      const valueTags = [...part.matchAll(/<text\b([^>]*)>[^<]*<\/text>/g)].map((m) => m[1]).filter((t) => classesOf(t).includes('chart__value'));
      expect(valueTags).toHaveLength(8);
      for (const tag of valueTags) expect(Number(attr(tag, 'x')) + 40, name).toBeLessThan(vbWidth);
    }
    // compact: model names stay left of the plot and start inside the box ("Transformer" ≈ 75 units at 13px)
    const compact = layoutOf(html, 'compact');
    const labelXs = [...compact.matchAll(/<text\b([^>]*)>[^<]*<\/text>/g)].map((m) => m[1]).filter((t) => classesOf(t).includes('chart__label')).map((t) => Number(attr(t, 'x')));
    for (const x of labelXs) expect(x).toBeGreaterThanOrEqual(80);
  });

  it('the layout follows the chart box (container queries): narrow < 280px ≤ compact < 560px ≤ wide; each SVG shows only in a box at least its viewBox wide', async () => {
    const src = readSource('src/components/research/AucOverallChart.astro');
    expect(src).toMatch(/\.chart\s*\{[^}]*container-type:\s*inline-size/);
    expect(src).toMatch(/\.chart__scroll--wide,\s*\n\s*\.chart__scroll--compact\s*\{\s*display:\s*none/);
    expect(src).toMatch(/@container \(min-width: 280px\) \{\s*\.chart__scroll--compact \{ display: block; \}\s*\.chart__scroll--narrow \{ display: none; \}/);
    expect(src).toMatch(/@container \(min-width: 560px\) \{\s*\.chart__scroll--wide \{ display: block; \}\s*\.chart__scroll--compact \{ display: none; \}/);
    expect(src).not.toMatch(/@media \((min|max)-width/); // the viewport no longer decides (the no-art hero puts the chart in a narrow column)
    const html = await render('ko');
    expect(viewBoxWidth(layoutOf(html, 'wide'))).toBe(560);
    expect(viewBoxWidth(layoutOf(html, 'compact'))).toBe(280);
    expect(viewBoxWidth(layoutOf(html, 'narrow'))).toBe(280);
  });

  it('LightGBM highlighted, chance rule at 0.5 (wide layout)', async () => {
    const html = await render('ko');
    const wide = layoutOf(html, 'wide');
    const chance = openTags(wide, 'line', 'chart__chance')[0];
    expect(chance).toBeDefined();
    expect(attr(chance, 'data-value')).toBe('0.5');
    const tick050 = openTags(wide, 'text', 'chart__tick').find((tag) => attr(tag, 'data-tick') === '0.50');
    expect(tick050).toBeDefined();
    expect(attr(chance, 'x1')).toBe(attr(tick050 as string, 'x'));
    expect(texts(wide, 'chart__chance-label')).toEqual(['우연 수준']);
    // Every model is above chance: all dots sit right of the chance rule.
    const xs = openTags(wide, 'circle', 'chart__dot').map((c) => Number(attr(c, 'cx')));
    expect(Math.min(...xs)).toBeGreaterThan(Number(attr(chance, 'x1')));

    const en = await render('en');
    expect(texts(layoutOf(en, 'wide'), 'chart__chance-label')).toEqual(['chance']);
  });

  it('table fallback inside details', async () => {
    const html = await render('ko');
    expect(html).toMatch(/<details(?=[^>]*class="chart__table")[^>]*>\s*<summary[^>]*>표로 보기<\/summary>[\s\S]*?<table/);
    const body = /<tbody[^>]*>([\s\S]*?)<\/tbody>/.exec(html)?.[1] ?? '';
    const rowHeads = [...body.matchAll(/<th(?=[^>]*scope="row")[^>]*>([^<]*)<\/th>/g)].map((m) => m[1]);
    expect(rowHeads).toEqual(overallAuc.map((row) => row.model));
    expect(body).toContain('설계한 표 형식');
    expect(body).toContain('0.675');
    const en = await render('en');
    expect(en).toMatch(/<summary[^>]*>View as table<\/summary>/);
    expect(en).toContain('engineered tabular');
  });

  it('each .chart__scroll uses data-table-scroll (overflow-only tab stop); SVG title is a short name', async () => {
    const html = await render('ko');
    const shortTitle = '모델별 AUC 점 그래프';
    for (const name of LAYOUTS) {
      const part = layoutOf(html, name);
      expect(part).toMatch(new RegExp(`^<div(?=[^>]*class="chart__scroll chart__scroll--${name}")(?=[^>]*data-table-scroll)[^>]*>\\s*<svg`));
      const scroll = openTags(part, 'div', 'chart__scroll')[0];
      expect(attr(scroll, 'tabindex')).toBeUndefined();
      expect(attr(scroll, 'role')).toBeUndefined();
      const labelId = attr(scroll, 'data-label-id');
      expect(labelId).toBeTruthy();
      expect(part).toMatch(new RegExp(`id="${labelId}"[^>]*>${escapeRe(shortTitle)}<`));
    }
    const en = await render('en');
    expect(layoutOf(en, 'wide')).toContain('>AUC by model, dot plot<');
  });

  it('wide chart svg keeps min-width 560px; compact and narrow carry no such floor', () => {
    const src = readSource('src/components/research/AucOverallChart.astro');
    expect(src).toMatch(/\.chart__svg\s*\{[^}]*min-width:\s*560px/);
    expect(src).toMatch(/\.chart__svg--compact,\s*\n\s*\.chart__svg--narrow\s*\{[^}]*min-width:\s*0/);
    expect(src).toMatch(/\.chart__scroll\s*\{[^}]*overflow-x:\s*auto/);
    expect(src).toMatch(/wideLayout:\s*Layout\s*=\s*\{\s*w:\s*560/);
    expect(src).toMatch(/compactLayout:\s*Layout\s*=\s*\{\s*w:\s*280/);
    expect(src).toMatch(/narrowLayout:\s*Layout\s*=\s*\{\s*w:\s*280/);
  });

  it('tone="hud" marks the figure for the dark HUD styles; the default stays the light reading style', async () => {
    expect(await render('ko')).toMatch(/<figure class="chart chart--overall"[\s>]/);
    expect(await render('ko', 'hud')).toMatch(/<figure class="chart chart--overall chart--hud"/);
    const src = readSource('src/components/research/AucOverallChart.astro');
    expect(src).toMatch(/\.chart--hud \.chart__dot--hl\s*\{\s*fill:\s*var\(--hud-strong\)/);
    expect(src).toMatch(/\.chart--hud \.chart__scroll\s*\{[^}]*background:\s*transparent/);
  });
});

describe('final review fix 1 item 5: the "view as table" table on phones', () => {
  it('sits in a scroll box that becomes a focusable region named by the table only when it overflows; names and values never wrap', async () => {
    const html = await render('en');
    // Fix round 2 item 8: no tab stop and no region in the markup; the script adds them only while the box overflows,
    // and the name then comes from the table's own caption, not the chart caption (which already names the chart).
    const box = /<div(?=[^>]*class="chart__table-scroll")[^>]*>/.exec(html)?.[0] ?? '';
    expect(box).toMatch(/data-table-scroll/);
    expect(box).not.toMatch(/tabindex|role=|aria-labelledby/);
    // Final fix 2 item 23: the region takes the summary's name, so "AUC by model" is heard once (as the table's).
    expect(box).toMatch(/data-label-id="auc-overall-table-summary"/);
    expect(html).toMatch(/<summary class="chart__summary" id="auc-overall-table-summary"[^>]*>View as table<\/summary>/);
    expect(html).toMatch(/<table[^>]*>\s*<caption(?=[^>]*id="auc-overall-table-caption")(?=[^>]*class="sr-only")[^>]*>AUC by model<\/caption>/);
    expect(html).not.toMatch(/<p(?=[^>]*class="chart__caption-text")[^>]*\sid=/);
    const ko = await render('ko');
    expect(ko).toMatch(/<caption(?=[^>]*id="auc-overall-table-caption")[^>]*>모델별 AUC<\/caption>/);
    const src = readSource('src/components/research/AucOverallChart.astro');
    expect(src).toMatch(/box\.scrollWidth > box\.clientWidth/);
    expect(src).toMatch(/new ResizeObserver/);
    expect(src).toMatch(/\.chart__table-scroll \{[^}]*overflow-x: auto/);
    expect(src).toMatch(/\.chart__table tbody th,\s*\.chart__table td:last-child \{ white-space: nowrap; \}/);
    expect(src).toMatch(/\.chart__table td \{[^}]*overflow-wrap: normal/);
  });
});

describe('final review fix 1 item 16: provenance line', () => {
  it("the figcaption says the values are the paper's, and says nothing about a reproduction or an audit", async () => {
    const cases = [['ko', '논문에 보고된 값'], ['en', 'Values as reported in the paper']] as const;
    for (const [lang, source] of cases) {
      const html = await render(lang);
      const caption = /<figcaption[^>]*>([\s\S]*?)<\/figcaption>/.exec(html)?.[1] ?? '';
      expect(caption, lang).toMatch(new RegExp(`<p(?=[^>]*class="chart__source")[^>]*>${source}</p>`));
      expect(html, lang).not.toMatch(/reproduc|audit|재현|감사|0\.669/i);
    }
  });
});

describe('final fix 2', () => {
  it('item 23: the table view follows the figcaption, so the figure is named by the caption and source line only', async () => {
    for (const lang of ['ko', 'en'] as const) {
      const html = await render(lang);
      const figcaption = /<figcaption class="chart__caption"[^>]*>([\s\S]*?)<\/figcaption>/.exec(html)?.[1] ?? '';
      expect(figcaption, lang).toContain('chart__caption-text');
      expect(figcaption, lang).toContain('chart__source');
      expect(figcaption, lang).not.toMatch(/<details|<summary|<table|<caption/);
      expect(html.indexOf('</figcaption>'), lang).toBeLessThan(html.indexOf('<details class="chart__table"'));
      expect(html.indexOf('</details>'), lang).toBeLessThan(html.indexOf('</figure>'));
    }
  });

  it('item 18: in forced colours every label and mark takes a system colour', () => {
    for (const file of ['src/components/research/AucOverallChart.astro', 'src/components/research/AucLabel.astro']) {
      const src = readSource(file);
      const block = /@media \(forced-colors: active\) \{([\s\S]*?)\n  \}\n/.exec(src)?.[1] ?? '';
      expect(block, file).toMatch(/fill: CanvasText/);
      expect(block, file).toMatch(/fill: Highlight/);
      expect(block, file).toMatch(/stroke: GrayText/);
    }
  });
});
