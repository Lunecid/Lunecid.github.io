import { describe, expect, it } from 'vitest';
import NotFound from '../../src/pages/404.astro';
import { renderAstro } from './helpers';

describe('404 (R-1, §7)', () => {
  it('neutral, noindex, both version homes and a language switch; no game module or trigger', async () => {
    const html = await renderAstro(NotFound, { url: '/404.html' });
    const root = html.match(/<html[^>]*>/)?.[0] ?? '';
    expect(root).toContain('data-variant="neutral"');
    expect(root).toContain('data-page="not-found"');
    expect(html).toContain('<meta name="robots" content="noindex"');
    expect(html).not.toContain('rel="canonical"');
    expect(html).not.toMatch(/<link rel="alternate"/);
    expect(html).toContain('<meta property="og:image" content="https://lunecid.github.io/og/home.png"');
    expect(html).toMatch(/<title>페이지를 찾을 수 없습니다 · 백성은<\/title>/);
    expect(html).toMatch(/<h1[^>]*data-nf-title[^>]*>페이지를 찾을 수 없습니다\.<\/h1>/);
    expect(html).toMatch(/<a href="\/game\/" data-nf-home="game"[^>]*>게임 버전 홈<\/a>/);
    expect(html).toMatch(/<a href="\/data\/" data-nf-home="data"[^>]*>일반 버전 홈<\/a>/);
    expect(html).toMatch(/<a href="\/en\/" hreflang="en" lang="en" data-nt-lang/);
    for (const absent of ['hud-nav', 'class="crt"', 'astro-island', 'visit-404', 'GAME OVER', 'CONTINUE?', 'emitTrigger']) expect(html, absent).not.toContain(absent);
  });
});
