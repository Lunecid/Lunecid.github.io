import { describe, expect, it } from 'vitest';
import NextProject from '../../src/components/projects/NextProject.astro';
import type { CartridgeProps } from '../../src/lib/projects';
import { renderAstro } from './helpers';

const next: CartridgeProps = { href: '/game/projects/kickick-park/', title: '킥킥파크', meta: 'Python · Tableau', tagKeys: ['cv'], tags: ['컴퓨터 비전'] };

describe('NextProject.astro (P-07 F-005)', () => {
  it('game: one "NEXT PROJECT ▶" cartridge under a visually hidden heading', async () => {
    const html = await renderAstro(NextProject, { props: { lang: 'ko', variant: 'game', next } });
    expect(html).toMatch(/<section class="pnext read read-section read-column"[^>]*aria-labelledby="next-project-title"/);
    expect(html).toMatch(/<h2 id="next-project-title" class="sr-only"[^>]*>다음 프로젝트<\/h2>/);
    expect(html).toContain('NEXT PROJECT ▶');
    expect(html.match(/<article class="cart"/g)).toHaveLength(1);
    expect(html).toMatch(/<a class="cart__link" href="\/game\/projects\/kickick-park\/"/);
  });

  it('general: one underlined "Next project →" link, no game word, the project named for screen readers', async () => {
    const html = await renderAstro(NextProject, { props: { lang: 'en', variant: 'data', next: { ...next, href: '/en/data/projects/kickick-park/', title: 'KickKick Park' } } });
    expect(html).toMatch(/<a class="ed-link" href="\/en\/data\/projects\/kickick-park\/"[^>]*>Next project <span aria-hidden="true"[^>]*>→<\/span><span class="sr-only"[^>]*> · KickKick Park<\/span><\/a>/);
    expect(html).not.toMatch(/NEXT PROJECT|cart|hud-label/);
  });
});
