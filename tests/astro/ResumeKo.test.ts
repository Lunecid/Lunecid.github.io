import { describe, expect, it } from 'vitest';
import Resume from '../../src/components/print/Resume.astro';
import { renderAstro } from './helpers';
import { escHtml, modelOf, positions } from './print-helpers';

const model = modelOf('resume-ko');

describe('Resume (ko)', () => {
  it('one h1 with the name; tagline; section order; no img', async () => {
    const html = await renderAstro(Resume, { props: { model } });
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html).toMatch(/<h1[^>]*>백성은<\/h1>/);
    expect(html).toContain(escHtml(model.tagline));
    expect(html).toContain('todtjddms104204@pusan.ac.kr');
    const order = positions(html, ['학력', '논문·발표', '프로젝트', '수상', '대외활동', '자격', '어학', '교육', '기술']);
    expect(order.every((i) => i >= 0), JSON.stringify(order)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toContain('4.1/4.5');
    expect(html).toContain('(졸업 예정)');
    expect(html).toContain('CDS빅데이터 교육');
    expect(html).toContain('부산대학교');
    expect(html).toContain('CCAIM Machine Learning for Healthcare Summer School 2026');
    expect(html).toMatch(/print__meta">부산대학교<\/p>/);
    expect(html).not.toMatch(/부산대학교 · /);
    expect(html).not.toMatch(/print__meta">케임브리지대학교 CCAIM\(Cambridge Centre for AI in Medicine\) · 온라인 참가 · /);
    expect(html).not.toMatch(/<img[\s>]/);
  });
});
