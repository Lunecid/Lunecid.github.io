import type { ImageMetadata } from 'astro';
import { describe, expect, it } from 'vitest';
import { homeCopy } from '../../src/data/copy/home';
import { cartridgeMeta, projectDetailRows, projectSlug, toCartridge, type ProjectEntry } from '../../src/lib/projects';

const KO = {
  type: '경진대회',
  team: '4인 팀',
  period: { start: '2025-05', end: '2025-07' },
  org: '부산광역시 · 2025 Big Data 활용 대회(DX CHALLENGE)',
  role: '문제 정의와 분석 방향을 주도했다.',
  tools: ['Python', 'QGIS', 'XGBoost', 'scikit-learn', 'Google Colab'],
};

const EN = {
  type: 'Competition',
  team: '4-person team',
  period: { start: '2025-05', end: '2025-07' },
  org: 'Busan Metropolitan City · 2025 Big Data Utilization Contest (DX CHALLENGE)',
  role: 'Led the problem framing and analysis direction.',
  tools: ['Python', 'QGIS', 'XGBoost', 'scikit-learn', 'Google Colab'],
};

const cover = { src: '/cover.webp', width: 1600, height: 784, format: 'webp' } as ImageMetadata;

function entry(id: string, data: Record<string, unknown>): ProjectEntry {
  return { id, collection: 'projects', data } as unknown as ProjectEntry;
}

const schoolZoneKo = entry('ko/school-zone-blindspots', {
  ...KO,
  title: '사각지대를 예측하다',
  summary: '요약',
  tags: ['공간 분석', '머신러닝', '공공데이터'],
  award: { name: '최우수상(부산광역시장상)', org: '부산광역시', date: '2025-07-11', certificate: 'busan-mayor-award' },
  cover: { src: cover, alt: '히트맵', label: 'RISK HEATMAP' },
  figures: [],
  links: {},
  featured: true,
  order: 1,
  status: 'published',
});

const schoolZoneEn = entry('en/school-zone-blindspots', {
  ...EN,
  title: 'Predicting the Blind Spots',
  summary: 'Summary',
  tags: ['Geospatial', 'Machine learning', 'Public data'],
  award: { name: 'Top Excellence Award (Mayor of Busan Award)', org: 'Busan Metropolitan City', date: '2025-07-11', certificate: 'busan-mayor-award' },
  cover: { src: cover, alt: 'Heatmap', label: 'RISK HEATMAP' },
  figures: [],
  links: {},
  featured: true,
  order: 1,
  status: 'published',
});

const kboKo = entry('ko/kbo-attendance', {
  ...KO,
  title: 'KBO 구단 성적과 관중 수',
  summary: '요약',
  tools: ['Python', 'Google Colab'],
  tags: ['통계', '데이터 수집'],
  figures: [],
  links: {},
  featured: false,
  order: 5,
  status: 'card',
});

describe('project helpers', () => {
  it('projectDetailRows returns 5 labelled rows ≤6 in order for ko and en', () => {
    expect(projectDetailRows(KO, 'ko')).toEqual([
      { label: '유형', value: '경진대회 · 4인 팀' },
      { label: '기간', value: '2025.05 – 2025.07' },
      { label: '소속', value: KO.org },
      { label: '내 역할', value: KO.role },
      { label: '도구', value: 'Python, QGIS, XGBoost, scikit-learn, Google Colab' },
    ]);
    const en = projectDetailRows(EN, 'en');
    expect(en.map((row) => row.label)).toEqual(['Type', 'Period', 'Affiliation', 'My role', 'Tools']);
    expect(en[0]?.value).toBe('Competition · 4-person team');
    expect(en[1]?.value).toBe('May 2025 – Jul 2025');
    expect(en.length).toBeLessThanOrEqual(6);
  });

  it('projectDetailRows splits "tools I used" and "team tools" when teamTools exist (D-9), still ≤6 rows', () => {
    const ko = projectDetailRows({ ...KO, tools: ['Python', 'Tableau'], teamTools: ['YOLOv8', 'PyTorch'] }, 'ko');
    expect(ko.slice(4)).toEqual([
      { label: '내가 쓴 도구', value: 'Python, Tableau' },
      { label: '팀이 쓴 도구', value: 'YOLOv8, PyTorch' },
    ]);
    expect(ko).toHaveLength(6);
    const en = projectDetailRows({ ...EN, tools: ['Python'], teamTools: ['YOLOv8'] }, 'en');
    expect(en.map((row) => row.label).slice(4)).toEqual(['Tools I used', 'Team tools']);
  });

  it('cartridgeMeta joins the first two tools', () => {
    expect(cartridgeMeta(['Python', 'QGIS', 'XGBoost'])).toBe('Python · QGIS');
    expect(cartridgeMeta(['Python'])).toBe('Python');
    expect(cartridgeMeta([])).toBe('');
  });

  it('projectSlug strips the locale', () => {
    expect(projectSlug({ id: 'ko/kickick-park' })).toBe('kickick-park');
    expect(projectSlug({ id: 'en/kickick-park' })).toBe('kickick-park');
    expect(() => projectSlug({ id: 'kickick-park' })).toThrow(/locale folder/);
  });

  it('toCartridge localizes the href, maps tag keys and shortens the award sticker', () => {
    const ko = toCartridge(schoolZoneKo, 'ko');
    expect(ko).toEqual({
      href: '/projects/school-zone-blindspots/',
      title: '사각지대를 예측하다',
      meta: 'Python · QGIS',
      tagKeys: ['geospatial', 'ml', 'public-data'],
      tags: ['공간 분석', '머신러닝', '공공데이터'],
      cover,
      sticker: { text: '최우수상', kind: 'award' },
    });
    const en = toCartridge(schoolZoneEn, 'en');
    expect(en.href).toBe('/en/projects/school-zone-blindspots/');
    expect(en.tagKeys).toEqual(ko.tagKeys);
    expect(en.sticker).toEqual({ text: 'Top Excellence Award', kind: 'award' });
    const kbo = toCartridge(kboKo, 'ko', { headingLevel: 2 });
    // D-4: a 'card' project has no page: no href, and the card carries the one-line summary instead.
    expect(kbo.href).toBeUndefined();
    expect(kbo.summary).toBe('요약');
    expect(ko.summary).toBeUndefined();
    expect(kbo.cover).toBeUndefined();
    // P1-6: no real figure → a HUD plate from the project's own metadata (no chart)
    expect(kbo.plate).toEqual({ id: 'KBO-ATTENDANCE', period: '2025.05 – 2025.07', tag: '통계' });
    expect(ko.plate).toBeUndefined();
    expect(kbo.sticker).toBeUndefined();
    expect(kbo.headingLevel).toBe(2);
    expect(kbo.tagKeys).toEqual(['stats', 'collection']);
  });

  it('home copy is bilingual', () => {
    expect(homeCopy.ko.helloRecords).toHaveLength(3);
    expect(homeCopy.en.helloRecords).toHaveLength(homeCopy.ko.helloRecords.length);
    expect(homeCopy.ko.moreProjects).toBe('프로젝트 전체 보기');
    expect(homeCopy.en.moreProjects).toBe('See all projects');
  });
});
