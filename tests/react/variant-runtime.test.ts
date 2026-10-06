import { afterEach, describe, expect, it } from 'vitest';
import { currentVariant, moduleOn } from '../../src/lib/variant-runtime';
import { MODULE_IDS, VARIANT_MODULES } from '../../src/variants/ids';
import { HEAD_INIT_SCRIPT } from '../../src/lib/head-init';

const root = document.documentElement;
afterEach(() => root.setAttribute('data-variant', 'game'));

describe('variant runtime (§1.8)', () => {
  it('reads <html data-variant>; game has every module, data and neutral none', () => {
    root.setAttribute('data-variant', 'game');
    expect(currentVariant()).toBe('game');
    for (const m of MODULE_IDS) expect(moduleOn(m), m).toBe(true);
    root.setAttribute('data-variant', 'data');
    expect(currentVariant()).toBe('data');
    for (const m of MODULE_IDS) expect(moduleOn(m), m).toBe(false);
    root.setAttribute('data-variant', 'neutral');
    expect(currentVariant()).toBe('neutral');
    expect(moduleOn('achievements')).toBe(false);
    root.removeAttribute('data-variant');
    expect(currentVariant()).toBeNull();
    expect(moduleOn('sfx')).toBe(false);
    root.setAttribute('data-variant', 'en');
    expect(currentVariant()).toBeNull();
  });

  it('A-19: the inline CRT gate (which cannot import) agrees with VARIANT_MODULES', () => {
    expect(VARIANT_MODULES.game).toContain('crtIntro');
    expect(VARIANT_MODULES.data).not.toContain('crtIntro');
    // named change (MO-41): the CRT branch reads the shared gameHome flag (the chooser's opening is the other branch)
    expect(HEAD_INIT_SCRIPT).toContain("var gameHome = d.getAttribute('data-variant') === 'game' && d.getAttribute('data-page') === 'home';");
    expect(HEAD_INIT_SCRIPT).toContain(': reduce || !gameHome) return;');
  });
});
