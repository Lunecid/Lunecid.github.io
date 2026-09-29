import { describe, expect, it } from 'vitest';
import DataNav from '../../src/components/data/DataNav.astro';
import { DOCUMENTS } from '../../src/config';
import { t } from '../../src/i18n/utils';
import { dataVariant } from '../../src/variants/data';
import { renderAstro } from './helpers';

const cvKo = { cvHref: DOCUMENTS[dataVariant.documents.resume.ko], cvLabel: t('ko', 'nav.cvResume') };
const listHrefs = (html: string): string[] =>
  [...(html.match(/<ul class="data-nav__list"[\s\S]*?<\/ul>/)?.[0] ?? '').matchAll(/href="([^"]+)"/g)].map((m) => m[1] ?? '');

describe('DataNav.astro (P2-2)', () => {
  it('brand in the serif face to the general home, the three sections, no numbers and no player log', async () => {
    const ko = await renderAstro(DataNav, { props: { lang: 'ko', current: 'records', exact: true, altLangHref: '/en/data/records/', ...cvKo }, url: '/data/records/' });
    expect(ko).toMatch(/<a class="data-nav__brand" href="\/data\/"/);
    expect(ko).toMatch(/<span class="data-nav__name" data-serif[^>]*>백성은<\/span>/);
    // The accessible name is the sr-only '백성은 홈' once, not the name twice; the visible name is part of it (WCAG 2.5.3).
    expect(ko).toMatch(/<span class="data-nav__name" data-serif[^>]*aria-hidden="true"[^>]*>백성은<\/span>\s*<span class="sr-only"[^>]*>백성은 홈<\/span>/);
    expect(listHrefs(ko)).toEqual(['/data/research/', '/data/projects/', '/data/records/']);
    expect(ko).toMatch(/<a href="\/data\/records\/" aria-current="page"/);
    expect(ko).not.toMatch(/player-log|플레이 로그|\b0[1-4]\b|\[SB\]|GAME DATA ANALYST|hud-nav|cut--line/);
    const en = await renderAstro(DataNav, { props: { lang: 'en', altLangHref: '/data/', cvHref: DOCUMENTS[dataVariant.documents.resume.en], cvLabel: t('en', 'nav.cvResume') }, url: '/en/data/' });
    expect(en).toMatch(/<a class="data-nav__brand" href="\/en\/data\/"/);
    expect(listHrefs(en)).toEqual(['/en/data/research/', '/en/data/projects/', '/en/data/records/']);
  });

  it('language switch in the bar and in the panel, the version switch in both, the CV link, the menu toggle', async () => {
    const ko = await renderAstro(DataNav, { props: { lang: 'ko', altLangHref: '/en/data/records/', ...cvKo }, url: '/data/records/' });
    expect(ko.match(/<a href="\/en\/data\/records\/" hreflang="en" lang="en"/g)).toHaveLength(2);
    expect(ko.match(/data-switch-variant="game"/g)).toHaveLength(2);
    expect(ko).toMatch(new RegExp(`<a class="data-nav__cv[^"]*" href="${cvKo.cvHref}" title="이력서 \\(PDF\\)" download`));
    expect(ko).toMatch(/<button class="data-nav__toggle" type="button" aria-expanded="false" aria-controls="data-menu" data-nav-toggle/);
    expect(ko).toMatch(/<nav id="data-menu" class="data-nav__panel" aria-label="주 메뉴"/);
  });

  it('no language switch when the page has no other-language twin', async () => {
    const html = await renderAstro(DataNav, { props: { lang: 'ko', altLangHref: null, ...cvKo }, url: '/data/' });
    expect(html).not.toMatch(/hreflang=/);
  });
});
