import type { APIRoute } from 'astro';
import { faviconPng, icoFromPngs } from '../lib/favicon';

// Static endpoint: dist/favicon.ico, the [SB] mark at 16 and 32 px (final fix 2 item 21).
export const GET: APIRoute = async () => {
  const ico = icoFromPngs([
    { size: 16, png: await faviconPng(16) },
    { size: 32, png: await faviconPng(32) },
  ]);
  return new Response(new Uint8Array(ico), { headers: { 'Content-Type': 'image/x-icon' } });
};
