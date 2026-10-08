// Draws the KBO project's Figure 1 source (scripts/assets/sources/kbo-slump-attendance.png): a dumbbell chart of each
// team's average attendance at slump home games and at other home games, with the Welch t-test p-value. The values are
// the team report's Table 1 (2018–2019 and 2022–2024 seasons combined), the source of every team number on the page
// (src/content/projects/*/kbo-attendance.md). One image serves both page languages, so its text is English; the page
// caption and the "표로 보기" table carry the Korean. Colours: one hue, two shades (slump dark, other light), checked
// with the dataviz palette validator; the light shade sits below 3:1 on the surface, so the chart keeps direct labels
// and the page keeps the table view. Run with Playwright's Chromium:
//   node scripts/assets/kbo-slump-chart.mjs && node scripts/import-assets.mjs --only=kbo-slump-attendance
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const OUT = join(ROOT, 'scripts/assets/sources/kbo-slump-attendance.png');
const FONT = join(ROOT, 'node_modules/@fontsource-variable/open-sans/files/open-sans-latin-wght-normal.woff2');

/** [team, slump mean, other mean, Welch p], ordered from the largest drop to the largest rise. */
export const ROWS = [
  ['KIA', 10862.3, 13056.3, '0.0016'],
  ['Lotte', 11195.6, 12790.4, '0.0073'],
  ['Hanwha', 9421.4, 10959.3, '0.0039'],
  ['Doosan', 11438.6, 12827.2, '0.2200'],
  ['KT', 8234.9, 9342.8, '0.0834'],
  ['Samsung', 10954.7, 12001.2, '0.1327'],
  ['LG', 12778.8, 13780.6, '0.2957'],
  ['NC', 8755.3, 8965.6, '0.7191'],
  ['Kiwoom', 9574.7, 8023.5, '0.0298'],
  ['SSG', 15123.2, 12362.6, '0.0213'],
];

const W = 1040;
const ROW_H = 46;
const TOP = 96;
const LEFT = 150;
const RIGHT = 220;
const BOTTOM = 64;
const X0 = 7000;
const X1 = 16000;
const C = { surface: '#fcfcfb', ink: '#0b0b0b', ink2: '#52514e', grid: '#e4e3df', other: '#6aa3e6', slump: '#1d4f99', link: '#b9b8b2' };

/** @param {number} v */
const x = (v) => LEFT + ((v - X0) / (X1 - X0)) * (W - LEFT - RIGHT);
/** @param {number} v */
const fmt = (v) => Math.round(v).toLocaleString('en-US');

export function svg() {
  const h = TOP + ROWS.length * ROW_H + BOTTOM;
  const plotBottom = TOP + ROWS.length * ROW_H;
  let body = '';
  for (let t = 8000; t <= 16000; t += 2000) {
    body += `<line x1="${x(t)}" x2="${x(t)}" y1="${TOP - 14}" y2="${plotBottom - 10}" stroke="${C.grid}" stroke-width="1"/>`;
    body += `<text x="${x(t)}" y="${plotBottom + 14}" text-anchor="middle" font-size="15" fill="${C.ink2}">${fmt(t)}</text>`;
  }
  body += `<text x="${(LEFT + W - RIGHT) / 2}" y="${plotBottom + 44}" text-anchor="middle" font-size="15" fill="${C.ink2}">Average home attendance per game</text>`;
  body += `<text x="${W - RIGHT + 28}" y="${TOP - 26}" font-size="14" fill="${C.ink2}" font-weight="600">Welch t-test</text>`;
  ROWS.forEach(([team, slump, other, p], i) => {
    const y = TOP + i * ROW_H + 12;
    const sig = Number(p) < 0.05;
    body += `<text x="${LEFT - 22}" y="${y + 5}" text-anchor="end" font-size="17" font-weight="${sig ? 700 : 500}" fill="${C.ink}">${team}</text>`;
    body += `<line x1="${x(Number(slump))}" x2="${x(Number(other))}" y1="${y}" y2="${y}" stroke="${C.link}" stroke-width="2"/>`;
    body += `<circle cx="${x(Number(other))}" cy="${y}" r="7.5" fill="${C.other}" stroke="${C.surface}" stroke-width="2"/>`;
    body += `<circle cx="${x(Number(slump))}" cy="${y}" r="7.5" fill="${C.slump}" stroke="${C.surface}" stroke-width="2"/>`;
    body += `<text x="${W - RIGHT + 28}" y="${y + 5}" font-size="15" font-weight="${sig ? 700 : 400}" fill="${sig ? C.ink : C.ink2}">p = ${p}${sig ? ' *' : ''}</text>`;
  });
  // the legend names both dots (identity is never colour alone)
  const ly = 40;
  body += `<circle cx="${LEFT}" cy="${ly}" r="7.5" fill="${C.slump}"/><text x="${LEFT + 16}" y="${ly + 5}" font-size="16" fill="${C.ink}">Slump home games</text>`;
  body += `<circle cx="${LEFT + 220}" cy="${ly}" r="7.5" fill="${C.other}"/><text x="${LEFT + 236}" y="${ly + 5}" font-size="16" fill="${C.ink}">Other home games</text>`;
  body += `<text x="${LEFT + 430}" y="${ly + 5}" font-size="14" fill="${C.ink2}">* p &lt; 0.05 · 2018–19, 2022–24 seasons</text>`;
  return { width: W, height: h, markup: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${h}" viewBox="0 0 ${W} ${h}">${body}</svg>` };
}

async function main() {
  const { width, height, markup } = svg();
  // the font is inlined: a page made with setContent cannot load file:// subresources
  const font = `data:font/woff2;base64,${(await readFile(FONT)).toString('base64')}`;
  const html = `<!doctype html><meta charset="utf-8"><style>@font-face{font-family:OS;src:url(${font}) format('woff2');font-weight:300 800}
html,body{margin:0;background:${C.surface}}svg{display:block;font-family:OS,sans-serif}</style>${markup}`;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
    await page.setContent(html);
    await page.evaluate(() => document.fonts.ready);
    const png = await page.screenshot({ type: 'png' });
    await mkdir(dirname(OUT), { recursive: true });
    await writeFile(OUT, png);
    console.log(`ok   ${OUT} (${width * 2}x${height * 2})`);
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
