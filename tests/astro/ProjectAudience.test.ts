import { describe, expect, it } from 'vitest';
import ProjectAudience from '../../src/components/projects/ProjectAudience.astro';
import { readSource, renderAstro } from './helpers';

const audience = { game: '게임 팀에게 주는 한 문장입니다.', research: '방법을 다시 적은 두 문장입니다. 두 번째 문장입니다.' };

describe('ProjectAudience.astro (P1-8)', () => {
  it('two labelled blocks: 게임 팀에게 | 연구 기여, in that order', async () => {
    const ko = await renderAstro(ProjectAudience, { props: { variant: 'game', lang: 'ko', audience } });
    const labels = [...ko.matchAll(/<h2[^>]*class="audience__label"[^>]*>([^<]*)<\/h2>/g)].map((m) => m[1]);
    expect(labels).toEqual(['게임 팀에게', '연구 기여']);
    expect(ko).toMatch(/<section(?=[^>]*id="for-game-teams")(?=[^>]*aria-labelledby="for-game-teams-title")[^>]*>/);
    expect(ko).toMatch(/<section(?=[^>]*id="research-contribution")(?=[^>]*aria-labelledby="research-contribution-title")[^>]*>/);
    expect(ko.indexOf(audience.game)).toBeLessThan(ko.indexOf(audience.research));
    expect(ko).toContain(audience.research);
  });

  it('English labels on /en/', async () => {
    const en = await renderAstro(ProjectAudience, { props: { variant: 'game', lang: 'en', audience: { game: 'For teams.', research: 'Method.' } } });
    const labels = [...en.matchAll(/<h2[^>]*class="audience__label"[^>]*>([^<]*)<\/h2>/g)].map((m) => m[1]);
    expect(labels).toEqual(['For game teams', 'Research contribution']);
  });

  it('renders only the parts present (e.g. research only), and nothing without parts', async () => {
    const one = await renderAstro(ProjectAudience, { props: { variant: 'game', lang: 'ko', audience: { research: '방법만 있습니다.' } } });
    expect(one).not.toContain('for-game-teams');
    expect(one).not.toContain('게임 팀에게');
    expect(one).toMatch(/<section[^>]*id="research-contribution"/);
    expect(one).toMatch(/class="audience__grid audience__grid--single"/);
    const none = await renderAstro(ProjectAudience, { props: { variant: 'game', lang: 'ko', audience: {} } });
    expect(none.trim()).toBe('');
  });

  it('sits in the reading column below 1068px; at ≥1068 breaks out to the HUD container (F-040)', () => {
    const src = readSource('src/components/projects/ProjectAudience.astro');
    expect(src).toContain('<div class="audience read read-column">');
    expect(src).toMatch(/@media \(min-width: 1068px\) \{[\s\S]*?\.audience\s*\{[\s\S]*?max-width:\s*var\(--container-hud\)/);
    expect(src).toMatch(/@media \(min-width: 1068px\) \{[\s\S]*?\.audience__grid\s*\{[\s\S]*?align-items:\s*start/);
  });

  it('general version (P2-6): plain blocks under a heavy rule, serif labels, no bracket panels', async () => {
    const html = await renderAstro(ProjectAudience, { props: { variant: 'data', lang: 'ko', audience: { research: '연구 기여 문장입니다.' } } });
    expect(html).toMatch(/<div class="ed-prose audience-ed"/);
    expect(html).toMatch(/<section id="research-contribution" class="audience-ed__block"/);
    expect(html).toMatch(/<h2 id="research-contribution-title" class="ed-item__title" data-serif[^>]*>연구 기여<\/h2>/);
    expect(html).not.toMatch(/bracket|lh-frame|hud-label|for-game-teams/);
  });
});
