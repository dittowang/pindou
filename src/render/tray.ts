import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Dims } from '../config/physical'

export interface Tray {
  group: THREE.Group
  /** top edge of the walls */
  topY: number
  /** world y of the floor of the wells */
  floorY: number
  /** inner side of one (square) well, cm */
  inner: number
  dispose(): void
  /** world-space centre of well i at the top of the floor */
  wellCenter(i: number, out?: THREE.Vector3): THREE.Vector3
  /** index of the well under world (x,z), or -1 */
  wellAt(x: number, z: number): number
  readonly count: number
  readonly size: THREE.Vector2
  /** centre of the whole tray in world space */
  origin: THREE.Vector3
}

export function createTray(origin: THREE.Vector3, dims: Dims): Tray {
  const { cols, rows, well, wall, floor, depth } = dims.tray
  const W = cols * well + (cols + 1) * wall
  const D = rows * well + (rows + 1) * wall
  const H = floor + depth
  const group = new THREE.Group()
  group.position.copy(origin)
  group.name = 'tray'

  const parts: THREE.BufferGeometry[] = []
  const box = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const g = new RoundedBoxGeometry(w, h, d, 2, Math.min(0.06, Math.min(w, h, d) * 0.45))
    g.translate(x, y, z)
    parts.push(g.index ? g.toNonIndexed() : g)
  }
  // floor slab
  box(W, floor, D, 0, floor / 2, 0)
  // outer walls
  box(W, depth, wall, 0, floor + depth / 2, -D / 2 + wall / 2)
  box(W, depth, wall, 0, floor + depth / 2, D / 2 - wall / 2)
  box(wall, depth, D - 2 * wall, -W / 2 + wall / 2, floor + depth / 2, 0)
  box(wall, depth, D - 2 * wall, W / 2 - wall / 2, floor + depth / 2, 0)
  // dividers (a touch lower than the rim so beads can be nudged across by tweezers, as in real trays)
  for (let c = 1; c < cols; c++) {
    const x = -W / 2 + wall + c * (well + wall) - wall / 2
    box(wall, depth * 0.92, D - 2 * wall, x, floor + (depth * 0.92) / 2, 0)
  }
  for (let r = 1; r < rows; r++) {
    const z = -D / 2 + wall + r * (well + wall) - wall / 2
    box(W - 2 * wall, depth * 0.92, wall, 0, floor + (depth * 0.92) / 2, z)
  }
  const merged = mergeGeometries(parts, false)!
  parts.forEach((p) => p.dispose())
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xe9e8e3, roughness: 0.34, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.32, specularIntensity: 0.9, envMapIntensity: 0.9,
  })
  const mesh = new THREE.Mesh(merged, mat)
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.name = 'trayMesh'
  group.add(mesh)

  const wellCenter = (i: number, out = new THREE.Vector3()) => {
    const c = i % cols, r = Math.floor(i / cols)
    const x = -W / 2 + wall + c * (well + wall) + well / 2
    const z = -D / 2 + wall + r * (well + wall) + well / 2
    return out.set(origin.x + x, origin.y + floor, origin.z + z)
  }
  const wellAt = (x: number, z: number) => {
    const lx = x - origin.x + W / 2 - wall, lz = z - origin.z + D / 2 - wall
    if (lx < 0 || lz < 0) return -1
    const c = Math.floor(lx / (well + wall)), r = Math.floor(lz / (well + wall))
    if (c < 0 || c >= cols || r < 0 || r >= rows) return -1
    // inside the well, not on the divider
    const fx = lx - c * (well + wall), fz = lz - r * (well + wall)
    if (fx > well || fz > well) return -1
    return r * cols + c
  }
  const dispose = () => {
    group.parent?.remove(group)
    merged.dispose(); mat.dispose()
  }
  return { group, topY: origin.y + H, floorY: origin.y + floor, inner: well, dispose, wellCenter, wellAt, count: cols * rows, size: new THREE.Vector2(W, D), origin: origin.clone() }
}
