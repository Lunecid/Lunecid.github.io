// A-03 F-052 (account-link AL-13): m.* components under LazyMotion with the domAnimation features (strict), so the
// island ships the animation and gesture features only, not the full motion component.
import { AnimatePresence, LazyMotion, MotionConfig, domAnimation, type Variants } from 'motion/react';
import * as m from 'motion/react-m';
import { useCallback, useEffect, useId, useRef, useState, type JSX, type KeyboardEvent, type ReactNode } from 'react';
import type { Lang } from '../i18n/ui';
import { creditParts } from '../lib/credit';
import { isFresh } from '../lib/freshness';
import type { AccountCard, AccountFeed } from '../lib/generated';
import { preloadImage, type IslandImage } from '../lib/island-image';
import { useReducedMotionPref } from '../lib/motion-pref';
import { playSfx } from '../lib/sound';
import { useCountUp } from '../lib/use-count-up';
import type { CharacterId, GameId } from '../types';
import './FavoriteGames.css';

export interface FavoriteGame {
  id: GameId;
  tabTitle: string;
  tabCaption: string;
  locked: boolean;
  title?: [string, string?];
  subtitle?: string;
  why?: string;
  meta?: string[];
  art?: { image: IslandImage; objectPosition: string };
  tint?: CharacterId;
  account?: { key: string; head: string };
}

export interface FavoriteGamesProps {
  lang: Lang;
  /** Section head (D-8): the English HUD caption after "[ ■ ]" and the title in the page language. */
  heading: { caption: string; title: string };
  games: FavoriteGame[];
  initialId?: GameId;
  accounts: Partial<Record<string, AccountFeed>>; // only a usable feed shows an account card; missing, error or stale → none (D-13)
  credit: string | null;
  labels: { tablist: string; fetchedAt: string; source: string; progress: string };
}

export type AccountState = { kind: 'locked' } | { kind: 'hidden' } | { kind: 'ok'; feed: AccountFeed; card: AccountCard };

type Bezier = [number, number, number, number];
const EASE_OUT: Bezier = [0.22, 1, 0.36, 1];
const EASE_IN: Bezier = [0.4, 0, 1, 1];
const EASE_WIPE: Bezier = [0.65, 0, 0.35, 1];
const TINTS: readonly CharacterId[] = ['remielle', 'eula', 'mona', 'ezreal', 'pengu'];

/** Seconds from the new scene's mount (spec §4: the account card finishes within 2 s). The copy settles within
 *  0.75 s of a tab click (exit + gap + 3 staggers + enter) so games can be compared quickly; the art enters a little
 *  slower (art) than the copy. */
export const TL = {
  exit: 0.15, gap: 0.05, enter: 0.35, art: 0.45, streak: 0.8, streakStagger: 0.06, copyStagger: 0.04,
  panelAt: 0.27, panel: 0.45, linesAt: 0.72, lineStagger: 0.08, line: 0.3, count: 0.8,
  barAt: 1.28, bar: 0.5, badgesAt: 1.57, badgeStagger: 0.08, badge: 0.25,
} as const;
export const MAX_STATS = 4;
export const MAX_BADGES = 3;

/* ---------- variants (full motion) ---------- */
const sceneV: Variants = { hidden: {}, show: {}, exit: { opacity: 0, transition: { duration: TL.exit, ease: EASE_IN } } };
const chrV: Variants = {
  hidden: { x: '40%', opacity: 0 },
  show: { x: 0, opacity: 1, transition: { duration: TL.art, ease: EASE_OUT, delay: TL.gap } },
  exit: { x: '18%', opacity: 0, transition: { duration: TL.exit, ease: EASE_IN } },
};
/* reduced motion: the art waits for its decode like in full motion, then fades in with the scene's short fade */
const chrReducedV: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};
const streakV: Variants = {
  hidden: { x: '60%', opacity: 0 },
  show: (i: number) => ({
    x: ['60%', '-80%'],
    opacity: [0, 1, 0],
    transition: {
      x: { duration: TL.streak, ease: 'easeOut', delay: TL.gap + i * TL.streakStagger },
      opacity: { duration: TL.streak, times: [0, 0.3, 1], delay: TL.gap + i * TL.streakStagger },
    },
  }),
};
const copyV: Variants = { hidden: {}, show: { transition: { delayChildren: TL.gap, staggerChildren: TL.copyStagger } } };
const riseV: Variants = { hidden: { y: 20, opacity: 0 }, show: { y: 0, opacity: 1, transition: { duration: TL.enter, ease: EASE_OUT } } };
const bgV: Variants = { hidden: { scaleX: 0 }, show: { scaleX: 1, transition: { delay: TL.panelAt, duration: TL.panel, ease: EASE_WIPE } } };
const lineV: Variants = {
  hidden: { opacity: 0, x: -10 },
  show: (k: number) => ({ opacity: 1, x: 0, transition: { delay: TL.linesAt + k * TL.lineStagger, duration: TL.line, ease: 'easeOut' } }),
};
const barV: Variants = { hidden: { scaleX: 0 }, show: (v: number) => ({ scaleX: v, transition: { delay: TL.barAt, duration: TL.bar, ease: EASE_OUT } }) };
const badgeV: Variants = {
  hidden: { opacity: 0, scale: 0.6 },
  show: (i: number) => ({ opacity: 1, scale: 1, transition: { delay: TL.badgesAt + i * TL.badgeStagger, duration: TL.badge, ease: EASE_OUT } }),
};
/* reduced motion: one short fade on the scene, children static */
const sceneReducedV: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

/** missing feed → locked; status 'error', no card or !isFresh(feed, now) → hidden; else ok with cards[0]. */
export function resolveAccount(game: FavoriteGame, accounts: FavoriteGamesProps['accounts'], now: number = Date.now()): AccountState {
  if (!game.account) return { kind: 'hidden' };
  const feed = accounts[game.account.key];
  if (!feed) return { kind: 'locked' };
  const card = feed.cards[0];
  if (feed.status !== 'ok' || !card || !isFresh(feed, now)) return { kind: 'hidden' };
  return { kind: 'ok', feed, card };
}

const withBold = (t: string): ReactNode[] =>
  t
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((p, i) => (p.startsWith('**') ? <b key={i}>{p.slice(2, -2)}</b> : p));

export default function FavoriteGames({ lang, heading, games, initialId, accounts, credit, labels }: FavoriteGamesProps): JSX.Element {
  const reduce = useReducedMotionPref();
  const firstId: GameId = initialId ?? games.find((g) => !g.locked)?.id ?? games[0].id;
  const [selected, setSelected] = useState<GameId>(firstId);
  const [current, setCurrent] = useState<GameId>(firstId);
  const [focusId, setFocusId] = useState<GameId>(firstId);
  // A-03 F-051: the first scene is server-rendered in place and mounted with initial={false}; entrance variants run
  // only after a tab change (switched), and only the art (.fg__chr) waits for its image to decode.
  const [switched, setSwitched] = useState(false);
  // Final fix 2 round 2 item 5: the stage is a tab panel only once React runs the tabs. The server markup (no JS, or
  // before client:visible hydrates) holds every game's text with the tabs hidden, so it is a plain region then: no
  // role, no tab stop, no name pointing at a hidden tab. The first client render still matches the server markup.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);
  // true while a scene exit is in flight (AnimatePresence mode="wait"); the first scene is always mounted, so every
  // change of scene runs one exit
  const busy = useRef(false);
  const pending = useRef<GameId | null>(null);
  const currentRef = useRef(current);
  currentRef.current = current;
  const tabs = useRef(new Map<GameId, HTMLButtonElement>());
  const uid = useId();
  // Index-based ids: game ids such as lol or dnf never appear in DOM ids that could serve as #fragments.
  const tabId = (id: GameId) => `${uid}-tab-${games.findIndex((g) => g.id === id)}`;
  const panelId = `${uid}-panel`;
  const game = games.find((g) => g.id === current) ?? games[0];
  // D-1: with no character art at all the showcase takes a flowing no-art layout (no fixed stage heights, the
  // game facts as a HUD panel beside the copy); the selected game's tint shows either way.
  const hasArt = games.some((g) => g.art);
  // Final fix 2 item 8: with D-13's two games (and up to three) the art layout puts the tabs in a row above the copy
  // and drops to 520px, instead of a 600px panel with an empty tab column and an empty band under the copy.
  const tabsRow = games.length <= 3;

  const applyGame = useCallback(
    (id: GameId) => {
      const g = games.find((x) => x.id === id);
      if (!g || g.locked) return;
      busy.current = true;
      setSelected(id);
      setSwitched(true);
      void playSfx('select');
      // start the decode during the exit; the new scene's art waits for the same (cached) promise
      if (g.art) void preloadImage(g.art.image);
      setCurrent(id);
    },
    [games],
  );

  const select = useCallback(
    (id: GameId) => {
      const g = games.find((x) => x.id === id);
      if (!g || g.locked) return;
      // F-038: while an exit is in flight, update aria-selected immediately and queue the pick for onExitComplete.
      if (busy.current) {
        setSelected(id);
        pending.current = id;
        return;
      }
      if (id === currentRef.current) return;
      pending.current = null;
      applyGame(id);
    },
    [applyGame, games],
  );

  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const ids = games.map((g) => g.id);
    const i = ids.indexOf(focusId);
    const map: Record<string, number> = { ArrowDown: i + 1, ArrowRight: i + 1, ArrowUp: i - 1, ArrowLeft: i - 1, Home: 0, End: ids.length - 1 };
    if (!(e.key in map)) return;
    e.preventDefault();
    tabs.current.get(ids[(map[e.key] + ids.length) % ids.length])?.focus();
  };

  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion={reduce ? 'always' : 'never'}>
        <section className={`fg hud-grid ${hasArt ? 'fg--art' : 'fg--no-art'}${tabsRow ? ' fg--tabs-row' : ''}`} aria-labelledby={`${uid}-h`}>
          <div className="fg__tints" aria-hidden="true">
            {TINTS.map((tint) => (
              <i key={tint} className={`fg__tint fg__tint--${tint}`} data-on={String(hydrated && game.tint === tint)} />
            ))}
          </div>
          <div className="fg__layout">
            {/* caption-only as in the approved v4 mockup (SectionHead captionOnly): the title stays the heading for AT */}
            <header className="fg__top sec-head sec-head--caption">
              <h2 id={`${uid}-h`} className="sr-only">{heading.title}</h2>
              <p className="hud-label" aria-hidden="true">
                <span className="hud-label__mark" lang="en">[<i className="hud-label__sq" />]</span>
                <span className="hud-label__en" lang="en">{heading.caption}</span>
              </p>
            </header>
            <div className="fg__list" role="tablist" aria-label={labels.tablist} aria-orientation={tabsRow ? 'horizontal' : 'vertical'} onKeyDown={onTabKey}>
              {games.map((g) => (
                <button
                  key={g.id}
                  ref={(el) => {
                    if (el) tabs.current.set(g.id, el);
                    else tabs.current.delete(g.id);
                  }}
                  id={tabId(g.id)}
                  type="button"
                  role="tab"
                  className="fg__tab"
                  aria-selected={g.id === selected}
                  aria-controls={g.locked ? undefined : panelId}
                  aria-disabled={g.locked || undefined}
                  tabIndex={g.id === focusId ? 0 : -1}
                  onFocus={() => setFocusId(g.id)}
                  onPointerEnter={() => {
                    if (g.art) void preloadImage(g.art.image);
                  }}
                  onClick={() => select(g.id)}
                >
                  <b>{g.tabTitle}</b>
                  <small lang={g.locked ? undefined : 'en'}>
                    {g.locked && <span aria-hidden="true">🔒 </span>}
                    {/* Unlocked caption is g.title.en.toUpperCase() (favorites.ts): on English pages that just
                        repeats the <b> title above in another case (P2-26), so show it only on Korean pages. */}
                    {(g.locked || lang !== 'en') && g.tabCaption}
                  </small>
                </button>
              ))}
            </div>
            <div
              id={panelId}
              className="fg__stage"
              role={hydrated ? 'tabpanel' : undefined}
              aria-labelledby={hydrated ? tabId(current) : undefined}
              tabIndex={hydrated ? 0 : undefined}
            >
              {/* Without JS the tabs are hidden (base.css) and every game's text is here, one after the other
                  (final fix 2 item 17: the Genshin text used to be behind a tab that could not switch). */}
              <noscript>
                {games
                  .filter((g) => !g.locked)
                  .map((g) => (
                    <div key={g.id} className="fg__copy fg__copy--static">
                      {g.title && <p className="fg__title" lang="en">{g.title.filter(Boolean).join(' ')}</p>}
                      {g.subtitle && <p className="fg__sub">{g.subtitle}</p>}
                      {g.why && <p className="fg__why">{withBold(g.why)}</p>}
                    </div>
                  ))}
              </noscript>
              <AnimatePresence
                mode="wait"
                initial={false}
                onExitComplete={() => {
                  busy.current = false;
                  const id = pending.current;
                  pending.current = null;
                  if (id !== null && id !== currentRef.current) applyGame(id);
                }}
              >
                <Scene key={current} game={game} first={!switched} accounts={accounts} labels={labels} lang={lang} reduce={reduce} factsPanel={!hasArt} />
              </AnimatePresence>
            </div>
            {credit !== null && (
              <p className="fg__credit">
                {creditParts(credit).map((part, i) => (
                  <span key={part}>
                    {i > 0 && ' '}
                    <span className="fg__credit-part">{part}</span>
                  </span>
                ))}
              </p>
            )}
          </div>
        </section>
      </MotionConfig>
    </LazyMotion>
  );
}

function Scene({ game, first, accounts, labels, lang, reduce, factsPanel }: {
  game: FavoriteGame;
  /** The server-rendered first scene: its art is in the HTML already, so it does not wait for a decode. */
  first: boolean;
  accounts: FavoriteGamesProps['accounts'];
  labels: FavoriteGamesProps['labels'];
  lang: Lang;
  reduce: boolean;
  /** No-art showcase: the meta list becomes a bracketed facts panel beside the copy. */
  factsPanel: boolean;
}) {
  const acct = resolveAccount(game, accounts);
  const v = (full: Variants) => (reduce ? undefined : full);
  // A-03 F-051: only the art waits for img.decode() (preloadImage); the copy enters at once.
  const [artReady, setArtReady] = useState(first || !game.art);
  useEffect(() => {
    if (artReady || !game.art) return undefined;
    let alive = true;
    void preloadImage(game.art.image).then(() => {
      if (alive) setArtReady(true);
    });
    return () => {
      alive = false;
    };
    // the scene is keyed by game: one decode per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <m.div
      className="fg__scene"
      data-art={game.art ? 'on' : 'off'}
      initial="hidden"
      animate="show"
      exit="exit"
      variants={reduce ? sceneReducedV : sceneV}
    >
      {!reduce && (
        <div className="fg__streaks" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <m.span key={i} className="fg__streak" style={{ top: `${30 + i * 18}%` }} variants={streakV} custom={i} />
          ))}
        </div>
      )}
      {game.art && (
        <m.div
          className="fg__chr"
          variants={reduce ? chrReducedV : chrV}
          initial="hidden"
          animate={artReady ? 'show' : 'hidden'}
          exit="exit"
          aria-hidden="true"
        >
          <div className="fg__chr-clip">
            {game.art.image.avifSrcSet ? (
              <picture>
                <source type="image/avif" srcSet={game.art.image.avifSrcSet} sizes={game.art.image.sizes} />
                <img
                  src={game.art.image.src}
                  srcSet={game.art.image.srcSet}
                  sizes={game.art.image.sizes}
                  width={game.art.image.width}
                  height={game.art.image.height}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  style={{ objectPosition: game.art.objectPosition }}
                />
              </picture>
            ) : (
              <img
                src={game.art.image.src}
                srcSet={game.art.image.srcSet}
                sizes={game.art.image.sizes}
                width={game.art.image.width}
                height={game.art.image.height}
                alt=""
                loading="lazy"
                decoding="async"
                style={{ objectPosition: game.art.objectPosition }}
              />
            )}
          </div>
        </m.div>
      )}
      <m.div className="fg__copy" variants={v(copyV)}>
        {game.title && (
          <m.h3 className="fg__title" lang="en" variants={v(riseV)}>
            {game.title[0]}
            {game.title[1] && (
              <>
                <br />
                {game.title[1]}
              </>
            )}
          </m.h3>
        )}
        {game.subtitle && <m.p className="fg__sub" variants={v(riseV)}>{game.subtitle}</m.p>}
        {game.why && <m.p className="fg__why" variants={v(riseV)}>{withBold(game.why)}</m.p>}
        {game.meta && (
          <m.ul className={factsPanel ? 'fg__meta fg__meta--panel bracket bracket--sm' : 'fg__meta'} role="list" variants={v(riseV)}>
            {game.meta.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </m.ul>
        )}
      </m.div>
      {/* D-13: an account card appears only with a usable feed; no "locked" placeholder card before that. */}
      {acct.kind === 'ok' && game.account && (
        <AccountPanel state={acct} head={game.account.head} labels={labels} lang={lang} reduce={reduce} />
      )}
    </m.div>
  );
}

function AccountPanel({ state, head, labels, lang, reduce }: {
  state: Extract<AccountState, { kind: 'ok' }>;
  head: string;
  labels: FavoriteGamesProps['labels'];
  lang: Lang;
  reduce: boolean;
}) {
  const L = reduce ? undefined : lineV;
  const { feed, card } = state;
  const locale = lang === 'ko' ? 'ko-KR' : 'en-US';
  const fetched = new Intl.DateTimeFormat(locale, { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(feed.fetchedAt),
  );
  const stats = card.stats.slice(0, MAX_STATS);
  const badges = (card.badges ?? []).slice(0, MAX_BADGES);
  const rowStart = card.subtitle ? 3 : 2;
  const afterRows = rowStart + stats.length;
  return (
    <section className="fg-acct" aria-label={`${head} · ${card.title}`}>
      <m.span className="fg-acct__bg" aria-hidden="true" variants={reduce ? undefined : bgV} />
      <m.p className="fg-acct__hd" variants={L} custom={0}>
        <span lang="en">{head}</span>
        <span>
          {labels.fetchedAt} <time dateTime={feed.fetchedAt}>{fetched}</time>
        </span>
      </m.p>
      <m.p className="fg-acct__nm" variants={L} custom={1}>{card.title}</m.p>
      {card.subtitle && <m.p className="fg-acct__sub" variants={L} custom={2}>{card.subtitle}</m.p>}
      <dl className="fg-acct__stats">
        {stats.map((s, i) => (
          <m.div key={s.label} className="fg-acct__row" variants={L} custom={rowStart + i}>
            <dt>{s.label}</dt>
            <dd>
              <Count value={s.value} suffix={s.suffix} locale={locale} reduce={reduce} delayMs={(TL.linesAt + (rowStart + i) * TL.lineStagger) * 1000} />
            </dd>
          </m.div>
        ))}
      </dl>
      {card.progress && (
        <m.div className="fg-acct__track" variants={L} custom={afterRows}>
          <m.i
            className="fg-acct__fill"
            aria-hidden="true"
            variants={reduce ? undefined : barV}
            custom={card.progress.value / 100}
            style={reduce ? { transform: `scaleX(${card.progress.value / 100})` } : undefined}
          />
          <span className="sr-only">
            {labels.progress}: {card.progress.label} {card.progress.value}%
          </span>
        </m.div>
      )}
      {badges.length > 0 && (
        <ul className="fg-acct__badges" role="list">
          {badges.map((b, i) => (
            <m.li key={b} variants={reduce ? undefined : badgeV} custom={i}>
              <span aria-hidden="true">◆ </span>
              {b}
            </m.li>
          ))}
        </ul>
      )}
      <m.p className="fg-acct__src" variants={L} custom={afterRows + 1}>
        {labels.source}: {feed.attribution}
      </m.p>
    </section>
  );
}

function Count({ value, suffix = '', locale, reduce, delayMs }: { value: number | string; suffix?: string; locale: string; reduce: boolean; delayMs: number }) {
  const n = typeof value === 'number' ? value : Number.NaN;
  const shown = useCountUp(Number.isNaN(n) ? 0 : n, { delayMs, durationMs: TL.count * 1000, reduce });
  if (Number.isNaN(n)) {
    return (
      <>
        {value}
        {suffix}
      </>
    );
  }
  return (
    <>
      <span aria-hidden="true" className="tnum">
        {shown.toLocaleString(locale)}
        {suffix}
      </span>
      <span className="sr-only">
        {n.toLocaleString(locale)}
        {suffix}
      </span>
    </>
  );
}
