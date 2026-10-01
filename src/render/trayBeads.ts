import * as THREE from 'three'
import type { Dims } from '../config/physical'
import type { Tray } from './tray'
import type { TrayModel } from '../interact/trayModel'
import { buildBeadGeometry } from './beadGeometry'
import { realBeadAlbedo } from './beadMaterial'
import { FINISH_VERT_PARS, FINISH_VERT_MAIN, FINISH_FRAG_PARS, FINISH_COLOR, FINISH_ROUGH, FINISH_EMISSIVE, finishEnv, addFinishAttributes, writeFinish } from './beadFinish'

/** Plastic for beads that are not on a peg: the same satin PE as the pegged ones (without the melt), with the special-finish looks. */
export function createBeadMaterial(): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0, ior: 1.5, specularIntensity: 0.85 })
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uFinEnv = finishEnv
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${FINISH_VERT_PARS}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${FINISH_VERT_MAIN}`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FINISH_FRAG_PARS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FINISH_COLOR}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${FINISH_ROUGH}`)
      .replace('#include <emissivemap_fragment>', /* glsl */`
      #include <emissivemap_fragment>
      {
        vec3 vv = normalize(vViewPosition);
        float ndv = clamp(abs(dot(normalize(vNormal), vv)), 0.0, 1.0);
        float rim = pow(1.0 - ndv, 2.0);
        totalEmissiveRadiance += diffuseColor.rgb * (0.10 * (0.35 + rim));
        ${FINISH_EMISSIVE}
      }`)
  }
  m.customProgramCacheKey = () => 'bead-plain-fin'
  return m
}

/** how the standing beads of one compartment are laid out: an n × n grid, hole up */
export function wellGrid(dims: Dims) {
  const d = dims.bead.outerR * 2
  const gap = dims.id === 'mini' ? 0.05 : 0.07
  const bp = d + gap
  const n = Math.max(2, Math.floor((dims.tray.well - 0.3 + gap) / bp))
  return { n, bp, cap: n * n }
}

/** a tiny deterministic hash → [0,1) */
const hash = (a: number, b: number) => {
  let x = (Math.imul(a + 1, 374761393) + Math.imul(b + 1, 668265263)) | 0
  x = Math.imul(x ^ (x >>> 13), 1274126177)
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296
}

/**
 * The beads in the sorting tray, drawn from a TrayModel: each compartment holds a neat n × n grid of beads standing
 * with their holes up, as in a real 立豆盘. Nothing here moves by itself; a bead picked up simply leaves its cell and
 * the next one steps up (a short pop-in).
 */
export class TrayBeads {
  readonly mesh: THREE.InstancedMesh
  readonly ring: THREE.Mesh
  readonly grid: ReturnType<typeof wellGrid>
  private fin: ReturnType<typeof addFinishAttributes>
  private geo: THREE.BufferGeometry
  private mat: THREE.MeshPhysicalMaterial
  private ringMat: THREE.MeshBasicMaterial
  private base: Float32Array            // x, y, z of every slot (world)
  private tilt: Float32Array            // x, z, yaw of every slot
  private scale: Float32Array
  private target: Uint8Array
  private wellPal: Int16Array
  private seen = -1
  private time = 0
  private hover = { well: -1, cell: -1 }
  private m4 = new THREE.Matrix4()
  private q = new THREE.Quaternion()
  private e = new THREE.Euler()
  private p = new THREE.Vector3()
  private s = new THREE.Vector3()
  private col = new THREE.Color()

  constructor(private tray: Tray, private model: TrayModel, private dims: Dims) {
    this.grid = wellGrid(dims)
    const { cap } = this.grid
    const slots = tray.count * cap
    this.geo = buildBeadGeometry(dims, 16, 'low')
    this.fin = addFinishAttributes(this.geo, slots)
    this.mat = createBeadMaterial()
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, slots)
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(slots * 3), 3)
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.mesh.castShadow = true
    this.mesh.receiveShadow = true
    this.mesh.frustumCulled = false
    this.mesh.name = 'trayBeads'
    this.base = new Float32Array(slots * 3)
    this.tilt = new Float32Array(slots * 3)
    this.scale = new Float32Array(slots)
    this.target = new Uint8Array(slots)
    this.wellPal = new Int16Array(tray.count).fill(-1)
    const zero = new THREE.Matrix4().makeScale(0, 0, 0)
    const c = new THREE.Vector3()
    const { n, bp } = this.grid
    for (let w = 0; w < tray.count; w++) {
      tray.wellCenter(w, c)
      for (let cell = 0; cell < cap; cell++) {
        const slot = w * cap + cell
        const col = cell % n, row = Math.floor(cell / n)
        // a hair of looseness so the rows do not look machined
        const jx = (hash(slot, 1) - 0.5) * bp * 0.10, jz = (hash(slot, 2) - 0.5) * bp * 0.10
        this.base[slot * 3] = c.x + (col - (n - 1) / 2) * bp + jx
        this.base[slot * 3 + 1] = c.y + dims.bead.height / 2
        this.base[slot * 3 + 2] = c.z + (row - (n - 1) / 2) * bp + jz
        this.tilt[slot * 3] = (hash(slot, 3) - 0.5) * 0.035
        this.tilt[slot * 3 + 1] = (hash(slot, 4) - 0.5) * 0.035
        this.tilt[slot * 3 + 2] = hash(slot, 5) * Math.PI * 2
        this.mesh.setMatrixAt(slot, zero)
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true

    // the marker that shows which bead a click would take
    const r = dims.bead.outerR
    const rg = new THREE.RingGeometry(r * 1.05, r * 1.5, 28)
    rg.rotateX(-Math.PI / 2)
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false })
    this.ring = new THREE.Mesh(rg, this.ringMat)
    this.ring.renderOrder = 30
    this.ring.visible = false
    this.ring.userData.noAO = true
  }

  /** the group to add to the scene (beads + hover ring) */
  addTo(parent: THREE.Object3D) { parent.add(this.mesh, this.ring) }

  /** world position of the centre of a standing bead */
  cellWorld(well: number, cell: number, out = new THREE.Vector3()) {
    const slot = well * this.grid.cap + cell
    return out.set(this.base[slot * 3], this.base[slot * 3 + 1], this.base[slot * 3 + 2])
  }

  /** the standing bead of `well` nearest to a ground point, or −1 when the compartment is empty */
  nearestCell(well: number, x: number, z: number): number {
    const w = this.model.wells[well]
    if (!w || w.shown <= 0) return -1
    let best = -1, bd = Infinity
    const { cap } = this.grid
    for (let c = 0; c < cap; c++) {
      if (!w.cells[c]) continue
      const slot = well * cap + c
      const dx = this.base[slot * 3] - x, dz = this.base[slot * 3 + 2] - z
      const d = dx * dx + dz * dz
      if (d < bd) { bd = d; best = c }
    }
    return best
  }

  setHover(well: number, cell: number) { this.hover.well = well; this.hover.cell = cell }

  private applyColors(well: number) {
    const w = this.model.wells[well]
    const { cap } = this.grid
    for (let cell = 0; cell < cap; cell++) {
      const slot = well * cap + cell
      if (!w) continue
      this.col.setHex(w.hex)
      const hsl = { h: 0, s: 0, l: 0 }
      this.col.getHSL(hsl)
      // factory variation, as on the pegs
      hsl.l = Math.min(1, Math.max(0, hsl.l * (1 + (hash(slot, 6) - 0.5) * 0.05)))
      hsl.s = Math.min(1, Math.max(0, hsl.s * (1 + (hash(slot, 7) - 0.5) * 0.05)))
      this.col.setHSL(hsl.h, hsl.s, hsl.l)
      realBeadAlbedo(this.col)
      this.mesh.setColorAt(slot, this.col)
      writeFinish(this.fin, slot, w.pal)
    }
    this.mesh.instanceColor!.needsUpdate = true
  }

  /** follow the model */
  private sync() {
    if (this.model.version === this.seen) return
    this.seen = this.model.version
    const { cap } = this.grid
    for (let w = 0; w < this.tray.count; w++) {
      const data = this.model.wells[w]
      if (!data) {
        for (let c = 0; c < cap; c++) this.target[w * cap + c] = 0
        this.wellPal[w] = -1
        continue
      }
      if (this.wellPal[w] !== data.pal) { this.applyColors(w); this.wellPal[w] = data.pal }
      for (let c = 0; c < cap; c++) this.target[w * cap + c] = data.cells[c]
    }
  }

  update(dt: number) {
    this.time += dt
    this.sync()
    const n = this.scale.length
    let dirty = false
    for (let slot = 0; slot < n; slot++) {
      const s0 = this.scale[slot]
      let s = s0
      if (this.target[slot]) { if (s < 1) s = Math.min(1, s + dt / 0.16) } else s = 0
      if (s !== s0) { this.scale[slot] = s; dirty = true }
    }
    if (dirty) {
      for (let slot = 0; slot < n; slot++) {
        const s = this.scale[slot]
        if (s <= 0) { this.m4.makeScale(0, 0, 0) }
        else {
          const k = s < 1 ? 1 - Math.pow(1 - s, 3) : 1                    // ease-out
          this.p.set(this.base[slot * 3], this.base[slot * 3 + 1] + (1 - k) * 0.12, this.base[slot * 3 + 2])
          this.e.set(this.tilt[slot * 3], this.tilt[slot * 3 + 2], this.tilt[slot * 3 + 1])
          this.q.setFromEuler(this.e)
          this.s.setScalar(0.35 + 0.65 * k)
          this.m4.compose(this.p, this.q, this.s)
        }
        this.mesh.setMatrixAt(slot, this.m4)
      }
      this.mesh.instanceMatrix.needsUpdate = true
    }
    // hover ring
    const { well, cell } = this.hover
    if (well >= 0 && cell >= 0 && this.model.wells[well]?.cells[cell]) {
      const slot = well * this.grid.cap + cell
      this.ring.visible = true
      this.ring.position.set(this.base[slot * 3], this.base[slot * 3 + 1] + this.dims.bead.height / 2 + 0.02, this.base[slot * 3 + 2])
      const pulse = 1 + 0.12 * Math.sin(this.time * 7)
      this.ring.scale.setScalar(pulse)
    } else this.ring.visible = false
  }

  /** world y of the top of a standing bead (the plane the pointer works in) */
  get topY() { return this.tray.floorY + this.dims.bead.height }

  dispose() {
    this.mesh.parent?.remove(this.mesh)
    this.ring.parent?.remove(this.ring)
    this.geo.dispose()
    this.mat.dispose()
    this.ring.geometry.dispose()
    this.ringMat.dispose()
  }
}

