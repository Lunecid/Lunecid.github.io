// Raster site icons built from public/favicon.svg at build time (final fix 2 item 21), for what does not render SVG
// icons: iOS "Add to Home Screen" (apple-touch-icon, which otherwise falls back to a page screenshot) and link-preview
// crawlers and older browsers that probe /favicon.ico (a 404 page on GitHub Pages until now).
// Server/build only: reads files, runs harfbuzz (subset-font) and resvg.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import subsetFont from 'subset-font';

const require = createRequire(import.meta.url);

/** The vector mark, read from the file the pages link as the SVG icon (the build and the tests run in the repo root). */
function faviconSvg(): string {
  return readFileSync(join(process.cwd(), 'public', 'favicon.svg'), 'utf8');
}

let fontFile: Promise<string> | null = null;
/**
 * The mark's "SB" is set in JetBrains Mono Bold. resvg reads fonts only from files, so the installed variable font is
 * pinned to weight 700 and cut to the two letters (a TrueType file in the OS temp folder, named by its content hash).
 * No system font is involved, so every machine and CI draws the same pixels.
 */
function markFont(): Promise<string> {
  fontFile ??= (async () => {
    const source = readFileSync(require.resolve('@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2'));
    const ttf = await subsetFont(source, 'SB', { targetFormat: 'truetype', variationAxes: { wght: 700 } });
    const path = join(tmpdir(), `sb-favicon-${createHash('sha256').update(ttf).digest('hex').slice(0, 16)}.ttf`);
    if (!existsSync(path)) writeFileSync(path, ttf);
    return path;
  })();
  return fontFile;
}

/**
 * The mark as a PNG of `size` px. `square: true` fills the whole square (the apple-touch-icon: iOS draws its own
 * rounded mask, and transparent corners would show as black); otherwise the SVG's own rounded corners stay transparent.
 */
export async function faviconPng(size: number, { square = false }: { square?: boolean } = {}): Promise<Buffer> {
  const svg = square ? faviconSvg().replace(/\srx="[^"]*"/, '') : faviconSvg();
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
    font: { fontFiles: [await markFont()], loadSystemFonts: false, defaultFontFamily: 'JetBrains Mono' },
  });
  return resvg.render().asPng();
}

/** A .ico file holding the given PNGs (PNG-in-ICO, read by every browser since IE Vista-era), smallest first. */
export function icoFromPngs(images: { size: number; png: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  const entries: Buffer[] = [];
  let offset = 6 + 16 * images.length;
  for (const { size, png } of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 = 256)
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
    entry.writeUInt8(0, 2); // no palette
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    entries.push(entry);
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
}
