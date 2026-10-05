import { describe, expect, it } from 'vitest';
import PageHeadData from '../../src/components/data/PageHeadData.astro';
import { formatDate, t } from '../../src/i18n/utils';
import { todayIso } from '../../src/lib/records';
import { renderAstro } from './helpers';

const head = (props: Record<string, unknown>, url = '/data/projects/') => renderAstro(PageHeadData, { props: { lang: 'ko', ...props }, url });

describe('PageHeadData.astro (DS-3)', () => {
  it('caption, aria-hidden job line (canonical path, last update), aria-hidden display in English, one h1 with its id', async () => {
    const html = await head({ caption: '포트폴리오', title: '프로젝트', display: t('en', 'projects.title'), intro: '소개 문장입니다.' });
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html).toMatch(/<h1 id="page-head-title" class="ed-phead__title"[^>]*>프로젝트<\/h1>/);
    expect(html).toMatch(/<div class="ed-tblock"[^>]*>\s*<p class="ed-label"[^>]*>포트폴리오<\/p>/);
    const job = html.match(/<p class="ed-tblock__meta" aria-hidden="true"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? '';
    expect(job).toMatch(/<span lang="en"[^>]*>LUNECID\.GITHUB\.IO\/DATA\/PROJECTS\/<\/span>/);
    expect(job).toContain(`${t('ko', 'footer.lastUpdated')} ${formatDate(todayIso(new Date()), 'ko')}`);
    expect(html).toMatch(/<p class="ed-display" aria-hidden="true" lang="en" data-display[^>]*>Projects<\/p>/);
    expect(html).toMatch(/<p class="ed-phead__lead"[^>]*>소개 문장입니다\.<\/p>/);
    // the accent line is paint: aria-hidden, empty
    expect(html).toMatch(/<span class="ed-mc ed-mc--aline" aria-hidden="true"[^>]*><i class="ed-mc__r"[^>]*><\/i><i class="ed-mc__y"[^>]*><\/i><\/span>/);
    // order: label block, accent, display, h1, lead
    const order = ['ed-tblock', 'ed-mc--aline', 'ed-display', 'ed-phead__title', 'ed-phead__lead'].map((c) => html.indexOf(c));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).not.toMatch(/data-serif|hud-/);
  });

  it('the display word comes from the English title on Korean pages and is marked lang="en" and data-display', async () => {
    const ko = await head({ caption: '포트폴리오', title: '기록·이력서', display: t('en', 'records.title') }, '/data/records/');
    expect(ko).toMatch(/<p class="ed-display" aria-hidden="true" lang="en" data-display[^>]*>Records &amp; CV<\/p>/);
    expect(ko).not.toContain('ed-phead__lead');
    const en = await head({ lang: 'en', caption: 'Portfolio', title: 'Records & CV', display: t('en', 'records.title') }, '/en/data/records/');
    expect(en).toMatch(/LUNECID\.GITHUB\.IO\/EN\/DATA\/RECORDS\//);
    expect(en).toContain(`${t('en', 'footer.lastUpdated')} ${formatDate(todayIso(new Date()), 'en')}`);
    expect(en).toMatch(/<p class="ed-display"[^>]*>Records &amp; CV<\/p>/);
  });

  it('case variant: slug and period instead of the path', async () => {
    const html = await head(
      { caption: '프로젝트', title: '사각지대를 예측하다', display: 'Predicting the Blind Spots', titleId: 'pd-title', job: ['school-zone-blindspots', '2025.05 – 2025.07'] },
      '/data/projects/school-zone-blindspots/',
    );
    expect(html).toMatch(/<h1 id="pd-title" class="ed-phead__title"[^>]*>사각지대를 예측하다<\/h1>/);
    const job = html.match(/<p class="ed-tblock__meta" aria-hidden="true"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? '';
    expect([...job.matchAll(/<span[^>]*>([^<]*)<\/span>/g)].map((m) => m[1])).toEqual(['school-zone-blindspots', '2025.05 – 2025.07']);
    expect(job).not.toMatch(/LUNECID|lang="en"/);
  });

  it('DS-5: mosaic adds the aria-hidden painted mosaic after the main column; off by default', async () => {
    const html = await head({ caption: '포트폴리오', title: '프로젝트', display: 'Projects', mosaic: true });
    expect(html).toMatch(/^<div class="ed-g ed-phead__grid ed-phead__grid--mosaic"/);
    expect(html).toMatch(/<\/div>\s*<span class="ed-mc ed-mc--mosaic" aria-hidden="true"[^>]*>(<i class="ed-mc__[rbyw]"[^>]*><\/i>){6}<\/span>\s*<\/div>$/);
    const plain = await head({ caption: '포트폴리오', title: '연구', display: 'Research' });
    expect(plain).not.toMatch(/mosaic/);
  });
});
