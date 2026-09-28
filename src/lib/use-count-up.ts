import { useEffect, useState } from 'react';

/**
 * rAF count-up from 0 to `to` with a cubic ease-out (1 − (1 − p)³).
 * With `reduce` the final value is returned immediately (spec §4: counters show final values).
 */
export function useCountUp(
  to: number,
  opts: { delayMs?: number; durationMs?: number; reduce?: boolean } = {},
): number {
  const { delayMs = 0, durationMs = 800, reduce = false } = opts;
  const [value, setValue] = useState(reduce ? to : 0);

  useEffect(() => {
    if (reduce) {
      setValue(to);
      return undefined;
    }
    let raf = 0;
    let start: number | null = null;
    const step = (t: number) => {
      if (start === null) start = t;
      const p = durationMs <= 0 ? 1 : Math.min(1, Math.max(0, (t - start - delayMs) / durationMs));
      setValue(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, delayMs, durationMs, reduce]);

  return reduce ? to : value;
}
