// Task 3: the committed src/assets/** files and the sharp pipeline that makes them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const STAGING = process.env.ASSET_STAGING ?? 'C:/Users/todtj/PycharmProjects/Portpolio/.superpowers/assets';
const LOL_ROOT = process.env.LOL_ROOT ?? 'C:/Users/todtj/PycharmProjects/LOL_teamfight';
const SCRIPT = '../../scripts/import-assets.mjs';

/**
 * The owner's evidence screenshots are byte copies, not outputs of this pipeline (no JOBS entry; original width and ICC
 * profile kept). tests/unit/game-records.test.ts pins the folder's file list and each file's sha256;
 * tests/ops/image-metadata.test.mjs still checks them for EXIF, XMP and IPTC.
 */
const BYTE_COPIES = 'src/assets/game-records/';

/**
 * The character-card crops are outputs of scripts/assets/account-cards.mjs, not of this pipeline (no JOBS entry;
 * 256×280 WebP at q80 from their own sources). tests/ops/account-cards.test.mjs pins the folder's file list, each card's
 * size, format, absence of EXIF/XMP/IPTC/ICC and sha256 (sources.json), and re-derives them byte for byte;
 * tests/ops/image-metadata.test.mjs still checks them for EXIF, XMP and IPTC.
 */
const CARD_CROPS = 'src/assets/account-cards/';

/**
 * The Riot showcase art (src/assets/characters/showcase-<n>.png) is a byte copy of its download (Ezreal's JPEG only
 * re-encoded as PNG, pixel for pixel), not an output of this pipeline (no JOBS entry). tests/unit/showcase-art.test.ts
 * pins the files, their size, the absence of EXIF/XMP/IPTC/ICC and their sha256 against src/assets/characters/sources.json.
 */
const SHOWCASE_COPIES = /^src\/assets\/characters\/showcase-\d+\.png$/;

function assetFiles() {
  const dir = join(ROOT, 'src/assets');
  return existsSync(dir)
    ? readdirSync(dir, { recursive: true }).map(String).filter((f) => /\.(webp|png|jpe?g|avif)$/i.test(f)).map((f) => `src/assets/${f.replace(/\\/g, '/')}`).filter((f) => !f.startsWith(BYTE_COPIES) && !f.startsWith(CARD_CROPS) && !SHOWCASE_COPIES.test(f)).sort()
    : [];
}

test('importing the module performs no fetch and writes no file', async () => {
  const before = assetFiles();
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = () => {
    calls += 1;
    throw new Error('fetch must not run on import');
  };
  try {
    const mod = await import(SCRIPT);
    assert.ok(Array.isArray(mod.JOBS));
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(calls, 0);
  assert.deepEqual(assetFiles(), before);
});

test('JOBS cover exactly the file map outputs', async () => {
  const { JOBS } = await import(SCRIPT);
  const outs = JOBS.map((j) => j.out);
  assert.equal(new Set(outs).size, outs.length, 'duplicate outputs');
  assert.equal(new Set(JOBS.map((j) => j.id)).size, JOBS.length, 'duplicate ids');
  assert.deepEqual(outs.filter((o) => o.startsWith('src/assets/projects/')).sort(), [
    'src/assets/projects/kbo-attendance/slump-attendance.webp',
    'src/assets/projects/kickick-park/dong-ranking.webp',
    'src/assets/projects/kickick-park/parking-stand-detection.webp',
    'src/assets/projects/kickick-park/segmentation-v5.webp',
    'src/assets/projects/kickick-park/selected-dongs.webp',
    'src/assets/projects/school-zone-blindspots/false-positive-areas.webp',
    'src/assets/projects/school-zone-blindspots/gupo-existing-zone.webp',
    'src/assets/projects/school-zone-blindspots/risk-heatmap.webp',
    'src/assets/projects/school-zone-blindspots/spatial-cv-blocks.webp',
    'src/assets/projects/school-zone-blindspots/yeonsan-unprotected.webp',
    'src/assets/projects/youth-startup-location/cluster-zscore-heatmap.webp',
  ]);
  assert.deepEqual(outs.filter((o) => o.startsWith('src/assets/research/')).sort(), [
    'src/assets/research/cog-2026/kill-gap-kde.webp',
    'src/assets/research/cog-2026/label-horizon.webp',
  ]);
  assert.deepEqual(outs.filter((o) => /certificates|photo|characters|ghost/.test(o)).sort(), [
    'src/assets/certificates/busan-mayor-award.webp',
    'src/assets/certificates/cds-encouragement-award.webp',
    'src/assets/certificates/multicampus-grand-award.webp',
    'src/assets/characters/eula.png',
    'src/assets/characters/mona.png',
    'src/assets/characters/remielle.png',
    'src/assets/ghost/miku-v6.webp',
    'src/assets/photo/photo-id.webp',
  ]);
  for (const j of JOBS) {
    assert.equal(
      j.optional === true,
      j.out.startsWith('src/assets/characters/') || j.out.startsWith('src/assets/ghost/'),
      `${j.id}: only character art and ghost art are optional`,
    );
    assert.equal(j.format, j.out.endsWith('.png') ? 'png' : 'webp', `${j.id}: format matches the extension`);
    assert.equal(j.flatten === true, j.out.startsWith('src/assets/research/'), `${j.id}: only research figures are flattened`);
  }
});

test("root: 'repo' sources are committed under scripts/assets/sources/ (figures this repo draws)", async () => {
  const { JOBS } = await import(SCRIPT);
  const repoJobs = JOBS.filter((j) => j.root === 'repo');
  assert.deepEqual(repoJobs.map((j) => j.id), ['kbo-slump-attendance']);
  for (const j of repoJobs) {
    assert.ok(j.src.startsWith('scripts/assets/sources/'), `${j.id}: ${j.src}`);
    assert.ok(existsSync(join(ROOT, j.src)), `${j.src} missing: run node scripts/assets/kbo-slump-chart.mjs`);
  }
});

test('every non-optional output exists', async () => {
  const { JOBS } = await import(SCRIPT);
  for (const j of JOBS.filter((job) => !job.optional)) assert.ok(existsSync(join(ROOT, j.out)), `${j.out} missing: run npm run assets`);
});

test('src/assets holds only JOBS outputs', async () => {
  const { JOBS } = await import(SCRIPT);
  const known = new Set(JOBS.map((j) => j.out));
  assert.deepEqual(assetFiles().filter((f) => !known.has(f)), []);
});

test('WebP outputs are WebP and at most 1600px wide', async () => {
  const webps = assetFiles().filter((f) => f.endsWith('.webp'));
  assert.ok(webps.length >= 17, `expected 17 WebP files, found ${webps.length}`); // fix round 1: the PCA scatter is gone
  for (const f of webps) {
    const m = await sharp(join(ROOT, f)).metadata();
    assert.equal(m.format, 'webp', f);
    assert.ok(m.width <= 1600, `${f} is ${m.width}px wide`);
  }
});

test('outputs carry no EXIF, XMP, IPTC or ICC', async () => {
  for (const f of assetFiles()) {
    const m = await sharp(join(ROOT, f)).metadata();
    const blocks = ['exif', 'xmp', 'iptc', 'icc'].filter((k) => m[k] !== undefined);
    assert.deepEqual(blocks, [], `${f} carries ${blocks.join('+')}`);
  }
});

test('the ID photo is a 3:4 portrait cropped inside the source edges (P2-22) and certificates keep their A4 shape', async () => {
  const photo = await sharp(join(ROOT, 'src/assets/photo/photo-id.webp')).metadata();
  // the 360×480 source cropped 3px inward (its 1px dark edge lines are gone); no upscaling
  assert.equal(`${photo.width}x${photo.height}`, '354x472');
  const { data, info } = await sharp(join(ROOT, 'src/assets/photo/photo-id.webp')).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const lum = (x, y) => { const i = (y * info.width + x) * info.channels; return 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]; };
  const mean = (pts) => pts.reduce((a, [x, y]) => a + lum(x, y), 0) / pts.length;
  const row = (y) => Array.from({ length: info.width }, (_, x) => [x, y]);
  const col = (x) => Array.from({ length: info.height }, (_, y) => [x, y]);
  // no dark edge line: the outermost row/columns are as light as the ones just inside (the old line was ~110 darker)
  assert.ok(Math.abs(mean(row(0)) - mean(row(2))) < 25, `top edge ${mean(row(0))} vs ${mean(row(2))}`);
  assert.ok(Math.abs(mean(col(0)) - mean(col(2))) < 25, `left edge ${mean(col(0))} vs ${mean(col(2))}`);
  assert.ok(Math.abs(mean(col(info.width - 1)) - mean(col(info.width - 3))) < 25, 'right edge');
  for (const id of ['busan-mayor-award', 'cds-encouragement-award', 'multicampus-grand-award']) {
    const m = await sharp(join(ROOT, `src/assets/certificates/${id}.webp`)).metadata();
    assert.equal(m.width, 1600, id);
    assert.ok(Math.abs(m.height / m.width - Math.SQRT2) < 0.01, `${id} is ${m.width}x${m.height}`);
  }
});

test('blank DX extracts are never referenced by JOBS', async () => {
  const { JOBS } = await import(SCRIPT);
  const srcs = JOBS.map((j) => j.src);
  for (const blank of ['figures/dx/p08_0.png', 'figures/dx/p10_1.png', 'figures/dx/p10_3.png', 'figures/dx/p10_5.png', 'figures/dx/p11_1.png']) {
    assert.ok(!srcs.includes(blank), blank);
  }
  assert.deepEqual(srcs.filter((s) => /nc-|lol_figs_sheet|avatar-/.test(s)), []);
});

test('character outputs, when present, are PNG with an alpha channel', async () => {
  for (const f of assetFiles().filter((file) => file.startsWith('src/assets/characters/'))) {
    const m = await sharp(join(ROOT, f)).metadata();
    assert.equal(m.format, 'png', f);
    assert.equal(m.hasAlpha, true, f);
    assert.ok(m.width <= 1600, f);
  }
});

test('runJobs keeps alpha for character art, caps the width and skips a missing optional source', async () => {
  const { runJobs } = await import(SCRIPT);
  const stage = await mkdtemp(join(tmpdir(), 'sb-stage-'));
  const out = await mkdtemp(join(tmpdir(), 'sb-out-'));
  try {
    await mkdir(join(stage, 'characters'), { recursive: true });
    await sharp({ create: { width: 2000, height: 1000, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0.5 } } })
      .png()
      .withMetadata({ exif: { IFD0: { Copyright: 'test' } } })
      .toFile(join(stage, 'characters/eula.png'));
    const results = await runJobs({ root: stage, lolRoot: stage, outDir: out, only: ['character-eula', 'character-mona'] });
    assert.deepEqual(results.map((r) => [r.id, r.width, r.height, Boolean(r.skipped)]), [
      ['character-eula', 1600, 800, false],
      ['character-mona', 0, 0, true],
    ]);
    const m = await sharp(join(out, 'src/assets/characters/eula.png')).metadata();
    assert.equal(m.hasAlpha, true);
    assert.equal(m.exif, undefined);
    await assert.rejects(runJobs({ root: stage, lolRoot: stage, outDir: out, only: ['photo-id'] }), /photo-id: source missing/);
  } finally {
    await rm(stage, { recursive: true, force: true });
    await rm(out, { recursive: true, force: true });
  }
});

test('ghost-miku output is greyscale WebP with alpha (height option via a temp outDir)', async () => {
  const committed = join(ROOT, 'src/assets/ghost/miku-v6.webp');
  if (!existsSync(committed)) {
    // optional asset: nothing to assert when the owner has not imported it
    return;
  }
  const m = await sharp(committed).metadata();
  assert.equal(m.format, 'webp');
  assert.equal(m.hasAlpha, true);
  assert.equal(m.height, 1400);
  assert.ok(m.width <= 1600);
  assert.equal(m.exif, undefined);
  assert.equal(m.xmp, undefined);
  // WebP lossless-of-grey is not guaranteed: decode may differ by 1–2 per channel after YUV. Require near-grey.
  const { data, info } = await sharp(committed).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let checked = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i + 3] === 0) continue;
    assert.ok(Math.abs(data[i] - data[i + 1]) <= 2, `R≈G at sample ${checked}`);
    assert.ok(Math.abs(data[i + 1] - data[i + 2]) <= 2, `G≈B at sample ${checked}`);
    checked += 1;
    if (checked >= 40) break;
  }
  assert.ok(checked >= 40, `expected opaque greyscale samples, got ${checked}`);

  // height + greyscale options: convert a small coloured source into a temp outDir only
  const { runJobs } = await import(SCRIPT);
  const stage = await mkdtemp(join(tmpdir(), 'sb-ghost-'));
  const out = await mkdtemp(join(tmpdir(), 'sb-ghost-out-'));
  await mkdir(join(stage, 'characters'), { recursive: true });
  await sharp({
    create: { width: 300, height: 490, channels: 4, background: { r: 200, g: 40, b: 180, alpha: 0.8 } },
  })
    .webp()
    .toFile(join(stage, 'characters/miku-v6.webp'));
  const results = await runJobs({ root: stage, lolRoot: stage, outDir: out, only: ['ghost-miku'] });
  assert.equal(results[0]?.height, 490);
  const sample = join(out, 'src/assets/ghost/miku-v6.webp');
  const raw = await sharp(sample).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.ok(raw.data[3] > 0);
  assert.ok(Math.abs(raw.data[0] - raw.data[1]) <= 2);
  assert.ok(Math.abs(raw.data[1] - raw.data[2]) <= 2);
  // leave temp dirs for the OS; Windows often locks sharp's last WebP handle
});

test('re-running into a temp outDir gives the committed dimensions', async (t) => {
  if (!existsSync(STAGING) || !existsSync(LOL_ROOT)) {
    t.skip('staging root or LOL_ROOT absent on this machine (e.g. CI)');
    return;
  }
  const { runJobs } = await import(SCRIPT);
  const out = await mkdtemp(join(tmpdir(), 'sb-rerun-'));
  try {
    const results = await runJobs({ root: STAGING, lolRoot: LOL_ROOT, outDir: out });
    for (const r of results.filter((res) => !res.skipped)) {
      assert.ok(!relative(out, r.out).startsWith('..'), `${r.id} wrote outside the temp outDir`);
      const committed = join(ROOT, relative(out, r.out));
      const m = await sharp(committed).metadata();
      assert.deepEqual([r.width, r.height], [m.width, m.height], r.id);
    }
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});
