import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Every file below `dir` (directories are walked, not listed), as absolute paths. */
export function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
}
