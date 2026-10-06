// The chooser printout's paint and paper textures are the approved prototype's values (owner-assets
// chooser-v6.4/chooser-opening.v64.html, sha256 of each `url("data:…")` value). Named change (late-LCP fix): the brush
// tiles are the general version's pre-rendered WebP tiles (scripts/paint/paint.mjs renders the same SVGs; the prototype's
// hashes now pin those sources), the same files and declarations as paint.css; the paper's formation is its own tile
// (scripts/paint/paper.mjs, tests/unit/chooser-paper.test.ts). The tooth, the stamp ink and the frayed outline stay
// SVG, used as masks.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { textureDecls, tileSvg, uri } from '../../scripts/paint/paint.mjs';

const FILE = 'src/styles/chooser.css';
const source = readFileSync(new URL(`../../${FILE}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const sha = (s: string): string => createHash('sha256').update(s).digest('hex');
const valueOf = (name: string): string | undefined => new RegExp(`\\n\\s*${name}: (url\\("data:[^\\n]*"\\));`).exec(source)?.[1];

/** Brush tiles and the frayed outline (paint generator output). */
const PAINT: Record<string, string> = {
  '--tex-rh': 'c3133ec2a0990982d5366cece9d2dcb8492278a41f6b1334bbbc75566e46438b',
  '--tex-yh': '8a7bed1b69dbb72c4b61374505124280abfa9c086ee0f8c035d73158b07578c0',
  '--tex-yv': '66182985d713bc012e9ba8e0831d7ed9e30dd9567678878f628fea445c938068',
  '--tex-bv': '0180f85e00af00636b664e3c82890e01899e0a4f4cbbedddadf562b2bcf3cac0',
};
/** Named change (MO-41, chooser.css budget): the frayed outline's path is re-encoded without trailing zeros and with
 *  implicit linetos ("M2.4 2.4 6 2.5 …"), the same geometry: pinned by the hash of its number sequence (the generator's
 *  bytes hashed to 80878d25…). */
const RAGBOX_GEOMETRY = '64b2f7f25fefb6731ed70f664060814a48abd3e3e0960c38ffd25ffdde950eab';
const geometry = (value: string): string => value.replace(/d='[^']*'/, (d) => `d='${(d.match(/\d+(?:\.\d+)?/g) ?? []).map((n) => String(Number(n)).includes('.') ? String(Number(n)) : `${Number(n)}.0`).join(',')}'`);
/** The art paper's tooth and the rubber stamp's ink (the prototype's own; the formation's source is pinned in
 *  chooser-paper.test.ts). */
const PAPER: Record<string, string> = {
  '--tooth': 'ec91e6165d9d8b8e987aca0225669f0c9430d4f83382191b09720673dd93080b',
  '--ink-tex': '0f9aad029f3e8cdba2f09e0281a7a8b0f623fd7a636a036780f4fdc4c94fe671',
  '--ink-worn': 'f753991a5ed17d875bb2aed84d3620e8a2b58ae7d3b01c9254d17a673c32c662',
};

describe('chooser printout textures (MO-23, v6.4)', () => {
  it('the brush tiles are the general version’s WebP tiles (the prototype’s SVGs, rendered by paint.mjs); the frayed outline byte-matches', () => {
    const decls = textureDecls();
    for (const [name, hash] of Object.entries(PAINT)) {
      const key = name.slice('--tex-'.length) as Parameters<typeof tileSvg>[0];
      expect(sha(uri(tileSvg(key))), `${name} source`).toBe(hash);
      const decl = decls.find((d) => d.trimStart().startsWith(`${name}:`));
      expect(decl, `${name} in paint.mjs`).toBeDefined();
      expect(source, `${name} in ${FILE}: the same declaration as paint.css`).toContain(`\n${decl}\n`);
    }
    const rag = valueOf('--ragbox');
    expect(rag).toBeDefined();
    expect(rag).toMatch(/d='M[\d. ]+Z'/);
    expect(sha(geometry(rag!)), '--ragbox geometry').toBe(RAGBOX_GEOMETRY);
    expect(source).toContain('the general version’s pre-rendered tiles (scripts/paint/paint.mjs)');
  });

  it('the paper tooth and stamp ink byte-match the prototype; only the paint the printout uses is named; no SVG noise is an image', () => {
    for (const [name, hash] of Object.entries(PAPER)) expect(sha(valueOf(name) ?? ''), name).toBe(hash);
    for (const unused of ['--tex-rv', '--tex-bh', '--formation']) expect(source, unused).not.toContain(`${unused}:`);
    // every url() is an inline data: SVG (a mask: the tooth, the stamp ink, the outline) or one of the paint tiles
    expect(source.replace(/url\("data:image\/svg\+xml,[^"]*"\)/g, '').replace(/url\(#[\w-]+\)/g, '').replace(/url\("\.\/paint\/(paint-(rh|yh|yv|bv)(-2x)?|paper-formation)\.webp"\)/g, '')).not.toMatch(/url\(/);
  });
});
