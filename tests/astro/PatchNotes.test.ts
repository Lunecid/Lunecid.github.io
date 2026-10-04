import { describe, expect, it } from 'vitest';
import PatchNotes from '../../src/components/home/PatchNotes.astro';
import type { PatchNoteItem } from '../../src/lib/news';
import { readSource, renderAstro } from './helpers';

const notes: PatchNoteItem[] = [
  { dateIso: '2026-09-01', dateLabel: '2026.09.01', version: 'v2026.09', kindLabel: '연구', short: 'IEEE CoG 2026 구두 발표', text: 'IEEE CoG 2026에서 구두 발표했습니다.', href: '/game/research/cog-2026-engagement/' },
  { dateIso: '2025-07-11', dateLabel: '2025.07.11', version: 'v2025.07', kindLabel: '수상', short: null, text: '최우수상(부산광역시장상)을 받았습니다.', href: null },
];

describe('PatchNotes.astro (P1-9: a dark hud-grid band)', () => {
  it('a dark HUD band: version tag, time, HUD chip, and only the short title is the link', async () => {
    const html = await renderAstro(PatchNotes, { props: { variant: 'game', lang: 'ko', notes } });
    expect(html).toMatch(/<section[^>]*id="patch-notes"[^>]*class="pn sec hud-grid"/);
    expect(html).not.toMatch(/class="pn read"/);
    expect(html).toMatch(/<h2[^>]*>최근 소식<\/h2>/);
    expect(html).toContain('PATCH NOTES');
    expect(html).toMatch(/<ol[^>]*class="pn__list"/);
    expect(html.match(/<li\b/g) ?? []).toHaveLength(2);
    expect(html).toMatch(/<span class="pn__ver" lang="en"[^>]*>v2026\.09(\.\d+)?<\/span>/);
    expect(html).toMatch(/<time[^>]*datetime="2026-09-01"[^>]*>2026\.09\.01<\/time>/);
    expect(html).toMatch(/<span[^>]*class="pn__tag"[^>]*>연구<\/span>/);
    expect(html).toMatch(/<span class="pn__ptr" aria-hidden="true"[^>]*>▶<\/span>/);
    // the short title is the one link; the sentence under it is plain text
    const links = [...html.matchAll(/<a\b[^>]*>([^<]*)<\/a>/g)].map((m) => m[1]);
    expect(links).toEqual(['IEEE CoG 2026 구두 발표']);
    expect(html).toMatch(/<p class="pn__text"[^>]*>IEEE CoG 2026에서 구두 발표했습니다\.<\/p>/);
    // no short title and no link: the sentence is the plain title
    expect(html).toMatch(/<p class="pn__title"[^>]*>최우수상\(부산광역시장상\)을 받았습니다\.<\/p>/);
  });

  it('English page: the English title under the same caption', async () => {
    const html = await renderAstro(PatchNotes, { props: { variant: 'game', lang: 'en', notes } });
    expect(html).toContain('PATCH NOTES');
    expect(html).toMatch(/<h2[^>]*>Recent news<\/h2>/);
    expect(html).not.toContain('최근 소식');
  });

  it('▶ shows on hover and keyboard focus only; the link underlines on hover', () => {
    const src = readSource('src/components/home/PatchNotes.astro');
    expect(src).toMatch(/\.pn__ptr \{[^}]*opacity: 0/);
    // hover only on hover-capable pointers (a tap leaves no sticky ▶); focus-within shows it everywhere
    expect(src).toMatch(/@media \(hover: hover\) \{\s*\.pn__item:hover \.pn__ptr \{ opacity: 1/);
    expect(src).toMatch(/\n  \.pn__item:focus-within \.pn__ptr \{ opacity: 1/);
    expect(src).toMatch(/\.pn__link \{[^}]*text-decoration: none/);
    expect(src).toMatch(/\.pn__link:hover \{[^}]*text-decoration: underline/);
  });
});
