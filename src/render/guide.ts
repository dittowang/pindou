import * as THREE from 'three'
import type { Board } from './board'
import { cellX, cellZ } from './board'
import type { Dims } from '../config/physical'
import type { PegBeads } from './pegBeads'
import type { Pattern } from '../config/patterns'

export type GuideMode = 'off' | 'color' | 'check'

/**
 * Soft markers laid on the plate: (1) every still-empty spot a chosen colour belongs to, (2) the "对图" check —
 * a ring on beads whose colour does not match the pattern, a pulsing dot where a bead is missing.
 */
export class Guide {
  readonly mesh: THREE.InstancedMesh
  mode: GuideMode = 'off'
  colorIdx = -1
  /** counts from the last check */
  wrong = 0
  missing = 0
  private cap: number
  private dummy = new THREE.Object3D()
  private mat: THREE.MeshBasicMaterial
  private time = 0
  private cells: { k: number; kind: number }[] = []

  constructor(private board: Board, private pegs: PegBeads, private dims: Dims, private pattern: () => Pattern | null) {
    const n = board.layout.cols * board.layout.rows
    this.cap = n
    const geo = new THREE.RingGeometry(dims.pitch * 0.30, dims.pitch * 0.46, 28)
    geo.rotateX(-Math.PI / 2)
    this.mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false })
    this.mesh = new THREE.InstancedMesh(geo, this.mat, n)
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3)
    this.mesh.count = 0
    this.mesh.renderOrder = 25
    this.mesh.frustumCulled = false
    this.mesh.userData.noAO = true
    board.group.add(this.mesh)
  }

  setMode(m: GuideMode, colorIdx = -1) { this.mode = m; this.colorIdx = colorIdx; this.refresh() }

  /** recompute the marker set (call when beads change) */
  refresh() {
    this.cells = []
    this.wrong = 0; this.missing = 0
    const pat = this.pattern()
    const lay = this.board.layout
    if (this.mode === 'off' || !pat) { this.mesh.count = 0; return }
    const i0 = Math.floor((lay.cols - pat.w) / 2), j0 = Math.floor((lay.rows - pat.h) / 2)
    for (let j = 0; j < lay.rows; j++) for (let i = 0; i < lay.cols; i++) {
      const k = j * lay.cols + i
      const pi = i - i0, pj = j - j0
      const want = pi >= 0 && pj >= 0 && pi < pat.w && pj < pat.h ? pat.cells[pj * pat.w + pi] : -1
      const have = this.pegs.occupied[k] ? this.pegs.colorCode[k] : -1
      if (this.mode === 'color') {
        if (want === this.colorIdx && have < 0) this.cells.push({ k, kind: 0 })
      } else {
        if (want >= 0 && have < 0) { this.cells.push({ k, kind: 1 }); this.missing++ }
        else if (want >= 0 && have >= 0 && have !== want) { this.cells.push({ k, kind: 2 }); this.wrong++ }
        else if (want < 0 && have >= 0) { this.cells.push({ k, kind: 2 }); this.wrong++ }
      }
    }
    this.mesh.count = Math.min(this.cap, this.cells.length)
    this.write()
  }

  private write() {
    const lay = this.board.layout, d = this.dims
    const c = new THREE.Color()
    for (let n = 0; n < this.mesh.count; n++) {
      const { k, kind } = this.cells[n]
      const i = k % lay.cols, j = (k / lay.cols) | 0
      this.dummy.position.set(cellX(i, lay.cols, d.pitch), this.board.plateTopY + 0.04 + (kind === 2 ? this.dims.bead.height : 0), cellZ(j, lay.rows, d.pitch))
      this.dummy.scale.setScalar(1)
      this.dummy.updateMatrix()
      this.mesh.setMatrixAt(n, this.dummy.matrix)
      c.set(kind === 0 ? 0xffffff : kind === 1 ? 0xffd34d : 0xff3b30)
      this.mesh.setColorAt(n, c)
    }
    this.mesh.instanceMatrix.needsUpdate = true
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
  }

  tick(dt: number) {
    this.time += dt
    if (this.mode === 'off') return
    this.mat.opacity = 0.55 + 0.4 * (0.5 + 0.5 * Math.sin(this.time * 4.2))
  }

  dispose() { this.board.group.remove(this.mesh); this.mesh.geometry.dispose(); this.mat.dispose() }
}
