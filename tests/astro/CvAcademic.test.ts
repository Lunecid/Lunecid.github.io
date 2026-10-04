import { describe, expect, it } from 'vitest';
import CvAcademic from '../../src/components/print/CvAcademic.astro';
import { ACADEMIC_EXTRAS } from '../../src/lib/resume-model';
import { renderAstro } from './helpers';
import { escHtml, modelOf, positions } from './print-helpers';

const model = modelOf('cv-academic');

describe('CvAcademic', () => {
  it('one h1 with the name; tagline; section order; no img', async () => {
    const html = await renderAstro(CvAcademic, { props: { model } });
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html).toMatch(/<h1[^>]*>Seongeun Baek<\/h1>/);
    expect(html).toContain(escHtml(model.tagline));
    const headings = [
      'Research interests', 'Education', 'Publications',
      ...(model.presentations.length > 0 ? ['Presentations'] : []),
      'Work in progress', 'Projects', 'Awards', 'Languages', 'Training', 'Skills',
    ];
    const order = positions(html, headings);
    expect(order.every((i) => i >= 0), JSON.stringify(order)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    if (ACADEMIC_EXTRAS.abstract) expect(html).toContain('We study how much pre-engagement signal');
    expect(html).toContain('DataLab');
    expect(html).toContain('CDS Big Data Training');
    expect(html).toContain('Pusan National University');
    expect(html).toContain('CCAIM Machine Learning for Healthcare Summer School 2026');
    expect(html).toMatch(/print__meta">Pusan National University<\/p>/);
    expect(html).not.toMatch(/Pusan National University · /);
    expect(html).not.toMatch(/print__meta">Cambridge Centre for AI in Medicine \(CCAIM\), University of Cambridge \(online\) · /);
    expect(html).not.toMatch(/<img[\s>]/);
  });

  it('owner 2026-09-28: the removed course project is not in the Academic CV', async () => {
    const html = await renderAstro(CvAcademic, { props: { model } });
    expect(html).not.toMatch(/counseling-nlp|↗ project summary/);
  });
});
