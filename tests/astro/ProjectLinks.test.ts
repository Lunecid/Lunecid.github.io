import { describe, expect, it } from 'vitest';
import ProjectLinks from '../../src/components/projects/ProjectLinks.astro';
import { renderAstro } from './helpers';

const links = {
  github: 'https://github.com/Lunecid/busan-school-zone-blindspots',
  report: 'https://github.com/Lunecid/busan-school-zone-blindspots/blob/main/docs/report.pdf',
  slides: 'https://github.com/Lunecid/busan-school-zone-blindspots/blob/main/docs/presentation.pdf',
};

describe('ProjectLinks.astro', () => {
  it('github/report/slides links; private label when empty', async () => {
    const ko = await renderAstro(ProjectLinks, { props: { variant: 'game', lang: 'ko', links } });
    expect(ko).toMatch(/<section[^>]*id="links"[^>]*aria-labelledby="links-title"/);
    expect(ko).toMatch(/<h2[^>]*id="links-title"[^>]*>링크<\/h2>/);
    expect(ko).toMatch(/<a[^>]*href="https:\/\/github\.com\/Lunecid\/busan-school-zone-blindspots"[^>]*>GitHub 저장소/);
    expect(ko).toMatch(/<a[^>]*href="[^"]*report\.pdf"[^>]*>보고서 PDF/);
    expect(ko).toMatch(/<a[^>]*href="[^"]*presentation\.pdf"[^>]*>발표자료 PDF/);
    expect(ko).not.toContain('target=');
    expect(ko).not.toContain('저장소 비공개');

    const empty = await renderAstro(ProjectLinks, { props: { variant: 'game', lang: 'ko', links: {} } });
    expect(empty).toMatch(/<p[^>]*class="plinks__private lh-tag"[^>]*>저장소 비공개<\/p>/);
    expect(empty).not.toMatch(/id="links"/);
    expect(empty).not.toMatch(/<a\b/);

    const en = await renderAstro(ProjectLinks, { props: { variant: 'game', lang: 'en', links: { github: 'https://github.com/Lunecid/MultiCamp_Final' } } });
    expect(en).toMatch(/>GitHub repository/);
    expect(en).not.toContain('Report (PDF)');
    expect(en.match(/<li\b/g) ?? []).toHaveLength(1);
    const enEmpty = await renderAstro(ProjectLinks, { props: { variant: 'game', lang: 'en', links: {} } });
    expect(enEmpty).toContain('Private repository');
  });
});
