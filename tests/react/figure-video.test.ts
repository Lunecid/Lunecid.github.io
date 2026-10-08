// A figure's animation (src/scripts/figure-video.ts, FigureVideo.astro): the still stays until the video plays; with
// motion on it plays once when the figure comes into view, under reduced motion only the button starts it.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initFigureVideos } from '../../src/scripts/figure-video';

type Entry = { target: Element; isIntersecting: boolean };
class FakeIO {
  static all: FakeIO[] = [];
  readonly observed = new Set<Element>();
  disconnected = false;
  constructor(readonly callback: (entries: Entry[]) => void, readonly options?: { threshold?: number }) {
    FakeIO.all.push(this);
  }
  observe(el: Element): void { this.observed.add(el); }
  unobserve(el: Element): void { this.observed.delete(el); }
  disconnect(): void { this.disconnected = true; this.observed.clear(); }
  report(isIntersecting: boolean): void { this.callback([...this.observed].map((target) => ({ target, isIntersecting }))); }
}
const io = FakeIO as unknown as typeof IntersectionObserver;

/** FigureVideo's markup: the still, the hidden video and the hidden button. */
function figure(play: () => Promise<void> = () => Promise.resolve()) {
  document.body.innerHTML = `<div class="figvid" data-figvid><picture><img alt="still"></picture>
    <video data-figvid-video muted playsinline preload="none" controls hidden tabindex="0"><source src="/video/x.webm" type="video/webm"><source src="/video/x.mp4" type="video/mp4"></video>
    <button type="button" data-figvid-play hidden>Play animation</button></div>`;
  const box = document.querySelector<HTMLElement>('[data-figvid]')!;
  const video = box.querySelector('video')!;
  const button = box.querySelector('button')!;
  let paused = true;
  Object.defineProperty(video, 'paused', { get: () => paused });
  const playSpy = vi.fn(() => { paused = false; return play(); });
  const pauseSpy = vi.fn(() => { paused = true; });
  video.play = playSpy as unknown as HTMLVideoElement['play'];
  video.pause = pauseSpy;
  return { box, video, button, playSpy, pauseSpy };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('initFigureVideos (src/scripts/figure-video.ts)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    FakeIO.all = [];
  });

  it('shows the still with its button; the video stays hidden and nothing plays until the figure is on screen', () => {
    const { box, video, button, playSpy } = figure();
    initFigureVideos(document, { io, reduced: () => false });
    expect(box.dataset.figvidState).toBe('still');
    expect(video.hidden).toBe(true);
    expect(button.hidden).toBe(false);
    expect(FakeIO.all).toHaveLength(1);
    expect(FakeIO.all[0]?.options?.threshold).toBe(0.4);
    FakeIO.all[0]?.report(false);
    expect(playSpy).not.toHaveBeenCalled();
  });

  it('with motion on, plays once when it comes into view, over the still, and stops on its last frame', () => {
    const { box, video, button, playSpy } = figure();
    initFigureVideos(document, { io, reduced: () => false });
    FakeIO.all[0]?.report(true);
    expect(playSpy).toHaveBeenCalledTimes(1);
    expect(box.dataset.figvidState).toBe('playing');
    expect(video.hidden).toBe(false);
    expect(button.hidden).toBe(true);
    expect(FakeIO.all[0]?.disconnected).toBe(true);
    video.dispatchEvent(new Event('ended'));
    expect(box.dataset.figvidState).toBe('ended');
    expect(video.hidden).toBe(false); // the last frame, which is the still, with the controls to replay
  });

  it('under reduced motion it never starts by itself; the button starts it and moves focus to the video', () => {
    const { box, video, button, playSpy } = figure();
    initFigureVideos(document, { io, reduced: () => true });
    expect(FakeIO.all).toHaveLength(0);
    expect(playSpy).not.toHaveBeenCalled();
    button.click();
    expect(playSpy).toHaveBeenCalledTimes(1);
    expect(box.dataset.figvidState).toBe('playing');
    expect(document.activeElement).toBe(video);
  });

  it('a refused play() returns to the still and its button', async () => {
    const { box, video, button } = figure(() => Promise.reject(new Error('NotAllowedError')));
    initFigureVideos(document, { io, reduced: () => false });
    FakeIO.all[0]?.report(true);
    await flush();
    expect(box.dataset.figvidState).toBe('still');
    expect(video.hidden).toBe(true);
    expect(button.hidden).toBe(false);
  });

  it('switching to reduced motion pauses a playing video', () => {
    let reduce = false;
    const { pauseSpy } = figure();
    initFigureVideos(document, { io, reduced: () => reduce });
    FakeIO.all[0]?.report(true);
    reduce = true;
    window.dispatchEvent(new Event('sb:motion-change'));
    expect(pauseSpy).toHaveBeenCalledTimes(1);
  });

  it('a second call does not bind the figure again', () => {
    const { button, playSpy } = figure();
    initFigureVideos(document, { io, reduced: () => true });
    initFigureVideos(document, { io, reduced: () => true });
    button.click();
    expect(playSpy).toHaveBeenCalledTimes(1);
  });
});
