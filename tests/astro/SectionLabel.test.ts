import { describe, expect, it } from 'vitest';
import SectionLabel from '../../src/components/hud/SectionLabel.astro';
import SectionHead from '../../src/components/hud/SectionHead.astro';
import { renderAstro } from './helpers';

// D-8 / P2-17: [ NN ] numbers belong to the nav alone; every other HUD label carries the numberless "[ ■ ]" mark.
const MARK = /<span class="hud-label__mark" aria-hidden="true" lang="en"[^>]*>\[<i class="hud-label__sq"[^>]*><\/i>\]<\/span>/;

describe('SectionLabel.astro', () => {
  it('renders the [ ■ ] mark (drawn, hidden from AT), the ko part and the lang=en part in the requested tag', async () => {
    const html = await renderAstro(SectionLabel, { props: { variant: 'game', ko: '사이트 업적', en: 'SITE ACHIEVEMENTS', as: 'h3', id: 'x-title' } });
    const open = html.match(/<h3[^>]*>/)?.[0] ?? '';
    expect(open).toContain('id="x-title"');
    expect(open).toContain('class="hud-label"');
    expect(html).toMatch(MARK);
    expect(html).toMatch(/<span class="hud-label__ko"[^>]*>사이트 업적<\/span>/);
    expect(html).toMatch(/<span class="hud-label__en" lang="en"[^>]*>SITE ACHIEVEMENTS<\/span>/);
    expect(html.indexOf('hud-label__mark')).toBeLessThan(html.indexOf('hud-label__ko'));
    expect(html.indexOf('hud-label__ko')).toBeLessThan(html.indexOf('hud-label__en'));
  });

  it('defaults to a paragraph with the English caption only, and never renders a number', async () => {
    const html = await renderAstro(SectionLabel, { props: { variant: 'game', en: 'RESEARCH' } });
    expect(html).toMatch(/<p[^>]*class="hud-label"/);
    expect(html).not.toMatch(/<h[1-6][\s>]/);
    expect(html).not.toContain('hud-label__ko');
    expect(html).not.toMatch(/\sid="/);
    expect(html).not.toMatch(/\[ ?\d+ ?\]/);
    expect(html).toMatch(/<span class="hud-label__en" lang="en"[^>]*>RESEARCH<\/span>/);
  });

  it('mark={false} leaves the mark out', async () => {
    const html = await renderAstro(SectionLabel, { props: { variant: 'game', en: 'NOW PLAYING', mark: false } });
    expect(html).not.toContain('hud-label__mark');
  });
});

describe('SectionHead.astro (one pattern for every section heading, D-8)', () => {
  it('the "[ ■ ] CAPTION" line over the title, the title is the heading with the id', async () => {
    const html = await renderAstro(SectionHead, { props: { variant: 'game', caption: 'PATCH NOTES', title: '최근 소식', id: 'pn-title' } });
    expect(html).toMatch(/<header class="sec-head"/);
    expect(html).toMatch(MARK);
    expect(html).toMatch(/<p class="hud-label"/);
    expect(html).toMatch(/<h2 id="pn-title" class="sec-head__title"[^>]*>최근 소식<\/h2>/);
    expect(html.indexOf('PATCH NOTES')).toBeLessThan(html.indexOf('최근 소식'));
    expect(html).not.toContain('sec-head__intro');
  });

  it('captionOnly (fix round 1): the caption alone is visible; the title stays the heading, visually hidden', async () => {
    const html = await renderAstro(SectionHead, { props: { variant: 'game', caption: 'MAIN MENU', title: '사이트 메뉴', id: 'mm-title', captionOnly: true } });
    expect(html).toMatch(/<header class="sec-head sec-head--caption"/);
    expect(html).toMatch(/<h2 id="mm-title" class="sr-only"[^>]*>사이트 메뉴<\/h2>/);
    expect(html).toMatch(/<p class="hud-label" aria-hidden="true"[^>]*>[\s\S]*MAIN MENU/);
    expect(html).not.toContain('sec-head__title');
    expect(html.indexOf('사이트 메뉴')).toBeLessThan(html.indexOf('MAIN MENU'));
  });

  it('another heading level and an intro slot', async () => {
    const html = await renderAstro(SectionHead, { props: { variant: 'game', caption: 'JOB FIT', title: 'Job requirements', as: 'h3' }, slots: { default: 'Short intro.' } });
    expect(html).toMatch(/<h3 class="sec-head__title"[^>]*>Job requirements<\/h3>/);
    expect(html).toMatch(/<div class="sec-head__intro"[^>]*>Short intro\.<\/div>/);
  });
});

describe('SectionLabel / SectionHead on light pages (P2-4)', () => {
  it('DS-3 general version: a rail with the aria-hidden section number and the caption chip, then the sans title; no [ ■ ] mark, no mono label', async () => {
    const html = await renderAstro(SectionHead, { props: { variant: 'data', caption: '소식', title: '최근 소식', id: 'pn-title' } });
    expect(html).toMatch(/<header class="ed-head ed-sh"/);
    expect(html).toMatch(/<div class="ed-rail"[^>]*><div class="ed-rail__in"[^>]*><span class="ed-rail__n" aria-hidden="true"[^>]*><\/span><p class="ed-label ed-chip"[^>]*>소식<\/p><\/div><\/div>/);
    expect(html).toMatch(/<h2 id="pn-title" class="ed-head__title"[^>]*>최근 소식<\/h2>/);
    expect(html).not.toContain('data-serif');
    expect(html).not.toMatch(/hud-label|sec-head|lang="en"/);
    expect(html.indexOf('소식')).toBeLessThan(html.indexOf('최근 소식'));
  });

  it('neutral pages: the same markup without data-serif (sans headings)', async () => {
    const html = await renderAstro(SectionHead, { props: { variant: 'neutral', caption: '방문 통계', title: '방문 수', id: 's-title' } });
    expect(html).toMatch(/<h2 id="s-title" class="ed-head__title"[^>]*>방문 수<\/h2>/);
    expect(html).not.toContain('data-serif');
  });

  it('captionOnly is a HUD choice: the general version still shows the title', async () => {
    const html = await renderAstro(SectionHead, { props: { variant: 'data', caption: '작업', title: '대표 프로젝트', id: 'f-title', captionOnly: true } });
    expect(html).toMatch(/<h2 id="f-title" class="ed-head__title"[^>]*>대표 프로젝트<\/h2>/);
    expect(html).not.toContain('sr-only');
  });

  it('the intro slot keeps working', async () => {
    const html = await renderAstro(SectionHead, { props: { variant: 'data', caption: 'Role fit', title: 'Job requirements fit', as: 'h3' }, slots: { default: 'Short intro.' } });
    expect(html).toMatch(/<h3 class="ed-head__title"[^>]*>Job requirements fit<\/h3>/);
    expect(html).toMatch(/<p class="ed-label ed-chip"[^>]*>Role fit<\/p>/);
    expect(html).toMatch(/<div class="ed-head__intro"[^>]*>Short intro\.<\/div>/);
  });
});
