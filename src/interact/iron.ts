import * as THREE from 'three'
import type { World } from '../app/world'
import type { PointerState } from './pointer'
import type { AudioEngine } from '../audio/audio'
import { createMarbleSlab } from '../render/marble'
import { createBook } from '../render/book'
import { BakingPaper, COVERS, type CoverId } from '../render/paper'
import { IronModel, Thermostat, DIAL, type DialId } from '../render/iron'
import { LintRoller } from '../render/lintRoller'
import { MeltSim, IRON_PLATE, type IronPose, type MeltStats } from '../sim/melt'
import { clamp, smoothstep, mulberry32 } from '../lib/rng'
import { PALETTE } from '../config/palette'
import { Leftovers } from '../render/leftovers'

export type IronStep =
  | 'idle' | 'prep' | 'tape' | 'lint' | 'iron' | 'cool' | 'peeling' | 'onboard' | 'flipping' | 'flipped' | 'back' | 'press' | 'pressing' | 'done'
export type Pass = 'front' | 'back'

type Noise = ReturnType<AudioEngine['noiseLoop']>

/** Everything that happened to this piece on the bench — feeds the 赛博义诊 report. */
export interface Outcome {
  /** 有孔烫 = iron straight on the board; 无孔烫 = transfer the beads onto masking tape first, then iron the back */
  mode: 'holes' | 'flat'
  cover: CoverId
  dial: DialId
  front: MeltStats | null
  back: MeltStats | null
  hotPeel: { front: number; back: number }
  lostWithPaper: number
  leftOnBoard: number
  stuckToBoard: number
  isolated: number
  fragments: number
  lintLeft: number
  lintMarked: number
  residueShare: number
  warp: number
  pressed: 'book' | 'tile' | 'none'
  pegsMelted: number
  maxDwell: number
  kept: number
  /** beads that stayed on the board when it was lifted off the tape */
  transferLost: number
  /** 0..1: adhesive left on the beads by the tape */
  tapeGlue: number
}

const thickRatio = (u: number) =>
  u < 0.1 ? 1 - 0.02 * (u / 0.1) : u < 0.25 ? 0.98 - 0.08 * ((u - 0.1) / 0.15) : u < 0.45 ? 0.9 - 0.12 * ((u - 0.25) / 0.2)
    : u < 0.75 ? 0.78 - 0.14 * ((u - 0.45) / 0.3) : u < 1 ? 0.64 - 0.1 * ((u - 0.75) / 0.25) : 0.54 - 0.04 * clamp((u - 1) / 0.3, 0, 1)

/**
 * The ironing bench: marble heat-sink slab under the board, a sheet of baking paper, a lint roller and a small
 * thermostat iron — and the whole ritual after the beads are hot: cool, peel, lift the piece off the board, flip it,
 * iron the back, press it flat. This controller owns that sequence and the heat → melt simulation behind it.
 */
export class IronController {
  active = false
  step: IronStep = 'idle'
  pass: Pass = 'front'
  readonly slabT = 1.3
  slab: THREE.Mesh | null = null
  paper: BakingPaper | null = null
  sim: MeltSim | null = null
  readonly iron: IronModel
  readonly roller = new LintRoller()
  readonly thermo = new Thermostat()
  cover: CoverId = 'parchment'
  dial: DialId = 'mid'
  /** how hard the visitor leans on the iron: 0.4 = its own weight */
  pressure = 0.4
  thermal = false
  onChange: (() => void) | null = null
  onToast: ((m: string) => void) | null = null
  outcome: Outcome = this.blankOutcome()
  /** 0..1 progress of the pressing countdown */
  pressProgress = 0
  /** how the piece is made: straight on the board (有孔) or transferred onto masking tape first (无孔) */
  mode: 'holes' | 'flat' = 'holes'
  /** per cell 0..1: how well the tape has been pressed onto that bead */
  stick = new Float32Array(0)
  private tapeSheet: THREE.Mesh | null = null
  private tapeData: Float32Array | null = null
  private tapeZero: Float32Array | null = null
  private lastStickUi = 0

  private boardY = 0
  private slabX = -34
  private pos = new THREE.Vector3(0, 0, 0)
  private target = new THREE.Vector3()
  private vel = new THREE.Vector3()
  private heading = -0.35
  private hover = 4
  private down = false
  private pressAmt = 0
  private paperDrop = 0
  private paperDropping = false
  private lintCleaned = 0
  private soundSlide: Noise = null
  private soundSizzle: Noise = null
  private soundRoller: Noise = null
  private soundPeel: Noise = null
  private peekT = 0
  private peekTarget = 0
  private time = 0
  private tmp = new THREE.Vector3()
  private lastTick = 0
  private avgT = 23
  // piece
  piece: THREE.Group | null = null
  flipped = false
  private pieceThick = 0.3
  private flipT = 0
  private flipY0 = 0
  private flipYEnd = 0
  // peel
  private peelT = 0
  // press
  private book: THREE.Group | null = null
  private bookY = 0
  private bookTargetY = 0
  private warpTarget = 0
  private warpCur = 0
  private warpHalf = 4
  private pressKind: 'book' | 'tile' | 'none' = 'none'
  private pressTime = 0
  private rng = mulberry32(((Date.now() / 1000) | 0) ^ 0x5bd1e995)

  private leftovers: Leftovers

  constructor(private w: World, private ptr: PointerState, private audio: AudioEngine) {
    this.leftovers = new Leftovers(w.dims)
    w.scene.add(this.leftovers.mesh)
    this.iron = new IronModel(w.gfx.renderer)
    this.iron.group.visible = false
    this.roller.group.visible = false
    w.scene.add(this.iron.group, this.roller.group)
    this.thermo.events.click = () => this.audio.impact('tweezerTick', 0.55, 0.62)
    this.thermo.events.ready = () => { this.audio.impact('ui', 0.7, 1.35); this.onToast?.('叮——熨斗到温了'); this.onChange?.() }
    this.thermo.setSet(DIAL.find((d) => d.id === this.dial)!.t)
    window.addEventListener('keydown', (e) => {
      if (!this.active) return
      if (e.key === 'q' || e.key === 'Q') this.heading += Math.PI / 4
      if (e.key === 'e' || e.key === 'E') this.heading -= Math.PI / 4
    })
  }

  private blankOutcome(): Outcome {
    return { mode: 'holes', cover: 'parchment', dial: 'mid', front: null, back: null, hotPeel: { front: 0, back: 0 }, lostWithPaper: 0, leftOnBoard: 0, stuckToBoard: 0, isolated: 0, fragments: 1, lintLeft: 0, lintMarked: 0, residueShare: 0, warp: 0, pressed: 'none', pegsMelted: 0, maxDwell: 0, kept: 0, transferLost: 0, tapeGlue: 0 }
  }

  private get board() { return this.w.board }
  private get d() { return this.w.dims }
  private get pegs() { return this.w.pegs }
  /** world y of the surface the paper rests on */
  private paperY() {
    if (this.flipped) return this.slabT + this.pieceThick + 0.015
    return this.boardY + this.board.plateTopY + this.d.bead.height * 0.82
  }

  // ------------------------------------------------------------------------------------------ lifecycle
  enter() {
    this.active = true
    const w = this.w
    this.step = 'prep'
    this.pass = 'front'
    this.flipped = false
    this.mode = 'holes'
    this.stick = new Float32Array(0)
    this.dropTape()
    this.outcome = this.blankOutcome()
    this.board.sheet.visible = false
    if (!this.slab) {
      const b = this.board.size
      this.slab = createMarbleSlab(w.gfx.renderer, Math.max(b.x + 8, 15), Math.max(b.y + 8, 15), this.slabT)
      w.scene.add(this.slab)
    }
    this.slab.visible = true
    // the tray is cleared away for the ironing
    this.leftovers.clear()
    w.tray.group.visible = false
    w.trayBeads.mesh.visible = false
    this.slabX = -34
    this.slab.position.set(this.slabX, this.slabT / 2, 0)
    this.sim = new MeltSim(w.pegs, w.dims, w.board.layout.mask)
    this.sim.underlay = 'marble'
    this.thermo.on = false
    this.iron.group.visible = false
    this.audio.impact('tableKnock', 0.4, 1.2)
    this.onChange?.()
  }

  exit() {
    this.active = false
    this.dropTape()
    // went back to check the beads with a sheet already laid on them: take it off again
    if ((this.step === 'lint' || this.step === 'tape') && this.pass === 'front' && this.paper) {
      this.paper.group.parent?.remove(this.paper.group)
      this.paper.dispose()
      this.paper = null
      this.step = 'prep'
    }
    this.iron.group.visible = false
    this.roller.group.visible = false
    this.stopLoops()
    this.w.tray.group.visible = true
    this.w.trayBeads.mesh.visible = true
    this.board.sheet.visible = true
  }

  /** the user chose a cover sheet and wants it laid on the board */
  layPaper(cover: CoverId) {
    this.cover = cover
    this.outcome.cover = cover
    if (this.paper) { this.paper.group.parent?.remove(this.paper.group); this.paper.dispose() }
    this.paper = new BakingPaper(this.board, this.d, this.w.gfx.renderer, (this.rng() * 0x7fffffff) | 0)
    this.paper.setCover(cover)
    this.board.group.add(this.paper.group)
    this.paperDrop = 7
    this.paperDropping = true
    this.paper.group.position.y = this.paperDrop
    this.audio.impact('tableKnock', 0.25, 1.9)
    this.step = 'lint'
    this.lintCleaned = 0
    this.roller.setDirt(0)
    this.roller.group.visible = true
    const spec = COVERS[cover]
    this.pegs.setImprint(spec.imprint > 0.9 ? 2 : spec.imprint > 0 ? 1 : 0, spec.imprint)
    this.onChange?.()
  }

  // ------------------------------------------------------------------------------------------ 无孔烫: transfer onto masking tape
  /** choose how to make the piece (only before anything is laid on the board) */
  setMode(m: 'holes' | 'flat') {
    if (this.step !== 'prep') return
    this.mode = m
    this.outcome.mode = m
    this.audio.impact('tweezerTick', 0.4, 1.1)
    this.onChange?.()
  }

  /** 无孔烫, step 1: masking tape goes over the beads (the cover sheet comes later, over the back) */
  layTape() {
    if (this.step !== 'prep' || this.mode !== 'flat') return
    this.outcome.cover = this.cover
    this.outcome.mode = 'flat'
    if (this.paper) { this.paper.group.parent?.remove(this.paper.group); this.paper.dispose() }
    this.paper = new BakingPaper(this.board, this.d, this.w.gfx.renderer, (this.rng() * 0x7fffffff) | 0)
    this.paper.setTape()
    for (const l of this.paper.lint) l.alive = false            // straight off the roll: no fluff
    this.paper.refreshLint()
    this.board.group.add(this.paper.group)
    this.paperDrop = 7
    this.paperDropping = true
    this.paper.group.position.y = this.paperDrop
    this.audio.impact('tableKnock', 0.25, 1.9)
    this.stick = new Float32Array(this.board.layout.cols * this.board.layout.rows)
    this.pegs.setImprint(0, 0)
    this.step = 'tape'
    this.roller.setDirt(0)
    this.roller.group.visible = true
    this.onChange?.()
  }

  /** how firmly the tape holds the beads, 0..1 (mean over beads), and the share that is hardly pressed at all */
  get stickMean() {
    const p = this.pegs
    let s = 0, c = 0
    for (let k = 0; k < p.occupied.length; k++) if (p.occupied[k]) { s += this.stick[k] ?? 0; c++ }
    return c ? s / c : 1
  }
  get stickLoose() {
    const p = this.pegs
    let l = 0
    for (let k = 0; k < p.occupied.length; k++) if (p.occupied[k] && (this.stick[k] ?? 0) < 0.55) l++
    return l
  }

  /** press the tape onto the beads within r cm of (x, z) (board space) */
  private stickAt(x: number, z: number, r: number, amount: number): number {
    const lay = this.board.layout, pitch = this.d.pitch
    const ci = x / pitch + (lay.cols - 1) / 2, cj = z / pitch + (lay.rows - 1) / 2
    const rc = r / pitch
    let touched = 0
    for (let j = Math.max(0, Math.floor(cj - rc)); j <= Math.min(lay.rows - 1, Math.ceil(cj + rc)); j++) {
      for (let i = Math.max(0, Math.floor(ci - rc)); i <= Math.min(lay.cols - 1, Math.ceil(ci + rc)); i++) {
        const k = j * lay.cols + i
        if (!this.pegs.occupied[k]) continue
        const dd = Math.hypot(i - ci, j - cj)
        if (dd > rc) continue
        const before = this.stick[k]
        this.stick[k] = Math.min(1, before + amount * (1 - 0.5 * dd / rc))
        touched += this.stick[k] - before
      }
    }
    return touched
  }

  /** take the tape sheet off the piece (peeled, or the visitor started over) */
  private dropTape() {
    if (!this.tapeSheet) return
    this.tapeSheet.removeFromParent()
    this.tapeSheet.geometry.dispose()
    ;(this.tapeSheet.material as THREE.Material).dispose()
    this.tapeSheet = null
  }

  startIroning() {
    this.step = this.pass === 'front' ? 'iron' : 'back'
    this.roller.group.visible = false
    this.iron.group.visible = true
    this.thermo.on = true
    this.thermo.setSet(DIAL.find((d) => d.id === this.dial)!.t)
    this.iron.setLight(true)
    this.onChange?.()
  }

  setDial(id: DialId) {
    this.dial = id
    this.outcome.dial = id
    const i = DIAL.findIndex((d) => d.id === id)
    this.thermo.setSet(DIAL[i].t)
    this.iron.setDial(i)
    this.audio.impact('tweezerTick', 0.6, 0.8)
    this.onChange?.()
  }
  setPressure(p: number) { this.pressure = clamp(p, 0.15, 1) }
  setThermal(v: boolean) { this.thermal = v; this.paper?.setThermal(v ? 1 : 0); this.onChange?.() }
  setPeek(v: boolean) { this.peekTarget = v ? 0.3 : 0; if (v) this.audio.impact('tweezerTick', 0.2, 0.5); this.onChange?.() }
  get peeking() { return this.peekTarget > 0 }
  get lintLeft() { return this.paper?.lintLeft ?? 0 }
  get lintTotal() { return this.paper?.lintTotal ?? 0 }
  get temperature() { return this.thermo.plateT }
  /** mean temperature of the beads, °C — tells the visitor whether it's safe to peel */
  get beadTemp() { return this.avgT }
  get isIroningStep() { return this.step === 'iron' || this.step === 'back' }
  /** where the working pointer is on the table (for tests / UI) */
  get cursorWorld() { return this.pos }
  get toolWorld() { return this.step === 'lint' || this.step === 'tape' ? this.roller.group.position : this.iron.group.position }

  private stopLoops() {
    for (const k of ['soundSlide', 'soundSizzle', 'soundRoller', 'soundPeel'] as const) { this[k]?.stop(); this[k] = null }
  }

  // ------------------------------------------------------------------------------------------ the ritual after the heat
  /** "烫好了": put the iron down and let the beads cool */
  finishIroning() {
    const sim = this.sim!
    const st = sim.stats()
    if (this.pass === 'front') this.outcome.front = st; else this.outcome.back = st
    this.outcome.maxDwell = Math.max(this.outcome.maxDwell, sim.maxDwell)
    this.outcome.pegsMelted = Math.max(this.outcome.pegsMelted, st.pegsMelted)
    this.iron.group.visible = false
    this.thermo.on = false
    this.iron.setLight(false)
    this.stopLoops()
    this.step = 'cool'
    this.peekTarget = 0
    this.onChange?.()
  }

  /** peel the paper back off. Too soon and it drags beads and leaves scraps; too hot and everything stretches. */
  peelPaper() {
    if (!this.paper || this.step !== 'cool') return
    const sim = this.sim!, pegs = this.pegs, lay = this.board.layout
    const face = sim.face
    const dose = face === 'top' ? pegs.meltTop : pegs.meltBot
    const res = face === 'top' ? pegs.resTop : pegs.resBot
    const lintArr = face === 'top' ? pegs.lintTop : pegs.lintBot
    const hot = clamp((this.avgT - 52) / 45, 0, 1)
    this.outcome.hotPeel[this.pass] = hot
    const stickAt = COVERS[this.cover].stickAt
    let lost = 0
    for (let k = 0; k < dose.length; k++) {
      if (!pegs.occupied[k]) continue
      const u = dose[k]
      // paper welded to over-melted beads / torn off by a hot peel
      res[k] = clamp((u - stickAt) * 1.5 + hot * 0.55 * smoothstep(0.3, 0.9, u) + (this.cover === 'loofah' ? 0.12 * smoothstep(0.5, 1, u) : 0), 0, 1)
      // an under-fused bead goes up with the paper
      if ((this.pass === 'front' || this.mode === 'flat') && u < 0.14 && this.rng() < 0.22 + 0.5 * hot) {
        const i = k % lay.cols, j = (k / lay.cols) | 0
        pegs.remove(i, j)
        lost++
      }
    }
    // lint that was left on the paper gets ironed into the surface
    for (const l of this.paper.lint) {
      if (!l.alive) continue
      const gx = l.x / this.d.pitch + (lay.cols - 1) / 2, gz = (this.flipped ? -l.z : l.z) / this.d.pitch + (lay.rows - 1) / 2
      const i = Math.round(gx), j = Math.round(gz)
      if (i < 0 || j < 0 || i >= lay.cols || j >= lay.rows) continue
      const k = j * lay.cols + i
      if (pegs.occupied[k] && dose[k] > 0.2) {
        lintArr[k] = 1
        this.outcome.lintMarked++
      }
    }
    // masking tape: warm adhesive creeps into the beads it is stuck to; a hot peel or a very hot iron leaves it behind
    if (this.mode === 'flat') {
      const meanU = this.outcome.back?.mean ?? 0
      const glue = clamp(hot * 0.9 + smoothstep(1.25, 2.0, meanU) * 0.55, 0, 1)
      this.outcome.tapeGlue = glue
      if (glue > 0.05) for (let k = 0; k < pegs.occupied.length; k++) if (pegs.occupied[k]) pegs.resTop[k] = Math.max(pegs.resTop[k], glue * (0.45 + 0.5 * this.rng()))
    }
    this.outcome.lintLeft += this.paper.lintLeft
    this.outcome.lostWithPaper += lost
    pegs.flushResidue()
    pegs.markDirty()
    this.step = 'peeling'
    this.peelT = 0
    this.audio.impact('tweezerTick', 0.3, 0.6)
    if (lost) this.onToast?.(`有 ${lost} 颗没粘牢的豆被纸带走了`)
    this.onChange?.()
  }

  /** take the fused piece off the pegs. Loose beads and weak joints stay behind (or fall apart). */
  liftPiece() {
    if (this.step !== 'onboard') return
    const pegs = this.pegs, lay = this.board.layout, n = lay.cols * lay.rows
    const dose = pegs.meltTop
    const keep = new Uint8Array(n)
    // which beads are welded to a neighbour? (bond = the weaker of the two doses)
    const bond = (a: number, b: number) => pegs.occupied[a] && pegs.occupied[b] && Math.min(dose[a], dose[b]) >= 0.2
    const comp = new Int32Array(n).fill(-1)
    const sizes: number[] = []
    for (let k = 0; k < n; k++) {
      if (!pegs.occupied[k] || comp[k] >= 0) continue
      const id = sizes.length
      let count = 0
      const stack = [k]
      comp[k] = id
      while (stack.length) {
        const c = stack.pop()!
        count++
        const i = c % lay.cols, j = (c / lay.cols) | 0
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const ii = i + di, jj = j + dj
          if (ii < 0 || jj < 0 || ii >= lay.cols || jj >= lay.rows) continue
          const nk = jj * lay.cols + ii
          if (comp[nk] < 0 && bond(c, nk)) { comp[nk] = id; stack.push(nk) }
        }
      }
      sizes.push(count)
    }
    // the biggest connected body comes with us; weakly joined islands too if they are fused to anything at all
    let isolated = 0, leftOnBoard = 0, stuck = 0, kept = 0
    const loose: { i: number; j: number; hex: number; code: number }[] = []
    for (let k = 0; k < n; k++) {
      if (!pegs.occupied[k]) continue
      const i = k % lay.cols, j = (k / lay.cols) | 0
      const stuckOnPeg = pegs.pegHeatOf?.(k) ?? 0
      const c = comp[k]
      const single = sizes[c] === 1
      const hasNeighbour = (i > 0 && pegs.occupied[k - 1]) || (i < lay.cols - 1 && pegs.occupied[k + 1]) || (j > 0 && pegs.occupied[k - lay.cols]) || (j < lay.rows - 1 && pegs.occupied[k + lay.cols])
      if (stuckOnPeg > 6) { stuck++; pegs.remove(i, j); continue }               // welded to a softened peg
      if (dose[k] < 0.12 || (single && dose[k] < 0.45)) {                       // never fused: it just drops off
        if (!hasNeighbour) isolated++
        leftOnBoard++
        loose.push({ i, j, hex: pegs.hex[k], code: pegs.colorCode[k] })
        pegs.remove(i, j)
        continue
      }
      keep[k] = 1
      kept++
    }
    // fragments = components that are still on the piece
    const keptComps = new Set<number>()
    for (let k = 0; k < n; k++) if (keep[k]) keptComps.add(comp[k])
    this.outcome.fragments = Math.max(1, keptComps.size)
    this.outcome.isolated = isolated
    this.outcome.leftOnBoard = leftOnBoard
    this.outcome.stuckToBoard = stuck
    this.outcome.kept = kept
    // loose beads tumble onto the table in front of the stone
    this.spawnLeftovers(loose)
    pegs.markDirty()
    this.buildPiece(keep, kept)
  }

  /** 无孔烫, step 2: turn the board over and lift it off — the beads the tape holds stay on the tape */
  transferBoard() {
    if (this.step !== 'tape' || !this.paper) return
    const pegs = this.pegs, lay = this.board.layout, n = lay.cols * lay.rows
    const keep = new Uint8Array(n)
    let kept = 0, lost = 0, isolated = 0
    const loose: { i: number; j: number; hex: number; code: number }[] = []
    for (let k = 0; k < n; k++) {
      if (!pegs.occupied[k]) continue
      const i = k % lay.cols, j = (k / lay.cols) | 0
      const hasNb = (i > 0 && pegs.occupied[k - 1]) || (i < lay.cols - 1 && pegs.occupied[k + 1]) || (j > 0 && pegs.occupied[k - lay.cols]) || (j < lay.rows - 1 && pegs.occupied[k + lay.cols])
      // a bead the tape never touched stays on its peg; a half-pressed one may or may not come along
      const pFall = clamp(Math.pow(1 - (this.stick[k] ?? 0), 1.4) * (hasNb ? 1 : 1.15), 0, 1)
      if (this.rng() < pFall) {
        lost++
        if (!hasNb) isolated++
        loose.push({ i, j, hex: pegs.hex[k], code: pegs.colorCode[k] })
        pegs.remove(i, j)
      } else { keep[k] = 1; kept++ }
    }
    this.outcome.mode = 'flat'
    this.outcome.transferLost = lost
    this.outcome.leftOnBoard = 0
    this.outcome.isolated = isolated
    this.outcome.kept = kept
    this.outcome.fragments = 1
    this.spawnLeftovers(loose)
    pegs.markDirty()
    // the tape sheet goes with the piece (re-made as a plain strip under it)
    this.paper.group.parent?.remove(this.paper.group)
    this.paper.dispose()
    this.paper = null
    this.buildPiece(keep, kept)
    this.addTapeSheet(keep)
    this.flipYEnd += 0.03                         // the tape is a hair thick
    this.roller.group.visible = false
    if (lost) this.onToast?.(`有 ${lost} 颗豆没粘住，留在板子上了`)
  }

  /** beads that stayed behind are laid out in a tidy row on the table in front of the stone */
  private spawnLeftovers(loose: { i: number; j: number; hex: number; code: number }[]) {
    const b = this.board.size
    const slabHalfDepth = Math.max(b.y + 8, 15) / 2
    this.leftovers.show(loose, this.board.group.position.x, slabHalfDepth + 1.1)
  }

  /** the strip of masking tape the beads are stuck to (under the piece once it is flipped) */
  private addTapeSheet(keep: Uint8Array) {
    const lay = this.board.layout, pitch = this.d.pitch
    let i0 = 999, i1 = -1, j0 = 999, j1 = -1
    for (let k = 0; k < keep.length; k++) {
      if (!keep[k]) continue
      const i = k % lay.cols, j = (k / lay.cols) | 0
      i0 = Math.min(i0, i); i1 = Math.max(i1, i); j0 = Math.min(j0, j); j1 = Math.max(j1, j)
    }
    if (i1 < 0 || !this.piece) return
    const w = (i1 - i0 + 1) * pitch + 0.7, h = (j1 - j0 + 1) * pitch + 0.7
    const cx = ((i0 + i1) / 2 - (lay.cols - 1) / 2) * pitch, cz = ((j0 + j1) / 2 - (lay.rows - 1) / 2) * pitch
    const mat = new THREE.MeshPhysicalMaterial({ color: 0xe8d49a, roughness: 0.5, sheen: 0.3, sheenColor: new THREE.Color(0xfff2c8), transparent: true, opacity: 0.9, side: THREE.DoubleSide })
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
    m.rotation.x = -Math.PI / 2
    m.position.set(cx, this.d.bead.height / 2 + 0.012, cz)
    m.receiveShadow = true
    this.piece.add(m)
    this.tapeSheet = m
  }

  /** the kept beads become their own object so they can be flipped over onto the stone */
  private buildPiece(keep: Uint8Array, kept: number) {
    const pegs = this.pegs, n = this.board.layout.cols * this.board.layout.rows
    const root = new THREE.Group()
    root.name = 'piece'
    this.w.scene.add(root)
    this.board.group.remove(pegs.mesh)
    root.add(pegs.mesh)
    pegs.mesh.position.y = -(this.board.plateTopY + this.d.bead.height / 2)
    root.position.set(this.board.group.position.x, this.boardY + this.board.plateTopY + this.d.bead.height / 2, 0)
    this.piece = root
    // thickness & where the surface will sit after the flip
    let sumF = 0, sumCut = 0
    for (let k = 0; k < n; k++) {
      if (!keep[k]) continue
      const mT = pegs.meltTop[k], mB = pegs.meltBot[k]
      const F = thickRatio(Math.max(mT, mB))
      sumF += F
      sumCut += (1 - F) * this.d.bead.height * (mT / Math.max(mT + mB, 1e-4))
    }
    const meanF = kept ? sumF / kept : 0.8
    this.pieceThick = this.d.bead.height * meanF
    this.flipYEnd = this.slabT + (this.d.bead.height / 2 - (kept ? sumCut / kept : 0))
    this.flipY0 = root.position.y
    this.flipT = 0
    this.step = 'flipping'
    this.audio.impact('peg', 0.8, 0.7)
    this.w.camera.userData.shake?.()
    this.onChange?.()
  }

  /** after the flip: lay a fresh sheet over the back */
  layBackPaper() {
    if (this.step !== 'flipped') return
    if (this.paper) { this.paper.group.parent?.remove(this.paper.group); this.paper.dispose() }
    this.paper = new BakingPaper(this.board, this.d, this.w.gfx.renderer, (this.rng() * 0x7fffffff) | 0)
    this.paper.setCover(this.cover)
    this.paper.setBench(true, this.slabT, 0)
    this.w.scene.add(this.paper.group)
    // a freshly cut sheet carries far less fluff
    for (let i = 0; i < this.paper.lint.length; i++) if (i % 4) this.paper.lint[i].alive = false
    this.paper.refreshLint()
    this.paperDrop = 6
    this.paperDropping = true
    this.paper.group.position.y = this.paperDrop
    this.audio.impact('tableKnock', 0.25, 1.9)
    this.pass = 'back'
    this.sim!.face = 'bot'
    this.sim!.reset()
    this.sim!.underlay = 'marble'
    // 无孔烫 irons one side only: the heat has to go right through the beads to close the holes at the tape side too
    this.sim!.conduct = this.mode === 'flat' ? 0.85 : 0
    this.step = 'lint'
    this.roller.group.visible = true
    this.onChange?.()
  }

  /** choose how to flatten the piece while it cools */
  pressWith(kind: 'book' | 'tile' | 'none') {
    if (this.step !== 'press') return
    this.pressKind = kind
    this.outcome.pressed = kind
    const pegs = this.pegs, n = pegs.occupied.length
    // how much would it curl if left to cool free? the more-fused face contracts more
    let sT = 0, sB = 0, c = 0
    for (let k = 0; k < n; k++) if (pegs.occupied[k]) { sT += pegs.meltTop[k]; sB += pegs.meltBot[k]; c++ }
    const mT = c ? sT / c : 0, mB = c ? sB / c : 0
    const hot = Math.max(this.outcome.hotPeel.front, this.outcome.hotPeel.back)
    const asym = Math.abs(mT - mB)
    const big = clamp(this.board.size.x / 10, 0.5, 2)
    const base = clamp(asym * 0.9 + hot * 0.4 + (this.rng() - 0.35) * 0.18 + 0.12, 0, 1.2)
    this.warpHalf = Math.max(2, (this.board.size.x * 0.5))
    const sign = mB >= mT ? 1 : -1                  // the face looking up is the one that was just ironed (back)
    this.warpTarget = sign * base * 0.55 * big / (this.warpHalf * this.warpHalf)
    this.outcome.warp = kind === 'none' ? base : base * (kind === 'tile' ? 0.08 : 0.15)
    if (kind !== 'none') {
      this.book = createBook(this.board.size.x + 4, this.board.size.y + 4, kind)
      this.book.position.set(0, 12, 0)
      this.w.scene.add(this.book)
      this.bookY = 12
      this.bookTargetY = this.slabT + this.pieceThick + 0.05
    }
    this.pressTime = 0
    this.pressProgress = 0
    this.step = 'pressing'
    this.onChange?.()
  }

  /** release the weight and take the finished piece */
  finishPressing() {
    if (this.step !== 'pressing' || this.pressProgress < 1) return
    this.bookTargetY = 14
    this.step = 'done'
    this.onChange?.()
  }

  // ------------------------------------------------------------------------------------------ frame
  update(dt: number) {
    this.time += dt
    this.animateBench(dt)
    if (!this.active) return
    const ptr = this.ptr
    const py = this.paperY()
    const hit = ptr.hitPlane(py, this.tmp)
    if (hit) this.target.copy(hit)
    this.down = ptr.down
    const k = 1 - Math.exp(-24 * dt)
    const prev = this.pos.clone()
    this.pos.lerp(this.target, k)
    this.vel.copy(this.pos).sub(prev).divideScalar(Math.max(dt, 1e-4))
    const speed = Math.hypot(this.vel.x, this.vel.z)

    if (this.step === 'lint' || this.step === 'tape') this.updateRoller(dt, py, speed)
    else if (this.isIroningStep) this.updateIron(dt, py, speed)
    else if (this.sim) this.sim.step(dt, { x: 0, z: 0, heading: 0, down: false, pressure: 0, plateT: 23, speed: 0 })

    // keep the average bead temperature (for the "can I peel yet?" cue)
    if (this.sim && this.time - this.lastTick > 0.2) {
      this.lastTick = this.time
      let s = 0, c = 0
      for (let i = 0; i < this.pegs.occupied.length; i++) if (this.pegs.occupied[i]) { s += this.sim.T[i]; c++ }
      this.avgT = c ? s / c : 23
      this.pegs.setThermoFromTemps(this.sim.T)
      if (this.step === 'cool' || this.step === 'onboard') this.onChange?.()
    }

    this.updatePeel(dt)
    this.updateFlip(dt)
    this.updatePress(dt)

    // peek: peel a corner back and forth
    this.peekT += (this.peekTarget - this.peekT) * (1 - Math.exp(-6 * dt))
    if (this.paper && this.step !== 'peeling') this.paper.setPeel(this.peekT, [1, -1])
    if (this.paper && this.paper.group.visible) {
      this.paper.tick(dt)
      if (this.step === 'tape') {
        // where the tape is pressed on it turns clear, the way it does over fused beads
        const p = this.pegs
        const td = (this.tapeData ??= new Float32Array(p.occupied.length))
        const zero = (this.tapeZero ??= new Float32Array(p.occupied.length))
        for (let i = 0; i < td.length; i++) td[i] = (this.stick[i] ?? 0) * 0.62
        this.paper.updateData(p.occupied, td, this.sim ? this.sim.T : zero, undefined, zero)
      } else if (this.sim) {
        const p = this.pegs
        const face = this.sim.face === 'top' ? p.meltTop : p.meltBot
        const height = new Float32Array(face.length)
        for (let i = 0; i < height.length; i++) height[i] = Math.max(p.meltTop[i], p.meltBot[i])
        this.paper.updateData(p.occupied, face, this.sim.T, undefined, height)
      }
    }
  }

  /** the board rises onto the stone; the stone slides in underneath; the paper settles */
  private animateBench(dt: number) {
    if (!this.slab) return
    if (this.active || this.boardY > 0.001) {
      const slabTarget = this.active ? 0 : -34
      this.slabX += (slabTarget - this.slabX) * (1 - Math.exp(-4.2 * dt))
      this.slab.position.x = this.slabX
      const lift = smoothstep(-20, -1, this.slabX)
      if (!this.flipped && this.step !== 'flipping' && !this.piece) {
        const boardTargetY = this.active ? this.slabT * lift : 0
        this.boardY += (boardTargetY - this.boardY) * (1 - Math.exp(-14 * dt))
        this.board.group.position.y = this.boardY
      }
      if (!this.active && Math.abs(this.slabX + 34) < 0.2) this.slab.visible = false
    }
    if (this.paperDropping && this.paper) {
      this.paperDrop += (0 - this.paperDrop) * (1 - Math.exp(-6.5 * dt))
      this.paper.group.position.y = this.paperDrop
      if (this.paperDrop < 0.02) { this.paperDrop = 0; this.paper.group.position.y = 0; this.paperDropping = false; this.audio.impact('tableKnock', 0.12, 2.4) }
    }
  }

  // ------------------------------------------------------------------------------------------ lint roller
  private updateRoller(dt: number, py: number, speed: number) {
    if (!this.paper) return
    const p = this.tmp.copy(this.pos)
    const g = this.roller.group
    const lift = this.down ? 0.05 : 1.6
    g.position.set(p.x, py + this.roller.radius + 0.1 + lift, p.z)
    g.rotation.y = 0.5
    if (this.down && speed > 0.4) {
      const ca = Math.cos(0.5), sa = Math.sin(0.5)
      this.roller.roll((this.vel.x * ca - this.vel.z * sa) * dt)     // signed: along the drum's rolling direction
      const half = this.roller.length / 2
      const lx = p.x, lz = p.z
      let got = 0
      if (this.step === 'tape') {
        // pressing the tape down: every bead under the drum gets a little firmer each time it passes
        const bx = this.board.group.position.x
        const press = 0.55 + 0.9 * this.pressure
        let touched = 0
        for (let t = -half; t <= half; t += 0.35) touched += this.stickAt(lx - bx + sa * t, lz + ca * t, 0.5, dt * press * 2.0)
        if (touched > 0 && this.time - this.lastStickUi > 0.25) { this.lastStickUi = this.time; this.onChange?.() }
      } else for (let t = -half; t <= half; t += 0.6) got += this.paper.rollAt(lx + sa * t, lz + ca * t, 0.55)
      if (got) {
        this.lintCleaned += got
        this.roller.setDirt(this.lintCleaned / Math.max(1, this.lintTotal))
        this.audio.impact('tweezerGrip', 0.3, 1.6); this.onChange?.()
      }
      if (!this.soundRoller) this.soundRoller = this.audio.noiseLoop({ freq: 1500, q: 0.7, gain: 0.07, type: 'bandpass' })
      this.soundRoller?.set(1100 + speed * 40, clamp(speed / 14, 0, 1))
    } else this.soundRoller?.set(900, 0)
  }

  // ------------------------------------------------------------------------------------------ iron
  private updateIron(dt: number, py: number, speed: number) {
    const sim = this.sim!
    const g = this.iron.group
    if (speed > 9) {
      const want = Math.atan2(-this.vel.x, -this.vel.z)
      let dh = want - this.heading
      while (dh > Math.PI) dh -= Math.PI * 2
      while (dh < -Math.PI) dh += Math.PI * 2
      this.heading += dh * (1 - Math.exp(-1.6 * dt))
    }
    const wantH = this.down ? 0 : 3.2
    this.hover += (wantH - this.hover) * (1 - Math.exp(-16 * dt))
    this.pressAmt += ((this.down ? 1 : 0) - this.pressAmt) * (1 - Math.exp(-18 * dt))
    g.position.set(this.pos.x, py + this.hover + 0.02 - this.pressAmt * 0.04 * this.pressure, this.pos.z)
    g.rotation.y = this.heading
    g.rotation.z = (1 - this.pressAmt) * -0.05

    // pose in the piece's own cell frame (a flipped piece is mirrored in z)
    const mirror = this.flipped
    const pose: IronPose = {
      x: this.pos.x - this.board.group.position.x * (mirror ? 0 : 1),
      z: mirror ? -this.pos.z : this.pos.z,
      heading: mirror ? Math.PI - this.heading : this.heading,
      down: this.down && this.hover < 0.6, pressure: this.pressure, plateT: this.thermo.plateT, speed,
    }
    sim.rateBoost = this.pass === 'back' ? 1.5 : 1
    sim.step(dt, pose)
    const frac = clamp((sim.contact * this.d.pitch * this.d.pitch) / (IRON_PLATE.L * IRON_PLATE.W * 0.75), 0, 1)
    const drawn = pose.down ? clamp((this.thermo.plateT - sim.contactMeanT) * 0.09 * frac * (0.5 + this.pressure), 0, 12) : 0
    this.thermo.step(dt, drawn)
    this.iron.setLight(this.thermo.heater)

    // beads that the paper has pressed down are no longer perched on their pegs
    if (this.pass === 'front' && this.time - this.lastTick < 0.02) {
      const p = this.pegs, lay = this.board.layout
      for (let k = 0; k < p.lift.length; k++) if (p.lift[k] > 0 && p.meltTop[k] > 0.25) p.reseat(k % lay.cols, (k / lay.cols) | 0)
    }

    if (pose.down && speed > 1) {
      if (!this.soundSlide) this.soundSlide = this.audio.noiseLoop({ freq: 2200, q: 0.5, gain: 0.05, type: 'bandpass' })
      this.soundSlide?.set(1700 + speed * 60, clamp(speed / 16, 0, 1))
    } else this.soundSlide?.set(1800, 0)
    if (pose.down && this.thermo.plateT > 100) {
      if (!this.soundSizzle) this.soundSizzle = this.audio.noiseLoop({ freq: 7000, q: 0.4, gain: 0.025, type: 'highpass' })
      this.soundSizzle?.set(6000, clamp((this.thermo.plateT - 100) / 80, 0, 1) * (frac > 0.2 ? 1 : 0.3))
    } else this.soundSizzle?.set(6000, 0)
    if (this.time - this.lastTick > 0.5) this.onChange?.()
  }

  // ------------------------------------------------------------------------------------------ peel / flip / press
  private updatePeel(dt: number) {
    if (this.step !== 'peeling' || !this.paper) { if (this.soundPeel) { this.soundPeel.stop(); this.soundPeel = null } return }
    this.peelT = Math.min(1, this.peelT + dt / 1.9)
    const t = this.peelT
    this.paper.setPeel(Math.pow(t, 1.15), [1, -1])
    if (!this.soundPeel) this.soundPeel = this.audio.noiseLoop({ freq: 3200, q: 0.4, gain: 0.06, type: 'bandpass' })
    this.soundPeel?.set(2500 + 1800 * Math.sin(t * 9), 0.5 + 0.5 * Math.sin(t * 17))
    if (t >= 1) {
      this.paper.group.visible = false
      this.soundPeel?.stop(); this.soundPeel = null
      this.step = this.pass === 'front' ? 'onboard' : 'press'
      this.dropTape()
      this.onChange?.()
    }
  }

  private updateFlip(dt: number) {
    if (this.step !== 'flipping' || !this.piece) return
    this.flipT = Math.min(1, this.flipT + dt / 1.25)
    const t = this.flipT
    const e = t * t * (3 - 2 * t)
    this.piece.rotation.x = Math.PI * e
    const arc = Math.sin(Math.PI * Math.min(1, t * 1.05)) * 5.5
    this.piece.position.y = THREE.MathUtils.lerp(this.flipY0, this.flipYEnd, e) + arc
    // the empty board slides off to the right
    const bx = this.board.group.position.x
    this.board.group.position.x = bx + (46 - bx) * (1 - Math.exp(-2.4 * dt))
    if (t >= 1) {
      this.piece.position.y = this.flipYEnd
      this.piece.rotation.x = Math.PI
      this.flipped = true
      this.sim!.face = 'bot'
      this.step = 'flipped'
      this.audio.impact('peg', 0.9, 0.6)
      this.audio.impact('tableKnock', 0.5, 1.3)
      this.board.group.visible = false
      this.onChange?.()
    }
  }

  private updatePress(dt: number) {
    if (this.book) {
      this.bookY += (this.bookTargetY - this.bookY) * (1 - Math.exp(-7 * dt))
      this.book.position.y = this.bookY
      if (this.step === 'done' && this.bookY > 12.5) { this.w.scene.remove(this.book); this.book = null }
    }
    if (this.step === 'pressing') {
      this.pressTime += dt
      const dur = this.pressKind === 'tile' ? 6 : this.pressKind === 'book' ? 9 : 7
      this.pressProgress = clamp(this.pressTime / dur, 0, 1)
      // heat leaves the piece; the curl either builds (free) or is held flat (pressed)
      const kcool = this.pressKind === 'tile' ? 1.5 : 1
      this.sim?.coolAll(dt * 6 * kcool)
      const free = this.pressKind === 'none'
      const wantWarp = free ? this.warpTarget * smoothstep(0.1, 0.9, this.pressProgress) : this.warpTarget * 0.12 * smoothstep(0.7, 1, this.pressProgress)
      this.warpCur += (wantWarp - this.warpCur) * (1 - Math.exp(-4 * dt))
      this.pegs.setBend(this.warpCur)
      if (this.pressProgress >= 1 && this.pressKind === 'none') { this.step = 'done'; this.onChange?.() }
      else if (this.pressProgress >= 1) this.onChange?.()
      if (this.time - this.lastTick > 0.4) this.onChange?.()
    } else if (this.step === 'done') {
      const free = this.pressKind === 'none'
      const want = free ? this.warpTarget : this.warpTarget * 0.12
      this.warpCur += (want - this.warpCur) * (1 - Math.exp(-3 * dt))
      this.pegs.setBend(this.warpCur)
    }
  }

  get pieceWorldY() { return this.piece?.position.y ?? 0 }

  /** physical measurements of the finished piece, for the diagnosis */
  pieceMetrics() {
    const p = this.pegs, lay = this.board.layout, n = lay.cols * lay.rows
    let c = 0, closed = 0, open = 0, sum = 0, sum2 = 0, edge = 0, edgeBurn = 0, bleed = 0, yellow = 0, resid = 0
    for (let k = 0; k < n; k++) {
      if (!p.occupied[k]) continue
      c++
      const u = Math.max(p.meltTop[k], p.meltBot[k])
      const both = Math.min(p.meltTop[k], p.meltBot[k])
      if (u >= 1) closed++
      if (u < 0.45) open++
      const F = thickRatio(u)
      sum += F; sum2 += F * F
      const i = k % lay.cols, j = (k / lay.cols) | 0
      const nb = (i > 0 && p.occupied[k - 1] ? 1 : 0) + (i < lay.cols - 1 && p.occupied[k + 1] ? 1 : 0) + (j > 0 && p.occupied[k - lay.cols] ? 1 : 0) + (j < lay.rows - 1 && p.occupied[k + lay.cols] ? 1 : 0)
      if (nb < 4) { edge++; if (u > 1.15) edgeBurn++ }
      if (u > 1.0 && both > 0.8) bleed++
      if (p.resTop[k] > 0.35 || p.resBot[k] > 0.35) resid++
      const hex = p.hex[k]; const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255
      if (r > 225 && g > 225 && b > 215 && u > 1.45) yellow++
    }
    const mean = c ? sum / c : 0
    return { count: c, closedShare: c ? closed / c : 0, openShare: c ? open / c : 0, thickSd: c ? Math.sqrt(Math.max(0, sum2 / c - mean * mean)) : 0, edgeBurnShare: edge ? edgeBurn / edge : 0, bleedShare: c ? bleed / c : 0, yellowed: yellow, residueShare: c ? resid / c : 0 }
  }
}

export { COVERS, PALETTE }
