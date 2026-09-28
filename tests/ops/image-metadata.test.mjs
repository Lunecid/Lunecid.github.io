// Every raster image that can reach visitors carries no EXIF / XMP / IPTC block (spec §8 photos, §10).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { glob } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import exifr from 'exifr';

const ROOTS = ['src/assets', 'public', 'dist'];
const PATTERN = '**/*.{jpg,jpeg,png,webp,avif,tif,tiff,heic}';

async function metadataBlocks(file) {
  const meta = await sharp(file).metadata();
  return ['exif', 'xmp', 'iptc'].filter((key) => meta[key]?.length);
}

async function scan(roots) {
  const files = [];
  const offenders = [];
  for (const root of roots.filter((r) => existsSync(r))) {
    for await (const rel of glob(PATTERN, { cwd: root })) files.push(join(root, rel));
  }
  for (const file of files) {
    const blocks = await metadataBlocks(file);
    if (blocks.length === 0) continue;
    const gps = await exifr.gps(file).catch(() => undefined);
    offenders.push(`${file}: ${blocks.join('+')}${gps ? ' (GPS!)' : ''}`);
  }
  return { files, offenders };
}

test('images in src/assets, public and dist carry no EXIF/XMP/IPTC', async () => {
  const { files, offenders } = await scan(ROOTS);
  assert.ok(files.length > 0, 'no images found: run npm run build first');
  assert.deepEqual(offenders, [], offenders.join('\n'));
  console.log(`checked ${files.length} images in ${ROOTS.filter((r) => existsSync(r)).join(', ')}`);
});

test('the check flags an image that carries EXIF', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'exif-probe-'));
  try {
    await sharp({ create: { width: 4, height: 4, channels: 3, background: '#000000' } })
      .jpeg()
      .withExif({ IFD0: { Make: 'probe' } })
      .toFile(join(dir, 'probe.jpg'));
    const { files, offenders } = await scan([dir]);
    assert.equal(files.length, 1);
    assert.equal(offenders.length, 1);
    assert.match(offenders[0], /probe\.jpg: exif/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
