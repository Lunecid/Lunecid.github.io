import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/public-assets', () => ({
  publicFileExists: vi.fn(() => false),
  soundAvailability: vi.fn(() => ({ bgm: false, sfx: false })),
  goatcounterSelfHosted: vi.fn(() => false),
}));
vi.mock('../../src/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/config')>();
  return { ...actual, GOATCOUNTER: { ...actual.GOATCOUNTER, code: 'testsite' } };
});

import BaseLayout from '../../src/layouts/BaseLayout.astro';
import { HEAD_INIT_SCRIPT } from '../../src/lib/head-init';
import { soundAvailability } from '../../src/lib/public-assets';
import { personJsonLd } from '../../src/lib/seo';
import { renderAstro } from './helpers';

function firstTag(html: string, pattern: RegExp): string {
  const match = html.match(pattern);
  if (!match) throw new Error(`no tag matches ${pattern}`);
  return match[0];
}

function render(props: Record<string, unknown> = {}, url = '/projects/'): Promise<string> {
  return renderAstro(BaseLayout, {
    props: {
      lang: 'ko',
      variant: 'game',
      title: '프로젝트 · 백성은',
      description: '데이터 분석 프로젝트 사례 연구.',
      page: 'projects',
      section: 'projects',
      sectionIndex: true,
      ...props,
    },
    slots: { default: '<p class="probe">본문</p>' },
    url,
  });
}

beforeEach(() => {
  vi.mocked(soundAvailability).mockReturnValue({ bgm: false, sfx: false });
});

describe('BaseLayout.astro', () => {
  it('html has lang, data-page, data-section and data-motion=full', async () => {
    const html = await render();
    const root = firstTag(html, /<html[^>]*>/);
    expect(root).toContain('lang="ko"');
    expect(root).toContain('data-page="projects"');
    expect(root).toContain('data-section="projects"');
    expect(root).toContain('data-motion="full"');
    expect(html).toMatch(/<main id="main" tabindex="-1"[^>]*>\s*<p class="probe">본문<\/p>\s*<\/main>/);

    const home = await render({ lang: 'en', page: 'home', section: undefined }, '/en/');
    const homeRoot = firstTag(home, /<html[^>]*>/);
    expect(homeRoot).toContain('lang="en"');
    expect(homeRoot).not.toContain('data-section');
  });

  it('the init script is the first <script> in <head>, immediately after <meta charset>, before every stylesheet or preload link', async () => {
    const html = await render();
    const head = html.match(/<head[^>]*>([\s\S]*?)<\/head>/)?.[1] ?? '';
    expect(head).toMatch(/^\s*<meta charset="utf-8"\s*\/?>\s*<script>/);
    const firstScript = head.indexOf('<script');
    const firstScriptBody = head.slice(firstScript, head.indexOf('</script>', firstScript));
    expect(firstScriptBody).toContain('sb:motion');
    expect(firstScriptBody).toContain(HEAD_INIT_SCRIPT.trim().slice(0, 24));
    const links = [...head.matchAll(/<link[^>]*rel="(?:stylesheet|preload|modulepreload)"[^>]*>/g)];
    expect(links.length).toBeGreaterThan(0); // at least the JetBrains Mono preload
    for (const link of links) expect(link.index ?? -1).toBeGreaterThan(firstScript);
    expect(head).toMatch(/<link rel="preload"[^>]*as="font"[^>]*type="font\/woff2"/);
  });

  it('D-7: the nav CV button opens the Academic CV on research pages and the résumé in the page language elsewhere', async () => {
    const cvTag = (html: string) => firstTag(html, /<a [^>]*class="hud-nav__cv"[^>]*>/);
    const projects = await render();
    expect(cvTag(projects)).toContain('href="/cv/seongeun-baek-resume-ko.pdf"');
    expect(cvTag(projects)).toContain('title="이력서 (PDF)"');
    const enProjects = await render({ lang: 'en' }, '/en/projects/');
    expect(cvTag(enProjects)).toContain('href="/cv/seongeun-baek-resume-en.pdf"');
    expect(cvTag(enProjects)).toContain('title="Résumé (PDF)"');
    for (const [lang, url, page] of [
      ['ko', '/research/', 'research'],
      ['en', '/en/research/', 'research'],
      ['ko', '/research/cog-2026-engagement/', 'research-story'],
      ['en', '/en/research/cog-2026-engagement/', 'research-story'],
    ] as const) {
      const html = await render({ lang, page, section: 'research' }, url);
      expect(cvTag(html), url).toContain('href="/cv/seongeun-baek-cv-academic.pdf"');
      expect(cvTag(html), url).toContain('title="Academic CV (PDF)"');
    }
  });

  it('canonical, hreflang ko/en/x-default and og:image are absolute', async () => {
    const html = await render({ lang: 'en', title: 'Projects · Seongeun Baek' }, '/en/projects/');
    expect(html).toContain('<link rel="canonical" href="https://lunecid.github.io/en/projects/"');
    const alternates = [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)].map((m) => [m[1], m[2]]);
    expect(alternates).toEqual([
      ['ko', 'https://lunecid.github.io/projects/'],
      ['en', 'https://lunecid.github.io/en/projects/'],
      ['x-default', 'https://lunecid.github.io/projects/'],
    ]);
    expect(html).toContain('<meta property="og:image" content="https://lunecid.github.io/og/en/projects.png"');
    expect(html).toContain('<meta property="og:image:width" content="1200"');
    expect(html).toContain('<meta property="og:image:height" content="630"');
    expect(html).toContain('<meta property="og:locale" content="en_US"');
    expect(html).toContain('<meta property="og:url" content="https://lunecid.github.io/en/projects/"');
    expect(html).toMatch(/<title>Projects · Seongeun Baek<\/title>/);

    const custom = await render({ ogSlug: 'home' }, '/projects/');
    expect(custom).toContain('<meta property="og:image" content="https://lunecid.github.io/og/home.png"');
  });

  it('noindex meta only when requested', async () => {
    const plain = await render();
    expect(plain).not.toContain('name="robots"');
    const hidden = await render({ noindex: true, altLangHref: null, page: 'not-found', section: undefined, ogSlug: 'home' }, '/404/');
    expect(hidden).toContain('<meta name="robots" content="noindex"');
    expect(hidden).not.toContain('rel="canonical"');
  });

  it('no alternates when altLangHref is null', async () => {
    const html = await render({ altLangHref: null });
    expect(html).not.toContain('rel="alternate"');
    expect(html).not.toContain('hreflang');
    const withDefault = await render();
    expect(firstTag(withDefault, /<a [^>]*hreflang="en"[^>]*>/)).toContain('href="/en/projects/"');
  });

  it('JSON-LD only when the jsonLd prop is given', async () => {
    const home = await render({ page: 'home', section: undefined, jsonLd: personJsonLd('ko', { jobTitle: '게임 데이터 분석가 · 연구자', url: 'https://lunecid.github.io/' }) }, '/');
    const body = home.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1] ?? 'null';
    expect(JSON.parse(body)).toMatchObject({ '@type': 'Person', name: '백성은', alternateName: 'Seongeun Baek' });
    const plain = await render();
    expect(plain).not.toContain('application/ld+json');
  });

  it('data-sfx only when all four SFX exist', async () => {
    vi.mocked(soundAvailability).mockReturnValue({ bgm: true, sfx: true });
    expect(firstTag(await render(), /<html[^>]*>/)).toContain('data-sfx="on"');
    vi.mocked(soundAvailability).mockReturnValue({ bgm: true, sfx: false });
    expect(firstTag(await render(), /<html[^>]*>/)).not.toContain('data-sfx');
    vi.mocked(soundAvailability).mockReturnValue({ bgm: false, sfx: false });
    expect(firstTag(await render(), /<html[^>]*>/)).not.toContain('data-sfx');
  });

  it('CRT overlay only on the home page', async () => {
    const home = await render({ page: 'home', section: undefined }, '/');
    expect(home).toMatch(/<div[^>]*class="crt"/);
    const projects = await render();
    expect(projects).not.toMatch(/<div[^>]*class="crt"/);
  });

  it('skip link targets #main', async () => {
    const html = await render();
    expect(html).toMatch(/<a class="skip-link" href="#main"[^>]*>본문으로 건너뛰기<\/a>/);
    expect(html.indexOf('class="skip-link"')).toBeLessThan(html.indexOf('<header'));
    expect(html).toMatch(/<main id="main" tabindex="-1"/);
  });

  it('the achievement host (server markup + script, P1-9b) is present once, and no island hydrates', async () => {
    const html = await render();
    expect(html.match(/data-achievement-host/g)).toHaveLength(1); // no BGM button either: bgm unavailable
    expect(html).not.toContain('<astro-island');
    expect(html).toMatch(/class="ach-toast-region"/);
    expect(html).toMatch(/aria-live="polite"/);
    expect(html.indexOf('ach-toast-region')).toBeGreaterThan(html.indexOf('</footer>'));
  });

  it('no GoatCounter script outside production', async () => {
    expect(import.meta.env.PROD).toBe(false);
    const html = await render();
    expect(html).not.toContain('goatcounter');
    expect(html).not.toContain('count.v5.js');
  });

  it('passes notices to the footer', async () => {
    const html = await render({ notices: ['cognosphere'] });
    expect(html).toContain('© All rights reserved by COGNOSPHERE. Other properties belong to their respective owners.');
    const none = await render();
    expect(none).not.toContain('COGNOSPHERE');
  });

  it('§1.8: data-variant on <html>; a data page renders no CRT, no achievement host, no BGM and no data-sfx', async () => {
    vi.mocked(soundAvailability).mockReturnValue({ bgm: true, sfx: true });
    const game = await render({ page: 'home', section: undefined }, '/');
    expect(firstTag(game, /<html[^>]*>/)).toContain('data-variant="game"');
    expect(firstTag(game, /<html[^>]*>/)).toContain('data-sfx="on"');
    expect(game).toMatch(/<div[^>]*class="crt"/);
    expect(game.match(/data-achievement-host/g)).toHaveLength(1);
    expect(game.match(/data-bgm-toggle/g)).toHaveLength(1);
    const data = await render({ variant: 'data', page: 'home', section: undefined }, '/');
    const root = firstTag(data, /<html[^>]*>/);
    expect(root).toContain('data-variant="data"');
    expect(root).not.toContain('data-sfx');
    expect(data).not.toMatch(/<div[^>]*class="crt"/);
    expect(data).not.toContain('AchievementHost');
    expect(data).not.toContain('ach-toast-region');
    expect(data).not.toContain('data-achievement-host');
    expect(data).not.toContain('BgmToggle');
    expect(data).not.toContain('class="bgm"');
    expect(data).not.toContain('data-bgm-toggle');
    expect(data).toContain('<meta property="og:site_name" content="백성은 · 데이터 분석가"');
  });
});
