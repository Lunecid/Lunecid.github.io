import { describe, expect, it } from 'vitest';
import { checkPaperPages, documentEntries, sortBySlugOrder, sortPublications } from '../../src/lib/portfolio';
import { DOCUMENTS } from '../../src/config';
import { PROJECT_SLUGS } from '../../src/lib/routes';

describe('portfolio pure helpers (CA-10)', () => {
  it('sortBySlugOrder puts entries in PROJECT_SLUGS order and rejects an unknown slug', () => {
    const shuffled = [...PROJECT_SLUGS].reverse().map((slug) => ({ id: `ko/${slug}` }));
    expect(sortBySlugOrder(shuffled).map((e) => e.id)).toEqual(PROJECT_SLUGS.map((slug) => `ko/${slug}`));
    expect(shuffled[0]?.id).toBe(`ko/${PROJECT_SLUGS.at(-1)}`); // input not mutated
    expect(() => sortBySlugOrder([{ id: 'ko/not-a-project' }])).toThrow(/PROJECT_SLUGS/);
  });

  it('sortPublications: year descending, then highlighted first', () => {
    const list = [
      { id: 'a', data: { year: 2025, highlight: false } },
      { id: 'b', data: { year: 2026, highlight: false } },
      { id: 'c', data: { year: 2026, highlight: true } },
    ];
    expect(sortPublications(list).map((e) => e.id)).toEqual(['c', 'b', 'a']);
  });

  it('checkPaperPages keeps entries with a caseStudy and requires it to be /research/<id>/', () => {
    const ok = { id: 'x', data: { caseStudy: '/research/x/' } };
    expect(checkPaperPages([ok, { id: 'y', data: {} }])).toEqual([ok]);
    expect(() => checkPaperPages([{ id: 'x', data: { caseStudy: '/research/y/' } }])).toThrow(/expected "\/research\/x\/"/);
  });

  it('documentEntries follows DOCUMENTS key order and needs a label for every document', () => {
    const label = { ko: 'k', en: 'e' };
    const docs = (Object.keys(DOCUMENTS) as (keyof typeof DOCUMENTS)[]).reverse().map((id) => ({ id, label, href: DOCUMENTS[id] }));
    expect(documentEntries(docs).map((d) => d.id)).toEqual(Object.keys(DOCUMENTS));
    expect(documentEntries(docs).every((d) => d.href === DOCUMENTS[d.id])).toBe(true);
    expect(() => documentEntries(docs.slice(1))).toThrow(/documents has no/);
  });
});
