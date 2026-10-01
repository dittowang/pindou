import * as THREE from 'three'

/** GLSL noise toolbox used by the texture bakers. */
export const GLSL_NOISE = /* glsl */`
float hash11(float p){ p = fract(p*0.1031); p *= p+33.33; p *= p+p; return fract(p); }
float hash21(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*0.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*vec3(.1031,.1030,.0973)); p3 += dot(p3, p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  float a = hash21(i), b = hash21(i+vec2(1,0)), c = hash21(i+vec2(0,1)), d = hash21(i+vec2(1,1));
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
float fbm(vec2 p, int oct){
  float s = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < 8; i++){ if (i >= oct) break; s += a*vnoise(p); n += a; p = p*2.03 + 17.1; a *= 0.5; }
  return s/n;
}
vec3 srgb2lin(vec3 c){ return mix(c/12.92, pow((c+0.055)/1.055, vec3(2.4)), step(0.04045, c)); }
`

export interface BakeOptions {
  width: number
  height: number
  frag: string
  uniforms?: Record<string, THREE.IUniform>
  srgb?: boolean
  repeat?: boolean
  anisotropy?: number
}

const VERT = /* glsl */`
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`

/**
 * Render a fragment shader once into a texture. Procedural textures are generated on the GPU
 * at start-up (milliseconds, any resolution) instead of shipping image files.
 */
export function bake(renderer: THREE.WebGLRenderer, o: BakeOptions): THREE.Texture {
  const rt = new THREE.WebGLRenderTarget(o.width, o.height, {
    type: THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
    colorSpace: o.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
  })
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: `precision highp float;\nvarying vec2 vUv;\n${GLSL_NOISE}\n${o.frag}`,
    uniforms: o.uniforms ?? {},
    depthTest: false, depthWrite: false,
  })
  const geo = new THREE.PlaneGeometry(2, 2)
  const mesh = new THREE.Mesh(geo, mat)
  const scene = new THREE.Scene()
  scene.add(mesh)
  const cam = new THREE.Camera()
  const prevRT = renderer.getRenderTarget()
  const prevTM = renderer.toneMapping
  renderer.toneMapping = THREE.NoToneMapping
  renderer.setRenderTarget(rt)
  renderer.render(scene, cam)
  renderer.setRenderTarget(prevRT)
  renderer.toneMapping = prevTM
  mat.dispose(); geo.dispose()
  const tex = rt.texture
  tex.anisotropy = o.anisotropy ?? 8
  if (o.repeat) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping }
  return tex
}
