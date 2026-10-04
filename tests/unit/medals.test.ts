import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { achievementSchema } from '../../src/content/schemas';
import { parseYamlList } from '../../src/content/yaml-loader';
import { MEDAL_EMBLEMS, MEDAL_QUESTION, MEDAL_STATES, medalState } from '../../src/lib/medals';

const defs = parseYamlList(readFileSync(join(process.cwd(), 'src/data/achievements.yaml'), 'utf8')).map((a) => achievementSchema.parse(a));

/** How many numbers one use of each path command takes (a command may repeat its arguments; z takes none). */
const ARGS: Record<string, number> = { m: 2, l: 2, t: 2, h: 1, v: 1, c: 6, s: 4, q: 4, a: 7, z: 0 };
/** "M1 2l3-4z" → [['M', 2 numbers], ['l', 2 numbers], ['z', 0 numbers]]. */
const commands = (d: string) =>
  [...d.matchAll(/([A-Za-z])([^A-Za-z]*)/g)].map(([, cmd, args]) => ({ cmd: cmd!, count: (args!.match(/-?(?:\d+\.?\d*|\.\d+)/g) ?? []).length }));

describe('medals (src/lib/medals.ts)', () => {
  it('every achievement id of achievements.yaml has exactly one emblem, plus record; no other key', () => {
    expect(Object.keys(MEDAL_EMBLEMS).sort()).toEqual([...defs.map((d) => d.id), 'record'].sort());
    // one drawing each: no two medals share an emblem
    const emblems = Object.values(MEDAL_EMBLEMS);
    expect(new Set(emblems).size).toBe(emblems.length);
    for (const [id, d] of Object.entries(MEDAL_EMBLEMS)) expect(d.trim(), id).not.toBe('');
  });

  it('emblem and question paths use SVG path commands and numbers only (no url(, no #, no letters outside commands)', () => {
    const paths: [string, string][] = [...Object.entries(MEDAL_EMBLEMS), ['question', MEDAL_QUESTION]];
    expect(paths).toHaveLength(Object.keys(MEDAL_EMBLEMS).length + 1);
    for (const [name, d] of paths) {
      expect(d, name).not.toMatch(/url\(|#/);
      expect(d, name).toMatch(/^[MmLlHhVvCcSsQqTtAaZz\d\s.,-]+$/);
      expect(d.trim(), `${name} starts with a moveto`).toMatch(/^[Mm]/);
      // well formed: every command carries whole groups of its numbers (z none)
      for (const { cmd, count } of commands(d)) {
        const n = ARGS[cmd.toLowerCase()]!;
        if (n === 0) expect(count, `${name}: ${cmd}`).toBe(0);
        else {
          expect(count, `${name}: ${cmd}`).toBeGreaterThan(0);
          expect(count % n, `${name}: ${cmd} takes groups of ${n}`).toBe(0);
        }
      }
    }
    // the checker itself rejects a broken path
    expect(commands('M1 2l3').map(({ cmd, count }) => count % ARGS[cmd.toLowerCase()]!)).toEqual([0, 1]);
  });

  it('the question mark differs from every emblem', () => {
    expect(MEDAL_QUESTION.trim()).not.toBe('');
    for (const [id, d] of Object.entries(MEDAL_EMBLEMS)) expect(d, id).not.toBe(MEDAL_QUESTION);
  });

  it('medalState: unlocked wins; otherwise hidden achievements are hidden, others locked', () => {
    expect(MEDAL_STATES).toEqual(['locked', 'unlocked', 'hidden']);
    expect(medalState({ hidden: false }, true)).toBe('unlocked');
    expect(medalState({ hidden: true }, true)).toBe('unlocked');
    expect(medalState({ hidden: true }, false)).toBe('hidden');
    expect(medalState({ hidden: false }, false)).toBe('locked');
    // on the real list (which has a hidden achievement): before any unlock exactly the hidden ones show their "?"
    expect(defs.some((d) => d.hidden)).toBe(true);
    expect(defs.filter((d) => medalState(d, false) === 'hidden')).toEqual(defs.filter((d) => d.hidden));
    for (const d of defs) {
      expect(MEDAL_STATES, d.id).toContain(medalState(d, false));
      expect(medalState(d, true), d.id).toBe('unlocked');
    }
  });
});
