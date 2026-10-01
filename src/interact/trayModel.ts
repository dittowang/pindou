import type { PaletteColor } from '../config/palette'

/** One compartment of the sorting tray. `count` is everything of this colour you have taken; the compartment can show at
 *  most `cap` standing beads at a time, the rest wait in `count` and stand up as room appears. */
export interface WellData {
  pal: number
  hex: number
  count: number
  /** 1 where a bead is standing, per grid cell */
  cells: Uint8Array
  /** how many cells are occupied right now */
  shown: number
  /** beads still to appear (poured in over a moment) */
  pending: number
  /** seconds between two beads appearing */
  step: number
  acc: number
}

/**
 * The tray as plain data: which colour is in which compartment and how many beads there are. No physics —
 * the beads stand in a neat grid (a 立豆盘) and the view just draws what is here.
 */
export class TrayModel {
  wells: (WellData | null)[]
  /** bumps whenever anything visible changes, so the view knows to look */
  version = 0
  onChange: (() => void) | null = null

  constructor(readonly wellCount: number, readonly cap: number, readonly scoopSize: number) {
    this.wells = new Array(wellCount).fill(null)
  }

  reset() {
    this.wells = new Array(this.wellCount).fill(null)
    this.touch()
  }

  private touch() { this.version++; this.onChange?.() }

  indexOfPalette(pal: number) { return this.wells.findIndex((w) => w?.pal === pal) }
  firstFree() { return this.wells.findIndex((w) => !w) }
  countIn(i: number) { return this.wells[i]?.count ?? 0 }
  get usedWells() { return this.wells.filter(Boolean).length }
  get totalBeads() { let n = 0; for (const w of this.wells) if (w) n += w.count; return n }
  /** is anything left to pick? */
  get hasBeads() { return this.wells.some((w) => w && w.count > 0) }

  /** put `n` beads of a colour into its compartment (a free one if it has none yet). Returns the well, or −1 when the tray is full. */
  scoop(pal: PaletteColor, n = this.scoopSize): number {
    let i = this.indexOfPalette(pal.index)
    if (i < 0) {
      i = this.firstFree()
      if (i < 0) return -1
      this.wells[i] = { pal: pal.index, hex: pal.hexNum, count: 0, cells: new Uint8Array(this.cap), shown: 0, pending: 0, step: 0.012, acc: 0 }
    }
    const w = this.wells[i]!
    w.count += n
    w.step = 0.012
    this.queueFill(w)
    this.touch()
    return i
  }

  /** beads that could still appear in this compartment */
  private queueFill(w: WellData) {
    const room = Math.min(w.count, this.cap) - w.shown - w.pending
    if (room > 0) w.pending += room
  }

  /** take the bead standing in `cell` (picked with tweezers) */
  take(i: number, cell: number): WellData | null {
    const w = this.wells[i]
    if (!w || !w.cells[cell]) return null
    w.cells[cell] = 0
    w.shown--
    w.count--
    w.step = 0.09                                // the next bead steps up after a moment
    if (w.count <= 0) { w.count = 0; w.pending = 0 }
    else this.queueFill(w)
    this.touch()
    return w
  }

  /** take any one bead of this compartment (undo of a pull) */
  takeOne(i: number): boolean {
    const w = this.wells[i]
    if (!w || w.count <= 0) return false
    for (let c = w.cells.length - 1; c >= 0; c--) if (w.cells[c]) return !!this.take(i, c)
    w.count--; this.touch(); return true
  }

  /** the pen takes up to `n` beads from the compartment; returns how many it got */
  takeMany(i: number, n: number): number {
    const w = this.wells[i]
    if (!w || w.count <= 0) return 0
    const got = Math.min(n, w.count)
    w.count -= got
    // the pen sweeps up beads from the back of the compartment, so what is left stays in tidy rows
    let remove = Math.min(got, w.shown)
    for (let c = w.cells.length - 1; c >= 0 && remove > 0; c--) {
      if (!w.cells[c]) continue
      w.cells[c] = 0
      w.shown--; remove--
    }
    w.pending = 0
    w.step = 0.03
    this.queueFill(w)
    this.touch()
    return got
  }

  /** a bead (or a few) go back to the compartment of their colour */
  giveBack(pal: number, hex: number, n = 1) {
    let i = this.indexOfPalette(pal)
    if (i < 0) {
      i = this.firstFree()
      if (i < 0) return
      this.wells[i] = { pal, hex, count: 0, cells: new Uint8Array(this.cap), shown: 0, pending: 0, step: 0.05, acc: 0 }
    }
    const w = this.wells[i]!
    w.count += n
    w.step = 0.05
    this.queueFill(w)
    this.touch()
  }

  /** tip a whole compartment out (the beads go back in the jar) */
  clearWell(i: number) {
    this.wells[i] = null
    this.touch()
  }

  /** beads stand up one by one */
  update(dt: number) {
    let changed = false
    for (const w of this.wells) {
      if (!w || w.pending <= 0) continue
      w.acc += dt
      while (w.acc >= w.step && w.pending > 0) {
        w.acc -= w.step
        w.pending--
        // the first empty cell in reading order: a part-filled compartment is a tidy block of rows, never a scatter
        let c = -1
        for (let k = 0; k < w.cells.length; k++) if (!w.cells[k]) { c = k; break }
        if (c < 0) { w.pending = 0; break }
        w.cells[c] = 1
        w.shown++
        changed = true
      }
    }
    if (changed) this.touch()
  }
}
