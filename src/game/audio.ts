/**
 * Stage 4 — tiny Web Audio synth for sound effects. No assets, no files:
 * every sound is synthesized from oscillators and filtered noise.
 *
 * The context is created on the first user gesture (title screen click /
 * Enter) via initAudio(). All sfx calls are safe before init (no-ops).
 */

let ctx: AudioContext | null = null;
let muted = false;

export function initAudio(): void {
  try {
    if (!ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      ctx = new AC();
    }
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    ctx = null;
  }
}

export function toggleMute(): boolean {
  muted = !muted;
  return muted;
}

export function isMuted(): boolean {
  return muted;
}

interface ToneOpts {
  freq: number;
  freqEnd?: number;
  dur: number;
  type?: OscillatorType;
  vol?: number;
  delay?: number;
}

function tone({ freq, freqEnd, dur, type = "square", vol = 0.12, delay = 0 }: ToneOpts): void {
  if (!ctx || muted) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (freqEnd !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
  }
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noiseBurst(dur: number, vol: number, filterFreq: number, delay = 0): void {
  if (!ctx || muted) return;
  const t0 = ctx.currentTime + delay;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = filterFreq;
  filter.Q.value = 0.8;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(filter).connect(g).connect(ctx.destination);
  src.start(t0);
}

const arp = (freqs: number[], step: number, opts: Omit<ToneOpts, "freq" | "delay">) =>
  freqs.forEach((freq, i) => tone({ ...opts, freq, delay: i * step }));

export const sfx = {
  swing() {
    noiseBurst(0.16, 0.1, 2200);
  },
  swordHit() {
    tone({ freq: 200, freqEnd: 90, dur: 0.1, type: "square", vol: 0.16 });
    noiseBurst(0.06, 0.08, 900);
  },
  enemyDie() {
    tone({ freq: 420, freqEnd: 70, dur: 0.32, type: "sawtooth", vol: 0.14 });
  },
  rupee() {
    tone({ freq: 880, dur: 0.07, type: "square", vol: 0.1 });
    tone({ freq: 1318, dur: 0.14, type: "square", vol: 0.1, delay: 0.07 });
  },
  heart() {
    tone({ freq: 520, dur: 0.12, type: "triangle", vol: 0.14 });
    tone({ freq: 780, dur: 0.2, type: "triangle", vol: 0.14, delay: 0.1 });
  },
  key() {
    arp([660, 880, 1174], 0.09, { dur: 0.12, type: "square", vol: 0.1 });
  },
  gate() {
    noiseBurst(0.5, 0.14, 180);
    tone({ freq: 75, freqEnd: 45, dur: 0.5, type: "sawtooth", vol: 0.12 });
  },
  chest() {
    arp([523, 659, 784, 1046], 0.12, { dur: 0.2, type: "triangle", vol: 0.14 });
  },
  hurt() {
    tone({ freq: 170, freqEnd: 60, dur: 0.25, type: "sawtooth", vol: 0.18 });
  },
  bossShoot() {
    tone({ freq: 900, freqEnd: 180, dur: 0.3, type: "sawtooth", vol: 0.16 });
    noiseBurst(0.2, 0.1, 600);
  },
  bossCharge() {
    // Rising whine as the boss inhales before hurling its fireball —
    // the audio half of the telegraph.
    tone({ freq: 160, freqEnd: 920, dur: 0.55, type: "sawtooth", vol: 0.13 });
    noiseBurst(0.5, 0.05, 900);
  },
  fireHit() {
    noiseBurst(0.15, 0.14, 1400);
    tone({ freq: 300, freqEnd: 80, dur: 0.18, type: "square", vol: 0.12 });
  },
  victory() {
    arp([523, 659, 784, 1046, 784, 1046, 1318], 0.15, {
      dur: 0.24,
      type: "triangle",
      vol: 0.15,
    });
  },
  ui() {
    tone({ freq: 700, dur: 0.06, type: "square", vol: 0.08 });
  },
};
