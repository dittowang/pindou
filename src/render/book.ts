import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

/** A heavy hardcover book — the classic flattening weight (压书). Local origin = centre of its underside. */
export function createBook(w: number, d: number, kind: 'book' | 'tile' = 'book'): THREE.Group {
  const g = new THREE.Group()
  if (kind === 'tile') {
    const m = new THREE.Mesh(new RoundedBoxGeometry(w, 1.2, d, 3, 0.1), new THREE.MeshPhysicalMaterial({ color: 0xe9e6df, roughness: 0.25, clearcoat: 0.5 }))
    m.position.y = 0.6; m.castShadow = true
    g.add(m)
    return g
  }
  const t = 2.4
  const cover = new THREE.MeshPhysicalMaterial({ color: 0x2f4a5c, roughness: 0.6, clearcoat: 0.1 })
  const paper = new THREE.MeshStandardMaterial({ color: 0xf1ead9, roughness: 0.9 })
  const pages = new THREE.Mesh(new THREE.BoxGeometry(w - 0.5, t - 0.5, d - 0.4), paper)
  pages.position.set(0.1, t / 2, 0)
  const top = new THREE.Mesh(new RoundedBoxGeometry(w, 0.25, d, 2, 0.08), cover)
  top.position.y = t - 0.12
  const bot = new THREE.Mesh(new RoundedBoxGeometry(w, 0.25, d, 2, 0.08), cover)
  bot.position.y = 0.12
  const spine = new THREE.Mesh(new RoundedBoxGeometry(0.3, t, d, 2, 0.1), cover)
  spine.position.set(-w / 2 + 0.15, t / 2, 0)
  for (const m of [pages, top, bot, spine]) { m.castShadow = true; m.receiveShadow = true; g.add(m) }
  // gold-stamped title, as on a library hardcover: the foil is a thin print on the cloth, not a plate
  const cv = document.createElement('canvas')
  cv.width = 1024; cv.height = 512
  const c = cv.getContext('2d')!
  c.clearRect(0, 0, 1024, 512)
  c.strokeStyle = '#d8b865'; c.lineWidth = 6
  c.strokeRect(40, 40, 944, 432)
  c.lineWidth = 2; c.strokeRect(60, 60, 904, 392)
  c.fillStyle = '#d8b865'; c.textAlign = 'center'; c.textBaseline = 'middle'
  c.font = '700 120px "Fraunces","Noto Serif SC","Songti SC",serif'
  c.fillText('拼豆大全', 512, 210)
  c.font = '500 44px "Fraunces","Noto Serif SC",serif'
  c.fillText('B E A D   S T U D I O', 512, 330)
  c.font = '500 34px "Noto Serif SC",serif'
  c.fillText('卷 一  ·  熨 烫 与 压 平', 512, 395)
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  const label = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.6, w * 0.6 * 0.5), new THREE.MeshStandardMaterial({ map: tex, transparent: true, metalness: 0.7, roughness: 0.38, color: 0xffffff }))
  label.rotation.x = -Math.PI / 2
  label.position.set(0.3, t + 0.03, 0)      // the cover's top face is at t + 0.005: keep clear of it (z-fighting)
  g.add(label)
  return g
}
