// The page-turn sound (MO-40): Web Audio, synthesised (no file, no request). A fake BaseAudioContext records every node,
// its settings and every scheduled value, so the graph is checked without audio.
import { describe, expect, it } from 'vitest';
import { PAPER_SOUND, noiseBuffer, paperSound } from '../../src/lib/paper-sound';

type Ev = [string, number, number];
class FakeParam {
  value = 0;
  events: Ev[] = [];
  setValueAtTime(v: number, t: number) { this.events.push(['set', v, t]); return this; }
  linearRampToValueAtTime(v: number, t: number) { this.events.push(['lin', v, t]); return this; }
  exponentialRampToValueAtTime(v: number, t: number) { this.events.push(['exp', v, t]); return this; }
}
class FakeNode { out: unknown[] = []; connect(n: unknown) { this.out.push(n); return n; } }
class FakeGain extends FakeNode { gain = new FakeParam(); }
class FakeFilter extends FakeNode { type = ''; Q = new FakeParam(); frequency = new FakeParam(); }
class FakeSource extends FakeNode { buffer: unknown = null; starts: number[][] = []; stops: number[] = []; start(t: number, off = 0) { this.starts.push([t, off]); } stop(t: number) { this.stops.push(t); } }
class FakeCtx {
  sampleRate = 48000;
  currentTime = 1;
  destination = new FakeNode();
  gains: FakeGain[] = [];
  filters: FakeFilter[] = [];
  sources: FakeSource[] = [];
  buffers: { channels: number; length: number; data: Float32Array }[] = [];
  createGain() { const g = new FakeGain(); this.gains.push(g); return g; }
  createBiquadFilter() { const f = new FakeFilter(); this.filters.push(f); return f; }
  createBufferSource() { const s = new FakeSource(); this.sources.push(s); return s; }
  createBuffer(channels: number, length: number) { const data = new Float32Array(length); const b = { channels, length, data, getChannelData: () => data }; this.buffers.push(b); return b; }
}

describe('paperSound (MO-40)', () => {
  it('three voices, filter types and Q as specified, master gain .25, every source stops by t0 + .44 s', () => {
    const ctx = new FakeCtx();
    const noise = noiseBuffer(ctx as unknown as BaseAudioContext);
    paperSound(ctx as unknown as BaseAudioContext, noise, 2);
    expect(PAPER_SOUND).toEqual({ gain: 0.25, durationS: 0.44 });
    expect(ctx.filters.map((f) => [f.type, f.Q.value])).toEqual([['bandpass', 0.9], ['lowpass', 0.5], ['highpass', 0.7]]);
    const master = ctx.gains[0]!;
    expect(master.gain.events[0]).toEqual(['set', 0.25, 2]);
    expect(master.out).toEqual([ctx.destination]);
    expect(ctx.sources).toHaveLength(3);
    for (const s of ctx.sources) {
      expect(s.buffer).toBe(noise);
      expect(s.stops).toEqual([2 + 0.44]);
    }
    // the rustle sweeps 1.3 → 3.6 kHz over .3 s; the flick sits at .255–.33 s
    expect(ctx.filters[0]!.frequency.events.slice(0, 2)).toEqual([['set', 1300, 2], ['exp', 3600, 2.3]]);
    expect(ctx.filters[2]!.frequency.events[0]).toEqual(['set', 2400, 2]);
    const flick = ctx.gains[3]!.gain.events.map((e) => e[2] - 2);
    expect(Math.min(...flick.filter((t) => t > 0))).toBeCloseTo(0.255, 3);
    // nothing is scheduled past the end
    for (const g of ctx.gains) for (const e of g.gain.events) expect(e[2]).toBeLessThanOrEqual(2 + 0.44 + 1e-9);
  });

  it('the noise buffer is deterministic and created once per page', () => {
    const a = new FakeCtx();
    const b = new FakeCtx();
    const na = noiseBuffer(a as unknown as BaseAudioContext) as unknown as { data: Float32Array };
    const nb = noiseBuffer(b as unknown as BaseAudioContext) as unknown as { data: Float32Array };
    expect(na.data.length).toBe(Math.round(48000 * 0.6));
    expect(Array.from(na.data.slice(0, 50))).toEqual(Array.from(nb.data.slice(0, 50)));
    expect(noiseBuffer(a as unknown as BaseAudioContext)).toBe(na); // cached per context
    expect(a.buffers).toHaveLength(1);
  });
});
