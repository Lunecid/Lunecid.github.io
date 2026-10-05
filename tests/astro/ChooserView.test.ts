import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import ChooserView from '../../src/views/ChooserView.astro';
import { COVER_DISPLAY_FAMILY, COVER_MONO_FAMILY, DISPLAY_FAMILY, MONO_FAMILY, SERIF_KO_HEAD_FAMILY } from '../../src/lib/fonts';
import { coverCopy } from '../../src/data/copy/chooser-covers';
import { readSource } from './helpers';
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

describe('ChooserView.astro (MO-23: the v6.4 desk; P2-10 header)', () => {
  it('MO-23: no visible name or line — a visually hidden h1 holds the name; the caption stays; desk with data file first then game file, each with exactly one link', async () => {
    const html = await renderAstro(ChooserView, { props: { lang: 'ko' }, url: '/' });
    expect(html).toMatch(/<h1 id="chooser-name" class="sr-only"[^>]*>백성은<\/h1>/);
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    const main = html.match(/<main\b[\s\S]*<\/main>/)?.[0] ?? '';
    expect(main).not.toContain('데이터로 사람의 행동을 읽는 분석가입니다'); // the page's meta description keeps the line
    expect(main).not.toContain('보고 싶은 포트폴리오를 고르세요');
    expect(html).not.toMatch(/chooser__line/);
    expect(html).toMatch(/<p class="chooser__cap" lang="en"[^>]*><span class="chooser__mark" aria-hidden="true"[^>]*>\[<i class="chooser__sq"[^>]*><\/i>\]<\/span><span[^>]*>PORTFOLIO ARCHIVE<\/span><span[^>]*>FILES · 02<\/span><\/p>/);
    const desk = html.match(/<div class="desk"[^>]*data-chooser[^>]*data-desk[\s\S]*<\/article>\s*<\/div>/)?.[0] ?? '';
    expect(desk).not.toBe('');
    const files = [...desk.matchAll(/<article class="file file--(data|game)"/g)].map((m) => m[1]);
    expect(files).toEqual(['data', 'game']);
    const links = [...desk.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*data-choose-variant="(game|data)"/g)].map((m) => [m[2], m[1]]);
    expect(links).toEqual([['data', '/data/'], ['game', '/game/']]);
    for (const part of desk.split(/<article\b/).slice(1)) expect(part.match(/<a\b/g)).toHaveLength(1);
  });

  it('MO-23: declares the cover mono and display faces (subsets) with swap, preloads neither; no heading serif under the default; the styles are one external sheet', async () => {
    const html = await renderAstro(ChooserView, { props: { lang: 'ko' }, url: '/' });
    expect(html).toMatch(new RegExp(`font-family:"${COVER_MONO_FAMILY}";[^}]*font-weight:600;font-display:swap`));
    expect(html).toMatch(new RegExp(`font-family:"${COVER_DISPLAY_FAMILY}";[^}]*font-display:swap`));
    expect(html).not.toContain(`font-family:"${MONO_FAMILY}"`);
    expect(html).not.toMatch(/--font-anton/);
    expect(html).toMatch(/<link rel="stylesheet" href/); // vitest resolves the ?url import to an empty href; the build hashes it
    expect(readSource('src/views/ChooserView.astro')).toContain("from '../styles/chooser.css?url'");
    expect(html).not.toMatch(/<style[^>]*>[^<]*(\.file--data|--tex-rh|\.desk)/);
    expect(html).not.toContain(SERIF_KO_HEAD_FAMILY);
    // MO-29: the printout's banner takes the general version's display face, declared with swap and never preloaded
    expect(html).toMatch(new RegExp(`font-family:"${DISPLAY_FAMILY}";[^}]*font-display:swap`));
    expect(html).not.toContain('data-serif');
    const preloads = [...html.matchAll(/<link rel="preload"[^>]*href="([^"]+)"/g)].map((m) => m[1]);
    expect(preloads.length).toBeGreaterThan(0);
    for (const href of preloads) expect(href).toMatch(/sb-sans/);
  });

  it('MO-23: no img/picture; every framing string comes from coverCopy', async () => {
    const html = await renderAstro(ChooserView, { props: { lang: 'ko' }, url: '/' });
    expect(html).not.toMatch(/<img\b|<picture\b/);
    for (const value of [coverCopy.ko.game.file, coverCopy.ko.data.file, coverCopy.ko.game.rail.serial, coverCopy.ko.data.stamp, coverCopy.ko.game.stamp]) expect(html).toContain(value);
    // no component or the view spells a framing string itself
    const sources = ['src/views/ChooserView.astro', 'src/components/neutral/GameCover.astro', 'src/components/neutral/PrintoutCover.astro'].map((f) => readSource(f)).join('\n');
    for (const literal of ['PORTFOLIO ARCHIVE', 'GAME_ANALYST', 'DATA_ANALYST', 'PDL-26', '검토 완료', '기밀 해제', 'ANALYST', 'FILES']) expect(sources, literal).not.toContain(literal);
    expect(html).not.toMatch(/evidence|chooser__chart|최우수상|AUC/);
  });

  it('MO-23: en links to /en/…', async () => {
    const html = await renderAstro(ChooserView, { props: { lang: 'en' }, url: '/en/' });
    expect(html).toMatch(/href="\/en\/game\/"[^>]*data-choose-variant="game"/);
    expect(html).toMatch(/href="\/en\/data\/"[^>]*data-choose-variant="data"/);
    expect(html).toMatch(/<h1 id="chooser-name" class="sr-only"[^>]*>Seongeun Baek<\/h1>/);
    const desk = html.match(/<div class="desk"[\s\S]*<\/main>/)?.[0] ?? '';
    expect(desk).toContain('View general version');
    expect(desk).not.toMatch(/[\uAC00-\uD7A3]/);
  });

  it('the header language switch keeps ?choose (spec §5.5); the hreflang links stay canonical', async () => {
    const ko = await renderAstro(ChooserView, { props: { lang: 'ko' }, url: '/' });
    expect(ko).toMatch(/<a href="\/en\/\?choose" hreflang="en" lang="en" data-nt-lang/);
    expect([...ko.matchAll(/<link rel="alternate" hreflang="[^"]+" href="([^"]+)"/g)].map((m) => m[1]).some((href) => href.includes('?'))).toBe(false);
    const en = await renderAstro(ChooserView, { props: { lang: 'en' }, url: '/en/' });
    expect(en).toMatch(/<a href="\/\?choose" hreflang="ko" lang="ko" data-nt-lang/);
  });

  it('the header shows the language switch only (brand false, lang-only); no file carries a description any more (no evidence line, MO-23)', async () => {
    const ko = await renderAstro(ChooserView, { props: { lang: 'ko' }, url: '/' });
    expect(ko).not.toContain('data-nt-brand');
    expect(ko).toContain('nt-header__bar--lang-only');
    expect(ko).not.toMatch(/aria-describedby/);
  });
});
