import { Emitter } from '../lib/events'
import type { Studio } from './studio'
import { buildShot, boardShot } from './studio'
import type { ScaleId } from '../config/physical'
import type { BoardShape } from '../render/board'
import type { Pattern } from '../config/patterns'
import { makeSheetTexture } from '../render/sheet'
import { randomSeed } from '../lib/rng'
import * as THREE from 'three'
import type { BuildSummary } from '../sim/report'

export type StageId = 'board' | 'beads' | 'build' | 'iron' | 'finish'
export const STAGES: { id: StageId; zh: string; en: string }[] = [
  { id: 'board', zh: '选板', en: 'Board' },
  { id: 'beads', zh: '取豆', en: 'Beads' },
  { id: 'build', zh: '拼', en: 'Place' },
  { id: 'iron', zh: '熨烫', en: 'Iron' },
  { id: 'finish', zh: '成品', en: 'Finish' },
]

export interface Setup {
  scale: ScaleId
  shape: BoardShape
  n: number
  pattern: Pattern | null
}

export interface SessionEvents extends Record<string, unknown> {
  stage: StageId
  setup: Setup
  tray: void
  build: void
}

/** The session: what the visitor has chosen so far, which stage they are in, and the glue to the 3D studio. */
export class Session {
  readonly bus = new Emitter<SessionEvents>()
  stage: StageId = 'board'
  /** furthest stage reached (the stepper lets you go back, not skip ahead) */
  reached = 0
  setup: Setup = { scale: 'mini', shape: 'square', n: 26, pattern: null }
  seed = randomSeed()
  /** how well the beads match the pattern, taken when the visitor leaves the building stage */
  buildSummary: BuildSummary | null = null
  /** serial number of this piece — printed on the finished card */
  pieceNo = 1 + Math.floor(Math.random() * 998)
  startedAt = performance.now()
  constructor(readonly studio: Studio) {
    studio.patternGetter = () => this.setup.pattern
    studio.resetGuide()
    studio.build.onChange = () => { studio.guide?.refresh(); this.bus.emit('build', undefined) }
    this.watchTray()
  }

  /** the tray model is rebuilt with the board; follow whichever one is current */
  private watchTray() {
    this.studio.world.trayModel.onChange = () => this.bus.emit('tray', undefined)
  }

  /** rebuild the table for a (new) bead scale / board / pattern */
  applySetup(next: Partial<Setup>) {
    const prev = this.setup
    this.setup = { ...prev, ...next }
    const s = this.setup
    const changedScaleOrBoard = s.scale !== prev.scale || s.shape !== prev.shape || s.n !== prev.n
    const st = this.studio
    if (changedScaleOrBoard) {
      this.seed = randomSeed()
      st.world.setSetup(s.scale, { shape: s.shape, n: s.n }, this.seed)
      this.watchTray()
      st.build.resetBoard()
      st.resetGuide()
    }
    this.printSheet()
    this.bus.emit('setup', s)
    if (changedScaleOrBoard) this.goShot(this.stage, true)
  }

  printSheet() {
    const w = this.studio.world
    const tex = makeSheetTexture(w.board, this.setup.pattern, w.gfx.renderer)
    w.board.setSheetTexture(tex)
    // a bottle of each of the most used colours stands on the table
    const pat = this.setup.pattern
    if (pat) {
      const cnt = new Map<number, number>()
      for (const c of pat.cells) if (c >= 0) cnt.set(c, (cnt.get(c) ?? 0) + 1)
      w.props.setBottles([...cnt.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]))
    } else w.props.setBottles([])
  }

  /** the board size that suits a pattern at the current scale (smallest standard board that fits with a margin) */
  boardFor(p: Pattern | null, scale = this.setup.scale): number {
    const sizes = scale === 'mini' ? [26, 52] : [15, 29]
    if (!p) return sizes[0]
    const need = Math.max(p.w, p.h) + 2
    return sizes.find((n) => n >= need) ?? sizes[sizes.length - 1]
  }

  go(stage: StageId) {
    const order = STAGES.map((s) => s.id)
    const idx = order.indexOf(stage)
    if (idx > this.reached) this.reached = idx
    this.leave(this.stage)
    this.stage = stage
    this.enter(stage)
    this.bus.emit('stage', stage)
  }

  /** compare what is on the board with the pattern */
  summarizeBuild(): BuildSummary | null {
    const p = this.setup.pattern
    if (!p) return null
    const w = this.studio.world, lay = w.board.layout
    const i0 = Math.floor((lay.cols - p.w) / 2), j0 = Math.floor((lay.rows - p.h) / 2)
    let wrong = 0, missing = 0, extra = 0, total = 0
    for (let j = 0; j < lay.rows; j++) for (let i = 0; i < lay.cols; i++) {
      const k = j * lay.cols + i
      const pi = i - i0, pj = j - j0
      const want = pi >= 0 && pj >= 0 && pi < p.w && pj < p.h ? p.cells[pj * p.w + pi] : -1
      const have = w.pegs.occupied[k] ? w.pegs.colorCode[k] : -1
      if (want >= 0) total++
      if (want >= 0 && have < 0) missing++
      else if (want >= 0 && have >= 0 && have !== want) wrong++
      else if (want < 0 && have >= 0) extra++
    }
    return { wrong, missing, extra, total }
  }

  private leave(s: StageId) {
    if (s === 'build') { this.buildSummary = this.summarizeBuild(); this.studio.build.exit() }
    if (s === 'iron') this.studio.iron.exit()
    if (s === 'finish') this.studio.finish.exit()
  }
  private enter(s: StageId) {
    const st = this.studio
    if (s === 'build') st.build.enter()
    if (s === 'iron') st.iron.enter()
    if (s === 'finish') st.finish.enter()
    // while working at the table right-drag pans the view; when looking at the piece it orbits
    st.rightDragPans = s === 'board' || s === 'beads' || s === 'build'
    document.body.classList.toggle('stage-build', s === 'build')
    this.goShot(s)
  }

  /** how the finished piece is displayed changed: re-frame the camera */
  finishShot(d: 'table' | 'keychain' | 'frame') {
    const sh = this.studio.finish.shotFor(d)
    this.studio.rig.go({ target: sh.target, yaw: 0, pitch: sh.pitch, fitW: sh.fitW, fitH: sh.fitH, yawRange: 0.8, pitchRange: [-0.4, 0.5] }, 3.2)
  }

  /** camera framing for a stage */
  goShot(s: StageId, snap = false) {
    const st = this.studio, w = st.world, rig = st.rig
    const trayShot = () => ({
      target: new THREE.Vector3(w.tray.origin.x, 0, w.tray.origin.z + 0.3), yaw: 0, pitch: 1.1,
      fitW: w.tray.size.x + 2.4, fitH: w.tray.size.y + 2.2, yawRange: 0.001, pitchRange: [0, 0] as [number, number],
      zoomRange: [0.3, 1.5] as [number, number],
    })
    if (s === 'board') {
      const b = w.board.size, t = w.tray.size
      const left = -b.x / 2, right = w.tray.origin.x + t.x / 2
      rig.go({ target: new THREE.Vector3((left + right) / 2, 0, 0.2), yaw: 0, pitch: 1.12, fitW: right - left + 9, fitH: Math.max(b.y, t.y) + 7, yawRange: 0.5, pitchRange: [-0.5, 0.3] }, 4.5)
    } else if (s === 'beads') rig.go(trayShot(), 5)
    else if (s === 'build') rig.go(buildShot(w), 4.5)
    else if (s === 'iron') {
      const b = w.board.size
      rig.go({ target: new THREE.Vector3(0, 0, 0.3), yaw: 0, pitch: 1.12, fitW: b.x + 12, fitH: b.y + 9, yawRange: 0.5, pitchRange: [-0.5, 0.3] }, 4.5)
    } else if (s === 'finish') {
      const b = w.board.size
      rig.go({ target: new THREE.Vector3(0, 0, 1), yaw: 0.0, pitch: 1.0, fitW: b.x + 8, fitH: b.y + 5, yawRange: 0.8, pitchRange: [-0.7, 0.4] }, 4)
    } else rig.go(boardShot(w), 4.5)
    if (snap) rig.snap()
  }
}
