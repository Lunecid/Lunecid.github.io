// Brush-paint textures of the general version (DS-2): a Node port of the prototype's paint-tex.py (owner-approved v5,
// notes owner-assets/data-redesign/v5/). It writes src/styles/paint.css, the data-only stylesheet DataLayout imports:
// six static SVG stroke tiles (red / blue / yellow × horizontal / vertical) and the frayed outline used with
// -webkit-mask-box-image, as custom properties under :root[data-variant="data"]. No live CSS filter: each tile is
// rasterised once and repeated.
//
//   node scripts/paint/paint.mjs --write          regenerate src/styles/paint.css
//   node scripts/paint/paint.mjs --check          exit 1 when the committed file differs from what this script makes
//   node scripts/paint/paint.mjs --lab <file>     write the swatch sheet of the prototype (paint-lab.html) for a look
//
// Python's random.Random (Mersenne Twister, seeded from an int) is ported below, so the rag box path is the
// prototype's, number for number.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const PAINT_CSS = fileURLToPath(new URL('../../src/styles/paint.css', import.meta.url));

/** base = the pigment token's value (tokens.css --ed-red/--ed-blue/--ed-yellow); dark/light = the streak tints;
 *  darkCap/lightCap = their alpha caps; seeds per direction (h = horizontal strokes, v = vertical). */
export const PIGMENTS = {
  r: { base: '#CC281C', dark: [0x86, 0x10, 0x08], light: [0xff, 0xe4, 0xd8], darkCap: 0.3, lightCap: 0.075, seeds: { h: 3, v: 5 } },
  b: { base: '#1F3A93', dark: [0x0a, 0x16, 0x52], light: [0xd8, 0xe2, 0xff], darkCap: 0.32, lightCap: 0.09, seeds: { h: 8, v: 12 } },
  y: { base: '#F5C400', dark: [0xc8, 0x86, 0x00], light: [0xff, 0xf4, 0xc0], darkCap: 0.2, lightCap: 0.12, seeds: { h: 15, v: 19 } },
};

/** urllib.parse.quote(svg, safe=" =:/,.'-()") after the prototype's whitespace squeeze. @param {string} svg */
export function uri(svg) {
  const squeezed = svg.replace(/\s+/g, ' ').split('> <').join('><').trim();
  let out = '';
  for (const byte of Buffer.from(squeezed, 'utf8')) {
    const ch = String.fromCharCode(byte);
    out += /[A-Za-z0-9_.~ =:/,'()-]/.test(ch) ? ch : `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
  }
  return `url("data:image/svg+xml,${out}")`;
}

/** Python's str() of a float for the cap values (0.3 → "0.3", 0.075 → "0.075"). @param {number} v */
const py = (v) => String(v);

/**
 * One stroke tile: three fractal-noise fields (long brush bands, bristle lines, a slow uneven load) mixed, bent by a
 * low-frequency displacement (noise feTile'd so the tile repeats without a seam), then split into a deeper shade
 * (upper half of the noise) and a lighter tint (lower half) of the same pigment, each alpha-capped. Never black or
 * grey. @param {boolean} horizontal @param {number} seed @param {number[]} darkRgb @param {number[]} lightRgb
 * @param {number} dark @param {number} light
 */
export function strokes(horizontal, seed, darkRgb, lightRgb, dark, light, w = 800, h = 400) {
  const f = (/** @type {number} */ a, /** @type {number} */ b) => (horizontal ? `${a} ${b}` : `${b} ${a}`);
  if (!horizontal) [w, h] = [h, w];
  const [dr, dg, db] = darkRgb.map((c) => (c / 255).toFixed(3));
  const [lr, lg, lb] = lightRgb.map((c) => (c / 255).toFixed(3));
  const P = 40;
  const T = `x='0' y='0' width='${w}' height='${h}'`;
  return `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'>
<filter id='p' filterUnits='userSpaceOnUse' primitiveUnits='userSpaceOnUse' x='-${P}' y='-${P}' width='${w + 2 * P}' height='${h + 2 * P}' color-interpolation-filters='sRGB'>
<feTurbulence ${T} type='fractalNoise' baseFrequency='${f(0.0017, 0.045)}' numOctaves='2' seed='${seed}' stitchTiles='stitch'/>
<feTile result='a'/>
<feTurbulence ${T} type='fractalNoise' baseFrequency='${f(0.006, 0.9)}' numOctaves='2' seed='${seed + 4}' stitchTiles='stitch'/>
<feTile result='b'/>
<feTurbulence ${T} type='fractalNoise' baseFrequency='${f(0.004, 0.012)}' numOctaves='1' seed='${seed + 9}' stitchTiles='stitch'/>
<feTile result='c'/>
<feTurbulence ${T} type='fractalNoise' baseFrequency='${f(0.005, 0.02)}' numOctaves='1' seed='${seed + 2}' stitchTiles='stitch'/>
<feTile result='w'/>
<feComposite in='a' in2='b' operator='arithmetic' k2='.55' k3='.45' result='ab'/>
<feComposite in='ab' in2='c' operator='arithmetic' k2='.78' k3='.22' result='n0'/>
<feDisplacementMap in='n0' in2='w' scale='26' xChannelSelector='R' yChannelSelector='G' result='n'/>
<feColorMatrix in='n' type='matrix' values='0 0 0 0 ${dr} 0 0 0 0 ${dg} 0 0 0 0 ${db} 5 0 0 0 -2.45'/>
<feComponentTransfer result='d'><feFuncA type='table' tableValues='0 ${py(dark)}'/></feComponentTransfer>
<feColorMatrix in='n' type='matrix' values='0 0 0 0 ${lr} 0 0 0 0 ${lg} 0 0 0 0 ${lb} -5 0 0 0 2.5'/>
<feComponentTransfer result='l'><feFuncA type='table' tableValues='0 ${py(light)}'/></feComponentTransfer>
<feMerge><feMergeNode in='d'/><feMergeNode in='l'/></feMerge>
</filter>
<rect x='-${P}' y='-${P}' width='${w + 2 * P}' height='${h + 2 * P}' filter='url(#p)'/></svg>`;
}

// ── Python's random.Random(int): MT19937 seeded by init_by_array, random() = genrand_res53 ──

/** @param {number} seed a non-negative integer below 2^32 */
export function pyRandom(seed) {
  const N = 624;
  const mt = new Uint32Array(N);
  let mti = N + 1;
  const initGenrand = (/** @type {number} */ s) => {
    mt[0] = s >>> 0;
    for (mti = 1; mti < N; mti++) mt[mti] = (Math.imul(1812433253, mt[mti - 1] ^ (mt[mti - 1] >>> 30)) + mti) >>> 0;
  };
  const key = [seed >>> 0];
  initGenrand(19650218);
  let i = 1;
  let j = 0;
  for (let k = Math.max(N, key.length); k > 0; k--) {
    mt[i] = ((mt[i] ^ Math.imul(mt[i - 1] ^ (mt[i - 1] >>> 30), 1664525)) + key[j] + j) >>> 0;
    i++;
    j++;
    if (i >= N) {
      mt[0] = mt[N - 1];
      i = 1;
    }
    if (j >= key.length) j = 0;
  }
  for (let k = N - 1; k > 0; k--) {
    mt[i] = ((mt[i] ^ Math.imul(mt[i - 1] ^ (mt[i - 1] >>> 30), 1566083941)) - i) >>> 0;
    i++;
    if (i >= N) {
      mt[0] = mt[N - 1];
      i = 1;
    }
  }
  mt[0] = 0x80000000;
  mti = N;
  const genrand = () => {
    if (mti >= N) {
      for (let kk = 0; kk < N; kk++) {
        const y = (mt[kk] & 0x80000000) | (mt[(kk + 1) % N] & 0x7fffffff);
        mt[kk] = mt[(kk + 397) % N] ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0);
      }
      mti = 0;
    }
    let y = mt[mti++];
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;
    return y >>> 0;
  };
  const random = () => ((genrand() >>> 5) * 67108864 + (genrand() >>> 6)) / 9007199254740992;
  return { random, uniform: (/** @type {number} */ a, /** @type {number} */ b) => a + (b - a) * random() };
}

/**
 * The frayed outline: one S × S path for -webkit-mask-box-image (slice T, edges repeated with `round`). Each side's
 * edge wanders by a pixel or two with two short bristle notches and is periodic over the middle part (S − 2T), so
 * the repeated slices join; each corner is one point a pixel inside, so no spur sticks out.
 */
export function ragBox(seed = 31, S = 132, T = 6) {
  const M = S - 2 * T;
  const side = (/** @type {number} */ sd) => {
    const r = pyRandom(sd);
    const waves = /** @type {[number, number][]} */ ([[1, 0.4], [2, 0.3], [5, 0.22], [9, 0.15], [17, 0.1]]).map(([k, a]) => [k, r.uniform(0, 2 * Math.PI), a]);
    const notches = [0, 1].map(() => [r.uniform(0, M), r.uniform(3, 8), r.uniform(0.3, 0.8)]);
    return (/** @type {number} */ t) => {
      let v = 2.2 + waves.reduce((sum, [k, p, a]) => sum + a * Math.sin((2 * Math.PI * k * t) / M + p), 0);
      for (const [c, wd, dep] of notches) {
        const d = Math.min(Math.abs(t - c) % M, M - (Math.abs(t - c) % M));
        if (d < wd) v += dep * (1 - d / wd);
      }
      return Math.max(0.3, Math.min(T - 0.8, v));
    };
  };
  const [yt, yr, yb, yl] = [0, 1, 2, 3].map((i) => side(seed + i));
  const c = 2.4;
  const R = [];
  for (let i = T; i < S - T + 1; i += 2) R.push(i);
  /** @type {[number, number][]} */
  const pts = [[c, c]];
  for (const i of R) pts.push([i, yt((i - T) % M)]);
  pts.push([S - c, c]);
  for (const i of R) pts.push([S - yr((i - T) % M), i]);
  pts.push([S - c, S - c]);
  for (const i of [...R].reverse()) pts.push([i, S - yb((i - T) % M)]);
  pts.push([c, S - c]);
  for (const i of [...R].reverse()) pts.push([yl((i - T) % M), i]);
  const d = `M${pts.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join('L')}Z`;
  return `<svg xmlns='http://www.w3.org/2000/svg' width='${S}' height='${S}'><path d='${d}'/></svg>`;
}

/** The six stroke tiles and the rag box, as the prototype's custom properties. */
export function textureDecls() {
  const out = [];
  for (const [k, p] of Object.entries(PIGMENTS)) {
    out.push(`  --tex-${k}h: ${uri(strokes(true, p.seeds.h, p.dark, p.light, p.darkCap, p.lightCap))};`);
    out.push(`  --tex-${k}v: ${uri(strokes(false, p.seeds.v, p.dark, p.light, p.darkCap, p.lightCap))};`);
  }
  out.push(`  --ragbox: ${uri(ragBox())};`);
  return out;
}

const PIGMENT_TOKEN = { r: '--ed-red', b: '--ed-blue', y: '--ed-yellow' };

/** The paint.css text. */
export function paintCss() {
  const paint = Object.entries(PIGMENT_TOKEN).flatMap(([k, token]) => [
    `  --ed-paint-${k}h: var(--tex-${k}h), var(${token});`,
    `  --ed-paint-${k}v: var(--tex-${k}v), var(${token});`,
  ]);
  return `/* generated by scripts/paint/paint.mjs — do not edit (node scripts/paint/paint.mjs --write regenerates it).
   Brush-paint textures of the general version: data pages only (DataLayout imports this file). Each --tex-* is one
   static SVG stroke tile per pigment and direction (h / v), --ragbox the frayed outline for -webkit-mask-box-image
   (Firefox has no mask-box-image and shows straight edges). A painted field is background: var(--ed-paint-rh) etc.;
   its frayed edge is -webkit-mask-box-image: var(--ed-rag) (--ed-rag-s for marks under 20 px). */
:root[data-variant="data"] {
${[...textureDecls(), '  --ed-rag: var(--ragbox) 6 / 6px round;', '  --ed-rag-s: var(--ragbox) 6 / 3px round;', ...paint].join('\n')}
}
`;
}

// ── contrast: the analytic bound of text on a painted field ──

/** @param {string} hex */
const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
/** @param {number[]} rgb */
const luminance = (rgb) => {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** @param {number[]} a @param {number[]} b */
const ratio = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};
/** source-over in sRGB (color-interpolation-filters='sRGB'). @param {number[]} base @param {number[]} tint @param {number} alpha */
const over = (base, tint, alpha) => base.map((v, i) => v * (1 - alpha) + tint[i] * alpha);

/**
 * Contrast of `textHex` against the lightest pixel of the pigment's paint (base ⊕ light tint at its cap) and the
 * darkest (base ⊕ dark tint at its cap). @param {keyof typeof PIGMENTS} pigment @param {string} textHex
 */
export function worstContrast(pigment, textHex) {
  const p = PIGMENTS[pigment];
  const base = rgbOf(p.base);
  const text = rgbOf(textHex);
  return { atLightest: ratio(text, over(base, p.light, p.lightCap)), atDarkest: ratio(text, over(base, p.dark, p.darkCap)) };
}

/** The prototype's swatch sheet. @param {string} file */
function writeLab(file) {
  const col = { r: '#CC281C', b: '#1F3A93', y: '#F5C400' };
  const block = textureDecls().join('\n');
  const sw = ['r', 'b', 'y']
    .flatMap((c) => ['h', 'v'].map((d) => `<div class="s" style="background:var(--tex-${c}${d}),${col[/** @type {'r'} */ (c)]}"><b>${col[/** @type {'r'} */ (c)]} ${d}</b></div>`))
    .join('');
  writeFileSync(
    file,
    `<!doctype html><meta charset=utf-8><style>:root{${block}}
body{margin:0;padding:24px;background:#fff;display:grid;grid-template-columns:repeat(2,480px);gap:10px;font:900 64px/1 Arial}
.s{height:260px;color:#fff;padding:20px;-webkit-mask-box-image:var(--ragbox) 6 round} .s:nth-child(n+5){color:#141414}</style>${sw}`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  if (args[0] === '--write') {
    writeFileSync(PAINT_CSS, paintCss());
    console.log(`wrote ${PAINT_CSS}`);
  } else if (args[0] === '--check') {
    const same = readFileSync(PAINT_CSS, 'utf8') === paintCss();
    console.log(same ? 'paint.css is up to date' : 'paint.css differs from what scripts/paint/paint.mjs makes: run --write');
    process.exit(same ? 0 : 1);
  } else if (args[0] === '--lab' && args[1]) {
    writeLab(args[1]);
    console.log(`wrote ${args[1]}`);
  } else {
    console.error('usage: node scripts/paint/paint.mjs --write | --check | --lab <file>');
    process.exit(2);
  }
}
