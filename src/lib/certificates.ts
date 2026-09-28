// src/lib/certificates.ts — server-only. Certificate image = src/assets/certificates/<award-id>.webp
// (redacted copies, spec §8). Missing image → null, so callers render no "상장 보기" trigger.
import type { ImageMetadata } from 'astro';
import { getImage } from 'astro:assets';
import type { CertificateId } from '../types';
import type { AwardData } from '../content/schemas';
import type { Lang } from '../i18n/ui';
import type { Certificate } from '../islands/CertificateModal';
import { sourceSize } from './images';
import { islandImage } from './island-image.server';

export const CERT_WIDTHS = [640, 960, 1280];
export const CERT_SIZES = '(orientation: portrait) 88vw, 58vh';
const FULL_WIDTH = 1280;

/** Factory over an import.meta.glob map of '../assets/certificates/*.webp' (tests pass a plain object). */
export function createCertificateLookup(files: Record<string, ImageMetadata>): {
  image(id: CertificateId): ImageMetadata | undefined;
  build(award: AwardData, lang: Lang): Promise<Certificate | null>;
} {
  const byId = new Map<string, ImageMetadata>();
  for (const [path, meta] of Object.entries(files)) {
    const match = /([^/\\]+)\.webp$/.exec(path);
    if (match?.[1]) byId.set(match[1], meta);
  }
  return {
    image(id) {
      return byId.get(id);
    },
    async build(award, lang) {
      const src = byId.get(award.id);
      if (!src) return null;
      const img = await islandImage(src, CERT_WIDTHS, CERT_SIZES);
      // The no-JS href of every "상장 보기" link: one WebP, never upscaled.
      const full = await getImage({ src, width: Math.min(FULL_WIDTH, sourceSize(src).width), format: 'webp' });
      return {
        id: award.id,
        src: img.src,
        srcSet: img.srcSet,
        sizes: img.sizes,
        width: img.width,
        height: img.height,
        alt: award.certificate.alt[lang],
        caption: `${award.name[lang]} · ${award.contest[lang]}`,
        fullSrc: full.src,
      };
    },
  };
}

export const certificates = createCertificateLookup(
  import.meta.glob<ImageMetadata>('../assets/certificates/*.webp', { eager: true, import: 'default' }),
);

export function buildCertificate(award: AwardData, lang: Lang): Promise<Certificate | null> {
  return certificates.build(award, lang);
}
