// The game file on the chooser desk (MO-23, v6.4): an electronic window holding a printed cyber cover. One article, one
// link (its CTA, named by the title and the CTA text) whose hit layer covers the file; the Korean h2 is the title; the
// Anton display words, the foot line and the rail are aria-hidden English decoration; the declassify stamp is in the
// markup from the start but invisible at rest (MO-25 inks it on the entering click).
import { describe, expect, it } from 'vitest';
import GameCover from '../../src/components/neutral/GameCover.astro';
import { coverCopy } from '../../src/data/copy/chooser-covers';
import { buildCover } from '../../src/lib/chooser-covers';
import { readSource, renderAstro } from './helpers';

const render = (lang: 'ko' | 'en') => renderAstro(GameCover, { props: { cover: buildCover('game', lang, '2026-10-05') } });
const css = readSource('src/styles/chooser.css');

describe('GameCover.astro (MO-23)', () => {
  it('one article, one link named by title + CTA, hit layer over the file', async () => {
    const html = await render('ko');
    expect(html.match(/<article\b/g)).toHaveLength(1);
    expect(html).toMatch(/<article class="file file--game"[^>]*aria-labelledby="file-game-title"/);
    const links = [...html.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatch(/class="cta cta--hud"/);
    expect(links[0]).toMatch(/href="\/game\/"/);
    expect(links[0]).toMatch(/data-choose-variant="game"/);
    expect(links[0]).toMatch(/aria-labelledby="file-game-title file-game-cta"/);
    expect(links[0]).not.toMatch(/aria-describedby/);
    expect(html).toMatch(/<span id="file-game-cta"[^>]*>게임 버전 보기<\/span>/);
    expect(html).toMatch(/<span class="cta__hit" aria-hidden="true"[^>]*><\/span><\/a>/);
    expect(css).toMatch(/\.cta__hit\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*0/);
    expect(html).not.toMatch(/<button|tabindex=|<input|<details/);
  });

  it('h2 is the title; display words, foot line and rail are aria-hidden English', async () => {
    const html = await render('ko');
    expect(html).toMatch(/<h2 class="title" id="file-game-title"[^>]*>게임 데이터 분석가<\/h2>/);
    const disp = /<p class="disp"[^>]*>/.exec(html)?.[0] ?? '';
    expect(disp).toMatch(/lang="en"/);
    expect(disp).toMatch(/aria-hidden="true"/);
    for (const word of coverCopy.ko.game.display) expect(html).toContain(`>${word}</span>`);
    expect(html).toMatch(/<span class="disp__blk"[^>]*>GAME<\/span>/);
    expect(html).toMatch(/<p class="cv__foot" lang="en" aria-hidden="true"[^>]*><span[^>]*>2026 · PORTFOLIO · lunecid\.github\.io<\/span>/);
    expect(html).toMatch(/<div class="cv__rail" lang="en" aria-hidden="true"[^>]*>[\s\S]*SN PDL-26\/01-G/);
    // the title bar and the series line are read (English labels marked as such)
    expect(html).toMatch(/<span class="bar__name neon" lang="en"[^>]*>GAME_ANALYST\.DOC<\/span>/);
    expect(html).toContain('[ MODE 01 ]');
  });

  it('contents line in nav order; tagline verbatim', async () => {
    const html = await render('ko');
    const toc = [...(/<ol class="toc"[\s\S]*?<\/ol>/.exec(html)?.[0] ?? '').matchAll(/<li[^>]*><span class="toc__n" aria-hidden="true"[^>]*>(\d\d)<\/span>([^<]+)<\/li>/g)].map((m) => [m[1], m[2]]);
    expect(toc).toEqual([['01', '연구'], ['02', '프로젝트'], ['03', '기록'], ['04', '플레이 로그']]);
    const intro = /<p class="intro"[^>]*>([\s\S]*?)<\/p>/.exec(html)?.[1] ?? '';
    expect(intro.replace(/<[^>]+>/g, '')).toBe('플레이어를 예측하는 데서 멈추지 않고, 이해하는 데이터를 만듭니다.');
    const en = await render('en');
    expect((/<p class="intro"[^>]*>([\s\S]*?)<\/p>/.exec(en)?.[1] ?? '').replace(/<[^>]+>/g, '')).toBe('Beyond predicting players: building data that explains them.');
    expect(en).toMatch(/href="\/en\/game\/"/);
  });

  it('stamp present, aria-hidden, invisible at rest', async () => {
    const html = await render('ko');
    expect(html).toMatch(/<span class="stamp" aria-hidden="true"[^>]*>기밀 해제<\/span>/);
    expect(css).toMatch(/\.stamp\s*\{[^}]*opacity:\s*0/);
    expect(await render('en')).toMatch(/<span class="stamp" aria-hidden="true"[^>]*>CLEARED<\/span>/);
  });

  it('emblem inline SVG, aria-hidden, focusable=false, no href/use/image', async () => {
    const html = await render('ko');
    const svg = /<svg\b[\s\S]*?<\/svg>/.exec(html)?.[0] ?? '';
    expect(svg).toMatch(/^<svg[^>]*class="emblem"/);
    expect(svg).toMatch(/aria-hidden="true"/);
    expect(svg).toMatch(/focusable="false"/);
    expect(svg).not.toMatch(/href=|<use\b|<image\b/);
  });

  it('no stat, evidence, chart or gold class', async () => {
    const html = await render('ko');
    expect(html).not.toMatch(/stat|evidence|chart|gold|AUC|최우수/i);
    expect(css).not.toMatch(/--gold/);
  });

  it('the frame is a separate device wrapper around the screen, styled in one isolated block (a bezel can be swapped in)', async () => {
    const html = await render('ko');
    expect(html).toMatch(/<article class="file file--game"[^>]*>\s*<div class="face device"[^>]*>\s*<div class="screen"[^>]*>\s*<div class="bar"/);
    const block = /\/\* ── the device frame[\s\S]*?end of the device frame ── \*\//.exec(css)?.[0] ?? '';
    expect(block).toMatch(/\.device\s*\{[^}]*border:\s*var\(--frame\) solid var\(--accent\)/);
    expect(block).toMatch(/\.br\s*\{/);
    const outside = css.replace(block, '').replace(/@media \((forced-colors|print)[^{]*\{[\s\S]*?\n  \}/g, '');
    expect(outside).not.toMatch(/border:\s*var\(--frame\)|\.br--tl|outline-offset:\s*5px/);
  });
});
