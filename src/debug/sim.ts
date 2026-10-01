import * as THREE from 'three'
import type { Studio } from '../app/studio'
import { cellX, cellZ } from '../render/board'
import { builtinPatterns } from '../config/patterns'

/**
 * `window.__dbg` — READ-ONLY helpers for automated checks. Input in tests must come from real mouse events
 * (Playwright's `page.mouse` / the Browser tool); these only translate world positions into screen positions
 * and report state, so a test never has to touch the app's internals to act.
 */
export function installDebug(studio: Studio) {
  const c = document.getElementById('stage') as HTMLCanvasElement
  const project = (x: number, y: number, z: number): [number, number] => {
    const v = new THREE.Vector3(x, y, z).project(studio.world.camera)
    const r = c.getBoundingClientRect()
    return [((v.x + 1) / 2) * r.width + r.left, ((1 - v.y) / 2) * r.height + r.top]
  }
  const dbg = {
    project,
    /** screen position of the top of peg (i, j) */
    peg(i: number, j: number): [number, number] {
      const w = studio.world, lay = w.board.layout
      return project(cellX(i, lay.cols, w.dims.pitch), w.board.plateTopY + w.dims.bead.height, cellZ(j, lay.rows, w.dims.pitch))
    },
    /** screen position of the middle of tray compartment `well` */
    well(well: number): [number, number] {
      const w = studio.world
      const v = w.tray.wellCenter(well, new THREE.Vector3())
      return project(v.x, w.trayBeads.topY, v.z)
    },
    /** screen position of the standing bead in a cell of a compartment */
    cell(well: number, cell: number): [number, number] {
      const v = studio.world.trayBeads.cellWorld(well, cell, new THREE.Vector3())
      return project(v.x, v.y + studio.world.dims.bead.height / 2, v.z)
    },
    /** the first occupied cell of a compartment */
    firstCell(well: number): number {
      const d = studio.world.trayModel.wells[well]
      if (!d) return -1
      for (let i = 0; i < d.cells.length; i++) if (d.cells[i]) return i
      return -1
    },
    /** where the tool tip is drawn on screen */
    tip(): [number, number] {
      const t = studio.build.tipWorld
      return project(t.x, t.y, t.z)
    },
    /** the ironing bench: where the iron / roller is drawn (screen) and what step we are on */
    bench() {
      const I = studio.iron
      const t = I.toolWorld
      return {
        step: I.step, mode: I.mode, pass: I.pass, temp: I.temperature, beadTemp: I.beadTemp, lintLeft: I.lintLeft, stick: I.stickMean,
        tool: project(t.x, t.y, t.z), toolWorld: [t.x, t.y, t.z], visible: I.iron.group.visible || (I as unknown as { roller: { group: { visible: boolean } } }).roller.group.visible,
      }
    },
    /** screen position of a point on the paper/board plane at (x, z) cm */
    onPaper(x: number, z: number): [number, number] {
      const w = studio.world
      return project(x, w.board.plateTopY + w.dims.bead.height * 0.82, z)
    },
    state() {
      const b = studio.build
      const m = studio.world.trayModel
      return {
        tool: b.tool, held: b.held, penLoad: { ...b.penLoad }, hover: b.hover.kind, placed: b.placedCount, canUndo: b.canUndo,
        hint: b.hint, wells: m.wells.map((w) => (w ? { pal: w.pal, count: w.count, shown: w.shown } : null)),
        toolVisible: b.toolVisible, stats: { ...b.stats }, loops: studio.audio.loops.size,
      }
    },
  }
  ;(window as unknown as { __dbg: typeof dbg }).__dbg = dbg
}

/** Test helper: fill the board with a built-in pattern instantly (as if the visitor had placed every bead). */
export function installFill(studio: Studio) {
  ;(window as unknown as { __fill: (id?: string) => number }).__fill = (id) => {
    const w = studio.world
    const pat = id ? builtinPatterns().find((q) => q.id === id) ?? null : null
    if (!pat) return 0
    const lay = w.board.layout
    const i0 = Math.floor((lay.cols - pat.w) / 2), j0 = Math.floor((lay.rows - pat.h) / 2)
    let n = 0
    for (let y = 0; y < pat.h; y++) for (let x = 0; x < pat.w; x++) {
      const idx = pat.cells[y * pat.w + x]
      if (idx < 0) continue
      const hex = parseInt(window.__pal.PALETTE[idx].hex.slice(1), 16)
      if (w.pegs.place(i0 + x, j0 + y, hex, idx, 0.25, 0)) n++
    }
    studio.build.stats.placed += n
    return n
  }
}
declare global { interface Window { __pal: { PALETTE: { hex: string }[] } } }
