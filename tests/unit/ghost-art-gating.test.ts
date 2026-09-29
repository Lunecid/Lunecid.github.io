// §1.8 (characterArt): the ghost art of site-v1 6d729ec is character art. The game version shows it; the general and
// neutral pages never render it or carry its rules. The shared credits page keeps the CC BY-NC 3.0 adaptation notice
// (tests/content/legal.test.ts gates it on the asset).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');
function astroFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? astroFiles(`${dir}/${e.name}`) : e.name.endsWith('.astro') ? [`${dir}/${e.name}`] : []);
}
/** The four placements of 6d729ec: host file → side. */
const HOSTS: Readonly<Record<string, 'left' | 'right'>> = {
  'src/components/home/HelloProfile.astro': 'right',
  'src/views/ResearchView.astro': 'left',
  'src/components/records/RecordsHead.astro': 'right',
  'src/components/github/GitHubSection.astro': 'left',
};

describe('ghost art is gated by characterArt (§1.8)', () => {
  it('each host renders <GhostArt> once, only behind the characterArt gate of its variant', () => {
    for (const [file, side] of Object.entries(HOSTS)) {
      const text = read(file);
      expect(text.match(/<GhostArt\b/g) ?? [], file).toHaveLength(1);
      expect(text, file).toContain(`{getVariant(variant).modules.includes('characterArt') && <GhostArt side="${side}" />}`);
    }
  });

  it('no other Astro file renders <GhostArt>', () => {
    expect(astroFiles('src').filter((f) => !(f in HOSTS) && read(f).includes('<GhostArt'))).toEqual([]);
  });

  it('the views pass their variant to the three shared hosts', () => {
    expect(read('src/views/HomeView.astro')).toMatch(/<HelloProfile\s+lang=\{lang\}\s+variant=\{variant\}/);
    expect(read('src/views/RecordsView.astro')).toMatch(/<RecordsHead\s+lang=\{lang\}\s+variant=\{variant\}/);
    expect(read('src/views/ProjectsView.astro')).toMatch(/<GitHubSection\s+lang=\{lang\}\s+variant=\{variant\}/);
  });

  it('GhostArt ships its rules only with its element: an inline <style>, no scoped block, no define:vars', () => {
    const text = read('src/components/hud/GhostArt.astro');
    const styles = [...text.matchAll(/<style\b[^>]*>/g)].map((m) => m[0]);
    expect(styles).toEqual(['<style is:inline>']);
    expect(text).not.toContain('define:vars');
    expect(text).toContain('@media (min-width: 1600px)');
  });
});
