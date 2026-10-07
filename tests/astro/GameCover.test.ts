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

  // MO-34 (named rewrite of the MO-23 "device wrapper" test): the bezel is a tablet now
  it('MO-34: the cover sits in .dev__screen inside .dev__body; shell parts aria-hidden; one link; no logo/text in the shell', async () => {
    const html = await render('ko');
    expect(html).toMatch(/<article class="file file--game"[^>]*>\s*<div class="dev"[^>]*>\s*<div class="dev__body"[^>]*>\s*<i class="dev__cam" aria-hidden="true"[^>]*><\/i>\s*<div class="dev__screen"[^>]*>\s*<div class="face"[^>]*>\s*<div class="bar"/); // MO-38: the exit's screen-off layer may precede the window
    for (const part of ['dev__cam', 'dev__glass', 'dev__off', 'dev__pwr']) expect(html, part).toMatch(new RegExp(`<i class="${part}" aria-hidden="true"[^>]*></i>`));
    expect(html.match(/<a\b/g)).toHaveLength(1);
    // the shell carries no text and no mark: everything between the body and the screen, and after the window, is empty
    const shell = html.replace(/<div class="face"[\s\S]*<\/div>\s*(?=<i class="dev__glass")/, '');
    expect(shell.replace(/<[^>]+>/g, '').trim()).toBe('');
    expect(css).toMatch(/\.file--game \.dev__body\s*\{[^}]*pointer-events:\s*auto/);
    expect(css).toMatch(/\.file--game\s*\{[^}]*pointer-events:\s*none/);
  });

  it('MO-33: plate wraps the series line and display words; circuit and grid pseudo-items aria-hidden; no text added', async () => {
    const html = await render('ko');
    // the plate: two pseudo-items of the cover grid over its first two rows (the series line and the display words)
    expect(css).toMatch(/\.file--game \.cv::before, \.file--game \.cv::after\s*\{[^}]*grid-row:\s*1 \/ 3;[^}]*pointer-events:\s*none/);
    expect(css).toMatch(/\.file--game \.cv::before\s*\{[^}]*background:\s*var\(--accent\)/);
    // the circuit trace: an inline SVG in cyan, decoration only, drawn from a 540px cover
    const circuit = /<svg class="cv__circuit"[\s\S]*?<\/svg>/.exec(html)?.[0] ?? '';
    expect(circuit).toMatch(/aria-hidden="true"/);
    expect(circuit).toMatch(/focusable="false"/);
    expect(circuit).not.toMatch(/<text|href=|#[0-9a-f]{3,6}\b/i);
    expect(css).toMatch(/\.file--game \.cv__circuit\s*\{[^}]*display:\s*none/);
    // no words were added: the cover's text is the v6.4 text
    const text = (h: string) => h.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    expect(text(html)).toBe(text(html.replace(circuit, '')));
    expect(text(html)).not.toMatch(/circuit/i);
  });

  // named change: the exit's layers are built by chooser.ts after load (out of the first flight); the server HTML has
  // none of them, the sheets keep them out of the layout at rest
  it('MO-38: the exit layers are not in the server HTML; the traces are mask images in the exit sheet', async () => {
    const html = await render('ko');
    expect(html).not.toMatch(/class="xg|class="xnav/);
    expect(html).not.toMatch(/<path\b[^>]*d="M-?\d+ 50/);
    const exitCss = readSource('src/styles/chooser-exit.css');
    expect(exitCss).toMatch(/--xg-s12: url\("data:image\/svg\+xml,/);
    expect(css).toMatch(/\.file--game \.xg, \.file--game \.xg__off, \.xnav \{ display: none; \}/);
    expect(exitCss).toMatch(/\.desk\[data-exit="game"\] \.file--game \.xg, \.desk\[data-exit="game"\] \.file--game \.xg__off \{ display: block; \}/);
  });

  it('MO-41: the opening overlay: aria-hidden inside the cover window, its words from coverCopy.opening, shown only under data-intro=opening, never takes the pointer', async () => {
    for (const lang of ['ko', 'en'] as const) {
      const html = await render(lang);
      const ov = /<div class="ov" aria-hidden="true"[^>]*>[\s\S]*?<p class="ov__st"[^>]*>[^<]*<\/p><\/div>/.exec(html)?.[0] ?? '';
      expect(ov, lang).not.toBe('');
      expect(html.indexOf(ov)).toBeLessThan(html.indexOf('class="dev__glass"')); // inside .face, before the glass
      const op = coverCopy[lang].opening;
      for (const word of [op.terminal, op.node.num, op.request.replace('{count}', '2'), op.decrypt, op.pct.num, op.granted]) expect(ov, `${lang}: ${word}`).toContain(`>${word.replace(/>/g, '&gt;')}</`);
      expect(ov.match(/<i><\/i>/g), 'ten shutters').toHaveLength(10);
      expect(ov).not.toMatch(/<a\b|<button|tabindex|<h\d/);
    }
    expect(css).toMatch(/\n\.ov \{[^}]*display: none;[^}]*pointer-events: none;/);
    expect(css).toMatch(/\n:root\[data-intro="opening"\] \.ov, [^{]*\{ display: block; \}/);
    // overlay text is small (≤ --fs-small)
    const sizes = [...css.matchAll(/\.ov__\w+[^{]*\{[^}]*font: \d+ var\((--fs-[\w-]+)\)/g)].map((m) => m[1]);
    expect(sizes.length).toBeGreaterThanOrEqual(3);
    for (const size of sizes) expect(['--fs-min', '--fs-small', '--fs-caption', '--fs-label', '--fs-meta']).toContain(size);
  });

  it('MO-41: opening keyframes animate transform and opacity only, never infinitely; each opening animation fills both ways', () => {
    const plain = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const frames = [...plain.matchAll(/@keyframes (op-[\w-]+) \{([\s\S]*?\})\s*\}/g)];
    expect(frames.length).toBeGreaterThanOrEqual(13); // owner 2026-10-07: op-rise and op-cx gone, op-toss now op-drop
    for (const [, name, body] of frames) {
      const props = [...body!.matchAll(/([\w-]+):/g)].map((m) => m[1]);
      expect(props.filter((p) => p !== 'opacity' && p !== 'transform'), name).toEqual([]);
    }
    const opening = [...plain.matchAll(/\[data-intro="opening"\][^{}]*\{\s*animation:([^;]+);/g)].map((m) => m[1]!);
    expect(opening.length).toBeGreaterThanOrEqual(25);
    for (const a of opening) {
      expect(a, a).not.toMatch(/infinite/);
      expect(a.trim(), a).toMatch(/ both$/);
    }
  });

  it('MO-41: the device rises and powers on before the decrypt (screen off, then the bloom); the device starts at opacity .01 (an LCP candidate from the first paint)', () => {
    const plain = css.replace(/\/\*[\s\S]*?\*\//g, '');
    // owner 2026-10-07: the tablet stands still from the first frame; only its screen powers on
    expect(plain).not.toMatch(/\[data-intro="opening"\] \.file--game \.dev \{[^}]*animation/);
    expect(plain).not.toMatch(/@keyframes op-rise/);
    expect(plain).toMatch(/\.file--game \.dev__off \{ animation: op-out var\(--dur-op-off\) linear var\(--at-op-off\) both; \}/);
    expect(plain).toMatch(/\.file--game \.dev__pwr \{ animation: op-pwr var\(--dur-op-power\) var\(--ease-out\) var\(--at-op-power\) both; \}/);
    expect(plain).toMatch(/@keyframes op-pwr \{\s*0% \{ opacity: 0; transform: scale\(\.55, \.04\); \}\s*28% \{[^}]*\}\s*55% \{[^}]*\}\s*100% \{ opacity: 0; transform: scale\(1\.08, 1\.04\); \}/);
  });

  it('MO-41: both reduce paths, forced colours and print hide every opening layer and stop the desk\'s opening animations', () => {
    const plain = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const media = /@media \(prefers-reduced-motion: reduce\), \(forced-colors: active\), print \{([\s\S]*?\})\s*\}/.exec(plain)?.[1] ?? '';
    expect(media).toMatch(/:root\[data-intro\] \.desk :is\(\.ov, \.dev__off, \.dev__pwr\) \{ display: none; \}/);
    expect(media).toMatch(/:root\[data-intro\] \.desk :is\(\*, \*::before, \*::after\) \{ animation: none !important; \}/);
    expect(plain).toMatch(/:root\[data-motion="reduce"\]\[data-intro\] \.desk :is\(\.ov, \.dev__off, \.dev__pwr\) \{ display: none; \}/);
    expect(plain).toMatch(/:root\[data-motion="reduce"\]\[data-intro\] \.desk :is\(\*, \*::before, \*::after\) \{ animation: none !important; \}/);
    // the reduce rules come after every opening rule
    expect(plain.lastIndexOf('[data-intro="opening"] .file--data .rstamp__ink')).toBeLessThan(plain.indexOf('@media (prefers-reduced-motion: reduce), (forced-colors: active), print'));
  });
});
