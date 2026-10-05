// src/lib/waveform.ts — the game exit's oscilloscope traces (MO-38, chooser v6.10/v6.11), computed at build time. Two
// paths over a 1000 × 100 box (centre line y 50): a slow sine (2.2 cycles over the box) and a faster square pulse
// (4.8 cycles) built from its odd harmonics 3…11 with Lanczos sigma factors, so it rings a little instead of combing.
// Each path starts one period left of the box: the trace travels right by one period while it plays (a transform),
// with no gap at its left end. The envelope and the amplitude growth are CSS (a static mask and a scaleY).

export const WAVE = { width: 1000, height: 100, amplitude: 40, sineCycles: 2.2, squareCycles: 4.8 } as const;

const r1 = (v: number) => Math.round(v * 10) / 10;

/** Square pulse (normalised so the plateau sits at ±1) with Lanczos-smoothed odd harmonics. */
function squareAt(th: number): number {
  let s = Math.sin(th);
  for (let n = 3; n <= 11; n += 2) {
    const z = (Math.PI * n) / 13;
    s += (Math.sin(n * th) / n) * (Math.sin(z) / z);
  }
  return s; // (4/π)·s is the classic series; its plateau is π/4·(4/π) = 1 at amplitude 1
}

function trace(cycles: number, step: number, f: (th: number) => number, scale: number): string {
  const period = WAVE.width / cycles;
  const pts: string[] = [];
  for (let x = -Math.ceil(period / step) * step; x < WAVE.width + step; x += step) {
    const th = (2 * Math.PI * x) / period;
    pts.push(`${r1(x)} ${r1(WAVE.height / 2 - WAVE.amplitude * scale * f(th))}`);
  }
  return `M${pts.join(' ')}`;
}

/** SVG path data of the two traces and their periods (box units). Deterministic. */
export function wavePaths(): { sine: string; square: string; sinePeriod: number; squarePeriod: number } {
  return {
    sine: trace(WAVE.sineCycles, 12, Math.sin, 1),
    square: trace(WAVE.squareCycles, 8, squareAt, 1),
    sinePeriod: WAVE.width / WAVE.sineCycles,
    squarePeriod: WAVE.width / WAVE.squareCycles,
  };
}

/** The stroke widths (px) of the trace's layers: glow, halo, line, core. */
export const WAVE_STROKES = [12, 5, 2, 1] as const;

/**
 * The traces as CSS mask images (the chooser sheet carries them, so they stay out of the page's first flight): one
 * inline SVG per trace and stroke width, its viewBox starting at the path's run-in, the stroke kept at its width in
 * px however the layer is stretched (non-scaling-stroke). `box` is the layer's left offset and width as fractions of
 * the trace (left < 0: the run-in), `travel` how far it moves, as a fraction of its own width (one period).
 */
export function waveMasks(): { name: 's' | 'q'; box: { left: number; width: number }; travel: number; urls: string[] }[] {
  const w = wavePaths();
  return (
    [
      ['s', w.sine, w.sinePeriod],
      ['q', w.square, w.squarePeriod],
    ] as const
  ).map(([name, d, period]) => {
    const start = Number(/^M(-?[\d.]+)/.exec(d)![1]);
    const width = WAVE.width - start;
    const urls = WAVE_STROKES.map(
      (sw) =>
        `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='${start} 0 ${width} ${WAVE.height}' preserveAspectRatio='none'%3E%3Cpath d='${d}' fill='none' stroke='black' stroke-width='${sw}' stroke-linejoin='round' vector-effect='non-scaling-stroke'/%3E%3C/svg%3E")`,
    );
    return { name, box: { left: start / WAVE.width, width: width / WAVE.width }, travel: period / width, urls };
  });
}
