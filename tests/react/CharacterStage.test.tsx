import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/island-image', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/island-image')>();
  return { ...actual, preloadImage: vi.fn(() => Promise.resolve()) };
});
vi.mock('../../src/lib/sound', () => ({ playSfx: vi.fn(() => Promise.resolve()) }));

import CharacterStage, { sideChoice, stageReducer, type StageCharacter, type StageState } from '../../src/islands/CharacterStage';
import { preloadImage, type IslandImage } from '../../src/lib/island-image';
import { playSfx } from '../../src/lib/sound';

const image = (name: string): IslandImage => ({
  src: `/_astro/${name}.webp`,
  srcSet: `/_astro/${name}-480.webp 480w, /_astro/${name}-1600.webp 1600w`,
  sizes: '100vw',
  width: 1600,
  height: 900,
});
const REMIELLE: StageCharacter = { id: 'remielle', label: '레미엘 · ZZZ', image: image('remielle'), objectPosition: '58% 14%' };
const EULA: StageCharacter = { id: 'eula', label: '유라 · 원신', image: image('eula'), objectPosition: '52% 10%' };
const CONTROLS = { groupLabel: '첫 화면 캐릭터 선택', replayLabel: '등장 다시 보기' };

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('stageReducer', () => {
  it('stageReducer transition table', () => {
    const shown: StageState = { phase: 'shown', currentId: 'remielle', nextId: null, play: 0 };
    const idle: StageState = { ...shown, phase: 'idle' };
    const entering: StageState = { ...shown, phase: 'entering' };
    const exiting: StageState = { ...shown, phase: 'exiting', nextId: 'eula' };

    expect(stageReducer(idle, { type: 'START' })).toEqual(entering);
    expect(stageReducer(shown, { type: 'START' })).toBe(shown);
    expect(stageReducer(entering, { type: 'ENTER_END' })).toEqual(shown);
    expect(stageReducer(shown, { type: 'ENTER_END' })).toBe(shown);
    expect(stageReducer(shown, { type: 'SELECT', id: 'remielle' })).toEqual({ ...shown, phase: 'entering', play: 1 });
    expect(stageReducer(entering, { type: 'SELECT', id: 'eula' })).toEqual({ ...shown, phase: 'exiting', nextId: 'eula' });
    expect(stageReducer(shown, { type: 'REPLAY' })).toEqual({ ...shown, phase: 'entering', play: 1 });
    expect(stageReducer(exiting, { type: 'EXIT_END' })).toEqual({ phase: 'entering', currentId: 'eula', nextId: null, play: 1 });
    expect(stageReducer(shown, { type: 'EXIT_END' })).toBe(shown);
    expect(stageReducer(idle, { type: 'SET', id: 'eula' })).toEqual({ ...idle, currentId: 'eula' }); // before the first entrance
    expect(stageReducer(shown, { type: 'SET', id: 'eula' })).toBe(shown); // later changes animate (SELECT)
    for (const action of [{ type: 'SELECT', id: 'eula' }, { type: 'REPLAY' }] as const) {
      expect(stageReducer(idle, action)).toBe(idle); // ignored while idle
      expect(stageReducer(exiting, action)).toBe(exiting); // ignored while busy
    }
  });
});

describe('CharacterStage', () => {
  it('renders nothing without characters', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { container, rerender } = render(<CharacterStage variant="hero" trigger="load" characters={[]} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<CharacterStage variant="hero" trigger="load" characters={[REMIELLE]} />); // same hook order both ways
    expect(container.querySelector('.char-stage')).not.toBeNull();
    rerender(<CharacterStage variant="hero" trigger="load" characters={[]} />);
    expect(container).toBeEmptyDOMElement();
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it('trigger=load renders data-phase=entering on first render', async () => {
    expect(renderToString(<CharacterStage variant="hero" trigger="load" characters={[REMIELLE]} />)).toContain(
      'data-phase="entering"',
    );
    expect(renderToString(<CharacterStage variant="side" trigger="visible" characters={[EULA]} />)).toContain(
      'data-phase="idle"',
    );
    const { container } = render(<CharacterStage variant="side" trigger="visible" characters={[EULA]} />);
    const stage = container.querySelector<HTMLElement>('.char-stage');
    await waitFor(() => expect(stage?.dataset.phase).toBe('entering')); // START after the art is decoded
    expect(preloadImage).toHaveBeenCalledWith(EULA.image);
    expect(stage).toHaveClass('char-stage--side');
  });

  it("art is decorative (alt='' inside aria-hidden frame)", () => {
    const { container } = render(<CharacterStage variant="hero" trigger="load" priority characters={[REMIELLE]} />);
    const img = container.querySelector<HTMLImageElement>('img.char-stage__img');
    expect(img).toHaveAttribute('alt', '');
    expect(img?.closest('.char-stage__frame')).toHaveAttribute('aria-hidden', 'true');
    expect(img).toHaveAttribute('loading', 'eager');
    expect(img).toHaveAttribute('fetchpriority', 'high');
    expect(img).toHaveAttribute('sizes', '100vw');
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('3 streaks when streaks is true, none when false', () => {
    const on = render(<CharacterStage variant="hero" trigger="load" streaks characters={[REMIELLE]} />);
    expect(on.container.querySelectorAll('.char-stage__streak')).toHaveLength(3);
    expect(on.container.querySelector('.char-stage__streaks')).toHaveAttribute('aria-hidden', 'true');
    on.unmount();
    const off = render(<CharacterStage variant="side" trigger="load" streaks={false} characters={[EULA]} />);
    expect(off.container.querySelectorAll('.char-stage__streak')).toHaveLength(0);
  });

  it('entrance keyframes start at translateX(40%) and last 0.6s', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/islands/CharacterStage.css'), 'utf8');
    expect(css).toMatch(/@keyframes char-enter\s*\{\s*from\s*\{\s*transform:\s*translateX\(40%\);\s*opacity:\s*0;\s*\}/);
    expect(css).toMatch(/animation:\s*char-enter var\(--dur-enter\) var\(--ease-out\)/);
    expect(css).toMatch(/animation:\s*char-exit var\(--dur-exit\)/);
    expect(css).toMatch(/:root\[data-motion="reduce"\] \.char-stage__streak\s*\{\s*animation:\s*none/);
    expect(css).not.toMatch(/infinite/);
    const tokens = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8');
    expect(tokens).toMatch(/--dur-enter:\s*0?\.6s/);
    expect(tokens).toMatch(/--dur-exit:\s*0?\.25s/);
    expect(tokens).toMatch(/--ease-out:\s*cubic-bezier\(\s*0?\.22,\s*1,\s*0?\.36,\s*1\s*\)/);
  });

  it('swap buttons use aria-pressed and only render for 2+ characters', () => {
    const single = render(<CharacterStage variant="hero" trigger="load" characters={[REMIELLE]} controls={CONTROLS} />);
    expect(single.queryByRole('group')).toBeNull();
    expect(single.getByRole('button', { name: /등장 다시 보기/ })).toBeInTheDocument();
    single.unmount();

    render(<CharacterStage variant="hero" trigger="load" characters={[REMIELLE, EULA]} controls={CONTROLS} />);
    const group = screen.getByRole('group', { name: '첫 화면 캐릭터 선택' });
    const buttons = within(group).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['레미엘 · ZZZ', '유라 · 원신']);
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'true');
    expect(buttons[1]).toHaveAttribute('aria-pressed', 'false');
  });

  it('swap/replay controls mount only after hydration (no dead buttons in the SSR markup)', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const stage = <CharacterStage variant="hero" trigger="load" characters={[REMIELLE, EULA]} controls={CONTROLS} />;
    const html = renderToString(stage);
    expect(html).toContain('class="char-stage char-stage--hero"');
    expect(html).not.toContain('char-stage__controls'); // without JS, or before client:visible hydrates
    expect(html).not.toContain('<button');

    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
    const onRecoverableError = vi.fn();
    render(stage, { container, hydrate: true, onRecoverableError });
    const group = within(container).getByRole('group', { name: '첫 화면 캐릭터 선택' });
    expect(within(group).getAllByRole('button')).toHaveLength(2);
    expect(within(container).getByRole('button', { name: /등장 다시 보기/ })).toBeInTheDocument();
    expect(onRecoverableError, 'hydration matched the server markup').not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it('selecting the other character enters exiting then entering after the exit delay', async () => {
    vi.useFakeTimers();
    const { container } = render(
      <CharacterStage variant="hero" trigger="load" characters={[REMIELLE, EULA]} controls={CONTROLS} />,
    );
    const stage = container.querySelector<HTMLElement>('.char-stage');
    fireEvent.click(screen.getByRole('button', { name: '유라 · 원신' }));
    expect(stage?.dataset.phase).toBe('exiting');
    expect(playSfx).toHaveBeenCalledWith('select');
    expect(screen.getByRole('button', { name: '유라 · 원신' })).toHaveAttribute('aria-pressed', 'true');
    expect(container.querySelector('.char-stage__img')?.getAttribute('src')).toBe('/_astro/remielle.webp');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(stage?.dataset.phase).toBe('exiting'); // the 0.25s exit is not over yet

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60);
    });
    expect(stage?.dataset.phase).toBe('entering');
    expect(container.querySelector('.char-stage__img')?.getAttribute('src')).toBe('/_astro/eula.webp');
    expect(preloadImage).toHaveBeenCalledWith(EULA.image);
  });

  it('final fix 2 item 10: the MAIN MENU side stage never shows the character on the hero', async () => {
    vi.useFakeTimers();
    const { container } = render(
      <>
        <CharacterStage variant="hero" trigger="load" characters={[REMIELLE, EULA]} controls={CONTROLS} />
        <CharacterStage variant="side" trigger="visible" characters={[EULA, REMIELLE]} initialId="eula" />
      </>,
    );
    const hero = container.querySelector<HTMLElement>('.char-stage--hero');
    const side = container.querySelector<HTMLElement>('.char-stage--side');
    const sideSrc = (): string | null | undefined => side?.querySelector('.char-stage__img')?.getAttribute('src');
    expect(hero?.dataset.pick).toBe('remielle');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(sideSrc()).toBe('/_astro/eula.webp'); // the approved pairing: Remielle on the hero, Eula beside the menu
    fireEvent.click(screen.getByRole('button', { name: '유라 · 원신' }));
    expect(hero?.dataset.pick).toBe('eula');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });
    expect(sideSrc(), 'Eula on the hero: the side switches to Remielle').toBe('/_astro/remielle.webp');
    fireEvent.click(screen.getByRole('button', { name: '레미엘 · ZZZ' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });
    expect(sideSrc(), 'Remielle back on the hero: Eula returns beside the menu').toBe('/_astro/eula.webp');
  });

  it('final fix 2 item 10: a side stage that mounts after the pick reads it from the hero', async () => {
    const { container } = render(<CharacterStage variant="hero" trigger="load" characters={[REMIELLE, EULA]} initialId="eula" controls={CONTROLS} />);
    expect(container.querySelector<HTMLElement>('.char-stage--hero')?.dataset.pick).toBe('eula');
    const later = render(<CharacterStage variant="side" trigger="visible" characters={[EULA, REMIELLE]} initialId="eula" />);
    await waitFor(() => expect(later.container.querySelector('.char-stage__img')?.getAttribute('src')).toBe('/_astro/remielle.webp'));
    await waitFor(() => expect(later.container.querySelector<HTMLElement>('.char-stage')?.dataset.phase).toBe('entering'));
  });

  it('sideChoice keeps the first choice unless the hero shows it', () => {
    expect(sideChoice(['eula', 'remielle'], 'eula', null)).toBe('eula');
    expect(sideChoice(['eula', 'remielle'], 'eula', 'remielle')).toBe('eula');
    expect(sideChoice(['eula', 'remielle'], 'eula', 'eula')).toBe('remielle');
    expect(sideChoice(['eula'], 'eula', 'eula')).toBe('eula'); // nothing else to show (HomeView then drops the side art)
  });

  it('replay increments play and dispatches sb:stage-enter', () => {
    const seen: { variant: string; play: number }[] = [];
    const onEnter = (event: Event) => seen.push((event as CustomEvent<{ variant: string; play: number }>).detail);
    window.addEventListener('sb:stage-enter', onEnter);
    const { container } = render(<CharacterStage variant="hero" trigger="load" characters={[REMIELLE]} controls={CONTROLS} />);
    expect(seen).toEqual([]); // the first-paint entrance is not a replay
    const firstImg = container.querySelector('.char-stage__img');
    fireEvent.click(screen.getByRole('button', { name: /등장 다시 보기/ }));
    expect(seen).toEqual([{ variant: 'hero', play: 1 }]);
    expect(container.querySelector('.char-stage__img')).not.toBe(firstImg); // remounted → keyframes restart
    fireEvent.click(screen.getByRole('button', { name: /등장 다시 보기/ }));
    expect(seen.at(-1)).toEqual({ variant: 'hero', play: 2 });
    window.removeEventListener('sb:stage-enter', onEnter);
  });

  it('preloadImage never rejects, resolves at capMs and caches per srcSet', async () => {
    vi.useFakeTimers();
    const actual = await vi.importActual<typeof import('../../src/lib/island-image')>('../../src/lib/island-image');
    const original = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'decode');
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      configurable: true,
      value: () => new Promise<void>(() => undefined), // never settles
    });
    try {
      let done = false;
      void actual.preloadImage(image('cap'), 1500).then(() => {
        done = true;
      });
      await vi.advanceTimersByTimeAsync(1499);
      expect(done).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(done).toBe(true);
      expect(actual.preloadImage(image('cap'))).toBe(actual.preloadImage(image('cap')));
    } finally {
      if (original) Object.defineProperty(HTMLImageElement.prototype, 'decode', original);
      else delete (HTMLImageElement.prototype as { decode?: unknown }).decode;
    }
  });
});
