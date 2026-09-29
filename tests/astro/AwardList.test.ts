import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import AwardList from '../../src/components/records/AwardList.astro';
import { awardSchema } from '../../src/content/schemas';
import { parseYamlList } from '../../src/content/yaml-loader';
import { awardItems } from '../../src/lib/records';
import type { CertificateId } from '../../src/types';
import { renderAstro } from './helpers';

// CDS project forced to null so the case holds whatever Task 0 Q5 answered.
const awards = parseYamlList(readFileSync(resolve(process.cwd(), 'src/data/awards.yaml'), 'utf8'))
  .map((item) => awardSchema.parse(item))
  .map((award) => (award.id === 'cds-encouragement-award' ? { ...award, project: null } : award));
const REFS: { ref: CertificateId }[] = [
  { ref: 'busan-mayor-award' },
  { ref: 'cds-encouragement-award' },
  { ref: 'multicampus-grand-award' },
];
const CERT_HREFS: Record<CertificateId, string> = {
  'busan-mayor-award': '/_astro/busan-mayor-award_1280.webp',
  'cds-encouragement-award': '/_astro/cds-encouragement-award_1280.webp',
  'multicampus-grand-award': '/_astro/multicampus-grand-award_1280.webp',
};
const attr = (tag: string, name: string): string | undefined => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];

describe('AwardList.astro', () => {
  it('3 awards with certificate triggers (data-cert-id, image href)', async () => {
    const html = await renderAstro(AwardList, { props: { lang: 'ko', awards: awardItems(REFS, awards, 'ko', CERT_HREFS) } });
    expect(html).toMatch(/<section(?=[^>]*\bid="awards")[^>]*>/);
    expect(html).toContain('ACHIEVEMENTS');
    expect(html).toMatch(/<h2[^>]*>수상<\/h2>/);
    const triggers = [...html.matchAll(/<a\b[^>]*data-cert-id="([^"]+)"[^>]*>/g)];
    expect(triggers.map((m) => m[1])).toEqual(REFS.map((r) => r.ref));
    for (const m of triggers) {
      expect(m[0]).toContain('aria-haspopup="dialog"');
      expect(m[0]).toContain('data-viewer="certificates"');
      expect(attr(m[0], 'href')).toBe(CERT_HREFS[m[1] as CertificateId]);
    }
    expect(html.match(/상장 보기/g)).toHaveLength(3);
    expect(html).toContain('최우수상(부산광역시장상)');
    expect(html).toMatch(/<time[^>]*datetime="2025-07-11"[^>]*>2025\.07\.11<\/time>/);
    expect(html).toMatch(/<span(?=[^>]*class="award__medal award__medal--silver")[^>]*>장려<\/span>/);
    // P2-19: an award shown as issued has no redaction caption; the others still say what is hidden
    expect(html).not.toContain('가린 정보가 없는 원본입니다');
    const busan = html.split(/<li\b/).find((chunk) => chunk.includes('data-award="busan-mayor-award"')) ?? '';
    expect(busan).not.toContain('award__note');
    expect(html).toContain('생년월일을 가렸습니다.');
    // P1-9: square link chips, not a rounded box
    expect(html).toMatch(/<a class="award__cert lh-chip"/);
    // P2-14/D-7: ↗ means "leaves the site" (GitHub, Code); a certificate button opens an in-page modal, so it
    // gets no symbol (Pretendard has no ⤢ glyph — a fallback system font would look inconsistent).
    expect(html).not.toContain('↗');
  });

  it('project link when set, none for CDS', async () => {
    const html = await renderAstro(AwardList, { props: { lang: 'ko', awards: awardItems(REFS, awards, 'ko', CERT_HREFS) } });
    const chunks = html.split(/<li\b/).slice(1);
    const cds = chunks.find((chunk) => chunk.includes('data-award="cds-encouragement-award"'));
    expect(cds).toBeDefined();
    expect(cds).not.toMatch(/href="\/projects\//);
    expect(html).toMatch(/<a[^>]*href="\/projects\/school-zone-blindspots\/"[^>]*>프로젝트 보기<\/a>/);
    expect(html).toMatch(/<a[^>]*href="\/projects\/kickick-park\/"[^>]*>프로젝트 보기<\/a>/);

    const noImages = await renderAstro(AwardList, { props: { lang: 'en', awards: awardItems(REFS, awards, 'en', {}) } });
    expect(noImages).not.toContain('data-cert-id');
    expect(noImages).toMatch(/<a[^>]*href="\/en\/projects\/kickick-park\/"[^>]*>View project<\/a>/);
  });
});
