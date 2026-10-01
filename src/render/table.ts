import * as THREE from 'three'
import { TABLE } from '../config/physical'
import { bakeWood } from './textures'

export interface Table { mesh: THREE.Mesh; maps: ReturnType<typeof bakeWood> }

export function createTable(renderer: THREE.WebGLRenderer): Table {
  const size = new THREE.Vector2(TABLE.width, TABLE.depth)
  const maps = bakeWood(renderer, size, 4096)
  const mat = new THREE.MeshPhysicalMaterial({
    map: maps.map,
    roughnessMap: maps.roughnessMap,
    roughness: 1,
    normalMap: maps.normalMap,
    normalScale: new THREE.Vector2(0.55, 0.55),
    metalness: 0,
    clearcoat: 0.18,
    clearcoatRoughness: 0.5,
    envMapIntensity: 0.9,
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size.x, size.y), mat)
  mesh.rotation.x = -Math.PI / 2
  mesh.receiveShadow = true
  mesh.name = 'table'
  return { mesh, maps }
}
