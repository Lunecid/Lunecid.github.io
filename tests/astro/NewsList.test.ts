import { describe, expect, it } from 'vitest';
import NewsList from '../../src/components/data/NewsList.astro';
import type { PatchNoteItem } from '../../src/lib/news';
import { renderAstro } from './helpers';

const notes: PatchNoteItem[] = [
  { dateIso: '2026-09-01', dateLabel: '2026.09.01', version: 'v2026.09', kindLabel: '연구', short: '구두 발표', text: '논문을 구두 발표했습니다.', href: '/data/research/cog-2026-engagement/' },
  { dateIso: '2025-07-11', dateLabel: '2025.07.11', version: 'v2025.07', kindLabel: '수상', short: null, text: '최우수상을 받았습니다.', href: null },
];

describe('NewsList.astro (P2-7)', () => {
  it('a dated list under the #patch-notes id, without version tags, pointers or HUD chips', async () => {
    const html = await renderAstro(NewsList, { props: { lang: 'ko', notes } });
    expect(html).toMatch(/<section id="patch-notes" class="news ed-sec"[^>]*aria-labelledby="pn-title"/);
    expect(html).toMatch(/<p class="ed-label ed-chip"[^>]*>소식<\/p>/);
    expect(html).toMatch(/<h2 id="pn-title" class="ed-head__title"[^>]*>최근 소식<\/h2>/);
    // DS-4 (named): dated rows — the date in its own column (the separator dot aria-hidden), title and body beside it
    expect(html.match(/<li class="ed-news__item news__item"/g)).toHaveLength(2);
    expect(html).toMatch(/<p class="ed-news__date"[^>]*><time datetime="2026-09-01"[^>]*>2026\.09\.01<\/time><span aria-hidden="true"[^>]*>·<\/span><span[^>]*>연구<\/span><\/p>/);
    expect(html).toMatch(/<a class="hit" href="\/data\/research\/cog-2026-engagement\/"[^>]*>구두 발표<\/a>/);
    expect(html).not.toMatch(/v2026|▶|pn__|PATCH NOTES/);
  });

  it('DS-4: a row with a page is one stretched link (ring on the row); a row without one has no link and its text is the title', async () => {
    const html = await renderAstro(NewsList, { props: { lang: 'ko', notes } });
    const rows = html.match(/<li class="ed-news__item[\s\S]*?<\/li>/g) ?? [];
    expect(rows[0]).toMatch(/<p class="ed-news__title"[^>]*><a class="hit"[^>]*>구두 발표<\/a><\/p>\s*<p class="ed-news__body"[^>]*>논문을 구두 발표했습니다\.<\/p>/);
    expect(rows[1]).toMatch(/<p class="ed-news__title"[^>]*>최우수상을 받았습니다\.<\/p>/);
    expect(rows[1]).not.toMatch(/<a |ed-news__body/);
    const css = (await import('node:fs')).readFileSync('src/styles/editorial.css', 'utf8');
    expect(css).toMatch(/\.ed-news__item:has\(\.hit:focus-visible\) \{[^}]*outline: 2px solid var\(--ed-focus\)/);
  });
});
