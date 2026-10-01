import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { bake } from './bake'

/**
 * The heat-sink slab (大理石 / 瓷砖 / 岩板): polished white stone with soft grey veining, baked on the GPU.
 * Real stone is thermally massive — it pulls heat out of the beads, which is why shops put it under the board.
 */
export function createMarbleSlab(renderer: THREE.WebGLRenderer, w: number, d: number, t = 1.3, seed = 3): THREE.Mesh {
  const frag = (mode: number) => /* glsl */`
    uniform vec2 uSeed;
    float veins(vec2 p){
      vec2 q = vec2(fbm(p*0.9 + uSeed, 5), fbm(p*0.9 + 7.3 + uSeed, 5));
      float f = fbm(p*1.6 + q*2.6, 6);
      float v = abs(f - 0.5) * 2.0;                 // 0 on the vein
      float thin = smoothstep(0.0, 0.07, v);         // thin crisp vein
      float wide = smoothstep(0.0, 0.34, v);         // soft haze around it
      return 1.0 - (1.0 - thin) * 0.55 - (1.0 - wide) * 0.16;
    }
    void main(){
      vec2 p = vUv * 6.0;
      float vv = veins(p);
      float cloud = fbm(p*0.7 + 31.0 + uSeed, 4);
      ${mode === 0 ? `
      vec3 base = srgb2lin(vec3(0.935, 0.93, 0.92));
      vec3 vein = srgb2lin(vec3(0.46, 0.47, 0.50));
      vec3 c = mix(vein, base, vv) * (0.97 + 0.05 * cloud);
      c += srgb2lin(vec3(0.02, 0.015, 0.0)) * smoothstep(0.55, 0.9, cloud);
      gl_FragColor = vec4(c, 1.0);` : `
      float r = 0.07 + 0.06 * (1.0 - vv) + 0.03 * cloud;
      gl_FragColor = vec4(0.0, r, 0.0, 1.0);`}
    }`
  const uniforms = { uSeed: { value: new THREE.Vector2(seed * 3.7, seed * 1.3) } }
  const map = bake(renderer, { width: 2048, height: 2048, srgb: true, uniforms, frag: frag(0) })
  const rough = bake(renderer, { width: 1024, height: 1024, uniforms, frag: frag(1) })
  map.wrapS = map.wrapT = THREE.RepeatWrapping
  const geo = new RoundedBoxGeometry(w, t, d, 4, 0.12)
  // box UVs run 0..1 per face; the top face is what we see
  const mat = new THREE.MeshPhysicalMaterial({
    map, roughnessMap: rough, roughness: 1, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.12, envMapIntensity: 1.0,
    specularIntensity: 1,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.name = 'marble'
  return mesh
}
