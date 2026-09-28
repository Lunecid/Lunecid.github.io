import { describe, expect, it } from 'vitest';
import MembershipCard from '../../src/components/player-log/MembershipCard.astro';
import { readSource, renderAstro } from './helpers';

const FIELDS = [
  { label: 'NAME', value: '백성은 · Lunecid' },
  { label: 'CLASS', value: '게임 데이터 분석가 · 연구자' },
  { label: 'FAVORITE', value: '레미엘 · 유라 · 모나' },
];

describe('MembershipCard', () => {
  it('fields as dl, sticker, band text, photo alt', async () => {
    const html = await renderAstro(MembershipCard, {
      props: { headingLevel: 2, fields: FIELDS, sticker: 'CoG 2026 ORAL', memberSince: 'MEMBER SINCE 2025', photoAlt: '백성은 증명사진' },
    });
    expect(html).toMatch(/<article[^>]*class="mcard"[^>]*aria-label="Player Data Lab Membership Card"/);
    expect(html).toMatch(/<h2[^>]*class="mcard__title"[^>]*>Player Data Lab<small[^>]*>Membership Card<\/small><\/h2>/);
    expect(html).toMatch(/<dl[^>]*class="mcard__fields"/);
    expect(html.match(/<dt[\s>]/g)).toHaveLength(3);
    for (const f of FIELDS) {
      expect(html).toMatch(new RegExp(`<dt[^>]*>${f.label}</dt>`));
      expect(html).toMatch(new RegExp(`<dd[^>]*>${f.value}</dd>`));
    }
    expect(html).toMatch(/class="mcard__sticker"[^>]*>CoG 2026 ORAL</);
    expect(html).toMatch(/class="mcard__band"[^>]*><span[^>]*>MEMBER SINCE 2025<\/span>/);
    expect(html).toMatch(/class="mcard__barcode"[^>]*aria-hidden="true"/);
    expect(html).toMatch(/<img[^>]*alt="백성은 증명사진"/);
    expect(html).toMatch(/<img[^>]*width="112"/);
    expect(html).toMatch(/<img[^>]*loading="eager"/); // P2-39: above the fold on /player-log/
  });

  it('defaults to an h3 heading', async () => {
    const html = await renderAstro(MembershipCard, {
      props: { fields: FIELDS, sticker: 'CoG 2026 ORAL', memberSince: 'MEMBER SINCE 2025', photoAlt: 'ID photo of Seongeun Baek' },
    });
    expect(html).toMatch(/<h3[^>]*class="mcard__title"/);
    expect(html).not.toMatch(/<h2[\s>]/);
  });

  it('P1-4: the sticker sits over the photo corner (small right offset), not deep enough left to reach the CLASS field column', () => {
    const src = readSource('src/components/player-log/MembershipCard.astro');
    // The desktop rule is the first .mcard__sticker block in the file; the mobile override comes after it.
    const desktopRule = /\.mcard__sticker\s*\{([^}]*)\}/.exec(src)?.[1] ?? '';
    expect(desktopRule).not.toMatch(/right:\s*82px/); // the old offset ran the sticker into the field column
    expect(src).toMatch(/\.mcard\s*\{[^}]*column-gap:\s*10px/); // a real gap, not a 0-width seam, between the columns
    const mobileBlock = /@media \(max-width: 733\.98px\) \{([\s\S]*?)\n  \}/.exec(src)?.[1] ?? '';
    const mobileRule = /\.mcard__sticker\s*\{([^}]*)\}/.exec(mobileBlock)?.[1] ?? '';
    expect(mobileRule, 'no mobile .mcard__sticker override').toBeTruthy();
    // final fix 2 item 8: on the photo's lower edge (as on desktop), not down on the pink band over the barcode
    expect(mobileRule).toMatch(/top:\s*98px/);
    expect(mobileRule).not.toMatch(/bottom:/);
    expect(mobileRule).not.toMatch(/top:\s*92px/); // the old offset overlapped the CLASS value at 375px
  });
});
