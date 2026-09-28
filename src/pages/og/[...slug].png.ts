import type { APIRoute, GetStaticPaths } from 'astro';
import { renderOgPng, type OgInput } from '../../lib/og';
import { getOgPages } from '../../lib/og-pages';

// Static endpoint: one dist/og/<ogSlug>.png per route (e.g. og/en/projects/kickick-park.png).
export const getStaticPaths = (async () => {
  const pages = await getOgPages();
  return Object.entries(pages).map(([slug, og]) => ({ params: { slug }, props: { og } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ props }) => {
  const png = await renderOgPng((props as { og: OgInput }).og);
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
};
