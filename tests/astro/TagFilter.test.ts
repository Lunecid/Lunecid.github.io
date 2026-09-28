import { describe, expect, it } from 'vitest';
import TagFilter from '../../src/components/projects/TagFilter.astro';
import { readSource, renderAstro } from './helpers';

const labelsOf = (html: string): string[] => [...html.matchAll(/data-tag="[a-z-]+"[^>]*>([^<]+)<\/button>/g)].map((m) => m[1] ?? '');

describe('TagFilter.astro', () => {
  it("group labelled by projects.filterLabel with an 'all' button pressed", async () => {
    const ko = await renderAstro(TagFilter, { props: { lang: 'ko', keys: ['nlp', 'ml'], controls: 'project-grid' } });
    expect(ko).toMatch(/<div[^>]*class="tag-filter"[^>]*role="group"[^>]*aria-label="태그로 거르기"/);
    expect(ko).toMatch(/<button[^>]*aria-pressed="true"[^>]*data-tag-all[^>]*>전체<\/button>/);
    expect(ko.match(/aria-pressed="true"/g) ?? []).toHaveLength(1);
    expect(ko.match(/aria-pressed="false"/g) ?? []).toHaveLength(2);
    const en = await renderAstro(TagFilter, { props: { lang: 'en', keys: ['nlp'], controls: 'project-grid' } });
    expect(en).toMatch(/aria-label="Filter by tag"/);
    expect(en).toMatch(/>All<\/button>/);
  });

  it('one button per given key in TAG_KEYS order with localized labels', async () => {
    const ko = await renderAstro(TagFilter, { props: { lang: 'ko', keys: ['viz', 'nlp', 'ml', 'nlp'], controls: 'project-grid' } });
    expect([...ko.matchAll(/data-tag="([a-z-]+)"/g)].map((m) => m[1])).toEqual(['ml', 'viz', 'nlp']);
    expect(labelsOf(ko)).toEqual(['머신러닝', '시각화', '자연어 처리']);
    const en = await renderAstro(TagFilter, { props: { lang: 'en', keys: ['viz', 'nlp', 'ml'], controls: 'project-grid' } });
    expect(labelsOf(en)).toEqual(['Machine learning', 'Visualization', 'NLP']);
  });

  it('buttons carry data-tag keys and aria-controls the grid', async () => {
    const html = await renderAstro(TagFilter, { props: { lang: 'ko', keys: ['nlp', 'ml'], controls: 'project-grid' } });
    const buttons = html.match(/<button\b[^>]*>/g) ?? [];
    expect(buttons).toHaveLength(3);
    for (const button of buttons) {
      expect(button).toContain('type="button"');
      expect(button).toContain('aria-controls="project-grid"');
    }
    expect(buttons.filter((button) => /data-tag="/.test(button))).toHaveLength(2);
    expect(html).toMatch(/data-controls="project-grid"/);
    expect(html).toMatch(/data-count-template="\{n\}개"/);
    // P2-8: a separate singular template ("1 project", not "1 projects" — Korean has no distinction).
    expect(html).toMatch(/data-count-template-one="\{n\}개"/);
    const en = await renderAstro(TagFilter, { props: { lang: 'en', keys: ['nlp', 'ml'], controls: 'project-grid' } });
    expect(en).toMatch(/data-count-template="\{n\} projects"/);
    expect(en).toMatch(/data-count-template-one="\{n\} project"/);
    expect(html).toMatch(/<p[^>]*role="status"[^>]*data-tag-filter-status/);
    expect(html).toMatch(/<script\b[^>]*src="[^"]*TagFilter\.astro\?astro&(?:amp;)?type=script/);
  });

  it('filter UI is hidden without JS', () => {
    const source = readSource('src/components/projects/TagFilter.astro');
    expect(source).toMatch(/\.tag-filter\s*\{[^}]*display:\s*none/);
    expect(source).toMatch(/:global\(html\.js\)\s*\.tag-filter/);
    expect(source).toMatch(/:global\(html\.js\)\s*\.tag-filter\s*\{[^}]*display:\s*flex/);
  });
});
