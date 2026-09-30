// LINKED ACCOUNTS row under the membership card (account-link spec §3.1, §3.5, §3.7; plan AL-10).
// Server and first client render: one <details class="acct-tile"> per shown tile, its summary the tile and its body
// the whole card as static HTML (G-010: the numbers are in the page without JavaScript). No shown tile → a
// zero-height empty frame and no caption, so the dark release looks exactly as before (R-4, R-8).
// After mount (AL-11) the tiles become buttons that open one native <dialog> (spec §3.2): the shell comes from
// src/lib/use-hud-dialog.ts (ImageViewer's pattern, DV-2); ←/→ and ‹ › switch accounts inside the one dialog, an
// off-screen role="status" announces each switch, and closing returns focus to the account shown last.
// The island reads no URL and makes no request. Every free text (nicknames, game names, Riot IDs) is a JSX text node.
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type JSX, type KeyboardEvent, type ReactNode } from 'react';
import type { Lang } from '../i18n/ui';
import type { AccountCardView, AccountLinksLabels, AccountTile } from '../lib/account-view';
import type { IslandImage } from '../lib/island-image';
import { useHudDialog } from '../lib/use-hud-dialog';
import './AccountLinks.css';

/** Close time (spec §3.6): the 80 ms dialog fade + the 220 ms return of the ghost frame (DV-2). */
export const CLOSE_MS = 300;
/** Close time under reduced motion (either path): one 150 ms opacity fade (spec §3.6, DV-2). */
export const CLOSE_MS_REDUCED = 150;
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

function Img({ image, alt, className }: { image: IslandImage; alt: string; className?: string }): JSX.Element {
  const img = (
    <img
      className={className}
      src={image.src}
      srcSet={image.srcSet}
      sizes={image.sizes}
      width={image.width}
      height={image.height}
      alt={alt}
      loading="lazy"
      decoding="async"
    />
  );
  if (!image.avifSrcSet) return img;
  return (
    <picture>
      <source type="image/avif" srcSet={image.avifSrcSet} sizes={image.sizes} />
      {img}
    </picture>
  );
}

/** A link out (new tab, no referrer, no nofollow: Valve's terms forbid nofollow on Steam links, spec §3.3). */
function ExternalLink({ href, text, labels, english }: { href: string; text: string; labels: AccountLinksLabels; english?: boolean }): JSX.Element {
  return (
    <a className="acct-card__link" href={href} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
      {english ? <span lang="en">{text}</span> : text}
      <span className="acct-card__ext" aria-hidden="true">↗</span>
      <span className="sr-only">{labels.newTab}</span>
    </a>
  );
}

function StaticCard({ tile, card, labels }: { tile: AccountTile; card: AccountCardView; labels: AccountLinksLabels }): JSX.Element {
  const notices = card.notices.flatMap((key) => labels.notices[key] ?? []);
  return (
    <div className="acct-card acct-card--static">
      {card.banner && (
        <div className="acct-card__banner">
          <Img image={card.banner} alt="" />
        </div>
      )}
      <div className="acct-card__id">
        {card.avatar && (
          <div className="acct-card__avatar">
            <Img image={card.avatar} alt={labels.avatarAlt.replace('{title}', card.title)} />
          </div>
        )}
        <div className="acct-card__names">
          <p className="acct-card__head" lang="en">{tile.head}</p>
          <p className="acct-card__title">{card.title}</p>
          {card.subtitle !== undefined && <p className="acct-card__sub">{card.subtitle}</p>}
        </div>
      </div>
      {card.stats.length > 0 && (
        <dl className="acct-card__stats">
          {card.stats.map((s) => (
            <div key={s.key} className="acct-card__stat">
              <dt>{s.label}</dt>
              <dd>{s.display}</dd>
            </div>
          ))}
        </dl>
      )}
      {card.items.length > 0 && (
        <ul className="acct-card__items" role="list">
          {card.items.map((item, i) => (
            <li key={i}>
              {item.image && <Img image={item.image} alt="" className="acct-card__item-img" />}
              <span className="acct-card__item-name">{item.name}</span>
              {item.meta !== undefined && <span className="acct-card__item-meta" lang="en">{item.meta}</span>}
            </li>
          ))}
        </ul>
      )}
      {card.profileLink !== undefined && <ExternalLink href={card.profileLink} text={tile.head} labels={labels} english />}
      {card.riot && (
        <>
          <ExternalLink href={card.riot.href} text={tile.key === 'tft' ? labels.riot.tft : labels.riot.lol} labels={labels} />
          <p className="acct-card__note">{labels.riot.external}</p>
        </>
      )}
      {card.fetchedAtText !== undefined && (
        <p className="acct-card__asof">
          {labels.fetchedAt} {card.fetchedAtText}
        </p>
      )}
      {card.dataLine !== undefined && <p className="acct-card__data">{card.dataLine}</p>}
      {notices.length > 0 && (
        <div className="acct-card__notices">
          {notices.map((line, i) => (
            <p key={i} lang={line.english ? 'en' : undefined}>
              {line.text}
            </p>
          ))}
        </div>
      )}
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

function Tile({ tile, labels }: { tile: AccountTile; labels: AccountLinksLabels }): JSX.Element {
  return (
    <details className="acct-tile" style={tintStyle(tile)}>
      <summary className="acct-tile__sum">
        <TileFace tile={tile} />
      </summary>
      {tile.card && <StaticCard tile={tile} card={tile.card} labels={labels} />}
    </details>
  );
}

const fill = (template: string, values: Record<string, string | number>): string =>
  template.replace(/\{(\w+)\}/g, (whole, name: string) => (Object.hasOwn(values, name) ? String(values[name]) : whole));

export default function AccountLinks({ lang, tiles, labels }: AccountLinksProps): JSX.Element {
  const shown = tiles.filter((tile) => tile.state === 'shown' && tile.card !== undefined);
  const total = shown.length;
  const rowRef = useRef<HTMLUListElement>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [live, setLive] = useState(false);
  const focusOnSwap = useRef<number | null>(null);
  const [openRequest, setOpenRequest] = useState<number | null>(null);
  const [current, setCurrent] = useState(0);
  const currentRef = useRef(0);
  const [announce, setAnnounce] = useState('');
  const descId = useId();

  const dlg = useHudDialog({
    owner: LOCK_OWNER,
    closeMs: CLOSE_MS,
    closeMsReduced: CLOSE_MS_REDUCED,
    // spec §3.2: back to the tile of the account shown last (after any number of switches)
    onClosed: (returnTo) => {
      setAnnounce('');
      (buttonRefs.current[currentRef.current] ?? returnTo)?.focus();
    },
  });
  const { open: openDialog, requestClose, state: dialogState } = dlg;

  const openAt = useCallback(
    (index: number) => {
      const origin = buttonRefs.current[index];
      if (!origin) return;
      currentRef.current = index;
      setCurrent(index);
      setAnnounce('');
      openDialog(origin);
    },
    [openDialog],
  );

  // The mount swap (spec §3.1): the first client render equals the SSR <details>; this effect turns them into buttons.
  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const details = [...row.querySelectorAll<HTMLDetailsElement>('details.acct-tile')];
    const active = document.activeElement;
    const focused = details.findIndex((d) => active !== null && d.contains(active));
    if (focused >= 0) focusOnSwap.current = focused;
    // A toggle still queued at mount belongs to a click just before hydration: open that account's dialog. A card
    // opened earlier (its toggle already fired) is simply folded into its button.
    const mountedAt = performance.now();
    const offs = details.map((d, index) => {
      const onToggle = () => {
        if (d.open && performance.now() - mountedAt <= TOGGLE_WINDOW_MS) setOpenRequest(index);
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
  }, []);

  useLayoutEffect(() => {
    if (!live || focusOnSwap.current === null) return;
    buttonRefs.current[focusOnSwap.current]?.focus();
    focusOnSwap.current = null;
  }, [live]);

  useEffect(() => {
    if (!live || openRequest === null) return;
    setOpenRequest(null);
    openAt(openRequest);
  }, [live, openRequest, openAt]);

  const switchBy = useCallback(
    (step: number) => {
      if (total < 2) return;
      const next = (((currentRef.current + step) % total) + total) % total;
      const tile = shown[next];
      if (!tile) return;
      currentRef.current = next;
      setCurrent(next);
      setAnnounce(`${fill(labels.position, { n: next + 1, total })} · ${tile.name} · ${tile.card?.title ?? ''}`);
    },
    [total, shown, labels.position],
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
  const tile = shown[index] as AccountTile;
  const card = tile.card as AccountCardView;
  const at = (step: number): AccountTile => shown[(((index + step) % total) + total) % total] as AccountTile;
  const describedBy = card.riot !== undefined || card.fetchedAtText !== undefined ? descId : undefined;

  return (
    <div className="acct-links">
      <p className="acct-links__cap hud-label">
        {lang === 'ko' && <span className="hud-label__ko">{labels.caption}</span>}
        <span className="hud-label__en" lang="en">
          {labels.captionEn}
        </span>
      </p>
      <ul className="acct-row" role="list" ref={rowRef}>
        {shown.map((t, i) => (
          <li key={t.key} className="acct-row__item">
            {live ? (
              <button
                ref={(el) => {
                  buttonRefs.current[i] = el;
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
              <Tile tile={t} labels={labels} />
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
          </div>
          <div className="acct-dlg__body">
            {/* The card region (AL-12 fills it with the full card); it alone changes on a switch. */}
            <div className="acct-dlg__card" key={tile.key}>
              <div id="acct-title" className="acct-dlg__title">
                {card.title}
              </div>
              {card.riot !== undefined ? (
                <p id={descId} className="acct-card__note">
                  {labels.riot.external}
                </p>
              ) : (
                card.fetchedAtText !== undefined && (
                  <p id={descId} className="acct-card__asof">
                    {labels.fetchedAt} {card.fetchedAtText}
                  </p>
                )
              )}
            </div>
          </div>
          <p className="sr-only" role="status">
            {announce}
          </p>
        </dialog>
      )}
    </div>
  );
}
