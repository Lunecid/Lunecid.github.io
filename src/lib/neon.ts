// src/lib/neon.ts — neon flicker typing (MO-27; chooser v6.2's typing on the v6.12 timeline). During the chooser's
// opening the overlay lines and the game cover's small labels type in glyph by glyph: each glyph lights in a single
// step and most dip once and recover (opacity only, ≤ 3 cycles, steps(1, end)); the glow is the labels' static
// text-shadow, never animated. The glyph spans exist only while the opening plays: chooser.ts splits the targets when it
// starts (no bytes in the page's first flight) and puts the plain text back at sb:intro-done. Never the h1, the h2s,
// the display words, the taglines, the contents line or a CTA.

/** Glyph timing (ms). --dur-type-step and --dur-flicker (chooser.css) equal staggerMs and flickerMs. */
export const NEON = { staggerMs: 18, staggerMinMs: 10, staggerMaxMs: 30, flickerMs: 150, maxCycles: 3 } as const;

/** How long before its first glyph a line is split (ms): each line costs one short task of its own while the opening
 *  plays, instead of one long task for every line when the script starts (Total Blocking Time). */
export const NEON_LEAD_MS = 120;

/** When each window closes (ms from the opening's first frame, the chooser.css timeline): the console fades from
 *  boot + 63 steps, the status badge is gone at the toss (lock + 32 steps), and the opening ends at 2.398 s. */
export const NEON_WINDOWS = { console: 955.2, status: 1548, labels: 2398 } as const;
export type NeonWindow = keyof typeof NEON_WINDOWS;

/** The typed elements, in time order of their first glyph (ms from the first frame: the --at-op-* tokens plus steps of
 *  10.4 ms, as the plain-opacity fallback in chooser.css). `own`: the element keeps its own animation (the badge). */
export const NEON_TARGETS: readonly { sel: string; atMs: number; window: NeonWindow; own?: boolean }[] = [
  { sel: '.ov__t', atMs: 404, window: 'console' },
  { sel: '.ov__rq', atMs: 497.6, window: 'console' },
  { sel: '.ov__nd', atMs: 570.4, window: 'console' },
  { sel: '.ov__dt', atMs: 716, window: 'console' },
  { sel: '.ov__st', atMs: 1225.6, window: 'status', own: true },
  { sel: '.bar__name', atMs: 1215.2, window: 'labels' },
  { sel: '.cv__pub', atMs: 1236, window: 'labels' },
  { sel: '.cv__kicker', atMs: 1267.2, window: 'labels' },
  { sel: '.bar__access', atMs: 1267.2, window: 'labels' },
  { sel: '.cv__foot-t', atMs: 1288, window: 'labels' },
  { sel: '.cv__no', atMs: 1298.4, window: 'labels' },
  { sel: '.bar__no', atMs: 1298.4, window: 'labels' },
  { sel: '.cv__sn', atMs: 1340, window: 'labels' },
];

/** Grapheme clusters (a Hangul syllable, a Latin letter, a space: one glyph each); code points without Segmenter. */
export function splitGlyphs(text: string): string[] {
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment: (t: string) => Iterable<{ segment: string }> } }).Segmenter;
  return Seg ? Array.from(new Seg(undefined, { granularity: 'grapheme' }).segment(text), (s) => s.segment) : Array.from(text);
}

/** The glyph's flicker: 'a' lights once (about a quarter), 'b' lights, dips and recovers. Seeded by the text and the
 *  position (FNV-1a), so a label always types the same way. */
export function glyphVariant(text: string, index: number): 'a' | 'b' {
  let h = 0x811c9dc5;
  const key = `${text}#${index}`;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h >>> 7) % 4 === 0 ? 'a' : 'b';
}

/** When the last glyph of a line has finished flickering (ms from the line's start). */
export function lineEndMs(glyphs: number, staggerMs: number = NEON.staggerMs): number {
  return Math.max(0, glyphs - 1) * staggerMs + NEON.flickerMs;
}

/** The line's stagger: the default when the line fits its window (ms from its start), compressed to fit, never under
 *  the floor or over the ceiling. */
export function lineStagger(glyphs: number, windowMs: number): number {
  if (glyphs < 2) return NEON.staggerMs;
  const fit = (windowMs - NEON.flickerMs) / (glyphs - 1);
  return Math.min(NEON.staggerMaxMs, Math.max(NEON.staggerMinMs, Math.min(NEON.staggerMs, fit)));
}
