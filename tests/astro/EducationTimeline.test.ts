import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import EducationTimeline from '../../src/components/records/EducationTimeline.astro';
import { resumeSchema } from '../../src/content/schemas';
import { parseYamlDocument } from '../../src/content/yaml-loader';
import type { Lang } from '../../src/i18n/ui';
import { renderAstro } from './helpers';

const resume = resumeSchema.parse(parseYamlDocument(readFileSync(resolve(process.cwd(), 'src/data/resume.yaml'), 'utf8'), 'resume'));
const render = (lang: Lang) => renderAstro(EducationTimeline, { props: { variant: 'game', lang, items: resume.education } });

describe('EducationTimeline.astro', () => {
  it('GPA and expected graduation; period keeps tabular-nums after the font shorthand', async () => {
    const ko = await render('ko');
    expect(ko).toMatch(/<section(?=[^>]*\bid="education")[^>]*>/);
    expect(ko).toContain('QUEST LOG');
    expect(ko).toMatch(/<h2[^>]*>학력<\/h2>/);
    expect(ko).toContain('4.1/4.5');
    expect(ko).toContain('3.18/4.5');
    expect(ko).toContain('2025.03 – 2027.02 (졸업 예정)');
    expect(ko.match(/졸업 예정/g)).toHaveLength(1);
    expect(ko.match(/class="timeline__item"/g)).toHaveLength(resume.education.length);
    const src = readFileSync(resolve(process.cwd(), 'src/components/records/EducationTimeline.astro'), 'utf8').replace(/\s+/g, ' ');
    expect(src).toMatch(/\.timeline__period\s*\{[^}]*font-variant-numeric:\s*tabular-nums/);

    const en = await render('en');
    expect(en).toContain('Mar 2025 – Feb 2027 (expected)');
    expect(en).toContain('M.S. in Data Science');
    expect(en).toMatch(/GPA\s*<span[^>]*>4\.1\/4\.5<\/span>/);
  });

  it('shows the lab link and the thesis line only where they exist', async () => {
    const ko = await render('ko');
    expect(ko.match(/class="timeline__lab"/g)).toHaveLength(resume.education.filter((e) => e.lab).length);
    expect(ko.match(/class="timeline__thesis"/g)).toHaveLength(resume.education.filter((e) => e.thesis).length);
    expect(ko).toMatch(/<a[^>]*href="https:\/\/datalab\.pusan\.ac\.kr\/datalab\/index\.do"[^>]*>데이터사이언스연구실\(DataLab\) · 지도교수 권준호<\/a>/);
  });
});
