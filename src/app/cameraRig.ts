import * as THREE from 'three'

export interface Shot {
  target: THREE.Vector3
  /** radians around Y; 0 = looking from +Z towards -Z */
  yaw: number
  /** radians above the table plane */
  pitch: number
  /** size (cm) of the area that must fit in the FREE (un-covered) viewport — it picks the distance */
  fitW: number
  fitH: number
  /** alternatively: zoom so that 1 cm covers this many CSS pixels (keeps beads a comfortable size at any scale) */
  pxPerCm?: number
  /** the look-at point may be panned only inside this box */
  bounds?: { minX: number; maxX: number; minZ: number; maxZ: number }
  fov?: number
  /** how far the visitor may orbit away from this shot */
  yawRange?: number
  pitchRange?: [number, number]
  /** how far the visitor may zoom (distance multiplier: <1 closer, >1 farther) */
  zoomRange?: [number, number]
}

const damp = (cur: number, des: number, k: number, dt: number) => cur + (des - cur) * (1 - Math.exp(-k * dt))

/**
 * Table camera: named shots we glide between, plus limited visitor orbit / zoom / pan.
 * `insets` describe UI overlays (left panel etc.) so the table is centred in the FREE area.
 */
export class CameraRig {
  private cur = { tx: 0, ty: 0, tz: 0, yaw: 0, pitch: 1, dist: 40, fov: 32, fitW: 30, fitH: 20 }
  private des = { ...this.cur }
  private user = { yaw: 0, pitch: 0, zoom: 1, panX: 0, panZ: 0 }
  private userDes = { ...this.user }
  private shot: Shot | null = null
  private insets = { left: 0, right: 0, top: 0, bottom: 0 }
  private insetsGoal = { left: 0, right: 0, top: 0, bottom: 0 }
  private insetsInit = false
  private size = { w: 1, h: 1 }
  private k = 5.5
  /** transient camera kick (e.g. a gentle nudge when something heavy is set down) */
  private shake = 0
  private lastDist = 40

  constructor(readonly camera: THREE.PerspectiveCamera) {}

  setSize(w: number, h: number) { this.size.w = w; this.size.h = h; this.applyOffset() }
  get currentInsets() { return this.insets }
  /** how much of the canvas the UI covers; the view glides to the new free area (a panel sliding away should not make the table jump) */
  setInsets(i: Partial<typeof this.insets>) {
    Object.assign(this.insetsGoal, i)
    if (!this.insetsInit) { Object.assign(this.insets, this.insetsGoal); this.insetsInit = true; this.applyOffset() }
  }

  private applyOffset() {
    const { w, h } = this.size
    const { left, right, top, bottom } = this.insets
    const ox = -(left - right) / 2
    const oy = -(top - bottom) / 2
    this.camera.setViewOffset(w, h, ox, oy, w, h)
  }

  /** free (un-covered) viewport size in px */
  private free() {
    return { w: Math.max(200, this.size.w - this.insets.left - this.insets.right), h: Math.max(200, this.size.h - this.insets.top - this.insets.bottom) }
  }

  go(shot: Shot, speed = 5.5, keepUser = false) {
    this.shot = shot
    this.k = speed
    this.des.tx = shot.target.x; this.des.ty = shot.target.y; this.des.tz = shot.target.z
    this.des.yaw = shot.yaw; this.des.pitch = shot.pitch
    this.des.fov = shot.fov ?? 32
    this.des.fitW = shot.fitW; this.des.fitH = shot.fitH
    if (!keepUser) { this.userDes = { yaw: 0, pitch: 0, zoom: 1, panX: 0, panZ: 0 } }
  }

  /** instantly jump (first frame) */
  snap() { this.cur = { ...this.des }; this.user = { ...this.userDes } }

  orbit(dYaw: number, dPitch: number) {
    const s = this.shot
    const yr = s?.yawRange ?? 0.5
    const pr = s?.pitchRange ?? [-0.35, 0.3]
    this.userDes.yaw = THREE.MathUtils.clamp(this.userDes.yaw + dYaw, -yr, yr)
    this.userDes.pitch = THREE.MathUtils.clamp(this.userDes.pitch + dPitch, pr[0], pr[1])
  }

  private get zoomRange(): [number, number] { return this.shot?.zoomRange ?? [0.35, 1.6] }

  /** zoom about the middle of the view */
  zoom(factor: number) {
    const [lo, hi] = this.zoomRange
    this.userDes.zoom = THREE.MathUtils.clamp(this.userDes.zoom * factor, lo, hi)
  }

  /** zoom toward / away from a point on the table so that point stays under the cursor (factor < 1 zooms in) */
  zoomAt(factor: number, ax: number, az: number) {
    const [lo, hi] = this.zoomRange
    const old = this.userDes.zoom
    const nz = THREE.MathUtils.clamp(old * factor, lo, hi)
    const f = nz / old
    if (f === 1) return
    const tx = this.des.tx + this.userDes.panX, tz = this.des.tz + this.userDes.panZ
    this.userDes.panX += (1 - f) * (ax - tx)
    this.userDes.panZ += (1 - f) * (az - tz)
    this.userDes.zoom = nz
    this.clampPan()
  }

  /** drag the table with the pointer: the scene follows the cursor (dx, dy in CSS px) */
  panPixels(dx: number, dy: number) {
    const tanH = Math.tan(THREE.MathUtils.degToRad(this.cur.fov) / 2)
    const cmPerPx = (2 * tanH * this.lastDist) / Math.max(1, this.size.h)
    const yaw = this.cur.yaw + this.user.yaw
    const sinP = Math.max(0.35, Math.sin(this.cur.pitch + this.user.pitch))
    const rx = Math.cos(yaw), rz = -Math.sin(yaw)          // screen right on the ground
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw)         // away from the camera on the ground
    this.userDes.panX += (-dx * rx + (dy * fx) / sinP) * cmPerPx
    this.userDes.panZ += (-dx * rz + (dy * fz) / sinP) * cmPerPx
    this.clampPan()
  }

  /** keep the look-at point inside the shot's bounds (or ±14 cm when it has none) */
  private clampPan() {
    const b = this.shot?.bounds
    if (b) {
      this.userDes.panX = THREE.MathUtils.clamp(this.des.tx + this.userDes.panX, b.minX, b.maxX) - this.des.tx
      this.userDes.panZ = THREE.MathUtils.clamp(this.des.tz + this.userDes.panZ, b.minZ, b.maxZ) - this.des.tz
    } else {
      this.userDes.panX = THREE.MathUtils.clamp(this.userDes.panX, -14, 14)
      this.userDes.panZ = THREE.MathUtils.clamp(this.userDes.panZ, -14, 14)
    }
  }

  resetUser() { this.userDes = { yaw: 0, pitch: 0, zoom: 1, panX: 0, panZ: 0 } }
  kick(a = 0.05) { this.shake = Math.max(this.shake, a) }

  update(dt: number) {
    const c = this.cur, d = this.des, u = this.user, ud = this.userDes
    for (const k of ['left', 'right', 'top', 'bottom'] as const) {
      const v = damp(this.insets[k], this.insetsGoal[k], 14, dt)
      this.insets[k] = Math.abs(v - this.insetsGoal[k]) < 0.5 ? this.insetsGoal[k] : v
    }
    if (this.shot?.pxPerCm) {
      const f = this.free()
      d.fitW = f.w / this.shot.pxPerCm
      d.fitH = f.h / this.shot.pxPerCm
    }
    c.tx = damp(c.tx, d.tx, this.k, dt); c.ty = damp(c.ty, d.ty, this.k, dt); c.tz = damp(c.tz, d.tz, this.k, dt)
    c.yaw = damp(c.yaw, d.yaw, this.k, dt); c.pitch = damp(c.pitch, d.pitch, this.k, dt)
    c.fov = damp(c.fov, d.fov, this.k, dt); c.fitW = damp(c.fitW, d.fitW, this.k, dt); c.fitH = damp(c.fitH, d.fitH, this.k, dt)
    u.yaw = damp(u.yaw, ud.yaw, 9, dt); u.pitch = damp(u.pitch, ud.pitch, 9, dt)
    u.zoom = damp(u.zoom, ud.zoom, 14, dt); u.panX = damp(u.panX, ud.panX, 14, dt); u.panZ = damp(u.panZ, ud.panZ, 14, dt)

    const cam = this.camera
    cam.fov = c.fov
    const free = this.free()
    cam.aspect = this.size.w / this.size.h
    const tanH = Math.tan(THREE.MathUtils.degToRad(c.fov) / 2)
    // The free (un-covered) part of the canvas must contain fitW × fitH cm of table.
    //   width is seen 1:1;  depth is foreshortened by sin(pitch).
    // The projection spans the FULL canvas, so scale by the free fraction of it.
    const fw = free.w / this.size.w, fh = free.h / this.size.h
    const hvForH = (c.fitH * Math.max(0.35, Math.sin(c.pitch))) / fh      // perpendicular visible height needed
    const hvForW = c.fitW / fw / cam.aspect
    const dist = (Math.max(hvForH, hvForW) / (2 * tanH)) * u.zoom
    this.lastDist = dist
    const yaw = c.yaw + u.yaw, pitch = THREE.MathUtils.clamp(c.pitch + u.pitch, 0.35, 1.5)
    const tx = c.tx + u.panX, tz = c.tz + u.panZ
    const cp = Math.cos(pitch)
    cam.position.set(tx + Math.sin(yaw) * cp * dist, c.ty + Math.sin(pitch) * dist, tz + Math.cos(yaw) * cp * dist)
    if (this.shake > 0.0005) {
      this.shake *= Math.exp(-9 * dt)
      cam.position.y += Math.sin(performance.now() * 0.05) * this.shake
    }
    cam.lookAt(tx, c.ty, tz)
    cam.updateProjectionMatrix()
    this.applyOffset()
  }

  /** px of screen per cm of table at the look-at point (for UI that wants to size things to the view) */
  get pxPerCm() {
    const tanH = Math.tan(THREE.MathUtils.degToRad(this.cur.fov) / 2)
    return this.size.h / (2 * tanH * this.lastDist)
  }

  get currentShot() { return this.shot }
}
