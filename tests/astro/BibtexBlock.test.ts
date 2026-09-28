import { describe, expect, it } from 'vitest';
import BibtexBlock from '../../src/components/research/BibtexBlock.astro';
import { readSource, renderAstro } from './helpers';

const BIBTEX = '@inproceedings{baek2026killconditioned,\n  author    = {Baek, Seongeun and Kwon, Joonho},\n  booktitle = {2026 IEEE Conference on Games (CoG)},\n  year      = {2026}\n}\n';

describe('BibtexBlock.astro', () => {
  it('a labelled section with a BibTeX h2, one block span per source line and no scroll region', async () => {
    const html = await renderAstro(BibtexBlock, { props: { lang: 'ko', bibtex: BIBTEX } });
    expect(html).toMatch(/<section(?=[^>]*id="bibtex")(?=[^>]*aria-labelledby="bibtex-title")(?=[^>]*data-bib)[^>]*>/);
    expect(html).toMatch(/<h2[^>]*id="bibtex-title"[^>]*>BibTeX<\/h2>/);
    const lines = [...html.matchAll(/<span class="bib__line"[^>]*>([^<]*)<\/span>/g)].map((m) => m[1].replace(/&amp;/g, '&'));
    expect(lines).toEqual(BIBTEX.trimEnd().split('\n'));
    expect(html).not.toMatch(/<pre[^>]*tabindex/); // lines wrap; nothing scrolls
  });

  it('copy button: three stacked labels (복사 / 복사했습니다 / 복사 실패), described by the heading; a polite status region', async () => {
    const html = await renderAstro(BibtexBlock, { props: { lang: 'ko', bibtex: BIBTEX } });
    expect(html).toMatch(/<button(?=[^>]*type="button")(?=[^>]*data-bib-copy)(?=[^>]*data-state="idle")(?=[^>]*aria-describedby="bibtex-title")[^>]*>/);
    expect(html).toMatch(/<span data-label="idle"[^>]*>복사<\/span>/);
    expect(html).toMatch(/<span data-label="done"[^>]*>복사했습니다<\/span>/);
    expect(html).toMatch(/<span data-label="fail"[^>]*>복사 실패<\/span>/);
    expect(html).toMatch(/<p(?=[^>]*class="sr-only")(?=[^>]*role="status")(?=[^>]*data-done="BibTeX를 클립보드에 복사했습니다\.")[^>]*><\/p>/);

    const en = await renderAstro(BibtexBlock, { props: { lang: 'en', bibtex: BIBTEX } });
    expect(en).toMatch(/<span data-label="idle"[^>]*>Copy<\/span>/);
    expect(en).toMatch(/data-done="BibTeX copied to the clipboard\."/);
  });

  it('fix round 1 item 7: heading={false} skips the h2/region landmark; square draws square corners', async () => {
    const html = await renderAstro(BibtexBlock, { props: { lang: 'ko', bibtex: BIBTEX, id: 'pub-bib', heading: false, square: true } });
    expect(html).toMatch(/<div(?=[^>]*id="pub-bib")(?=[^>]*class="bib bib--square")(?=[^>]*data-bib)[^>]*>/);
    expect(html).not.toMatch(/<section/);
    expect(html).not.toMatch(/<h2/);
    expect(html).not.toContain('aria-labelledby');
    // Fix round 2 item 6: no aria-label at all now (a fixed "BibTeX 복사"/"Copy BibTeX" only ever matched the
    // idle-state visible text, breaking WCAG 2.5.3 once the button's own text moved to 복사했습니다/복사 실패 on
    // click). The accessible name is the currently-visible label span instead — always in sync by construction.
    expect(html).toMatch(/<button(?=[^>]*data-bib-copy)(?![^>]*aria-label)(?![^>]*aria-describedby)[^>]*>/);
    // Fix round 3 item 4: each state's own visible span carries a sr-only " BibTeX" suffix instead, so the name
    // starts with the visible text (still 2.5.3-safe) but keeps the context the headed variant's
    // aria-describedby={titleId} used to give it — this embedded variant has no heading to point to.
    expect(html).toMatch(/<span data-label="idle"[^>]*>복사<span(?=[^>]*class="sr-only")(?=[^>]*lang="en")[^>]*> BibTeX<\/span><\/span>/);
    expect(html).toMatch(/<span data-label="done"[^>]*>복사했습니다<span(?=[^>]*class="sr-only")(?=[^>]*lang="en")[^>]*> BibTeX<\/span><\/span>/);
    expect(html).toMatch(/<span data-label="fail"[^>]*>복사 실패<span(?=[^>]*class="sr-only")(?=[^>]*lang="en")[^>]*> BibTeX<\/span><\/span>/);
    const en = await renderAstro(BibtexBlock, { props: { lang: 'en', bibtex: BIBTEX, heading: false } });
    expect(en).not.toMatch(/aria-label/);
    expect(en).toMatch(/<span data-label="idle"[^>]*>Copy<span(?=[^>]*class="sr-only")(?=[^>]*lang="en")[^>]*> BibTeX<\/span><\/span>/);
    // default props (paper page, D-15) are unaffected: still a labelled <section> with an <h2>, not square.
    const standalone = await renderAstro(BibtexBlock, { props: { lang: 'ko', bibtex: BIBTEX } });
    expect(standalone).toMatch(/<section(?=[^>]*class="bib")[^>]*>/);
    expect(standalone).not.toContain('bib--square');
  });

  it('no layout shift: labels share one grid cell, the button appears only under html.js, and print hides it', () => {
    const src = readSource('src/components/research/BibtexBlock.astro');
    expect(src).toMatch(/\.bib__copy \{[^}]*display: none;[^}]*grid-template-areas: "label";/);
    expect(src).toMatch(/:global\(html\.js\) \.bib__copy \{ display: inline-grid; \}/);
    expect(src).toMatch(/\.bib__copy > span \{ grid-area: label; visibility: hidden; \}/);
    expect(src).toMatch(/navigator\.clipboard\.writeText\(text\)/);
    expect(src).toMatch(/@media print \{\s*\.bib__copy \{ display: none !important; \}/);
  });
});
