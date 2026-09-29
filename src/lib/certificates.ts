// src/lib/certificates.ts — server-only. Certificate image = src/assets/certificates/<award-id>.webp
// (redacted copies, spec §8). Missing image → null, so callers render no "상장 보기" trigger.
import type { ImageMetadata } from 'astro';
import { getImage } from 'astro:assets';
import type { CertificateId } from '../types';
import type { AwardData } from '../content/schemas';
import type { Lang } from '../i18n/ui';
import { sourceSize } from './images';

export interface Certificate {
  id: CertificateId;
  src: string;
  srcSet: string;
  sizes: string;
  width: number;
  height: number;
  alt: string;
  caption: string;
  fullSrc: string;
}

export const CERT_WIDTHS = [640, 960, 1280];
export const CERT_SIZES = '(orientation: portrait) 88vw, 58vh';
const FULL_WIDTH = 1280;

/** Srcset ladder only — no islandImage fallback `src` (that emitted an unreferenced source-width WebP). */
async function certSrcSet(src: ImageMetadata): Promise<string> {
  const sourceW = sourceSize(src).width;
  const ladder = CERT_WIDTHS.filter((w) => w <= sourceW);
  const widths = ladder.length > 0 ? ladder : [sourceW];
  const parts = await Promise.all(
    widths.map(async (w) => {
      const img = await getImage({ src, width: w, format: 'webp', quality: 80 });
      return `${img.src} ${img.attributes.width}w`;
    }),
  );
  return parts.join(', ');
}

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
      // The no-JS href of every "상장 보기" link: one WebP, never upscaled.
      const full = await getImage({ src, width: Math.min(FULL_WIDTH, sourceSize(src).width), format: 'webp' });
      const srcSet = await certSrcSet(src);
      return {
        id: award.id,
        // Same URL as fullSrc (the trigger href); no separate unused variant.
        src: full.src,
        srcSet,
        sizes: CERT_SIZES,
        // Intrinsic size of the linked full WebP (not the source file), so the viewer frame matches (N3).
        width: full.attributes.width,
        height: full.attributes.height,
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
