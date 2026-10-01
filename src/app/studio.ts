import * as THREE from 'three'
import { createWorld, type World, type BoardSpec } from './world'
import { CameraRig, type Shot } from './cameraRig'
import { PointerState } from '../interact/pointer'
import { BuildController } from '../interact/build'
import { IronController } from '../interact/iron'
import { FinishController } from '../interact/finish'
import { Guide } from '../render/guide'
import { AudioEngine } from '../audio/audio'
import type { ScaleId } from '../config/physical'
import { clamp, randomSeed } from '../lib/rng'

export type Quality = 'low' | 'medium' | 'high'

/** Where the working view looks: the board and the tray side by side, both fully in view, both reachable without moving the camera. */
export function buildShot(w: World): Shot {
  const b = w.board.size, t = w.tray.size
  const left = -b.x / 2, right = w.tray.origin.x + t.x / 2
  const cx = (left + right) / 2
  const bounds = { minX: left - 4, maxX: right + 4, minZ: -Math.max(b.y, t.y) / 2 - 4, maxZ: Math.max(b.y, t.y) / 2 + 4 }
  return {
    target: new THREE.Vector3(cx, 0, 0.5), yaw: 0, pitch: 1.2,
    fitW: right - left + 2.6, fitH: Math.max(b.y, t.y) + 2.4,   // a little air: the near edge of the tray looks wider than its middle
    bounds, zoomRange: [0.18, 1.5], yawRange: 0.001, pitchRange: [0, 0],
  }
}
export function boardShot(w: World): Shot {
  const b = w.board.size
  return { target: new THREE.Vector3(0, 0, 0.4), yaw: 0, pitch: 1.1, fitW: b.x + 5, fitH: b.y + 4, yawRange: 0.5, pitchRange: [-0.5, 0.35] }
}

/** Orchestrates the table scene, input, stages and the render loop. */
export class Studio {
  world!: World
  rig!: CameraRig
  ptr = new PointerState()
  audio = new AudioEngine()
  build!: BuildController
  iron!: IronController
  finish!: FinishController
  guide: Guide | null = null
  patternGetter: () => import('../config/patterns').Pattern | null = () => null
  /** right-drag pans the view (working stages) instead of orbiting it (iron / finish) */
  rightDragPans = true
  private canvas: HTMLCanvasElement
  private last = performance.now()
  private drag: { mode: 'tool' | 'orbit' | 'pan'; x: number; y: number; moved: number; right: boolean } | null = null
  private touches = new Map<number, { x: number; y: number }>()
  private pinch: { d: number; cx: number; cy: number } | null = null
  fps = 60
  /** the seed the first table was built with */
  initSeed = 0
  /** probe-and-revert quality governor: nobody should have to open a settings menu */
  private gov = { t: 0, good: 0, bad: 0, tried: false, lastChange: 0, base: 1.5 }
  private frames = 0
  private fpsT = 0
  onFrame: ((dt: number) => void) | null = null

  constructor(canvas: HTMLCanvasElement) { this.canvas = canvas }

  /** `seed` makes a session reproducible (`?seed=123`); by default every visit is its own */
  async init(quality: Quality, scale: ScaleId = 'mini', spec: BoardSpec = { shape: 'square', n: 26 }, seed = randomSeed()) {
    this.initSeed = seed
    this.world = await createWorld(this.canvas, quality, scale, spec, seed)
    this.rig = new CameraRig(this.world.camera)
    this.build = new BuildController(this.world, this.ptr, this.audio)
    this.iron = new IronController(this.world, this.ptr, this.audio)
    this.finish = new FinishController(this.world, this.audio, this.iron)
    // the colour in hand lights up where it belongs on the board
    this.build.onFocusColor = (pal) => {
      const g = this.guide
      if (!g || g.mode === 'check') return
      if (pal >= 0 && this.patternGetter()) g.setMode('color', pal)
      else if (g.mode === 'color') g.setMode('off')
    }
    this.bindInput()
    window.addEventListener('resize', () => this.resize())
    this.resize()
    this.rig.go(buildShot(this.world), 5)
    this.rig.snap()
    this.loop()
  }

  /** canvas rect, plus the left offset of the HUD layer (stickers live in .hud which starts after the panel) */
  canvasRect() {
    const r = this.canvas.getBoundingClientRect()
    const hud = document.querySelector('.hud') as HTMLElement | null
    const hr = hud?.getBoundingClientRect()
    return { left: r.left, width: r.width, height: r.height, top: r.top, left0: hr ? hr.left : 0, top0: hr ? hr.top : 0 }
  }

  /** render one frame at an exact size (ignoring the UI insets) and return a copy of it */
  async photo(pw: number, ph: number, frame: (cam: THREE.PerspectiveCamera) => void): Promise<HTMLCanvasElement> {
    const w = this.world, cam = w.camera, renderer = w.gfx.renderer
    const saved = { pos: cam.position.clone(), quat: cam.quaternion.clone(), aspect: cam.aspect, fov: cam.fov, view: cam.view ? { ...cam.view } : null }
    const size = renderer.getSize(new THREE.Vector2())
    const dpr = renderer.getPixelRatio()
    cam.clearViewOffset()
    cam.aspect = pw / ph
    frame(cam)
    cam.updateProjectionMatrix()
    renderer.setPixelRatio(1)
    renderer.setSize(pw, ph, false)
    w.gfx.composer.setPixelRatio(1)
    w.gfx.composer.setSize(pw, ph)
    w.gfx.render()
    const out = document.createElement('canvas')
    out.width = pw; out.height = ph
    out.getContext('2d')!.drawImage(this.canvas, 0, 0, pw, ph)
    renderer.setPixelRatio(dpr)
    renderer.setSize(size.x, size.y, false)
    w.gfx.composer.setPixelRatio(dpr)
    w.gfx.composer.setSize(size.x, size.y)
    cam.position.copy(saved.pos); cam.quaternion.copy(saved.quat); cam.aspect = saved.aspect; cam.fov = saved.fov
    cam.updateProjectionMatrix()
    return out
  }

  /** (re)create the guide overlay for the current board */
  resetGuide() {
    this.guide?.dispose()
    this.guide = new Guide(this.world.board, this.world.pegs, this.world.dims, () => this.patternGetter())
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight
    this.world.camera.aspect = w / h
    this.world.camera.updateProjectionMatrix()
    this.world.gfx.setSize(w, h)
    this.rig.setSize(w, h)
  }

  // ------------------------------------------------------------------ input
  /** the pointer ray → a point on the table, for zooming toward the cursor */
  private groundUnder(clientX: number, clientY: number): THREE.Vector3 | null {
    const r = this.canvas.getBoundingClientRect()
    const keep = this.ptr.client.clone(), keepNdc = this.ptr.ndc.clone()
    this.ptr.setFromClient(clientX, clientY, r)
    this.ptr.update(this.world.camera)
    const hit = this.ptr.hitPlane(0, new THREE.Vector3())
    this.ptr.client.copy(keep); this.ptr.ndc.copy(keepNdc)
    this.ptr.update(this.world.camera)
    return hit
  }

  private bindInput() {
    const c = this.canvas
    const rect = () => c.getBoundingClientRect()
    c.addEventListener('contextmenu', (e) => e.preventDefault())
    c.addEventListener('pointerdown', (e) => {
      try { c.setPointerCapture(e.pointerId) } catch { /* synthetic events (tests) have no active pointer */ }
      this.ptr.setFromEvent(e, rect())
      this.ptr.inside = true
      if (e.pointerType === 'touch') {
        this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
        if (this.touches.size === 2) { this.beginPinch(); if (this.ptr.down) this.ptr.release(); this.drag = null; return }
      }
      this.audio.enable()
      if (e.button === 2) this.drag = { mode: this.rightDragPans ? 'pan' : 'orbit', x: e.clientX, y: e.clientY, moved: 0, right: true }
      else if (e.button === 1 || (e.button === 0 && e.shiftKey)) this.drag = { mode: 'pan', x: e.clientX, y: e.clientY, moved: 0, right: false }
      else if (e.button === 0 && e.altKey) this.drag = { mode: 'orbit', x: e.clientX, y: e.clientY, moved: 0, right: false }
      else if (e.button === 0) { this.drag = { mode: 'tool', x: e.clientX, y: e.clientY, moved: 0, right: false }; this.ptr.press() }
    })
    c.addEventListener('pointermove', (e) => {
      this.ptr.setFromEvent(e, rect())
      this.ptr.inside = true
      if (e.pointerType === 'touch') {
        this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
        if (this.touches.size === 2 && this.pinch) { this.updatePinch(); return }
      }
      const d = this.drag
      if (d && d.mode !== 'tool') {
        const dx = e.clientX - d.x, dy = e.clientY - d.y
        d.x = e.clientX; d.y = e.clientY
        d.moved += Math.hypot(dx, dy)
        if (d.mode === 'orbit') this.rig.orbit(-dx * 0.005, dy * 0.004)
        else this.rig.panPixels(dx, dy)
      }
    })
    const end = (e: PointerEvent) => {
      this.ptr.setFromEvent(e, rect())
      this.touches.delete(e.pointerId)
      if (this.touches.size < 2) this.pinch = null
      const d = this.drag
      if (d?.mode === 'tool' && this.ptr.down) this.ptr.release()
      // a right-click that did not drag: put whatever is in hand back
      if (d?.right && d.moved < 5 && this.build.active) this.build.cancel()
      this.drag = null
    }
    c.addEventListener('pointerup', end)
    c.addEventListener('pointercancel', end)
    c.addEventListener('pointerleave', () => { this.ptr.inside = false })
    c.addEventListener('wheel', (e) => {
      e.preventDefault()
      const f = Math.exp(clamp(e.deltaY, -120, 120) * (e.ctrlKey ? 0.01 : 0.0015))
      const g = this.groundUnder(e.clientX, e.clientY)
      if (g) this.rig.zoomAt(f, g.x, g.z); else this.rig.zoom(f)
    }, { passive: false })
    window.addEventListener('keydown', (e) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); this.build.undo() }
      else if (e.key === 'Escape' && this.build.active) this.build.cancel()
      else if (e.key === '0' && this.build.active) this.rig.resetUser()
    })
  }

  private beginPinch() {
    const [a, b] = [...this.touches.values()]
    this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }
  }
  private updatePinch() {
    const [a, b] = [...this.touches.values()]
    if (!a || !b || !this.pinch) return
    const d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2
    const g = this.groundUnder(cx, cy)
    const f = this.pinch.d / Math.max(20, d)
    if (g) this.rig.zoomAt(f, g.x, g.z); else this.rig.zoom(f)
    if (this.rightDragPans) this.rig.panPixels(cx - this.pinch.cx, cy - this.pinch.cy)
    else this.rig.orbit(-(cx - this.pinch.cx) * 0.004, (cy - this.pinch.cy) * 0.003)
    this.pinch = { d, cx, cy }
  }

  // ------------------------------------------------------------------ frame
  private govern() {
    const g = this.world.gfx, gv = this.gov
    gv.t++
    if (this.fps >= 56) { gv.good++; gv.bad = 0 } else if (this.fps < 44) { gv.bad++; gv.good = 0 } else { gv.good = 0; gv.bad = 0 }
    if (gv.bad >= 2) {
      // struggling: first undo the last upgrade, then shave resolution
      if (g.quality === 'high') g.setQuality('medium')
      else if (g.dprCap > 1) g.setDprCap(Math.max(1, g.dprCap - 0.25))
      else if (g.quality !== 'low') g.setQuality('low')
      gv.bad = 0; gv.good = 0; gv.lastChange = gv.t
      if (g.quality === 'medium') gv.tried = true
    } else if (gv.good >= 6 && gv.t - gv.lastChange > 8) {
      // plenty of headroom: sharper first, then ambient occlusion
      if (g.dprCap < Math.min(2, window.devicePixelRatio || 1) && g.quality !== 'low') g.setDprCap(Math.min(2, g.dprCap + 0.25))
      else if (g.quality === 'medium' && !gv.tried) { g.setQuality('high'); gv.tried = true }
      gv.good = 0; gv.lastChange = gv.t
    }
  }

  private loop = () => {
    requestAnimationFrame(this.loop)
    const now = performance.now()
    const dt = Math.min(0.05, (now - this.last) / 1000)
    this.last = now
    this.frames++; this.fpsT += dt
    if (this.fpsT >= 1) { this.fps = this.frames / this.fpsT; this.frames = 0; this.fpsT = 0; this.govern() }

    const w = this.world
    this.rig.update(dt)
    this.ptr.update(w.camera)
    w.trayModel.update(dt)
    w.trayBeads.update(dt)
    this.build.update(dt)
    this.guide?.tick(dt)
    this.iron.update(dt)
    this.finish.update(dt)
    w.pegs.flush()
    this.onFrame?.(dt)
    w.gfx.render()
    this.ptr.endFrame()
  }
}
