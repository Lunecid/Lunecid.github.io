// LINKED ACCOUNTS row under the membership card (account-link spec §3.1, §3.5, §3.7; plan AL-10).
// Server and first client render: one <details class="acct-tile"> per shown tile, its summary the tile and its body
// the whole card as static HTML (G-010: the numbers are in the page without JavaScript). No shown tile → a
// zero-height empty frame and no caption, so the dark release looks exactly as before (R-4, R-8).
// AL-11 swaps the tiles for buttons + one <dialog> after mount; this part reads no URL and makes no request.
// Every free text (nicknames, game names, Riot IDs) is a JSX text node.
import type { CSSProperties, JSX, ReactNode } from 'react';
import type { Lang } from '../i18n/ui';
import type { AccountCardView, AccountLinksLabels, AccountTile } from '../lib/account-view';
import type { IslandImage } from '../lib/island-image';
import './AccountLinks.css';

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

function Tile({ tile, labels }: { tile: AccountTile; labels: AccountLinksLabels }): JSX.Element {
  return (
    <details className="acct-tile" style={{ '--acct-tint': tile.tint } as CSSProperties}>
      <summary className="acct-tile__sum">
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
      </summary>
      {tile.card && <StaticCard tile={tile} card={tile.card} labels={labels} />}
    </details>
  );
}

export default function AccountLinks({ lang, tiles, labels }: AccountLinksProps): JSX.Element {
  const shown = tiles.filter((tile) => tile.state === 'shown' && tile.card !== undefined);
  if (shown.length === 0) return <div className="acct-row acct-row--empty" />;
  return (
    <div className="acct-links">
      <p className="acct-links__cap hud-label">
        {lang === 'ko' && <span className="hud-label__ko">{labels.caption}</span>}
        <span className="hud-label__en" lang="en">
          {labels.captionEn}
        </span>
      </p>
      <ul className="acct-row" role="list">
        {shown.map((tile) => (
          <li key={tile.key} className="acct-row__item">
            <Tile tile={tile} labels={labels} />
          </li>
        ))}
      </ul>
    </div>
  );
}
