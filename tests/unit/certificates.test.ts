import { readFileSync } from 'node:fs';
import type { ImageMetadata } from 'astro';
import { load } from 'js-yaml';
import { describe, expect, it, vi } from 'vitest';

const { getImage } = vi.hoisted(() => ({
  getImage: vi.fn(async (opts: { width?: number; widths?: number[]; format?: string }) => ({
    src: opts.width ? `/_astro/cert.${opts.width}w.${opts.format ?? 'webp'}` : `/_astro/cert.${opts.format ?? 'webp'}`,
    srcSet: { attribute: (opts.widths ?? []).map((w) => `/_astro/cert.${w}w.webp ${w}w`).join(', ') },
    attributes: { width: opts.width ?? 1280, height: 1810 },
  })),
}));
vi.mock('astro:assets', () => ({ getImage }));

import { awardSchema, type AwardData } from '../../src/content/schemas';
import { CERT_SIZES, CERT_WIDTHS, createCertificateLookup } from '../../src/lib/certificates';

const awards: AwardData[] = (load(readFileSync(new URL('../../src/data/awards.yaml', import.meta.url), 'utf8')) as unknown[]).map((item) =>
  awardSchema.parse(item),
);
const busan = awards.find((a) => a.id === 'busan-mayor-award');
if (!busan) throw new Error('awards.yaml has no busan-mayor-award');

const meta = (width: number, height: number): ImageMetadata =>
  ({ src: '/src/assets/certificates/busan-mayor-award.webp', width, height, format: 'webp' }) as ImageMetadata;

describe('certificate lookup', () => {
  it('caption and alt per language', async () => {
    const lookup = createCertificateLookup({ '../assets/certificates/busan-mayor-award.webp': meta(1600, 2262) });
    const ko = await lookup.build(busan, 'ko');
    expect(ko).not.toBeNull();
    expect(ko?.id).toBe('busan-mayor-award');
    expect(ko?.caption).toBe('최우수상(부산광역시장상) · 2025 Big Data 활용 대회 · 빅데이터 분석 부문');
    expect(ko?.alt).toBe(busan.certificate.alt.ko);
    expect(ko?.width).toBe(1600);
    expect(ko?.height).toBe(2262);
    expect(ko?.sizes).toBe(CERT_SIZES);
    for (const w of CERT_WIDTHS) expect(ko?.srcSet).toContain(`${w}w`);
    const en = await lookup.build(busan, 'en');
    expect(en?.caption).toBe('Top Excellence Award (Mayor of Busan Award) · 2025 Big Data Utilization Contest · Big Data Analysis Division');
    expect(en?.alt).toBe(busan.certificate.alt.en);
  });

  it('null when the image is missing', async () => {
    const lookup = createCertificateLookup({});
    expect(lookup.image('busan-mayor-award')).toBeUndefined();
    expect(await lookup.build(busan, 'ko')).toBeNull();
    const other = createCertificateLookup({ '../assets/certificates/multicampus-grand-award.webp': meta(1600, 2263) });
    expect(await other.build(busan, 'ko')).toBeNull();
    expect(other.image('multicampus-grand-award')?.width).toBe(1600);
  });

  it('fullSrc is the 1280w WebP URL', async () => {
    getImage.mockClear();
    const lookup = createCertificateLookup({ '../assets/certificates/busan-mayor-award.webp': meta(1600, 2262) });
    const cert = await lookup.build(busan, 'ko');
    expect(cert?.fullSrc).toBe('/_astro/cert.1280w.webp');
    expect(getImage).toHaveBeenCalledWith(expect.objectContaining({ width: 1280, format: 'webp' }));
    const narrow = createCertificateLookup({ '../assets/certificates/busan-mayor-award.webp': meta(900, 1272) });
    expect((await narrow.build(busan, 'ko'))?.fullSrc).toBe('/_astro/cert.900w.webp');
  });
});
