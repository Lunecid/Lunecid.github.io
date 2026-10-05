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
    // the tooth and formation sit on a pseudo-element layer, so the paper itself is no image-backed (LCP) element
    expect(css).toMatch(/\.paper\s*\{[^}]*background-color:\s*var\(--pr-paper\);/);
    expect(css).not.toMatch(/\.paper\s*\{[^}]*background-image/);
    expect(css).toMatch(/\.paper::after\s*\{[^}]*background-image:\s*var\(--tooth\),\s*var\(--formation\)/);
    expect(css).toMatch(/\.paper\s*\{[^}]*-webkit-mask-box-image:\s*var\(--deckle\)/);
    expect(css).toMatch(/\.paper::before\s*\{[^}]*inset 1px 1px 0 var\(--pr-plate\)/);
    expect(css).not.toMatch(/--hole|--rim\b|--vperf|--pr-band|--pr-perf|sprocket/);
    // MO-34 (named): the tablet's screen and camera use radial gradients; the printout's rules still use none
    expect(css.split('\n').filter((l) => /\.file--data/.test(l) && /radial-gradient/.test(l))).toEqual([]);
    const html = await render('ko');
    expect(html).not.toMatch(/data-paper|class="(hole|perf|band)/);
  });

  it('paint: red field behind DATA (white type), yellow dab, blue foot field, frayed edges; the link is ink with a yellow stroke that sweeps by transform', () => {
    expect(css).toMatch(/\.pr__red\s*\{[^}]*color:\s*var\(--pr-on-color\);[^}]*background:\s*var\(--tex-rh\),\s*var\(--pr-red\)/);
    expect(css).toMatch(/\.pr__dab\s*\{[^}]*background:\s*var\(--tex-yv\),\s*var\(--pr-yellow\)/);
    expect(css).toMatch(/\.pr__blue\s*\{[^}]*background:\s*var\(--tex-bv\),\s*var\(--pr-blue\)/);
    expect(css).toMatch(/\.cta--pr \.cta__hov\s*\{[^}]*background:\s*var\(--tex-yh\),\s*var\(--pr-link-stroke\);[^}]*transform:\s*scaleX\(0\)/);
    expect(css).toMatch(/\.cta__t\s*\{[^}]*text-decoration:\s*underline/);
    expect(css).toMatch(/\.cta--pr\s*\{[^}]*color:\s*var\(--pr-link\)/);
    // reduced motion: no sweep (both paths)
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{[^@]*\.cta--pr \.cta__hov\s*\{\s*transition:\s*none/);
    expect(css).toMatch(/:root\[data-motion="reduce"\] (\.file--data )?\.cta--pr \.cta__hov\s*\{\s*transition:\s*none/);
  });
});
