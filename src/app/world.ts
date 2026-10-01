import * as THREE from 'three'
import { createGfx, type Gfx } from '../render/renderer'
import { buildStudioEnvironment } from '../render/env'
import { createTable } from '../render/table'
import { TableProps } from '../render/props'
import { createBoard, makeLayout, type Board, type BoardLayout, type BoardShape } from '../render/board'
import { PegBeads } from '../render/pegBeads'
import { createTray, type Tray } from '../render/tray'
import { TrayBeads, wellGrid } from '../render/trayBeads'
import { TrayModel } from '../interact/trayModel'
import { makeDims, type Dims, type ScaleId } from '../config/physical'

/** a window: four panes, thin mullions, a soft edge and a hint of foliage dapple — projected by the sun spot */
function makeWindowGobo(): THREE.CanvasTexture {
  const S = 512
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S)
  g.filter = 'blur(8px)'
  g.fillStyle = '#fff'
  const m = 60, gap = 8, pw = (S - 2 * m - gap) / 2
  for (const [x, y] of [[m, m], [m + pw + gap, m], [m, m + pw + gap], [m + pw + gap, m + pw + gap]]) g.fillRect(x, y, pw, pw)
  g.filter = 'blur(14px)'
  // soft leaf shadows drifting across the panes
  g.fillStyle = 'rgba(0,0,0,0.13)'
  for (let i = 0; i < 14; i++) { g.beginPath(); g.ellipse(120 + ((i * 97) % 300), 90 + ((i * 61) % 320), 24 + (i % 4) * 8, 11 + (i % 3) * 5, (i * 0.7) % 3, 0, 7); g.fill() }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export interface BoardSpec { shape: BoardShape; n: number }

export interface World {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  gfx: Gfx
  sun: THREE.SpotLight
  hemi: THREE.HemisphereLight
  props: TableProps
  dims: Dims
  board: Board
  pegs: PegBeads
  tray: Tray
  trayModel: TrayModel
  trayBeads: TrayBeads
  sheetMat: THREE.MeshStandardMaterial
  tableY: number
  /** (re)build everything that depends on the bead scale / board: board, pegs, loose beads, tray */
  setSetup(scale: ScaleId, spec: BoardSpec, seed: number): void
}

/** Build the whole craft table. Everything is positioned in centimetres; y = 0 is the table top. */
export async function createWorld(canvas: HTMLCanvasElement, quality: 'low' | 'medium' | 'high', scale: ScaleId, spec: BoardSpec, seed = 1): Promise<World> {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x2a2622)
  const camera = new THREE.PerspectiveCamera(32, 1, 1, 500)
  camera.position.set(8, 30, 22)

  const gfx = createGfx(canvas, scene, camera, quality)
  const { renderer } = gfx
  scene.environment = buildStudioEnvironment(renderer)
  scene.environmentIntensity = 0.62

  const table = createTable(renderer)
  scene.add(table.mesh)
  const props = new TableProps()
  scene.add(props.group)

  // Morning light through a window: a spot with a window-shaped gobo — panes of light and the shadow of the mullions
  const sun = new THREE.SpotLight(0xffecd6, 5200, 0, 0.62, 0.55, 1.6)
  sun.position.set(-30, 46, 24)
  sun.target.position.set(6, 0, 0)
  sun.castShadow = true
  sun.map = makeWindowGobo()
  sun.shadow.mapSize.set(3072, 3072)
  sun.shadow.camera.near = 20
  sun.shadow.camera.far = 140
  sun.shadow.bias = -0.00035
  sun.shadow.normalBias = 0.012
  sun.shadow.radius = 2.2
  scene.add(sun, sun.target)
  // soft sky fill so nothing outside the light pool goes black
  const hemi = new THREE.HemisphereLight(0xe3ebff, 0xb58a60, 0.95)
  scene.add(hemi)

  const sheetMat = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.9 })

  const w = { scene, camera, gfx, sun, hemi, sheetMat, tableY: 0, props } as World

  w.setSetup = (sc2: ScaleId, sp: BoardSpec, sd: number) => {
    // tear down the old setup
    if (w.board) {
      scene.remove(w.board.group)
      w.board.group.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry && o.name !== 'sheet') m.geometry.dispose() })
      w.pegs.mesh.geometry.dispose()
    }
    if (w.trayBeads) w.trayBeads.dispose()
    if (w.tray) w.tray.dispose()

    const dims = makeDims(sc2)
    w.dims = dims
    const layout: BoardLayout = makeLayout(sp.shape, sp.n)
    const board = createBoard(layout, sheetMat, dims)
    scene.add(board.group)
    const pegs = new PegBeads(layout, board.plateTopY, sd, dims)
    board.group.add(pegs.mesh)
    w.board = board
    w.pegs = pegs
    // sorting tray sits just right of the board, with a neat grid of standing beads in each compartment
    const tray = createTray(new THREE.Vector3(0, 0, 0), dims)
    const origin = new THREE.Vector3(board.size.x / 2 + 2.2 + tray.size.x / 2, 0, 0)
    tray.dispose()
    w.tray = createTray(origin, dims)
    scene.add(w.tray.group)
    w.trayModel = new TrayModel(w.tray.count, wellGrid(dims).cap, dims.tray.scoop)
    w.trayBeads = new TrayBeads(w.tray, w.trayModel, dims)
    w.trayBeads.addTo(scene)
    // GTAO must see the melt deformation
    gfx.normalMaterial = pegs.mats.normal
  }
  w.setSetup(scale, spec, seed)
  return w
}
