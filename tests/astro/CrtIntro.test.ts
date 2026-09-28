import { describe, expect, it } from 'vitest';
import CrtIntro from '../../src/components/hud/CrtIntro.astro';
import { readSource, renderAstro } from './helpers';

describe('CrtIntro.astro', () => {
  it('overlay is aria-hidden and contains no focusable element', async () => {
    const html = await renderAstro(CrtIntro);
    expect(html).toMatch(/<div(?=[^>]*\bclass="crt(?:\s[^"]*)?")(?=[^>]*\baria-hidden="true")[^>]*>/);
    expect(html).not.toMatch(/<(a|button|input|select|textarea|summary)\b/);
    expect(html).not.toMatch(/tabindex=/);
  });

  it('contains PLAYER DATA LAB and ▶ START', async () => {
    const html = await renderAstro(CrtIntro);
    expect(html).toMatch(/<p[^>]*class="crt__caption[^"]*"[^>]*lang="en"[^>]*>PLAYER DATA LAB<\/p>|<p[^>]*lang="en"[^>]*class="crt__caption[^"]*"[^>]*>PLAYER DATA LAB<\/p>/);
    expect(html).toContain('▶ START');
    expect(html).toMatch(/class="crt__bar[^"]*"/);
    expect(html).toMatch(/class="crt__flash[^"]*"/);
  });

  it('is shown only while html has data-intro and never with reduced motion', () => {
    const src = readSource('src/components/hud/CrtIntro.astro');
    expect(src).toMatch(/\.crt\s*\{[^}]*display:\s*none/);
    expect(src).toMatch(/:global\(:root\[data-intro\]\)\s*\.crt\s*\{[^}]*display:\s*block/);
    expect(src).toMatch(/:global\(:root\[data-motion=['"]reduce['"]\]\)\s*\.crt\s*\{[^}]*display:\s*none/);
  });

  it('P2-4: never intercepts pointer input, even while playing (the skip listener is on window, capture phase)', () => {
    const src = readSource('src/components/hud/CrtIntro.astro');
    // Base rule, not just the fading/exit state: a click during "playing" must reach the real link under it.
    expect(src).toMatch(/^\s*\.crt\s*\{[^}]*pointer-events:\s*none/m);
  });

  it('flashes once and repeats nothing', () => {
    const src = readSource('src/components/hud/CrtIntro.astro');
    expect(src.match(/animation:\s*crt-flash\b/g)).toHaveLength(1);
    expect(src).not.toMatch(/infinite|animation-iteration-count/);
  });
});
