// src/lib/medals.ts — the medal set that Medal.astro draws. Import-free of astro:*; the emblems are original drawings
// (no third-party icon set). Each is one SVG path in the medal's 32 × 32 user units, drawn inside the disc's inner
// face (x 6–26, y 9–29) around its centre (16, 19), and stroked, never filled, so one path serves every state.

export type MedalState = 'locked' | 'unlocked' | 'hidden';
export const MEDAL_STATES: readonly MedalState[] = ['locked', 'unlocked', 'hidden'];

/** One emblem per site achievement id (achievements.yaml) plus 'record' for the game records. 32×32 user units. */
export const MEDAL_EMBLEMS: Readonly<Record<string, string>> = {
  // a page with a folded corner and the lines of an abstract
  'abstract-reader': 'M12.3 13.3h5.1l2.9 2.9v8.4h-8z M17.4 13.3v2.9h2.9 M14.2 18.5h2.6 M14.2 20.6h4.3 M14.2 22.7h4.3',
  // read down to the end mark
  'cog-story-complete': 'M16 13.4v7.3 M12.9 17.9 16 21l3.1-3.1 M11.3 23.9h9.4',
  // a rosette with its notched ribbon
  'certificate-checked':
    'M12.5 16.6a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0 -7 0z M15.3 16.6a.7 .7 0 1 0 1.4 0a.7 .7 0 1 0 -1.4 0z M18.1 19.4 19.1 24.7 16 22.9 12.9 24.7 13.9 19.4',
  // a map in four quadrants (the four menu sections), each one marked
  'map-explored':
    'M10.7 13.7h10.6v10.6H10.7z M16 13.7v10.6 M10.7 19h10.6 M12.9 16.35a.45 .45 0 1 0 .9 0a.45 .45 0 1 0 -.9 0z M18.2 16.35a.45 .45 0 1 0 .9 0a.45 .45 0 1 0 -.9 0z M12.9 21.65a.45 .45 0 1 0 .9 0a.45 .45 0 1 0 -.9 0z M18.2 21.65a.45 .45 0 1 0 .9 0a.45 .45 0 1 0 -.9 0z',
  // 가 / A, both drawn as strokes (no font)
  bilingual: 'M10.4 14.1h2.8c0 2.1-.8 3.6-2.5 4.7 M14.7 13.5v5.9 M14.7 16.4h1.2 M13.4 22.6 18.6 15.8 M16.9 24.6l2.5-5.3 2.5 5.3 M17.8 22.7h3.2',
  // two beamed eighth notes
  'sound-on':
    'M11.71 23.14a1.3 .85 -20 1 0 2.44 -.89a1.3 .85 -20 1 0 -2.44 .89z M17.85 21.84a1.3 .85 -20 1 0 2.44 -.89a1.3 .85 -20 1 0 -2.44 .89z M14.2 22.3V15.3 M20.35 21V14 M14.2 15.3 20.35 14v1.1L14.2 16.4z',
  // a D-pad whose four arms end in arrows
  konami: 'M14.2 17.2V14.4L16 12.6L17.8 14.4V17.2H20.6L22.4 19L20.6 20.8H17.8V23.6L16 25.4L14.2 23.6V20.8H11.4L9.6 19L11.4 17.2Z M15.65 19a.35 .35 0 1 0 .7 0a.35 .35 0 1 0 -.7 0z',
  // a laurel wreath: two branches of four leaves
  record:
    'M15 24.8C12 24 10.6 20.6 11.9 15 M14.12 25.01a1 .35 -13 1 0 -1.95 .45a1 .35 -13 1 0 1.95 -.45z M12.07 23.27a1 .35 18 1 0 -1.9 -.62a1 .35 18 1 0 1.9 .62z M11.04 20.29a1 .35 41 1 0 -1.51 -1.31a1 .35 41 1 0 1.51 1.31z M11.15 16.44a1 .35 56 1 0 -1.12 -1.66a1 .35 56 1 0 1.12 1.66z ' +
    'M17 24.8C20 24 21.4 20.6 20.1 15 M17.88 25.01a1 .35 13 1 0 1.95 .45a1 .35 13 1 0 -1.95 -.45z M19.93 23.27a1 .35 -18 1 0 1.9 -.62a1 .35 -18 1 0 -1.9 .62z M20.96 20.29a1 .35 -41 1 0 1.51 -1.31a1 .35 -41 1 0 -1.51 1.31z M20.85 16.44a1 .35 -56 1 0 1.12 -1.66a1 .35 -56 1 0 -1.12 1.66z',
};

/** The "?" drawn as a path (no font), shown for a hidden achievement before it is unlocked. */
export const MEDAL_QUESTION = 'M13.4 16.5c0-2.1 1.3-3.1 2.6-3.1 1.5 0 2.6 1 2.6 2.5 0 2.3-2.6 2.4-2.6 4.7 M15.7 23.3a.3 .3 0 1 0 .6 0a.3 .3 0 1 0 -.6 0z';

/** An unlocked achievement is 'unlocked'; otherwise a hidden one shows its "?" ('hidden') and any other is 'locked'. */
export function medalState(def: { hidden: boolean }, unlocked: boolean): MedalState {
  if (unlocked) return 'unlocked';
  return def.hidden ? 'hidden' : 'locked';
}
