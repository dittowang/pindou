import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'

export interface Gfx {
  renderer: THREE.WebGLRenderer
  composer: EffectComposer
  gtao: GTAOPass | null
  quality: 'low' | 'medium' | 'high'
  /** the AO pre-pass must see the melt deformation — set the bead normal material here (re-applied after rebuilds) */
  normalMaterial: THREE.Material | null
  /** pixel-ratio ceiling (adaptive resolution) */
  dprCap: number
  setDprCap(c: number): void
  setSize(w: number, h: number): void
  setQuality(q: 'low' | 'medium' | 'high'): void
  render(): void
}

export function createGfx(canvas: HTMLCanvasElement, scene: THREE.Scene, camera: THREE.PerspectiveCamera, quality: 'low' | 'medium' | 'high'): Gfx {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true })
  renderer.outputColorSpace = THREE.SRGBColorSpace
  // Khronos PBR Neutral keeps base colours faithful — important when the product IS colour (bead palette).
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.toneMappingExposure = 1.0
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap

  const size = new THREE.Vector2()
  const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 })
  const composer = new EffectComposer(renderer, rt)
  const renderPass = new RenderPass(scene, camera)
  composer.addPass(renderPass)
  let gtao: GTAOPass | null = null
  let smaa: SMAAPass | null = null
  const output = new OutputPass()
  // a whisper of vignette and a gentle S-curve — what makes a render feel photographed
  const grade = new ShaderPass({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
      void main(){
        vec4 c = texture2D(tDiffuse, vUv);
        vec2 d = (vUv - 0.5) * vec2(1.0, 0.92);
        float v = smoothstep(0.92, 0.22, length(d));
        c.rgb *= mix(0.84, 1.0, v);
        c.rgb = mix(c.rgb, c.rgb * c.rgb * (3.0 - 2.0 * c.rgb), 0.16);
        gl_FragColor = c;
      }`,
  })

  let normalMat: THREE.Material | null = null
  let dprCap = quality === 'high' ? 2 : 1.5
  const build = (q: 'low' | 'medium' | 'high') => {
    // rebuild optional passes
    for (const p of [...composer.passes]) if (p !== renderPass) composer.removePass(p)
    if (gtao) { gtao.dispose(); gtao = null }
    if (q === 'high') {
      gtao = new GTAOPass(scene, camera, 4, 4)
      gtao.output = GTAOPass.OUTPUT.Default
      gtao.updateGtaoMaterial({ radius: 1.2, distanceExponent: 1.4, thickness: 0.8, scale: 1.0, samples: 8, distanceFallOff: 1.0, screenSpaceRadius: false })
      gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, radiusExponent: 1, rings: 2, samples: 8 })
      if (normalMat) (gtao as unknown as { normalMaterial: THREE.Material }).normalMaterial = normalMat
      // transparent films (clear plate, baking paper, guide rings …) must not be treated as solid by the AO pre-pass
      const g = gtao as unknown as { _overrideVisibility(): void; _visibilityCache: THREE.Object3D[] }
      const orig = g._overrideVisibility.bind(g)
      g._overrideVisibility = () => {
        orig()
        scene.traverse((o) => { if (o.userData.noAO && o.visible) { o.visible = false; g._visibilityCache.push(o) } })
      }
      composer.addPass(gtao)
    }
    composer.addPass(output)
    composer.addPass(grade)
    if (!smaa) smaa = new SMAAPass()
    // MSAA already smooths geometry; SMAA is only worth it at dpr 1
    if (renderer.getPixelRatio() < 1.5) composer.addPass(smaa)
    const s = renderer.getSize(size)
    composer.setSize(s.x, s.y)
    // AO at half resolution: it is a low-frequency signal and the bead field already has analytic AO
    if (gtao) gtao.setSize(s.x * renderer.getPixelRatio() * 0.5, s.y * renderer.getPixelRatio() * 0.5)
  }

  const gfx: Gfx = {
    renderer, composer,
    get gtao() { return gtao },
    get quality() { return quality },
    get normalMaterial() { return normalMat },
    set normalMaterial(m: THREE.Material | null) { normalMat = m; if (gtao && m) (gtao as unknown as { normalMaterial: THREE.Material }).normalMaterial = m },
    get dprCap() { return dprCap },
    setDprCap(c: number) { dprCap = c; gfx.setSize(lastW, lastH) },
    setSize(w, h) {
      lastW = w; lastH = h
      const dpr = Math.min(window.devicePixelRatio || 1, dprCap)
      renderer.setPixelRatio(dpr)
      renderer.setSize(w, h, false)
      composer.setPixelRatio(dpr)
      composer.setSize(w, h)
      if (gtao) gtao.setSize(w * dpr * 0.5, h * dpr * 0.5)
    },
    setQuality(q) { quality = q; dprCap = q === 'high' ? Math.max(dprCap, 1.75) : dprCap; build(q); gfx.setSize(lastW, lastH) },
    render() { composer.render() },
  } as Gfx
  let lastW = 1, lastH = 1
  build(quality)
  return gfx
}
