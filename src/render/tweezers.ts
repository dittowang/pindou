import * as THREE from 'three'
import { bakeBrushedMetal } from './textures'

/**
 * Bead tweezers: stainless steel, ~12 cm, flat tapering blades with a sprung bend at the back.
 * Local frame: the TIP MIDPOINT is the origin, the body extends along +Z, the blades close along X.
 * `setGap()` swings the two blades about the back hinge.
 */
export class Tweezers {
  readonly group = new THREE.Group()
  readonly length = 10.5
  private armL: THREE.Group
  private armR: THREE.Group
  private hinge: THREE.Mesh
  private gap = 1.2

  constructor(renderer: THREE.WebGLRenderer, tint = 0xc4c8cd) {
    const L = this.length
    const brushed = bakeBrushedMetal(renderer)
    const mat = new THREE.MeshPhysicalMaterial({
      color: tint, metalness: 1, roughness: 0.4, roughnessMap: brushed.roughness,
      normalMap: brushed.normal, normalScale: new THREE.Vector2(0.55, 0.55),
      anisotropy: 0.75, anisotropyRotation: 0, envMapIntensity: 1.05,
    })
    const armGeo = buildBlade(L)
    this.armL = new THREE.Group()
    this.armR = new THREE.Group()
    for (const [arm, sx] of [[this.armL, -1], [this.armR, 1]] as const) {
      const m = new THREE.Mesh(armGeo, mat)
      m.castShadow = true
      m.scale.x = sx   // mirror (blade is modelled for +x)
      if (sx < 0) m.material = mat
      arm.add(m)
      arm.position.set(0, 0, L)   // pivot at the hinge
      m.position.set(0, 0, -L)
      this.group.add(arm)
    }
    // the folded spring at the back
    this.hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.2, 18, 1, false), mat)
    this.hinge.rotation.z = Math.PI / 2
    this.hinge.rotation.y = 0
    this.hinge.scale.set(0.5, 1, 1)
    this.hinge.position.set(0, 0, L + 0.05)
    this.hinge.castShadow = true
    this.group.add(this.hinge)
    this.setGap(this.gap)
    this.group.name = 'tweezers'
  }

  /** distance between the two tips (cm) */
  setGap(g: number) {
    this.gap = Math.max(0, g)
    const a = Math.asin(Math.min(0.9, (this.gap / 2) / this.length))
    this.armL.rotation.y = a
    this.armR.rotation.y = -a
  }
  getGap() { return this.gap }
}

/**
 * One blade, modelled in the +x half. Tapered from a 4 mm-wide grip down to a 0.45 mm tip,
 * 0.03 cm thick with softly rounded edges, slight bow. UV.u runs along the length (brushed grain).
 */
function buildBlade(L: number): THREE.BufferGeometry {
  const n = 40
  const prof = 8                   // points in the rounded cross-section
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n                // 0 at tip, 1 at hinge
    const z = t * L
    const w = (0.045 + (0.42 - 0.045) * Math.pow(t, 0.85)) / 2  // half width: needle-fine tip, 4 mm grip
    const th = 0.016 + 0.012 * t                                  // half thickness
    const bow = 0
    // slightly dished flat tip: inner face is the gripping face (towards -x)
    const cx = 0.12 * Math.sin(t * Math.PI)   // blades bow gently outward: rolling reflections down the length
    for (let k = 0; k < prof; k++) {
      const a = (k / prof) * Math.PI * 2
      // rounded rectangle via superellipse-ish mapping
      const ca = Math.cos(a), sa = Math.sin(a)
      const px = Math.sign(ca) * Math.pow(Math.abs(ca), 0.5) * w
      const py = Math.sign(sa) * Math.pow(Math.abs(sa), 0.5) * th
      pos.push(w + px + cx, py + bow, z)
      // normal ≈ gradient of the superellipse
      const nx = Math.sign(ca) * Math.pow(Math.abs(ca), 1.5) / w
      const ny = Math.sign(sa) * Math.pow(Math.abs(sa), 1.5) / th
      const l = Math.hypot(nx, ny) || 1
      nor.push(nx / l, ny / l, 0)
      uv.push(t, k / prof)
    }
  }
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < prof; k++) {
      const a = i * prof + k, b = i * prof + ((k + 1) % prof)
      const c = (i + 1) * prof + k, d = (i + 1) * prof + ((k + 1) % prof)
      idx.push(a, c, b, b, c, d)
    }
  }
  // tip cap
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}
