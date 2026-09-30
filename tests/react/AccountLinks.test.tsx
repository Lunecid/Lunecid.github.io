// AL-10: the LINKED ACCOUNTS row, server part (spec §3.1, §3.5, §3.7; plan DV-27: LoL and TFT are separate tiles).
// The tiles come from the real view model over the committed synthetic fixture feeds (tests/fixtures/generated),
// stamped fresh as the SB_E2E_ACCOUNTS=1 build does; islandImage is mocked (no astro:assets in jsdom).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ImageMetadata } from 'astro';
import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// AL-11: the visitor island never loads the management chunk (AL-20 adds the ?manage cases).
// hydrateRoot is driven through React's act() directly (no testing-library render), so declare the act environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const manage = vi.hoisted(() => ({ loaded: false }));
vi.mock('../../src/islands/account/ManagePanel', () => {
  manage.loaded = true;
  return { default: () => null };
});
vi.mock('../../src/lib/sound', () => ({ playSfx: vi.fn(() => Promise.resolve()) }));

vi.mock('../../src/lib/island-image.server', () => ({
  islandImage: vi.fn(async (src: ImageMetadata, widths: number[], sizes: string) => ({
    src: `${src.src}?w=${widths[widths.length - 1]}`,
    srcSet: widths.map((w) => `${src.src}?w=${w} ${w}w`).join(', '),
    avifSrcSet: widths.map((w) => `${src.src}?w=${w}&f=avif ${w}w`).join(', '),
    sizes,
    width: src.width,
    height: src.height,
  })),
}));

import { favoriteGameSchema, type FavoriteGameData } from '../../src/content/schemas';
import { parseYamlList } from '../../src/content/yaml-loader';
import type { Lang } from '../../src/i18n/ui';
import AccountLinks, { CLOSE_MS, CLOSE_MS_REDUCED, TOGGLE_WINDOW_MS } from '../../src/islands/AccountLinks';
import { accountLinksLabels, buildAccountView, type AccountTile } from '../../src/lib/account-view';
import { createGeneratedLoader, freshenFixtureFeeds } from '../../src/lib/generated';

const FIXTURES = join(process.cwd(), 'tests/fixtures/generated');
const readJson = (rel: string): unknown => JSON.parse(readFileSync(join(FIXTURES, rel), 'utf8'));
const files = freshenFixtureFeeds(
  {
    '/g/accounts/enka-genshin.json': readJson('accounts/enka-genshin.json'),
    '/g/accounts/enka-zzz.json': readJson('accounts/enka-zzz.json'),
    '/g/accounts/steam.json': readJson('accounts/steam.json'),
    '/g/links/riot.json': readJson('links/riot.json'),
  },
  new Date().toISOString(),
);
const loader = createGeneratedLoader(files);
const images: Record<string, ImageMetadata> = Object.fromEntries(
  [1, 2, 3, 4, 5, 6].map((n) => {
    const name = `e2efixture0${n}.png`;
    return [name, { src: `/_astro/${name}`, width: 96, height: 96, format: 'png' } as ImageMetadata];
  }),
);

const yamlGames = parseYamlList(readFileSync(join(process.cwd(), 'src/data/favorites.yaml'), 'utf8'), 'games').map((g) => favoriteGameSchema.parse(g));
const TILE_ON: FavoriteGameData[] = yamlGames.map((g) => ({ ...g, integration: { ...g.integration, enabled: ['zzz', 'genshin', 'lol', 'tft', 'steam'].includes(g.id) } }));

async function tilesFor(lang: Lang, opts: { feeds?: boolean } = {}): Promise<AccountTile[]> {
  const on = opts.feeds ?? true;
  return buildAccountView(TILE_ON, on ? loader.accounts() : {}, on ? loader.links() : undefined, images, lang);
}

async function ssr(lang: Lang, tiles?: AccountTile[]): Promise<string> {
  const list = tiles ?? (await tilesFor(lang));
  return renderToString(<AccountLinks lang={lang} tiles={list} labels={accountLinksLabels(lang)} relay={null} steamButton={false} />);
}

const parse = (html: string): Document => new DOMParser().parseFromString(`<!doctype html><body>${html}</body>`, 'text/html');

afterEach(() => vi.restoreAllMocks());

describe('AccountLinks SSR (<details> tiles, no JavaScript needed)', () => {
  it('shown tiles render as details.acct-tile in the order zzz, genshin, lol, tft, steam inside ul.acct-row[role=list]', async () => {
    const doc = parse(await ssr('ko'));
    const row = doc.querySelector('ul.acct-row');
    expect(row?.getAttribute('role')).toBe('list');
    const tiles = [...doc.querySelectorAll('ul.acct-row > li > details.acct-tile')];
    expect(tiles).toHaveLength(5);
    expect(tiles.map((d) => d.querySelector('summary .acct-tile__name')?.textContent)).toEqual(['젠레스 존 제로', '원신', '리그 오브 레전드', '전략적 팀 전투', 'Steam']);
    expect(tiles.map((d) => d.querySelector('summary .acct-tile__glyph')?.textContent)).toEqual(['ZZZ', 'GI', 'LOL', 'TFT', 'STM']);
    for (const d of tiles) expect(d.querySelector(':scope > summary + div.acct-card.acct-card--static')).not.toBeNull();
    const en = parse(await ssr('en'));
    expect([...en.querySelectorAll('details.acct-tile .acct-tile__name')].map((n) => n.textContent)).toEqual([
      'Zenless Zone Zero', 'Genshin Impact', 'League of Legends', 'Teamfight Tactics', 'Steam',
    ]);
  });

  it('visible game name and teaser, the teaser sr text, glyph aria-hidden, no aria-label anywhere', async () => {
    const html = await ssr('ko');
    expect(html).not.toContain('aria-label');
    const doc = parse(html);
    const summaries = [...doc.querySelectorAll('details.acct-tile > summary')];
    const teasers = summaries.map((s) => s.querySelector('.acct-tile__teaser'));
    expect(teasers.map((x) => x?.textContent)).toEqual(['LV 55', 'AR 57', 'op.gg', 'lolchess.gg', 'LV 42']);
    for (const x of teasers) {
      expect(x?.getAttribute('aria-hidden')).toBe('true');
      expect(x?.getAttribute('lang')).toBe('en');
    }
    expect(summaries.map((s) => s.querySelector('.sr-only')?.textContent)).toEqual(['인터노트 레벨 55', '모험 등급 57', 'op.gg 전적 링크', 'lolchess.gg 전적 링크', 'Steam 레벨 42']);
    for (const s of summaries) {
      const frame = s.querySelector('.acct-tile__frame');
      expect(frame?.getAttribute('aria-hidden')).toBe('true');
      expect(frame?.querySelector('.acct-tile__glyph')).not.toBeNull();
    }
  });

  it('the lol static card has exactly one link (op.gg), the tft card exactly one (lolchess.gg); new-tab, no referrer', async () => {
    const doc = parse(await ssr('ko'));
    const [, , lol, tft] = [...doc.querySelectorAll('details.acct-tile')];
    const lolLinks = [...(lol?.querySelectorAll('.acct-card a') ?? [])];
    const tftLinks = [...(tft?.querySelectorAll('.acct-card a') ?? [])];
    expect(lolLinks.map((a) => a.getAttribute('href'))).toEqual(['https://op.gg/lol/summoners/kr/Hide%20on%20bush-KR1']);
    expect(tftLinks.map((a) => a.getAttribute('href'))).toEqual(['https://lolchess.gg/profile/kr/Hide%20on%20bush-KR1']);
    for (const a of [...lolLinks, ...tftLinks]) {
      expect(a.getAttribute('target')).toBe('_blank');
      expect(a.getAttribute('rel')).toBe('noopener noreferrer');
      expect(a.getAttribute('referrerpolicy')).toBe('no-referrer');
      expect(a.querySelector('[aria-hidden="true"]')?.textContent).toBe('↗');
      expect(a.querySelector('.sr-only')?.textContent).toBe('새 탭에서 열림');
    }
    expect(lolLinks[0]?.textContent).toContain('LoL 전적 보기 (op.gg)');
    expect(tftLinks[0]?.textContent).toContain('TFT 전적 보기 (lolchess.gg)');
    // the Riot ID as text, the external-site line, and no fetched-at line (links do not go stale)
    expect(lol?.querySelector('.acct-card')?.textContent).toContain('Hide on bush#KR1');
    expect(lol?.querySelector('.acct-card')?.textContent).toContain('외부 전적 사이트로 이동합니다.');
    expect(lol?.querySelector('.acct-card__asof')).toBeNull();
  });

  it('G-010: the static card holds the numbers, labels and the fetched-at line in the HTML', async () => {
    const doc = parse(await ssr('ko'));
    const [zzz, genshin, , , steam] = [...doc.querySelectorAll('details.acct-tile')];
    const rows = (d: Element | undefined) => [...(d?.querySelectorAll('.acct-card dl > div') ?? [])].map((r) => `${r.querySelector('dt')?.textContent}=${r.querySelector('dd')?.textContent}`);
    expect(rows(genshin)).toEqual(['모험 등급=57', '업적=812', '나선 비경=12층 3방', '환상극=8막']);
    expect(rows(zzz)).toEqual(['인터노트 레벨=55']);
    expect(rows(steam)).toEqual(['Steam 레벨=42']);
    expect(genshin?.querySelector('.acct-card__title')?.textContent).toBe('E2E Fixture GI');
    expect(zzz?.querySelector('.acct-card__sub')?.textContent).toBe('합성 칭호');
    expect(genshin?.querySelector('.acct-card__asof')?.textContent).toMatch(/^기준 시각 \d{4}\.\d{2}\.\d{2} \d{2}:\d{2} KST$/);
    expect(genshin?.querySelector('.acct-card__data')?.textContent).toBe('데이터: Enka.Network');
    expect([...(genshin?.querySelectorAll('.acct-card__items li') ?? [])].map((li) => li.textContent)).toEqual([
      '합성 캐릭터 가Lv 90', '합성 캐릭터 나Lv 80', '합성 캐릭터 다Lv 70', '합성 캐릭터 라Lv 60',
    ]);
    // the per-card notices (spec §9.3): Steam carries the Valve lines, the Riot tiles none
    expect(steam?.querySelector('.acct-card__notices')?.textContent).toContain('Valve Corporation');
    expect(steam?.querySelector('.acct-card a')?.getAttribute('href')).toBe('https://steamcommunity.com/profiles/76561197960435530');
    expect(steam?.querySelector('.acct-card a')?.getAttribute('rel')).not.toContain('nofollow');
  });

  it('images inside the closed details are loading="lazy"; only the avatar has alt text', async () => {
    const doc = parse(await ssr('ko'));
    const imgs = [...doc.querySelectorAll('details.acct-tile img')];
    expect(imgs.length).toBeGreaterThan(0);
    for (const img of imgs) expect(img.getAttribute('loading')).toBe('lazy');
    expect(doc.querySelector('details.acct-tile .acct-card__avatar img')?.getAttribute('alt')).toBe('E2E Fixture ZZZ 프로필 이미지');
    for (const img of doc.querySelectorAll('details.acct-tile .acct-card__items img, details.acct-tile .acct-card__banner img')) expect(img.getAttribute('alt')).toBe('');
  });

  it('the tint arrives as a style custom property (background only)', async () => {
    const html = await ssr('ko');
    expect(html).toContain('style="--acct-tint:var(--tint-remielle)"');
    expect(html).toContain('style="--acct-tint:var(--tint-eula)"');
    expect(html).toContain('style="--acct-tint:var(--acct-tint-riot)"');
    expect(html).toContain('style="--acct-tint:var(--acct-tint-steam)"');
  });

  it('the caption: mono LINKED ACCOUNTS (lang="en") with the Korean name on ko pages, English only on en pages', async () => {
    const ko = parse(await ssr('ko')).querySelector('.acct-links__cap');
    expect(ko?.querySelector('[lang="en"]')?.textContent).toBe('LINKED ACCOUNTS');
    expect(ko?.textContent).toContain('연동 계정');
    const en = parse(await ssr('en')).querySelector('.acct-links__cap');
    expect(en?.textContent).toBe('LINKED ACCOUNTS');
  });

  it('zero shown tiles → exactly the empty frame, no caption (unlinked, error, stale or no tile at all)', async () => {
    const empty = '<div class="acct-row acct-row--empty"></div>';
    expect(await ssr('ko', [])).toBe(empty);
    const unlinked = await tilesFor('ko', { feeds: false });
    expect(unlinked.map((t) => t.state)).toEqual(['unlinked', 'unlinked', 'unlinked', 'unlinked', 'unlinked']);
    expect(await ssr('ko', unlinked)).toBe(empty);
    const shown = await tilesFor('en');
    expect(await ssr('en', shown.map((t) => ({ ...t, state: 'stale' as const })))).toBe(empty);
    // one shown tile among hidden ones → exactly one tile
    const one = shown.map((t, i) => (i === 1 ? t : { ...t, state: 'error' as const }));
    expect(parse(await ssr('en', one)).querySelectorAll('details.acct-tile')).toHaveLength(1);
  });

  it('no management string reaches the visitor markup or the labels', async () => {
    const html = await ssr('ko');
    expect(html).not.toContain('accounts-admin');
    expect(html).not.toMatch(/연동 관리|Manage links|GitHub/);
    expect(JSON.stringify(accountLinksLabels('ko'))).not.toMatch(/accounts-admin|GitHub/);
  });

  it('hydration: the first client render equals the SSR <details> markup (no mismatch), then the tiles become buttons; no request', async () => {
    const tiles = await tilesFor('ko');
    const html = await ssr('ko', tiles);
    const host = document.createElement('div');
    host.innerHTML = html;
    document.body.append(host);
    expect(host.querySelectorAll('details.acct-tile')).toHaveLength(5);
    expect(host.querySelector('button')).toBeNull();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const errors: unknown[] = [];
    const consoleError = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => errors.push(args));
    await act(async () => {
      hydrateRoot(host, <AccountLinks lang="ko" tiles={tiles} labels={accountLinksLabels('ko')} relay={null} steamButton={false} />, {
        onRecoverableError: (e) => errors.push(e),
      });
    });
    expect(errors).toEqual([]);
    expect(host.querySelectorAll('details.acct-tile')).toHaveLength(0);
    expect(host.querySelectorAll('ul.acct-row > li > button.acct-tile')).toHaveLength(5);
    expect(fetchSpy).not.toHaveBeenCalled();
    consoleError.mockRestore();
    host.remove();
  });
});

// ---------------------------------------------------------------------------------------------------------------
// AL-11: the dialog shell (spec §3.1 mount swap, §3.2, §3.7). jsdom has no working showModal()/close(): both are
// emulated as in tests/react/ImageViewer.test.tsx.

describe('AccountLinks dialog shell (after mount)', () => {
  beforeAll(() => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      writable: true,
      value(this: HTMLDialogElement) {
        this.setAttribute('open', '');
      },
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      writable: true,
      value(this: HTMLDialogElement) {
        if (!this.hasAttribute('open')) return;
        this.removeAttribute('open');
        this.dispatchEvent(new Event('close'));
      },
    });
  });

  beforeEach(() => {
    document.documentElement.setAttribute('data-motion', 'full');
    document.documentElement.classList.remove('is-scroll-locked');
  });

  const hosts: HTMLElement[] = [];
  afterEach(() => {
    for (const h of hosts.splice(0)) h.remove();
  });

  /** SSR markup in the document, `before` run on it (e.g. open a details or focus a summary), then hydrated. */
  async function hydrate(lang: Lang = 'ko', before?: (host: HTMLElement) => void | Promise<void>): Promise<HTMLElement> {
    const tiles = await tilesFor(lang);
    const host = document.createElement('div');
    host.innerHTML = await ssr(lang, tiles);
    document.body.append(host);
    hosts.push(host);
    await before?.(host);
    await act(async () => {
      hydrateRoot(host, <AccountLinks lang={lang} tiles={tiles} labels={accountLinksLabels(lang)} relay={null} steamButton={false} />);
    });
    return host;
  }

  const frames = (ms = 80) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
  const buttons = (host: HTMLElement) => [...host.querySelectorAll<HTMLButtonElement>('ul.acct-row > li > button.acct-tile')];
  const dialogOf = (host: HTMLElement) => host.querySelector<HTMLDialogElement>('dialog#acct-dlg');
  const key = (el: Element, k: string) => {
    const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
    el.dispatchEvent(ev);
    return ev;
  };

  async function openTile(host: HTMLElement, i: number): Promise<HTMLDialogElement> {
    await act(async () => {
      buttons(host)[i]?.click();
    });
    await frames();
    const dialog = dialogOf(host);
    if (!dialog) throw new Error('no dialog');
    return dialog;
  }

  async function closeWith(host: HTMLElement, action: (dialog: HTMLDialogElement) => void): Promise<void> {
    const dialog = dialogOf(host) as HTMLDialogElement;
    await act(async () => action(dialog));
    await frames(CLOSE_MS + 40);
  }

  it('exports the close times of the spec (300 ms = 80 ms fade + 220 ms return; 150 ms reduced) and the 1-second window', () => {
    expect(CLOSE_MS).toBe(300);
    expect(CLOSE_MS_REDUCED).toBe(150);
    expect(TOGGLE_WINDOW_MS).toBe(1000);
  });

  it('the tiles become buttons named by their visible content; one closed dialog labelled by acct-game acct-title', async () => {
    const host = await hydrate('ko');
    const list = buttons(host);
    expect(list).toHaveLength(5);
    for (const b of list) {
      expect(b.getAttribute('type')).toBe('button');
      expect(b.getAttribute('aria-haspopup')).toBe('dialog');
      expect(b.getAttribute('aria-controls')).toBe('acct-dlg');
      expect(b.hasAttribute('aria-label')).toBe(false);
      expect(b.querySelector('.acct-tile__frame')?.getAttribute('aria-hidden')).toBe('true');
    }
    expect(list.map((b) => b.querySelector('.acct-tile__name')?.textContent)).toEqual(['젠레스 존 제로', '원신', '리그 오브 레전드', '전략적 팀 전투', 'Steam']);
    expect(list.map((b) => b.querySelector('.sr-only')?.textContent)).toEqual(['인터노트 레벨 55', '모험 등급 57', 'op.gg 전적 링크', 'lolchess.gg 전적 링크', 'Steam 레벨 42']);
    expect(host.querySelector('ul.acct-row')?.innerHTML).not.toContain('aria-label');
    const dialog = dialogOf(host);
    expect(dialog?.classList.contains('acct-dlg')).toBe(true);
    expect(dialog?.hasAttribute('open')).toBe(false);
    expect(dialog?.getAttribute('aria-labelledby')).toBe('acct-game acct-title');
    expect(host.querySelectorAll('dialog')).toHaveLength(1);
    expect(manage.loaded).toBe(false);
  });

  it('focus continuity: a focused summary hands focus to its new button', async () => {
    const host = await hydrate('ko', (h) => {
      h.querySelectorAll<HTMLElement>('details.acct-tile > summary')[2]?.focus();
    });
    expect(document.activeElement).toBe(buttons(host)[2]);
  });

  it('the 1-second rule: a <details> opened just before hydration (its toggle arrives after mount) opens the dialog on that tile', async () => {
    const host = await hydrate('ko', (h) => {
      const d = h.querySelectorAll('details.acct-tile')[1] as HTMLDetailsElement;
      d.open = true; // the toggle event is still queued when the island mounts
    });
    await frames();
    const dialog = dialogOf(host);
    expect(dialog?.hasAttribute('open')).toBe(true);
    expect(host.querySelector('#acct-game')?.textContent).toBe('원신');
    expect(host.querySelector('#acct-title')?.textContent).toBe('E2E Fixture GI');
    expect(host.querySelectorAll('details')).toHaveLength(0);
  });

  it('the 1-second rule: a card that was already open (being read) is folded into its button, no dialog', async () => {
    const host = await hydrate('ko', async (h) => {
      const d = h.querySelectorAll('details.acct-tile')[1] as HTMLDetailsElement;
      const toggled = new Promise((r) => d.addEventListener('toggle', r, { once: true }));
      d.open = true;
      await toggled; // the toggle fired before the island mounted
    });
    await frames();
    expect(dialogOf(host)?.hasAttribute('open')).toBe(false);
    expect(host.querySelectorAll('details')).toHaveLength(0);
    expect(buttons(host)).toHaveLength(5);
    expect(document.documentElement).not.toHaveClass('is-scroll-locked');
  });

  it('opens on a tile click: head, position, arrows, first focus on the close button; Esc closes and returns focus to the tile', async () => {
    const host = await hydrate('ko');
    const dialog = await openTile(host, 0);
    expect(dialog.hasAttribute('open')).toBe(true);
    expect(dialog.getAttribute('data-state')).toBe('open');
    expect(document.documentElement).toHaveClass('is-scroll-locked');
    expect(dialog.querySelector('h2#acct-game')?.textContent).toBe('젠레스 존 제로');
    expect(dialog.querySelector('.acct-dlg__profile')?.textContent).toBe('INTER-KNOT PROFILE');
    expect(dialog.querySelector('.acct-dlg__profile')?.getAttribute('lang')).toBe('en');
    expect(dialog.querySelector('div#acct-title')?.textContent).toBe('E2E Fixture ZZZ');
    expect(dialog.querySelector('.acct-dlg__pos')?.textContent).toBe('1 / 5');
    const close = dialog.querySelector<HTMLButtonElement>('.acct-dlg__close');
    expect(document.activeElement).toBe(close);
    expect(close?.textContent).toContain('닫기');
    expect(dialog.querySelector('.acct-dlg__prev')?.getAttribute('aria-label')).toBe('이전 계정: Steam');
    expect(dialog.querySelector('.acct-dlg__next')?.getAttribute('aria-label')).toBe('다음 계정: 원신');
    const cancel = new Event('cancel', { cancelable: true });
    await closeWith(host, (d) => d.dispatchEvent(cancel));
    expect(cancel.defaultPrevented).toBe(true);
    expect(dialog.hasAttribute('open')).toBe(false);
    expect(document.documentElement).not.toHaveClass('is-scroll-locked');
    expect(document.activeElement).toBe(buttons(host)[0]);
  });

  it('the close button and the backdrop (pointerdown and click both on the dialog) close it', async () => {
    const host = await hydrate('ko');
    await openTile(host, 3);
    await closeWith(host, (d) => d.querySelector<HTMLButtonElement>('.acct-dlg__close')?.click());
    expect(dialogOf(host)?.hasAttribute('open')).toBe(false);
    expect(document.activeElement).toBe(buttons(host)[3]);

    await openTile(host, 4);
    await closeWith(host, (d) => {
      d.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      d.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(dialogOf(host)?.hasAttribute('open')).toBe(false);
    expect(document.activeElement).toBe(buttons(host)[4]);
  });

  it('no close when pointerdown starts inside (an input or the card) and the click lands on the backdrop', async () => {
    const host = await hydrate('ko');
    const dialog = await openTile(host, 1);
    const input = document.createElement('input'); // stands in for the management fields (AL-18)
    dialog.querySelector('.acct-dlg__body')?.append(input);
    for (const start of [input, dialog.querySelector('#acct-title') as HTMLElement]) {
      await act(async () => {
        start.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        dialog.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await frames(CLOSE_MS + 40);
      expect(dialog.hasAttribute('open')).toBe(true);
    }
    input.remove();
  });

  it('←/→ switch accounts (wrapping), announce "{position} · {game} · {title}", and closing returns focus to the current tile', async () => {
    const host = await hydrate('ko');
    const dialog = await openTile(host, 0);
    const status = dialog.querySelector('[role="status"]');
    expect(status?.classList.contains('sr-only')).toBe(true);
    await act(async () => {
      expect(key(dialog, 'ArrowRight').defaultPrevented).toBe(true);
    });
    expect(dialog.querySelector('#acct-game')?.textContent).toBe('원신');
    expect(dialog.querySelector('.acct-dlg__pos')?.textContent).toBe('2 / 5');
    expect(status?.textContent).toBe('2 / 5 · 원신 · E2E Fixture GI');
    expect(dialog.querySelector('.acct-dlg__prev')?.getAttribute('aria-label')).toBe('이전 계정: 젠레스 존 제로');
    expect(dialog.querySelector('.acct-dlg__next')?.getAttribute('aria-label')).toBe('다음 계정: 리그 오브 레전드');
    await act(async () => {
      key(dialog, 'ArrowLeft');
    });
    await act(async () => {
      key(dialog, 'ArrowLeft');
    });
    expect(dialog.querySelector('#acct-game')?.textContent).toBe('Steam');
    expect(status?.textContent).toBe('5 / 5 · Steam · E2E Fixture STM');
    // the ‹ › buttons: focus stays on the pressed arrow
    const prev = dialog.querySelector<HTMLButtonElement>('.acct-dlg__prev');
    prev?.focus();
    await act(async () => {
      prev?.click();
    });
    expect(dialog.querySelector('#acct-game')?.textContent).toBe('전략적 팀 전투');
    expect(document.activeElement).toBe(prev);
    await closeWith(host, (d) => d.dispatchEvent(new Event('cancel', { cancelable: true })));
    expect(document.activeElement).toBe(buttons(host)[3]);
  });

  it('←/→ do nothing while an input has focus', async () => {
    const host = await hydrate('ko');
    const dialog = await openTile(host, 1);
    const input = document.createElement('input');
    dialog.querySelector('.acct-dlg__body')?.append(input);
    input.focus();
    await act(async () => {
      expect(key(input, 'ArrowRight').defaultPrevented).toBe(false);
    });
    expect(dialog.querySelector('#acct-game')?.textContent).toBe('원신');
    input.remove();
  });

  it('aria-describedby: the fetched-at line on a data card, the external-site line on a Riot tile', async () => {
    const host = await hydrate('ko');
    const dialog = await openTile(host, 1);
    const describedBy = () => host.querySelector(`[id="${dialog.getAttribute('aria-describedby')}"]`)?.textContent;
    expect(describedBy()).toMatch(/^기준 시각 \d{4}\.\d{2}\.\d{2} \d{2}:\d{2} KST$/);
    await act(async () => {
      key(dialog, 'ArrowRight');
    });
    expect(dialog.querySelector('#acct-game')?.textContent).toBe('리그 오브 레전드');
    expect(describedBy()).toBe('외부 전적 사이트로 이동합니다. 이 사이트와 관계가 없는 사이트이며 새 탭에서 열립니다.');
  });

  it('English page: English head, arrow labels and close label', async () => {
    const host = await hydrate('en');
    const dialog = await openTile(host, 4);
    expect(dialog.querySelector('#acct-game')?.textContent).toBe('Steam');
    expect(dialog.querySelector('.acct-dlg__close')?.textContent).toContain('Close');
    expect(dialog.querySelector('.acct-dlg__next')?.getAttribute('aria-label')).toBe('Next account: Zenless Zone Zero');
    expect(dialog.querySelector('.acct-dlg__prev')?.getAttribute('aria-label')).toBe('Previous account: Teamfight Tactics');
  });

  it('never imports the management chunk without ?manage', async () => {
    const host = await hydrate('ko');
    await openTile(host, 0);
    await frames();
    expect(manage.loaded).toBe(false);
  });
});
