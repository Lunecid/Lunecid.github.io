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
    expect(html.match(/<li class="ed-item news__item"/g)).toHaveLength(2);
    expect(html).toMatch(/<time datetime="2026-09-01"[^>]*>2026\.09\.01<\/time> · 연구/);
    expect(html).toMatch(/<a class="hit" href="\/data\/research\/cog-2026-engagement\/"[^>]*>구두 발표<\/a>/);
    expect(html).not.toMatch(/v2026|▶|pn__|PATCH NOTES/);
  });
});
