import * as THREE from 'three'

/** Unified pointer (mouse / pen / one finger) with a world-space ray. */
export class PointerState {
  readonly ndc = new THREE.Vector2()
  readonly client = new THREE.Vector2()
  readonly ray = new THREE.Ray()
  down = false
  justDown = false
  justUp = false
  /** is the pointer over the canvas (and not over a panel / button on top of it)? */
  inside = false
  movedPx = 0
  downTime = 0
  /** touch input: the working point sits above the finger so the finger does not hide it */
  touch = false
  /** how far above the finger, in NDC units (≈ 6 % of the screen height) */
  touchLift = 0.13
  /** the ray at the moment the button went down (a quick click-and-drag can move the pointer before the next frame) */
  readonly downRay = new THREE.Ray()
  /** every pointer position since the last frame, while the button is held (so a fast sweep leaves no gaps) */
  readonly trail: THREE.Vector2[] = []
  private downNdc = new THREE.Vector2()
  private downAt = new THREE.Vector2()
  private rc = new THREE.Raycaster()
  private lifted = new THREE.Vector2()

  setFromClient(x: number, y: number, rect: DOMRect) {
    this.client.set(x, y)
    this.ndc.set(((x - rect.left) / rect.width) * 2 - 1, -(((y - rect.top) / rect.height) * 2 - 1))
    if (this.down) this.trail.push(this.ndc.clone())
  }

  setFromEvent(e: PointerEvent, rect: DOMRect) {
    this.setFromClient(e.clientX, e.clientY, rect)
    this.touch = e.pointerType === 'touch'
    if (this.down) this.movedPx = Math.max(this.movedPx, this.client.distanceTo(this.downAt))
  }
  press() { this.down = true; this.justDown = true; this.movedPx = 0; this.downAt.copy(this.client); this.downNdc.copy(this.ndc); this.trail.length = 0; this.trail.push(this.ndc.clone()); this.downTime = performance.now() }
  release() { this.down = false; this.justUp = true }
  endFrame() { this.justDown = false; this.justUp = false; this.trail.length = 0 }

  update(camera: THREE.Camera) {
    this.rayFromNdc(this.ndc, camera, this.ray)
    if (this.justDown) this.rayFromNdc(this.downNdc, camera, this.downRay)
  }

  /** the world ray for a screen position (NDC); touch input is lifted above the finger */
  rayFromNdc(ndc: THREE.Vector2, camera: THREE.Camera, out: THREE.Ray = new THREE.Ray()): THREE.Ray {
    const n = this.touch ? this.lifted.set(ndc.x, ndc.y + this.touchLift) : ndc
    this.rc.setFromCamera(n, camera)
    return out.copy(this.rc.ray)
  }

  /** intersection of the pointer ray with the horizontal plane y = h (null when looking away) */
  hitPlane(h: number, out = new THREE.Vector3()): THREE.Vector3 | null {
    return PointerState.hit(this.ray, h, out)
  }

  /** intersection of any ray with the horizontal plane y = h */
  static hit(ray: THREE.Ray, h: number, out = new THREE.Vector3()): THREE.Vector3 | null {
    const o = ray.origin, d = ray.direction
    if (Math.abs(d.y) < 1e-6) return null
    const t = (h - o.y) / d.y
    if (t < 0) return null
    return out.set(o.x + d.x * t, h, o.z + d.z * t)
  }
}
