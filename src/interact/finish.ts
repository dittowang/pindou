import * as THREE from 'three'
import type { World } from '../app/world'
import type { AudioEngine } from '../audio/audio'
import type { IronController } from './iron'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { clamp, smoothstep } from '../lib/rng'
import { bakeWood } from '../render/textures'
import { finishEnv } from '../render/beadFinish'
import { PALETTE } from '../config/palette'

export type Display = 'table' | 'keychain' | 'frame'

/**
 * The reveal: the finished piece is flipped to show its good side, then shown lying on the table, hanging from a
 * keychain (a bead is drilled out for the ring — and may crack), or standing in a small wooden frame.
 */
export class FinishController {
  active = false
  display: Display = 'table'
  readonly hole: { i: number; j: number } | null = null
  cracked = false
  private hang = new THREE.Group()
  private chain = new THREE.Group()
  private frame: THREE.Group | null = null
  private frameWood: ReturnType<typeof bakeWood> | null = null
  private backdrop: THREE.Mesh | null = null
  private piece: THREE.Group | null = null
  private t = 0
  private swing = { a: 0.0, v: 0 }
  private from = { y: 0, rx: 0, pos: new THREE.Vector3() }
  private target = { y: 0, rx: 0, pos: new THREE.Vector3() }
  private tween = 1
  private holeLocal = new THREE.Vector3()
  private holeInfo: { i: number; j: number } | null = null
  onChange: (() => void) | null = null
  private thick = 0.3
  /** special beads in the piece → which party tricks apply */
  specials = { glow: false, uv: false, warm: false }
  /** lamp tricks: target (0/1) and eased value */
  private lamp = { dark: [0, 0], uv: [0, 0], warm: [0, 0] }
  private lightBase: { sun: number; env: number; hemi: number } | null = null
  private uvLight: THREE.PointLight | null = null
  private coldT: Float32Array | null = null

  constructor(private w: World, private audio: AudioEngine, private iron: IronController) {
    w.scene.add(this.hang)
    this.hang.visible = false
  }

  get pieceGroup() { return this.piece }
  get holeCell() { return this.holeInfo }

  /** which special bead lines the finished piece contains */
  private scanSpecials() {
    const p = this.w.pegs
    const sp = { glow: false, uv: false, warm: false }
    for (let k = 0; k < p.occupied.length; k++) {
      if (!p.occupied[k]) continue
      const f = PALETTE[p.colorCode[k]]?.finish
      if (f === 'glow') sp.glow = true
      else if (f === 'photochromic') sp.uv = true
      else if (f === 'thermochromic') sp.warm = true
    }
    this.specials = sp
  }

  /** switch a lamp trick on/off (eased in `update`) */
  setLamp(kind: 'dark' | 'uv' | 'warm', on: boolean) {
    this.lamp[kind][0] = on ? 1 : 0
    // the UV lamp and the dark room go together: a blacklight is only convincing in a dim room
    if (kind === 'uv' && on) this.lamp.dark[0] = Math.max(this.lamp.dark[0], 0.0)
    this.onChange?.()
  }
  lampOn(kind: 'dark' | 'uv' | 'warm') { return this.lamp[kind][0] > 0.5 }

  private resetLamps(instant: boolean) {
    for (const k of ['dark', 'uv', 'warm'] as const) { this.lamp[k][0] = 0; if (instant) this.lamp[k][1] = 0 }
    if (instant) this.applyLamps()
  }

  private applyLamps() {
    const w = this.w
    const dark = this.lamp.dark[1], uv = this.lamp.uv[1], warm = this.lamp.warm[1]
    finishEnv.value.set(uv, dark)
    this.lightBase ??= { sun: w.sun.intensity, env: w.scene.environmentIntensity, hemi: w.hemi.intensity }
    const base = this.lightBase
    // a dark room keeps ~3 % of its light; a UV lamp wants a dim room too (60 % down)
    const dim = Math.min(1, dark + 0.6 * uv)
    const k = 1 - 0.97 * dim
    w.sun.intensity = base.sun * k
    w.hemi.intensity = base.hemi * k
    w.scene.environmentIntensity = base.env * k
    if (uv > 0.01) {
      if (!this.uvLight) { this.uvLight = new THREE.PointLight(0x7b4dff, 0, 0, 2); w.scene.add(this.uvLight) }
      const c = new THREE.Vector3(); this.piece?.getWorldPosition(c)
      this.uvLight.position.set(c.x + 3, c.y + 12, c.z + 8)
      this.uvLight.intensity = 420 * uv
      this.uvLight.visible = true
    } else if (this.uvLight) this.uvLight.visible = false
    w.pegs.thermoBoost = warm
    this.coldT ??= new Float32Array(w.pegs.occupied.length).fill(23)
    w.pegs.setThermoFromTemps(this.iron.sim?.T ?? this.coldT)
  }

  enter() {
    this.active = true
    this.resetLamps(true)
    this.scanSpecials()
    const piece = this.iron.piece
    this.piece = piece
    this.thick = this.w.dims.bead.height * 0.55
    if (!piece) return
    this.display = 'table'
    this.ensureBackdrop()
    this.setDisplay('table', true)
    this.audio.impact('ui', 0.6, 1.5)
    this.audio.impact('ui', 0.5, 2.0)
  }

  exit() {
    this.active = false
    this.resetLamps(true)
    this.hang.visible = false
    if (this.backdrop) this.backdrop.visible = false
    if (this.frame) this.frame.visible = false
  }

  private ensureBackdrop() {
    if (this.backdrop) return
    const mat = new THREE.MeshStandardMaterial({ color: 0xf0e9dc, roughness: 0.95 })
    this.backdrop = new THREE.Mesh(new THREE.PlaneGeometry(70, 40), mat)
    this.backdrop.position.set(0, 20, -5.6)
    this.backdrop.receiveShadow = true
    this.backdrop.visible = false
    this.w.scene.add(this.backdrop)
  }

  /** where the hole for a ring goes: one bead in from the top edge, near the middle */
  private pickHole(): { i: number; j: number } | null {
    const p = this.w.pegs, lay = this.w.board.layout
    let top = -1
    for (let j = 0; j < lay.rows && top < 0; j++) for (let i = 0; i < lay.cols; i++) if (p.occupied[j * lay.cols + i]) { top = j; break }
    if (top < 0) return null
    const cols: number[] = []
    for (let i = 0; i < lay.cols; i++) if (p.occupied[top * lay.cols + i]) cols.push(i)
    const c = cols[Math.floor(cols.length / 2)]
    const occ = (i: number, j: number) => i >= 0 && j >= 0 && i < lay.cols && j < lay.rows && p.occupied[j * lay.cols + i]
    if (occ(c, top + 1) && occ(c - 1, top + 1) && occ(c + 1, top + 1)) return { i: c, j: top + 1 }
    return { i: c, j: top }
  }

  /** punch the hole (once) — brittle, over-melted pieces sometimes crack */
  drill() {
    if (this.holeInfo) return
    const h = this.pickHole()
    if (!h) return
    const p = this.w.pegs, lay = this.w.board.layout, d = this.w.dims
    const k = h.j * lay.cols + h.i
    const u = Math.max(p.meltTop[k], p.meltBot[k])
    const crackChance = clamp(0.04 + 0.5 * smoothstep(1.05, 1.5, u) + 0.35 * Math.abs(this.w.pegs.mats.uniforms.uBend.value) * 120, 0, 0.8)
    p.remove(h.i, h.j)
    this.holeInfo = h
    this.cracked = Math.random() < crackChance
    if (this.cracked) {
      const above = { i: h.i, j: h.j - 1 }
      if (above.j >= 0 && p.occupied[above.j * lay.cols + above.i]) p.remove(above.i, above.j)
    }
    p.markDirty()
    // hole position in the piece's local frame (before any display rotation)
    this.holeLocal.set((h.i - (lay.cols - 1) / 2) * d.pitch, 0, (h.j - (lay.rows - 1) / 2) * d.pitch)
    this.audio.impact('tableKnock', 0.5, 2.6)
    this.audio.impact('peg', 0.9, 1.9)
    this.onChange?.()
  }

  setDisplay(d: Display, instant = false) {
    this.display = d
    const piece = this.piece
    if (!piece) return
    const w = this.w
    this.from.pos.copy(piece.position); this.from.rx = piece.rotation.x
    this.hang.visible = false
    if (this.frame) this.frame.visible = false
    if (this.backdrop) this.backdrop.visible = d !== 'table'
    const lift = this.w.board.plateTopY + this.w.dims.bead.height / 2   // mesh offset inside the piece group
    void lift
    if (d === 'table') {
      this.target.rx = 0
      this.target.pos.set(0, this.thick / 2 + 0.02, 1)
      // put the piece back in the scene root if it was hanging
      if (piece.parent !== w.scene) w.scene.attach(piece)
    } else if (d === 'keychain') {
      if (!this.holeInfo) this.drill()
      this.buildHang()
      this.hang.visible = true
      this.hang.attach(piece)
      // the group hangs from the hole; the piece centre sits below it
      this.target.rx = Math.PI / 2
      this.target.pos.set(-this.holeLocal.x, this.holeLocal.z, 0)
      this.swing.a = 0.55; this.swing.v = 0
    } else {
      this.buildFrame()
      this.frame!.visible = true
      this.frame!.attach(piece)
      this.target.rx = Math.PI / 2
      this.target.pos.set(0, 0.3, 0.1)
    }
    this.tween = instant ? 1 : 0
    if (instant) { piece.rotation.x = this.target.rx; piece.position.copy(this.target.pos) }
    this.onChange?.()
  }

  private buildHang() {
    const w = this.w
    this.hang.clear()
    const metal = new THREE.MeshPhysicalMaterial({ color: 0xcfd3d8, metalness: 1, roughness: 0.25, envMapIntensity: 1.3 })
    const gold = new THREE.MeshPhysicalMaterial({ color: 0xd8b36a, metalness: 1, roughness: 0.3, envMapIntensity: 1.2 })
    // split ring through the hole
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.07, 10, 36), gold)
    ring.rotation.y = Math.PI / 2
    ring.position.set(0, 0.25, 0)
    ring.castShadow = true
    this.hang.add(ring)
    // ball chain up to a brass hook
    const link = new THREE.SphereGeometry(0.16, 12, 10)
    const n = 9
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(link, metal)
      m.position.set(0, 0.9 + i * 0.3, 0)
      m.castShadow = true
      this.hang.add(m)
    }
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.1, 10, 28, Math.PI * 1.35), gold)
    hook.position.set(0, 0.9 + n * 0.3 + 0.35, 0)
    hook.rotation.set(0, 0, Math.PI * 0.55)
    hook.castShadow = true
    this.hang.add(hook)
    // the hole is the pivot; the hook point is ~4 cm above it
    const anchorY = 9.5
    this.hang.position.set(0, anchorY, -4.4)
    void w
  }

  private buildFrame() {
    if (this.frame) { this.w.scene.remove(this.frame); this.frame = null }
    const b = this.w.board.size
    const fw = Math.max(b.x, b.y) + 3.2, fh = fw * 1.18
    const g = new THREE.Group()
    // real grain: a small plank baked on the GPU, stained walnut, with a satin varnish
    this.frameWood ??= bakeWood(this.w.gfx.renderer, new THREE.Vector2(18, 13), 1024)
    const fm = this.frameWood
    const wood = new THREE.MeshPhysicalMaterial({
      color: 0xa97a52, map: fm.map, roughnessMap: fm.roughnessMap, normalMap: fm.normalMap, normalScale: new THREE.Vector2(0.6, 0.6),
      roughness: 1, clearcoat: 0.3, clearcoatRoughness: 0.35,
    })
    const mat = new THREE.MeshStandardMaterial({ color: 0xf4efe6, roughness: 0.95 })
    const t = 1.0, depth = 1.1
    const bars: [number, number, number, number, number][] = [
      [fw + t * 2, t, depth, 0, fh / 2 + t / 2], [fw + t * 2, t, depth, 0, -fh / 2 - t / 2],
      [t, fh, depth, -fw / 2 - t / 2, 0], [t, fh, depth, fw / 2 + t / 2, 0],
    ]
    let bi = 0
    for (const [bw, bh, bd, x, y] of bars) {
      const geo = new RoundedBoxGeometry(bw, bh, bd, 2, 0.1)
      // map the plank so the grain runs along the bar's length at true scale (18 × 13 cm texture)
      const uv = geo.attributes.uv
      const long = Math.max(bw, bh), vertical = bh > bw
      for (let k = 0; k < uv.count; k++) {
        const a = uv.getX(k), b = uv.getY(k)
        const u = a * (vertical ? bh : bw) / 18, v = b * (vertical ? bw : bh) / 13
        // (u runs along the grain: the long axis; a different strip of the plank for every bar)
        uv.setXY(k, vertical ? v + 0.2 * bi : u + 0.05 * bi, vertical ? u + 0.05 * bi : v + 0.2 * bi)
      }
      void long
      bi++
      const m = new THREE.Mesh(geo, wood)
      m.position.set(x, y, 0); m.castShadow = true; m.receiveShadow = true
      g.add(m)
    }
    const back = new THREE.Mesh(new THREE.BoxGeometry(fw, fh, 0.15), mat)
    back.position.set(0, 0, -depth / 2 + 0.2)
    back.receiveShadow = true
    g.add(back)
    // glass
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(fw, fh), new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: 0.06, metalness: 0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, clearcoat: 1, specularIntensity: 1 }))
    glass.position.set(0, 0, depth / 2 - 0.1)
    glass.renderOrder = 8
    glass.userData.noAO = true
    g.add(glass)
    g.position.set(0, fh / 2 + t + 0.05, -2.6)
    g.rotation.x = -0.12
    this.w.scene.add(g)
    this.frame = g
  }

  update(dt: number) {
    if (!this.active || !this.piece) return
    this.t += dt
    let moving = false
    for (const k of ['dark', 'uv', 'warm'] as const) {
      const l = this.lamp[k]
      if (Math.abs(l[0] - l[1]) > 0.002) { l[1] += (l[0] - l[1]) * (1 - Math.exp(-(k === 'warm' ? 1.6 : 3.2) * dt)); moving = true }
      else l[1] = l[0]
    }
    if (moving) this.applyLamps()
    const piece = this.piece
    if (this.tween < 1) {
      this.tween = Math.min(1, this.tween + dt / 1.1)
      const e = this.tween * this.tween * (3 - 2 * this.tween)
      piece.rotation.x = THREE.MathUtils.lerp(this.from.rx, this.target.rx, e)
      if (this.display === 'table') {
        const arc = Math.sin(Math.PI * this.tween) * 4
        piece.position.lerpVectors(this.from.pos, this.target.pos, e)
        piece.position.y += arc
      } else piece.position.lerp(this.target.pos, 1 - Math.exp(-8 * dt))
    }
    // the slab slides away from under a finished piece
    const slab = this.iron.slab
    if (slab) { slab.position.x += (-40 - slab.position.x) * (1 - Math.exp(-3 * dt)); if (slab.position.x < -38) slab.visible = false }
    if (this.display === 'keychain' && this.hang.visible) {
      // damped pendulum, a little restless
      const g = 981, L = 9
      const acc = -(g / L) * Math.sin(this.swing.a) - 1.9 * this.swing.v
      this.swing.v += acc * dt
      this.swing.a += this.swing.v * dt
      this.hang.rotation.z = this.swing.a
    }
  }

  /** camera framing for each way of showing the piece */
  shotFor(d: Display): { target: THREE.Vector3; pitch: number; fitW: number; fitH: number } {
    const b = this.w.board.size
    const S = Math.max(b.x, b.y)
    if (d === 'keychain') return { target: new THREE.Vector3(0, 5.2, -4), pitch: 0.28, fitW: S + 9, fitH: S + 8 }
    if (d === 'frame') return { target: new THREE.Vector3(0, S * 0.7 + 1.9, -2.4), pitch: 0.5, fitW: S + 14, fitH: S + 12 }
    return { target: new THREE.Vector3(0, 0, 1), pitch: 1.0, fitW: S + 8, fitH: S + 5 }
  }

  /** camera placement for the card photo (called by Studio.photo) */
  photoFrame(cam: THREE.PerspectiveCamera) {
    const p = this.w.pegs, lay = this.w.board.layout, d = this.w.dims
    let minI = 99, maxI = -1, minJ = 99, maxJ = -1
    for (let k = 0; k < p.occupied.length; k++) if (p.occupied[k]) { const i = k % lay.cols, j = (k / lay.cols) | 0; minI = Math.min(minI, i); maxI = Math.max(maxI, i); minJ = Math.min(minJ, j); maxJ = Math.max(maxJ, j) }
    const wcm = Math.max(2, (maxI - minI + 1) * d.pitch), hcm = Math.max(2, (maxJ - minJ + 1) * d.pitch)
    const S = Math.max(wcm, hcm) + (this.display === 'frame' ? 4 : 0)
    const dist = (S / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2))) * 1.65
    const c = new THREE.Vector3()
    if (this.piece) this.piece.getWorldPosition(c)
    if (this.display === 'table') {
      const off = new THREE.Vector3((((minI + maxI) / 2) - (lay.cols - 1) / 2) * d.pitch, 0, (((minJ + maxJ) / 2) - (lay.rows - 1) / 2) * d.pitch)
      c.add(off)
      cam.position.set(c.x + dist * 0.12, c.y + dist * 0.88, c.z + dist * 0.46)
    } else {
      cam.position.set(c.x + dist * 0.06, c.y + dist * 0.12, c.z + dist)
    }
    cam.lookAt(c)
  }

  /** a nudge on the keychain */
  poke() { if (this.display === 'keychain') { this.swing.v += (Math.random() < 0.5 ? -1 : 1) * 3.2; this.audio.impact('tweezerTick', 0.4, 1.3) } }
}
