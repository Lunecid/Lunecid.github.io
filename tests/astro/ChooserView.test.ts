import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import ChooserView from '../../src/views/ChooserView.astro';
import { SERIF_KO_HEAD_FAMILY } from '../../src/lib/fonts';
import { renderAstro } from './helpers';

// vitest has no content collections: the view's two readers get the committed resume.yaml and fact source instead.
vi.mock('../../src/lib/portfolio', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/portfolio')>();
  const { resumeSchema } = await import('../../src/content/schemas');
  const { parseYamlDocument } = await import('../../src/content/yaml-loader');
  const { loadFactSource } = await import('../helpers/fact-source');
  const resume = resumeSchema.parse(parseYamlDocument(readFileSync('src/data/resume.yaml', 'utf8'), 'resume'));
  return {
    ...actual,
    getFactSource: async () => loadFactSource(),
    getPerson: async () => ({ name: resume.profile.name, researchIds: resume.researchIds }),
  };
});

describe('ChooserView.astro (P2-10)', () => {
  it('the name, the one line, two whole-side links (game first) with nothing interactive inside, no image', async () => {
    const html = await renderAstro(ChooserView, { props: { lang: 'ko' }, url: '/' });
    expect(html).toMatch(/<h1 id="chooser-name"[^>]*>백성은<\/h1>/);
    expect(html).toContain('데이터로 사람의 행동을 읽는 분석가입니다. 보고 싶은 포트폴리오를 고르세요.');
    const links = [...html.matchAll(/<a class="chooser__side chooser__side--(game|data)"[^>]*href="([^"]+)"[^>]*data-choose-variant="(game|data)"/g)].map((m) => [m[1], m[2], m[3]]);
    expect(links).toEqual([['game', '/game/', 'game'], ['data', '/data/', 'data']]);
    const sides = html.match(/<div class="chooser__split"[\s\S]*?<\/div>\s*<\/section>/)?.[0] ?? '';
    expect(sides.match(/<a\b/g)).toHaveLength(2);
    expect(sides).not.toMatch(/<button|tabindex=|<input|<details/);
    expect(html).not.toMatch(/<img\b|<picture\b/);
    expect(html).toContain('[ MODE 01 ]');
    expect(html).toMatch(/<span id="chooser-data-title" class="chooser__title chooser__title--serif" data-serif[^>]*>데이터 분석가<\/span>/);
  });

  it('declares the heading face (swap, no preload) and no serif preload; en links to /en/…', async () => {
    const html = await renderAstro(ChooserView, { props: { lang: 'en' }, url: '/en/' });
    expect(html).toContain(`font-family:"${SERIF_KO_HEAD_FAMILY}"`);
    expect(html).not.toMatch(/<link rel="preload"[^>]*serif/);
    expect(html).toMatch(/href="\/en\/game\/"[^>]*data-choose-variant="game"/);
    expect(html).toMatch(/href="\/en\/data\/"[^>]*data-choose-variant="data"/);
  });

  it('the header language switch keeps ?choose (spec §5.5); the hreflang links stay canonical', async () => {
    const ko = await renderAstro(ChooserView, { props: { lang: 'ko' }, url: '/' });
    expect(ko).toMatch(/<a href="\/en\/\?choose" hreflang="en" lang="en" data-nt-lang/);
    expect([...ko.matchAll(/<link rel="alternate" hreflang="[^"]+" href="([^"]+)"/g)].map((m) => m[1]).some((href) => href.includes('?'))).toBe(false);
    const en = await renderAstro(ChooserView, { props: { lang: 'en' }, url: '/en/' });
    expect(en).toMatch(/<a href="\/\?choose" hreflang="ko" lang="ko" data-nt-lang/);
  });

  it('the header shows the language switch only (brand false, lang-only), and each side is described by its evidence line', async () => {
    const ko = await renderAstro(ChooserView, { props: { lang: 'ko' }, url: '/' });
    expect(ko).not.toContain('data-nt-brand');
    expect(ko).toContain('nt-header__bar--lang-only');
    expect(ko).toMatch(/data-choose-variant="game"[^>]*aria-describedby="chooser-game-evidence"|aria-describedby="chooser-game-evidence"[^>]*data-choose-variant="game"/);
    expect(ko).toMatch(/<span id="chooser-data-evidence" class="chooser__evidence"[^>]*>최우수상 2회<\/span>/);
  });
});
