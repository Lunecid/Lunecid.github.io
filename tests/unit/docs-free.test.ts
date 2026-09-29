// Prerequisite 2 (contract §0.3): docs/superpowers/ is local-only, so nothing tracked may read it.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const SELF = 'tests/unit/docs-free.test.ts';
const SCAN = ['src', 'scripts', 'tests', '.github', 'package.json', 'astro.config.mjs'];
const PATTERN = /docs\/superpowers|preflight-answers/;

function files(entry: string): string[] {
  const abs = join(ROOT, entry);
  if (!existsSync(abs)) return [];
  if (statSync(abs).isFile()) return [abs];
  return readdirSync(abs, { withFileTypes: true }).flatMap((e) => (e.name === 'node_modules' ? [] : files(join(entry, e.name))));
}

describe('docs-free (contract §0.3 prerequisite 2)', () => {
  it('no file under docs/ is tracked by git', () => {
    expect(execFileSync('git', ['ls-files', 'docs'], { encoding: 'utf8' }).trim()).toBe('');
  });

  it('no source, script, test, workflow or config file names docs/superpowers or the preflight answers', () => {
    const offenders = SCAN.flatMap(files)
      .map((abs) => relative(ROOT, abs).split(sep).join('/'))
      .filter((rel) => rel !== SELF && /\.(ts|tsx|mjs|js|json|astro|ya?ml|md)$/.test(rel))
      .filter((rel) => {
        const lines = readFileSync(join(ROOT, rel), 'utf8').split(/\r?\n/);
        return lines.some((line) => {
          if (!PATTERN.test(line)) return false;
          // Allowed: .gitignore guard, final fix 3; asserts the folder is ignored, never reads it
          if (
            rel === 'tests/unit/toolchain.test.ts' &&
            /'docs\/superpowers\/'/.test(line) &&
            line.includes("'.superpowers/'") &&
            line.includes("'.cursor-handoff/'")
          ) {
            return false;
          }
          return true;
        });
      });
    expect(offenders).toEqual([]);
  });
});
