import { describe, expect, it } from 'vitest';
import PageHeader from '../../src/components/hud/PageHeader.astro';
import { renderAstro } from './helpers';

describe('PageHeader.astro', () => {
  it('renders exactly one h1 with the title and the HUD label', async () => {
    const html = await renderAstro(PageHeader, {
      props: {
        lang: 'ko',
        label: 'SELECT YOUR PROJECT',
        title: '프로젝트',
        intro: '공간 분석, 컴퓨터 비전, 매출 예측 프로젝트입니다.',
      },
    });
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html).toMatch(/<h1[^>]*id="page-head-title"[^>]*>프로젝트<\/h1>/);
    expect(html).toMatch(/<section[^>]*class="page-head hud-grid"[^>]*aria-labelledby="page-head-title"/);
    // D-8: the numberless [ ■ ] mark, no [ NN ] number outside the nav.
    expect(html).toMatch(/<p class="hud-label"[^>]*><span class="hud-label__mark"[\s\S]*?SELECT YOUR PROJECT/);
    expect(html).not.toMatch(/\[ ?\d+ ?\]/);
    expect(html.indexOf('SELECT YOUR PROJECT')).toBeLessThan(html.indexOf('<h1'));
    expect(html).toMatch(/<p class="page-head__intro"[^>]*>공간 분석, 컴퓨터 비전, 매출 예측 프로젝트입니다\.<\/p>/);
  });

  it('omits the intro paragraph when it is not given', async () => {
    const html = await renderAstro(PageHeader, { props: { lang: 'en', label: 'RECORDS', title: 'Records' } });
    expect(html).not.toContain('page-head__intro');
    expect(html).toMatch(/<h1[^>]*>Records<\/h1>/);
  });
});
