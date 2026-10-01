import * as THREE from 'three'
import type { Dims } from '../config/physical'
import { Tweezers } from '../render/tweezers'
import { BeadPen } from '../render/beadPen'
import { buildBeadGeometry } from '../render/beadGeometry'
import { createBeadMaterial } from '../render/trayBeads'
import { realBeadAlbedo } from '../render/beadMaterial'
import { addFinishAttributes, writeFinish } from '../render/beadFinish'

export type Tool = 'tweezers' | 'pen'

const UP = new THREE.Vector3(0, 1, 0)
/** blades are drawn this much wider than life */
const GIRTH = 1.8
/** (right, up, toward the viewer) of the body direction */
const TWEEZER_DIR = new THREE.Vector3(0.95, 0.72, 0.5)
const PEN_DIR = new THREE.Vector3(0.55, 1.0, 0.28)

/**
 * The tool in the visitor's hand. Its TIP is always exactly where the pointer is on screen (the controller puts the
 * tip on the pointer ray), and the body trails away toward the lower right the way a right hand would hold it —
 * so what you see follows the mouse one-to-one.
 */
export class ToolRig {
  readonly group = new THREE.Group()
  readonly tweezers: Tweezers
  readonly pen: BeadPen
  private heldMesh: THREE.InstancedMesh
  private heldFin: ReturnType<typeof addFinishAttributes>
  private heldMat: THREE.MeshPhysicalMaterial
  private heldGeo: THREE.BufferGeometry
  private gap = 0.8
  private gapTarget = 0.8
  private col = new THREE.Color()
  private m = new THREE.Matrix4()
  private dir = new THREE.Vector3()
  private right = new THREE.Vector3()
  private back = new THREE.Vector3()
  private bx = new THREE.Vector3()
  private by = new THREE.Vector3()
  tool: Tool = 'tweezers'
  holding = false

  constructor(renderer: THREE.WebGLRenderer, private dims: Dims) {
    this.tweezers = new Tweezers(renderer, 0x8f959d)
    this.pen = new BeadPen(renderer, dims)
    // a real tweezer is hair-thin; on screen it has to be seen: widen the blades, keep the length modest
    this.tweezers.group.scale.set(GIRTH, GIRTH, 0.74)
    this.pen.group.scale.set(1.25, 1.25, 0.6)
    this.group.add(this.tweezers.group, this.pen.group)
    this.group.visible = false
    this.group.name = 'toolRig'
    // the bead between the tweezer tips
    this.heldGeo = buildBeadGeometry(dims, 16, 'low')
    this.heldFin = addFinishAttributes(this.heldGeo, 1)
    this.heldMat = createBeadMaterial()
    this.heldMesh = new THREE.InstancedMesh(this.heldGeo, this.heldMat, 1)
    this.heldMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(3), 3)
    this.heldMesh.castShadow = true
    this.heldMesh.frustumCulled = false
    this.heldMesh.visible = false
    this.heldMesh.name = 'heldBead'
    this.setTool('tweezers')
  }

  /** put the whole rig into a scene (the held bead lives in world space, not in the tool's frame) */
  addTo(scene: THREE.Object3D) { scene.add(this.group, this.heldMesh) }

  setTool(t: Tool) {
    this.tool = t
    this.tweezers.group.visible = t === 'tweezers'
    this.pen.group.visible = t === 'pen'
    if (t !== 'tweezers') this.setHeld(null)
  }

  setVisible(v: boolean) {
    this.group.visible = v
    this.heldMesh.visible = v && this.holding
  }

  /** the bead in the tweezers (null = empty hand) */
  setHeld(bead: { hex: number; pal: number } | null) {
    this.holding = !!bead
    this.heldMesh.visible = !!bead && this.group.visible
    this.gapTarget = bead ? this.dims.bead.outerR * 2 + 0.01 : 0.8
    if (!bead) return
    this.col.setHex(bead.hex)
    realBeadAlbedo(this.col)
    this.heldMesh.setColorAt(0, this.col)
    this.heldMesh.instanceColor!.needsUpdate = true
    writeFinish(this.heldFin, 0, bead.pal)
  }

  setPenLoad(n: number, hex: number) { this.pen.setLoad(n, hex) }

  /** open the tips a little when hovering, close them on a bead */
  pinch(closed: boolean) { this.gapTarget = closed ? this.dims.bead.outerR * 2 + 0.01 : 0.8 }

  /** place the tool: tip at `tip`, body trailing toward the viewer's lower right */
  place(tip: THREE.Vector3, camera: THREE.Camera, dt: number) {
    // camera-relative axes on the ground
    camera.getWorldDirection(this.dir)
    this.back.set(-this.dir.x, 0, -this.dir.z)
    if (this.back.lengthSq() < 1e-6) this.back.set(0, 0, 1)
    this.back.normalize()
    this.right.crossVectors(UP, this.back).normalize()           // y × z = x: the camera's right on the ground
    // hand direction: right, back toward the viewer, and up out of the table
    const d = this.tool === 'pen' ? PEN_DIR : TWEEZER_DIR
    this.dir.copy(this.right).multiplyScalar(d.x).addScaledVector(this.back, d.z).addScaledVector(UP, d.y).normalize()
    // basis: z = body direction, x = across the blades (kept horizontal)
    const z = this.dir
    this.bx.crossVectors(UP, z).normalize()
    this.by.crossVectors(z, this.bx)
    this.m.makeBasis(this.bx, this.by, z)
    this.group.quaternion.setFromRotationMatrix(this.m)
    this.group.position.copy(tip)
    // blade gap eases toward its target
    this.gap += (this.gapTarget - this.gap) * (1 - Math.exp(-22 * dt))
    this.tweezers.setGap(this.gap / GIRTH)
    if (this.holding) {
      this.m.makeTranslation(tip.x, tip.y - 0.02, tip.z)
      this.heldMesh.setMatrixAt(0, this.m)
      this.heldMesh.instanceMatrix.needsUpdate = true
    }
  }

  dispose() {
    this.group.parent?.remove(this.group)
    this.heldMesh.parent?.remove(this.heldMesh)
    this.heldGeo.dispose()
    this.heldMat.dispose()
  }
}
