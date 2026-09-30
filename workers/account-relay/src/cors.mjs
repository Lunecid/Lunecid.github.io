// Response headers for the relay Worker (spec §5.7.3, §5.7.4). CORS covers only the POST paths and only the site's
// exact origin: never '*', never the allow-credentials header. The origin-mismatch 403 is the one response of a
// CORS path without ACAO; every other response to the allowed origin (success and every error) carries it.

export const SECURITY_HEADERS = Object.freeze({
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
});

const ALLOWED_REQUEST_HEADERS = new Set(['authorization', 'content-type']);

/** Adds the three security headers to a response this Worker built (its headers are mutable). */
export function secure(res) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.headers.set(name, value);
  return res;
}

export function originAllowed(request, siteOrigin) {
  return request.headers.get('Origin') === siteOrigin;
}

/** ACAO + Vary on a real (non-preflight) response to the allowed origin. */
export function withCors(res, siteOrigin) {
  res.headers.set('Access-Control-Allow-Origin', siteOrigin);
  res.headers.set('Vary', 'Origin');
  return res;
}

/** The preflight answer, or null when the origin, the method or a requested header is outside the allowlist. */
export function preflight(request, siteOrigin) {
  if (!originAllowed(request, siteOrigin)) return null;
  if (request.headers.get('Access-Control-Request-Method') !== 'POST') return null;
  const raw = request.headers.get('Access-Control-Request-Headers');
  const names = raw === null ? [] : raw.split(',').map((s) => s.trim().toLowerCase()).filter((s) => s !== '');
  if (!names.every((name) => ALLOWED_REQUEST_HEADERS.has(name))) return null;
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': siteOrigin,
      'Access-Control-Allow-Methods': 'POST',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '600',
      Vary: 'Origin',
    },
  });
}
