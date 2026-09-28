import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import HelloProfile from '../../src/components/home/HelloProfile.astro';
import { renderAstro } from './helpers';

const resume = load(readFileSync(new URL('../../src/data/resume.yaml', import.meta.url), 'utf8')) as {
  skills: { primary: { name: string }[]; familiar: { name: string }[] };
};
const primary = resume.skills.primary.map((skill) => skill.name);

const base = {
  lang: 'ko' as const,
  about: '부산대학교 데이터사이언스전문대학원 석사과정에서 게임 데이터를 연구하고 있습니다.',
  location: '부산 · Busan, South Korea',
  education: ['부산대학교 데이터사이언스전문대학원 데이터사이언스학과 석사과정 · 2025.03 – 2027.02 (졸업 예정)'],
  skills: primary,
  records: ['IEEE CoG 2026 구두 발표', '최우수상 2회 · 장려상 1회', 'ADsP · CDS 빅데이터 2급'],
  contact: {
    email: 'todtjddms104204@pusan.ac.kr',
    github: 'https://github.com/Lunecid',
    cvHref: '/cv/seongeun-baek-resume-ko.pdf',
    cvDocLabel: '이력서 (PDF)',
  },
};

describe('HelloProfile.astro', () => {
  it('section id defaults to hello and accepts profile', async () => {
    const hello = await renderAstro(HelloProfile, { props: base });
    expect(hello).toMatch(/<section[^>]*id="hello"[^>]*class="hello read"[^>]*aria-labelledby="hello-title"/);
    const profile = await renderAstro(HelloProfile, { props: { ...base, id: 'profile' } });
    expect(profile).toMatch(/<section[^>]*id="profile"[^>]*aria-labelledby="profile-title"/);
    expect(profile).not.toMatch(/id="hello"/);
  });

  it("h2 '안녕하세요!' / 'Hello!'", async () => {
    const ko = await renderAstro(HelloProfile, { props: base });
    expect(ko).toMatch(/<h2[^>]*id="hello-title"[^>]*>안녕하세요!<\/h2>/);
    const en = await renderAstro(HelloProfile, { props: { ...base, lang: 'en' } });
    expect(en).toMatch(/<h2[^>]*id="hello-title"[^>]*>Hello!<\/h2>/);
    const h3 = await renderAstro(HelloProfile, { props: { ...base, headingLevel: 3 } });
    expect(h3).toMatch(/<h3[^>]*id="hello-title"[^>]*>안녕하세요!<\/h3>/);
    expect(h3).toMatch(/<h4[^>]*class="hello__h"/);
  });

  it('photo alt and school e-mail link', async () => {
    const ko = await renderAstro(HelloProfile, { props: base });
    expect(ko).toMatch(/<img[^>]*alt="백성은 증명사진"/);
    expect(ko).toMatch(/<a[^>]*href="mailto:todtjddms104204@pusan.ac.kr"[^>]*>todtjddms104204@pusan.ac.kr<\/a>/);
    expect(ko).toMatch(/<a[^>]*href="https:\/\/github.com\/Lunecid"/);
    expect(ko).toMatch(/<a[^>]*href="\/cv\/seongeun-baek-resume-ko.pdf"/);
    expect(ko).toContain('부산 · Busan, South Korea');
    const en = await renderAstro(HelloProfile, { props: { ...base, lang: 'en' } });
    expect(en).toMatch(/<img[^>]*alt="ID photo of Seongeun Baek"/);
  });

  it('D-7: the CV link names its document (title + sr-only) and downloads', async () => {
    const html = await renderAstro(HelloProfile, { props: base });
    expect(html).toMatch(
      /<a(?=[^>]*href="\/cv\/seongeun-baek-resume-ko\.pdf")(?=[^>]*title="이력서 \(PDF\)")(?=[^>]*download)[^>]*>CV \(PDF\) <span(?=[^>]*aria-hidden="true")[^>]*>↓<\/span><span class="sr-only"[^>]*> — 이력서 \(PDF\)<\/span><\/a>/,
    );
  });

  it('skills are the primary list (no SQL)', async () => {
    expect(primary).toEqual(['Python', 'pandas', 'LightGBM · XGBoost', 'PyTorch', 'QGIS', 'Tableau']);
    const html = await renderAstro(HelloProfile, { props: base });
    const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // skill names may contain regex characters (e.g. "C++")
    for (const skill of primary) expect(html).toMatch(new RegExp(`<li[^>]*lang="en"[^>]*>${esc(skill)}</li>`));
    for (const skill of resume.skills.familiar.map((s) => s.name)) expect(html).not.toMatch(new RegExp(`>${esc(skill)}</li>`));
    expect(html).not.toMatch(/>SQL<\/li>/);
    for (const record of base.records) expect(html).toContain(record);
  });

  it('renders tagline and status only when given', async () => {
    const without = await renderAstro(HelloProfile, { props: base });
    expect(without).not.toContain('hello__tagline');
    expect(without).not.toContain('hello__status');
    const withBoth = await renderAstro(HelloProfile, {
      props: {
        ...base,
        tagline: '플레이어를 예측하는 데서 멈추지 않고, 이해하는 데이터를 만듭니다.',
        status: '2027년 2월 석사 졸업 예정 · 게임 데이터 분석가 채용과 박사과정 진학을 함께 준비하고 있습니다.',
      },
    });
    expect(withBoth).toMatch(/<p[^>]*class="hello__tagline"[^>]*>플레이어를 예측하는 데서 멈추지 않고, 이해하는 데이터를 만듭니다\.<\/p>/);
    expect(withBoth).toMatch(/<p[^>]*class="hello__status"[^>]*>2027년 2월 석사 졸업 예정/);
  });

  it('renders Scholar/ORCID links only when set', async () => {
    const none = await renderAstro(HelloProfile, { props: { ...base, ids: { scholar: null, orcid: null } } });
    expect(none).not.toContain('Google Scholar');
    expect(none).not.toContain('ORCID');
    const scholarOnly = await renderAstro(HelloProfile, {
      props: { ...base, ids: { scholar: 'https://scholar.google.com/citations?user=abc', orcid: null } },
    });
    expect(scholarOnly).toMatch(/<a[^>]*href="https:\/\/scholar.google.com\/citations\?user=abc"[^>]*>Google Scholar<\/a>/);
    expect(scholarOnly).not.toContain('ORCID');
    const both = await renderAstro(HelloProfile, {
      props: { ...base, ids: { scholar: null, orcid: 'https://orcid.org/0000-0000-0000-0000' } },
    });
    expect(both).toMatch(/<a[^>]*href="https:\/\/orcid.org\/0000-0000-0000-0000"[^>]*>ORCID<\/a>/);
  });

  it('P2-39: the photo is lazy by default and the LCP image (eager, fetchpriority high) with priority; WebP fallback', async () => {
    const lazy = await renderAstro(HelloProfile, { props: { ...base } });
    expect(lazy).toMatch(/<img[^>]*loading="lazy"/);
    expect(lazy).not.toMatch(/fetchpriority/);
    expect(lazy).toMatch(/<img[^>]*src="[^"]*(?:\.webp|f=webp)"/);
    expect(lazy).not.toMatch(/f=png|\.png\b/);
    const lcp = await renderAstro(HelloProfile, { props: { ...base, priority: true } });
    expect(lcp).toMatch(/<img[^>]*loading="eager"/);
    expect(lcp).toMatch(/<img[^>]*fetchpriority="high"/);
  });
});
