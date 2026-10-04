import { describe, expect, it } from 'vitest';
import Resume from '../../src/components/print/Resume.astro';
import { renderAstro } from './helpers';
import { escHtml, modelOf, positions } from './print-helpers';

const model = modelOf('resume-en');

describe('Resume (en)', () => {
  it('one h1 with the name; tagline; section order; no img', async () => {
    const html = await renderAstro(Resume, { props: { model } });
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html).toMatch(/<h1[^>]*>Seongeun Baek<\/h1>/);
    expect(html).toContain(escHtml(model.tagline));
    expect(html).toMatch(/class="print print--compact"/);
    const order = positions(html, ['Education', 'Publications and talks', 'Projects', 'Awards', 'Certifications', 'Languages', 'Training', 'Skills']);
    expect(order.every((i) => i >= 0), JSON.stringify(order)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).not.toMatch(/<h2[^>]*>Activities<\/h2>/); // no activity is flagged for the English résumé
    expect(html).toContain('(expected)');
    expect(html).not.toContain('CDS Big Data Training');
    expect(html).not.toContain('CCAIM Machine Learning for Healthcare Summer School 2026');
    expect(html).not.toMatch(/<img[\s>]/);
  });

  it('final review fix 1 item 11: the CoG link says "paper page" (D-15: abstract only), project pages say "case study"', async () => {
    const html = await renderAstro(Resume, { props: { model } });
    expect(html).toMatch(/<a[^>]*href="https:\/\/lunecid\.github\.io\/en\/game\/research\/cog-2026-engagement\/"[^>]*>↗ paper page<\/a>/);
    expect(html).not.toMatch(/href="[^"]*\/research\/cog-2026-engagement\/"[^>]*>↗ case study</);
    expect(html).toMatch(/<a[^>]*href="https:\/\/lunecid\.github\.io\/en\/game\/projects\/kickick-park\/"[^>]*>↗ case study<\/a>/);
  });
});
