import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from './helpers';

const DAY_MS = 86_400_000;
const TARGETS = [
  { route: '/game/projects/', id: 'github' },
  { route: '/stats/', id: 'daily' },
] as const;

/** data-fetched-at / data-max-age-days of the element with this id in the built page; null when the section is not built. */
function stamp(route: string, id: string): { fetchedAt: string; maxAgeDays: number } | null {
  const file = join(process.cwd(), 'dist', route, 'index.html');
  if (!existsSync(file)) return null;
  const tag = new RegExp(`<[a-z][a-z0-9-]*\\b[^>]*\\bid="${id}"[^>]*>`).exec(readFileSync(file, 'utf8'))?.[0];
  if (!tag) return null;
  return {
    fetchedAt: /\bdata-fetched-at="([^"]*)"/.exec(tag)?.[1] ?? '',
    maxAgeDays: Number(/\bdata-max-age-days="(\d+)"/.exec(tag)?.[1] ?? Number.NaN),
  };
}

test.describe('stale generated data is hidden client-side', () => {
  for (const { route, id } of TARGETS) {
    test(`${route}#${id}`, async ({ context }) => {
      const found = stamp(route, id);
      test.skip(found === null, `#${id} is not in this build (no usable generated data)`);
      const fetched = Date.parse(found!.fetchedAt);
      expect(Number.isNaN(fetched), `#${id} carries data-fetched-at`).toBe(false);
      expect(found!.maxAgeDays, `#${id} carries data-max-age-days`).toBeGreaterThan(0);

      const fresh = await context.newPage();
      await fresh.clock.install({ time: fetched + 60 * 60 * 1000 });
      await fresh.goto(route, { waitUntil: 'networkidle' });
      await expect(fresh.locator(`#${id}`), 'one hour after fetchedAt the section is shown').toBeVisible();

      const stale = await context.newPage();
      await stale.clock.install({ time: fetched + (found!.maxAgeDays + 1) * DAY_MS });
      await stale.goto(route, { waitUntil: 'networkidle' });
      await expect(stale.locator(`#${id}`), 'past maxAgeDays the section is hidden').toBeHidden();
    });
  }
});
