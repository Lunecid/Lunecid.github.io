import { describe, expect, it } from 'vitest';
import BaseLayout from '../../src/layouts/BaseLayout.astro';
import DataLayout from '../../src/layouts/DataLayout.astro';
import { DISPLAY_FAMILY, FONT_URL, MONO_FAMILY, SANS_FAMILY } from '../../src/lib/fonts';
import { HEAD_INIT_SCRIPT } from '../../src/lib/head-init';
import { VIEWER_QUEUE_SCRIPT } from '../../src/lib/viewer-queue';
import { renderAstro, type AstroComponent } from './helpers';

const props = { lang: 'ko', variant: 'data', title: '기록·이력서 · 백성은', description: '설명', page: 'records', section: 'records', sectionIndex: true } as const;
const render = (component: AstroComponent): Promise<string> =>
  renderAstro(component, { props, slots: { default: '<p id="probe">본문</p>' }, url: '/data/records/' });
const headOf = (html: string): string => html.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? '';
/** meta, link and title tags of a head, fonts and scripts left out, in order. */
const metaTags = (head: string): string[] =>
  head
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<link rel="preload"[^>]*>/g, '')
    .replace(/<link rel="stylesheet"[^>]*>/g, '') // DataLayout's own data sheet (tested below)
    .match(/<title>[^<]*<\/title>|<(?:meta|link)\b[^>]*>/g) ?? [];

describe('DataLayout.astro (P2-1)', () => {
  it('marks the page as the general version and carries no game module', async () => {
    const html = await render(DataLayout);
    const open = html.match(/<html[^>]*>/)?.[0] ?? '';
    for (const attr of ['lang="ko"', 'data-variant="data"', 'data-page="records"', 'data-section="records"', 'data-motion="full"']) expect(open).toContain(attr);
    expect(open).not.toContain('data-sfx');
    // P1-9b (P-03) ports AchievementHost and BgmToggle to .astro; data-achievement-host is the binding root marker (contract §1.8).
    expect(html).not.toMatch(/class="crt"|data-achievement-host|class="ach-toast|class="bgm"|data-ghost-art/);
    expect(html).toMatch(/<a class="skip-link" href="#main">/);
    expect(html).toMatch(/<main id="main" tabindex="-1"><p id="probe">본문<\/p><\/main>/);
    expect(html).toMatch(/<footer class="data-footer"/);
  });

  it('runs the init script first, right after <meta charset>', async () => {
    const head = headOf(await render(DataLayout));
    expect(head.trimStart().startsWith('<meta charset="utf-8">')).toBe(true);
    const scripts = [...head.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    expect(scripts[0]).toBe(HEAD_INIT_SCRIPT);
    expect(scripts[1]).toBe(VIEWER_QUEUE_SCRIPT);
  });

  it('DS-1: declares sans and display, preloads both, declares no serif heading face', async () => {
    const head = headOf(await render(DataLayout));
    expect(head).toContain(`font-family:"${SANS_FAMILY}"`);
    expect(head).toContain(`@font-face{font-family:"${DISPLAY_FAMILY}";font-style:normal;font-weight:700 900;font-stretch:112%;font-display:swap;src:url(${FONT_URL.display}) format("woff2")}`);
    expect(head).not.toContain('SB Serif KR Head');
    expect(head).not.toContain('sb-serif-kr-head');
    expect(head).not.toContain(MONO_FAMILY);
    expect([...head.matchAll(/<link rel="preload" href="([^"]+)" as="font" type="font\/woff2" crossorigin>/g)].map((m) => m[1])).toEqual([FONT_URL.sans, FONT_URL.display]);
  });

  it('has the same meta, title, canonical, hreflang, Open Graph and icon tags as BaseLayout for the same page', async () => {
    const [data, base] = await Promise.all([render(DataLayout), render(BaseLayout)]);
    expect(metaTags(headOf(data))).toEqual(metaTags(headOf(base)));
  });

  it('links its one shared data stylesheet in <head>; BaseLayout links none', async () => {
    const [data, base] = await Promise.all([render(DataLayout), render(BaseLayout)]);
    expect(headOf(data).match(/<link rel="stylesheet"[^>]*>/g)).toHaveLength(1);
    expect(headOf(base)).not.toMatch(/<link rel="stylesheet"/);
  });
});
