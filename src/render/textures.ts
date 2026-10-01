import * as THREE from 'three'
import { bake } from './bake'

export interface PbrMaps { map: THREE.Texture; roughnessMap: THREE.Texture; normalMap: THREE.Texture }

const WOOD_COMMON = /* glsl */`
// planks run along X. p in centimetres.
const float PLANK = 13.0;
void woodAt(vec2 p, out vec3 col, out float rough, out float h){
  float id = floor(p.y / PLANK);
  float py = p.y - id*PLANK;
  float s1 = hash11(id*1.37+0.5), s2 = hash11(id*7.11+3.0), s3 = hash11(id*3.77+9.0), s4 = hash11(id*5.19+1.0);
  vec2 q = vec2(p.x*0.30 + s1*300.0, py + s2*100.0);
  float flow  = fbm(vec2(q.x*0.045, q.y*0.35), 5);
  float fib   = fbm(vec2(q.x*0.55, q.y*11.0), 4);
  float fine  = fbm(vec2(q.x*1.8,  q.y*38.0), 3);
  float ringP = (py*0.78 + (flow-0.5)*9.0 + s3*6.28) * 5.2;
  float ring = pow(0.5+0.5*sin(ringP), 2.4);
  float tone = clamp(0.30*ring + 0.55*flow + 0.28*fib + 0.14*fine - 0.30, 0.0, 1.0);
  vec3 lightC = srgb2lin(vec3(0.80, 0.68, 0.53));
  vec3 darkC  = srgb2lin(vec3(0.58, 0.45, 0.32));
  col = mix(lightC, darkC, tone);
  col *= 0.92 + 0.16*s1;
  col = mix(col, col*vec3(1.04,0.97,0.90), s4);
  float pore = smoothstep(0.66, 0.86, fbm(vec2(q.x*2.6, q.y*44.0), 2));
  col *= 1.0 - 0.22*pore;
  float edge = min(py, PLANK-py);
  float seam = smoothstep(0.0, 0.10, edge);
  col *= mix(0.30, 1.0, seam);
  rough = clamp(0.58 + 0.22*fib - 0.12*ring + 0.12*pore, 0.3, 0.95);
  rough = mix(0.9, rough, seam);
  h = 0.55*fib + 0.35*fine + 0.4*pore*(-1.0) - (1.0-seam)*1.2 + 0.12*ring;
}
`

/** Oak plank tabletop, baked on the GPU. Texture spans `size` cm. */
export function bakeWood(renderer: THREE.WebGLRenderer, sizeCm: THREE.Vector2, res = 4096): PbrMaps {
  const uniforms = { uSize: { value: sizeCm.clone() } }
  const common = `uniform vec2 uSize;\n${WOOD_COMMON}`
  const map = bake(renderer, {
    width: res, height: Math.round(res * sizeCm.y / sizeCm.x), srgb: true, uniforms,
    frag: `${common}
      void main(){ vec3 c; float r, h; woodAt(vUv*uSize, c, r, h); gl_FragColor = vec4(c, 1.0); }`,
  })
  const roughnessMap = bake(renderer, {
    width: res >> 1, height: Math.round((res >> 1) * sizeCm.y / sizeCm.x), uniforms,
    frag: `${common}
      void main(){ vec3 c; float r, h; woodAt(vUv*uSize, c, r, h); gl_FragColor = vec4(0.0, r, 0.0, 1.0); }`,
  })
  const normalMap = bake(renderer, {
    width: res, height: Math.round(res * sizeCm.y / sizeCm.x), uniforms,
    frag: `${common}
      float H(vec2 p){ vec3 c; float r, h; woodAt(p, c, r, h); return h; }
      void main(){
        vec2 p = vUv*uSize; float e = 0.012;
        float dx = H(p+vec2(e,0.)) - H(p-vec2(e,0.));
        float dy = H(p+vec2(0.,e)) - H(p-vec2(0.,e));
        vec3 n = normalize(vec3(-dx*0.9, -dy*0.9, 1.0));
        gl_FragColor = vec4(n*0.5+0.5, 1.0);
      }`,
  })
  return { map, roughnessMap, normalMap }
}

/** Fine paper fibre: used as bump/roughness detail on printed sheets. (tileable over 1 uv) */
export function bakePaperFibre(renderer: THREE.WebGLRenderer, res = 1024): { height: THREE.Texture; normal: THREE.Texture } {
  const common = /* glsl */`
    float paperH(vec2 p){
      float a = fbm(p*60.0, 4);
      float f1 = fbm(vec2(p.x*220.0, p.y*40.0), 3);
      float f2 = fbm(vec2(p.x*40.0, p.y*220.0), 3);
      return a*0.5 + f1*0.25 + f2*0.25;
    }`
  const height = bake(renderer, { width: res, height: res, repeat: true, frag: `${common}
    void main(){ float h = paperH(vUv); gl_FragColor = vec4(vec3(h), 1.0); }` })
  const normal = bake(renderer, { width: res, height: res, repeat: true, frag: `${common}
    void main(){
      float e = 1.0/${res}.0;
      float dx = paperH(vUv+vec2(e,0.)) - paperH(vUv-vec2(e,0.));
      float dy = paperH(vUv+vec2(0.,e)) - paperH(vUv-vec2(0.,e));
      vec3 n = normalize(vec3(-dx*6.0, -dy*6.0, 1.0));
      gl_FragColor = vec4(n*0.5+0.5, 1.0);
    }` })
  return { height, normal }
}

/** Brushed metal: fine streaks along U. Returns a normal map and a roughness map (G channel). */
export function bakeBrushedMetal(renderer: THREE.WebGLRenderer, res = 1024): { normal: THREE.Texture; roughness: THREE.Texture } {
  const common = /* glsl */`
    float brushH(vec2 p){
      float a = fbm(vec2(p.x*6.0,  p.y*260.0), 3);
      float b = fbm(vec2(p.x*22.0, p.y*620.0), 2);
      float c = fbm(vec2(p.x*2.0,  p.y*40.0), 3);
      return a*0.55 + b*0.35 + c*0.25;
    }`
  const normal = bake(renderer, { width: res, height: res, repeat: true, frag: `${common}
    void main(){
      float e = 1.0/${res}.0;
      float dx = brushH(vUv+vec2(e,0.)) - brushH(vUv-vec2(e,0.));
      float dy = brushH(vUv+vec2(0.,e)) - brushH(vUv-vec2(0.,e));
      vec3 n = normalize(vec3(-dx*1.2, -dy*9.0, 1.0));
      gl_FragColor = vec4(n*0.5+0.5, 1.0);
    }` })
  const roughness = bake(renderer, { width: res >> 1, height: res >> 1, repeat: true, frag: `${common}
    void main(){ float h = brushH(vUv); gl_FragColor = vec4(0.0, 0.6 + 0.5*(h-0.5), 0.0, 1.0); }` })
  return { normal, roughness }
}

/** Crumple height map for baking paper: ridged noise, tileable enough at the scales we use. */
export function bakeCrumple(renderer: THREE.WebGLRenderer, res = 512): THREE.Texture {
  const t = bake(renderer, { width: res, height: res, repeat: true, frag: `
    float ridge(vec2 p){ return 1.0 - abs(2.0 * fbm(p, 4) - 1.0); }
    void main(){
      vec2 p = vUv * 5.0;
      float a = ridge(p * 1.0 + 3.0);
      float b = ridge(p * 2.3 + 11.0);
      float c = fbm(p * 0.7 + 21.0, 3);
      float h = pow(a, 2.2) * 0.55 + pow(b, 2.0) * 0.25 + c * 0.35;
      gl_FragColor = vec4(vec3(h), 1.0);
    }` })
  return t
}
