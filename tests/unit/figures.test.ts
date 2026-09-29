import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { blockText, boxTables, coverFigureIndex, editorialFigureLabel, linkFigureCitations, placeFigures, serifHeadings, topLevelBlocks } from '../../src/lib/figures';
import { readFrontmatter } from '../content/helpers';

const BODY = [
  '<h2 id="q">질문</h2>',
  '<p>첫 문단입니다.</p>',
  '<ol>\n<li>하나 <code>x&lt;y</code></li>\n<li>둘(<code>KFold</code>, 그림 1)</li>\n</ol>',
  '<p>결과입니다(그림 2).<br>줄바꿈</p>',
  '<hr>',
  '<ul>\n<li>셋(그림 3)</li>\n<li>넷(그림 4)</li>\n</ul>',
  '<table><thead><tr><th>a</th></tr></thead><tbody><tr><td>b</td></tr></tbody></table>',
].join('\n');

describe('topLevelBlocks / blockText (P1-7)', () => {
  it('splits rendered Markdown into its top-level blocks, nested and void elements included', () => {
    const blocks = topLevelBlocks(BODY);
    expect(blocks).toHaveLength(7);
    expect(blocks[2]).toMatch(/^<ol>[\s\S]*<\/ol>$/);
    expect(blocks[3]).toBe('<p>결과입니다(그림 2).<br>줄바꿈</p>');
    expect(blocks[4]).toBe('<hr>');
    expect(blocks.join('\n')).toBe(BODY);
    expect(blockText(blocks[2]!)).toBe('하나 x<y 둘(KFold, 그림 1)');
  });

  it('refuses unbalanced HTML', () => {
    expect(() => topLevelBlocks('<p>a</div>')).toThrow();
    expect(() => topLevelBlocks('<p>a')).toThrow();
  });
});

describe('placeFigures (P1-7)', () => {
  it('puts each figure right after the first block that cites it; several in one block keep their order', () => {
    const { parts, rest } = placeFigures(BODY, ['그림 1', '그림 2', '그림 3', '그림 4']);
    expect(rest).toEqual([]);
    const shape = parts.map((p) => (p.kind === 'html' ? `html:${topLevelBlocks(p.html).length}` : `fig:${p.index}`));
    expect(shape).toEqual(['html:3', 'fig:0', 'html:1', 'fig:1', 'html:2', 'fig:2', 'fig:3', 'html:1']);
  });

  it('figures without a snippet stay in the fallback list; an uncited snippet fails the build', () => {
    const { parts, rest } = placeFigures(BODY, [undefined, '그림 2', undefined]);
    expect(rest).toEqual([0, 2]);
    expect(parts.filter((p) => p.kind === 'figure')).toEqual([{ kind: 'figure', index: 1 }]);
    expect(() => placeFigures(BODY, ['그림 9'])).toThrow(/figure 1 \("그림 9"\)/);
  });

  it('every figure of the three projects with figures has an inlineAfter snippet the body cites', () => {
    for (const lang of ['ko', 'en']) {
      for (const slug of ['school-zone-blindspots', 'kickick-park', 'youth-startup-location']) {
        const path = resolve(process.cwd(), `src/content/projects/${lang}/${slug}.md`);
        const fm = readFrontmatter(path) as { figures: { inlineAfter?: string }[] };
        const body = readFileSync(path, 'utf8').replace(/^---[\s\S]*?\n---\n/, '');
        expect(fm.figures.length, `${lang}/${slug}`).toBeGreaterThan(0);
        for (const [i, figure] of fm.figures.entries()) {
          expect(figure.inlineAfter, `${lang}/${slug} figure ${i + 1}`).toBeDefined();
          expect(body, `${lang}/${slug} cites "${figure.inlineAfter}"`).toContain(figure.inlineAfter!);
        }
      }
    }
  });
});

describe('coverFigureIndex (fix round 1: an image is shown once per case study)', () => {
  const figures = [{ src: { src: '/_astro/a.webp' } }, { src: { src: '/_astro/b.webp' } }];
  it('finds the body figure that is the cover image, by its file', () => {
    expect(coverFigureIndex({ src: '/_astro/b.webp' }, figures)).toBe(1);
    expect(coverFigureIndex({ src: '/_astro/c.webp' }, figures)).toBe(-1);
    expect(coverFigureIndex(undefined, figures)).toBe(-1);
  });

  it('the youth start-up cover is its figure 1 in both languages (the only project where they coincide)', () => {
    for (const lang of ['ko', 'en']) {
      for (const slug of ['school-zone-blindspots', 'kickick-park', 'youth-startup-location']) {
        const fm = readFrontmatter(resolve(process.cwd(), `src/content/projects/${lang}/${slug}.md`)) as { cover: { src: string }; figures: { src: string }[] };
        const index = coverFigureIndex({ src: fm.cover.src }, fm.figures.map((f) => ({ src: { src: f.src } })));
        expect(index, `${lang}/${slug}`).toBe(slug === 'youth-startup-location' ? 0 : -1);
      }
    }
  });
});

describe('boxTables (final fix 2 item 19)', () => {
  it('puts each top-level table in a scroll box named after the heading above it', () => {
    const table = '<table><thead><tr><th>a</th></tr></thead><tbody><tr><td>b</td></tr></tbody></table>';
    // P-06 F-086: the head cells gain scope="col" (the boxed table is otherwise the input).
    const scoped = '<table><thead><tr><th scope="col">a</th></tr></thead><tbody><tr><td>b</td></tr></tbody></table>';
    expect(boxTables(['<p>x</p>', table])).toEqual(['<p>x</p>', `<div class="prose-table" data-table-scroll>${scoped}</div>`]);
    expect(boxTables(['<h2 id="types">Types</h2>', '<p>x</p>', table, '<h3 id="next">Next</h3>'])).toEqual([
      '<h2 id="types">Types</h2>',
      '<p>x</p>',
      `<div class="prose-table" data-table-scroll data-label-id="types">${scoped}</div>`,
      '<h3 id="next">Next</h3>',
    ]);
  });

  it('P-06 F-086: every head cell gets scope="col"; the first body cell becomes <th scope="row"> only in a table that opts in', () => {
    // Sätteri's table output (a newline between the tags, an alignment attribute on a cell).
    const table = '<table>\n<thead>\n<tr>\n<th>유형</th>\n<th style="text-align: right">군집</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td>일반 <strong>주거</strong></td>\n<td style="text-align: right">0</td>\n</tr>\n<tr>\n<td>번화가</td>\n<td style="text-align: right">1</td>\n</tr>\n</tbody>\n</table>';
    const [plain] = boxTables([table]);
    expect(plain).toContain('<th scope="col">유형</th>\n<th scope="col" style="text-align: right">군집</th>');
    expect(plain).not.toContain('scope="row"');
    expect(plain).toContain('<td>일반 <strong>주거</strong></td>');
    const [opted] = boxTables([table.replace('<table>', '<table data-row-headers>')]);
    expect(opted).toMatch(/^<div class="prose-table" data-table-scroll><table>\n<thead>/); // the marker does not reach the page
    expect(opted).toContain('<tr>\n<th scope="row">일반 <strong>주거</strong></th>\n<td style="text-align: right">0</td>\n</tr>');
    expect(opted).toContain('<tr>\n<th scope="row">번화가</th>\n<td style="text-align: right">1</td>\n</tr>');
    expect(opted.match(/scope="col"/g)).toHaveLength(2);
    expect(boxTables([opted.replace(/^<div[^>]*>|<\/div>$/g, '')])[0]).toBe(opted); // idempotent
  });

  it('P-06 F-086: the opt-in marker is an HTML comment on the line before a Markdown table; the youth results table opts in', () => {
    const table = '<table>\n<thead>\n<tr>\n<th>a</th>\n<th>b</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td>x</td>\n<td>1</td>\n</tr>\n</tbody>\n</table>';
    const { parts } = placeFigures(`<p>앞</p>\n<!-- row-headers -->\n${table}\n<p>뒤</p>\n${table}`, []);
    const html = parts.map((p) => (p.kind === 'html' ? p.html : '')).join('\n');
    expect(html.match(/<th scope="row">x<\/th>/g)).toHaveLength(1); // only the table right after the marker
    expect(html.match(/<td>x<\/td>/g)).toHaveLength(1);
    expect(html).not.toContain('row-headers');
    for (const lang of ['ko', 'en']) {
      const body = readFileSync(resolve(process.cwd(), `src/content/projects/${lang}/youth-startup-location.md`), 'utf8');
      expect(body, lang).toMatch(/\n<!-- row-headers -->\n\| (유형|Type) \| (군집|Cluster) \|/);
    }
  });
});

describe('linkFigureCitations (P-06 F-065: a figure the body cites is one click away)', () => {
  it('links "그림 N" / "Figure N" / "Fig. N" and the numbers listed after them to #figure-N', () => {
    expect(linkFigureCitations('<p>좁혔습니다(그림 1, 2). 판정했습니다(그림 3).</p>', 3)).toBe(
      '<p>좁혔습니다(<a href="#figure-1">그림 1</a>, <a href="#figure-2">2</a>). 판정했습니다(<a href="#figure-3">그림 3</a>).</p>',
    );
    expect(linkFigureCitations('<li>districts (Figures 1 and 2); upright (Figure 3); see Fig. 2.</li>', 3)).toBe(
      '<li>districts (<a href="#figure-1">Figures 1</a> and <a href="#figure-2">2</a>); upright (<a href="#figure-3">Figure 3</a>); see <a href="#figure-2">Fig. 2</a>.</li>',
    );
  });

  it('leaves links, code, headings, attributes and numbers without a figure alone', () => {
    const html = '<h2 id="그림-1">그림 1</h2>\n<p title="그림 2"><a href="/x/">그림 2</a> <code>그림 3</code> (그림 4)</p>';
    expect(linkFigureCitations(html, 3)).toBe(html);
    expect(linkFigureCitations('<p>그림 2, 5</p>', 3)).toBe('<p><a href="#figure-2">그림 2</a>, 5</p>');
    expect(linkFigureCitations('<p>(그림 1)</p>', 0)).toBe('<p>(그림 1)</p>');
  });

  it('keeps the text the figure placement matches ("그림 1, 2" is still found after linking)', () => {
    const linked = linkFigureCitations('<p>좁혔습니다(그림 1, 2).</p>\n<p>다음</p>', 2);
    const { parts } = placeFigures(linked, ['그림 1, 2', '그림 1, 2']);
    expect(parts.map((p) => p.kind)).toEqual(['html', 'figure', 'figure', 'html']);
  });
});

describe('editorialFigureLabel (P2-5, spec §8)', () => {
  it('numbers a caption the way the body cites it', () => {
    expect(editorialFigureLabel('ko', 3)).toBe('그림 3 —');
    expect(editorialFigureLabel('en', 3)).toBe('Fig. 3 —');
  });
});

describe('serifHeadings (P2-5: case-study body headings in the serif heading face, Task 3 rule)', () => {
  it('marks every top-level h2–h4, keeps their attributes and content, and touches nothing else', () => {
    const html = '<h2 id="question">질문</h2>\n<p>본문 <strong>강조</strong></p>\n<h3>방법 <code>x</code></h3><ul><li><h4>안쪽</h4></li></ul><h4 class="k">결과</h4>';
    expect(serifHeadings(html)).toBe(
      '<h2 id="question" data-serif>질문</h2>\n<p>본문 <strong>강조</strong></p>\n<h3 data-serif>방법 <code>x</code></h3><ul><li><h4>안쪽</h4></li></ul><h4 class="k" data-serif>결과</h4>',
    );
  });
  it('is idempotent and leaves a fragment without headings unchanged', () => {
    const once = serifHeadings('<h2>데이터</h2>');
    expect(serifHeadings(once)).toBe(once);
    expect(serifHeadings('<p>그림 1</p>')).toBe('<p>그림 1</p>');
  });
});
