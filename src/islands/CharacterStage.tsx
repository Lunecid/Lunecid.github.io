import { useEffect, useReducer, useState, type JSX } from 'react';
import type { CharacterId } from '../types';
import { preloadImage, type IslandImage } from '../lib/island-image';
import { prefersReducedNow } from '../lib/motion-pref';
import { playSfx } from '../lib/sound';
import './CharacterStage.css';

export interface StageCharacter {
  id: CharacterId;
  label: string; // swap-button text, e.g. '레미엘 · ZZZ'
  image: IslandImage; // from islandImage() in the Astro parent
  objectPosition: string;
}

export interface CharacterStageProps {
  variant: 'hero' | 'side';
  characters: StageCharacter[];
  initialId?: CharacterId;
  trigger: 'load' | 'visible';
  priority?: boolean;
  streaks?: boolean;
  controls?: { groupLabel: string; replayLabel: string };
}

export type StagePhase = 'idle' | 'entering' | 'shown' | 'exiting';
export interface StageState {
  phase: StagePhase;
  currentId: CharacterId;
  nextId: CharacterId | null;
  play: number;
}
export type StageAction =
  | { type: 'START' }
  | { type: 'ENTER_END' }
  | { type: 'EXIT_END' }
  | { type: 'SELECT'; id: CharacterId }
  | { type: 'SET'; id: CharacterId }
  | { type: 'REPLAY' };

/** mockup-port §3.1 state machine. */
export function stageReducer(s: StageState, a: StageAction): StageState {
  switch (a.type) {
    case 'START':
      return s.phase === 'idle' ? { ...s, phase: 'entering' } : s;
    case 'ENTER_END':
      return s.phase === 'entering' ? { ...s, phase: 'shown' } : s;
    case 'SELECT':
      if (s.phase === 'idle' || s.phase === 'exiting') return s;
      if (a.id === s.currentId) return { ...s, phase: 'entering', play: s.play + 1 };
      return { ...s, phase: 'exiting', nextId: a.id };
    case 'REPLAY':
      if (s.phase === 'idle' || s.phase === 'exiting') return s;
      return { ...s, phase: 'entering', play: s.play + 1 };
    case 'SET':
      // before the first entrance only: swap the character without playing an exit
      return s.phase === 'idle' ? { ...s, currentId: a.id, nextId: null } : s;
    case 'EXIT_END':
      return s.phase === 'exiting' && s.nextId !== null
        ? { phase: 'entering', currentId: s.nextId, nextId: null, play: s.play + 1 }
        : s;
    default:
      return s;
  }
}

/**
 * Final fix 2 item 10: the MAIN MENU side stage never shows the character that is on the hero. The hero stage
 * announces the character it shows (or is switching to) with this event and in its data-pick attribute; the side
 * stage keeps its own first character unless that one is on the hero, and then shows another of its characters.
 */
export const HERO_PICK_EVENT = 'sb:hero-pick';

/** The side stage's character: its first choice, or the first other one while the hero shows the first choice. */
export function sideChoice(ids: readonly CharacterId[], preferred: CharacterId, heroPick: CharacterId | null): CharacterId {
  if (heroPick !== preferred) return preferred;
  return ids.find((id) => id !== heroPick) ?? preferred;
}

const EXIT_MS = 250;
const EXIT_MS_REDUCED = 150;
const ENTER_SETTLE_MS = 900;
const STREAK_TOPS = ['36%', '54%', '72%'];

export default function CharacterStage({
  variant,
  characters,
  initialId,
  trigger,
  priority = false,
  streaks = false,
  controls,
}: CharacterStageProps): JSX.Element | null {
  const [state, dispatch] = useReducer(
    stageReducer,
    trigger,
    (initialTrigger: CharacterStageProps['trigger']): StageState => ({
      phase: initialTrigger === 'load' ? 'entering' : 'idle',
      currentId: initialId ?? characters[0]?.id ?? 'remielle',
      nextId: null,
      play: 0,
    }),
  );
  const current = characters.find((c) => c.id === state.currentId) ?? characters[0];
  const pressedId = state.nextId ?? state.currentId;
  // Swap/replay need React, so they mount after hydration: the SSR markup (no JS, or before client:visible
  // hydrates) has no dead buttons, and the first client render still matches it (no hydration mismatch).
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  // trigger="visible": hydrated on screen → start once the art is decoded (≤1.5s) so the slide is never empty.
  useEffect(() => {
    if (trigger !== 'visible' || !current) return;
    let alive = true;
    void preloadImage(current.image).then(() => {
      if (alive) dispatch({ type: 'START' });
    });
    return () => {
      alive = false;
    };
  }, [trigger, current]);

  // entering → shown; user-triggered plays tell the Hero to replay its copy rise.
  useEffect(() => {
    if (state.phase !== 'entering') return;
    if (state.play > 0) {
      window.dispatchEvent(new CustomEvent('sb:stage-enter', { detail: { variant, play: state.play } }));
    }
    const timer = window.setTimeout(() => dispatch({ type: 'ENTER_END' }), ENTER_SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [state.phase, state.play, variant]);

  // exiting → entering(next) after the exit AND the next image decode.
  useEffect(() => {
    if (state.phase !== 'exiting' || state.nextId === null) return;
    const next = characters.find((c) => c.id === state.nextId);
    const exitMs = prefersReducedNow() ? EXIT_MS_REDUCED : EXIT_MS;
    let alive = true;
    void Promise.all([
      next ? preloadImage(next.image) : Promise.resolve(),
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, exitMs);
      }),
    ]).then(() => {
      if (alive) dispatch({ type: 'EXIT_END' });
    });
    return () => {
      alive = false;
    };
  }, [state.phase, state.nextId, characters]);

  // Hero: announce every pick (the first render's pick is also in data-pick for a side stage that mounts later).
  useEffect(() => {
    if (variant !== 'hero' || !hydrated) return;
    window.dispatchEvent(new CustomEvent(HERO_PICK_EVENT, { detail: { id: pressedId } }));
  }, [variant, hydrated, pressedId]);

  // Side: follow the hero's pick (item 10).
  const [heroPick, setHeroPick] = useState<CharacterId | null>(null);
  useEffect(() => {
    if (variant !== 'side') return;
    const shown = document.querySelector('.char-stage--hero')?.getAttribute('data-pick');
    if (shown) setHeroPick(shown as CharacterId);
    const onPick = (event: Event): void => setHeroPick((event as CustomEvent<{ id: CharacterId }>).detail.id);
    window.addEventListener(HERO_PICK_EVENT, onPick);
    return () => window.removeEventListener(HERO_PICK_EVENT, onPick);
  }, [variant]);
  const preferredId = initialId ?? characters[0]?.id;
  const wantedId =
    variant === 'side' && preferredId
      ? sideChoice(
          characters.map((c) => c.id),
          preferredId,
          heroPick,
        )
      : null;
  useEffect(() => {
    if (wantedId === null || wantedId === pressedId) return;
    if (state.phase === 'idle') dispatch({ type: 'SET', id: wantedId });
    else if (state.phase !== 'exiting') dispatch({ type: 'SELECT', id: wantedId }); // an exit in progress: retry after it
  }, [wantedId, pressedId, state.phase]);

  // Every hook has run above (rules of hooks); no art → no stage at all.
  if (!current) return null;

  return (
    <div className={`char-stage char-stage--${variant}`} data-phase={state.phase} data-pick={variant === 'hero' ? pressedId : undefined}>
      {streaks && (
        <div className="char-stage__streaks" aria-hidden="true" key={`streaks-${state.play}`}>
          {STREAK_TOPS.map((top) => (
            <span key={top} className="char-stage__streak" style={{ top }} />
          ))}
        </div>
      )}
      <div className="char-stage__frame" aria-hidden="true">
        {/* Unmasked clip: art stays ≥2px inside the masked frame's faded edges. The img keeps the designed --W box. */}
        <div className="char-stage__clip">
          <img
            key={`${current.id}-${state.play}`}
            className="char-stage__img"
            src={current.image.src}
            srcSet={current.image.srcSet}
            sizes={current.image.sizes}
            width={current.image.width}
            height={current.image.height}
            alt=""
            decoding="async"
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : 'auto'}
            style={{ objectPosition: current.objectPosition }}
          />
        </div>
      </div>
      {controls && hydrated && (
        <div className="char-stage__controls">
          {characters.length > 1 && (
            <div className="char-stage__swap" role="group" aria-label={controls.groupLabel}>
              {characters.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="char-stage__btn hit"
                  aria-pressed={c.id === pressedId}
                  onPointerEnter={() => {
                    void preloadImage(c.image);
                  }}
                  onFocus={() => {
                    void preloadImage(c.image);
                  }}
                  onClick={() => {
                    void playSfx('select');
                    dispatch({ type: 'SELECT', id: c.id });
                  }}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}
          <button type="button" className="char-stage__btn char-stage__replay hit" onClick={() => dispatch({ type: 'REPLAY' })}>
            <span aria-hidden="true">↻</span> {controls.replayLabel}
          </button>
        </div>
      )}
    </div>
  );
}
