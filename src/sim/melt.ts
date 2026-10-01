import type { PegBeads } from '../render/pegBeads'
import { cellX, cellZ } from '../render/board'
import type { Dims } from '../config/physical'
import { PALETTE, type Finish } from '../config/palette'
import { clamp, smoothstep } from '../lib/rng'

/** Soleplate of a small bead iron (拼豆熨斗): a pentagon with a pointed front, in iron-local cm (+y forward). */
export const IRON_PLATE = { L: 7.6, W: 4.4 }

export interface IronPose {
  x: number
  z: number
  /** heading in radians; 0 = pointing −z (up the screen) */
  heading: number
  /** soleplate is on the paper */
  down: boolean
  /** 0..1, how hard the user leans on it. The iron's own weight is ≈ 0.4. */
  pressure: number
  /** soleplate temperature, °C */
  plateT: number
  /** lateral speed of the iron over the paper, cm/s */
  speed: number
}

export type Underlay = 'marble' | 'wood' | 'board'

/** how much each finish melts relative to a plain opaque bead (research §6) */
const FINISH_RATE: Record<Finish, number> = { opaque: 1, translucent: 0.9, pearl: 1, glitter: 0.9, glow: 0.9, photochromic: 1, thermochromic: 1 }

export interface MeltStats {
  /** mean heat dose on the ironed face over occupied cells */
  mean: number
  min: number
  max: number
  /** share of beads below the "edges fused" stage (0.25) */
  underShare: number
  /** share of beads past a closed face (1.0) */
  overShare: number
  /** share of beads past 1.3 (glassy / bleeding) */
  burntShare: number
  /** share of beads in the target window 0.45–0.9 */
  goodShare: number
  /** pegs that softened under a lingering iron */
  pegsMelted: number
  /** longest the iron rested on a single spot, s */
  maxDwell: number
}

/**
 * Heat → melt. Each bead carries a temperature and a heat dose `u` per face (u = 1 ≈ the face just closed).
 * Contact with the soleplate (through the paper) warms a bead with a short lag; a bead above ≈ 100 °C accumulates dose at
 *   du/dt = (1 / closeSeconds) · 2^((T − 140)/15) · pressureFactor · finishRate
 * — the research baseline: 140 °C dial, light pressure ⇒ closed in 28 s (midi) / 14 s (mini). A heat-sink underlay
 * (marble) carries heat away so it takes longer but is forgiving; wood keeps it in.
 */
export class MeltSim {
  readonly T: Float32Array
  readonly dwell: Float32Array
  readonly pegHeat: Float32Array
  /** which face the iron is working on: 'top' = bead tops (front pass), 'bot' = the other face after flipping */
  face: 'top' | 'bot' = 'top'
  underlay: Underlay = 'marble'
  /** global speed-up for demos/tests */
  timeScale = 1
  /** extra dose rate (the back face is already warm and has no pegs holding it open) */
  rateBoost = 1
  /** share of the dose that also reaches the face away from the iron (heat through a 2.6 mm bead). Used by transfer (无孔) ironing, where only one side is ever ironed. */
  conduct = 0
  maxDwell = 0
  /** filled by step(): how much of the soleplate is on beads and how hot those beads are (feeds the thermostat) */
  contact = 0
  contactMeanT = 23
  private ambient = 23
  private cols: number
  private rows: number
  private pitch: number
  private closeSeconds: number

  constructor(private pegs: PegBeads, dims: Dims, private layoutMask: Uint8Array) {
    this.cols = pegs.cols; this.rows = pegs.rows; this.pitch = dims.pitch; this.closeSeconds = dims.closeSeconds
    const n = this.cols * this.rows
    this.T = new Float32Array(n).fill(this.ambient)
    this.dwell = new Float32Array(n)
    this.pegHeat = new Float32Array(n)
  }

  reset() {
    this.T.fill(this.ambient); this.dwell.fill(0); this.pegHeat.fill(0); this.maxDwell = 0
  }

  /** is cell centre (px,pz) under the soleplate? returns 0..1 with a soft edge */
  private footprint(px: number, pz: number, p: IronPose): number {
    // to iron-local
    const dx = px - p.x, dz = pz - p.z
    const c = Math.cos(p.heading), s = Math.sin(p.heading)
    // heading 0 → forward = −z ; local y forward
    const lx = dx * c - dz * s
    const ly = -(dx * s + dz * c)
    const { L, W } = IRON_PLATE
    const hx = W / 2, hy = L / 2
    // pentagon: rectangle rear + tapered nose
    const ax = Math.abs(lx)
    let inside: number
    if (ly < -hy || ly > hy) inside = -1
    else {
      const noseStart = hy * 0.18
      const halfW = ly <= noseStart ? hx : hx * (1 - (ly - noseStart) / (hy - noseStart)) * 0.98 + 0.12
      inside = halfW - ax
      inside = Math.min(inside, hy - Math.abs(ly) * 0.0 - ly)  // front limit
      inside = Math.min(inside, ly + hy)                       // rear limit
    }
    return smoothstep(-0.12, 0.28, inside)
  }

  step(dt: number, iron: IronPose) {
    dt *= this.timeScale
    const { cols, rows, pitch } = this
    const pegs = this.pegs
    const sink = this.underlay === 'marble' ? 1 : this.underlay === 'board' ? 0.45 : 0.1
    const tauCool = 3 + 14 * (1 - sink * 0.75)     // beads lose heat quickly on a stone slab
    const tauHeat = 1.15 + 1.0 * sink              // …but also warm up a little more slowly
    const target = iron.plateT - 12 * sink         // heat flows into the slab even under the iron
    const pf = 0.7 + 0.6 * iron.pressure           // 0.4 weight-only → ~0.94
    const dose = pegs[this.face === 'top' ? 'meltTop' : 'meltBot']
    const other = pegs[this.face === 'top' ? 'meltBot' : 'meltTop']
    let maxD = 0
    let cSum = 0, cT = 0
    // only the cells under the soleplate need the contact test
    let i0 = 0, i1 = cols - 1, j0 = 0, j1 = rows - 1
    if (iron.down) {
      const r = IRON_PLATE.L * 0.6
      i0 = Math.max(0, Math.floor((iron.x - r) / pitch + (cols - 1) / 2))
      i1 = Math.min(cols - 1, Math.ceil((iron.x + r) / pitch + (cols - 1) / 2))
      j0 = Math.max(0, Math.floor((iron.z - r) / pitch + (rows - 1) / 2))
      j1 = Math.min(rows - 1, Math.ceil((iron.z + r) / pitch + (rows - 1) / 2))
    }
    const kCool = 1 - Math.exp(-dt / tauCool)
    let changed = false
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const k = j * cols + i
        let w = 0
        if (iron.down && i >= i0 && i <= i1 && j >= j0 && j <= j1) w = this.footprint(cellX(i, cols, pitch), cellZ(j, rows, pitch), iron)
        let T = this.T[k]
        if (w > 0.001) {
          T += (target - T) * (1 - Math.exp(-dt * pf * w / tauHeat))
          this.dwell[k] += dt * w
          if (this.dwell[k] > maxD) maxD = this.dwell[k]
          cSum += w; cT += w * T
        } else {
          T += (this.ambient - T) * kCool
          this.dwell[k] = Math.max(0, this.dwell[k] - dt * 2)
        }
        this.T[k] = T
        // peg softening: heat that lingers on the plate while the board is underneath (bead or no bead)
        if (T > 118 && this.face === 'top' && this.layoutMask[k]) this.pegHeat[k] += dt * (T - 118) / 30
        if (!pegs.occupied[k]) continue
        if (T > 96 && w > 0.001) {
          const fin = PALETTE[pegs.colorCode[k]]?.finish ?? 'opaque'
          const onset = smoothstep(96, 112, T)
          const rate = (1 / this.closeSeconds) * Math.pow(2, (T - 140) / 15) * pf * FINISH_RATE[fin] * onset * this.rateBoost
          dose[k] += rate * dt
          if (this.conduct > 0) other[k] += rate * dt * this.conduct
          changed = true
        }
      }
    }
    this.contact = cSum
    this.contactMeanT = cSum > 0 ? cT / cSum : iron.plateT
    if (iron.down) this.maxDwell = Math.max(this.maxDwell, maxD)
    if (changed) pegs.markDirty()
  }

  /** let everything cool (no contact) for dt seconds, as if time had passed under a weight */
  coolAll(dt: number) {
    const k = 1 - Math.exp(-dt / 6)
    for (let i = 0; i < this.T.length; i++) this.T[i] += (this.ambient - this.T[i]) * k
  }

  stats(): MeltStats {
    const pegs = this.pegs
    const dose = this.face === 'top' ? pegs.meltTop : pegs.meltBot
    let n = 0, sum = 0, min = 9, max = 0, under = 0, over = 0, burnt = 0, good = 0, pm = 0
    for (let k = 0; k < dose.length; k++) {
      if (!pegs.occupied[k]) continue
      const u = dose[k]
      n++; sum += u; min = Math.min(min, u); max = Math.max(max, u)
      if (u < 0.25) under++
      if (u >= 1.0) over++
      if (u >= 1.3) burnt++
      if (u >= 0.45 && u <= 0.9) good++
      if (this.pegHeat[k] > 6) pm++
    }
    if (!n) return { mean: 0, min: 0, max: 0, underShare: 0, overShare: 0, burntShare: 0, goodShare: 0, pegsMelted: 0, maxDwell: this.maxDwell }
    return { mean: sum / n, min, max, underShare: under / n, overShare: over / n, burntShare: burnt / n, goodShare: good / n, pegsMelted: pm, maxDwell: this.maxDwell }
  }
}

export { clamp }
