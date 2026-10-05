// AL-10: the LINKED ACCOUNTS row, server part (spec §3.1, §3.5, §3.7; plan DV-27: LoL and TFT are separate tiles).
// The tiles come from the real view model over the committed synthetic fixture feeds (tests/fixtures/generated),
// stamped fresh as the SB_E2E_ACCOUNTS=1 build does; islandImage is mocked (no astro:assets in jsdom).
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fireEvent } from '@testing-library/react';
import type { ImageMetadata } from 'astro';
import { act } from 'react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// AL-11: the visitor island never loads the management chunk (AL-20 adds the ?manage cases).
// hydrateRoot is driven through React's act() directly (no testing-library render), so declare the act environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// Each flag turns true when the island first imports that module; both modules are the real ones (the owner-mode cases
// below run the real panel and core). A module stays loaded once imported, so every case that expects no import runs
// before the first owner-mode case.
const manage = vi.hoisted(() => ({ loaded: false }));
const core = vi.hoisted(() => ({ loaded: false }));
vi.mock('../../src/islands/account/ManagePanel', async (importOriginal) => {
  manage.loaded = true;
  return importOriginal();
});
vi.mock('../../src/lib/account-admin', async (importOriginal) => {
  core.loaded = true;
  return importOriginal();
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
import { adminCopy } from '../../src/i18n/accounts-admin';
import type { Lang } from '../../src/i18n/ui';
import AccountLinks, { CLOSE_MS, CLOSE_MS_REDUCED, SWITCH_MS, TL, TOGGLE_WINDOW_MS } from '../../src/islands/AccountLinks';
import { accountLinksLabels, buildAccountView, type AccountTile, type TileState } from '../../src/lib/account-view';
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
    expect(dialog.querySelector('#acct-title')?.textContent).toBe('E2E Fixture ZZZ');
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

// ---------------------------------------------------------------------------------------------------------------
// AL-12: the card in the dialog, the open timeline, reduced motion, stale removal (spec §3.2–3.7; fix-brief A-01, A-02).

describe('AccountLinks card, timeline, reduced motion and stale removal', () => {
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
    document.documentElement.setAttribute('data-motion', 'full');
  });

  const DAY = 86_400_000;
  const wait = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

  async function hydrate(lang: Lang = 'ko', edit?: (tiles: AccountTile[]) => AccountTile[]): Promise<HTMLElement> {
    const built = await tilesFor(lang);
    const tiles = edit ? edit(built) : built;
    const host = document.createElement('div');
    host.innerHTML = await ssr(lang, tiles);
    document.body.append(host);
    hosts.push(host);
    await act(async () => {
      hydrateRoot(host, <AccountLinks lang={lang} tiles={tiles} labels={accountLinksLabels(lang)} relay={null} steamButton={false} />);
    });
    return host;
  }
  const buttons = (host: HTMLElement) => [...host.querySelectorAll<HTMLButtonElement>('ul.acct-row > li > button.acct-tile')];
  const names = (host: HTMLElement) => buttons(host).map((b) => b.querySelector('.acct-tile__name')?.textContent);
  const dialogOf = (host: HTMLElement) => host.querySelector('dialog#acct-dlg') as HTMLDialogElement;
  const card = (host: HTMLElement) => dialogOf(host).querySelector('.acct-dlg__card:not(.acct-dlg__card--out)') as HTMLElement;
  async function openTile(host: HTMLElement, i: number): Promise<HTMLDialogElement> {
    await act(async () => {
      buttons(host)[i]?.click();
    });
    await wait(80);
    return dialogOf(host);
  }
  async function arrow(host: HTMLElement, k: 'ArrowLeft' | 'ArrowRight'): Promise<void> {
    await act(async () => {
      dialogOf(host).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    });
  }
  async function closeByButton(host: HTMLElement): Promise<void> {
    await act(async () => {
      dialogOf(host).querySelector<HTMLButtonElement>('.acct-dlg__close')?.click();
    });
  }
  /** The counting (aria-hidden) number of a stat, or null when the value is plain final text. */
  const counter = (dd: Element | null | undefined) => dd?.querySelector('[aria-hidden="true"]')?.textContent ?? null;
  const dds = (host: HTMLElement) => [...card(host).querySelectorAll('dl dd')];

  it('TL is the spec §3.6 timeline, within 2 seconds, and the close time is its fade + ghost return', () => {
    expect(TL).toEqual({
      backdrop: [0, 200], ghost: [0, 320], dialog: [260, 380], rule: [180, 420], head: [300, 650],
      stats: [450, 1250], statGap: 80, items: [800, 1200], itemGap: 60, foot: [1100, 1400], closeFade: 80, closeGhost: 220,
    });
    expect(Math.max(...Object.values(TL).flat())).toBeLessThanOrEqual(2000);
    expect(CLOSE_MS).toBe(TL.closeFade + TL.closeGhost);
  });

  it('the CSS timings that cannot come from TL through the CSSOM match it (panel fade, close fade, switch, reduced fade)', () => {
    const css = readFileSync(join(process.cwd(), 'src/islands/AccountLinks.css'), 'utf8');
    expect(css).toContain(`.acct-dlg[data-state="open"] .acct-dlg__panel { opacity: 1; transition: opacity ${TL.dialog[1] - TL.dialog[0]}ms var(--ease-out) ${TL.dialog[0]}ms; }`);
    expect(css).toContain(`.acct-dlg[data-state="closing"] .acct-dlg__panel { opacity: 0; transition: opacity ${TL.closeFade}ms var(--ease-in); }`);
    expect(css).toContain(`.acct-dlg__card[data-anim="switch"] { animation: acct-fade ${SWITCH_MS}ms var(--ease-out) both; }`);
    expect(css).toContain(`.acct-dlg__card--out { animation: acct-fade-out ${SWITCH_MS}ms var(--ease-in) both;`);
    expect(css.match(new RegExp(`transition: opacity ${CLOSE_MS_REDUCED}ms linear`, 'g'))?.length).toBe(4); // two per reduce path
    expect(SWITCH_MS).toBe(180);
  });

  it('the dialog card: banner, avatar (alt), #acct-title, <dl> stats, item row, fetched-at line (aria-describedby), data and notice lines; no landmark', async () => {
    const host = await hydrate('ko');
    const dialog = await openTile(host, 1);
    await wait(TL.foot[1] + 100);
    const c = card(host);
    expect(c.querySelector('.acct-card__banner img')?.getAttribute('alt')).toBe('');
    expect(c.querySelector('.acct-card__avatar img')?.getAttribute('alt')).toBe('E2E Fixture GI 프로필 이미지');
    const title = dialog.querySelector('#acct-title');
    expect(title?.tagName).toBe('P');
    expect(title?.textContent).toBe('E2E Fixture GI');
    expect(c.contains(title)).toBe(true);
    const final = (dd: Element | null) => (dd?.querySelector('.sr-only') ?? dd)?.textContent;
    expect([...c.querySelectorAll('dl > div')].map((r) => `${r.querySelector('dt')?.textContent}=${final(r.querySelector('dd'))}`)).toEqual([
      '모험 등급=57', '업적=812', '나선 비경=12층 3방', '환상극=8막',
    ]);
    const items = [...c.querySelectorAll('.acct-card__items li')];
    expect(items).toHaveLength(4);
    for (const img of c.querySelectorAll('.acct-card__items img')) expect(img.getAttribute('alt')).toBe('');
    const asof = c.querySelector('.acct-card__asof');
    expect(asof?.textContent).toMatch(/^기준 시각 \d{4}\.\d{2}\.\d{2} \d{2}:\d{2} KST$/);
    expect(asof?.id).toBe(dialog.getAttribute('aria-describedby'));
    expect(c.querySelector('.acct-card__data')?.textContent).toBe('데이터: Enka.Network');
    expect(c.querySelector('.acct-card__notices')?.textContent?.length).toBeGreaterThan(0);
    // the order of the card (spec §3.2): banner → avatar/title → stats → items → fetched-at → data → notices
    const order = ['.acct-card__banner', '.acct-card__id', 'dl', '.acct-card__items', '.acct-card__asof', '.acct-card__data', '.acct-card__notices'].map((sel) => c.querySelector(sel));
    for (let i = 1; i < order.length; i++) expect(order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // G-009: no landmark or labelled region inside the dialog; one #acct-title in the document
    expect(dialog.querySelectorAll('section, article, aside, nav, main, header, footer, [role="region"], [aria-label]:not(button)')).toHaveLength(0);
    expect(document.querySelectorAll('#acct-title')).toHaveLength(1);
  });

  it('lol dialog: only the op.gg link and the Riot ID as text; tft: only lolchess.gg; neither has a fetched-at line; Steam link without nofollow', async () => {
    const host = await hydrate('ko');
    const dialog = await openTile(host, 2);
    const links = () => [...card(host).querySelectorAll('a')];
    expect(links().map((a) => a.getAttribute('href'))).toEqual(['https://op.gg/lol/summoners/kr/Hide%20on%20bush-KR1']);
    expect(dialog.querySelector('#acct-title')?.textContent).toBe('Hide on bush#KR1');
    expect(card(host).querySelector('.acct-card__asof')).toBeNull();
    const note = card(host).querySelector('.acct-card__note');
    expect(note?.id).toBe(dialog.getAttribute('aria-describedby'));
    expect(links()[0]?.textContent).toContain('LoL 전적 보기 (op.gg)');
    await arrow(host, 'ArrowRight');
    expect(links().map((a) => a.getAttribute('href'))).toEqual(['https://lolchess.gg/profile/kr/Hide%20on%20bush-KR1']);
    expect(card(host).querySelector('.acct-card__asof')).toBeNull();
    expect(links()[0]?.textContent).toContain('TFT 전적 보기 (lolchess.gg)');
    await arrow(host, 'ArrowRight');
    expect(links().map((a) => a.getAttribute('href'))).toEqual(['https://steamcommunity.com/profiles/76561197960435530']);
    for (const a of dialog.querySelectorAll('a')) {
      expect(a.getAttribute('target')).toBe('_blank');
      expect(a.getAttribute('rel')).toBe('noopener noreferrer');
      expect(a.getAttribute('rel')).not.toContain('nofollow');
      expect(a.getAttribute('referrerpolicy')).toBe('no-referrer');
      expect(a.querySelector('[aria-hidden="true"]')?.textContent).toBe('↗');
      expect(a.querySelector('.sr-only')?.textContent).toBe('새 탭에서 열림');
    }
  });

  it('count-up runs only on the first open of an account and only for countTo values; the accessible text holds the final value', async () => {
    const host = await hydrate('ko');
    await openTile(host, 1);
    const [ar, ach, abyss, theater] = dds(host);
    expect(counter(ar)).toBe('0'); // before TL.stats[0]
    expect(ar?.querySelector('.sr-only')?.textContent).toBe('57');
    expect(ach?.querySelector('.sr-only')?.textContent).toBe('812');
    expect(counter(abyss)).toBeNull(); // templated values never count
    expect(abyss?.textContent).toBe('12층 3방');
    expect(counter(theater)).toBeNull();
    await wait(TL.stats[1] + 150);
    expect(counter(dds(host)[0])).toBe('57');
    expect(counter(dds(host)[1])).toBe('812');
    await closeByButton(host);
    await wait(CLOSE_MS + 40);
    expect(dialogOf(host).hasAttribute('open')).toBe(false);
    // the second open of the same account: final values at once
    await openTile(host, 1);
    expect(counter(dds(host)[0])).toBeNull();
    expect(dds(host)[0]?.textContent).toBe('57');
  });

  it('switching shows final values at once and cross-fades only the card region (outgoing copy without ids, inert, then removed)', async () => {
    const host = await hydrate('ko');
    await openTile(host, 0);
    expect(counter(dds(host)[0])).toBe('0'); // zzz counts on its first open
    await arrow(host, 'ArrowRight');
    expect(dds(host)[0]?.textContent).toBe('57');
    expect(counter(dds(host)[0])).toBeNull();
    const out = dialogOf(host).querySelector('.acct-dlg__card--out');
    expect(out?.getAttribute('aria-hidden')).toBe('true');
    expect(out?.hasAttribute('inert')).toBe(true);
    expect(out?.querySelector('[id]')).toBeNull();
    expect(document.querySelectorAll('#acct-title')).toHaveLength(1);
    expect(dialogOf(host).querySelector('.acct-dlg__head')?.contains(out as Node)).toBe(false);
    await wait(180 + 80);
    expect(dialogOf(host).querySelector('.acct-dlg__card--out')).toBeNull();
    // back to zzz: seen already, so final at once
    await arrow(host, 'ArrowLeft');
    expect(dds(host)[0]?.textContent).toBe('55');
  });

  it('full motion: an aria-hidden ghost frame (four corner brackets + the frame line) runs on open and on close', async () => {
    const host = await hydrate('ko');
    await act(async () => {
      buttons(host)[4]?.click();
    });
    await wait(40);
    const ghost = dialogOf(host).querySelector('.acct-dlg__ghost');
    expect(ghost?.getAttribute('aria-hidden')).toBe('true');
    expect(ghost?.querySelectorAll('.acct-dlg__ghost-corner')).toHaveLength(4);
    expect(ghost?.querySelectorAll('.acct-dlg__ghost-line')).toHaveLength(1);
    expect(ghost?.textContent).toBe('');
    await wait(TL.dialog[1] + 80);
    expect(dialogOf(host).querySelector('.acct-dlg__ghost')).toBeNull();
    await closeByButton(host);
    await wait(40);
    expect(dialogOf(host).querySelector('.acct-dlg__ghost')).not.toBeNull();
    await wait(CLOSE_MS);
    expect(dialogOf(host).hasAttribute('open')).toBe(false);
    expect(dialogOf(host).querySelector('.acct-dlg__ghost')).toBeNull();
  });

  it('reduced motion (data-motion="reduce"): no ghost, no count-up, no cross-fade copy, and a 150 ms close', async () => {
    document.documentElement.setAttribute('data-motion', 'reduce');
    const host = await hydrate('ko');
    await act(async () => {
      buttons(host)[1]?.click();
    });
    await wait(40);
    expect(dialogOf(host).querySelector('.acct-dlg__ghost')).toBeNull();
    expect(counter(dds(host)[0])).toBeNull();
    expect(dds(host)[0]?.textContent).toBe('57');
    await arrow(host, 'ArrowLeft');
    expect(dds(host)[0]?.textContent).toBe('55');
    expect(dialogOf(host).querySelector('.acct-dlg__card--out')).toBeNull();
    await closeByButton(host);
    await wait(CLOSE_MS_REDUCED + 40);
    expect(dialogOf(host).hasAttribute('open')).toBe(false);
    expect(dialogOf(host).querySelector('.acct-dlg__ghost')).toBeNull();
  });

  it('full motion keeps the dialog open past the reduced close time (the 300 ms timeline)', async () => {
    const host = await hydrate('ko');
    await openTile(host, 1);
    await closeByButton(host);
    await wait(CLOSE_MS_REDUCED + 40);
    expect(dialogOf(host).hasAttribute('open')).toBe(true);
    await wait(CLOSE_MS);
    expect(dialogOf(host).hasAttribute('open')).toBe(false);
  });

  it('stale removal on hydration: a tile whose fetchedAt is past its maxAgeDays is removed after mount (the SSR copy stays for no-JS readers)', async () => {
    const old = new Date(Date.now() - 8 * DAY).toISOString();
    const host = await hydrate('ko', (tiles) => tiles.map((t) => (t.key === 'genshin' ? { ...t, fetchedAt: old, maxAgeDays: 7 } : t)));
    expect(names(host)).toEqual(['젠레스 존 제로', '리그 오브 레전드', '전략적 팀 전투', 'Steam']);
    // without a maxAgeDays the site rule ACCOUNT_MAX_AGE_DAYS (7) applies
    const host2 = await hydrate('ko', (tiles) => tiles.map((t) => (t.key === 'steam' ? { ...t, fetchedAt: old, maxAgeDays: undefined } : t)));
    expect(names(host2)).not.toContain('Steam');
  });

  it('stale removal on visibilitychange → visible: focus moves to the next tile, or to the row caption (tabindex -1) when none follows; Riot tiles never go stale', async () => {
    const host = await hydrate('ko');
    const later = Date.now() + 8 * DAY;
    buttons(host)[0]?.focus();
    vi.spyOn(Date, 'now').mockReturnValue(later);
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(names(host)).toEqual(['리그 오브 레전드', '전략적 팀 전투']);
    expect(document.activeElement).toBe(buttons(host)[0]);

    vi.restoreAllMocks(); // hydrate the second row while everything is fresh
    const host2 = await hydrate('ko');
    expect(buttons(host2)).toHaveLength(5);
    vi.spyOn(Date, 'now').mockReturnValue(later);
    buttons(host2)[4]?.focus();
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const cap = host2.querySelector('.acct-links__cap');
    expect(cap?.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(cap);
  });

  it('no stale check on the opening click; with the dialog open the removal waits for the close, then focus moves on', async () => {
    const host = await hydrate('ko');
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 8 * DAY);
    const dialog = await openTile(host, 1);
    expect(dialog.hasAttribute('open')).toBe(true);
    expect(dialog.querySelector('#acct-title')?.textContent).toBe('E2E Fixture GI');
    expect(buttons(host)).toHaveLength(5);
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(buttons(host)).toHaveLength(5);
    expect(dialog.hasAttribute('open')).toBe(true);
    await closeByButton(host);
    await wait(CLOSE_MS + 60);
    expect(dialog.hasAttribute('open')).toBe(false);
    expect(names(host)).toEqual(['리그 오브 레전드', '전략적 팀 전투']);
    expect(document.activeElement).toBe(buttons(host)[0]);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Owner mode (?manage; spec §3.1, §3.2, §4.1, §4.2, §4.6). The real panel and core run; only the browser surface is
// fake: fetch answers per relay path/op, BroadcastChannel is an EventTarget, jsdom gets a secure context, and
// window.top is replaced for the framed case. The ticket and handle are fakes built at run time. The cases that expect
// no import come first (see the flags at the top of this file).

describe('AccountLinks owner mode (?manage)', () => {
  const RELAY = 'https://account-relay.test-sub.workers.dev';
  const HANDLE = 'hdl_' + 'A'.repeat(60);
  const TICKET = 'tkt-' + 'B'.repeat(60);
  const C = adminCopy.ko;
  const STORED_ZZZ = '1300025292';

  class FakeChannel extends EventTarget {
    static made = 0;
    constructor(readonly name: string) {
      super();
      FakeChannel.made += 1;
    }
    postMessage(): void {}
    close(): void {}
  }

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

  const roots: Root[] = [];
  const hosts: HTMLElement[] = [];
  beforeEach(() => {
    document.documentElement.setAttribute('data-motion', 'full');
    document.documentElement.classList.remove('is-scroll-locked');
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    vi.stubGlobal('BroadcastChannel', FakeChannel);
    FakeChannel.made = 0;
  });
  afterEach(async () => {
    for (const root of roots.splice(0)) await act(async () => root.unmount());
    for (const h of hosts.splice(0)) h.remove();
    Reflect.deleteProperty(window, 'isSecureContext');
    vi.unstubAllGlobals();
    history.replaceState(null, '', '/');
  });

  type Answer = (body: Record<string, unknown> | null, url: string) => Response;
  const reply = (url: string, status: number, body?: unknown): Response => {
    const res = new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    Object.defineProperty(res, 'url', { value: url });
    return res;
  };
  /** fetch answered per relay path (per op on /gh/api); returns the calls in order. */
  function relayFetch(extra: Record<string, Answer> = {}) {
    const answers: Record<string, Answer> = {
      '/gh/session': (_b, url) => reply(url, 200, { handle: HANDLE, expiresIn: 3600 }),
      '/gh/logout': (_b, url) => reply(url, 204),
      'vars.list': (_b, url) => reply(url, 200, [{ name: 'ACCOUNT_ZZZ_UID', value: STORED_ZZZ }]),
      'workflow.get': (_b, url) => reply(url, 200, { state: 'active' }),
      ...extra,
    };
    const calls: { key: string; body: Record<string, unknown> | null; init: RequestInit }[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const path = new URL(url, location.href).pathname;
      const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null;
      const key = path === '/gh/api' ? String(body?.op) : path;
      calls.push({ key, body, init: init ?? {} });
      const answer = answers[key];
      if (answer === undefined) throw new Error(`no answer for ${key}`);
      return answer(body, url);
    });
    return calls;
  }

  /** genshin errored and steam unlinked: two status tiles without a card on the visitors' row */
  const offTiles = (list: AccountTile[]): AccountTile[] =>
    list.map((t) => {
      const state: TileState | null = t.key === 'genshin' ? 'error' : t.key === 'steam' ? 'unlinked' : null;
      if (state === null) return t;
      const { card: _card, teaser: _teaser, teaserSr: _sr, ...rest } = t;
      return { ...rest, state };
    });

  async function hydrateOwner(o: { url?: string; relay?: string | null; lang?: Lang; edit?: (t: AccountTile[]) => AccountTile[] } = {}): Promise<HTMLElement> {
    const lang = o.lang ?? 'ko';
    history.replaceState(null, '', o.url ?? '/game/player-log/?manage');
    const built = await tilesFor(lang);
    const tiles = o.edit ? o.edit(built) : built;
    const host = document.createElement('div');
    host.innerHTML = await ssr(lang, tiles);
    document.body.append(host);
    hosts.push(host);
    const relay = o.relay === undefined ? RELAY : o.relay;
    await act(async () => {
      roots.push(hydrateRoot(host, <AccountLinks lang={lang} tiles={tiles} labels={accountLinksLabels(lang)} relay={relay} steamButton={false} />));
    });
    return host;
  }

  const tick = (ms = 10) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
  /** Waits (inside act) for the dynamic imports, relay answers and the effects they cause. */
  async function until(check: () => boolean, what: string): Promise<void> {
    for (let i = 0; i < 300; i++) {
      if (check()) return;
      await tick();
    }
    throw new Error(`timed out waiting for ${what}`);
  }
  const tileButtons = (host: HTMLElement) => [...host.querySelectorAll<HTMLButtonElement>('ul.acct-row > li > button.acct-tile')];
  const manageButton = (host: HTMLElement) => host.querySelector<HTMLButtonElement>('button.acct-manage');
  const dialogOf = (host: HTMLElement) => host.querySelector('dialog#acct-dlg') as HTMLDialogElement;
  const isOpen = (host: HTMLElement) => dialogOf(host)?.hasAttribute('open') ?? false;
  const panelReady = (host: HTMLElement) => host.querySelector('dialog#acct-dlg section.mp') !== null;
  const buttonNamed = (host: HTMLElement, name: string) => [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === name);
  const zzzField = (host: HTMLElement) => host.querySelector<HTMLInputElement>('.mp-group[data-group="zzz"] input');
  const signedIn = (host: HTMLElement) => host.querySelector('.mp__perms') !== null;

  async function requestCloseBy(host: HTMLElement, how: 'esc' | 'button' | 'backdrop'): Promise<void> {
    const d = dialogOf(host);
    await act(async () => {
      if (how === 'esc') d.dispatchEvent(new Event('cancel', { cancelable: true }));
      else if (how === 'button') d.querySelector<HTMLButtonElement>('.acct-dlg__close')?.click();
      else {
        d.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        d.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      }
    });
    await tick(CLOSE_MS + 60);
  }
  async function click(el: HTMLElement | null | undefined): Promise<void> {
    await act(async () => el?.click());
    await tick(80);
  }

  it('a visitor address (no ?manage) imports neither the management core nor the panel and asks nothing of the relay', async () => {
    const calls = relayFetch();
    const host = await hydrateOwner({ url: '/game/player-log/' });
    await tick(50);
    expect(tileButtons(host)).toHaveLength(5);
    expect(manageButton(host)).toBeNull();
    expect(core.loaded).toBe(false);
    expect(manage.loaded).toBe(false);
    expect(calls).toEqual([]);
  });

  it('outside a secure context: ?manage leaves the address (the fragment stays) and nothing else changes', async () => {
    Reflect.deleteProperty(window, 'isSecureContext'); // jsdom has none: not a secure context
    const host = await hydrateOwner({ url: '/game/player-log/?manage#keep' });
    await until(() => !location.search.includes('manage'), 'the query read');
    await tick(30);
    expect(core.loaded).toBe(true);
    expect(`${location.pathname}${location.search}${location.hash}`).toBe('/game/player-log/#keep');
    expect(manageButton(host)).toBeNull();
    expect(host.querySelector('.acct-links__framed')).toBeNull();
    expect(tileButtons(host)).toHaveLength(5);
    expect(manage.loaded).toBe(false);
  });

  it('inside another page: only the framed line (no tile, no button, no dialog) and the panel chunk is never requested', async () => {
    const own = Object.getOwnPropertyDescriptor(window, 'top');
    Object.defineProperty(window, 'top', { value: {}, configurable: true });
    try {
      const calls = relayFetch();
      const host = await hydrateOwner();
      await until(() => host.querySelector('.acct-links__framed') !== null, 'the framed line');
      expect(host.textContent).toBe('이 화면은 다른 페이지 안에서 열 수 없습니다.');
      expect(host.querySelectorAll('button, dialog, ul')).toHaveLength(0);
      expect(location.search).toBe('');
      await tick(50);
      expect(manage.loaded).toBe(false);
      expect(calls).toEqual([]);
    } finally {
      if (own) Object.defineProperty(window, 'top', own);
    }
  });

  it('?manage: every enabled tile with its state word (named by visible text), "연동 관리" at the row end, the panel mounted in the closed dialog, no request before login', async () => {
    const calls = relayFetch();
    const host = await hydrateOwner({ edit: offTiles });
    await until(() => manageButton(host) !== null, 'owner mode');
    expect(location.href).not.toContain('manage');
    const list = tileButtons(host);
    expect(list.map((b) => b.querySelector('.acct-tile__name')?.textContent)).toEqual(['젠레스 존 제로', '원신', '리그 오브 레전드', '전략적 팀 전투', 'Steam']);
    expect(list.map((b) => b.querySelector('.acct-tile__state')?.textContent ?? null)).toEqual([null, '오류', null, null, '미연동']);
    expect(list.map((b) => b.hasAttribute('data-off'))).toEqual([false, true, false, false, true]);
    for (const b of list) expect(b.hasAttribute('aria-label')).toBe(false);
    // the state word is visible text inside the button (its name), never aria-hidden; no teaser on a status tile
    expect(list[1]?.querySelector('.acct-tile__state')?.closest('[aria-hidden]')).toBeNull();
    expect(list[1]?.querySelector('.acct-tile__teaser, .sr-only')).toBeNull();
    const button = manageButton(host);
    expect(button?.textContent).toBe('연동 관리');
    expect(button?.getAttribute('type')).toBe('button');
    expect(button?.getAttribute('aria-controls')).toBe('acct-dlg');
    expect(button?.closest('li')?.parentElement).toBe(host.querySelector('ul.acct-row'));
    expect(button?.closest('li')?.nextElementSibling).toBeNull();
    await until(() => panelReady(host), 'the panel');
    expect(manage.loaded).toBe(true);
    expect(isOpen(host)).toBe(false);
    expect(calls).toEqual([]);
  });

  it('English page: "Manage links" and the English state words', async () => {
    relayFetch();
    const host = await hydrateOwner({ lang: 'en', edit: offTiles });
    await until(() => manageButton(host) !== null, 'owner mode');
    expect(manageButton(host)?.textContent).toBe('Manage links');
    expect(tileButtons(host).map((b) => b.querySelector('.acct-tile__state')?.textContent ?? null)).toEqual([null, 'Error', null, null, 'Not linked']);
  });

  it('focus before login: a tile opens on the close button (no card → its state word as the title); "연동 관리" opens the first platform on [GitHub로 로그인]; each close returns to its opener', async () => {
    relayFetch();
    const host = await hydrateOwner({ edit: offTiles });
    await until(() => panelReady(host), 'the panel');
    await click(tileButtons(host)[1]);
    expect(isOpen(host)).toBe(true);
    expect(host.querySelector('#acct-game')?.textContent).toBe('원신');
    expect(host.querySelector('#acct-title')?.textContent).toBe('오류');
    expect(document.activeElement).toBe(dialogOf(host).querySelector('.acct-dlg__close'));
    await requestCloseBy(host, 'button');
    expect(document.activeElement).toBe(tileButtons(host)[1]);
    // twice: the panel's focus request is cleared on close, so the same request reaches it again
    for (let round = 0; round < 2; round++) {
      await click(manageButton(host));
      expect(isOpen(host)).toBe(true);
      expect(host.querySelector('#acct-game')?.textContent).toBe('젠레스 존 제로');
      expect(document.activeElement).toBe(buttonNamed(host, C['label:login']));
      await requestCloseBy(host, 'esc');
      expect(isOpen(host)).toBe(false);
      expect(document.activeElement).toBe(manageButton(host));
    }
  });

  it('same-tab return #gh=: read and removed with ?manage, sent once as n: null before the panel mounts; the dialog opens on the first platform with focus on the panel heading; later "연동 관리" focuses the first account field; nothing secret in the DOM, the address, storage or the console', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const logs = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m));
    const calls = relayFetch();
    const host = await hydrateOwner({ url: `/game/player-log/?manage#gh=${TICKET}` });
    await until(() => isOpen(host) && signedIn(host), 'the signed-in dialog');
    expect(location.href).not.toMatch(/manage|#|gh=/);
    expect(calls.map((c) => c.key)).toEqual(['/gh/session', 'vars.list', 'workflow.get']);
    expect(calls[0]?.body).toEqual({ ticket: TICKET, n: null });
    expect(host.querySelector('#acct-game')?.textContent).toBe('젠레스 존 제로');
    const heading = host.querySelector('h3.mp__title');
    expect(heading?.textContent).toMatch(/^GitHub 로그인됨 · Lunecid/);
    expect(document.activeElement).toBe(heading);
    const html = document.documentElement.outerHTML;
    expect(html).not.toContain(TICKET);
    expect(html).not.toContain(HANDLE);
    expect(document.cookie).toBe('');
    for (const spy of [setItem, ...logs]) expect(JSON.stringify(spy.mock.calls)).not.toMatch(new RegExp(`${TICKET}|${HANDLE}`));
    await requestCloseBy(host, 'button');
    expect(document.activeElement).toBe(manageButton(host));
    await click(manageButton(host));
    expect(document.activeElement).toBe(zzzField(host));
    expect(zzzField(host)?.value).toBe(STORED_ZZZ);
  });

  it('#gh-error=denied: the error line placed before [GitHub로 로그인] takes focus and says the sign-in was cancelled', async () => {
    const calls = relayFetch();
    const host = await hydrateOwner({ url: '/game/player-log/?manage#gh-error=denied' });
    await until(() => isOpen(host), 'the dialog');
    await tick(30);
    expect(location.href).not.toMatch(/manage|#/);
    const error = host.querySelector<HTMLElement>('[data-mp="error"]') as HTMLElement;
    expect(document.activeElement).toBe(error);
    expect(error.textContent).toBe(C['gh.denied']);
    expect(error.getAttribute('role')).toBe('alert');
    const login = buttonNamed(host, C['label:login']) as HTMLButtonElement;
    expect(error.compareDocumentPosition(login) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(calls).toEqual([]);
  });

  it('no relay yet: a same-tab ticket is sent nowhere; the dialog opens on the relay-unset line with focus on its README link', async () => {
    const calls = relayFetch();
    const host = await hydrateOwner({ url: `/game/player-log/?manage#gh=${TICKET}`, relay: null });
    await until(() => isOpen(host), 'the dialog');
    await tick(30);
    expect(location.href).not.toContain(TICKET);
    expect(calls).toEqual([]);
    expect(host.querySelector('.mp__unset')?.textContent).toContain(C['relay-unset']);
    expect(document.activeElement).toBe(host.querySelector('.mp__unset a'));
    expect(buttonNamed(host, C['label:login'])).toBeUndefined();
  });

  it('unsaved input: Esc, the backdrop and the close button each show the notice in the dialog; [계속 편집] returns to the field; [버리고 닫기] closes and puts the stored value back', async () => {
    relayFetch();
    const host = await hydrateOwner({ url: `/game/player-log/?manage#gh=${TICKET}` });
    await until(() => zzzField(host) !== null, 'the form');
    const field = () => zzzField(host) as HTMLInputElement;
    fireEvent.change(field(), { target: { value: '1300025293' } });
    field().focus();
    const notice = () => dialogOf(host).querySelector('.acct-dlg__guard');
    for (const how of ['esc', 'backdrop', 'button'] as const) {
      await requestCloseBy(host, how);
      expect(isOpen(host), how).toBe(true);
      expect(dialogOf(host).getAttribute('data-state'), how).toBe('open');
      expect(notice()?.getAttribute('role')).toBe('group');
      expect(notice()?.querySelector('p')?.textContent).toBe('저장하지 않은 변경이 있습니다.');
      const [discard, keep] = [...(notice()?.querySelectorAll('button') ?? [])];
      expect([discard?.textContent, keep?.textContent]).toEqual(['버리고 닫기', '계속 편집']);
      expect(document.activeElement).toBe(keep);
      await act(async () => keep?.click());
      expect(notice()).toBeNull();
      expect(document.activeElement).toBe(field());
      expect(field().value).toBe('1300025293');
    }
    await requestCloseBy(host, 'esc');
    await act(async () => notice()?.querySelector('button')?.click());
    await tick(CLOSE_MS + 60);
    expect(isOpen(host)).toBe(false);
    expect(document.activeElement).toBe(manageButton(host));
    await click(manageButton(host));
    expect(field().value).toBe(STORED_ZZZ);
    expect(field().closest('.mp-field')?.querySelector('.mp-field__changed')).toBeNull();
    await requestCloseBy(host, 'esc'); // nothing unsaved now: it closes at once
    expect(isOpen(host)).toBe(false);
  });

  it('[버리고 닫기] also resets the unlink box: emptying the ID again after a discard needs a fresh tick', async () => {
    relayFetch();
    const host = await hydrateOwner({ url: `/game/player-log/?manage#gh=${TICKET}` });
    await until(() => zzzField(host) !== null, 'the form');
    const box = () => host.querySelector<HTMLInputElement>('.mp-group[data-group="zzz"] .mp-unlink input');
    fireEvent.change(zzzField(host) as HTMLInputElement, { target: { value: '' } });
    await until(() => box() !== null, 'the unlink box');
    await act(async () => box()?.click());
    expect(box()?.checked).toBe(true);
    await requestCloseBy(host, 'esc');
    await act(async () => dialogOf(host).querySelector<HTMLButtonElement>('.acct-dlg__guard button')?.click());
    await tick(CLOSE_MS + 60);
    expect(isOpen(host)).toBe(false);
    await click(manageButton(host));
    expect(zzzField(host)?.value).toBe(STORED_ZZZ);
    fireEvent.change(zzzField(host) as HTMLInputElement, { target: { value: '' } });
    await until(() => box() !== null, 'the unlink box again');
    expect(box()?.checked).toBe(false);
  });

  /** zzz fetched long before now: stale by the browser clock although the build showed it */
  const staleZzz = (list: AccountTile[]): AccountTile[] => list.map((t) => (t.key === 'zzz' ? { ...t, fetchedAt: '2000-01-01T00:00:00Z' } : t));

  it('a first tile gone stale after the build: owner mode keeps it with the state word "오래됨"; its button and "연동 관리" both open the dialog', async () => {
    relayFetch();
    const host = await hydrateOwner({ edit: staleZzz });
    await until(() => panelReady(host), 'the panel');
    const first = tileButtons(host)[0] as HTMLButtonElement;
    expect(first.querySelector('.acct-tile__name')?.textContent).toBe('젠레스 존 제로');
    expect(first.querySelector('.acct-tile__state')?.textContent).toBe('오래됨');
    expect(first.hasAttribute('data-off')).toBe(true);
    expect(first.querySelector('.acct-tile__teaser')).toBeNull();
    await click(first);
    expect(isOpen(host)).toBe(true);
    expect(host.querySelector('#acct-game')?.textContent).toBe('젠레스 존 제로');
    await requestCloseBy(host, 'button');
    expect(isOpen(host)).toBe(false);
    await click(manageButton(host));
    expect(isOpen(host)).toBe(true);
    expect(host.querySelector('#acct-game')?.textContent).toBe('젠레스 존 제로');
  });

  it('a first tile gone stale after the build: the same-tab #gh= return still opens the dialog', async () => {
    const calls = relayFetch();
    const host = await hydrateOwner({ url: `/game/player-log/?manage#gh=${TICKET}`, edit: staleZzz });
    await until(() => calls.some((c) => c.key === 'workflow.get'), 'the session');
    await until(() => isOpen(host), 'the dialog');
    expect(host.querySelector('#acct-game')?.textContent).toBe('젠레스 존 제로');
  });

  it('inside another page: a login-return fragment still leaves the address, and the ticket is sent nowhere', async () => {
    const own = Object.getOwnPropertyDescriptor(window, 'top');
    Object.defineProperty(window, 'top', { value: {}, configurable: true });
    try {
      const calls = relayFetch();
      const host = await hydrateOwner({ url: `/game/player-log/?manage#gh=${TICKET}` });
      await until(() => host.querySelector('.acct-links__framed') !== null, 'the framed line');
      expect(location.href).not.toMatch(/manage|#|gh=/);
      expect(calls).toEqual([]);
    } finally {
      if (own) Object.defineProperty(window, 'top', own);
    }
  });

  it('outside a secure context: a login-return fragment leaves the address with ?manage', async () => {
    Reflect.deleteProperty(window, 'isSecureContext');
    const calls = relayFetch();
    await hydrateOwner({ url: '/game/player-log/?manage#gh-error=denied' });
    await until(() => !location.search.includes('manage'), 'the query read');
    await tick(30);
    expect(location.href).not.toMatch(/manage|#|gh-error/);
    expect(calls).toEqual([]);
  });

  it('a switch keeps the panel mounted: the same field element keeps its typed value, and the highlight moves to the shown account (LoL and TFT share the Riot group)', async () => {
    relayFetch();
    const host = await hydrateOwner({ url: `/game/player-log/?manage#gh=${TICKET}` });
    await until(() => zzzField(host) !== null, 'the form');
    const field = zzzField(host) as HTMLInputElement;
    const section = host.querySelector('section.mp');
    fireEvent.change(field, { target: { value: '1300025293' } });
    const highlighted = () => host.querySelector('.mp-group[data-current]')?.getAttribute('data-group');
    expect(highlighted()).toBe('zzz');
    const next = () => dialogOf(host).querySelector<HTMLButtonElement>('.acct-dlg__next');
    for (const [game, group] of [['원신', 'genshin'], ['리그 오브 레전드', 'riot'], ['전략적 팀 전투', 'riot'], ['Steam', 'steam']] as const) {
      await act(async () => next()?.click());
      expect(host.querySelector('#acct-game')?.textContent).toBe(game);
      expect(highlighted()).toBe(group);
    }
    expect(host.querySelector('section.mp')).toBe(section);
    expect(field.isConnected).toBe(true);
    expect(field.value).toBe('1300025293');
  });

  it('←/→ inside the command block (the sideways scroller of the no-login steps) do not switch accounts', async () => {
    relayFetch();
    const host = await hydrateOwner();
    await until(() => panelReady(host), 'the panel');
    await click(manageButton(host));
    const pre = dialogOf(host).querySelector('pre') as HTMLElement;
    expect(pre.getAttribute('tabindex')).toBe('0');
    for (const k of ['ArrowRight', 'ArrowLeft']) {
      const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
      await act(async () => {
        pre.dispatchEvent(ev);
      });
      expect(ev.defaultPrevented).toBe(false);
      expect(host.querySelector('#acct-game')?.textContent).toBe('젠레스 존 제로');
    }
  });

  it('a tracked run: the "연동 관리" button carries the static chip "빌드 중 · {n}분" only while the dialog is closed', async () => {
    relayFetch({
      dispatch: (_b, url) => reply(url, 200, { runId: 7, htmlUrl: 'https://github.com/Lunecid/Lunecid.github.io/actions/runs/7' }),
      'run.get': (_b, url) => reply(url, 200, { status: 'in_progress', conclusion: null }),
      'run.jobs': (_b, url) => reply(url, 200, []),
    });
    const host = await hydrateOwner({ url: `/game/player-log/?manage#gh=${TICKET}` });
    await until(() => buttonNamed(host, C['label:rebuild']) !== undefined, 'the form');
    await act(async () => buttonNamed(host, C['label:rebuild'])?.click());
    await until(() => host.querySelector('.mp-build__meta') !== null, 'the tracked run');
    expect(manageButton(host)?.textContent).toBe('연동 관리');
    await requestCloseBy(host, 'button');
    const chip = manageButton(host)?.querySelector('.acct-manage__chip');
    expect(chip?.textContent).toBe('빌드 중 · 0분');
    expect(manageButton(host)?.textContent).toBe('연동 관리빌드 중 · 0분');
    await click(manageButton(host));
    expect(manageButton(host)?.querySelector('.acct-manage__chip')).toBeNull();
  });

  it('the panel outlives a close: 15 idle minutes after the dialog closed, the login ends with /gh/logout', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const calls = relayFetch();
      const host = await hydrateOwner({ url: `/game/player-log/?manage#gh=${TICKET}` });
      await until(() => signedIn(host), 'the session');
      await requestCloseBy(host, 'button');
      expect(isOpen(host)).toBe(false);
      expect(calls.some((c) => c.key === '/gh/logout')).toBe(false);
      await act(async () => {
        vi.advanceTimersByTime(15 * 60_000 + 1_000);
      });
      await until(() => calls.some((c) => c.key === '/gh/logout'), '/gh/logout');
      const logout = calls.find((c) => c.key === '/gh/logout');
      expect((logout?.init.headers as Record<string, string>).Authorization).toBe(`Bearer ${HANDLE}`);
      expect(host.querySelector('dialog#acct-dlg section.mp')).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('pagehide sends the handle once as a beacon called on navigator, to the relay\'s /gh/logout', async () => {
    const thisArgs: unknown[] = [];
    const beacon = vi.fn(function (this: unknown, _url: string, _data: string) {
      thisArgs.push(this);
      return true;
    });
    Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true });
    try {
      relayFetch();
      const host = await hydrateOwner({ url: `/game/player-log/?manage#gh=${TICKET}` });
      await until(() => signedIn(host), 'the session');
      await act(async () => {
        window.dispatchEvent(new Event('pagehide'));
      });
      expect(beacon).toHaveBeenCalledTimes(1);
      expect(beacon).toHaveBeenCalledWith(`${RELAY}/gh/logout`, HANDLE);
      expect(thisArgs).toEqual([navigator]);
      await act(async () => {
        window.dispatchEvent(new Event('pagehide'));
      });
      expect(beacon).toHaveBeenCalledTimes(1); // the box is empty after the first
    } finally {
      Reflect.deleteProperty(navigator, 'sendBeacon');
    }
  });

  it('one core binding for the page\'s life: the panel opens its link channel once across opens, switches and closes', async () => {
    relayFetch();
    const host = await hydrateOwner();
    await until(() => panelReady(host), 'the panel');
    expect(FakeChannel.made).toBe(1);
    for (let round = 0; round < 2; round++) {
      await click(manageButton(host));
      await act(async () => dialogOf(host).querySelector<HTMLButtonElement>('.acct-dlg__next')?.click());
      await requestCloseBy(host, 'button');
    }
    await click(tileButtons(host)[2]);
    await requestCloseBy(host, 'esc');
    expect(FakeChannel.made).toBe(1);
  });

  it('client:idle is the island\'s directive on the player log, never client:visible', () => {
    const view = readFileSync(join(process.cwd(), 'src/views/PlayerLogView.astro'), 'utf8');
    const tags = view.match(/<AccountLinks\b[^>]*>/g) ?? [];
    expect(tags).toHaveLength(1);
    expect(tags[0]).toContain(' client:idle ');
    expect(tags[0]).not.toContain('client:visible');
  });

  it('one import site: only AccountLinks imports the panel chunk and the core, both dynamically; no other value import of either outside the chunk', () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
    const files = walk(join(process.cwd(), 'src')).filter((f) => /\.(ts|tsx|astro|mjs)$/.test(f));
    const rel = (f: string) => relative(process.cwd(), f).split('\\').join('/');
    const sites = (re: RegExp) => files.flatMap((f) => (readFileSync(f, 'utf8').match(re) ?? []).map(() => rel(f)));
    expect(sites(/import\(\s*['"][^'"]*account\/ManagePanel['"]\s*\)/g)).toEqual(['src/islands/AccountLinks.tsx']);
    expect(sites(/import\(\s*['"][^'"]*lib\/account-admin['"]\s*\)/g)).toEqual(['src/islands/AccountLinks.tsx']);
    const valueImports = (target: string) => files.filter((f) => new RegExp(`^\\s*import\\s+(?!type\\b)[^;]*?from\\s+['"][^'"]*${target}['"]`, 'm').test(readFileSync(f, 'utf8'))).map(rel);
    expect(valueImports('account/ManagePanel')).toEqual([]);
    expect(valueImports('account-admin')).toEqual(['src/islands/account/ManagePanel.tsx']);
  });
});
