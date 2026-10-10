import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LazyMotion, domAnimation, motion } from 'motion/react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AccountFeed } from '../../src/lib/generated';
import { preloadImage, type IslandImage } from '../../src/lib/island-image';

vi.mock('../../src/lib/island-image', () => ({ preloadImage: vi.fn(() => Promise.resolve()) }));
vi.mock('../../src/lib/sound', () => ({ playSfx: vi.fn(() => Promise.resolve()) }));

import FavoriteGames, {
  MAX_BADGES,
  MAX_STATS,
  TL,
  resolveAccount,
  type FavoriteGame,
  type FavoriteGamesProps,
} from '../../src/islands/FavoriteGames';

const img = (id: string): IslandImage => ({ src: `/${id}.webp`, srcSet: `/${id}-480.webp 480w`, sizes: '100vw', width: 1600, height: 900 });

const GAMES: FavoriteGame[] = [
  {
    id: 'zzz', tabTitle: '젠레스 존 제로', tabCaption: 'ZENLESS ZONE ZERO', locked: false,
    title: ['Zenless', 'Zone Zero'], subtitle: '젠레스 존 제로 · HoYoverse', why: '도시 판타지 세계관을 좋아합니다.',
    meta: ['플레이 2024 –'], art: { image: img('remielle'), objectPosition: '58% 12%' }, tint: 'remielle',
    account: { key: 'enka-zzz', head: 'INTER-KNOT PROFILE' },
  },
  {
    id: 'genshin', tabTitle: '원신', tabCaption: 'GENSHIN IMPACT', locked: false,
    title: ['Genshin', 'Impact'], subtitle: '원신 · HoYoverse', why: '열린 세계를 탐험합니다.',
    art: { image: img('eula'), objectPosition: '52% 8%' }, tint: 'eula',
    account: { key: 'enka-genshin', head: 'ADVENTURER PROFILE' },
  },
  { id: 'lol', tabTitle: '리그 오브 레전드', tabCaption: '계정 연동 준비 중', locked: true, title: ['League', 'of Legends'], account: { key: 'riot', head: 'SUMMONER PROFILE' } },
  { id: 'dnf', tabTitle: '던전앤파이터', tabCaption: '계정 연동 준비 중', locked: true, title: ['Dungeon', '& Fighter'], account: { key: 'neople', head: 'CHARACTER PROFILE' } },
  { id: 'steam', tabTitle: 'Steam 라이브러리', tabCaption: '계정 연동 준비 중', locked: true, title: ['Steam', 'Library'], account: { key: 'steam', head: 'STEAM PROFILE' } },
];

const LABELS: FavoriteGamesProps['labels'] = {
  tablist: '좋아하는 게임 목록', fetchedAt: '기준 시각', source: '출처', progress: '진행도',
};

function feed(over: Partial<AccountFeed> = {}): AccountFeed {
  return {
    schemaVersion: 1, platform: 'enka-zzz', status: 'ok',
    fetchedAt: new Date(Date.now() - 3_600_000).toISOString(), maxAgeDays: 7, attribution: 'Enka.Network',
    cards: [{
      title: 'Lunecid', subtitle: 'Inter-Knot Lv. 60',
      stats: [
        { label: 'A', value: 1200 }, { label: 'B', value: 340 }, { label: 'C', value: 56 },
        { label: 'D', value: 7 }, { label: 'E', value: 8000 }, { label: 'F', value: 99 },
      ],
      progress: { label: 'Achievements', value: 40 },
      badges: ['B1', 'B2', 'B3', 'B4', 'B5'],
    }],
    ...over,
  };
}

function props(over: Partial<FavoriteGamesProps> = {}): FavoriteGamesProps {
  return { lang: 'ko', heading: { caption: 'FAVORITE GAMES', title: '좋아하는 게임' }, games: GAMES, accounts: {}, credit: '캐릭터 이미지 © COGNOSPHERE', labels: LABELS, ...over };
}

afterEach(() => {
  document.documentElement.dataset.motion = 'full';
});

describe('FavoriteGames', () => {
  it('fix round 1: caption-only head as in the v4 mockup; the title names the section, visually hidden', () => {
    const { container } = render(<FavoriteGames {...props()} />);
    const heading = screen.getByRole('heading', { level: 2, name: '좋아하는 게임' });
    expect(heading).toHaveClass('sr-only');
    expect(container.querySelector('section.fg')).toHaveAttribute('aria-labelledby', heading.id);
    const caption = container.querySelector('.fg__top .hud-label');
    expect(caption).toHaveAttribute('aria-hidden', 'true');
    expect(caption).toHaveTextContent('FAVORITE GAMES');
    expect(container.querySelector('.fg__top .sec-head__title')).toBeNull();
  });

  it('tablist/tab/tabpanel roles with roving tabindex', () => {
    render(<FavoriteGames {...props()} />);
    expect(screen.getByRole('tablist', { name: '좋아하는 게임 목록' })).toBeInTheDocument();
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(5);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs.map((t) => t.tabIndex)).toEqual([0, -1, -1, -1, -1]);
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', tabs[0].id);
  });

  it('arrow/Home/End move focus without selecting', async () => {
    const user = userEvent.setup();
    render(<FavoriteGames {...props()} />);
    const tabs = screen.getAllByRole('tab');
    tabs[0].focus();
    await user.keyboard('{ArrowDown}');
    expect(tabs[1]).toHaveFocus();
    expect(tabs[1].tabIndex).toBe(0);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false');
    await user.keyboard('{End}');
    expect(tabs[4]).toHaveFocus();
    await user.keyboard('{Home}');
    expect(tabs[0]).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(tabs[4]).toHaveFocus(); // wraps
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('Enter selects an unlocked tab; locked tabs are aria-disabled and never selected', async () => {
    const user = userEvent.setup();
    render(<FavoriteGames {...props()} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.slice(2).every((t) => t.getAttribute('aria-disabled') === 'true')).toBe(true);
    expect(tabs[0]).not.toHaveAttribute('aria-disabled');
    tabs[1].focus();
    await user.keyboard('{Enter}');
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[0]).toHaveAttribute('aria-selected', 'false');
    tabs[2].focus();
    await user.keyboard('{Enter}');
    await user.click(tabs[3]);
    expect(tabs[2]).toHaveAttribute('aria-selected', 'false');
    expect(tabs[3]).toHaveAttribute('aria-selected', 'false');
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
  });

  it('P2-26: on English pages the unlocked tab caption (a repeat of the title in another case) is hidden; the locked reason still shows', () => {
    const en = render(<FavoriteGames {...props({ lang: 'en' })} />);
    const enTabs = within(en.container).getAllByRole('tab');
    // zzz/genshin are unlocked: tabCaption ('ZENLESS ZONE ZERO' / 'GENSHIN IMPACT') just re-cases tabTitle.
    expect(enTabs[0]).not.toHaveTextContent('ZENLESS ZONE ZERO');
    expect(enTabs[1]).not.toHaveTextContent('GENSHIN IMPACT');
    // lol/dnf/steam are locked: the reason text is not a repeat of the title and must still show.
    expect(enTabs[2]).toHaveTextContent('계정 연동 준비 중');
    expect(enTabs[3]).toHaveTextContent('계정 연동 준비 중');
    expect(enTabs[4]).toHaveTextContent('계정 연동 준비 중');
    en.unmount();

    // On Korean pages the caption is the useful English name alongside the vernacular title, so it stays.
    const ko = render(<FavoriteGames {...props({ lang: 'ko' })} />);
    expect(within(ko.container).getAllByRole('tab')[0]).toHaveTextContent('ZENLESS ZONE ZERO');
    ko.unmount();
  });

  it('resolveAccount: missing feed → locked, error → hidden, stale (isFresh false) → hidden, fresh → ok', () => {
    const now = Date.parse('2026-09-26T00:00:00Z');
    const zzz = GAMES[0];
    expect(resolveAccount(zzz, {}, now)).toEqual({ kind: 'locked' });
    expect(resolveAccount(zzz, { 'enka-zzz': feed({ status: 'error' }) }, now)).toEqual({ kind: 'hidden' });
    const stale = feed({ fetchedAt: '2026-09-10T00:00:00Z', maxAgeDays: 7 });
    expect(resolveAccount(zzz, { 'enka-zzz': stale }, now)).toEqual({ kind: 'hidden' });
    expect(resolveAccount(zzz, { 'enka-zzz': feed({ cards: [] }) }, now).kind).toBe('hidden');
    const fresh = feed({ fetchedAt: '2026-09-25T00:00:00Z' });
    const ok = resolveAccount(zzz, { 'enka-zzz': fresh }, now);
    expect(ok.kind).toBe('ok');
    if (ok.kind === 'ok') expect(ok.card.title).toBe('Lunecid');
    expect(resolveAccount({ ...zzz, account: undefined }, {}, now)).toEqual({ kind: 'hidden' });
  });

  it('noscript fallback present in SSR', () => {
    const html = renderToString(<FavoriteGames {...props()} />);
    expect(html).toMatch(/<noscript>[\s\S]*Zenless Zone Zero[\s\S]*<\/noscript>/);
    expect(html).toContain('role="tablist"');
    // A-03 F-051 (account-link AL-13): the first scene is server-rendered in place (it used to mount after hydration)
    expect(html).toMatch(/<div class="fg__scene" data-art="on"[^>]*>[\s\S]*<h3 class="fg__title" lang="en"[^>]*>Zenless<br\/>Zone Zero<\/h3>/);
    // final fix 2 item 17: every unlocked game's text; round 2 item 5: a plain stage (no tab panel, tab stop or name
    // pointing at a tab that is hidden without JS) until React runs the tabs
    expect(html).toMatch(/<noscript>[\s\S]*Zenless Zone Zero[\s\S]*Genshin Impact[\s\S]*<\/noscript>/);
    const stage = /<div[^>]*class="fg__stage"[^>]*>/.exec(html)?.[0] ?? '';
    expect(stage).toBeTruthy();
    expect(stage).not.toMatch(/role=|tabindex=|aria-labelledby=/i);
  });

  it('after hydration the stage is the tab panel of the selected tab', () => {
    render(<FavoriteGames {...props()} />);
    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveAttribute('tabindex', '0');
    expect(panel).toHaveAttribute('aria-labelledby', screen.getAllByRole('tab')[0].id);
  });

  it('reduced motion shows final counts immediately', async () => {
    document.documentElement.dataset.motion = 'reduce';
    const { container } = render(<FavoriteGames {...props({ accounts: { 'enka-zzz': feed() } })} />);
    await screen.findByText('Lunecid');
    const first = container.querySelector('.fg-acct__row dd [aria-hidden="true"]');
    expect(first?.textContent).toBe('1,200');
  });

  it('full motion starts counts at zero', async () => {
    const { container } = render(<FavoriteGames {...props({ accounts: { 'enka-zzz': feed() } })} />);
    await screen.findByText('Lunecid');
    const first = container.querySelector('.fg-acct__row dd [aria-hidden="true"]');
    expect(first?.textContent).toBe('0');
    expect(container.querySelector('.fg-acct__row dd .sr-only')?.textContent).toBe('1,200');
  });

  it('renders at most MAX_STATS stats and MAX_BADGES badges', async () => {
    document.documentElement.dataset.motion = 'reduce';
    const { container } = render(<FavoriteGames {...props({ accounts: { 'enka-zzz': feed() } })} />);
    await screen.findByText('Lunecid');
    expect(container.querySelectorAll('.fg-acct__row')).toHaveLength(MAX_STATS);
    expect(container.querySelectorAll('.fg-acct__badges li')).toHaveLength(MAX_BADGES);
  });

  it('D-13: no account card at all when no feed exists (no locked placeholder); the credit only when given', async () => {
    const { container, rerender } = render(<FavoriteGames {...props()} />);
    await waitFor(() => expect(container.querySelector('.fg__scene')).not.toBeNull());
    expect(container.querySelector('.fg-acct')).toBeNull();
    expect(container.querySelector('.fg__scene')?.textContent).not.toContain('🔒');
    // final fix 2 item 9: the credit breaks only between its pieces, and "©" is glued to its owner (no-break space)
    expect(container.querySelector('.fg__credit')?.textContent?.replace(/\u00a0/g, ' ')).toBe('캐릭터 이미지 © COGNOSPHERE');
    expect(container.querySelector('.fg__credit')?.textContent).toContain('©\u00a0COGNOSPHERE');
    rerender(<FavoriteGames {...props({ credit: null })} />);
    expect(container.querySelector('.fg__credit')).toBeNull();
  });

  it('a tab chosen before the scene arms does not lock the tab list', async () => {
    const user = userEvent.setup();
    let release: () => void = () => undefined;
    // The mount-time preload stays pending, so the scene is not armed yet (no exit animation will ever run).
    vi.mocked(preloadImage).mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
    render(<FavoriteGames {...props()} />);
    const tabs = screen.getAllByRole('tab');
    await user.click(tabs[1]);
    await waitFor(() => expect(tabs[1]).toHaveAttribute('aria-selected', 'true'));
    await user.click(tabs[0]);
    await waitFor(() => expect(tabs[0]).toHaveAttribute('aria-selected', 'true'));
    release();
  });

  describe('F-038: picks made while a scene exits (2026-10-10: a queued pick froze the stage)', () => {
    const titleText = (root: ParentNode) => root.querySelector('.fg__scene .fg__title')?.textContent;
    // three playable games, so a quick run of picks has a pick in between that must never show
    const dnf: FavoriteGame = { ...GAMES[3], tabCaption: 'DUNGEON & FIGHTER', locked: false, subtitle: '던전앤파이터 · Neople', why: '타격감을 좋아합니다.' };

    it('the last pick shows, with nothing left in between, and the stage still follows the tabs', async () => {
      const user = userEvent.setup();
      const { container } = render(<FavoriteGames {...props({ games: [GAMES[0], GAMES[1], dnf] })} />);
      const tabs = screen.getAllByRole('tab');
      await user.click(tabs[1]); // Zenless Zone Zero starts its exit (TL.exit)
      await user.click(tabs[2]); // picked before that exit ends
      expect(tabs[2]).toHaveAttribute('aria-selected', 'true');
      await waitFor(() => expect(titleText(container)).toBe('Dungeon& Fighter'));
      expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', tabs[2].id);
      expect(container.querySelectorAll('.fg__scene')).toHaveLength(1);
      await user.click(tabs[0]);
      await waitFor(() => expect(titleText(container)).toBe('ZenlessZone Zero'));
      expect(container.querySelectorAll('.fg__scene')).toHaveLength(1);
    });

    it('picking the exiting game again brings it back, and the next pick still switches', async () => {
      const user = userEvent.setup();
      const { container } = render(<FavoriteGames {...props({ games: [GAMES[0], GAMES[1], dnf] })} />);
      const tabs = screen.getAllByRole('tab');
      await user.click(tabs[1]);
      await user.click(tabs[0]); // back to the game whose scene is on its way out
      expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
      // its title is on the stage the whole time (first leaving, then back), so wait for the settled stage: its panel
      // labelled by that tab, and one scene only
      await waitFor(() => {
        expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', tabs[0].id);
        expect(container.querySelectorAll('.fg__scene')).toHaveLength(1);
        expect(titleText(container)).toBe('ZenlessZone Zero');
      });
      await user.click(tabs[2]);
      await waitFor(() => expect(titleText(container)).toBe('Dungeon& Fighter'));
    });

    it('an art decode that ends after the tab changed does not hold the leaving scene', async () => {
      const user = userEvent.setup();
      let release: () => void = () => undefined;
      vi.mocked(preloadImage).mockImplementation((image) =>
        image.src === '/eula.webp' ? new Promise<void>((resolve) => { release = resolve; }) : Promise.resolve(),
      );
      try {
        const { container } = render(<FavoriteGames {...props({ games: [GAMES[0], GAMES[1], dnf] })} />);
        const tabs = screen.getAllByRole('tab');
        await user.click(tabs[1]);
        await waitFor(() => expect(titleText(container)).toBe('GenshinImpact')); // in, Eula still decoding
        await user.click(tabs[2]); // Genshin Impact starts to leave
        release(); // and only now does its art become ready
        await waitFor(() => expect(titleText(container)).toBe('Dungeon& Fighter'));
        expect(container.querySelectorAll('.fg__scene')).toHaveLength(1);
      } finally {
        vi.mocked(preloadImage).mockImplementation(() => Promise.resolve());
      }
    });
  });

  it('with art: the fixed-height art layout; the selected game tint is on and the facts stay chips', async () => {
    const { container } = render(<FavoriteGames {...props()} />);
    await waitFor(() => expect(container.querySelector('.fg__scene')).not.toBeNull());
    expect(container.querySelector('section.fg')).toHaveClass('fg--art');
    expect(container.querySelector('.fg__scene')).toHaveAttribute('data-art', 'on');
    expect(container.querySelector('.fg__chr img')).not.toBeNull();
    expect(container.querySelector('.fg__tint--remielle')).toHaveAttribute('data-on', 'true');
    expect(container.querySelector('.fg__meta')).not.toHaveClass('fg__meta--panel');
  });

  it('D-1 no art: flowing no-art layout, the tint is still on, and the facts become a bracketed HUD panel', async () => {
    const user = userEvent.setup();
    const bare = GAMES.map(({ art: _art, ...game }) => game);
    const { container } = render(<FavoriteGames {...props({ games: bare, credit: null })} />);
    await waitFor(() => expect(container.querySelector('.fg__scene')).not.toBeNull());
    expect(container.querySelector('section.fg')).toHaveClass('fg--no-art');
    expect(container.querySelector('.fg__scene')).toHaveAttribute('data-art', 'off');
    expect(container.querySelector('.fg__chr')).toBeNull();
    expect(container.querySelector('.fg__tint--remielle')).toHaveAttribute('data-on', 'true');
    expect(container.querySelector('.fg__meta')).toHaveClass('fg__meta--panel', 'bracket', 'bracket--sm');
    // Selecting another game moves the tint with it.
    await user.click(screen.getAllByRole('tab')[1]);
    await waitFor(() => expect(container.querySelector('.fg__tint--eula')).toHaveAttribute('data-on', 'true'));
    expect(container.querySelector('.fg__tint--remielle')).toHaveAttribute('data-on', 'false');
  });

  it('D-1 CSS: fixed stage heights only with art; tabs in a top row below 1068px; the 190px list column from 1068px', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/islands/FavoriteGames.css'), 'utf8').replace(/\r\n/g, '\n');
    const block = (min: number): string => new RegExp(String.raw`@media \(min-width: ${min}px\) \{([\s\S]*?)\n\}`).exec(css)?.[1] ?? '';
    // A-03 F-090 (account-link AL-13): the phone reserve per language = the tallest six-game scene measured from 320 to
    // 733px (ko 700px, en 769px, both at the full 420px art band) plus the brief's 3px margin; it was 760px for both
    expect(css).toMatch(/@media \(max-width: 733\.98px\) \{\n  \.fg--art \.fg__stage \{ min-height: 703px; \}\n  \.fg--art \.fg__stage:lang\(en\) \{ min-height: 772px; \}\n\}/);
    expect(css).not.toMatch(/(^|\n)\.fg__stage \{[^}]*min-height/);
    expect(block(734)).toMatch(/\.fg--art \.fg__stage \{ min-height: 520px; \}/); // final fix 2 item 8: the art's own height
    expect(block(734)).not.toMatch(/190px/);
    expect(block(734)).toMatch(/\.fg__list \{ grid-template-columns: repeat\(auto-fit, minmax\(180px, 1fr\)\); \}/);
    expect(block(1068)).toMatch(/\.fg--art \{ height: 600px; \}/);
    // final fix 2 item 8: with two or three games the tabs sit in a row above the copy and the panel is 520px
    expect(block(1068)).toMatch(/\.fg--art\.fg--tabs-row \{ height: 520px; \}/);
    expect(block(1068)).toMatch(/\.fg--art\.fg--tabs-row \.fg__list \{ flex-direction: row;/);
    expect(block(1068)).not.toMatch(/(^|\n)\s*\.fg \{ height/);
    expect(block(1068)).toMatch(/\.fg--no-art \.fg__layout \{[^}]*grid-template-columns: 190px minmax\(0, 1fr\)/);
  });

  it('timeline constants end the account card within 2s', () => {
    expect(TL.badgesAt + (MAX_BADGES - 1) * TL.badgeStagger + TL.badge).toBeLessThanOrEqual(2 + 1e-9);
    expect(TL.linesAt + (3 + MAX_STATS - 1) * TL.lineStagger + TL.count).toBeLessThanOrEqual(2 + 1e-9);
    expect(TL.barAt + TL.bar).toBeLessThanOrEqual(2);
    // G1: faster tab switching for repeated comparison; the art keeps a longer entrance than the copy
    expect(TL.enter).toBe(0.35);
    expect(TL.exit).toBe(0.15);
    expect(TL.art).toBe(0.45);
    expect(TL.copyStagger).toBe(0.04);
    expect(TL.gap).toBe(0.05);
    expect(TL.exit + TL.gap + 3 * TL.copyStagger + TL.enter).toBeLessThanOrEqual(0.75 + 1e-9);
    expect(TL.panel).toBe(0.45);
    expect(TL.lineStagger).toBe(0.08);
    expect(TL.count).toBe(0.8);
  });

  describe('A-03 (account-link AL-13)', () => {
    const scene = (root: ParentNode) => root.querySelector<HTMLElement>('.fg__scene');
    const title = (root: ParentNode) => root.querySelector<HTMLElement>('.fg__scene .fg__title');

    it('F-051: the first client render equals the SSR markup and keeps the server scene in place', async () => {
      const container = document.createElement('div');
      container.innerHTML = renderToString(<FavoriteGames {...props()} />);
      document.body.append(container);
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      let root: Root | undefined;
      try {
        const serverScene = scene(container);
        expect(serverScene).not.toBeNull();
        const errors: unknown[] = [];
        await act(async () => {
          root = hydrateRoot(container, <FavoriteGames {...props()} />, { onRecoverableError: (e) => errors.push(e) });
        });
        expect(errors).toEqual([]);
        expect(consoleError).not.toHaveBeenCalled();
        // the same DOM node after hydration and effects: mounted, not replaced
        expect(scene(container)).toBe(serverScene);
        expect(within(container).getByRole('tabpanel')).toContainElement(serverScene);
      } finally {
        consoleError.mockRestore();
        act(() => root?.unmount());
        container.remove();
      }
    });

    it('F-051: the first scene mounts with initial={false}; entrance variants run only on tab changes', async () => {
      const user = userEvent.setup();
      const { container } = render(<FavoriteGames {...props()} />);
      const first = title(container);
      expect(first).toHaveTextContent('ZenlessZone Zero');
      // no entrance: the final state from the start (riseV "hidden" would be opacity 0, translateY(20px))
      expect(first?.style.opacity).not.toBe('0');
      expect(first?.style.transform).not.toMatch(/translateY\(20px\)/);
      expect(container.querySelector<HTMLElement>('.fg__scene .fg__chr')?.style.opacity).not.toBe('0');
      await user.click(screen.getAllByRole('tab')[1]);
      await waitFor(() => expect(title(container)).toHaveTextContent('GenshinImpact'));
      // a tab change runs the entrance: the new title starts below full opacity
      expect(Number(title(container)?.style.opacity)).toBeLessThan(1);
    });

    it('F-051: setCurrent at once on select; only .fg__chr waits for img.decode()', async () => {
      const user = userEvent.setup();
      let release: () => void = () => undefined;
      vi.mocked(preloadImage).mockImplementation((image) =>
        image.src === '/eula.webp' ? new Promise<void>((resolve) => { release = resolve; }) : Promise.resolve(),
      );
      try {
        const { container } = render(<FavoriteGames {...props()} />);
        await user.click(screen.getAllByRole('tab')[1]);
        // the Genshin copy is in while Eula's art is still decoding (it used to wait for the whole scene)
        await waitFor(() => expect(title(container)).toHaveTextContent('GenshinImpact'));
        expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', screen.getAllByRole('tab')[1].id);
        const chr = container.querySelector<HTMLElement>('.fg__scene .fg__chr');
        expect(chr).not.toBeNull();
        await new Promise((resolve) => setTimeout(resolve, 150));
        expect(chr?.style.opacity).toBe('0'); // held at its hidden state
        release();
        await waitFor(() => expect(Number(chr?.style.opacity)).toBeGreaterThan(0));
      } finally {
        vi.mocked(preloadImage).mockImplementation(() => Promise.resolve());
      }
    });

    it('F-052: m.* components under LazyMotion with domAnimation, strict (no full motion.* bundle)', () => {
      const src = readFileSync(resolve(process.cwd(), 'src/islands/FavoriteGames.tsx'), 'utf8');
      expect(src).toMatch(/<LazyMotion features=\{domAnimation\} strict>/);
      expect(src).toMatch(/import \{[^}]*\bLazyMotion\b[^}]*\bdomAnimation\b[^}]*\} from 'motion\/react'/);
      expect(src).toMatch(/import \* as m from 'motion\/react-m'/);
      expect(src).not.toMatch(/\bmotion\.[a-z]/);
      expect(src).toMatch(/<AnimatePresence[\s\S]*?initial=\{false\}/);
      // strict: a full motion component inside throws, so the island can never pull the whole feature set back in
      const Full = motion.div;
      expect(() => render(<LazyMotion features={domAnimation} strict><Full /></LazyMotion>)).toThrow();
    });

    it('G-020: landscape phones get copy | art columns, a svh-capped art band and stage, and the tablet edge fade', () => {
      const css = readFileSync(resolve(process.cwd(), 'src/islands/FavoriteGames.css'), 'utf8').replace(/\r\n/g, '\n');
      const land = /@media \(max-width: 733\.98px\) and \(orientation: landscape\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
      expect(land).toMatch(/\.fg--art \.fg__scene \{ grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\); grid-template-areas: "copy chr" "acct chr"; \}/);
      expect(land).toMatch(/\.fg__chr \{ height: auto; min-height: min\(420px, 80svh\); margin: 0; \}/);
      expect(land).toMatch(/\.fg--art \.fg__stage(, \.fg--art \.fg__stage:lang\(en\))? \{ min-height: min\(520px, 80svh\); \}/);
      // the tablet rule's four-edge mask (left fade included) serves landscape phones too
      expect(css).toMatch(/@media \(min-width: 734px\) and \(max-width: 1067\.98px\), \(max-width: 733\.98px\) and \(orientation: landscape\) \{\n  \.fg__chr \{/);
    });
  });

  it('F-088: aria-orientation is horizontal with ≤3 games (tabs-row)', () => {
    render(<FavoriteGames {...props({ games: GAMES.slice(0, 2) })} />);
    expect(screen.getByRole('tablist')).toHaveAttribute('aria-orientation', 'horizontal');
  });

  it('F-088: aria-orientation is vertical with more than 3 games', () => {
    render(<FavoriteGames {...props()} />);
    expect(screen.getByRole('tablist')).toHaveAttribute('aria-orientation', 'vertical');
  });
});
