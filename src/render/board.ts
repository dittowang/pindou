import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Dims } from '../config/physical'

export type BoardShape = 'square' | 'circle' | 'heart'

export interface BoardLayout {
  cols: number
  rows: number
  /** which cells have a peg (circle / heart boards leave corners out) */
  mask: Uint8Array
  shape: BoardShape
  name: string
}

export function makeLayout(shape: BoardShape, n: number): BoardLayout {
  const mask = new Uint8Array(n * n)
  const c = (n - 1) / 2
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    let on = true
    if (shape === 'circle') on = Math.hypot(i - c, j - c) <= n / 2 - 0.35
    else if (shape === 'heart') {
      const s = n / 2.35
      const u = (i - c) / s, v = (c * 0.95 - j) / s + 0.1
      on = (u * u + v * v - 1) ** 3 - u * u * v ** 3 <= 0.02
    }
    mask[j * n + i] = on ? 1 : 0
  }
  const nm = shape === 'square' ? `${n}×${n} 方板` : shape === 'circle' ? `${n} 圆板` : `${n} 心形板`
  return { cols: n, rows: n, mask, shape, name: nm }
}
export const squareLayout = (n: number) => makeLayout('square', n)

export const cellX = (i: number, cols: number, pitch: number) => (i - (cols - 1) / 2) * pitch
export const cellZ = (j: number, rows: number, pitch: number) => (j - (rows - 1) / 2) * pitch

export interface Board {
  group: THREE.Group
  plate: THREE.Mesh
  plateSpec: THREE.Mesh
  /** the clear pegs: one instanced mesh per layer (film + reflections) */
  pegs: THREE.InstancedMesh
  pegsSpec: THREE.InstancedMesh
  /** soft footprints (peg highlights + contact shadows) and the plate's own faint shadow */
  decals: THREE.InstancedMesh
  shadow: THREE.Mesh
  plateTopY: number
  sheet: THREE.Mesh
  layout: BoardLayout
  dims: Dims
  setSheetTexture(tex: THREE.Texture | null): void
  /** footprint of the plate (cm) */
  size: THREE.Vector2
  /** size of the printed sheet under the plate */
  sheetSize: THREE.Vector2
}

function roundedRectShape(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape()
  const x = -w / 2, y = -h / 2
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false)
  s.lineTo(x + w, y + h - r); s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false)
  s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false)
  s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false)
  return s
}

function outlineShape(layout: BoardLayout, dims: Dims, w: number, d: number): THREE.Shape {
  const m = dims.plate.margin
  if (layout.shape === 'circle') {
    const s = new THREE.Shape()
    s.absarc(0, 0, Math.min(w, d) / 2, 0, Math.PI * 2, false)
    return s
  }
  if (layout.shape === 'heart') {
    // parametric heart scaled to the peg field + margin
    const s = new THREE.Shape()
    const R = (layout.cols * dims.pitch) / 2 + m * 0.4
    const N = 120
    for (let k = 0; k <= N; k++) {
      const t = (k / N) * Math.PI * 2
      const x = 16 * Math.sin(t) ** 3
      const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)
      const px = (x / 17) * R * 1.02, py = -((y - 1.5) / 17) * R * 1.02   // flip: shape y → -z later
      if (k === 0) s.moveTo(px, py); else s.lineTo(px, py)
    }
    return s
  }
  return roundedRectShape(w, d, dims.plate.cornerR)
}

/** Tapered peg with a rounded tip, base at y=0. */
function pegGeometry(dims: Dims): THREE.BufferGeometry {
  const { rBase: rb, r: rt, h } = dims.peg
  const pts: THREE.Vector2[] = []
  pts.push(new THREE.Vector2(rb * 1.25, 0))
  pts.push(new THREE.Vector2(rb * 1.05, h * 0.08))
  pts.push(new THREE.Vector2(rb, h * 0.2))
  const tipR = rt * 0.9
  pts.push(new THREE.Vector2(rt, h - tipR))
  for (let i = 1; i <= 4; i++) {
    const a = (i / 4) * (Math.PI / 2)
    pts.push(new THREE.Vector2(rt - tipR + tipR * Math.cos(a), h - tipR + tipR * Math.sin(a)))
  }
  pts.push(new THREE.Vector2(0, h))
  const g = new THREE.LatheGeometry(pts, 12)
  g.deleteAttribute('uv')
  return g
}

export function createBoard(layout: BoardLayout, sheetMat: THREE.MeshStandardMaterial, dims: Dims): Board {
  const plateMats = makePlateMaterials()
  const group = new THREE.Group()
  group.name = 'board'
  const { cols, rows } = layout
  const pitch = dims.pitch
  const w = (cols - 1) * pitch + 2 * dims.plate.margin
  const d = (rows - 1) * pitch + 2 * dims.plate.margin
  const SHEET_Y = 0.012
  const plateBottom = 0.03
  const plateTopY = plateBottom + dims.plate.t

  const shape = outlineShape(layout, dims, w, d)
  const bevel = Math.min(0.03, dims.plate.t * 0.14)
  let plateGeo: THREE.BufferGeometry = new THREE.ExtrudeGeometry(shape, {
    depth: dims.plate.t - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 12,
  })
  plateGeo.rotateX(-Math.PI / 2)
  plateGeo.translate(0, plateBottom + bevel, 0)
  plateGeo.deleteAttribute('uv')
  if (plateGeo.index) plateGeo = plateGeo.toNonIndexed()

  plateGeo.computeVertexNormals()

  // clear plastic = a faint tinted film whose opacity rises toward grazing angles (so edges and peg walls read as bright
  // rims, the way clear plastic does) + the reflections added on top. Much cheaper than refraction, and the pattern sheet
  // underneath stays crisp, as it does through a real clear board.
  const plate = new THREE.Mesh(plateGeo, plateMats.tint)
  plate.renderOrder = 5
  plate.name = 'plate'
  const plateSpec = new THREE.Mesh(plateGeo, plateMats.spec)
  plateSpec.renderOrder = 6
  plateSpec.name = 'plateSpec'

  const pegGeo = pegGeometry(dims)
  let count = 0
  for (let k = 0; k < layout.mask.length; k++) if (layout.mask[k]) count++
  const pegs = new THREE.InstancedMesh(pegGeo, plateMats.pegTint, count)
  const pegsSpec = new THREE.InstancedMesh(pegGeo, plateMats.spec, count)
  const m = new THREE.Matrix4()
  let n = 0
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      if (!layout.mask[j * cols + i]) continue
      m.makeTranslation(cellX(i, cols, pitch), plateTopY - 0.01, cellZ(j, rows, pitch))
      pegs.setMatrixAt(n, m); pegsSpec.setMatrixAt(n, m); n++
    }
  }
  pegs.instanceMatrix.needsUpdate = true; pegsSpec.instanceMatrix.needsUpdate = true
  pegs.renderOrder = 5; pegsSpec.renderOrder = 6
  pegs.name = 'pegs'; pegsSpec.name = 'pegsSpec'
  for (const o of [plate, plateSpec, pegs, pegsSpec]) o.userData.noAO = true
  group.add(plate, plateSpec, pegs, pegsSpec)

  // peg footprints: a pale lit disc + dark rim + soft contact shadow, so the lattice of clear pegs reads at any zoom
  const dSize = dims.peg.rBase * 2 * 2.5
  const decals = new THREE.InstancedMesh(new THREE.PlaneGeometry(dSize, dSize).rotateX(-Math.PI / 2), pegDecalMaterial(), count)
  n = 0
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      if (!layout.mask[j * cols + i]) continue
      m.makeTranslation(cellX(i, cols, pitch) + dSize * 0.03, plateTopY + 0.004, cellZ(j, rows, pitch) + dSize * 0.03)
      decals.setMatrixAt(n++, m)
    }
  }
  decals.instanceMatrix.needsUpdate = true
  decals.renderOrder = 4
  decals.name = 'pegDecals'
  decals.userData.noAO = true
  group.add(decals)

  // the clear plate still casts a faint shadow; it also shows where the board ends
  const shadow = plateShadow(shape, w, d)
  shadow.position.set(0.06, 0.016, 0.05)
  group.add(shadow)

  // the printed pattern sheet that sits UNDER the clear plate (as in the shop)
  const sheetSize = new THREE.Vector2(w + 1.6, d + 1.6)
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(sheetSize.x, sheetSize.y), sheetMat)
  sheet.rotation.x = -Math.PI / 2
  sheet.position.y = SHEET_Y
  sheet.receiveShadow = true
  sheet.name = 'sheet'
  group.add(sheet)

  return {
    group, plate, plateSpec, pegs, pegsSpec, decals, shadow, plateTopY, sheet, layout, dims,
    size: new THREE.Vector2(w, d),
    sheetSize,
    setSheetTexture(tex) {
      sheetMat.map = tex
      // printed ink should stay vivid under a clear plate: a little self-illumination from the same print
      sheetMat.emissiveMap = tex
      sheetMat.emissive.set(tex ? 0xffffff : 0x000000)
      sheetMat.emissiveIntensity = 0.1
      sheetMat.color.set(tex ? 0xe8e4da : 0xe6e2d8)      // printer paper under a window: bright, but not blown out
      sheetMat.needsUpdate = true
    },
  }
}

let decalTex: THREE.CanvasTexture | null = null
function pegDecalMaterial(): THREE.MeshLambertMaterial {
  if (!decalTex) {
    const N = 256
    const cv = document.createElement('canvas')
    cv.width = cv.height = N
    const g = cv.getContext('2d')!
    // contact shadow: soft, pushed to the lower right
    const sh = g.createRadialGradient(N * 0.54, N * 0.55, N * 0.1, N * 0.54, N * 0.55, N * 0.5)
    sh.addColorStop(0, 'rgba(40,52,70,0.46)'); sh.addColorStop(0.6, 'rgba(40,52,70,0.20)'); sh.addColorStop(1, 'rgba(40,52,70,0)')
    g.fillStyle = sh; g.fillRect(0, 0, N, N)
    // the peg's tip: barely-there pale disc (clear plastic) …
    const tip = g.createRadialGradient(N * 0.45, N * 0.43, N * 0.02, N * 0.5, N * 0.5, N * 0.26)
    tip.addColorStop(0, 'rgba(255,255,255,0.55)'); tip.addColorStop(0.7, 'rgba(220,234,244,0.30)'); tip.addColorStop(1, 'rgba(190,210,225,0.18)')
    g.fillStyle = tip; g.beginPath(); g.arc(N / 2, N / 2, N * 0.26, 0, Math.PI * 2); g.fill()
    // … a crisp dark silhouette ring and a bright specular crescent
    g.lineWidth = N * 0.045; g.strokeStyle = 'rgba(46,66,86,0.85)'; g.beginPath(); g.arc(N / 2, N / 2, N * 0.272, 0, Math.PI * 2); g.stroke()
    g.lineWidth = N * 0.026; g.strokeStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(N / 2, N / 2, N * 0.232, Math.PI * 1.05, Math.PI * 1.6); g.stroke()
    g.lineWidth = N * 0.012; g.strokeStyle = 'rgba(255,255,255,0.45)'; g.beginPath(); g.arc(N / 2, N / 2, N * 0.232, Math.PI * 0.05, Math.PI * 0.5); g.stroke()
    decalTex = new THREE.CanvasTexture(cv)
    decalTex.colorSpace = THREE.SRGBColorSpace
    decalTex.anisotropy = 8
  }
  return new THREE.MeshLambertMaterial({ map: decalTex, transparent: true, depthWrite: false })
}

/** A blurred silhouette of the plate on a quad (drawn with canvas shadows so it works in every browser). */
function plateShadow(shape: THREE.Shape, w: number, d: number): THREE.Mesh {
  const pad = 0.7
  const sw = w + pad * 2, sd = d + pad * 2
  const S = 512
  const k = S / Math.max(sw, sd)
  const cv = document.createElement('canvas')
  cv.width = Math.ceil(sw * k); cv.height = Math.ceil(sd * k)
  const g = cv.getContext('2d')!
  const OFF = 4000
  g.shadowColor = 'rgba(40,36,30,0.30)'
  g.shadowBlur = 0.2 * k
  g.shadowOffsetX = OFF
  g.fillStyle = '#000'
  g.beginPath()
  shape.getPoints(40).forEach((p, i) => {
    const x = cv.width / 2 + p.x * k - OFF, y = cv.height / 2 - p.y * k
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y)
  })
  g.closePath(); g.fill()
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(sw, sd).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }),
  )
  mesh.renderOrder = 3
  mesh.userData.noAO = true
  mesh.name = 'plateShadow'
  return mesh
}

/** Make a transparent standard material more opaque / brighter toward grazing angles — clear plastic's edges and walls. */
export function rimAlpha(mat: THREE.MeshPhysicalMaterial, base: number, rim: number, pow: number, glow: number) {
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <opaque_fragment>',
      `float ndv = clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0);
       float fr = pow(1.0 - ndv, ${pow.toFixed(2)});
       diffuseColor.a = clamp(${base.toFixed(3)} + fr * ${rim.toFixed(3)}, 0.0, 1.0);
       outgoingLight += vec3(0.86, 0.95, 0.98) * fr * ${glow.toFixed(3)};
       gl_FragColor = vec4( outgoingLight, diffuseColor.a );`,
    )
  }
  mat.customProgramCacheKey = () => `rim${base}_${rim}_${pow}_${glow}`
}

export function makePlateMaterials() {
  // the flat deck: almost nothing face-on, a pale glassy band along its edges and bevel
  const tint = new THREE.MeshPhysicalMaterial({
    color: 0xd3e2ec, roughness: 0.4, metalness: 0, specularIntensity: 0, transparent: true, depthWrite: false,
  })
  rimAlpha(tint, 0.2, 0.55, 2.2, 0.3)
  // pegs: little clear cylinders — visible as pale rings with a bright silhouette, even over a white sheet
  const pegTint = new THREE.MeshPhysicalMaterial({
    color: 0xe3eef4, roughness: 0.4, metalness: 0, specularIntensity: 0, transparent: true, depthWrite: false,
  })
  rimAlpha(pegTint, 0.1, 0.62, 1.5, 0.3)
  const spec = new THREE.MeshPhysicalMaterial({
    color: 0x000000, roughness: 0.16, metalness: 0, ior: 1.5, specularIntensity: 1,
    clearcoat: 0.3, clearcoatRoughness: 0.2, envMapIntensity: 1.35,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  })
  return { tint, pegTint, spec }
}
