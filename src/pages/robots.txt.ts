import type { APIRoute } from 'astro';
import { SITE } from '../config';

// Static endpoint → dist/robots.txt. /print/ routes are PDF sources only (also excluded from the sitemap).
export const GET: APIRoute = ({ site }) => {
  const sitemap = new URL('sitemap-index.xml', site ?? SITE.url);
  const body = ['User-agent: *', 'Allow: /', 'Disallow: /print/', '', `Sitemap: ${sitemap.href}`, ''].join('\n');
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
