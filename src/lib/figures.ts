// src/lib/figures.ts — place case-study figures right after the block that first cites them (P1-7).
//
// A project's Markdown body is rendered once by the content layer (entry.rendered.html). This module splits that HTML
// into its top-level blocks (paragraphs, lists, tables, headings…) and interleaves the figures: a figure with an
// `inlineAfter` snippet goes right after the first block whose text contains the snippet (e.g. "그림 1" / "Figure 1"),
// in figure order when several share a block; figures without one stay in the fallback list after the body, in their
// order. A snippet that no block contains throws, so a body edit that drops a citation fails the build.
// P2-5 adds the general version's caption label and body headings (editorialFigureLabel, serifHeadings); audit P-06
// adds the citation links (linkFigureCitations, F-065) and the table header scopes (boxTables, F-086).
import type { Lang } from '../i18n/ui';
import { t } from '../i18n/utils';

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

/**
 * The top-level elements of an HTML fragment, in order. Whitespace between blocks is dropped; text at the top level
 * (there is none in rendered Markdown) is kept as its own block. Assumes well-formed HTML (Markdown output).
 */
export function topLevelBlocks(html: string): string[] {
  const blocks: string[] = [];
  const tag = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*>/g;
  const open: string[] = [];
  let start = -1;
  let cursor = 0;
  for (let m = tag.exec(html); m; m = tag.exec(html)) {
    const token = m[0];
    const name = (m[1] ?? '').toLowerCase();
    if (open.length === 0) {
      const between = html.slice(cursor, m.index);
      if (between.trim() !== '') blocks.push(between.trim());
    }
    if (token.startsWith('<!--')) {
      if (open.length === 0) cursor = m.index + token.length;
      continue;
    }
    const closing = token.startsWith('</');
    const selfClosing = !closing && (VOID.has(name) || token.endsWith('/>'));
    if (closing) {
      if (open.pop() !== name) throw new Error(`figures: unbalanced </${name}> in the rendered body`);
      if (open.length === 0) {
        blocks.push(html.slice(start, m.index + token.length));
        cursor = m.index + token.length;
      }
    } else if (selfClosing) {
      if (open.length === 0) {
        blocks.push(token);
        cursor = m.index + token.length;
      }
    } else {
      if (open.length === 0) start = m.index;
      open.push(name);
    }
  }
  if (open.length !== 0) throw new Error(`figures: unclosed <${open[open.length - 1]}> in the rendered body`);
  const tail = html.slice(cursor).trim();
  if (tail !== '') blocks.push(tail);
  return blocks;
}

/** Visible text of an HTML fragment: tags dropped, the few entities Markdown emits decoded, whitespace squashed. */
export function blockText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export type BodyPart = { kind: 'html'; html: string } | { kind: 'figure'; index: number };

/**
 * Final fix 2 item 19: every top-level table goes into its own box (.prose-table, read.css). The table lays its columns
 * out by content and breaks words only at spaces and hyphens, so on a narrow phone a table wider than the column
 * scrolls sideways inside the box (src/scripts/table-scroll.ts makes the box a focusable region then, named by the
 * heading above the table) instead of splitting English words mid-word ("differentiati|on").
 * P-06 F-086: every head cell gets scope="col", and in a table marked data-row-headers (see ROW_HEADERS_MARKER) the
 * first cell of every body row becomes <th scope="row">; the mark itself is dropped (no rehype plugin: P1-3's toolchain
 * test).
 */
export function boxTables(blocks: readonly string[]): string[] {
  let heading: string | null = null;
  return blocks.map((block) => {
    const id = /^<h[2-4]\b[^>]*\sid="([^"]+)"/.exec(block)?.[1];
    if (id) heading = id;
    if (!/^<table[\s>]/.test(block)) return block;
    return `<div class="prose-table" data-table-scroll${heading ? ` data-label-id="${heading}"` : ''}>${scopeCells(block)}</div>`;
  });
}

/** P-06 F-086: head cells scope their column; a marked table's first body cells become row headers (see boxTables). */
function scopeCells(table: string): string {
  const rowHeaders = /^<table\b[^>]*\sdata-row-headers\b/.test(table);
  let out = table.replace(/^(<table\b[^>]*?)\sdata-row-headers(?:="[^"]*")?/, '$1');
  out = out.replace(/<thead\b[^>]*>[\s\S]*?<\/thead>/g, (head) => head.replace(/<th\b(?![^>]*\sscope=)/g, '<th scope="col"'));
  if (!rowHeaders) return out;
  return out.replace(/<tbody\b[^>]*>[\s\S]*?<\/tbody>/g, (body) =>
    body.replace(/(<tr\b[^>]*>\s*)<td\b([^>]*)>([\s\S]*?)<\/td>/g, '$1<th scope="row"$2>$3</th>'),
  );
}

/**
 * P-06 F-086: a Markdown table opts in to row headers with the HTML comment `<!-- row-headers -->` on the line right
 * before it (its first column names the row, e.g. the youth case study's results table). placeFigures turns the
 * comment into the table's data-row-headers mark before the blocks are split (topLevelBlocks drops comments).
 */
const ROW_HEADERS_MARKER = /<!--\s*row-headers\s*-->\s*<table\b/g;

/**
 * The body as HTML runs with the inline figures between them, and the indexes of the figures left for the fallback
 * list. `anchors[i]` is figure i's `inlineAfter` snippet (or undefined). Consecutive blocks are joined into one run.
 */
export function placeFigures(html: string, anchors: readonly (string | undefined)[]): { parts: BodyPart[]; rest: number[] } {
  const blocks = boxTables(topLevelBlocks(html.replace(ROW_HEADERS_MARKER, '<table data-row-headers')));
  const texts = blocks.map(blockText);
  const after = new Map<number, number[]>();
  const rest: number[] = [];
  anchors.forEach((snippet, index) => {
    if (snippet === undefined) {
      rest.push(index);
      return;
    }
    const at = texts.findIndex((text) => text.includes(snippet));
    if (at === -1) throw new Error(`figures: no paragraph of the body cites figure ${index + 1} ("${snippet}")`);
    after.set(at, [...(after.get(at) ?? []), index]);
  });
  const parts: BodyPart[] = [];
  let run: string[] = [];
  blocks.forEach((block, i) => {
    run.push(block);
    const figures = after.get(i);
    if (figures) {
      parts.push({ kind: 'html', html: run.join('\n') });
      run = [];
      for (const index of figures) parts.push({ kind: 'figure', index });
    }
  });
  if (run.length > 0) parts.push({ kind: 'html', html: run.join('\n') });
  return { parts, rest };
}

/**
 * Fix round 1: the body figure that is the same image file as the cover, or -1. A case study shows an image once: that
 * figure is not repeated in the body or the fallback list; PROJECT DETAILS shows it with the figure's number and
 * caption, so the body's "(그림 N)" / "(Figure N)" resolves to the cover.
 */
export function coverFigureIndex(cover: { src: string } | undefined, figures: readonly { src: { src: string } }[]): number {
  if (!cover) return -1;
  const key = fileKey(cover);
  return figures.findIndex((figure) => fileKey(figure.src) === key);
}

/**
 * The file an imported image came from, read without publishing it: `.src` on an imported image marks its full-size
 * original as used (see sourceSize in images.ts), `fsPath` does not. Plain objects (tests) fall back to `src`.
 */
function fileKey(image: { src: string }): string {
  return (image as { fsPath?: string }).fsPath ?? image.src;
}

/** Elements whose text never gains a citation link: an existing link, code, headings, captions and raw text. */
const NO_CITATION_LINK = new Set(['a', 'code', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'figcaption', 'script', 'style']);
/**
 * A figure citation in running text: the word and its number ("그림 1", "Figure 3", "Fig. 2", "Figs. 1") and the numbers
 * listed after it ("그림 1, 2", "그림 1·2", "그림 1 및 2", "Figures 1 and 2"). A number followed by a letter or digit
 * ("그림 2개", "2개") is not a figure; a range ("그림 1–3") links only its first number.
 */
const CITATION = /(?<![\p{L}\p{N}])(그림|Figures?|Figs?\.)(\s?)(\d+)(?![\p{L}\p{N}])((?:(?:,\s*|\s*·\s*|\s+(?:and|및)\s+)\d+(?![\p{L}\p{N}]))*)/gu;

/**
 * P-06 F-065: the body's figure citations link to the figure they cite (`#figure-N`, the id on Figure's <figure>, or
 * on the ProjectDetails cover when the cover is figure N), in both versions. `count` is the case study's number of
 * figures; a number outside 1…count stays plain text. Only text is rewritten — tags, attributes, comments and the text
 * inside NO_CITATION_LINK elements are returned unchanged — so the visible text (and every `inlineAfter` snippet
 * placeFigures looks for) stays the same. Well-formed HTML is assumed (Markdown output, as topLevelBlocks).
 */
export function linkFigureCitations(html: string, count: number): string {
  // A quoted attribute value may hold a raw '>' (Sätteri writes alt="a > b"): the tag runs to the first '>' outside quotes.
  const tag = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*>/g;
  const cites = (n: string): boolean => Number(n) >= 1 && Number(n) <= count;
  const link = (n: string, text: string): string => (cites(n) ? `<a href="#figure-${Number(n)}">${text}</a>` : text);
  const linkText = (text: string): string =>
    text.replace(CITATION, (match: string, word: string, space: string, first: string, listed: string) =>
      cites(first) ? `${link(first, `${word}${space}${first}`)}${listed.replace(/\d+/g, (n) => link(n, n))}` : match,
    );
  let skip = 0;
  let cursor = 0;
  let out = '';
  for (let m = tag.exec(html); m; m = tag.exec(html)) {
    const text = html.slice(cursor, m.index);
    out += (skip === 0 ? linkText(text) : text) + m[0];
    cursor = m.index + m[0].length;
    if (NO_CITATION_LINK.has((m[1] ?? '').toLowerCase())) skip += m[0].startsWith('</') ? -1 : 1;
  }
  const tail = html.slice(cursor);
  return out + (skip === 0 ? linkText(tail) : tail);
}

/** The general version's figure caption label (spec §8): '그림 n —' / 'Fig. n —', n = the number the body cites. */
export function editorialFigureLabel(lang: Lang, n: number): string {
  return t(lang, 'figure.editorial', { n });
}

/**
 * The general version's case-study body headings (spec §8 제목: 세리프, P2-3 rule): every top-level <h2>–<h4> of a
 * rendered Markdown fragment gains data-serif, so it is set in "SB Serif KR Head" and the font build subsets its
 * Hangul. Nested headings, attributes, text and whitespace are returned unchanged; a heading that already carries
 * data-serif is left alone. Well-formed HTML is assumed (Markdown output, as topLevelBlocks).
 */
export function serifHeadings(html: string): string {
  const tag = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*>/g;
  let depth = 0;
  let cursor = 0;
  let out = '';
  for (let m = tag.exec(html); m; m = tag.exec(html)) {
    const token = m[0];
    if (token.startsWith('<!--')) continue;
    if (token.startsWith('</')) {
      depth -= 1;
      continue;
    }
    const name = (m[1] ?? '').toLowerCase();
    if (depth === 0 && /^h[2-4]$/.test(name) && !/\sdata-serif(?=[\s=>/])/.test(token)) {
      out += `${html.slice(cursor, m.index)}${token.slice(0, -1)} data-serif>`;
      cursor = m.index + token.length;
    }
    if (!VOID.has(name) && !token.endsWith('/>')) depth += 1;
  }
  return out + html.slice(cursor);
}
