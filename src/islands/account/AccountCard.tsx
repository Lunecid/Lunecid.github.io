// One account card (account-link spec §3.2 "몸 1", §3.3, §3.4, §3.7; plan AL-12; fix-brief A-01 2–3, A-02 2–5).
// Order: banner → avatar + title (+ subtitle) → <dl> stats → item row → the Steam profile link, or on a Riot tile that
// tile's one link and the external-site line → the fetched-at line (not on Riot tiles) → the data and notice lines.
// Three uses, one markup:
//   - 'static': inside the SSR <details> (no JavaScript needed, G-010); carries the mono profile head;
//   - 'dialog': the card region of the dialog; the title is #acct-title, the fetched-at line (or the Riot external line)
//     carries the dialog's aria-describedby id, numbers may count up (first open only) and the open timeline may run;
//   - 'out': the outgoing copy during a switch's cross-fade (no ids, no count-up, no timeline).
// No landmark or labelled region (G-009). Every free text (nicknames, game names, Riot IDs) is a JSX text node.
import type { CSSProperties, JSX } from 'react';
import type { Lang } from '../../i18n/ui';
import type { AccountCardView, AccountLinksLabels, AccountStatView, AccountTile } from '../../lib/account-view';
import type { IslandImage } from '../../lib/island-image';
import { useCountUp } from '../../lib/use-count-up';

/** The open timeline in ms (spec §3.6); CLOSE_MS in AccountLinks.tsx = closeFade + closeGhost. */
export const TL = {
  backdrop: [0, 200],
  ghost: [0, 320],
  dialog: [260, 380],
  rule: [180, 420],
  head: [300, 650],
  stats: [450, 1250],
  statGap: 80,
  items: [800, 1200],
  itemGap: 60,
  foot: [1100, 1400],
  closeFade: 80,
  closeGhost: 220,
} as const;

/** At most four stats and four items per card (spec §3.2); the last one still ends inside its window. */
const MAX_ROWS = 4;
const STAT_MS = TL.stats[1] - TL.stats[0] - (MAX_ROWS - 1) * TL.statGap;
const ITEM_MS = TL.items[1] - TL.items[0] - (MAX_ROWS - 1) * TL.itemGap;

export type AccountCardMode = 'static' | 'dialog' | 'out';

export interface AccountCardProps {
  tile: AccountTile;
  card: AccountCardView;
  labels: AccountLinksLabels;
  lang: Lang;
  mode: AccountCardMode;
  /** dialog: the id of the line the dialog's aria-describedby points at. */
  descId?: string;
  /** dialog: count the numbers up this time (the account's first open in this visit, full motion). */
  countUp?: boolean;
  /** dialog: run the open timeline (set when the card was mounted by an open, not by a switch). */
  intro?: boolean;
  /** The site's reduced-motion flag (either path); a count-up in progress jumps to the final value. */
  reduce?: boolean;
}

/** animation-delay/-duration of one timeline step, set through the CSSOM (client-only dialog; CSP style-src-attr). */
const step = (start: number, ms: number): CSSProperties => ({ animationDelay: `${start}ms`, animationDuration: `${ms}ms` });

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
      <span className="acct-card__ext" aria-hidden="true">
        ↗
      </span>
      <span className="sr-only">{labels.newTab}</span>
    </a>
  );
}

const numberFormat = (lang: Lang) => new Intl.NumberFormat(lang === 'ko' ? 'ko-KR' : 'en-US');

/** A number counting up (spec §3.6): the visible digits are aria-hidden, the final value is the accessible text. */
function CountValue({ stat, to, index, lang, reduce }: { stat: AccountStatView; to: number; index: number; lang: Lang; reduce: boolean }): JSX.Element {
  const fmt = numberFormat(lang);
  const base = fmt.format(to);
  const suffix = stat.display.startsWith(base) ? stat.display.slice(base.length) : '';
  const shown = useCountUp(to, { delayMs: TL.stats[0] + index * TL.statGap, durationMs: STAT_MS, reduce });
  return (
    <>
      <span className="tnum" aria-hidden="true">
        {fmt.format(shown)}
        {suffix}
      </span>
      <span className="sr-only">{stat.display}</span>
    </>
  );
}

export default function AccountCard({ tile, card, labels, lang, mode, descId, countUp = false, intro = false, reduce = false }: AccountCardProps): JSX.Element {
  const dialog = mode === 'dialog';
  const run = dialog && intro;
  const counting = dialog && countUp && !reduce;
  const notices = card.notices.flatMap((key) => labels.notices[key] ?? []);
  const describe = (id: boolean) => (dialog && id && descId !== undefined ? descId : undefined);
  const riotLine = card.riot !== undefined;
  const foot = run ? step(TL.foot[0], TL.foot[1] - TL.foot[0]) : undefined;
  return (
    <div className={`acct-card acct-card--${mode === 'static' ? 'static' : 'dlg'}`}>
      {card.banner && (
        <div className="acct-card__banner">
          <Img image={card.banner} alt="" />
        </div>
      )}
      <div className="acct-card__id" data-tl={run ? 'rise' : undefined} style={run ? step(TL.head[0], TL.head[1] - TL.head[0]) : undefined}>
        {card.avatar && (
          <div className="acct-card__avatar">
            <Img image={card.avatar} alt={labels.avatarAlt.replace('{title}', card.title)} />
          </div>
        )}
        <div className="acct-card__names">
          {mode === 'static' && (
            <p className="acct-card__head" lang="en">
              {tile.head}
            </p>
          )}
          <p className="acct-card__title" id={dialog ? 'acct-title' : undefined}>
            {card.title}
          </p>
          {card.subtitle !== undefined && <p className="acct-card__sub">{card.subtitle}</p>}
        </div>
      </div>
      {card.stats.length > 0 && (
        <dl className="acct-card__stats">
          {card.stats.map((s, i) => (
            <div key={s.key} className="acct-card__stat">
              <dt>{s.label}</dt>
              <dd>{counting && s.countTo !== null ? <CountValue stat={s} to={s.countTo} index={i} lang={lang} reduce={reduce} /> : s.display}</dd>
            </div>
          ))}
        </dl>
      )}
      {card.items.length > 0 && (
        <ul className="acct-card__items" role="list">
          {card.items.map((item, i) => (
            <li key={i} data-tl={run ? 'rise' : undefined} style={run ? step(TL.items[0] + i * TL.itemGap, ITEM_MS) : undefined}>
              {item.image && <Img image={item.image} alt="" className="acct-card__item-img" />}
              <span className="acct-card__item-name">{item.name}</span>
              {item.meta !== undefined && (
                <span className="acct-card__item-meta" lang="en">
                  {item.meta}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="acct-card__foot" data-tl={run ? 'fade' : undefined} style={foot}>
        {card.profileLink !== undefined && <ExternalLink href={card.profileLink} text={tile.head} labels={labels} english />}
        {card.riot && (
          <>
            <ExternalLink href={card.riot.href} text={tile.key === 'tft' ? labels.riot.tft : labels.riot.lol} labels={labels} />
            <p className="acct-card__note" id={describe(true)}>
              {labels.riot.external}
            </p>
          </>
        )}
        {card.fetchedAtText !== undefined && (
          <p className="acct-card__asof" id={describe(!riotLine)}>
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
    </div>
  );
}
