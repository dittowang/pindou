import * as THREE from 'three'
import type { Dims } from '../config/physical'
import { buildBeadGeometry } from './beadGeometry'
import { createBeadMaterial } from './trayBeads'
import { realBeadAlbedo } from './beadMaterial'
import { addFinishAttributes, writeFinish } from './beadFinish'

/** Beads that did not make it onto the piece (they stayed on the board, or came away with the paper): laid out in a tidy row on the table. */
export class Leftovers {
  readonly mesh: THREE.InstancedMesh
  private geo: THREE.BufferGeometry
  private mat: THREE.MeshPhysicalMaterial
  private fin: ReturnType<typeof addFinishAttributes>
  private col = new THREE.Color()
  private m = new THREE.Matrix4()
  private q = new THREE.Quaternion()

  constructor(private dims: Dims, readonly capacity = 600) {
    this.geo = buildBeadGeometry(dims, 14, 'low')
    this.fin = addFinishAttributes(this.geo, capacity)
    this.mat = createBeadMaterial()
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, capacity)
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3)
    this.mesh.castShadow = true
    this.mesh.receiveShadow = true
    this.mesh.frustumCulled = false
    this.mesh.count = 0
    this.mesh.name = 'leftovers'
    this.q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2)        // lying on their sides
  }

  /** lay them out left to right, `perRow` to a row, starting at (x0, z0) */
  show(list: { hex: number; code: number }[], x0: number, z0: number, perRow = 24) {
    const d = this.dims
    const n = Math.min(this.capacity, list.length)
    const step = d.bead.height + 0.09
    for (let k = 0; k < n; k++) {
      const row = Math.floor(k / perRow), col = k % perRow
      const rowLen = Math.min(perRow, n - row * perRow)
      this.m.compose(
        new THREE.Vector3(x0 + (col - (rowLen - 1) / 2) * step, d.bead.outerR, z0 + row * (d.bead.outerR * 2 + 0.1)),
        this.q, new THREE.Vector3(1, 1, 1))
      this.mesh.setMatrixAt(k, this.m)
      this.col.setHex(list[k].hex)
      realBeadAlbedo(this.col)
      this.mesh.setColorAt(k, this.col)
      writeFinish(this.fin, k, list[k].code)
    }
    this.mesh.count = n
    this.mesh.instanceMatrix.needsUpdate = true
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
  }

  clear() { this.mesh.count = 0 }

  dispose() {
    this.mesh.parent?.remove(this.mesh)
    this.geo.dispose()
    this.mat.dispose()
  }
}
