import { describe, expect, it } from 'vitest';
import { SITE } from '../../src/config';
import {
  TRADEMARK_TERMS,
  alternateLinks,
  canonicalUrl,
  containsTrademark,
  ogSlugFor,
  personJsonLd,
} from '../../src/lib/seo';

describe('seo helpers', () => {
  it('ogSlugFor table', () => {
    expect(ogSlugFor('/')).toBe('home');
    expect(ogSlugFor('/en/')).toBe('en/home');
    expect(ogSlugFor('/projects/kickick-park/')).toBe('projects/kickick-park');
    expect(ogSlugFor('/en/records/')).toBe('en/records');
    expect(ogSlugFor('/404/')).toBe('home');
    expect(ogSlugFor('/404.html')).toBe('home');
    expect(ogSlugFor('/research/cog-2026-engagement')).toBe('research/cog-2026-engagement');
  });

  it('canonicalUrl adds the trailing slash', () => {
    expect(canonicalUrl('/projects')).toBe('https://lunecid.github.io/projects/');
    expect(canonicalUrl('/en/records/')).toBe('https://lunecid.github.io/en/records/');
    expect(canonicalUrl('/')).toBe('https://lunecid.github.io/');
  });

  it('alternateLinks gives ko, en and x-default for both language forms', () => {
    const records = [
      { hreflang: 'ko', href: 'https://lunecid.github.io/records/' },
      { hreflang: 'en', href: 'https://lunecid.github.io/en/records/' },
      { hreflang: 'x-default', href: 'https://lunecid.github.io/records/' },
    ];
    expect(alternateLinks('/records/')).toEqual(records);
    expect(alternateLinks('/en/records/')).toEqual(records);
    expect(alternateLinks('/')).toEqual([
      { hreflang: 'ko', href: 'https://lunecid.github.io/' },
      { hreflang: 'en', href: 'https://lunecid.github.io/en/' },
      { hreflang: 'x-default', href: 'https://lunecid.github.io/' },
    ]);
  });

  it('personJsonLd names Seongeun Baek with GitHub and DACON in sameAs and adds only non-null researchIds', () => {
    const ko = personJsonLd('ko');
    expect(ko).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'Person',
      name: '백성은',
      alternateName: 'Seongeun Baek',
      url: 'https://lunecid.github.io/',
      email: SITE.email,
      sameAs: [SITE.githubUrl, SITE.daconUrl],
    });
    const en = personJsonLd('en', { scholar: 'https://scholar.google.com/citations?user=abc', orcid: null });
    expect(en.name).toBe('Seongeun Baek');
    expect(en.alternateName).toBe('백성은');
    expect(en.url).toBe('https://lunecid.github.io/en/');
    expect(en.sameAs).toEqual([SITE.githubUrl, SITE.daconUrl, 'https://scholar.google.com/citations?user=abc']);
    expect(en.affiliation).toMatchObject({
      name: 'Data Science Lab (DataLab), Graduate School of Data Science, Pusan National University', // P2-28: full name first
      url: SITE.labUrl,
    });
    expect(JSON.stringify(ko)).not.toMatch(/\d{2,3}-\d{3,4}-\d{4}/); // no phone number
  });

  it("containsTrademark flags every TRADEMARK_TERMS entry and passes 'IEEE CoG 2026'", () => {
    expect(TRADEMARK_TERMS).toEqual(
      expect.arrayContaining([
        '넥슨', 'NEXON', '메이플', 'MapleStory', '던전앤파이터', 'Dungeon & Fighter', '네오플', 'Neople',
        '원신', 'Genshin', '젠레스', 'Zenless', 'ZZZ',
        '리그 오브 레전드', 'League of Legends', 'LoL', 'Riot', '배틀그라운드', 'PUBG', 'Steam',
        'HoYoverse', '이터널 리턴', 'Eternal Return',
        'Hatsune Miku', '하츠네 미쿠', '初音ミク',
      ]),
    );
    for (const term of TRADEMARK_TERMS) {
      expect(containsTrademark(`${term} 사례 연구`), term).toBe(true);
      expect(containsTrademark(`/projects/${term.toLowerCase().replace(/ /g, '-')}/`), `url ${term}`).toBe(true);
    }
    expect(containsTrademark('league of legends')).toBe(true);
    expect(containsTrademark('IEEE CoG 2026')).toBe(false);
    expect(containsTrademark('Player Log · Seongeun Baek')).toBe(false);
    expect(containsTrademark('Engagement Outcome Prediction Case Study · Seongeun Baek')).toBe(false);
  });
});
