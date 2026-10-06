// The Riot showcase art (owner ruling 2026-10-06): byte copies of their downloads with neutral file names, provenance
// in src/assets/characters/sources.json, and only the files characters.ts maps.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { ART_FILES, SHOWCASE_ONLY } from '../../src/lib/characters';

const DIR = join(process.cwd(), 'src/assets/characters');
interface Source {
  file: string;
  game: string;
  character: string;
  source: { kind: string; url: string; page?: string };
  sourceSha256: string;
  width: number;
  height: number;
  outputSha256: string;
}
const sources = JSON.parse(readFileSync(join(DIR, 'sources.json'), 'utf8')) as Source[];
const sha256 = (file: string) => createHash('sha256').update(readFileSync(join(DIR, file))).digest('hex');

describe('showcase art files', () => {
  it('sources.json lists exactly the showcase files characters.ts maps (lol → Ezreal, tft → Pengu)', () => {
    expect(sources.map((s) => [s.file, s.game, s.character])).toEqual([
      ['showcase-1.png', 'lol', 'Ezreal'],
      ['showcase-2.png', 'tft', 'Pengu (Featherknight)'],
    ]);
    expect(ART_FILES).toEqual({ ezreal: 'showcase-1', pengu: 'showcase-2' });
    expect([...SHOWCASE_ONLY]).toEqual(['ezreal', 'pengu']);
    expect(readdirSync(DIR).filter((f) => f.startsWith('showcase-')).sort()).toEqual(['showcase-1.png', 'showcase-2.png']);
  });

  it('names stay neutral: no character or game name in a file name', () => {
    for (const f of readdirSync(DIR).filter((name) => name.endsWith('.png'))) {
      expect(f, f).not.toMatch(/ezreal|pengu|lol|league|tft|teamfight|riot|hearthstone|eternal/i);
    }
  });

  it('each file matches its recorded sha256, size and source, and carries no EXIF/XMP/IPTC/ICC', async () => {
    for (const s of sources) {
      expect(sha256(s.file), s.file).toBe(s.outputSha256);
      const m = await sharp(join(DIR, s.file)).metadata();
      expect(m.format, s.file).toBe('png');
      expect([m.width, m.height], s.file).toEqual([s.width, s.height]);
      expect(['exif', 'xmp', 'iptc', 'icc'].filter((k) => m[k as keyof typeof m] !== undefined), s.file).toEqual([]);
      expect(s.source.kind).toBe('download');
    }
    expect(sources[0].source.url).toBe('https://ddragon.leagueoflegends.com/cdn/img/champion/centered/Ezreal_0.jpg');
    expect(sources[1].source.url).toBe('https://cmsassets.rgpub.io/sanity/images/dsfx7636/news/12210015038f15148d157c5a4facdd8bd5cb5e78-1232x978.png');
    // Pengu is the download itself; Ezreal's JPEG is re-encoded as PNG (pixels unchanged, so the hashes differ)
    expect(sources[1].outputSha256).toBe(sources[1].sourceSha256);
    expect((await sharp(join(DIR, 'showcase-2.png')).metadata()).hasAlpha).toBe(true);
  });
});
