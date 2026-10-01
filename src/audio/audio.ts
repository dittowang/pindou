/**
 * Procedural sound: every sample is synthesised at start-up from damped resonances + noise bursts
 * (no audio files). Short "impact" buffers are generated in many variants and played with random
 * pitch so a pile of beads never sounds like one repeated sample.
 */
export type ImpactKind = 'beadBead' | 'beadPlate' | 'beadTray' | 'peg' | 'tweezerTick' | 'tweezerGrip' | 'tableKnock' | 'ui'

interface ModeSpec { f: number; d: number; a: number }

function renderImpact(ctx: BaseAudioContext, modes: ModeSpec[], noiseMs: number, noiseA: number, len: number, rnd: () => number): AudioBuffer {
  const sr = ctx.sampleRate
  const n = Math.floor(len * sr)
  const buf = ctx.createBuffer(1, n, sr)
  const ch = buf.getChannelData(0)
  for (const m of modes) {
    const f = m.f * (1 + (rnd() - 0.5) * 0.06)
    const ph = rnd() * Math.PI * 2
    for (let i = 0; i < n; i++) {
      const t = i / sr
      ch[i] += Math.sin(2 * Math.PI * f * t + ph) * Math.exp(-t / m.d) * m.a
    }
  }
  // contact noise burst (band-limited by a crude 1-pole low-pass)
  let lp = 0
  const nn = Math.floor((noiseMs / 1000) * sr)
  for (let i = 0; i < nn; i++) {
    const w = (rnd() * 2 - 1) * Math.pow(1 - i / nn, 2)
    lp += (w - lp) * 0.55
    ch[i] += lp * noiseA
  }
  // normalise softly
  let peak = 0
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(ch[i]))
  if (peak > 0) for (let i = 0; i < n; i++) ch[i] /= peak
  return buf
}

const SPECS: Record<ImpactKind, { modes: ModeSpec[]; noiseMs: number; noiseA: number; len: number; gain: number }> = {
  // hollow little plastic tube hitting another: bright ring + a hint of body
  beadBead: { modes: [{ f: 3300, d: 0.0075, a: 1 }, { f: 5600, d: 0.005, a: 0.55 }, { f: 8700, d: 0.0028, a: 0.3 }, { f: 1500, d: 0.012, a: 0.25 }], noiseMs: 2.2, noiseA: 0.55, len: 0.09, gain: 0.5 },
  // bead on the clear plate: duller, with the plate's own thud
  beadPlate: { modes: [{ f: 2500, d: 0.007, a: 0.8 }, { f: 4300, d: 0.0045, a: 0.45 }, { f: 820, d: 0.022, a: 0.8 }, { f: 1450, d: 0.015, a: 0.45 }], noiseMs: 2.6, noiseA: 0.5, len: 0.11, gain: 0.55 },
  // bead settling in the sorting tray
  beadTray: { modes: [{ f: 2100, d: 0.008, a: 0.85 }, { f: 3900, d: 0.0045, a: 0.4 }, { f: 640, d: 0.026, a: 0.7 }], noiseMs: 2.4, noiseA: 0.45, len: 0.1, gain: 0.5 },
  // bead sliding onto a peg: the satisfying "tok"
  peg: { modes: [{ f: 1250, d: 0.016, a: 1 }, { f: 2300, d: 0.01, a: 0.55 }, { f: 4200, d: 0.005, a: 0.25 }, { f: 520, d: 0.03, a: 0.5 }], noiseMs: 3.2, noiseA: 0.65, len: 0.13, gain: 0.6 },
  // steel tips touching: tiny crisp tick
  tweezerTick: { modes: [{ f: 6200, d: 0.004, a: 1 }, { f: 9800, d: 0.0025, a: 0.5 }, { f: 3100, d: 0.007, a: 0.35 }], noiseMs: 1.2, noiseA: 0.7, len: 0.05, gain: 0.32 },
  tweezerGrip: { modes: [{ f: 4400, d: 0.0045, a: 0.8 }, { f: 7200, d: 0.003, a: 0.35 }, { f: 2200, d: 0.008, a: 0.4 }], noiseMs: 1.5, noiseA: 0.55, len: 0.06, gain: 0.28 },
  tableKnock: { modes: [{ f: 190, d: 0.05, a: 1 }, { f: 380, d: 0.03, a: 0.5 }, { f: 90, d: 0.07, a: 0.6 }], noiseMs: 4, noiseA: 0.5, len: 0.2, gain: 0.55 },
  ui: { modes: [{ f: 1760, d: 0.05, a: 1 }, { f: 2640, d: 0.035, a: 0.4 }, { f: 3520, d: 0.02, a: 0.18 }], noiseMs: 0.8, noiseA: 0.2, len: 0.25, gain: 0.22 },
}

export class AudioEngine {
  ctx: AudioContext | null = null
  private master!: GainNode
  private comp!: DynamicsCompressorNode
  private bufs = new Map<ImpactKind, AudioBuffer[]>()
  private noise!: AudioBuffer
  private enabled = false
  private voices = 0
  private bucket = 30
  private bucketT = 0
  private pourBusy = 0
  /** continuous sounds that are currently running (paper, iron, roller, room tone) — for tests: nothing may keep running after its job is done */
  readonly loops = new Set<object>()
  private lastPlay = new Map<string, number>()

  get on() { return this.enabled }

  /** must be called from a user gesture */
  async enable(): Promise<void> {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext
      this.ctx = new AC({ latencyHint: 'interactive' })
      this.master = this.ctx.createGain()
      this.master.gain.value = 0.85
      this.comp = this.ctx.createDynamicsCompressor()
      this.comp.threshold.value = -14; this.comp.knee.value = 18; this.comp.ratio.value = 3.5
      this.comp.attack.value = 0.002; this.comp.release.value = 0.12
      this.master.connect(this.comp).connect(this.ctx.destination)
      this.synthesize()
    }
    await this.ctx.resume()
    this.enabled = true
    this.startAmbient()
  }

  /** the quiet of a small shop: air-conditioner hum and a breath of room noise, barely there */
  private ambient: ReturnType<AudioEngine['noiseLoop']> = null
  private ambientAir: ReturnType<AudioEngine['noiseLoop']> = null
  private startAmbient() {
    if (this.ambient || !this.ctx) return
    this.ambient = this.noiseLoop({ freq: 240, q: 0.6, gain: 0.011, type: 'lowpass' })
    this.ambientAir = this.noiseLoop({ freq: 2600, q: 0.5, gain: 0.0016, type: 'highpass' })
    this.ambient?.set(240, 1, 1.2)
    this.ambientAir?.set(2600, 1, 1.2)
    // the hum drifts a little, as a real room's does
    window.setInterval(() => {
      if (!this.enabled) return
      this.ambient?.set(200 + Math.random() * 140, 0.8 + Math.random() * 0.4, 2.5)
    }, 3500)
  }
  disable() { this.enabled = false; this.master?.gain.setTargetAtTime(0, this.ctx!.currentTime, 0.05); setTimeout(() => this.ctx?.suspend(), 200) }
  async toggle() { if (this.enabled) this.disable(); else { await this.enable(); this.master.gain.setTargetAtTime(0.85, this.ctx!.currentTime, 0.05) } return this.enabled }

  private synthesize() {
    const ctx = this.ctx!
    let s = 1234567
    const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296)
    for (const kind of Object.keys(SPECS) as ImpactKind[]) {
      const sp = SPECS[kind]
      const arr: AudioBuffer[] = []
      const variants = kind === 'ui' ? 3 : 10
      for (let i = 0; i < variants; i++) arr.push(renderImpact(ctx, sp.modes, sp.noiseMs, sp.noiseA, sp.len, rnd))
      this.bufs.set(kind, arr)
    }
    // 2 s of white noise for filtered textures (paper, iron, roller)
    const sr = ctx.sampleRate
    this.noise = ctx.createBuffer(1, sr * 2, sr)
    const d = this.noise.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1
  }

  /** one impact. `v` in 0..1 (loudness), `pitch` multiplies playback rate, `pan` -1..1 */
  impact(kind: ImpactKind, v = 0.6, pitch = 1, pan = 0) {
    if (!this.enabled || !this.ctx) return
    const now = this.ctx.currentTime
    // keep bead storms in check: at most ~40 sounds a second, 20 at once
    if (this.voices > 20) return
    this.bucket = Math.min(30, this.bucket + (now - this.bucketT) * 40)
    this.bucketT = now
    if (this.bucket < 1) return
    this.bucket -= 1
    const key = kind
    const last = this.lastPlay.get(key) ?? 0
    if (now - last < 0.004) return
    this.lastPlay.set(key, now)
    const list = this.bufs.get(kind)!
    const src = this.ctx.createBufferSource()
    src.buffer = list[(Math.random() * list.length) | 0]
    src.playbackRate.value = pitch * (1 + (Math.random() - 0.5) * 0.12)
    const g = this.ctx.createGain()
    g.gain.value = Math.min(1, Math.max(0, v)) * SPECS[kind].gain
    let node: AudioNode = g
    if (pan !== 0 && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan))
      g.connect(p); node = p
    }
    src.connect(g)
    node.connect(this.master)
    this.voices++
    src.onended = () => { this.voices--; src.disconnect(); g.disconnect() }
    src.start(now)
  }

  /** beads being poured into a compartment: a short, soft patter (never a storm — however many beads, it is over in half a second) */
  pour(n: number) {
    if (!this.enabled || !this.ctx) return
    const now = performance.now()
    const busy = now < this.pourBusy
    this.pourBusy = now + 420
    const k = busy ? 2 : Math.max(3, Math.min(8, Math.round(n / 14)))
    for (let i = 0; i < k; i++) {
      setTimeout(() => this.impact('beadTray', 0.34 * (1 - i / (k + 1)), 0.9 + Math.random() * 0.35, (Math.random() - 0.5) * 0.3), i * 48 + Math.random() * 20)
    }
  }

  /** a small shop-cat "mew": two glided formants over a buzzy glottal source */
  meow(pitch = 1) {
    if (!this.enabled || !this.ctx) return
    const ctx = this.ctx, t = ctx.currentTime
    const src = ctx.createOscillator()
    src.type = 'sawtooth'
    src.frequency.setValueAtTime(380 * pitch, t)
    src.frequency.linearRampToValueAtTime(560 * pitch, t + 0.16)
    src.frequency.exponentialRampToValueAtTime(330 * pitch, t + 0.62)
    const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.Q.value = 5
    f1.frequency.setValueAtTime(700, t); f1.frequency.linearRampToValueAtTime(1100, t + 0.2); f1.frequency.linearRampToValueAtTime(800, t + 0.6)
    const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.Q.value = 7
    f2.frequency.setValueAtTime(1700, t); f2.frequency.linearRampToValueAtTime(2600, t + 0.2); f2.frequency.linearRampToValueAtTime(1900, t + 0.6)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.06); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7)
    const mix = ctx.createGain(); mix.gain.value = 0.55
    src.connect(f1).connect(mix); src.connect(f2).connect(mix)
    mix.connect(g).connect(this.master)
    src.start(t); src.stop(t + 0.75)
  }

  /** filtered-noise gesture (paper rustle, roller, iron slide). Returns a handle to steer & stop it. */
  noiseLoop(opts: { freq: number; q: number; gain: number; type?: BiquadFilterType }) {
    if (!this.ctx) return null
    const ctx = this.ctx
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    src.loop = true
    const f = ctx.createBiquadFilter()
    f.type = opts.type ?? 'bandpass'
    f.frequency.value = opts.freq
    f.Q.value = opts.q
    const g = ctx.createGain()
    g.gain.value = 0
    src.connect(f).connect(g).connect(this.master)
    src.start()
    const target = { f, g }
    const handle: { set: (freq: number, gain: number, rate?: number) => void; stop: () => void } = {
      set(freq: number, gain: number, rate = 0.04) {
        target.f.frequency.setTargetAtTime(freq, ctx.currentTime, rate)
        target.g.gain.setTargetAtTime(gain * opts.gain, ctx.currentTime, rate)
      },
      stop() { loops.delete(handle); target.g.gain.setTargetAtTime(0, ctx.currentTime, 0.05); setTimeout(() => { try { src.stop() } catch { /* */ } src.disconnect() }, 300) },
    }
    const loops = this.loops
    loops.add(handle)
    return handle
  }
}
