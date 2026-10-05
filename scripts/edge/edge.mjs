// The game version's edge frame strokes (palette v3/v4, owner-approved 2026-10-05): a Node port of the prototype's
// brush.py + brush-raster.cjs (owner-assets/game-palette/v4/). Each stroke is a bundle of straight bristle polylines on
// an angular spine (mitred offsets, chisel-cut ends, ragged tips, dry lanes; no SVG filter), drawn as SVG in memory and
// pre-rendered to WebP with sharp at 1× and 2× (src/styles/edge/, hashed into /_astro/ by the build), so no page ever
// rasterises a complex path or a filter on the main thread. The SVGs are never shipped.
//
//   node scripts/edge/edge.mjs --write    render src/styles/edge/edge-{l,tr,br,s}.webp and -2x.webp
//   node scripts/edge/edge.mjs --check    exit 1 when a committed file no longer matches a fresh render (EDGE_TOLERANCE)
//   node scripts/edge/edge.mjs --svg <dir> write the four source SVGs (to compare with the prototype's edge/*.svg)
//
// Python's random.Random is the DS port (scripts/paint/paint.mjs pyRandom), so the strokes are the prototype's, number
// for number. Number formatting follows Python's ('.1f' and repr).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pyRandom } from '../paint/paint.mjs';

export const EDGE_DIR = fileURLToPath(new URL('../../src/styles/edge/', import.meta.url));
/** --check: mean channel difference (RGBA, 0–255) allowed between a committed file and a fresh render. */
export const EDGE_TOLERANCE = 0.75;
/** The yellow of the strokes: tokens.css --gp-y (a unit test pins the two together). */
export const EDGE_YELLOW = '#FFE600';
export const EDGE_FILES = /** @type {const} */ (['l', 'tr', 'br', 's']);
export const edgeFile = (/** @type {string} */ key, /** @type {1 | 2} */ scale) => join(EDGE_DIR, `edge-${key}${scale === 2 ? '-2x' : ''}.webp`);

/** @typedef {[number, number]} Pt */
const hypot = Math.hypot;
/** Python's f'{x:.1f}' (round half to even on the binary value; toFixed differs only on exact ties). */
const f1 = (/** @type {number} */ x) => {
  // an exact tie needs x = m/4 with x·2 not whole (0.25, 0.75, …): round half to even like Python
  if (Number.isInteger(x * 4) && !Number.isInteger(x * 2)) {
    const down = Math.floor(x * 10);
    return ((down % 2 === 0 ? down : down + 1) / 10).toFixed(1);
  }
  return Object.is(x, -0) ? '-0.0' : x.toFixed(1);
};
/** Python's repr of a float (shortest round-trip, '1.0' for integers). */
const repr = (/** @type {number} */ x) => (Number.isInteger(x) ? x.toFixed(1) : String(x));

/** Polyline offset by d with mitred joins (keeps the angular, cut-paper corners). @param {Pt[]} spine */
function offset(spine, d) {
  const n = spine.length;
  /** @type {Pt[]} */
  const pts = [];
  for (let i = 0; i < n; i++) {
    let ax, ay, bx, by;
    if (i === 0) { ax = spine[1][0] - spine[0][0]; ay = spine[1][1] - spine[0][1]; bx = ax; by = ay; }
    else if (i === n - 1) { ax = spine[i][0] - spine[i - 1][0]; ay = spine[i][1] - spine[i - 1][1]; bx = ax; by = ay; }
    else {
      ax = spine[i][0] - spine[i - 1][0]; ay = spine[i][1] - spine[i - 1][1];
      bx = spine[i + 1][0] - spine[i][0]; by = spine[i + 1][1] - spine[i][1];
    }
    const la = hypot(ax, ay), lb = hypot(bx, by);
    const n1 = [-ay / la, ax / la], n2 = [-by / lb, bx / lb];
    let mx = n1[0] + n2[0], my = n1[1] + n2[1];
    const lm = hypot(mx, my);
    mx /= lm; my /= lm;
    const k = 1 / Math.max(0.35, mx * n1[0] + my * n1[1]);
    pts.push([spine[i][0] + mx * d * k, spine[i][1] + my * d * k]);
  }
  return pts;
}

/** Point at arc-length fraction t of polyline pl, and the total length. @param {Pt[]} pl @returns {[Pt, number]} */
function sample(pl, t) {
  const seg = pl.slice(0, -1).map((p, i) => hypot(pl[i + 1][0] - p[0], pl[i + 1][1] - p[1]));
  const L = seg.reduce((a, b) => a + b, 0);
  let s = Math.max(0, Math.min(1, t)) * L;
  for (let i = 0; i < seg.length; i++) {
    const l = seg[i];
    if (s <= l || i === seg.length - 1) {
      const f = l ? s / l : 0;
      return [[pl[i][0] + (pl[i + 1][0] - pl[i][0]) * f, pl[i][1] + (pl[i + 1][1] - pl[i][1]) * f], L];
    }
    s -= l;
  }
  throw new Error('empty polyline');
}

/** Sub-polyline of pl between fractions t0..t1, including interior corners. @param {Pt[]} pl */
function clip(t0, t1, pl) {
  const seg = pl.slice(0, -1).map((p, i) => hypot(pl[i + 1][0] - p[0], pl[i + 1][1] - p[1]));
  const L = seg.reduce((a, b) => a + b, 0);
  let acc = 0;
  const out = [sample(pl, t0)[0]];
  for (let i = 0; i < seg.length - 1; i++) {
    acc += seg[i];
    if (t0 * L < acc && acc < t1 * L) out.push(pl[i + 1]);
  }
  out.push(sample(pl, t1)[0]);
  return out;
}

/**
 * One brush stroke: [[strokeWidth, opacity, polylines[]], …] (brush.py stroke(), same parameters and defaults).
 * @param {Pt[]} spine @param {number} width @param {number} seed
 */
export function stroke(spine, width, seed, {
  density = 1.0, dry = 0.55, dry_k = 1.0, chisel = 0.1, head_rag = 0.03, tail_rag = 0.18, lean = 0.0, wobble = 0.45,
  mask = 0, widths = [1.2, 1.6, 2.2, 2.8], starve = 0.14, streaks = 1.0,
} = {}) {
  const r = pyRandom(seed);
  const nb = Math.max(3, Math.trunc(width * density * 1.1));
  const starved = new Set();
  for (let i = 0; i < nb; i++) if (r.random() < starve) starved.add(i);
  const bands = [];
  for (let b = 0; b < Math.trunc((width * streaks) / 9); b++) {
    const c = r.uniform(-0.46, mask > 0 ? 0.36 : 0.46) * width;
    bands.push([c, r.uniform(0.45, 1.1), r.uniform(0.12, 0.7)]);
  }
  /** @type {[number, number, Pt[][]][]} */
  const out = [];
  for (let i = 0; i < nb; i++) {
    let u = (i + r.random() * 0.9) / nb - 0.5;
    let edge = Math.abs(u) * 2;
    if (mask && u * mask > 0) edge *= 0.15;
    if (mask && i === (mask > 0 ? nb - 1 : 0)) u = 0.5 * mask;
    const sw = r.choice(widths) * (edge < 0.6 ? 1.1 : 0.8);
    const op = r.choice([0.78, 0.9, 1.0, 1.0]);
    const tail = r.random() ** 2.2;
    const t0 = Math.max(0, lean * (u + 0.5) + r.random() * head_rag * (0.4 + edge));
    let t1 = Math.min(1, 1 - chisel * (0.5 - u) - tail_rag * (1 - tail) * (0.35 + edge) + 0.04 * tail);
    for (const [c, hw, ts] of bands) if (Math.abs(u * width - c) < hw + sw / 2) t1 = Math.min(t1, ts + r.random() * 0.04);
    const base = offset(spine, u * width);
    const L = sample(base, 0)[1];
    /** @type {Pt[]} */
    const pl = [];
    for (let k = 0; k < base.length - 1; k++) {
      const a = base[k], b = base[k + 1];
      const l = hypot(b[0] - a[0], b[1] - a[1]);
      const m = Math.max(1, Math.trunc(l / 10));
      const nx = -(b[1] - a[1]) / l, ny = (b[0] - a[0]) / l;
      for (let j = 0; j < m; j++) {
        const f = j / m;
        const w = 0 < j ? (r.random() - 0.5) * 2 * wobble * (0.5 + edge) : 0;
        pl.push([a[0] + (b[0] - a[0]) * f + nx * w, a[1] + (b[1] - a[1]) * f + ny * w]);
      }
    }
    pl.push(base[base.length - 1]);
    /** @type {[number, number][]} */
    const segs = [];
    let t = t0, on = true, start = t0, gapEnd = 0;
    const step = 2.5 / L;
    const lane = starved.has(i) ? (3.0 * starve) / 0.14 : 1.0;
    while (t < t1) {
      const dryness = Math.max(0, (t - dry) / Math.max(1e-6, 1 - dry));
      const pGap = (0.006 + 0.045 * edge ** 2 + 0.15 * dryness ** 1.4 * (0.6 + edge)) * dry_k * lane;
      if (on && r.random() < pGap) {
        if (t - start > 1.5 / L) segs.push([start, t]);
        on = false;
        const a = r.uniform(1.5, 6);
        const b = 22 * dryness * r.random();
        const c = lane > 1 ? 14 * r.random() : 0;
        gapEnd = t + (a + b + c) / L;
      } else if (!on && t >= gapEnd) {
        on = true;
        start = t;
      }
      t += step;
    }
    if (on && t1 - start > 1.5 / L) segs.push([start, t1]);
    out.push([sw, op, segs.map(([a, b]) => clip(a, b, pl))]);
  }
  return out;
}

/** A small hard-edged paint chip (parallelogram). */
const chip = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ w, /** @type {number} */ h, skew = 6) =>
  `M${f1(x + skew)} ${f1(y)}h${f1(w)}l${f1(-skew)} ${f1(h)}h${f1(-w)}z`;

/** @param {number} w @param {number} h @param {ReturnType<typeof stroke>[]} strokes @param {string[]} chips */
function svg(w, h, strokes, chips = [], color = EDGE_YELLOW) {
  /** @type {Map<string, { sw: number; op: number; polys: Pt[][] }>} */
  const buckets = new Map();
  for (const st of strokes) for (const [sw, op, polys] of st) {
    const key = `${sw}|${op}`;
    if (!buckets.has(key)) buckets.set(key, { sw, op, polys: [] });
    buckets.get(key).polys.push(...polys);
  }
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    `<g fill="none" stroke="${color}" stroke-linecap="butt" stroke-linejoin="miter">`];
  for (const { sw, op, polys } of [...buckets.values()].sort((a, b) => a.sw - b.sw || a.op - b.op)) {
    const dd = polys.filter((pl) => pl.length > 1).map((pl) => `M${pl.map(([x, y]) => `${f1(x)} ${f1(y)}`).join('L')}`).join('');
    parts.push(`<path stroke-width="${repr(sw)}"${op < 1 ? ` stroke-opacity="${repr(op)}"` : ''} d="${dd}"/>`);
  }
  parts.push('</g>');
  if (chips.length) parts.push(`<path fill="${color}" d="${chips.join('')}"/>`);
  parts.push('</svg>');
  return parts.join('');
}

/** The four source SVGs (brush.py build()). @returns {Record<typeof EDGE_FILES[number], string>} */
export function edgeSvgs() {
  return {
    // bottom-left (96 × 460): a broad stroke up the left edge (taped inner edge, dry outer edge, chisel top), a diagonal
    // sweep across the corner, one thin streak and two chips; paint stays within x ≤ 84
    l: svg(96, 460, [
      stroke([[-30, 500], [22, 404], [22, 118]], 50, 11, { dry: 0.6, dry_k: 0.85, chisel: 0.3, tail_rag: 0.14, mask: 1, wobble: 0.3, widths: [1.6, 2.2, 2.8, 3.4] }),
      stroke([[-16, 452], [82, 400]], 22, 17, { dry: 0.68, chisel: 0.3, tail_rag: 0.14, mask: -1, streaks: 0.8, wobble: 0.2, widths: [1.8, 2.4, 3.0] }),
      stroke([[66, 470], [66, 352]], 6, 23, { dry: 0.3, chisel: 0.0, tail_rag: 0.35, dry_k: 1.2, mask: 1 }),
    ], [chip(26, 96, 24, 5, 5), chip(54, 86, 9, 5, 5)]),
    // top-right (80 × 120): in off the right edge, angled down-left; paint within 68 px of the edge
    tr: svg(80, 120, [
      stroke([[96, 12], [44, 32], [12, 38]], 20, 41, { dry: 0.45, chisel: 0.22, tail_rag: 0.22, mask: -1, streaks: 1.4, widths: [1.4, 1.9, 2.5] }),
      stroke([[96, 58], [40, 70]], 5, 43, { dry: 0.3, chisel: 0.1, tail_rag: 0.35 }),
    ], [chip(48, 92, 22, 5, 5)]),
    // bottom-right edge (18 × 220): a short vertical stroke under the circuit cluster
    br: svg(18, 220, [
      stroke([[26, 236], [9, 210], [9, 60]], 14, 61, { dry: 0.5, chisel: 0.35, tail_rag: 0.25, mask: -1, wobble: 0.25, widths: [1.2, 1.7, 2.2] }),
    ]),
    // phone / tablet sliver (8 × 200): paint stays within x ≤ 6.5
    s: svg(8, 200, [
      stroke([[-4, 218], [3.2, 200], [3.2, 36]], 6.4, 51, { dry: 0.55, chisel: 0.3, tail_rag: 0.25, density: 1.8, mask: 1, wobble: 0.15, widths: [1.0, 1.4, 1.8] }),
    ], [chip(0.5, 22, 4, 4, 2)]),
  };
}

/** WebP of one SVG at a scale (brush-raster.cjs settings). */
export async function render(/** @type {string} */ source, /** @type {1 | 2} */ scale) {
  const { default: sharp } = await import('sharp');
  return sharp(Buffer.from(source), { density: 72 * scale })
    .webp({ quality: 82, alphaQuality: 70, effort: 6, smartSubsample: true })
    .toBuffer();
}

/** Mean absolute channel difference (RGBA, 0–255) of two same-size images. */
export async function meanDiff(/** @type {Buffer} */ a, /** @type {Buffer} */ b) {
  const { default: sharp } = await import('sharp');
  const [x, y] = await Promise.all([a, b].map((img) => sharp(img).ensureAlpha().raw().toBuffer({ resolveWithObject: true })));
  if (x.info.width !== y.info.width || x.info.height !== y.info.height) return Infinity;
  let sum = 0;
  for (let i = 0; i < x.data.length; i++) sum += Math.abs(x.data[i] - y.data[i]);
  return sum / x.data.length;
}

/** Committed files against a fresh render: [{ file, mean }]. */
export async function checkEdges() {
  const rows = [];
  const svgs = edgeSvgs();
  for (const key of EDGE_FILES) for (const scale of /** @type {const} */ ([1, 2])) {
    let committed;
    try {
      committed = readFileSync(edgeFile(key, scale));
    } catch {
      rows.push({ file: edgeFile(key, scale), mean: Infinity });
      continue;
    }
    rows.push({ file: edgeFile(key, scale), mean: await meanDiff(committed, await render(svgs[key], scale)) });
  }
  return rows;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === '--write') {
    mkdirSync(EDGE_DIR, { recursive: true });
    const svgs = edgeSvgs();
    for (const key of EDGE_FILES) for (const scale of /** @type {const} */ ([1, 2])) {
      const buf = await render(svgs[key], scale);
      writeFileSync(edgeFile(key, scale), buf);
      console.log(`wrote ${edgeFile(key, scale)} (${buf.length} B)`);
    }
  } else if (cmd === '--check') {
    const rows = await checkEdges();
    for (const r of rows) console.log(`${r.file}  mean ${r.mean.toFixed(3)}`);
    if (rows.some((r) => !(r.mean <= EDGE_TOLERANCE))) {
      console.error(`edge.mjs --check: a file differs from a fresh render by more than ${EDGE_TOLERANCE}`);
      process.exit(1);
    }
  } else if (cmd === '--svg' && arg) {
    mkdirSync(arg, { recursive: true });
    for (const [key, source] of Object.entries(edgeSvgs())) writeFileSync(join(arg, `edge-${key}.svg`), source);
  } else {
    console.error('usage: node scripts/edge/edge.mjs --write | --check | --svg <dir>');
    process.exit(2);
  }
}
