// P1-9b (P-03): the BGM button is server markup plus a plain script. The dom tests
// (tests/react/BgmToggle.test.tsx) run the script on tests/helpers/hud-markup.ts; this pins that markup to the render.
import { describe, expect, it } from 'vitest';
import BgmToggle from '../../src/components/hud/BgmToggle.astro';
import { MEDIA } from '../../src/config';
import { bgmToggleMarkup } from '../helpers/hud-markup';
import { readSource, renderAstro } from './helpers';

describe('BgmToggle.astro', () => {
  it('renders exactly the markup the dom tests mount, with the data-bgm-toggle marker once and no island', async () => {
    const html = await renderAstro(BgmToggle, { props: { src: MEDIA.bgm } });
    expect(html.startsWith(bgmToggleMarkup(MEDIA.bgm))).toBe(true);
    expect(html.match(/data-bgm-toggle/g)).toHaveLength(1);
    expect(html).not.toContain('<astro-island');
    expect(html).toMatch(/<script type="module"[^>]*src="[^"]*BgmToggle\.astro\?astro&(?:amp;)?type=script/);
  });

  it('is off on the server (aria-pressed false, OFF, no waiting state) and named by its label', async () => {
    const html = await renderAstro(BgmToggle, { props: { src: MEDIA.bgm, label: 'Music' } });
    expect(html).toContain('aria-label="Music"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('<span class="bgm__state" aria-hidden="true">OFF</span>');
    expect(html).not.toContain('data-state');
    expect(html).not.toContain('aria-describedby');
    expect(html.startsWith(bgmToggleMarkup(MEDIA.bgm, 'Music'))).toBe(true);
  });

  it('keeps the island stylesheet (moved unchanged) and imports the helpers from src/lib/bgm.ts', () => {
    const source = readSource('src/components/hud/BgmToggle.astro');
    expect(source).toContain("import './BgmToggle.css';");
    expect(readSource('src/scripts/bgm-toggle.ts')).toMatch(/from '\.\.\/lib\/bgm'/);
    const css = readSource('src/components/hud/BgmToggle.css');
    expect(css).toContain(".bgm[aria-pressed='true'][data-state='waiting']");
    expect(css).toContain(":root[data-motion='reduce'] .bgm:active");
  });
});
