import type { ImageMetadata } from 'astro';
import type { CollectionEntry } from 'astro:content';
import { z } from 'astro/zod';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { publicationSchema } from '../../src/content/schemas';
import { bibtexField, toPaperCard, toPaperPage } from '../../src/lib/publications';
import { readFrontmatter } from '../content/helpers';

const file = fileURLToPath(new URL('../../src/content/publications/cog-2026-engagement.md', import.meta.url));
const parsed = publicationSchema(z.string()).parse(readFrontmatter(file));
const thumb = { src: '/thumb.webp', width: 1600, height: 873, format: 'webp' } as ImageMetadata;

function entry(overrides: Partial<typeof parsed> = {}): CollectionEntry<'publications'> {
  return {
    id: 'cog-2026-engagement',
    collection: 'publications',
    data: { ...parsed, ...overrides, thumbnail: { ...parsed.thumbnail, src: thumb } },
  } as unknown as CollectionEntry<'publications'>;
}

describe('toPaperCard', () => {
  it('toPaperCard picks gloss, abstract language, thumb alt and localized case-study href per lang', () => {
    const ko = toPaperCard(entry(), 'ko');
    expect(ko.id).toBe('cog-2026-engagement');
    expect(ko.title).toBe(parsed.title);
    expect(ko.titleGloss).toBe(parsed.titleKo);
    expect(ko.abstract).toBe(parsed.abstractKo);
    expect(ko.abstractLang).toBe('ko');
    expect(ko.thumb).toBe(thumb);
    expect(ko.thumbAlt).toBe(parsed.thumbnail.altKo);
    expect(ko.href).toBe('/research/cog-2026-engagement/');
    expect(ko.tldr).toBe(parsed.tldr.ko);
    expect(ko.authors).toEqual([
      { name: 'Seongeun Baek', me: true },
      { name: 'Joonho Kwon', me: false },
    ]);
    expect(ko.oral).toBe(true);
    expect(ko.venueShort).toBe('IEEE CoG 2026');
    expect(ko.year).toBe(2026);
    expect(ko.code).toBe('https://github.com/Lunecid/LOL_teamfight_Lab/tree/v1.0-cog2026');
    expect(ko.bibtex.startsWith('@inproceedings{baek2026killconditioned,')).toBe(true);
    expect(ko.bibtex.endsWith('}')).toBe(true);

    const en = toPaperCard(entry(), 'en');
    expect(en.titleGloss).toBeNull();
    expect(en.abstract).toBe(parsed.abstract);
    expect(en.abstractLang).toBe('en');
    expect(en.thumbAlt).toBe(parsed.thumbnail.alt);
    expect(en.href).toBe('/en/research/cog-2026-engagement/');
    expect(en.tldr).toBe(parsed.tldr.en);
    expect(en.authors.map((a) => a.name)).toEqual(ko.authors.map((a) => a.name));
  });

  it('statusNote shown when pdf and doi are null', () => {
    expect(toPaperCard(entry(), 'ko').statusNote).toBe('IEEE Xplore 게재 예정');
    expect(toPaperCard(entry(), 'en').statusNote).toBe('To appear in IEEE Xplore');
    const withDoi = toPaperCard(entry({ doi: '10.1109/CoG00000.2026.0000000' }), 'ko');
    expect(withDoi.statusNote).toBeNull();
    expect(withDoi.doi).toBe('10.1109/CoG00000.2026.0000000');
    expect(toPaperCard(entry({ caseStudy: undefined }), 'en').href).toBeNull();
  });
});

describe('bibtexField', () => {
  it('reads braced and quoted fields, strips protective braces and does not confuse title with booktitle', () => {
    expect(bibtexField(parsed.bibtex, 'booktitle')).toBe('2026 IEEE Conference on Games (CoG)');
    expect(bibtexField(parsed.bibtex, 'title')).toBe(
      'Kill-Conditioned Engagement Outcome Prediction in League of Legends Under Minute-Resolution Public Telemetry',
    );
    expect(bibtexField('@article{x,\n  journal = "IEEE Trans. Games",\n}', 'journal')).toBe('IEEE Trans. Games');
    expect(bibtexField(parsed.bibtex, 'journal')).toBeNull();
  });
});

describe('toPaperPage', () => {
  it('ko page: English title and abstract plus the Korean title and abstract; affiliation without e-mail', () => {
    const ko = toPaperPage(entry(), 'ko');
    expect(ko.venueLine).toBe('2026 IEEE Conference on Games (CoG)');
    expect(ko.title).toBe(parsed.title);
    expect(ko.titleKo).toBe(parsed.titleKo);
    expect(ko.abstract).toBe(parsed.abstract);
    expect(ko.abstractKo).toBe(parsed.abstractKo);
    expect(ko.authors).toEqual([
      { name: 'Seongeun Baek', me: true, affiliation: ['Pusan National University', 'South Korea'] },
      { name: 'Joonho Kwon', me: false, affiliation: ['Pusan National University', 'South Korea'] },
    ]);
    expect(JSON.stringify(ko.authors)).not.toContain('@');
    expect(ko.keywords).toEqual(['League of Legends', 'esports analytics', 'engagement-outcome prediction', 'public game telemetry']);
    expect(ko.presentation).toBe('구두 발표 · 스페인 마드리드 · 2026.09.01–04');
    expect(ko.statusNote).toBe('IEEE Xplore 게재 예정');
    expect(ko.code).toBe('https://github.com/Lunecid/LOL_teamfight_Lab/tree/v1.0-cog2026');
    expect(ko.doi).toBeNull();
    expect(ko.pdf).toBeNull();
    expect(ko.bibtex).toBe(parsed.bibtex.trimEnd());
  });

  it('en page: no Korean title or abstract; English presentation line', () => {
    const en = toPaperPage(entry(), 'en');
    expect(en.titleKo).toBeNull();
    expect(en.abstractKo).toBeNull();
    expect(en.abstract).toBe(parsed.abstract);
    expect(en.presentation).toBe('Oral presentation · Madrid, Spain · Sep 1–4, 2026');
    expect(en.statusNote).toBe('To appear in IEEE Xplore');
  });

  it('falls back when optional data is missing and hides the status note once a DOI exists', () => {
    const bare = toPaperPage(
      entry({ keywords: undefined, presentation: undefined, bibtex: '@misc{x, title = {T}}', authors: [{ name: 'A', me: true }] }),
      'en',
    );
    expect(bare.keywords).toEqual([]);
    expect(bare.presentation).toBeNull();
    expect(bare.venueLine).toBe(parsed.venue);
    expect(bare.authors).toEqual([{ name: 'A', me: true, affiliation: [] }]);
    expect(toPaperPage(entry({ doi: '10.1109/CoG00000.2026.0000000' }), 'en').statusNote).toBeNull();
  });
});
