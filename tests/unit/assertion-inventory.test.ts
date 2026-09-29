// Review Focus 5: a mass migration (P1-11, P1-12) must never lose an assertion silently. Every test file keeps at least
// the number of assertion calls recorded in tests/assertion-inventory.json. A task that removes assertions on purpose
// lowers the floor in the same diff (visible to the reviewer); UPDATE_ASSERTION_INVENTORY=1 rewrites the file.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const INVENTORY = join(ROOT, 'tests', 'assertion-inventory.json');
const TEST_FILE = /\.(test|spec)\.(ts|tsx|mjs)$/;
/** expect(…), expect.poll(…), expect.soft(…), assert(…), assert.x(…). */
const ASSERTION = /\bexpect(?:\.poll|\.soft)?\s*\(|\bassert(?:\.[a-zA-Z]+)?\s*\(/g;

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
}

export function assertionCounts(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const abs of walk(join(ROOT, 'tests')).filter((f) => TEST_FILE.test(f)).sort()) {
    const rel = relative(ROOT, abs).split(sep).join('/');
    out[rel] = (readFileSync(abs, 'utf8').match(ASSERTION) ?? []).length;
  }
  return out;
}

describe('assertion inventory (Review Focus 5)', () => {
  it('every test file keeps at least its recorded number of assertions', () => {
    const now = assertionCounts();
    if (process.env.UPDATE_ASSERTION_INVENTORY === '1' || !existsSync(INVENTORY)) {
      writeFileSync(INVENTORY, `${JSON.stringify(now, null, 2)}\n`);
    }
    const floor = JSON.parse(readFileSync(INVENTORY, 'utf8')) as Record<string, number>;
    const lost = Object.entries(floor)
      .filter(([file, n]) => (now[file] ?? 0) < n)
      .map(([file, n]) => `${file}: ${now[file] ?? 'deleted'} < floor ${n}`);
    expect(lost, 'lower the floor in tests/assertion-inventory.json only for a named, reviewed reason').toEqual([]);
  });
});
