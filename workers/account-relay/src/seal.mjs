// Sealing for the relay Worker (spec §5.7.2 "키 파생"): SEAL_KEY (base64 of 32 bytes) → HKDF-SHA256 → two AES-GCM
// keys, info 'handle' (tickets and handles) and info 'cookie' (the login cookie). A sealed value is
// base64url(iv(12) ‖ AES-GCM(JSON)). Web Crypto only, so the same code runs in Workers and in Node's tests.

const te = new TextEncoder();
const B64URL = /^[A-Za-z0-9_-]*$/;
const SEALED_MAX = 8192;

export function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return out;
}

export function b64url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Throws on anything that is not unpadded base64url. */
export function fromB64url(text) {
  if (typeof text !== 'string' || text.length > SEALED_MAX || !B64URL.test(text)) throw new Error('format');
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** base64url of `bytes` random bytes (state, PKCE verifier: 32 bytes → 43 characters). */
export function randomToken(bytes) {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function deriveKeys(sealKeyB64) {
  const raw = Uint8Array.from(atob(sealKeyB64), (c) => c.charCodeAt(0));
  if (raw.length !== 32) throw new Error('config');
  const base = await crypto.subtle.importKey('raw', raw, 'HKDF', false, ['deriveKey']);
  const derive = (info) => crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: te.encode(info) }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  return { handle: await derive('handle'), cookie: await derive('cookie') };
}

export async function seal(key, payload) { // base64url(iv(12) ‖ AES-GCM(JSON))
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(JSON.stringify(payload))));
  return b64url(concat(iv, ct));
}

export async function unseal(key, token) { // null on any failure (format, tag, JSON)
  try { const b = fromB64url(token); if (b.length < 29) return null; return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.slice(0, 12) }, key, b.slice(12)))); } catch { return null; }
}

/** Constant-time string comparison (the time depends only on the longer length). */
export function ctEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = te.encode(a);
  const y = te.encode(b);
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
