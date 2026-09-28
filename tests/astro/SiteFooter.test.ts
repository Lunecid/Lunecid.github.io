import { describe, expect, it } from 'vitest';
import SiteFooter from '../../src/components/hud/SiteFooter.astro';
import { t } from '../../src/i18n/utils';
import { renderAstro } from './helpers';

// 2026-09-25 16:30 UTC = 2026-09-26 01:30 in Asia/Seoul
const builtAt = new Date('2026-09-25T16:30:00Z');

function decode(html: string): string {
  return html.replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
}

function footerLinkHrefs(html: string): string[] {
  const list = html.match(/<ul class="site-footer__links"[\s\S]*?<\/ul>/)?.[0] ?? '';
  return [...list.matchAll(/href="([^"]+)"/g)].map((m) => m[1] ?? '');
}

describe('SiteFooter.astro', () => {
  it('links to /stats/, /privacy/, /credits/ localized', async () => {
    const ko = await renderAstro(SiteFooter, { props: { lang: 'ko', notices: [], builtAt } });
    expect(footerLinkHrefs(ko)).toEqual(['/stats/', '/privacy/', '/credits/']);
    expect(ko).toMatch(/<nav[^>]*aria-label="사이트 정보"/);
    for (const label of ['방문 통계', '개인정보 처리방침', '출처·고지']) expect(ko).toContain(label);

    const en = await renderAstro(SiteFooter, { props: { lang: 'en', notices: [], builtAt }, url: '/en/' });
    expect(footerLinkHrefs(en)).toEqual(['/en/stats/', '/en/privacy/', '/en/credits/']);
    expect(en).toMatch(/<nav[^>]*aria-label="Site information"/);
  });

  it('shows last updated as YYYY.MM.DD in Asia/Seoul', async () => {
    const ko = await renderAstro(SiteFooter, { props: { lang: 'ko', notices: [], builtAt } });
    expect(ko).toMatch(/마지막 업데이트\s*<time datetime="2026-09-26"[^>]*>2026\.09\.26<\/time>/);
    expect(ko).toContain('© 2026 백성은');

    const en = await renderAstro(SiteFooter, { props: { lang: 'en', notices: [], builtAt } });
    expect(en).toMatch(/Last updated\s*<time datetime="2026-09-26"[^>]*>Sep 26, 2026<\/time>/);
  });

  it('renders COGNOSPHERE, ZZZ and fan-content notices verbatim in order when given', async () => {
    const html = decode(
      await renderAstro(SiteFooter, {
        props: { lang: 'ko', notices: ['fan-content', 'zzz-fan-guide', 'cognosphere'], builtAt },
      }),
    );
    const cognosphere = html.indexOf(
      '© All rights reserved by COGNOSPHERE. Other properties belong to their respective owners.',
    );
    const zzzCopyright = html.indexOf('© All rights reserved by miHoYo');
    const zzzLegal = html.indexOf(
      'Other properties and any right, title, and interest thereof and therein (intellectual property rights included) not derived from Zenless Zone Zero belong to their respective owners.',
    );
    const fanContent = html.indexOf('게임 캐릭터 이미지는 팬 콘텐츠이며 공식 제휴가 아닙니다.');
    expect(cognosphere).toBeGreaterThan(-1);
    expect(cognosphere).toBeLessThan(zzzCopyright);
    expect(zzzCopyright).toBeLessThan(zzzLegal);
    expect(zzzLegal).toBeLessThan(fanContent);
    expect(html).toMatch(/<p class="site-footer__notice" lang="en"[^>]*>© All rights reserved by COGNOSPHERE/);
    expect(html).toMatch(/<p class="site-footer__notice"(?! lang)[^>]*>게임 캐릭터 이미지는/);
  });

  it("renders the Riot notice for 'riot'", async () => {
    const html = decode(await renderAstro(SiteFooter, { props: { lang: 'ko', notices: ['riot'], builtAt } }));
    expect(html).toContain("Seongeun Baek's portfolio isn't endorsed by Riot Games");
    expect(html).toContain(t('ko', 'notice.riot'));
    expect(html).not.toContain('COGNOSPHERE');
  });

  it('renders no notices by default', async () => {
    const html = await renderAstro(SiteFooter, { props: { lang: 'ko', notices: [], builtAt } });
    expect(html).not.toContain('site-footer__notice');
    expect(html).not.toContain('COGNOSPHERE');
  });

  it('motion toggle button starts aria-pressed=false, visible label constant (fix round 2 item 1)', async () => {
    const ko = await renderAstro(SiteFooter, { props: { lang: 'ko', notices: [], builtAt } });
    const button = ko.match(/<button[^>]*data-motion-toggle[^>]*>/)?.[0] ?? '';
    expect(button).toContain('type="button"');
    expect(button).toContain('aria-pressed="false"');
    // No aria-label: the accessible name comes from the button's own (constant) visible text, per WCAG 2.5.3 —
    // fix round 1 gave it a constant *name* independent of the visible text, which still changed; that broke
    // 2.5.3 the other way (name never contained the visible label). Now there is only one string, and it never
    // changes with state; the aria-hidden chip carries the on/off indicator instead.
    expect(button).not.toContain('aria-label');
    // Fix round 3 item 1: no static aria-describedby either — a hidden element that is aria-describedby's direct
    // target still supplies its text in Chrome's real AX tree, so a static reference here announced "Off by
    // device setting" even in the ordinary, not-OS-forced states. It is added only by sync() in script, when the
    // OS setting actually forces reduced motion.
    expect(button).not.toContain('aria-describedby');
    expect(ko).toMatch(/<button[^>]*data-motion-toggle[^>]*>\s*모션 줄이기\s*<span[^>]*class="site-footer__motion-chip"[^>]*>OFF<\/span><\/button>/);
    expect(ko).toMatch(/<p[^>]*id="motion-os-note"[^>]*data-motion-os-note[^>]*hidden[^>]*>기기 설정에서 모션을 줄였습니다<\/p>/);

    const en = await renderAstro(SiteFooter, { props: { lang: 'en', notices: [], builtAt } });
    expect(en).toMatch(/<button[^>]*data-motion-toggle[^>]*>\s*Reduce motion\s*<span[^>]*class="site-footer__motion-chip"[^>]*>OFF<\/span><\/button>/);
  });
});
