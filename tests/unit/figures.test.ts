import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { blockText, boxTables, coverFigureIndex, placeFigures, topLevelBlocks } from '../../src/lib/figures';
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
    expect(boxTables(['<p>x</p>', table])).toEqual(['<p>x</p>', `<div class="prose-table" data-table-scroll>${table}</div>`]);
    expect(boxTables(['<h2 id="types">Types</h2>', '<p>x</p>', table, '<h3 id="next">Next</h3>'])).toEqual([
      '<h2 id="types">Types</h2>',
      '<p>x</p>',
      `<div class="prose-table" data-table-scroll data-label-id="types">${table}</div>`,
      '<h3 id="next">Next</h3>',
    ]);
  });
});
