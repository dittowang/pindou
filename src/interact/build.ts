import * as THREE from 'three'
import { cellX, cellZ } from '../render/board'
import type { World } from '../app/world'
import { PointerState } from './pointer'
import type { AudioEngine } from '../audio/audio'
import { ToolRig, type Tool } from './toolRig'
import { PALETTE } from '../config/palette'

export type { Tool }

export interface BuildStats { placed: number; pulled: number; dropped: number; misseated: number; reseated: number; flung: number }

interface HistoryOp { type: 'place' | 'pull'; i: number; j: number; hex: number; code: number }
interface Seat { i: number; j: number; t: number; dur: number; from: number; to: number; sound: boolean }
type Hover =
  | { kind: 'none' }
  | { kind: 'well'; well: number; cell: number }
  | { kind: 'board'; i: number; j: number; occupied: boolean }

/** how many beads the pen takes on at a time (a real 双针豆笔 holds 60–80; a handful is plenty for a pattern) */
const PEN_CAPACITY = 24
/** how high the tip hovers over what it points at, cm */
const LIFT = 0.14
/** chance that a bead does not go all the way down its peg (a click on it presses it home). Off: nothing here should ever look like a bug. */
const PERCH_CHANCE = 0

/**
 * The beading hand — one plain rule set, no luck involved:
 *   镊子  click a bead in the tray to pick it up (or drag it out), click a free peg to put it down;
 *         a click on a bead on the board takes it off again; right-click puts it back in the tray.
 *   豆笔  click a colour in the tray to load beads, then hold the mouse and sweep across pegs: one bead per peg.
 * The tool tip is always exactly where the pointer is; what it points at is outlined before you click.
 */
export class BuildController {
  active = false
  tool: Tool = 'tweezers'
  readonly stats: BuildStats = { placed: 0, pulled: 0, dropped: 0, misseated: 0, reseated: 0, flung: 0 }
  readonly history: HistoryOp[] = []
  onChange: (() => void) | null = null
  onToast: ((msg: string) => void) | null = null
  /** the colour being worked with (held bead or loaded pen), or −1 — the studio uses it to light up where it belongs */
  onFocusColor: ((pal: number) => void) | null = null
  held: { pal: number; hex: number } | null = null
  penLoad = { n: 0, pal: -1, hex: 0, well: -1 }
  hover: Hover = { kind: 'none' }

  private rig!: ToolRig
  private marker!: THREE.Mesh
  private markerMat!: THREE.MeshBasicMaterial
  private tipGoal = new THREE.Vector3()
  private tip = new THREE.Vector3()
  private tipReady = false
  private seats: Seat[] = []
  private pressPicked = false
  private painting = false
  private lastPaint = new THREE.Vector3()
  private lastSound = 0
  private time = 0
  private v1 = new THREE.Vector3()
  private v2 = new THREE.Vector3()
  private v3 = new THREE.Vector3()
  private focused = -2

  constructor(private w: World, private ptr: PointerState, private audio: AudioEngine) {
    this.build()
  }

  private get d() { return this.w.dims }
  private get pegs() { return this.w.pegs }

  /** (re)make the things that depend on the bead size */
  private build() {
    this.rig?.dispose()
    if (this.marker) { this.marker.parent?.remove(this.marker); this.marker.geometry.dispose(); this.markerMat.dispose() }
    this.rig = new ToolRig(this.w.gfx.renderer, this.d)
    this.rig.addTo(this.w.scene)
    this.rig.setTool(this.tool)
    const r = this.d.pitch
    const geo = new THREE.RingGeometry(r * 0.46, r * 0.84, 32)
    geo.rotateX(-Math.PI / 2)
    this.markerMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false })
    this.marker = new THREE.Mesh(geo, this.markerMat)
    this.marker.renderOrder = 31
    this.marker.visible = false
    this.marker.userData.noAO = true
    this.w.scene.add(this.marker)
  }

  /** the board / scale was rebuilt */
  resetBoard() {
    this.history.length = 0
    this.seats.length = 0
    this.held = null
    this.penLoad = { n: 0, pal: -1, hex: 0, well: -1 }
    Object.assign(this.stats, { placed: 0, pulled: 0, dropped: 0, misseated: 0, reseated: 0, flung: 0 })
    this.build()
    this.tipReady = false
    this.changed()
  }

  /** the tool tip in world space (for tests and UI that want to know where the tool is drawn) */
  get tipWorld() { return this.tip }
  get toolVisible() { return this.rig.group.visible }
  get placedCount() { return this.pegs.count }
  get canUndo() { return this.history.length > 0 }

  /** what to tell the visitor right now */
  get hint(): string {
    const tray = this.w.trayModel
    if (this.tool === 'tweezers') {
      if (this.held) return '移到板子上的钉子，点一下放下 · 右键放回豆盘'
      if (!tray.hasBeads) return '豆盘是空的——回到上一步取豆，或在左边点「＋ 一勺」'
      return '点一下豆盘里的豆子，把它夹起来；点板上的豆可以取下'
    }
    if (this.penLoad.n > 0) return `按住鼠标，在钉子上划过，一路放豆 · 笔里还有 ${this.penLoad.n} 颗`
    if (!tray.hasBeads) return '豆盘是空的——回到上一步取豆，或在左边点「＋ 一勺」'
    return '点一下豆盘里的颜色，给豆笔装豆'
  }

  enter() {
    this.active = true
    this.tipReady = false
    this.changed()
  }

  exit() {
    this.cancel(true)
    this.active = false
    this.rig.setVisible(false)
    this.marker.visible = false
    this.w.trayBeads.setHover(-1, -1)
    this.setFocus(-1)
  }

  setTool(t: Tool) {
    if (t === this.tool) return
    if (this.tool === 'tweezers' && this.held) this.returnHeld()
    this.tool = t
    this.painting = false
    this.rig.setTool(t)
    if (t === 'pen') this.rig.setPenLoad(this.penLoad.n, this.penLoad.hex)
    this.audio.impact('tweezerTick', 0.35, t === 'pen' ? 0.8 : 1.2)
    this.changed()
  }

  /** put whatever is in hand back (Esc / right-click) */
  cancel(silent = false) {
    if (this.held) this.returnHeld(silent)
    else if (this.tool === 'pen' && this.penLoad.n > 0) this.unloadPen(silent)
  }

  // ------------------------------------------------------------------------------------------ frame
  update(dt: number) {
    this.time += dt
    if (!this.active) return
    const ptr = this.ptr
    this.locate()
    this.updateTip(dt)
    if (ptr.justDown) this.onDown()
    if (this.painting) this.paintTrail()
    if (ptr.justUp) this.onUp()
    this.updateSeats(dt)
    this.updateMarker()
    // the tray highlights the bead a click would take
    const hv = this.hover
    this.w.trayBeads.setHover(hv.kind === 'well' && this.canPickFromWell() ? hv.well : -1, hv.kind === 'well' ? hv.cell : -1)
    this.rig.setVisible(ptr.inside || ptr.down)
  }

  private canPickFromWell() { return (this.tool === 'tweezers' && !this.held) || this.tool === 'pen' }

  /** what is under a pointer ray, and where would the tool tip be */
  private probe(ray: THREE.Ray, goal: THREE.Vector3): Hover {
    const w = this.w, d = this.d
    const topY = w.board.plateTopY + d.bead.height
    let hover: Hover = { kind: 'none' }
    const hb = PointerState.hit(ray, topY, this.v1)
    if (hb) {
      const peg = this.pegAt(hb.x, hb.z)
      if (peg) hover = { kind: 'board', i: peg.i, j: peg.j, occupied: !!this.pegs.occupied[peg.j * w.board.layout.cols + peg.i] }
    }
    if (hover.kind === 'none') {
      const ht = PointerState.hit(ray, w.trayBeads.topY, this.v2)
      if (ht) {
        const wi = this.wellNear(ht.x, ht.z)
        if (wi >= 0) hover = { kind: 'well', well: wi, cell: w.trayBeads.nearestCell(wi, ht.x, ht.z) }
      }
    }
    // the tip rides the pointer ray, just above whatever it points at
    const planeY = hover.kind === 'board' ? topY : hover.kind === 'well' ? w.trayBeads.topY : 0.3
    PointerState.hit(ray, planeY + LIFT, goal)
    return hover
  }

  /** what is under the pointer? */
  private locate() {
    const ptr = this.ptr
    if (!(ptr.inside || ptr.down)) { this.hover = { kind: 'none' }; return }
    this.hover = this.probe(ptr.ray, this.v3)
    this.tipGoal.copy(this.v3)
  }

  /** the peg nearest to a ground point, or null when the point is off the board (or on a missing peg of a round/heart board) */
  private pegAt(x: number, z: number): { i: number; j: number } | null {
    const lay = this.w.board.layout, pitch = this.d.pitch
    const fi = x / pitch + (lay.cols - 1) / 2, fj = z / pitch + (lay.rows - 1) / 2
    if (fi < -0.6 || fj < -0.6 || fi > lay.cols - 0.4 || fj > lay.rows - 0.4) return null
    const i = Math.min(lay.cols - 1, Math.max(0, Math.round(fi)))
    const j = Math.min(lay.rows - 1, Math.max(0, Math.round(fj)))
    if (!lay.mask[j * lay.cols + i]) return null
    return { i, j }
  }

  /** the compartment under a point; a click on a divider counts for the nearest compartment */
  private wellNear(x: number, z: number): number {
    const t = this.w.tray
    const wi = t.wellAt(x, z)
    if (wi >= 0) return wi
    if (Math.abs(x - t.origin.x) > t.size.x / 2 || Math.abs(z - t.origin.z) > t.size.y / 2) return -1
    let best = -1, bd = Infinity
    const c = this.v2.clone()
    for (let k = 0; k < t.count; k++) {
      t.wellCenter(k, c)
      const dd = (c.x - x) ** 2 + (c.z - z) ** 2
      if (dd < bd) { bd = dd; best = k }
    }
    return best
  }

  private updateTip(dt: number) {
    if (!this.tipReady) { this.tip.copy(this.tipGoal); this.tipReady = true }
    else this.tip.lerp(this.tipGoal, 1 - Math.exp(-48 * dt))
    this.rig.place(this.tip, this.w.camera, dt)
    // open the tips over a bead you could take, close them on one you hold
    this.rig.pinch(!!this.held || (this.hover.kind === 'well' && this.hover.cell >= 0 && this.tool === 'tweezers' && this.ptr.down))
  }

  // ------------------------------------------------------------------------------------------ pointer
  private onDown() {
    // act on what was under the pointer when the button went down (not where it has moved to since)
    const h = this.probe(this.ptr.downRay, this.v3)
    if (this.tool === 'tweezers') {
      if (this.held) {
        if (h.kind === 'board') {
          if (!h.occupied) this.placeHeld(h.i, h.j)
          else this.toast('这个钉子上已经有豆了——换一个空的钉子')
        } else if (h.kind === 'well') this.returnHeld()
        return
      }
      if (h.kind === 'well') { if (h.cell >= 0) this.pickFromWell(h.well, h.cell); else this.toast('这一格是空的') }
      else if (h.kind === 'board' && h.occupied) this.pickFromPeg(h.i, h.j)
      return
    }
    // pen
    if (h.kind === 'well') { this.loadPen(h.well); return }
    if (this.penLoad.n <= 0) { this.toast('笔是空的——先点一下豆盘里的颜色装豆'); return }
    this.painting = true
    this.lastPaint.copy(PointerState.hit(this.ptr.downRay, this.w.board.plateTopY + this.d.bead.height, this.v1) ?? this.tipGoal)
    if (h.kind === 'board' && !h.occupied) this.paintPeg(h.i, h.j)
  }

  private onUp() {
    // dragged a bead out of the tray (or off the board) and let go: put it down where it is
    if (this.tool === 'tweezers' && this.held && this.pressPicked && this.ptr.movedPx > 8) {
      const h = this.hover
      if (h.kind === 'board' && !h.occupied) this.placeHeld(h.i, h.j)
      else this.returnHeld()
    }
    this.pressPicked = false
    this.painting = false
  }

  // ------------------------------------------------------------------------------------------ tweezers
  private pickFromWell(well: number, cell: number, viaPress = true) {
    const tray = this.w.trayModel
    const data = tray.take(well, cell)
    if (!data) return
    this.held = { pal: data.pal, hex: data.hex }
    this.pressPicked = viaPress
    this.rig.setHeld(this.held)
    this.audio.impact('tweezerGrip', 0.55, 1.1)
    this.setFocus(data.pal)
    this.changed()
  }

  private pickFromPeg(i: number, j: number) {
    const k = j * this.w.board.layout.cols + i
    // a bead that sits up on its peg is pressed down first (the "轻点它可以按到底" fix)
    if (this.pegs.lift[k] > 0.05) {
      this.pegs.reseat(i, j)
      this.stats.reseated++
      this.audio.impact('peg', 0.7, 0.9)
      this.changed()
      return
    }
    const hex = this.pegs.hex[k], pal = this.pegs.colorCode[k]
    this.seats = this.seats.filter((s) => !(s.i === i && s.j === j))
    this.pegs.remove(i, j)
    this.pegs.markDirty()
    this.history.push({ type: 'pull', i, j, hex, code: pal })
    this.stats.pulled++
    this.held = { pal, hex }
    this.pressPicked = true
    this.rig.setHeld(this.held)
    this.audio.impact('tweezerGrip', 0.6, 0.9)
    this.setFocus(pal)
    this.changed()
  }

  private placeHeld(i: number, j: number) {
    const held = this.held
    if (!held) return
    // now and then a bead does not go all the way down — a click on it presses it home
    const perched = Math.random() < PERCH_CHANCE
    if (this.seat(i, j, held.hex, held.pal, perched)) {
      this.history.push({ type: 'place', i, j, hex: held.hex, code: held.pal })
      this.stats.placed++
      this.stats.dropped++
      if (perched) { this.stats.misseated++; this.toast('这颗没插到底——点一下它，按到底') }
    }
    this.held = null
    this.rig.setHeld(null)
    this.setFocus(this.penLoad.n > 0 && this.tool === 'pen' ? this.penLoad.pal : -1)
    this.changed()
  }

  /** back into the compartment of its colour */
  private returnHeld(silent = false) {
    const held = this.held
    if (!held) return
    this.w.trayModel.giveBack(held.pal, held.hex, 1)
    this.held = null
    this.rig.setHeld(null)
    if (!silent) this.audio.impact('beadTray', 0.4, 1.1)
    this.setFocus(-1)
    this.changed()
  }

  /** a colour chip in the HUD was clicked: take a bead of that colour (tweezers) or load the pen from that compartment */
  chooseColor(well: number) {
    const tray = this.w.trayModel
    const data = tray.wells[well]
    if (!data || data.count <= 0) { this.toast('这一格是空的'); return }
    if (this.tool === 'pen') { this.loadPen(well); return }
    if (this.held) this.returnHeld(true)
    const cell = this.w.trayBeads.nearestCell(well, this.w.tray.origin.x, this.w.tray.origin.z)
    if (cell >= 0) this.pickFromWell(well, cell, false)
  }

  // ------------------------------------------------------------------------------------------ pen
  private loadPen(well: number) {
    const tray = this.w.trayModel
    const data = tray.wells[well]
    if (!data || data.count <= 0) { this.toast('这一格是空的'); return }
    if (this.penLoad.n > 0) this.unloadPen(true)
    const n = tray.takeMany(well, PEN_CAPACITY)
    this.penLoad = { n, pal: data.pal, hex: data.hex, well }
    this.rig.setPenLoad(n, data.hex)
    this.audio.impact('beadTray', 0.5, 0.9)
    this.setFocus(data.pal)
    this.changed()
  }

  private unloadPen(silent = false) {
    if (this.penLoad.n > 0) this.w.trayModel.giveBack(this.penLoad.pal, this.penLoad.hex, this.penLoad.n)
    this.penLoad = { n: 0, pal: -1, hex: 0, well: -1 }
    this.rig.setPenLoad(0, 0)
    if (!silent) this.audio.impact('beadTray', 0.35, 1)
    this.setFocus(-1)
    this.changed()
  }

  /** while the mouse is down: every peg the pen sweeps over gets a bead — following every pointer position since the last frame */
  private paintTrail() {
    const topY = this.w.board.plateTopY + this.d.bead.height
    const ray = new THREE.Ray()
    for (const ndc of this.ptr.trail) {
      this.ptr.rayFromNdc(ndc, this.w.camera, ray)
      const p = PointerState.hit(ray, topY, this.v1)
      if (!p) continue
      this.paintSegment(this.lastPaint, p)
      this.lastPaint.copy(p)
      if (this.penLoad.n <= 0) break
    }
  }

  private paintSegment(a: THREE.Vector3, b: THREE.Vector3) {
    const pitch = this.d.pitch
    const dist = Math.hypot(b.x - a.x, b.z - a.z)
    const steps = Math.max(1, Math.ceil(dist / (pitch * 0.5)))
    for (let s = 1; s <= steps && this.penLoad.n > 0; s++) {
      const x = a.x + ((b.x - a.x) * s) / steps, z = a.z + ((b.z - a.z) * s) / steps
      const peg = this.pegAt(x, z)
      if (peg && !this.pegs.occupied[peg.j * this.w.board.layout.cols + peg.i]) this.paintPeg(peg.i, peg.j)
    }
  }

  private paintPeg(i: number, j: number) {
    if (this.penLoad.n <= 0) return
    const { hex, pal } = this.penLoad
    if (!this.seat(i, j, hex, pal, false, true)) return
    this.history.push({ type: 'place', i, j, hex, code: pal })
    this.stats.placed++
    this.penLoad.n--
    this.rig.setPenLoad(this.penLoad.n, hex)
    if (this.penLoad.n === 0) {
      this.penLoad.pal = -1
      this.toast('笔空了——再点一下豆盘里的颜色装豆')
      this.setFocus(-1)
    }
    this.changed()
  }

  // ------------------------------------------------------------------------------------------ the board
  /** thread a bead onto a peg with a short drop */
  private seat(i: number, j: number, hex: number, pal: number, perched: boolean, quiet = false): boolean {
    const from = 1.2
    const to = perched ? 0.55 : 0
    if (!this.pegs.place(i, j, hex, pal, 0.2, from)) return false
    this.seats.push({ i, j, t: 0, dur: quiet ? 0.09 : 0.16, from, to, sound: !quiet })
    if (quiet) {
      const now = performance.now()
      if (now - this.lastSound > 45) { this.lastSound = now; this.audio.impact('peg', 0.3, 1.15 + Math.random() * 0.2) }
    }
    return true
  }

  private updateSeats(dt: number) {
    for (let n = this.seats.length - 1; n >= 0; n--) {
      const s = this.seats[n]
      s.t += dt
      const u = Math.min(1, s.t / s.dur)
      const e = 1 - (1 - u) * (1 - u)
      this.pegs.setLift(s.i, s.j, s.from + (s.to - s.from) * e)
      if (u >= 1) {
        if (s.sound) this.audio.impact('peg', 0.7, 0.95 + Math.random() * 0.12)
        this.seats.splice(n, 1)
      }
    }
  }

  /** outline what a click would do */
  private updateMarker() {
    const h = this.hover
    const m = this.marker
    let show = false
    if (h.kind === 'board') {
      const free = !h.occupied
      const canPlace = (this.tool === 'tweezers' && !!this.held) || (this.tool === 'pen' && this.penLoad.n > 0)
      const canPull = this.tool === 'tweezers' && !this.held && h.occupied
      if ((canPlace && free) || canPull) {
        show = true
        m.position.set(cellX(h.i, this.w.board.layout.cols, this.d.pitch), this.w.board.plateTopY + this.d.bead.height + 0.03, cellZ(h.j, this.w.board.layout.rows, this.d.pitch))
        this.markerMat.color.set(canPull ? 0xff8a2a : 0x2fbf71)
        m.scale.setScalar(1 + 0.1 * Math.sin(this.time * 8))
      }
    }
    m.visible = show
  }

  // ------------------------------------------------------------------------------------------ undo
  undo() {
    const op = this.history.pop()
    if (!op) return
    const pegs = this.pegs
    if (op.type === 'place') {
      this.seats = this.seats.filter((s) => !(s.i === op.i && s.j === op.j))
      pegs.remove(op.i, op.j)
      pegs.markDirty()
      this.w.trayModel.giveBack(op.code, op.hex, 1)
      this.stats.placed = Math.max(0, this.stats.placed - 1)
    } else {
      // a bead that was taken off goes back on its peg
      const well = this.w.trayModel.indexOfPalette(op.code)
      if (well >= 0) this.w.trayModel.takeOne(well)
      pegs.place(op.i, op.j, op.hex, op.code, 0.2, 0)
      this.stats.pulled = Math.max(0, this.stats.pulled - 1)
    }
    this.audio.impact('tweezerTick', 0.4, 1.3)
    this.changed()
  }

  // ------------------------------------------------------------------------------------------ misc
  private setFocus(pal: number) {
    if (pal === this.focused) return
    this.focused = pal
    this.onColorFocus(pal)
  }
  private onColorFocus(pal: number) { this.onFocusColor?.(pal) }

  private toast(m: string) { this.onToast?.(m) }
  private changed() { this.onChange?.() }

  /** the palette entry of the colour in hand (for the UI) */
  get inHand() {
    const pal = this.held?.pal ?? (this.penLoad.n > 0 ? this.penLoad.pal : -1)
    return pal >= 0 ? PALETTE[pal] : null
  }

  dispose() {
    this.rig.dispose()
    this.marker.parent?.remove(this.marker)
  }
}
