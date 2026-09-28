import { afterEach, describe, expect, it } from 'vitest';
import { CV_HREF } from '../../src/config';
import { ui } from '../../src/i18n/ui';
import { EN_404_SCRIPT } from '../../src/lib/en-404';

// EN_404_SCRIPT is the inline page-end script of src/pages/404.astro (P2-15); the Playwright specs in
// tests/e2e/interaction.spec.ts cover it end to end, this pins the one string it must share with ui.ts.

afterEach(() => {
  document.body.innerHTML = '';
  document.documentElement.lang = '';
  window.history.replaceState(null, '', '/');
});

describe('EN_404_SCRIPT', () => {
  it('is a self-contained classic script (no imports/exports at runtime)', () => {
    expect(EN_404_SCRIPT).not.toMatch(/\b(import|export|require)\b/);
    expect(EN_404_SCRIPT.trim().startsWith('(function')).toBe(true);
  });

  it("fix round 4 item 1: on /en/ the footer motion note reads ui.ts's English action.motionOsOff, not a stale literal", () => {
    // The note becomes the motion toggle's accessible description while the OS forces reduced motion (the footer's
    // runtime sync() adds aria-describedby="motion-os-note" only then), so it must match every other /en/ footer.
    document.body.innerHTML = `<p id="motion-os-note" hidden>${ui.ko['action.motionOsOff']}</p>`;
    window.history.replaceState(null, '', '/en/zzz-missing/');
    new Function(EN_404_SCRIPT)();
    expect(document.documentElement.lang).toBe('en');
    expect(document.getElementById('motion-os-note')?.textContent).toBe(ui.en['action.motionOsOff']);
    expect(ui.en['action.motionOsOff']).toBe('Motion reduced by your device setting');
  });

  it('leaves a Korean-path 404 alone', () => {
    document.body.innerHTML = `<p id="motion-os-note" hidden>${ui.ko['action.motionOsOff']}</p>`;
    window.history.replaceState(null, '', '/zzz-missing/');
    new Function(EN_404_SCRIPT)();
    expect(document.getElementById('motion-os-note')?.textContent).toBe(ui.ko['action.motionOsOff']);
  });

  it('interpolates nav, CV, 404 and achievement strings from ui.ts / config at build time', () => {
    expect(EN_404_SCRIPT).toContain(JSON.stringify(ui.en['nav.research']));
    expect(EN_404_SCRIPT).toContain(JSON.stringify(ui.en['404.message']));
    expect(EN_404_SCRIPT).toContain(JSON.stringify(ui.en['achievement.region']));
    expect(EN_404_SCRIPT).toContain(ui.ko['achievement.region']);
    expect(EN_404_SCRIPT).toContain(ui.ko['achievement.dismiss']);
    expect(EN_404_SCRIPT).toContain(JSON.stringify(CV_HREF.en));
  });
});
