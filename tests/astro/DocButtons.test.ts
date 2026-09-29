import { describe, expect, it } from 'vitest';
import DocButtons from '../../src/components/records/DocButtons.astro';
import { renderAstro } from './helpers';

const documents = [
  { id: 'resume-data-ko', label: '국문 이력서 (2쪽)', href: '/cv/seongeun-baek-resume-data-ko.pdf' },
  { id: 'resume-data-en', label: '영문 이력서 (1쪽)', href: '/cv/seongeun-baek-resume-data-en.pdf' },
  { id: 'cv-academic', label: 'Academic CV', href: '/cv/seongeun-baek-cv-academic.pdf' },
];

describe('DocButtons.astro (P2-4)', () => {
  it('game version: the cut-corner buttons, unchanged', async () => {
    const html = await renderAstro(DocButtons, { props: { variant: 'game', documents, primary: 'resume-data-ko' } });
    expect(html).toMatch(/<ul class="doc-btns" role="list"/);
    expect(html).toMatch(/class="btn cut btn--fill doc-btns__btn"/);
  });

  it('general version: one filled button (the primary PDF) and underlined links for the rest, same hrefs and titles', async () => {
    const html = await renderAstro(DocButtons, { props: { variant: 'data', documents, primary: 'resume-data-ko' } });
    expect(html).toMatch(/<ul class="ed-docs" role="list"/);
    expect(html.match(/ed-btn--fill/g)).toHaveLength(1);
    expect(html.match(/class="ed-link ed-docs__link"/g)).toHaveLength(2);
    expect([...html.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map((m) => m[1])).toEqual(documents.map((d) => d.href));
    expect(html).toMatch(/title="국문 이력서 \(2쪽\) · PDF" download/);
    expect(html).not.toMatch(/(?<![\w-])(btn|cut)(?![\w-])|doc-btns/);
  });
});
