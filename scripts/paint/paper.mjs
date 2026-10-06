// The chooser printout's art paper (owner-approved prototype chooser-v6.4, notes owner-assets): white cotton-rag paper
// with a slow formation (cloudy fibre density) and a fine tooth. Both were feTurbulence SVGs painted as background
// images of the sheet; the browser rasterised them on the main thread, and a slow device finished painting them after
// the opening's toss had brought the sheet into view, so Chrome reported the paper as a late LCP element. Now:
//   - the formation is rendered once here, in headless Chromium, flattened onto the paper colour and shipped as an
//     opaque WebP tile at 1x only (it is low-frequency, so a 2x screen's upscale loses nothing); it is the sheet's own
//     background (src/styles/paint/paper-formation.webp, a file of its own: astro.config keeps paint/ out of inlining);
//   - the tooth stays the prototype's SVG, used as a mask over a flat layer of its own colour: a mask is never an LCP
//     candidate, and its tile is small.
//
//   node scripts/paint/paper.mjs --write     render and encode the formation tile
//   node scripts/paint/paper.mjs --check     exit 1 when the committed tile no longer matches a fresh render
//   node scripts/paint/paper.mjs --fidelity  mean channel difference of the shipped paper against the prototype's live
//                                            SVG paper, over one full period (1260 px), at device scale 1 and 2
// Rendering needs Chromium: Playwright's, CHROME_PATH=<binary> or PW_CHANNEL=chrome.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { TILE_DIR, meanDiff, uri } from './paint.mjs';

/** The paper colour (tokens.css --pr-paper). */
export const PAPER = '#FBFAF6';
/** The tooth's flat colour: the SVG's colour matrix output (.12, .12, .12) as the renderer quantises it. */
export const TOOTH_INK = '#1F1F1F';
/** Tile sizes in CSS px: the formation tile, the tooth tile. */
export const PAPER_TILE_PX = 420;
export const TOOTH_PX = 180;
/** WebP quality of the formation tile (mean error against the render ≈ 0.46 / 255; 702 bytes). */
const QUALITY = 80;
/** --check: mean channel difference (0–255) allowed between the committed tile and a fresh render encoded the same way. */
export const PAPER_TOLERANCE = 0.75;

/** The prototype's formation: slow fibre density, warm grey at ≤ 4.8 % alpha. */
export const FORMATION_SVG = `<svg xmlns='http://www.w3.org/2000/svg' width='420' height='420'><filter id='f' filterUnits='userSpaceOnUse' x='0' y='0' width='420' height='420'><feTurbulence type='fractalNoise' baseFrequency='.016' numOctaves='3' seed='9' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .2 0 0 0 0 .19 0 0 0 0 .17 0 0 0 .08 -.032'/></filter><rect width='420' height='420' filter='url(#f)'/></svg>`;
/** The prototype's tooth: fine grain, grey at ≤ 6.2 % alpha (shipped as a mask: its alpha over TOOTH_INK). */
export const TOOTH_SVG = `<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='g' filterUnits='userSpaceOnUse' x='0' y='0' width='180' height='180'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' seed='4' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .12 0 0 0 0 .12 0 0 0 0 .12 0 0 0 .1 -.038'/></filter><rect width='180' height='180' filter='url(#g)'/></svg>`;

/** The committed formation tile. */
export const paperTileFile = () => join(TILE_DIR, 'paper-formation.webp');

async function launch() {
  const { chromium } = await import('@playwright/test');
  return chromium.launch({
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}),
    args: ['--force-color-profile=srgb'],
  });
}

/** One element of `w`×`h` CSS px with `style`, as Chromium paints it at `scale`: PNG. */
async function paint(browser, scale, w, h, style, extra = '') {
  const page = await browser.newPage({ deviceScaleFactor: scale, viewport: { width: w, height: h } });
  try {
    await page.setContent(`<!doctype html><style>html,body{margin:0}div{position:relative;width:${w}px;height:${h}px;${style}}${extra}</style><div></div>`);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    return await page.locator('div').screenshot({ animations: 'disabled' });
  } finally {
    await page.close();
  }
}

/** The formation over the paper colour at 1x, as the sheet painted it: PNG. */
export async function renderFormation() {
  const browser = await launch();
  try {
    return await paint(browser, 1, PAPER_TILE_PX, PAPER_TILE_PX, `background:${uri(FORMATION_SVG)},${PAPER}`);
  } finally {
    await browser.close();
  }
}

async function encode(png) {
  const { default: sharp } = await import('sharp');
  return sharp(png).removeAlpha().webp({ quality: QUALITY, effort: 6, smartSubsample: true }).toBuffer();
}

/** The committed tile against a fresh render encoded the same way: { mean, raw }. */
export async function checkPaper() {
  const png = await renderFormation();
  let committed;
  try {
    committed = readFileSync(paperTileFile());
  } catch {
    return { mean: Infinity, raw: Infinity };
  }
  return { mean: await meanDiff(committed, await encode(png)), raw: await meanDiff(committed, png) };
}

/**
 * The shipped paper (the formation tile as the sheet's background, the tooth as a mask over TOOTH_INK) against the
 * prototype's (both SVGs as background images), over one full period of both tiles (1260 px): mean channel difference
 * at device scale 1 and 2. @returns {Promise<Record<string, number>>}
 */
export async function fidelity() {
  const R = 1260;
  const tile = `url(data:image/webp;base64,${readFileSync(paperTileFile()).toString('base64')})`;
  const browser = await launch();
  const out = {};
  try {
    for (const scale of [1, 2]) {
      const live = await paint(browser, scale, R, R, `background-color:${PAPER};background-image:${uri(TOOTH_SVG)},${uri(FORMATION_SVG)};background-size:${TOOTH_PX}px ${TOOTH_PX}px,${PAPER_TILE_PX}px ${PAPER_TILE_PX}px`);
      const shipped = await paint(
        browser, scale, R, R,
        `background:${tile} 0 0/${PAPER_TILE_PX}px ${PAPER_TILE_PX}px,${PAPER}`,
        `div::after{content:"";position:absolute;inset:0;background-color:${TOOTH_INK};-webkit-mask:${uri(TOOTH_SVG)} 0 0/${TOOTH_PX}px ${TOOTH_PX}px;mask:${uri(TOOTH_SVG)} 0 0/${TOOTH_PX}px ${TOOTH_PX}px}`,
      );
      out[`@${scale}x`] = await meanDiff(live, shipped);
    }
  } finally {
    await browser.close();
  }
  return out;
}

async function main() {
  const mode = process.argv[2];
  if (mode === '--write') {
    writeFileSync(paperTileFile(), await encode(await renderFormation()));
    console.log(`wrote ${paperTileFile()}`);
  } else if (mode === '--check') {
    const { mean, raw } = await checkPaper();
    console.log(`paper-formation: mean ${mean.toFixed(3)} (vs render ${raw.toFixed(3)})`);
    if (!(mean <= PAPER_TOLERANCE)) process.exit(1);
  } else if (mode === '--fidelity') {
    for (const [k, v] of Object.entries(await fidelity())) console.log(`paper ${k}: mean channel difference ${v.toFixed(3)} / 255`);
  } else {
    console.error('usage: node scripts/paint/paper.mjs --write | --check | --fidelity');
    process.exit(2);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
