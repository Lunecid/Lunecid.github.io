import { describe, expect, it } from 'vitest';
import { DOCUMENTS } from '../../src/config';
import {
  ANCHORS,
  PROJECT_PAGE_SLUGS,
  PROJECT_SLUGS,
  STATIC_PATHS,
  STORY_SLUGS,
  allRoutes,
  isKnownInternalHref,
  koPaths,
  routesFor,
} from '../../src/lib/routes';

describe('route table', () => {
  it('koPaths has 12 unique trailing-slash paths', () => {
    const paths = koPaths();
    expect(paths).toHaveLength(12);
    expect(new Set(paths).size).toBe(12);
    for (const p of paths) {
      expect(p.startsWith('/'), p).toBe(true);
      expect(p.endsWith('/'), p).toBe(true);
      expect(p.startsWith('/en/'), p).toBe(false);
    }
    expect(paths.slice(0, STATIC_PATHS.length)).toEqual([...STATIC_PATHS]);
    expect(paths).toContain('/research/cog-2026-engagement/');
    for (const slug of PROJECT_PAGE_SLUGS) expect(paths).toContain(`/projects/${slug}/`);
    // D-4: KBO and Seoul apartment are link-less cards without a page.
    expect(PROJECT_SLUGS.filter((slug) => !paths.includes(`/projects/${slug}/`))).toEqual(['kbo-attendance', 'seoul-apartment-automl']);
    expect(isKnownInternalHref('/projects/kbo-attendance/')).toBe(false);
    expect(STORY_SLUGS).toEqual(['cog-2026-engagement']);
  });

  it("allRoutes is 24 routes, en = '/en' + ko", () => {
    const all = allRoutes();
    expect(all).toHaveLength(24);
    expect(new Set(all).size).toBe(24);
    expect(routesFor('ko')).toEqual(koPaths());
    expect(routesFor('en')).toEqual(koPaths().map((p) => `/en${p}`));
    expect(all).toEqual([...routesFor('ko'), ...routesFor('en')]);
    expect(all).toContain('/en/');
    expect(all.some((r) => r.startsWith('/print/'))).toBe(false);
  });

  it('every ANCHORS key is a ko path', () => {
    const paths = koPaths();
    for (const [key, ids] of Object.entries(ANCHORS)) {
      expect(paths, key).toContain(key);
      expect(new Set(ids).size, key).toBe(ids.length);
      for (const id of ids) expect(id, `${key}#${id}`).toMatch(/^[a-z][a-z0-9-]*$/);
    }
    expect(ANCHORS['/research/']).toContain('in-progress');
    expect(ANCHORS['/research/cog-2026-engagement/']).toEqual(['abstract', 'bibtex']); // D-15 paper page
  });

  it("ANCHORS['/records/'] lists projects between publications and awards", () => {
    const records = ANCHORS['/records/'] ?? [];
    expect(records).toEqual(['profile', 'education', 'publications', 'projects', 'awards', 'activities', 'certifications', 'languages', 'training', 'skills', 'job-fit', 'documents']);
    const i = records.indexOf('projects');
    expect(records[i - 1]).toBe('publications');
    expect(records[i + 1]).toBe('awards');
  });

  it("isKnownInternalHref accepts '/records/#job-fit' and the 3 document PDFs and rejects '/records/#nope' and '/nope/'", () => {
    expect(isKnownInternalHref('/records/#job-fit')).toBe(true);
    expect(isKnownInternalHref('/records/#education')).toBe(true);
    expect(isKnownInternalHref('/research/#in-progress')).toBe(true);
    expect(isKnownInternalHref('/research/cog-2026-engagement/')).toBe(true);
    expect(isKnownInternalHref('/research/cog-2026-engagement/#abstract')).toBe(true);
    expect(isKnownInternalHref('/research/cog-2026-engagement/#for-game-teams')).toBe(false); // story anchor removed (D-15)
    expect(isKnownInternalHref('/projects/school-zone-blindspots/')).toBe(true);
    expect(isKnownInternalHref('/')).toBe(true);
    for (const pdf of Object.values(DOCUMENTS)) expect(isKnownInternalHref(pdf), pdf).toBe(true);
    expect(isKnownInternalHref('/records/#nope')).toBe(false);
    expect(isKnownInternalHref('/nope/')).toBe(false);
    expect(isKnownInternalHref('/records')).toBe(false);
    expect(isKnownInternalHref('/en/records/')).toBe(false);
    expect(isKnownInternalHref('/projects/school-zone-blind-spot/')).toBe(false);
    expect(isKnownInternalHref('https://lunecid.github.io/records/')).toBe(false);
    expect(isKnownInternalHref('//lunecid.github.io/records/')).toBe(false);
  });
});
