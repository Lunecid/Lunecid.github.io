import { describe, expect, it } from 'vitest';
import SectionLabel from '../../src/components/hud/SectionLabel.astro';
import SectionHead from '../../src/components/hud/SectionHead.astro';
import { renderAstro } from './helpers';

// D-8 / P2-17: [ NN ] numbers belong to the nav alone; every other HUD label carries the numberless "[ ■ ]" mark.
const MARK = /<span class="hud-label__mark" aria-hidden="true" lang="en"[^>]*>\[<i class="hud-label__sq"[^>]*><\/i>\]<\/span>/;

describe('SectionLabel.astro', () => {
  it('renders the [ ■ ] mark (drawn, hidden from AT), the ko part and the lang=en part in the requested tag', async () => {
    const html = await renderAstro(SectionLabel, { props: { ko: '사이트 업적', en: 'SITE ACHIEVEMENTS', as: 'h3', id: 'x-title' } });
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
    const html = await renderAstro(SectionLabel, { props: { en: 'RESEARCH' } });
    expect(html).toMatch(/<p[^>]*class="hud-label"/);
    expect(html).not.toMatch(/<h[1-6][\s>]/);
    expect(html).not.toContain('hud-label__ko');
    expect(html).not.toMatch(/\sid="/);
    expect(html).not.toMatch(/\[ ?\d+ ?\]/);
    expect(html).toMatch(/<span class="hud-label__en" lang="en"[^>]*>RESEARCH<\/span>/);
  });

  it('mark={false} leaves the mark out', async () => {
    const html = await renderAstro(SectionLabel, { props: { en: 'NOW PLAYING', mark: false } });
    expect(html).not.toContain('hud-label__mark');
  });
});

describe('SectionHead.astro (one pattern for every section heading, D-8)', () => {
  it('the "[ ■ ] CAPTION" line over the title, the title is the heading with the id', async () => {
    const html = await renderAstro(SectionHead, { props: { caption: 'PATCH NOTES', title: '최근 소식', id: 'pn-title' } });
    expect(html).toMatch(/<header class="sec-head"/);
    expect(html).toMatch(MARK);
    expect(html).toMatch(/<p class="hud-label"/);
    expect(html).toMatch(/<h2 id="pn-title" class="sec-head__title"[^>]*>최근 소식<\/h2>/);
    expect(html.indexOf('PATCH NOTES')).toBeLessThan(html.indexOf('최근 소식'));
    expect(html).not.toContain('sec-head__intro');
  });

  it('captionOnly (fix round 1): the caption alone is visible; the title stays the heading, visually hidden', async () => {
    const html = await renderAstro(SectionHead, { props: { caption: 'MAIN MENU', title: '사이트 메뉴', id: 'mm-title', captionOnly: true } });
    expect(html).toMatch(/<header class="sec-head sec-head--caption"/);
    expect(html).toMatch(/<h2 id="mm-title" class="sr-only"[^>]*>사이트 메뉴<\/h2>/);
    expect(html).toMatch(/<p class="hud-label" aria-hidden="true"[^>]*>[\s\S]*MAIN MENU/);
    expect(html).not.toContain('sec-head__title');
    expect(html.indexOf('사이트 메뉴')).toBeLessThan(html.indexOf('MAIN MENU'));
  });

  it('another heading level and an intro slot', async () => {
    const html = await renderAstro(SectionHead, { props: { caption: 'JOB FIT', title: 'Job requirements', as: 'h3' }, slots: { default: 'Short intro.' } });
    expect(html).toMatch(/<h3 class="sec-head__title"[^>]*>Job requirements<\/h3>/);
    expect(html).toMatch(/<div class="sec-head__intro"[^>]*>Short intro\.<\/div>/);
  });
});
