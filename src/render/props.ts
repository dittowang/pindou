import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { rimAlpha } from './board'
import { PALETTE } from '../config/palette'
import { realBeadAlbedo } from './beadMaterial'

/** a little donut-grain texture: what a bottle full of beads looks like from the outside */
function beadFillTexture(hex: number): THREE.CanvasTexture {
  const N = 192
  const cv = document.createElement('canvas')
  cv.width = cv.height = N
  const g = cv.getContext('2d')!
  const c = new THREE.Color(hex)
  const base = `#${c.getHexString()}`
  g.fillStyle = base; g.fillRect(0, 0, N, N)
  let a = (hex ^ 0x9e3779b9) >>> 0
  const rnd = () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296 }
  for (let i = 0; i < 420; i++) {
    const x = rnd() * N, y = rnd() * N, r = 5 + rnd() * 2.5
    const l = 0.78 + rnd() * 0.4
    g.fillStyle = `rgb(${Math.min(255, c.r * 255 * l)},${Math.min(255, c.g * 255 * l)},${Math.min(255, c.b * 255 * l)})`
    g.beginPath(); g.ellipse(x, y, r, r * (0.6 + rnd() * 0.5), rnd() * Math.PI, 0, Math.PI * 2); g.fill()
    g.fillStyle = 'rgba(15,10,8,.55)'
    g.beginPath(); g.arc(x + (rnd() - 0.5), y + (rnd() - 0.5), r * 0.36, 0, Math.PI * 2); g.fill()
  }
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 4
  return t
}

function labelTexture(code: string): THREE.CanvasTexture {
  const cv = document.createElement('canvas')
  cv.width = 256; cv.height = 192
  const g = cv.getContext('2d')!
  g.fillStyle = '#f7f4ee'; g.fillRect(0, 0, 256, 192)
  g.strokeStyle = 'rgba(60,45,35,.35)'; g.lineWidth = 4; g.strokeRect(6, 6, 244, 180)
  g.fillStyle = '#2b2520'; g.textAlign = 'center'; g.textBaseline = 'middle'
  g.font = '700 92px "Instrument Sans", "Helvetica Neue", Arial, sans-serif'
  g.fillText(code, 128, 88)
  g.font = '500 24px "Instrument Sans", Arial, sans-serif'
  g.fillStyle = 'rgba(43,37,32,.6)'
  g.fillText('MARD · 12 g', 128, 158)
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

/**
 * Small things that live on a shop table: a sticky note with the time you sat down (the shop notes it so it can
 * charge by the hour), and the 30 ml bottles of the colours you came for.
 */
export class TableProps {
  readonly group = new THREE.Group()
  private note: THREE.Mesh
  private noteCv: HTMLCanvasElement
  private noteTex: THREE.CanvasTexture
  private bottles = new THREE.Group()
  private clear: THREE.MeshPhysicalMaterial

  constructor() {
    this.group.name = 'props'
    // ---- sticky note
    this.noteCv = document.createElement('canvas')
    this.noteCv.width = this.noteCv.height = 256
    this.noteTex = new THREE.CanvasTexture(this.noteCv)
    this.noteTex.colorSpace = THREE.SRGBColorSpace
    this.noteTex.anisotropy = 4
    const geo = new THREE.PlaneGeometry(4.2, 4.2, 12, 12)
    const pos = geo.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const v = (pos.getY(i) + 2.1) / 4.2          // 0 at the bottom edge, 1 at the glued top edge
      pos.setZ(i, 0.22 * Math.pow(Math.max(0, 0.55 - v) / 0.55, 2) + 0.012)   // the free end lifts a little
    }
    geo.computeVertexNormals()
    this.note = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: this.noteTex, roughness: 0.92, side: THREE.DoubleSide }))
    this.note.rotation.x = -Math.PI / 2
    this.note.rotation.z = 0.21
    this.note.position.set(-3.6, 0.005, -7.6)
    this.note.castShadow = true
    this.note.receiveShadow = true
    this.group.add(this.note)
    this.setNoteTime(new Date())

    // ---- bottles
    this.clear = new THREE.MeshPhysicalMaterial({ color: 0xe8f1f6, roughness: 0.25, metalness: 0, transparent: true, depthWrite: false, clearcoat: 0.6, clearcoatRoughness: 0.2 })
    rimAlpha(this.clear, 0.10, 0.55, 1.6, 0.35)
    this.bottles.position.set(1.8, 0, -6.9)
    this.group.add(this.bottles)
  }

  setNoteTime(d: Date) {
    const g = this.noteCv.getContext('2d')!
    const N = 256
    const bg = g.createLinearGradient(0, 0, 0, N)
    bg.addColorStop(0, '#f4dc6e'); bg.addColorStop(1, '#f8e88c')
    g.fillStyle = bg; g.fillRect(0, 0, N, N)
    g.fillStyle = 'rgba(190,150,40,.22)'; g.fillRect(0, 0, N, 26)           // the glue strip
    g.fillStyle = 'rgba(30,30,60,.88)'; g.textAlign = 'center'; g.textBaseline = 'alphabetic'
    const hand = '"Kaiti SC","STKaiti","KaiTi","Xingkai SC","Noto Serif SC",cursive'
    g.font = `500 40px ${hand}`
    g.save(); g.translate(128, 98); g.rotate(-0.04); g.fillText('入座', 0, 0); g.restore()
    const hh = String(d.getHours()).padStart(2, '0'), mm = String(d.getMinutes()).padStart(2, '0')
    g.font = `700 84px ${hand}`
    g.save(); g.translate(128, 180); g.rotate(-0.035); g.fillText(`${hh}:${mm}`, 0, 0); g.restore()
    g.strokeStyle = 'rgba(30,30,60,.7)'; g.lineWidth = 4; g.lineCap = 'round'
    g.beginPath(); g.moveTo(52, 204); g.bezierCurveTo(100, 212, 160, 196, 206, 206); g.stroke()
    this.noteTex.needsUpdate = true
  }

  /** stand a bottle for each of these palette indices (the colours the pattern needs) */
  setBottles(palIdx: number[]) {
    for (const ch of [...this.bottles.children]) {
      this.bottles.remove(ch)
      ch.traverse((o) => {
        const m = o as THREE.Mesh
        if (m.geometry) m.geometry.dispose()
        const mat = m.material as THREE.MeshStandardMaterial | undefined
        if (mat && mat !== (this.clear as unknown) && mat.map) { mat.map.dispose(); mat.dispose() }
      })
    }
    const list = palIdx.slice(0, 4)
    list.forEach((pi, n) => {
      const col = PALETTE[pi]
      if (!col) return
      const b = this.makeBottle(col.hexNum, col.code)
      b.position.set(n * 3.4, 0, (n % 2) * 0.5 - 0.2)
      b.rotation.y = (n - 1.5) * 0.18
      this.bottles.add(b)
    })
  }

  private makeBottle(hex: number, code: string): THREE.Group {
    const g = new THREE.Group()
    const W = 2.7, H = 5.2
    const body = new THREE.Mesh(new RoundedBoxGeometry(W, H, W, 3, 0.4), this.clear)
    body.position.y = H / 2
    body.renderOrder = 7
    body.castShadow = true
    // beads inside
    const c = new THREE.Color(hex); realBeadAlbedo(c)
    const tex = beadFillTexture(new THREE.Color(hex).getHex())
    tex.repeat.set(1.4, 2.2)
    const fill = new THREE.Mesh(new RoundedBoxGeometry(W - 0.34, H * 0.72, W - 0.34, 2, 0.3), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, color: new THREE.Color(0xffffff).lerp(c, 0.0) }))
    fill.position.y = 0.2 + (H * 0.72) / 2
    // shoulder + neck + cap
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 0.5, 20), this.clear)
    neck.position.y = H + 0.2
    neck.renderOrder = 7
    const capMat = new THREE.MeshPhysicalMaterial({ color: 0xf4f1ea, roughness: 0.4, clearcoat: 0.5, clearcoatRoughness: 0.3 })
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.95, 28), capMat)
    cap.position.y = H + 0.75
    cap.castShadow = true
    // a front label
    const label = new THREE.Mesh(new THREE.PlaneGeometry(1.95, 1.46), new THREE.MeshStandardMaterial({ map: labelTexture(code), roughness: 0.85 }))
    label.position.set(0, H * 0.46, W / 2 + 0.012)
    g.add(fill, body, neck, cap, label)
    return g
  }
}
