// src/lib/paper-sound.ts — the chooser's page-turn sound (MO-40, chooser v6.10): synthesised with Web Audio, no file and
// no request. One 0.6 s buffer of white noise (a seeded PRNG, so every visit sounds the same) through three filtered
// voices into a master gain of .25: a rustle (band-pass Q .9 sweeping 1.3 → 3.6 kHz over .3 s, a crinkled envelope),
// the air of the moving sheet (low-pass Q .5, 500 → 1100 → 600 Hz) and the flick as it lays over (high-pass Q .7 at
// 2.4 kHz, .255–.33 s); every source stops at t0 + .44 s. Pure graph building: the caller owns the context and decides
// whether a sound may play at all (a user gesture, no reduced motion, not muted, a visible tab).

export const PAPER_SOUND = { gain: 0.25, durationS: 0.44 } as const;

/** xorshift32 in [0, 1). */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

const buffers = new WeakMap<BaseAudioContext, AudioBuffer>();

/** The noise buffer, made once per context (deterministic). */
export function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const cached = buffers.get(ctx);
  if (cached) return cached;
  const length = Math.round(ctx.sampleRate * 0.6);
  const buf = ctx.createBuffer(1, length, ctx.sampleRate);
  const ch = buf.getChannelData(0);
  const r = rng(1013);
  for (let i = 0; i < length; i++) ch[i] = r() * 2 - 1;
  buffers.set(ctx, buf);
  return buf;
}

/** Schedules the sound at t0 (seconds, the context's clock). */
export function paperSound(ctx: BaseAudioContext, noise: AudioBuffer, t0: number): void {
  const end = t0 + PAPER_SOUND.durationS;
  const master = ctx.createGain();
  master.gain.setValueAtTime(PAPER_SOUND.gain, t0);
  master.connect(ctx.destination);
  const voice = (type: BiquadFilterType, q: number, offset: number, build: (f: AudioParam, g: AudioParam) => void) => {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    build(filter.frequency, gain.gain);
    src.start(t0, offset);
    src.stop(end);
  };
  voice('bandpass', 0.9, 0, (f, g) => {
    f.setValueAtTime(1300, t0);
    f.exponentialRampToValueAtTime(3600, t0 + 0.3);
    g.setValueAtTime(0, t0);
    const r = rng(77);
    for (let at = 0.02; at < 0.31; at += 0.022) g.linearRampToValueAtTime(Math.min(1, at / 0.05) * (1 - Math.max(0, at - 0.18) / 0.2) * (0.45 + 0.55 * r()), t0 + at);
    g.exponentialRampToValueAtTime(0.001, t0 + 0.4);
    g.setValueAtTime(0, t0 + 0.405);
  });
  voice('lowpass', 0.5, 0.2, (f, g) => {
    f.setValueAtTime(500, t0);
    f.exponentialRampToValueAtTime(1100, t0 + 0.2);
    f.exponentialRampToValueAtTime(600, t0 + 0.38);
    g.setValueAtTime(0, t0);
    g.linearRampToValueAtTime(0.55, t0 + 0.13);
    g.linearRampToValueAtTime(0, t0 + 0.38);
  });
  voice('highpass', 0.7, 0.4, (f, g) => {
    f.setValueAtTime(2400, t0);
    g.setValueAtTime(0, t0);
    g.setValueAtTime(0, t0 + 0.255);
    g.linearRampToValueAtTime(1, t0 + 0.262);
    g.exponentialRampToValueAtTime(0.001, t0 + 0.33);
    g.setValueAtTime(0, t0 + 0.335);
  });
}
