// A figure with an animation (FigureVideo.astro). The still <picture> stays in the flow: the layout, the LCP image, the
// alt text, print and every visit without JavaScript use it. The <video> lies over it once it plays and stops on its
// last frame, which is the still. With motion on (<html data-motion="full"> and no OS reduce) it plays once, the first
// time 40% of the figure is on screen; under reduced motion only the button starts it. It runs longer than 5 s, so it
// keeps the native controls (WCAG 2.2.2: pause, replay). Switching to reduced motion pauses a playing video.

/** src/lib/motion-pref.ts MOTION_EVENT (not imported: that module pulls in React). */
const MOTION_EVENT = 'sb:motion-change';

interface FigureVideoOptions {
  io?: typeof IntersectionObserver;
  reduced?: () => boolean;
}

type State = 'still' | 'playing' | 'ended';

const reducedNow = (): boolean =>
  document.documentElement.dataset.motion === 'reduce' ||
  (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);

export function initFigureVideos(root: ParentNode = document, opts: FigureVideoOptions = {}): void {
  const IO = opts.io ?? (typeof IntersectionObserver === 'function' ? IntersectionObserver : undefined);
  const reduced = opts.reduced ?? reducedNow;
  for (const box of root.querySelectorAll<HTMLElement>('[data-figvid]')) {
    const video = box.querySelector<HTMLVideoElement>('video[data-figvid-video]');
    const button = box.querySelector<HTMLButtonElement>('button[data-figvid-play]');
    if (!video || !button || box.dataset.figvidState !== undefined) continue;
    const set = (state: State): void => {
      box.dataset.figvidState = state;
      video.hidden = state === 'still';
      button.hidden = state !== 'still';
    };
    const start = (): void => {
      set('playing');
      video.currentTime = 0;
      // a refused play() (autoplay policy, no source) leaves the still and its button
      void video.play()?.catch(() => set('still'));
    };
    set('still');
    button.addEventListener('click', () => {
      start();
      video.focus({ preventScroll: true });
    });
    video.addEventListener('ended', () => {
      box.dataset.figvidState = 'ended';
    });
    window.addEventListener(MOTION_EVENT, () => {
      if (reduced() && !video.paused) video.pause();
    });
    if (!IO || reduced()) continue;
    const io = new IO(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        if (!reduced() && box.dataset.figvidState === 'still') start();
      },
      { threshold: 0.4 },
    );
    io.observe(box);
  }
}
