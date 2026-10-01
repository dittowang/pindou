import * as THREE from 'three'
import type { Dims } from '../config/physical'
import { cellX, cellZ, type BoardLayout } from './board'
import { buildBeadGeometry } from './beadGeometry'
import { createBeadMaterials, realBeadAlbedo, type BeadMaterialSet } from './beadMaterial'
import { addFinishAttributes, writeFinish } from './beadFinish'
import { mulberry32, randn, type Rng } from '../lib/rng'

/**
 * All beads currently threaded on the board: one InstancedMesh that only draws the beads that exist
 * (slots are compacted on removal). Per-cell arrays are indexed by cell (j * cols + i); GPU attributes by slot.
 * The melt simulation writes `meltTop` / `meltBot` (per cell) and calls `markDirty()`.
 */
export class PegBeads {
  readonly mesh: THREE.InstancedMesh
  readonly mats: BeadMaterialSet
  readonly cols: number
  readonly rows: number
  readonly occupied: Uint8Array
  readonly colorCode: Int16Array          // palette index, -1 = empty
  readonly meltTop: Float32Array
  readonly meltBot: Float32Array
  /** how far each bead sits up its peg (0 = seated), as a fraction of bead height */
  readonly lift: Float32Array
  /** sRGB hex of every placed bead (so a bead pulled off the board can be re-created in the tweezers) */
  readonly hex: Uint32Array
  readonly slotOf: Int32Array
  /** paper left stuck on a bead / lint ironed into it (0..1) */
  readonly resTop: Float32Array
  readonly resBot: Float32Array
  readonly lintTop: Float32Array
  readonly lintBot: Float32Array
  private cellOf: Int32Array
  private aBead: THREE.InstancedBufferAttribute
  private aTilt: THREE.InstancedBufferAttribute
  private yBase: number
  private dirty = true
  private colorDirty = true
  private tmpM = new THREE.Matrix4()
  private tmpC = new THREE.Color()
  private rng: Rng
  private fin: ReturnType<typeof addFinishAttributes>
  private thermo = new Set<number>()
  /** hand warmth etc.: floor for the thermochromic state of every bead (0..1) */
  thermoBoost = 0
  count = 0
  /** heat that softened the pegs under each bead (set by the iron controller; > 6 = welded to the board) */
  pegHeatOf?: (k: number) => number

  constructor(private layout: BoardLayout, plateTopY: number, seed: number, readonly dims: Dims) {
    this.cols = layout.cols
    this.rows = layout.rows
    const n = this.cols * this.rows
    this.rng = mulberry32(seed)
    this.occupied = new Uint8Array(n)
    this.colorCode = new Int16Array(n).fill(-1)
    this.meltTop = new Float32Array(n)
    this.meltBot = new Float32Array(n)
    this.lift = new Float32Array(n)
    this.hex = new Uint32Array(n)
    this.slotOf = new Int32Array(n).fill(-1)
    this.resTop = new Float32Array(n)
    this.resBot = new Float32Array(n)
    this.lintTop = new Float32Array(n)
    this.lintBot = new Float32Array(n)
    this.cellOf = new Int32Array(n).fill(-1)
    this.yBase = plateTopY + dims.bead.height / 2

    this.mats = createBeadMaterials(this.cols, this.rows, dims)
    const geo = buildBeadGeometry(dims, 24, 'high')
    this.mesh = new THREE.InstancedMesh(geo, this.mats.lit, n)
    this.mesh.count = 0
    this.mesh.customDepthMaterial = this.mats.depth
    this.mesh.castShadow = true
    this.mesh.receiveShadow = true
    this.mesh.frustumCulled = false
    this.mesh.name = 'pegBeads'
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)

    this.aBead = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4)
    this.aTilt = new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2)
    this.aBead.setUsage(THREE.DynamicDrawUsage)
    this.aTilt.setUsage(THREE.DynamicDrawUsage)
    geo.setAttribute('aBead', this.aBead)
    geo.setAttribute('aTilt', this.aTilt)
    this.fin = addFinishAttributes(geo, n)
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3)
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage)
  }

  cellIndex(i: number, j: number) { return j * this.cols + i }
  cellOfSlot(slot: number) { return this.cellOf[slot] }

  /** Thread a bead on a peg. `sloppiness` ≈ how carelessly it was seated (0..1) → tilt; `liftFrac` = how far it perches up the peg. */
  place(i: number, j: number, hex: number, code: number, sloppiness = 0.3, liftFrac = 0, tilt?: { x: number; z: number }): boolean {
    const k = this.cellIndex(i, j)
    if (this.occupied[k]) return false
    const slot = this.count++
    this.mesh.count = this.count
    this.slotOf[k] = slot
    this.cellOf[slot] = k
    const r = this.rng
    this.occupied[k] = 1
    this.colorCode[k] = code
    this.meltTop[k] = 0
    this.meltBot[k] = 0
    const seed = r()
    const lenScale = 1 + randn(r) * this.dims.bead.lengthSpread
    // factory colour variation: value ±2.5 %, a hair of hue
    this.tmpC.setHex(hex)
    const hsl = { h: 0, s: 0, l: 0 }
    this.tmpC.getHSL(hsl)
    hsl.l = Math.min(1, Math.max(0, hsl.l * (1 + randn(r) * 0.018)))
    hsl.s = Math.min(1, Math.max(0, hsl.s * (1 + randn(r) * 0.02)))
    hsl.h = (hsl.h + randn(r) * 0.0016 + 1) % 1
    this.tmpC.setHSL(hsl.h, hsl.s, hsl.l)
    realBeadAlbedo(this.tmpC)
    this.mesh.setColorAt(slot, this.tmpC)
    writeFinish(this.fin, slot, code)
    if (this.fin.aFin.getX(slot) === 4) this.thermo.add(k)
    // hole is wider than the peg → seated beads lean a little (≈ up to 5°)
    const lean = 0.012 + 0.04 * sloppiness
    const tx = tilt ? tilt.x : randn(r) * lean, tz = tilt ? tilt.z : randn(r) * lean
    this.aTilt.setXY(slot, tx, tz)
    this.aBead.setXYZW(slot, 0, 0, 1 + seed, lenScale)
    this.lift[k] = liftFrac
    this.hex[k] = hex
    const y = this.yBase + liftFrac * this.dims.bead.height
    this.tmpM.makeTranslation(cellX(i, this.cols, this.dims.pitch), y, cellZ(j, this.rows, this.dims.pitch))
    this.mesh.setMatrixAt(slot, this.tmpM)
    this.writeColorTex(k, hex)
    this.dirty = true
    this.colorDirty = true
    return true
  }

  /** world position of a seated bead's centre */
  cellPos(i: number, j: number, out = new THREE.Vector3()): THREE.Vector3 {
    const k = this.cellIndex(i, j)
    return out.set(cellX(i, this.cols, this.dims.pitch), this.yBase + this.lift[k] * this.dims.bead.height, cellZ(j, this.rows, this.dims.pitch))
  }
  tiltOf(i: number, j: number) {
    const slot = this.slotOf[this.cellIndex(i, j)]
    return slot < 0 ? { x: 0, z: 0 } : { x: this.aTilt.getX(slot), z: this.aTilt.getY(slot) }
  }

  /** raise / lower a seated bead along its peg (0 = all the way down, 1 = one bead height up) */
  setLift(i: number, j: number, frac: number): void {
    const k = this.cellIndex(i, j)
    const slot = this.slotOf[k]
    if (slot < 0) return
    this.lift[k] = frac
    this.tmpM.makeTranslation(cellX(i, this.cols, this.dims.pitch), this.yBase + frac * this.dims.bead.height, cellZ(j, this.rows, this.dims.pitch))
    this.mesh.setMatrixAt(slot, this.tmpM)
    this.dirty = true
  }

  /** push a bead that sits up its peg all the way down */
  reseat(i: number, j: number): void {
    const k = this.cellIndex(i, j)
    const slot = this.slotOf[k]
    if (slot < 0) return
    this.lift[k] = 0
    this.aTilt.setXY(slot, this.aTilt.getX(slot) * 0.25, this.aTilt.getY(slot) * 0.25)
    this.tmpM.makeTranslation(cellX(i, this.cols, this.dims.pitch), this.yBase, cellZ(j, this.rows, this.dims.pitch))
    this.mesh.setMatrixAt(slot, this.tmpM)
    this.dirty = true
  }

  remove(i: number, j: number): void {
    const k = this.cellIndex(i, j)
    const slot = this.slotOf[k]
    if (slot < 0) return
    const last = this.count - 1
    if (slot !== last) {
      // move the last bead into the hole so the draw range stays dense
      const lk = this.cellOf[last]
      this.mesh.getMatrixAt(last, this.tmpM)
      this.mesh.setMatrixAt(slot, this.tmpM)
      this.mesh.getColorAt(last, this.tmpC)
      this.mesh.setColorAt(slot, this.tmpC)
      this.aBead.setXYZW(slot, this.aBead.getX(last), this.aBead.getY(last), this.aBead.getZ(last), this.aBead.getW(last))
      this.aTilt.setXY(slot, this.aTilt.getX(last), this.aTilt.getY(last))
      this.fin.aFin.setXYZW(slot, this.fin.aFin.getX(last), this.fin.aFin.getY(last), 0, 0)
      this.fin.aAlt.setXYZ(slot, this.fin.aAlt.getX(last), this.fin.aAlt.getY(last), this.fin.aAlt.getZ(last))
      this.fin.aFin.needsUpdate = true; this.fin.aAlt.needsUpdate = true
      this.cellOf[slot] = lk
      this.slotOf[lk] = slot
    }
    this.cellOf[last] = -1
    this.count--
    this.mesh.count = this.count
    this.slotOf[k] = -1
    this.thermo.delete(k)
    this.occupied[k] = 0
    this.lift[k] = 0
    this.colorCode[k] = -1
    this.meltTop[k] = 0
    this.meltBot[k] = 0
    this.resTop[k] = 0; this.resBot[k] = 0; this.lintTop[k] = 0; this.lintBot[k] = 0
    ;(this.mats.colorTex.image.data as Uint8Array)[k * 4 + 3] = 0
    this.dirty = true
    this.colorDirty = true
  }

  private writeColorTex(k: number, hex: number) {
    const d = this.mats.colorTex.image.data as Uint8Array
    d[k * 4] = (hex >> 16) & 255
    d[k * 4 + 1] = (hex >> 8) & 255
    d[k * 4 + 2] = hex & 255
    d[k * 4 + 3] = 255
  }

  markDirty() { this.dirty = true }

  /** thermochromic beads change colour around 31 °C: 0 = room-temperature colour … 1 = warm colour */
  setThermoFromTemps(T: Float32Array) {
    let touched = false
    for (const k of this.thermo) {
      const slot = this.slotOf[k]
      if (slot < 0) continue
      const st = Math.max(this.thermoBoost, Math.min(1, Math.max(0, (T[k] - 28) / 6)))
      if (Math.abs(st - this.fin.aFin.getY(slot)) > 0.01) { this.fin.aFin.setY(slot, st); touched = true }
    }
    if (touched) this.fin.aFin.needsUpdate = true
  }

  /** push residue / lint marks to the shader */
  flushResidue() {
    const d = this.mats.resTex.image.data as Uint8Array
    for (let k = 0; k < this.resTop.length; k++) {
      d[k * 4] = Math.min(255, this.resTop[k] * 255)
      d[k * 4 + 1] = Math.min(255, this.lintTop[k] * 255)
      d[k * 4 + 2] = Math.min(255, this.resBot[k] * 255)
      d[k * 4 + 3] = Math.min(255, this.lintBot[k] * 255)
    }
    this.mats.resTex.needsUpdate = true
  }

  /** curl of the whole piece, cm of lift per cm² from the centre (0 = flat) */
  setBend(b: number) { this.mats.uniforms.uBend.value = b }
  /** set the cover imprint (kind 0 none / 1 weave / 2 dots) */
  setImprint(kind: number, strength: number) { this.mats.surf.value.set(kind, strength) }

  /** Push CPU-side melt state to the GPU. */
  flush(): void {
    if (this.dirty) {
      const a = this.aBead.array as Float32Array
      for (let s = 0; s < this.count; s++) {
        const k = this.cellOf[s]
        a[s * 4] = this.meltTop[k]
        a[s * 4 + 1] = this.meltBot[k]
      }
      this.aBead.needsUpdate = true
      this.aTilt.needsUpdate = true
      this.mesh.instanceMatrix.needsUpdate = true
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
      this.dirty = false
    }
    if (this.colorDirty) {
      this.mats.colorTex.needsUpdate = true
      this.colorDirty = false
    }
  }
}
