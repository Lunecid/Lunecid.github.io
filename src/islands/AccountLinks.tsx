// LINKED ACCOUNTS row under the membership card (account-link spec §3.1–§3.7; plan AL-10…AL-12).
// Server and first client render: one <details class="acct-tile"> per shown tile, its summary the tile and its body
// the whole card as static HTML (G-010: the numbers are in the page without JavaScript). No shown tile → a
// zero-height empty frame and no caption, so the dark release looks exactly as before (R-4, R-8).
// After mount (AL-11) the tiles become buttons that open one native <dialog> (spec §3.2): the shell comes from
// src/lib/use-hud-dialog.ts (ImageViewer's pattern, DV-2); ←/→ and ‹ › switch accounts inside the one dialog, an
// off-screen role="status" announces each switch, and closing returns focus to the account shown last.
// AL-12: the card region (./account/AccountCard.tsx), the open timeline TL (spec §3.6: a ghost frame flies from the
// tile to the dialog, the panel fades in, head/stats/items/foot follow; count-up only on an account's first open),
// the switch cross-fade (card region only, 180 ms), both reduced-motion paths (one 150 ms fade, no ghost, no count-up,
// final values), and the stale sweep (spec §3.5: on hydration and on visibilitychange → visible, never on the
// opening click, after the close while the dialog is open).
// The island reads no URL and makes no request. Every free text (nicknames, game names, Riot IDs) is a JSX text node.
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type JSX, type KeyboardEvent, type ReactNode } from 'react';
import type { Lang } from '../i18n/ui';
import { ACCOUNT_MAX_AGE_DAYS } from '../lib/account-config';
import type { AccountLinksLabels, AccountTile, AccountTileKey } from '../lib/account-view';
import { isFresh } from '../lib/freshness';
import { prefersReducedNow, useReducedMotionPref } from '../lib/motion-pref';
import { useHudDialog } from '../lib/use-hud-dialog';
import AccountCard, { TL } from './account/AccountCard';
import './AccountLinks.css';

export { TL };
/** Close time (spec §3.6): the 80 ms dialog fade + the 220 ms return of the ghost frame (DV-2). */
export const CLOSE_MS = TL.closeFade + TL.closeGhost;
/** Close time under reduced motion (either path): one 150 ms opacity fade (spec §3.6, DV-2). */
export const CLOSE_MS_REDUCED = 150;
/** A switch cross-fades the card region for this long (spec §3.2). */
export const SWITCH_MS = 180;
/** A <details> whose toggle arrives within this long after mount was a pre-hydration click: it opens the dialog
 *  (spec §3.1). One opened earlier (being read) is folded into its button instead. */
export const TOGGLE_WINDOW_MS = 1000;
/** The scroll-lock owner of the account dialog (spec §3.2). */
const LOCK_OWNER = 'account-dialog';
/** Arrow keys do nothing while one of these has focus (spec §3.2: the management fields, AL-18). */
const TEXT_ENTRY = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

export interface AccountLinksProps {
  lang: Lang;
  /** Every enabled tile with its state (owner mode needs them all); visitors see only the shown ones. */
  tiles: AccountTile[];
  labels: AccountLinksLabels;
  /** Relay origin (null until the owner deploys the Worker); read by the management mode (AL-20). */
  relay: string | null;
  /** Whether the Steam sign-in button image ships (AL-16). */
  steamButton: boolean;
}

type Box = { left: number; top: number; width: number; height: number };
/** The ghost frame (spec §3.6): the line is sized to `base` and moved by translate+scale; the four corner brackets
 *  move by translate only (they never stretch). `ms`/`delay` = 0 places it without a transition. */
type Ghost = { base: Box; at: Box; ms: number; delay: number };

const boxOf = (el: Element | null | undefined): Box | null => {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
};

/** The tile's freshness at this moment (spec §3.5; the one rule of src/lib/freshness.ts). Riot tiles never go stale. */
const staleNow = (tile: AccountTile, now: number): boolean =>
  tile.fetchedAt !== undefined && !isFresh({ fetchedAt: tile.fetchedAt, maxAgeDays: tile.maxAgeDays ?? ACCOUNT_MAX_AGE_DAYS }, now);

function GhostFrame({ ghost }: { ghost: Ghost }): JSX.Element {
  const { base, at } = ghost;
  const transition = ghost.ms > 0 ? `transform ${ghost.ms}ms var(--ease-out) ${ghost.delay}ms` : 'none';
  const sx = at.width / Math.max(base.width, 1);
  const sy = at.height / Math.max(base.height, 1);
  const right = `calc(${at.left + at.width}px - var(--bracket-sm))`;
  const bottom = `calc(${at.top + at.height}px - var(--bracket-sm))`;
  const corners: [string, string, string][] = [
    ['tl', `${at.left}px`, `${at.top}px`],
    ['tr', right, `${at.top}px`],
    ['bl', `${at.left}px`, bottom],
    ['br', right, bottom],
  ];
  return (
    <div className="acct-dlg__ghost" aria-hidden="true">
      <span
        className="acct-dlg__ghost-line"
        style={{ width: `${base.width}px`, height: `${base.height}px`, transform: `translate(${at.left}px, ${at.top}px) scale(${sx}, ${sy})`, transition }}
      />
      {corners.map(([corner, x, y]) => (
        <span key={corner} className={`acct-dlg__ghost-corner acct-dlg__ghost-corner--${corner}`} style={{ transform: `translate(${x}, ${y})`, transition }} />
      ))}
    </div>
  );
}

/** 'lolchess.gg' → 'lolchess<wbr>.gg': a narrow phone column breaks a site name at its dot, never mid-word. */
function teaserParts(teaser: string): ReactNode[] {
  return teaser.split(/(?=\.)/).flatMap((part, i) => (i === 0 ? [part] : [<wbr key={i} />, part]));
}

/** The tile's face, the same inside the SSR <summary> and the mounted <button>. */
function TileFace({ tile }: { tile: AccountTile }): JSX.Element {
  return (
    <>
      <span className="acct-tile__frame" aria-hidden="true">
        <span className="acct-tile__corners" />
        <span className="acct-tile__glyph" lang="en">
          {tile.glyph}
        </span>
      </span>
      <span className="acct-tile__name">{tile.name}</span>
      {tile.teaser !== undefined && (
        <span className="acct-tile__teaser" aria-hidden="true" lang="en">
          {teaserParts(tile.teaser)}
        </span>
      )}
      {tile.teaserSr !== undefined && <span className="sr-only">{tile.teaserSr}</span>}
    </>
  );
}

const tintStyle = (tile: AccountTile): CSSProperties => ({ '--acct-tint': tile.tint }) as CSSProperties;

function Tile({ tile, labels, lang }: { tile: AccountTile; labels: AccountLinksLabels; lang: Lang }): JSX.Element {
  return (
    <details className="acct-tile" style={tintStyle(tile)}>
      <summary className="acct-tile__sum">
        <TileFace tile={tile} />
      </summary>
      {tile.card && <AccountCard tile={tile} card={tile.card} labels={labels} lang={lang} mode="static" />}
    </details>
  );
}

const fill = (template: string, values: Record<string, string | number>): string =>
  template.replace(/\{(\w+)\}/g, (whole, name: string) => (Object.hasOwn(values, name) ? String(values[name]) : whole));

export default function AccountLinks({ lang, tiles, labels }: AccountLinksProps): JSX.Element {
  const shown = tiles.filter((tile) => tile.state === 'shown' && tile.card !== undefined);
  // stale sweep (spec §3.5): tiles removed after mount; the SSR copy stays for readers without JavaScript
  const [removed, setRemoved] = useState<ReadonlySet<AccountTileKey>>(() => new Set());
  const removedRef = useRef<Set<AccountTileKey>>(new Set());
  const visible = shown.filter((tile) => !removed.has(tile.key));
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const total = visible.length;
  const rowRef = useRef<HTMLUListElement>(null);
  const capRef = useRef<HTMLParagraphElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef(new Map<AccountTileKey, HTMLButtonElement>());
  const [live, setLive] = useState(false);
  const focusOnSwap = useRef<AccountTileKey | null>(null);
  const focusAfterSweep = useRef<AccountTileKey | 'caption' | null>(null);
  const sweepPending = useRef(false);
  const [openRequest, setOpenRequest] = useState<AccountTileKey | null>(null);
  const [current, setCurrent] = useState(0);
  const currentRef = useRef(0);
  const [announce, setAnnounce] = useState('');
  // the card region: remounted by every open (the timeline runs) and every switch (the cross-fade runs)
  const [openSeq, setOpenSeq] = useState(0);
  const [anim, setAnim] = useState<'intro' | 'switch'>('intro');
  const [countFor, setCountFor] = useState<AccountTileKey | null>(null);
  const seen = useRef(new Set<AccountTileKey>());
  const [outgoing, setOutgoing] = useState<{ tile: AccountTile; seq: number } | null>(null);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const reduce = useReducedMotionPref();
  const descId = useId();

  const buttonOf = (key: AccountTileKey | undefined): HTMLButtonElement | undefined => (key === undefined ? undefined : buttonRefs.current.get(key));

  /** Removes the tiles that are stale now; focus in a removed tile moves to the next tile, else the row caption. */
  const sweepNow = useCallback(() => {
    const list = visibleRef.current;
    const now = Date.now();
    const gone = new Set(list.filter((tile) => staleNow(tile, now)).map((tile) => tile.key));
    if (gone.size === 0) return;
    const active = document.activeElement;
    const focused = list.findIndex((tile) => {
      const button = buttonRefs.current.get(tile.key);
      return active !== null && button !== undefined && button.contains(active);
    });
    const focusedTile = list[focused];
    if (focusedTile !== undefined && gone.has(focusedTile.key)) {
      const next = list.slice(focused + 1).find((tile) => !gone.has(tile.key));
      focusAfterSweep.current = next ? next.key : 'caption';
    }
    for (const key of gone) removedRef.current.add(key);
    currentRef.current = 0;
    setCurrent(0);
    setRemoved(new Set(removedRef.current));
  }, []);

  // The ghost run's frames and timer live in a ref: the opening → open state change must not cancel the removal at 380 ms.
  const ghostRun = useRef<{ frames: number[]; timer: number }>({ frames: [], timer: 0 });
  const stopGhost = useCallback(() => {
    for (const id of ghostRun.current.frames) cancelAnimationFrame(id);
    window.clearTimeout(ghostRun.current.timer);
    ghostRun.current = { frames: [], timer: 0 };
  }, []);

  const dlg = useHudDialog({
    owner: LOCK_OWNER,
    closeMs: CLOSE_MS,
    closeMsReduced: CLOSE_MS_REDUCED,
    // spec §3.2: back to the tile of the account shown last (after any number of switches); a sweep that waited for
    // the close runs now (spec §3.5)
    onClosed: (returnTo) => {
      setAnnounce('');
      stopGhost();
      setGhost(null);
      setOutgoing(null);
      (buttonOf(visibleRef.current[currentRef.current]?.key) ?? returnTo)?.focus();
      if (sweepPending.current) {
        sweepPending.current = false;
        sweepNow();
      }
    },
  });
  const { open: openDialog, requestClose, state: dialogState } = dlg;
  const dialogStateRef = useRef(dialogState);
  dialogStateRef.current = dialogState;

  /** The sweep of hydration and visibilitychange: never while the dialog is open (it runs after the close). */
  const requestSweep = useCallback(() => {
    if (dialogStateRef.current !== 'closed') {
      sweepPending.current = true;
      return;
    }
    sweepNow();
  }, [sweepNow]);

  // The opening click never checks freshness (spec §3.5: a card does not open and vanish).
  const openAt = useCallback(
    (index: number) => {
      const tile = visibleRef.current[index];
      const origin = buttonOf(tile?.key);
      if (!tile || !origin || removedRef.current.has(tile.key)) return;
      currentRef.current = index;
      setCurrent(index);
      setAnnounce('');
      setAnim('intro');
      setOpenSeq((n) => n + 1);
      setOutgoing(null);
      // count-up only on this account's first open in this visit, never under reduced motion (spec §3.6, G-007)
      setCountFor(!prefersReducedNow() && !seen.current.has(tile.key) ? tile.key : null);
      seen.current.add(tile.key);
      openDialog(origin);
    },
    [openDialog],
  );

  // The mount swap (spec §3.1): the first client render equals the SSR <details>; this effect turns them into buttons.
  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const details = [...row.querySelectorAll<HTMLDetailsElement>('details.acct-tile')];
    const keys = shown.map((tile) => tile.key);
    const active = document.activeElement;
    const focused = details.findIndex((d) => active !== null && d.contains(active));
    if (focused >= 0) focusOnSwap.current = keys[focused] ?? null;
    // A toggle still queued at mount belongs to a click just before hydration: open that account's dialog. A card
    // opened earlier (its toggle already fired) is simply folded into its button.
    const mountedAt = performance.now();
    const offs = details.map((d, index) => {
      const onToggle = () => {
        const key = keys[index];
        if (d.open && key !== undefined && performance.now() - mountedAt <= TOGGLE_WINDOW_MS) setOpenRequest(key);
      };
      d.addEventListener('toggle', onToggle, { once: true });
      return () => d.removeEventListener('toggle', onToggle);
    });
    const stop = () => {
      for (const off of offs) off();
    };
    const timer = window.setTimeout(stop, TOGGLE_WINDOW_MS);
    setLive(true);
    return () => {
      window.clearTimeout(timer);
      stop();
    };
    // mount only: `shown` is the SSR list
  }, []);

  useLayoutEffect(() => {
    if (!live || focusOnSwap.current === null) return;
    buttonOf(focusOnSwap.current)?.focus();
    focusOnSwap.current = null;
  }, [live]);

  // the stale sweep: once on hydration, then whenever the page becomes visible again
  useEffect(() => {
    if (!live) return;
    requestSweep();
    const onVisible = () => {
      if (document.visibilityState === 'visible') requestSweep();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [live, requestSweep]);

  useLayoutEffect(() => {
    const target = focusAfterSweep.current;
    if (target === null) return;
    focusAfterSweep.current = null;
    if (target === 'caption') capRef.current?.focus();
    else buttonOf(target)?.focus();
  }, [removed]);

  useEffect(() => {
    if (!live || openRequest === null) return;
    setOpenRequest(null);
    openAt(visibleRef.current.findIndex((tile) => tile.key === openRequest));
  }, [live, openRequest, openAt]);

  // The ghost frame (spec §3.6; full motion only): opening flies from the tile to the panel (0–320 ms) and is removed
  // when the panel has faded in (380 ms); closing flies back to the current tile after the 80 ms fade (220 ms).
  useEffect(() => {
    if (dialogState !== 'opening' && dialogState !== 'closing') return;
    stopGhost();
    if (prefersReducedNow()) return;
    const panel = boxOf(panelRef.current);
    const tileBox = boxOf(buttonOf(visibleRef.current[currentRef.current]?.key)?.querySelector('.acct-tile__frame'));
    if (!panel || !tileBox) return;
    const opening = dialogState === 'opening';
    const from = opening ? tileBox : panel;
    const to = opening ? panel : tileBox;
    setGhost({ base: panel, at: from, ms: 0, delay: 0 });
    const run = ghostRun.current;
    run.frames.push(
      requestAnimationFrame(() => {
        run.frames.push(
          requestAnimationFrame(() =>
            setGhost({ base: panel, at: to, ms: opening ? TL.ghost[1] - TL.ghost[0] : TL.closeGhost, delay: opening ? TL.ghost[0] : TL.closeFade }),
          ),
        );
      }),
    );
    if (opening) run.timer = window.setTimeout(() => setGhost(null), TL.dialog[1]);
  }, [dialogState, stopGhost]);
  useEffect(() => stopGhost, [stopGhost]);

  // the outgoing copy of a switch fades out with the incoming card and is then removed
  useEffect(() => {
    if (outgoing === null) return;
    const timer = window.setTimeout(() => setOutgoing(null), SWITCH_MS);
    return () => window.clearTimeout(timer);
  }, [outgoing]);

  const switchBy = useCallback(
    (step: number) => {
      const list = visibleRef.current;
      const count = list.length;
      if (count < 2) return;
      const from = list[currentRef.current];
      const next = (((currentRef.current + step) % count) + count) % count;
      const tile = list[next];
      if (!tile) return;
      currentRef.current = next;
      setCurrent(next);
      setAnim('switch');
      setCountFor(null); // switching shows final values (spec §3.6)
      seen.current.add(tile.key);
      setOutgoing(from && !prefersReducedNow() ? { tile: from, seq: Date.now() } : null);
      setAnnounce(`${fill(labels.position, { n: next + 1, total: count })} · ${tile.name} · ${tile.card?.title ?? ''}`);
    },
    [labels.position],
  );

  const onDialogKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    if (dialogState !== 'open' && dialogState !== 'opening') return;
    if (event.target instanceof Element && event.target.closest(TEXT_ENTRY)) return;
    event.preventDefault();
    switchBy(event.key === 'ArrowRight' ? 1 : -1);
  };

  if (total === 0) return <div className="acct-row acct-row--empty" />;

  const index = Math.min(current, total - 1);
  const tile = visible[index] as AccountTile;
  const card = tile.card as NonNullable<AccountTile['card']>;
  const at = (step: number): AccountTile => visible[(((index + step) % total) + total) % total] as AccountTile;
  const describedBy = card.riot !== undefined || card.fetchedAtText !== undefined ? descId : undefined;

  return (
    <div className="acct-links">
      <p className="acct-links__cap hud-label" tabIndex={-1} ref={capRef}>
        {lang === 'ko' && <span className="hud-label__ko">{labels.caption}</span>}
        <span className="hud-label__en" lang="en">
          {labels.captionEn}
        </span>
      </p>
      <ul className="acct-row" role="list" ref={rowRef}>
        {(live ? visible : shown).map((t, i) => (
          <li key={t.key} className="acct-row__item">
            {live ? (
              <button
                ref={(el) => {
                  if (el) buttonRefs.current.set(t.key, el);
                  else buttonRefs.current.delete(t.key);
                }}
                type="button"
                className="acct-tile acct-tile__sum"
                style={tintStyle(t)}
                aria-haspopup="dialog"
                aria-controls="acct-dlg"
                data-current={dialogState !== 'closed' && i === index ? '' : undefined}
                onClick={() => openAt(i)}
              >
                <TileFace tile={t} />
              </button>
            ) : (
              <Tile tile={t} labels={labels} lang={lang} />
            )}
          </li>
        ))}
      </ul>
      {live && (
        <dialog
          ref={dlg.dialogRef}
          id="acct-dlg"
          className="acct-dlg"
          data-state={dialogState}
          aria-labelledby="acct-game acct-title"
          aria-describedby={describedBy}
          style={tintStyle(tile)}
          onKeyDown={onDialogKeyDown}
        >
          <div className="acct-dlg__panel" ref={panelRef}>
            <div className="acct-dlg__head">
              <div className="acct-dlg__heading">
                <h2 id="acct-game" className="acct-dlg__game">
                  {tile.name}
                </h2>
                <p className="acct-dlg__profile" lang="en">
                  {tile.head}
                </p>
              </div>
              <div className="acct-dlg__controls">
                {total > 1 && (
                  <>
                    <p className="acct-dlg__pos">{fill(labels.position, { n: index + 1, total })}</p>
                    <button type="button" className="acct-dlg__nav acct-dlg__prev" aria-label={fill(labels.prev, { game: at(-1).name })} onClick={() => switchBy(-1)}>
                      <span aria-hidden="true">‹</span>
                    </button>
                    <button type="button" className="acct-dlg__nav acct-dlg__next" aria-label={fill(labels.next, { game: at(1).name })} onClick={() => switchBy(1)}>
                      <span aria-hidden="true">›</span>
                    </button>
                  </>
                )}
                <button type="button" className="acct-dlg__close" data-initial-focus="" onClick={() => requestClose('button')}>
                  <span className="acct-dlg__close-x" aria-hidden="true">
                    ×
                  </span>
                  <span className="acct-dlg__close-label">{labels.close}</span>
                </button>
              </div>
              {/* the head's bracket line (spec §3.6 "머리 괄호 선": scaleX 0→1 from the left) */}
              <span className="acct-dlg__rule" aria-hidden="true" style={{ animationDelay: `${TL.rule[0]}ms`, animationDuration: `${TL.rule[1] - TL.rule[0]}ms` }} />
            </div>
            {/* a keyboard-focusable scroller (WCAG 2.1.1): a card without a link can still be scrolled from the keyboard */}
            <div className="acct-dlg__body" tabIndex={0}>
              {/* The card region: the only part that changes on a switch (a 180 ms cross-fade). */}
              <div className="acct-dlg__cards">
                {outgoing !== null && outgoing.tile.card !== undefined && (
                  <div key={`out:${outgoing.tile.key}:${outgoing.seq}`} className="acct-dlg__card acct-dlg__card--out" aria-hidden="true" inert>
                    <AccountCard tile={outgoing.tile} card={outgoing.tile.card} labels={labels} lang={lang} mode="out" />
                  </div>
                )}
                <div key={`${tile.key}:${openSeq}`} className="acct-dlg__card" data-anim={anim}>
                  <AccountCard
                    tile={tile}
                    card={card}
                    labels={labels}
                    lang={lang}
                    mode="dialog"
                    descId={descId}
                    countUp={countFor === tile.key}
                    intro={anim === 'intro'}
                    reduce={reduce}
                  />
                </div>
              </div>
            </div>
            <p className="sr-only" role="status">
              {announce}
            </p>
          </div>
          {ghost !== null && <GhostFrame ghost={ghost} />}
        </dialog>
      )}
    </div>
  );
}
