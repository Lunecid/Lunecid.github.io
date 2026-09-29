import type { APIRoute, GetStaticPaths } from 'astro';
import { renderOgPng, type OgInput } from '../../lib/og';
import { getOgPages } from '../../lib/og-pages';

// Static endpoint: one dist/og/<ogSlug>.png per route (e.g. og/en/projects/kickick-park.png).
export const getStaticPaths = (async () => {
  // A-21: the no-art build (SB_NO_ART=1 → dist-no-art, e2e layout checks only, never deployed) skips the OG cards;
  // the deployed build always renders one card per route.
  if (process.env.SB_NO_ART === '1') return [];
  const pages = await getOgPages();
  return Object.entries(pages).map(([slug, og]) => ({ params: { slug }, props: { og } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ props }) => {
  const png = await renderOgPng((props as { og: OgInput }).og);
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
};
