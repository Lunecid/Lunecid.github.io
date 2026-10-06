// /case/<id>/{ko,en}.json — the case-study sheet of a publication with an overlay, per language (src/lib/case/sheet.ts):
// the dialog markup with every number resolved, the chart words and the runtime strings. Static: built once, fetched
// by the overlay on intent (connect-src 'self'), never linked from a page.
import type { APIRoute, GetStaticPaths } from 'astro';
import { getImage } from 'astro:assets';
import fig1 from '../../../assets/research/cog-2026/label-horizon.webp';
import kde from '../../../assets/research/cog-2026/kill-gap-kde.webp';
import { CASE_IDS } from '../../../lib/publications';
import { caseSheetData, type CaseImage } from '../../../lib/case/sheet';
import { getFactSource, getPublications } from '../../../lib/portfolio';
import { sourceSize } from '../../../lib/images';
import { languages, type Lang } from '../../../i18n/ui';

export const getStaticPaths = (async () => {
  const entries = (await getPublications()).filter((e) => (CASE_IDS as readonly string[]).includes(e.id));
  return entries.flatMap((entry) => (Object.keys(languages) as Lang[]).map((lang) => ({ params: { slug: entry.id, lang }, props: { entry, lang } })));
}) satisfies GetStaticPaths;

/** A WebP ladder of a figure (the sheet column is at most 560 px wide; 2× for dense screens). */
async function image(src: ImageMetadata): Promise<CaseImage> {
  // sourceSize: reading .width on the import's proxy would publish the full-size original that nothing references
  const { width, height } = sourceSize(src);
  const widths = [480, 800, 1120].filter((w) => w <= width);
  const built = await getImage({ src, widths, width: widths.at(-1) ?? width, format: 'webp' });
  return { src: built.src, srcset: built.srcSet.attribute, width, height };
}

export const GET: APIRoute = async ({ props }) => {
  const { entry, lang } = props as Awaited<ReturnType<typeof getStaticPaths>>[number]['props'];
  const data = caseSheetData({ lang, facts: await getFactSource(), paper: entry.data, images: { fig1: await image(fig1), kde: await image(kde) } });
  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
