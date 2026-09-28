import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MEDIA } from '../../src/config';
import { SFX_NAMES } from '../../src/types';
import { goatcounterSelfHosted, publicFileExists, soundAvailability } from '../../src/lib/public-assets';

let root = '';

function touch(relPath: string): void {
  const file = join(root, 'public', relPath.replace(/^\/+/, ''));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, 'x');
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'public-assets-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('public-assets', () => {
  it('publicFileExists finds favicon.svg and rejects a missing file', () => {
    expect(publicFileExists('favicon.svg')).toBe(true);
    expect(publicFileExists('/favicon.svg')).toBe(true);
    expect(publicFileExists('audio/does-not-exist.mp3')).toBe(false);
    expect(publicFileExists('favicon.svg', root)).toBe(false);
  });

  it('soundAvailability requires all four SFX', () => {
    expect(soundAvailability(root)).toEqual({ bgm: false, sfx: false });
    touch(MEDIA.bgm);
    expect(soundAvailability(root)).toEqual({ bgm: true, sfx: false });
    for (const name of SFX_NAMES.slice(0, 3)) touch(`${MEDIA.sfxDir}${name}.mp3`);
    expect(soundAvailability(root).sfx).toBe(false);
    touch(`${MEDIA.sfxDir}${SFX_NAMES[3]}.mp3`);
    expect(soundAvailability(root)).toEqual({ bgm: true, sfx: true });
  });

  it('goatcounterSelfHosted reflects public/js/count.v5.js', () => {
    expect(goatcounterSelfHosted(root)).toBe(false);
    touch(MEDIA.goatcounterSelfHosted);
    expect(goatcounterSelfHosted(root)).toBe(true);
  });
});
