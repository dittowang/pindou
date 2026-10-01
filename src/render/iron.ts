import * as THREE from 'three'
import { IRON_PLATE } from '../sim/melt'
import { bakeBrushedMetal } from './textures'

/** Dial settings: soleplate set-points (°C). Chinese shops run "max" for hole-free work, Perler says medium. */
export const DIAL = [
  { id: 'low', zh: '低温', t: 125, dots: 1 },
  { id: 'mid', zh: '中温', t: 145, dots: 2 },
  { id: 'high', zh: '高温', t: 170, dots: 3 },
] as const
export type DialId = (typeof DIAL)[number]['id']

export interface ThermoEvents { click: () => void; ready: () => void }

/**
 * Soleplate thermostat of a small 400 W bead iron: heats ≈ 9 °C/s, a bang-bang thermostat with hysteresis
 * ("the light goes out → the iron is up to temperature"), and heat is drawn away whenever it presses on beads.
 */
export class Thermostat {
  plateT = 23
  setpoint = 145
  heater = false
  on = false
  private ready = false
  private ambient = 23
  events: Partial<ThermoEvents> = {}

  setSet(t: number) { this.setpoint = t; this.ready = this.plateT >= t - 3 }

  /** `drawn` = °C/s the beads/stone are currently pulling out of the plate */
  step(dt: number, drawn: number) {
    if (!this.on) { this.plateT += (this.ambient - this.plateT) * (1 - Math.exp(-dt / 160)); this.heater = false; return }
    const wasHeater = this.heater
    if (this.plateT < this.setpoint - 5) this.heater = true
    else if (this.plateT > this.setpoint + 3) this.heater = false
    this.plateT += ((this.heater ? 9.5 : 0) - 0.012 * (this.plateT - this.ambient) - drawn) * dt
    if (wasHeater !== this.heater) this.events.click?.()
    if (!this.ready && this.plateT >= this.setpoint - 2) { this.ready = true; this.events.ready?.() }
  }
  get isReady() { return this.on && this.plateT >= this.setpoint - 6 }
}

/** Soleplate half-width at model z (nose toward −z): straight sides, then the same quadratic curve the plate outline uses. */
function plateHalfWidth(z: number, hx: number, hy: number): number {
  const sh = hy * 0.18
  if (z >= -sh) return hx
  if (z <= -hy) return hx * 0.18
  const target = -z
  let lo = 0, hi = 1
  for (let i = 0; i < 24; i++) {
    const t = (lo + hi) / 2
    const y = (1 - t) * (1 - t) * sh + 2 * (1 - t) * t * hy * 0.7 + t * t * hy
    if (y < target) lo = t; else hi = t
  }
  const t = (lo + hi) / 2
  return (1 - t) * (1 - t) * hx + 2 * (1 - t) * t * hx * 0.9 + t * t * hx * 0.18
}

const sgnPow = (v: number, e: number) => Math.sign(v) * Math.pow(Math.abs(v), e)

/**
 * Iron hood lofted from superellipse cross-sections along the length: follows the soleplate outline (inset a little),
 * a hump over the middle sloping down to the nose, rounded ends. Smooth shading, flat underside.
 * Index groups: 0 = upper shell, 1 = lower shell (the parting line runs round the widest point).
 */
function loftBody(L: number, W: number, top: { z: number; y: number }[]): THREE.BufferGeometry {
  const hx = W / 2, hy = L / 2
  const y0 = 0.42
  const zRear = hy - 0.28, zNose = -hy + 0.3
  const yTop = (z: number) => {
    for (let i = 0; i < top.length - 1; i++) {
      const a = top[i], b = top[i + 1]
      if (z <= a.z && z >= b.z) return a.y + (b.y - a.y) * ((a.z - z) / (a.z - b.z))
    }
    return top[top.length - 1].y
  }
  const N = 52, SEG = 36
  const pos: number[] = []
  const endScale = (z: number) => {
    const rN = 1.15, rR = 1.0
    const dn = (z - zNose) / rN, dr = (zRear - z) / rR
    let e = 1
    if (dn < 1) e = Math.min(e, Math.sqrt(Math.max(0, 1 - (1 - dn) * (1 - dn))))
    if (dr < 1) e = Math.min(e, Math.sqrt(Math.max(0, 1 - (1 - dr) * (1 - dr))))
    return 0.22 + 0.78 * e
  }
  for (let i = 0; i < N; i++) {
    const z = zNose + (zRear - zNose) * (1 - Math.cos((Math.PI * i) / (N - 1))) / 2
    const f = endScale(z)
    const w = Math.max(0.28, plateHalfWidth(z, hx, hy) - 0.2) * f
    const h = Math.max(0.3, yTop(z) - y0) * (0.35 + 0.65 * f)
    const yc = y0 + h / 2
    for (let k = 0; k < SEG; k++) {
      const a = (k / SEG) * Math.PI * 2
      const c = Math.cos(a), sn = Math.sin(a)
      const x = w * sgnPow(c, 0.58) * (1 - 0.16 * Math.max(0, sn) * Math.max(0, sn))
      const y = yc + (h / 2) * sgnPow(sn, sn > 0 ? 0.62 : 0.26)
      pos.push(x, y, z)
    }
  }
  const upper: number[] = [], lower: number[] = []
  for (let i = 0; i < N - 1; i++) {
    for (let k = 0; k < SEG; k++) {
      const k2 = (k + 1) % SEG
      const A = i * SEG + k, B = i * SEG + k2, C = (i + 1) * SEG + k, D = (i + 1) * SEG + k2
      const dst = k < SEG / 2 ? upper : lower
      dst.push(A, B, C, B, D, C)
    }
  }
  // end caps: a centre vertex per end
  const nose = pos.length / 3
  const sumRing = (i: number) => {
    let sy = 0
    for (let k = 0; k < SEG; k++) sy += pos[(i * SEG + k) * 3 + 1]
    return sy / SEG
  }
  pos.push(0, sumRing(0), pos[2])
  const rear = pos.length / 3
  pos.push(0, sumRing(N - 1), pos[((N - 1) * SEG) * 3 + 2])
  for (let k = 0; k < SEG; k++) {
    const k2 = (k + 1) % SEG
    const dst = k < SEG / 2 ? upper : lower
    dst.push(nose, k2, k)
    dst.push(rear, (N - 1) * SEG + k, (N - 1) * SEG + k2)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex([...upper, ...lower])
  g.addGroup(0, upper.length, 0)
  g.addGroup(upper.length, lower.length, 1)
  g.computeVertexNormals()
  return g
}

/** A small constant-temperature bead iron (拼豆熨斗): polished pointed soleplate, a two-tone plastic hood that slopes down
 *  to the nose, a loop handle, a temperature dial and a red heater light. Local frame: soleplate bottom = y 0, nose toward −z. */
export class IronModel {
  readonly group = new THREE.Group()
  private ledMat: THREE.MeshStandardMaterial
  private knob: THREE.Group

  constructor(renderer: THREE.WebGLRenderer) {
    const { L, W } = IRON_PLATE
    const brushed = bakeBrushedMetal(renderer)
    const steel = new THREE.MeshPhysicalMaterial({
      color: 0xe9ebed, metalness: 1, roughness: 0.34, roughnessMap: brushed.roughness, normalMap: brushed.normal,
      normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 1.25,
    })
    const hood = new THREE.MeshPhysicalMaterial({ color: 0xa8d2c0, roughness: 0.42, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.28 })
    const base = new THREE.MeshPhysicalMaterial({ color: 0xf0ede6, roughness: 0.46, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.32 })
    const grip = new THREE.MeshPhysicalMaterial({ color: 0x3d3a42, roughness: 0.58, clearcoat: 0.18, clearcoatRoughness: 0.5 })
    const ink = new THREE.MeshStandardMaterial({ color: 0x2b2a2e, roughness: 0.6 })

    // ---- soleplate: pentagon with a pointed nose, bevelled
    const hx = W / 2, hy = L / 2
    const s2 = new THREE.Shape()
    s2.moveTo(-hx, -hy)
    s2.lineTo(hx, -hy)
    s2.lineTo(hx, hy * 0.18)
    s2.quadraticCurveTo(hx * 0.9, hy * 0.7, hx * 0.18, hy)
    s2.lineTo(-hx * 0.18, hy)
    s2.quadraticCurveTo(-hx * 0.9, hy * 0.7, -hx, hy * 0.18)
    s2.lineTo(-hx, -hy)
    const plateGeo = new THREE.ExtrudeGeometry(s2, { depth: 0.3, bevelEnabled: true, bevelSize: 0.1, bevelThickness: 0.08, bevelSegments: 3, curveSegments: 14 })
    plateGeo.rotateX(-Math.PI / 2)            // shape y (forward) → world −z, extrusion → +y
    plateGeo.translate(0, 0.08, 0)
    const plate = new THREE.Mesh(plateGeo, steel)
    plate.castShadow = true
    this.group.add(plate)

    // ---- hood: top line (z, y) from the rear to the nose
    const top = [
      { z: hy - 0.28, y: 2.2 }, { z: 3.05, y: 2.95 }, { z: 2.0, y: 3.3 }, { z: 0.6, y: 3.3 },
      { z: -0.8, y: 3.0 }, { z: -2.2, y: 2.2 }, { z: -hy + 0.3, y: 1.2 },
    ]
    const ySurf = (z: number) => {
      for (let i = 0; i < top.length - 1; i++) {
        const a = top[i], b = top[i + 1]
        if (z <= a.z && z >= b.z) return a.y + (b.y - a.y) * ((a.z - z) / (a.z - b.z))
      }
      return top[top.length - 1].y
    }
    const body = new THREE.Mesh(loftBody(L, W, top), [hood, base])
    body.castShadow = true
    this.group.add(body)

    // ---- loop handle: a flat-ish strap over the middle, legs sunk into the hood
    const path = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 2.6, 1.75), new THREE.Vector3(0, 3.55, 1.62), new THREE.Vector3(0, 4.45, 1.0),
      new THREE.Vector3(0, 4.75, 0.2), new THREE.Vector3(0, 4.4, -0.45), new THREE.Vector3(0, 3.5, -0.78), new THREE.Vector3(0, 2.5, -0.85),
    ], false, 'catmullrom', 0.5)
    const handle = new THREE.Mesh(new THREE.TubeGeometry(path, 48, 0.3, 14, false), grip)
    handle.scale.x = 1.55
    handle.castShadow = true
    this.group.add(handle)

    // ---- temperature dial on the rear shoulder (tilted to the slope), three dots round it, heater light beside it
    const dz = 2.85
    const slope = (ySurf(dz - 0.1) - ySurf(dz + 0.1)) / 0.2          // dy/dz
    const pivot = new THREE.Group()
    pivot.position.set(0, ySurf(dz) - 0.05, dz)
    pivot.rotation.x = -Math.atan(-slope) * 1
    this.group.add(pivot)
    this.knob = new THREE.Group()
    const knobBody = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.56, 0.3, 32), base)
    knobBody.position.y = 0.15
    const knobCap = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.46, 0.08, 32), hood)
    knobCap.position.y = 0.32
    const notch = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.04, 0.42), ink)
    notch.position.set(0, 0.37, -0.2)
    this.knob.add(knobBody, knobCap, notch)
    pivot.add(this.knob)
    for (let i = 0; i < 3; i++) {
      const a = -0.9 + i * 0.9
      const dot = new THREE.Mesh(new THREE.CylinderGeometry(0.045 + i * 0.02, 0.045 + i * 0.02, 0.03, 12), ink)
      dot.position.set(Math.sin(a) * 0.92, 0.005, -Math.cos(a) * 0.92)
      pivot.add(dot)
    }
    this.ledMat = new THREE.MeshStandardMaterial({ color: 0x4a1a14, emissive: 0xff3a1a, emissiveIntensity: 0, roughness: 0.25 })
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 10), this.ledMat)
    led.scale.y = 0.5
    led.position.set(1.15, ySurf(dz - 0.1) - 0.05, dz - 0.1)
    led.rotation.x = pivot.rotation.x
    this.group.add(led)
    this.group.name = 'iron'
  }

  setLight(on: boolean) { this.ledMat.emissiveIntensity = on ? 3 : 0 }
  setDial(idx: number) { this.knob.rotation.y = -(-0.9 + idx * 0.9) }
}
