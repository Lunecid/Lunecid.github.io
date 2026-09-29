import { describe, expect, it } from 'vitest';
import HudNav from '../../src/components/hud/HudNav.astro';
import { readSource, renderAstro } from './helpers';

const KO = {
  lang: 'ko',
  variant: 'game',
  altLangHref: '/en/research/',
  cvHref: '/cv/seongeun-baek-resume-ko.pdf',
  cvLabel: '이력서 (PDF)',
  bgmAvailable: false,
} as const;

function firstTag(html: string, pattern: RegExp): string {
  const match = html.match(pattern);
  if (!match) throw new Error(`no tag matches ${pattern}`);
  return match[0];
}

function sectionHrefs(html: string): string[] {
  return [...html.matchAll(/<a href="([^"]+)"[^>]*>\s*<span class="hud-nav__num"/g)].map((m) => m[1] ?? '');
}

describe('HudNav.astro', () => {
  it('renders 4 localized section links in a labelled nav', async () => {
    const ko = await renderAstro(HudNav, { props: KO });
    expect(firstTag(ko, /<nav[^>]*id="hud-menu"[^>]*>/)).toContain('aria-label="주 메뉴"');
    expect(sectionHrefs(ko)).toEqual(['/research/', '/projects/', '/records/', '/player-log/']);
    for (const label of ['연구', '프로젝트', '기록', '플레이 로그']) expect(ko).toContain(label);

    const en = await renderAstro(HudNav, {
      props: { ...KO, lang: 'en', altLangHref: '/research/', cvHref: '/cv/seongeun-baek-resume-en.pdf' },
      url: '/en/research/',
    });
    expect(firstTag(en, /<nav[^>]*id="hud-menu"[^>]*>/)).toContain('aria-label="Main navigation"');
    expect(sectionHrefs(en)).toEqual(['/en/research/', '/en/projects/', '/en/records/', '/en/player-log/']);
    for (const label of ['Research', 'Projects', 'Records', 'Player Log']) expect(en).toContain(label);
    expect(firstTag(en, /<a [^>]*class="hud-nav__brand"[^>]*>/)).toContain('href="/en/"');
  });

  it("aria-current is 'page' on the section index and 'true' inside it", async () => {
    const index = await renderAstro(HudNav, { props: { ...KO, current: 'projects', exact: true } });
    expect(firstTag(index, /<a href="\/projects\/"[^>]*>/)).toContain('aria-current="page"');
    expect(firstTag(index, /<a href="\/research\/"[^>]*>/)).not.toContain('aria-current');

    const inner = await renderAstro(HudNav, { props: { ...KO, current: 'projects' } });
    expect(firstTag(inner, /<a href="\/projects\/"[^>]*>/)).toContain('aria-current="true"');

    const none = await renderAstro(HudNav, { props: KO });
    expect(none).not.toContain('aria-current');
  });

  it('language link has hreflang and the given altLangHref, hidden when null', async () => {
    const html = await renderAstro(HudNav, { props: KO });
    const links = html.match(/<a [^>]*hreflang="en"[^>]*>/g) ?? [];
    expect(links.length).toBeGreaterThanOrEqual(1);
    for (const tag of links) {
      expect(tag).toContain('href="/en/research/"');
      expect(tag).toContain('lang="en"');
    }
    const hidden = await renderAstro(HudNav, { props: { ...KO, altLangHref: null } });
    expect(hidden).not.toContain('hreflang');
    expect(hidden).not.toContain('hud-nav__lang');
  });

  it('CV link points to cvHref; tooltip and accessible name say which document (D-7), the ↓ stays', async () => {
    const html = await renderAstro(HudNav, { props: KO });
    const link = firstTag(html, /<a [^>]*class="hud-nav__cv"[^>]*>/);
    expect(link).toContain('href="/cv/seongeun-baek-resume-ko.pdf"');
    expect(link).toContain('title="이력서 (PDF)"');
    expect(html).toMatch(/class="hud-nav__cv"[\s\S]*?<span aria-hidden="true"[^>]*>↓<\/span>[\s\S]*?<span class="sr-only"[^>]*> — 이력서 \(PDF\)<\/span>/);
    const academic = await renderAstro(HudNav, { props: { ...KO, cvHref: '/cv/seongeun-baek-cv-academic.pdf', cvLabel: 'Academic CV (PDF)' } });
    expect(firstTag(academic, /<a [^>]*class="hud-nav__cv"[^>]*>/)).toContain('title="Academic CV (PDF)"');
  });

  it('menu button controls #hud-menu with aria-expanded=false', async () => {
    const html = await renderAstro(HudNav, { props: KO });
    const button = firstTag(html, /<button[^>]*data-nav-toggle[^>]*>/);
    expect(button).toContain('type="button"');
    expect(button).toContain('aria-expanded="false"');
    expect(button).toContain('aria-controls="hud-menu"');
    expect(html).toMatch(/<button[^>]*data-nav-toggle[^>]*>\s*메뉴\s*<\/button>/);
    expect(html).toMatch(/<nav[^>]*id="hud-menu"/);
  });

  it('BGM button (server markup + script, P1-9b) rendered only when bgmAvailable', async () => {
    const withBgm = await renderAstro(HudNav, { props: { ...KO, bgmAvailable: true } });
    expect(withBgm).not.toContain('<astro-island'); // P-03: no React island for the BGM button
    expect(withBgm.match(/data-bgm-toggle/g)).toHaveLength(1);
    expect(firstTag(withBgm, /<button[^>]*class="bgm"[^>]*>/)).toContain('aria-pressed="false"');
    expect(firstTag(withBgm, /<button[^>]*class="bgm"[^>]*>/)).toContain('data-src="/audio/bgm/');

    const without = await renderAstro(HudNav, { props: KO });
    expect(without).not.toContain('<astro-island');
    expect(without).not.toContain('class="bgm"');
    expect(without).not.toContain('data-bgm-toggle');
  });

  it('mobile panel is hidden only under html.js', async () => {
    const source = readSource('src/components/hud/HudNav.astro');
    expect(source).toMatch(/:global\(html\.js\)[^{]*hud-nav__panel[^{]*\{[^}]*display:\s*none/);
    // never hidden unconditionally: without JS the menu stays reachable (Review Focus 5)
    expect(source).not.toMatch(/(^|\n)\s*\.hud-nav__panel\s*\{[^}]*display:\s*none/);
    const html = await renderAstro(HudNav, { props: KO });
    expect(html).not.toMatch(/<style[^>]*>[^<]*hud-nav__panel/);
  });

  it('§1.8: items come from the version nav — no Player Log on the data version', async () => {
    const data = await renderAstro(HudNav, { props: { ...KO, variant: 'data' } });
    expect(sectionHrefs(data)).toEqual(['/research/', '/projects/', '/records/']);
    expect(data).not.toContain('플레이 로그');
    expect(data.match(/class="hud-nav__num"[^>]*>0[1-3]</g)).toHaveLength(3);
  });
});
