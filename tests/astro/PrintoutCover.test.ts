// The general file on the chooser desk (MO-23, v6.4): a printout on white cotton-rag art paper (finish B "판화지": no
// sprocket holes, no green bars, no tear perforation; a plate mark and a soft deckle edge), painted Mondrian fields (red
// behind DATA, a yellow dab, a blue foot field), a rubber stamp "검토 완료", and one ink link.
import { describe, expect, it } from 'vitest';
import PrintoutCover from '../../src/components/neutral/PrintoutCover.astro';
import { buildCover } from '../../src/lib/chooser-covers';
import { readSource, renderAstro } from './helpers';

const render = (lang: 'ko' | 'en') => renderAstro(PrintoutCover, { props: { cover: buildCover('data', lang, '2026-10-05') } });
const css = readSource('src/styles/chooser.css').replace(/\/\*[\s\S]*?\*\//g, '');

describe('PrintoutCover.astro (MO-23)', () => {
  it('one article, one link named by title + CTA, hit layer over the file', async () => {
    const html = await render('ko');
    expect(html.match(/<article\b/g)).toHaveLength(1);
    expect(html).toMatch(/<article class="file file--data"[^>]*aria-labelledby="file-data-title"/);
    const links = [...html.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatch(/class="cta cta--pr"/);
    expect(links[0]).toMatch(/href="\/data\/"/);
    expect(links[0]).toMatch(/data-choose-variant="data"/);
    expect(links[0]).toMatch(/aria-labelledby="file-data-title file-data-cta"/);
    expect(html).toMatch(/<span id="file-data-cta" class="cta__t"[^>]*>일반 버전 보기<\/span>/);
    expect(html).toMatch(/<span class="cta__hit" aria-hidden="true"[^>]*><\/span><\/a>/);
    expect(css).toMatch(/\.cta__hit\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*0/);
  });

  it('h2 is the title; banner words and job lines are aria-hidden English', async () => {
    const html = await render('ko');
    expect(html).toMatch(/<h2 class="pr__h2" id="file-data-title"[^>]*>데이터 분석가<\/h2>/);
    expect(html).not.toContain('data-serif');
    expect(html).toMatch(/<p class="pr__hdr" lang="en" aria-hidden="true"[^>]*><span[^>]*>DATA_ANALYST\.DOC<\/span><span[^>]*>NO\. PDL-26\/02<\/span><\/p>/);
    expect(html).toMatch(/<p class="pr__disp" lang="en" aria-hidden="true"[^>]*><span class="pr__row1"[^>]*><span class="pr__red"[^>]*>DATA<\/span><i class="pr__dab"[^>]*><\/i><\/span><span[^>]*>ANALYST<\/span><\/p>/);
    expect(html).toMatch(/<p class="pr__foot" lang="en" aria-hidden="true"[^>]*><span class="pr__foot-t"[^>]*>2026 · PORTFOLIO · lunecid\.github\.io<\/span><i class="pr__blue"/);
    expect(html).toMatch(/<span class="pr__kicker"[^>]*>일반 버전<\/span>/);
  });

  it('contents line in nav order; tagline verbatim', async () => {
    const html = await render('ko');
    const toc = [...(/<ol class="pr__toc"[\s\S]*?<\/ol>/.exec(html)?.[0] ?? '').matchAll(/<span class="toc__n" aria-hidden="true"[^>]*>(\d\d)<\/span><span class="toc__t"[^>]*>([^<]+)<\/span>/g)].map((m) => [m[1], m[2]]);
    expect(toc).toEqual([['01', '연구'], ['02', '프로젝트'], ['03', '기록']]);
    const intro = /<p class="pr__intro"[^>]*>([\s\S]*?)<\/p>/.exec(html)?.[1] ?? '';
    expect(intro.replace(/<[^>]+>/g, '')).toBe('질문을 데이터로 바꾸고, 결과를 결정으로 잇습니다.');
    const en = await render('en');
    expect((/<p class="pr__intro"[^>]*>([\s\S]*?)<\/p>/.exec(en)?.[1] ?? '').replace(/<[^>]+>/g, '')).toBe('I turn questions into data, and results into decisions.');
    expect(en).toMatch(/href="\/en\/data\/"/);
  });

  it('rubber stamp aria-hidden', async () => {
    expect(await render('ko')).toMatch(/<span class="rstamp" aria-hidden="true"[^>]*><span class="rstamp__ink"[^>]*>검토 완료<\/span><\/span>/);
    expect(await render('en')).toMatch(/<span class="rstamp__ink"[^>]*>REVIEWED<\/span>/);
  });

  it('emblem inline SVG, aria-hidden, focusable=false, no href/use/image', async () => {
    const svg = /<svg\b[\s\S]*?<\/svg>/.exec(await render('ko'))?.[0] ?? '';
    expect(svg).toMatch(/class="emblem emblem--ink"/);
    expect(svg).toMatch(/aria-hidden="true"/);
    expect(svg).toMatch(/focusable="false"/);
    expect(svg).not.toMatch(/href=|<use\b|<image\b/);
  });

  it('no stat, evidence, chart or gold class', async () => {
    const html = await render('ko');
    expect(html).not.toMatch(/stat|evidence|chart|gold|AUC|최우수/i);
    expect(css).not.toMatch(/--gold/);
  });

  it('v6.4 finish B: white art paper with tooth and formation, a plate mark and a deckle edge; no sprocket holes, green bars or tear perforation', async () => {
    // Named change (late-LCP fix): no texture of the printout is an LCP candidate, so none can be reported late when a
    // slow device paints it after the toss: the formation is a pre-rendered tile (scripts/paint/paper.mjs) painted as
    // the paper's border-image fill (a border image is never an LCP candidate; a background image is, also on a
    // pseudo-element), the tooth is the prototype's SVG as a mask over its flat colour (nor is a mask)
    expect(css).toMatch(/\.paper\s*\{[^}]*background-color:\s*var\(--pr-paper\);[^}]*border-image:\s*url\("\.\/paint\/paper-formation\.webp"\) 0 fill \/ 0 \/ 0 repeat;/);
    expect(css).not.toMatch(/\.paper\s*\{[^}]*background-image/);
    expect(css).toMatch(/\.paper::after\s*\{[^}]*background-color:\s*#1F1F1F;[^}]*-webkit-mask:\s*var\(--tooth\) 0 0 \/ 180px 180px;\s*mask:\s*var\(--tooth\) 0 0 \/ 180px 180px;/);
    expect(css).toMatch(/\.paper\s*\{[^}]*-webkit-mask-box-image:\s*var\(--deckle\)/);
    expect(css).toMatch(/\.paper::before\s*\{[^}]*inset 1px 1px 0 var\(--pr-plate\)/);
    expect(css).not.toMatch(/--hole|--rim\b|--vperf|--pr-band|--pr-perf|sprocket/);
    // MO-34 (named): the tablet's screen and camera use radial gradients; the printout's rules still use none
    expect(css.split('\n').filter((l) => /\.file--data/.test(l) && /radial-gradient/.test(l))).toEqual([]);
    const html = await render('ko');
    expect(html).not.toMatch(/data-paper|class="(hole|perf|band)/);
  });

  it('paint: red field behind DATA (white type), yellow dab, blue foot field, frayed edges; the link is ink with a yellow stroke that sweeps by transform', () => {
    // named change (late-LCP fix): each field's brush tile is its border-image fill over the flat pigment (never an LCP
    // candidate, however late the tile arrives)
    const brush = (tex: string) => `background:\\s*var\\(--pr-[a-z-]+\\);[^}]*border-image:\\s*var\\(--tex-${tex}\\) 0 fill \\/ 0 \\/ 0 repeat;`;
    expect(css).toMatch(new RegExp(`\\.pr__red\\s*\\{[^}]*color:\\s*var\\(--pr-on-color\\);[^}]*${brush('rh')}`));
    expect(css).toMatch(new RegExp(`\\.pr__dab\\s*\\{[^}]*${brush('yv')}`));
    expect(css).toMatch(new RegExp(`\\.pr__blue\\s*\\{[^}]*${brush('bv')}`));
    expect(css).toMatch(new RegExp(`\\.cta--pr \\.cta__hov\\s*\\{[^}]*${brush('yh')}[^}]*transform:\\s*scaleX\\(0\\)`));
    expect(css).not.toMatch(/background:\s*var\(--tex-/);
    // forced colours: no texture (the brush, the formation and the tooth's layer off)
    expect(css).toMatch(/@media \(forced-colors: active\)\s*\{[^@]*\.pr__red, \.file--data \.pr__dab, \.file--data \.pr__blue, \.file--data \.cta--pr \.cta__hov \{ background: none; border-image: none; \}/);
    expect(css).toMatch(/@media \(forced-colors: active\)\s*\{[^@]*\.file--data \.paper \{ border-image: none; \}[^@]*\.file--data \.paper::after \{ display: none; \}/);
    expect(css).toMatch(/\.cta__t\s*\{[^}]*text-decoration:\s*underline/);
    expect(css).toMatch(/\.cta--pr\s*\{[^}]*color:\s*var\(--pr-link\)/);
    // reduced motion: no sweep (both paths)
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{[^@]*\.cta--pr \.cta__hov\s*\{\s*transition:\s*none/);
    expect(css).toMatch(/:root\[data-motion="reduce"\] (\.file--data )?\.cta--pr \.cta__hov\s*\{\s*transition:\s*none/);
  });

  it('MO-37: folder, clip and flag inside the face, aria-hidden; the flag reads coverCopy.data.num; one link', async () => {
    const html = await render('ko');
    const face = /<div class="face"[^>]*>([\s\S]*)<\/div>\s*<\/article>/.exec(html)?.[1] ?? '';
    expect(face).toMatch(/<i class="folder" aria-hidden="true"[^>]*><\/i>/);
    const clip = /<svg class="clip"[\s\S]*?<\/svg>/.exec(face)?.[0] ?? '';
    expect(clip).toMatch(/aria-hidden="true"/);
    expect(clip).toMatch(/focusable="false"/);
    expect(clip).not.toMatch(/#[0-9a-f]{3,6}\b|rgba?\(|<text|href=/i);
    expect(face).toMatch(/<span class="tab" aria-hidden="true"[^>]*><span class="tab__t" lang="en"[^>]*>NO\. 02<\/span><\/span>/);
    expect(html.match(/<a\b/g)).toHaveLength(1);
    // the folder lies under the sheet (inside the face, before the paper); the clip and the flag ride on the sheet
    expect(face.indexOf('class="folder"')).toBeLessThan(face.indexOf('class="feed"'));
    expect(face.indexOf('class="clip"')).toBeGreaterThan(face.indexOf('class="pr"'));
    expect(await render('en')).toMatch(/<span class="tab__t" lang="en"[^>]*>NO\. 02<\/span>/);
  });

  it('MO-41: the toss: the printout with its folder, clip and flag (one element) flies in from below the viewport at opacity 1, its lift shadow falls away; the game file slides from the desk centre; then the rubber stamp', async () => {
    const html = await render('ko');
    const article = /<article class="file file--data"[\s\S]*<\/article>/.exec(html)?.[0] ?? '';
    for (const part of ['class="folder"', 'class="clip"', 'class="tab"', 'class="rstamp"']) expect(article, part).toContain(part);
    expect(css).toMatch(/:root\[data-intro="opening"\] \.desk > \.file--data \{ animation: op-toss var\(--dur-enter\) var\(--ease-out\) var\(--at-op-toss\) both; \}/);
    const toss = /@keyframes op-toss \{ from \{([^}]*)\} to \{ transform: none; \} \}/.exec(css)?.[1] ?? '';
    expect(toss).not.toMatch(/opacity/); // painted from the first frame at opacity 1: never a late LCP candidate
    expect(toss).toMatch(/transform: translate\(clamp\(80px, 30vw, 360px\), calc\(100svh \+ 40px\)\) rotate\(16deg\) scale\(1\.06\);/);
    expect(css).toMatch(/:root\[data-intro="opening"\] \.desk > \.file--data::before \{ animation: op-out var\(--dur-enter\) var\(--ease-in\) var\(--at-op-toss\) both; \}/);
    expect(css).toMatch(/:root\[data-intro="opening"\] \.desk > \.file--game \{ animation: op-cx var\(--dur-enter\) var\(--ease-wipe\) var\(--at-op-toss\) both; \}/);
    expect(css).toMatch(/@keyframes op-cx \{ from \{ transform: translateX\(var\(--cx\)\); \} to \{ transform: none; \} \}/);
    // --cx: 0 on a phone (stacked), half the pair's overhang from 734px (chooser.ts measures the same in px)
    expect(css).toMatch(/\.desk \{[^}]*--cx: 0px;/);
    expect(css).toMatch(/@media \(min-width: 734px\) \{\s*\.desk \{[^}]*--cx: calc\(\(var\(--dx\) \+ var\(--dw\) - var\(--gw\)\) \/ 2\);/);
    expect(css).toMatch(/\.file--data \.rstamp__ink \{ animation: op-stamp var\(--dur-op-rstamp\) var\(--ease-out\) var\(--at-op-rstamp\) both; \}/);
  });
});
