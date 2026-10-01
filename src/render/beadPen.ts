import * as THREE from 'three'
import { bakeBrushedMetal } from './textures'
import type { Dims } from '../config/physical'
import { buildBeadGeometry } from './beadGeometry'
import { realBeadAlbedo } from './beadMaterial'

/**
 * 双针豆笔: a slim white 3D-printed pen with two parallel steel needles. Beads are strung on the needles
 * (you can see the load) and slide off, one per peg, when the pen is dragged along a row.
 * Local frame: needle tip = origin, body extends along +Z.
 */
export class BeadPen {
  readonly group = new THREE.Group()
  readonly length = 11.5
  private beadsMesh: THREE.InstancedMesh
  private max = 14
  private tmp = new THREE.Matrix4()
  private color = new THREE.Color(0xffffff)

  constructor(renderer: THREE.WebGLRenderer, private dims: Dims) {
    const steel = new THREE.MeshPhysicalMaterial({ color: 0xcfd3d8, metalness: 1, roughness: 0.3, envMapIntensity: 1.1, anisotropy: 0.5 })
    void bakeBrushedMetal
    const body = new THREE.MeshPhysicalMaterial({ color: 0xf1ede6, roughness: 0.55, clearcoat: 0.25, clearcoatRoughness: 0.5 })
    const accent = new THREE.MeshPhysicalMaterial({ color: 0xd9472e, roughness: 0.45, clearcoat: 0.3 })
    const L = this.length
    // two needles, 0.06 cm thick, 0.55 cm apart (centred), 3.2 cm long
    const nl = 3.2, gap = dims.bead.outerR * 0.0 + 0.0
    for (const sx of [-1, 1]) {
      const n = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, nl, 8), steel)
      n.rotation.x = Math.PI / 2
      n.position.set(sx * (dims.bead.holeR * 0.0 + 0.0), 0, nl / 2)
      n.castShadow = true
      this.group.add(n)
      void gap
    }
    // ferrule + body
    const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 1.1, 18), steel)
    ferrule.rotation.x = Math.PI / 2
    ferrule.position.set(0, 0, nl + 0.55)
    ferrule.castShadow = true
    this.group.add(ferrule)
    const pen = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.34, L - nl - 1.1, 22), body)
    pen.rotation.x = Math.PI / 2
    pen.position.set(0, 0, nl + 1.1 + (L - nl - 1.1) / 2)
    pen.castShadow = true
    this.group.add(pen)
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.435, 0.435, 0.5, 22), accent)
    band.rotation.x = Math.PI / 2
    band.position.set(0, 0, nl + 1.9)
    this.group.add(band)

    // the beads strung near the tip
    const geo = buildBeadGeometry(dims, 14, 'low')
    const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.5, specularIntensity: 0.85 })
    this.beadsMesh = new THREE.InstancedMesh(geo, mat, this.max)
    this.beadsMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.max * 3), 3)
    this.beadsMesh.castShadow = true
    this.group.add(this.beadsMesh)
    this.setLoad(0, 0xffffff)
    this.group.name = 'beadPen'
  }

  /** show `n` beads of `hex` on the needles (capped for the picture; the real load can be larger) */
  setLoad(n: number, hex: number) {
    this.color.setHex(hex)
    realBeadAlbedo(this.color)
    const shown = Math.min(this.max, n)
    const pitch = this.dims.bead.height + 0.01
    for (let i = 0; i < this.max; i++) {
      if (i < shown) {
        this.tmp.makeRotationX(Math.PI / 2)
        this.tmp.setPosition(0, 0, 0.35 + i * pitch + this.dims.bead.height / 2)
      } else this.tmp.makeScale(0, 0, 0)
      this.beadsMesh.setMatrixAt(i, this.tmp)
      this.beadsMesh.setColorAt(i, this.color)
    }
    this.beadsMesh.instanceMatrix.needsUpdate = true
    this.beadsMesh.instanceColor!.needsUpdate = true
  }
}
