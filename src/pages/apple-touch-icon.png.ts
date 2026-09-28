import type { APIRoute } from 'astro';
import { faviconPng } from '../lib/favicon';

// Static endpoint: dist/apple-touch-icon.png, the [SB] mark on a full, opaque 180 px square (final fix 2 item 21).
export const GET: APIRoute = async () => {
  const png = await faviconPng(180, { square: true });
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
};
