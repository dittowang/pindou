import * as THREE from 'three'
import type { Board } from './board'
import type { Dims } from '../config/physical'
import { bakeCrumple, bakePaperFibre } from './textures'
import { mulberry32 } from '../lib/rng'

/** Which sheet goes between the iron and the beads (research §3.6): each leaves its own surface and behaves differently. */
export type CoverId = 'parchment' | 'cloth' | 'loofah'
export const COVERS: Record<CoverId, { zh: string; note: string; opacity: number; rough: number; stickAt: number; imprint: number }> = {
  parchment: { zh: '烘焙纸', note: '便宜、薄、爱起皱；烫出雾面', opacity: 0.4, rough: 0.7, stickAt: 1.05, imprint: 0.0 },
  cloth: { zh: '烘焙布', note: '特氟龙粗纹布，耐烫不易粘；磨砂面', opacity: 0.34, rough: 0.82, stickAt: 1.35, imprint: 0.35 },
  loofah: { zh: '澡巾', note: '烫出一粒粒网点的软磨砂质感', opacity: 0.36, rough: 0.9, stickAt: 1.2, imprint: 1.0 },
}

export interface Lint { x: number; z: number; ang: number; len: number; kind: number; alive: boolean }

/**
 * The baking paper / cloth that lies over the beads while ironing.
 *  - rests on the beads (its height follows the bead tops, so it visibly sinks as the beads flatten),
 *  - wrinkles and curls from the roll; the heat relaxes it flat,
 *  - turns clearer where the beads have fused onto it (the cue shops tell you to look for),
 *  - peels back from a corner (the "peek"),
 *  - carries lint you can roll off — what's left gets ironed into the piece.
 */
export class BakingPaper {
  readonly group = new THREE.Group()
  readonly mesh: THREE.Mesh
  readonly mat: THREE.MeshPhysicalMaterial
  readonly size = new THREE.Vector2()
  /** per-cell data: R = melt (0..1.5), G = temperature (0..200 °C), B = occupied, A = residue */
  readonly dataTex: THREE.DataTexture
  /** per-cell piece thickness driver: max(melt top, melt bottom) / 1.5 */
  private heightTex: THREE.DataTexture
  private heightData: Uint8Array
  private data: Uint8Array
  private cols: number
  private rows: number
  readonly uniforms: Record<string, { value: unknown }>
  private lintCanvas: HTMLCanvasElement
  private lintTex: THREE.CanvasTexture
  lint: Lint[] = []
  private cover: CoverId = 'parchment'

  constructor(private board: Board, private dims: Dims, renderer: THREE.WebGLRenderer, seed = 5) {
    this.cols = board.layout.cols
    this.rows = board.layout.rows
    const margin = 3.0
    const W = board.size.x + margin * 2, D = board.size.y + margin * 2
    this.size.set(W, D)
    const segX = Math.min(260, Math.ceil(W / dims.pitch) * 2), segZ = Math.min(260, Math.ceil(D / dims.pitch) * 2)
    const geo = new THREE.PlaneGeometry(W, D, segX, segZ)
    geo.rotateX(-Math.PI / 2)

    this.data = new Uint8Array(this.cols * this.rows * 4)
    this.dataTex = new THREE.DataTexture(this.data, this.cols, this.rows, THREE.RGBAFormat, THREE.UnsignedByteType)
    this.dataTex.magFilter = THREE.LinearFilter
    this.dataTex.minFilter = THREE.LinearFilter
    this.dataTex.needsUpdate = true
    this.heightData = new Uint8Array(this.cols * this.rows)
    this.heightTex = new THREE.DataTexture(this.heightData, this.cols, this.rows, THREE.RedFormat, THREE.UnsignedByteType)
    this.heightTex.magFilter = THREE.LinearFilter
    this.heightTex.minFilter = THREE.LinearFilter
    this.heightTex.needsUpdate = true

    this.lintCanvas = document.createElement('canvas')
    this.lintCanvas.width = this.lintCanvas.height = 1024
    this.lintTex = new THREE.CanvasTexture(this.lintCanvas)
    this.lintTex.colorSpace = THREE.SRGBColorSpace

    const crumple = bakeCrumple(renderer)
    const fibre = bakePaperFibre(renderer)
    this.uniforms = {
      uData: { value: this.dataTex },
      uHeightTex: { value: this.heightTex },
      uFlipZ: { value: 0 },
      uGrid: { value: new THREE.Vector4(this.cols, this.rows, dims.pitch, board.plateTopY) },
      uBeadH: { value: dims.bead.height },
      uPegH: { value: dims.peg.h },
      uCrumple: { value: crumple },
      uWrinkle: { value: 1 },       // 1 = freshly unrolled, 0 = ironed flat
      uCurl: { value: 1 },
      uLint: { value: this.lintTex },
      uFold: { value: new THREE.Vector4(0, 0, 1, 0) },  // point on the fold line (x,z) and the unit normal (nx,nz)
      uFoldAng: { value: 0 },
      uThermal: { value: 0 },
      uSize: { value: new THREE.Vector2(W, D) },
      uOpacity: { value: COVERS.parchment.opacity },
      uImprint: { value: 0 },
      uTime: { value: 0 },
    }
    this.mat = new THREE.MeshPhysicalMaterial({
      color: 0xf4ecdd, roughness: 0.7, metalness: 0, transparent: true, opacity: 1, side: THREE.DoubleSide, depthWrite: false,
      normalMap: fibre.normal, normalScale: new THREE.Vector2(0.25, 0.25), sheen: 0.4, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xfff6e6),
      envMapIntensity: 0.8,
    })
    this.patch()
    this.mesh = new THREE.Mesh(geo, this.mat)
    this.mesh.renderOrder = 12
    this.mesh.frustumCulled = false
    this.mesh.castShadow = false
    this.mesh.userData.noAO = true
    this.mesh.receiveShadow = true
    this.group.add(this.mesh)
    this.group.name = 'paper'
    this.scatterLint(seed)
  }

  setCover(c: CoverId) {
    this.cover = c
    const spec = COVERS[c]
    this.uniforms.uOpacity.value = spec.opacity
    this.uniforms.uImprint.value = spec.imprint
    this.mat.roughness = spec.rough
    this.mat.color.set(c === 'cloth' ? 0xf1e4cf : c === 'loofah' ? 0xeadcc4 : 0xf4ecdd)
  }
  get coverId() { return this.cover }

  /** masking tape (美纹纸) instead of a cover sheet: cream-yellow, slightly glossy, no weave, lies flatter than paper */
  setTape() {
    this.uniforms.uOpacity.value = 0.6
    this.uniforms.uImprint.value = 0
    this.mat.roughness = 0.46
    this.mat.color.set(0xe8d49a)
    this.setFlatness(0.9)
  }

  // ---------------------------------------------------------------------------- lint
  private scatterLint(seed: number) {
    const r = mulberry32(seed * 977 + 13)
    this.lint = []
    const n = 46
    for (let i = 0; i < n; i++) {
      this.lint.push({
        x: (r() - 0.5) * (this.size.x - 1), z: (r() - 0.5) * (this.size.y - 1),
        ang: r() * Math.PI, len: 0.35 + r() * 0.9, kind: r() < 0.55 ? 0 : r() < 0.7 ? 1 : 2, alive: true,
      })
    }
    this.drawLint()
  }
  private drawLint() {
    const g = this.lintCanvas.getContext('2d')!
    const S = this.lintCanvas.width
    g.clearRect(0, 0, S, S)
    const px = (v: number, total: number) => ((v + total / 2) / total) * S
    for (const l of this.lint) {
      if (!l.alive) continue
      const x = px(l.x, this.size.x), y = px(l.z, this.size.y)
      const L = (l.len / this.size.x) * S
      g.save(); g.translate(x, y); g.rotate(l.ang)
      g.lineCap = 'round'
      if (l.kind === 0) {            // dark hair
        g.strokeStyle = 'rgba(40,32,28,.85)'; g.lineWidth = 1.6
        g.beginPath(); g.moveTo(-L / 2, 0); g.quadraticCurveTo(0, L * 0.35, L / 2, -L * 0.1); g.stroke()
      } else if (l.kind === 1) {     // pale fibre
        g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 2.4
        g.beginPath(); g.moveTo(-L / 2, 0); g.quadraticCurveTo(L * 0.1, -L * 0.3, L / 2, 0); g.stroke()
      } else {                        // dust bunny
        g.fillStyle = 'rgba(120,110,100,.65)'
        for (let k = 0; k < 6; k++) { g.beginPath(); g.arc((Math.random() - 0.5) * L * 0.5, (Math.random() - 0.5) * L * 0.5, 1.2 + Math.random() * 1.6, 0, Math.PI * 2); g.fill() }
      }
      g.restore()
    }
    this.lintTex.needsUpdate = true
  }
  /** redraw the lint texture after specks were switched off directly */
  refreshLint() { this.drawLint() }
  /** wipe lint within `r` cm of a point (board space); returns how many specks were lifted */
  rollAt(x: number, z: number, r: number): number {
    let n = 0
    for (const l of this.lint) {
      if (l.alive && (l.x - x) ** 2 + (l.z - z) ** 2 <= r * r) { l.alive = false; n++ }
    }
    if (n) this.drawLint()
    return n
  }
  get lintLeft() { return this.lint.filter((l) => l.alive).length }
  get lintTotal() { return this.lint.length }

  // ---------------------------------------------------------------------------- per-frame data
  /** push melt / temperature / occupancy / residue per cell to the GPU */
  updateData(occupied: Uint8Array, melt: Float32Array, temp: Float32Array, residue?: Float32Array, heightMelt?: Float32Array) {
    const d = this.data
    const hd = this.heightData
    for (let k = 0; k < occupied.length; k++) {
      hd[k] = Math.min(255, ((heightMelt ? heightMelt[k] : melt[k]) / 1.5) * 255)
      d[k * 4] = Math.min(255, (melt[k] / 1.5) * 255)
      d[k * 4 + 1] = Math.min(255, Math.max(0, (temp[k] / 200) * 255))
      d[k * 4 + 2] = occupied[k] ? 255 : 0
      d[k * 4 + 3] = residue ? Math.min(255, residue[k] * 255) : 0
    }
    this.dataTex.needsUpdate = true
    this.heightTex.needsUpdate = true
  }

  /** the piece was flipped (mirrors z in the cell lookups) and now rests on `baseY` (world y of the stone) */
  setBench(flipped: boolean, baseY: number, pegH: number) {
    this.uniforms.uFlipZ.value = flipped ? 1 : 0
    ;(this.uniforms.uGrid.value as THREE.Vector4).w = baseY
    this.uniforms.uPegH.value = pegH
  }

  /** 0 = lying flat, 1 = peeled back to ~150° (a corner at +x,+z peels first) */
  setPeel(t: number, corner: [number, number] = [1, 1]) {
    const nx = corner[0], nz = corner[1]
    const l = Math.hypot(nx, nz) || 1
    const n = new THREE.Vector2(nx / l, nz / l)
    // fold line passes through a point that sweeps from the far corner toward the middle as t grows
    const reach = (this.size.x * Math.abs(n.x) + this.size.y * Math.abs(n.y)) / 2
    const p = n.clone().multiplyScalar(reach * (1.04 - 1.9 * Math.min(1, t)))
    ;(this.uniforms.uFold.value as THREE.Vector4).set(p.x, p.y, n.x, n.y)
    this.uniforms.uFoldAng.value = THREE.MathUtils.smoothstep(t, 0, 0.18) * 2.6
  }

  setThermal(v: number) { this.uniforms.uThermal.value = v }
  setFlatness(f: number) { this.uniforms.uWrinkle.value = 1 - f; this.uniforms.uCurl.value = 1 - f }

  // ---------------------------------------------------------------------------- shader
  private patch() {
    const u = this.uniforms
    this.mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u)
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', /* glsl */`
          #include <common>
          uniform sampler2D uData; uniform sampler2D uHeightTex; uniform float uFlipZ; uniform vec4 uGrid; uniform float uBeadH; uniform float uPegH;
          uniform sampler2D uCrumple; uniform float uWrinkle; uniform float uCurl;
          uniform vec4 uFold; uniform float uFoldAng; uniform vec2 uSize;
          varying vec2 vPaperUv; varying vec3 vBoardPos; varying float vHeat;
          float thickRatio(float u){
            if (u < 0.10) return mix(1.00, 0.98, u / 0.10);
            if (u < 0.25) return mix(0.98, 0.90, (u - 0.10) / 0.15);
            if (u < 0.45) return mix(0.90, 0.78, (u - 0.25) / 0.20);
            if (u < 0.75) return mix(0.78, 0.64, (u - 0.45) / 0.30);
            if (u < 1.00) return mix(0.64, 0.54, (u - 0.75) / 0.25);
            return mix(0.54, 0.50, clamp((u - 1.0) / 0.3, 0.0, 1.0));
          }
          // bead top (0 where there is no bead) at a cell-space position
          vec2 flipG(vec2 g){ return uFlipZ > 0.5 ? vec2(g.x, uGrid.y - g.y) : g; }
          float beadTop(vec2 g0){
            vec2 g = flipG(g0);
            vec2 uv = clamp(g / uGrid.xy, 0.0, 1.0);
            vec4 d = texture2D(uData, uv);
            float hm = texture2D(uHeightTex, uv).r;
            float inside = step(0.0, g.x) * step(g.x, uGrid.x) * step(0.0, g.y) * step(g.y, uGrid.y);
            return d.b * uBeadH * thickRatio(hm * 1.5) * inside;
          }
          // height of the paper above the plate at a board-space xz: it rests on the highest bead within half a cell
          float paperH(vec2 xz){
            vec2 g = xz / uGrid.z + 0.5 * uGrid.xy;                 // cell coords
            vec2 gf = flipG(g);
            vec4 d = texture2D(uData, clamp(gf / uGrid.xy, 0.0, 1.0));
            float inside = step(0.0, gf.x) * step(gf.x, uGrid.x) * step(0.0, gf.y) * step(gf.y, uGrid.y);
            float melt = d.r * 1.5;
            float top = max(max(beadTop(g), beadTop(g + vec2(0.5, 0.0))), max(beadTop(g - vec2(0.5, 0.0)), max(beadTop(g + vec2(0.0, 0.5)), beadTop(g - vec2(0.0, 0.5)))));
            float rest = max(top, uPegH * 0.55 * inside);            // empty pegs hold the paper a little too
            float h = rest;
            // wrinkles & roll-curl relax with heat
            vec2 wuv = xz * 0.11;
            float w = texture2D(uCrumple, wuv).r;
            float ironed = smoothstep(0.08, 0.5, melt) * d.b;
            float amp = uWrinkle * (1.0 - 0.92 * ironed);
            h += (w - 0.35) * 0.55 * amp;
            float curl = uCurl * 0.5 * pow(abs(xz.x) / (uSize.x * 0.5), 2.4) * (1.0 - 0.9 * inside * (0.4 + 0.6 * ironed));
            h += curl;
            return h;
          }
        `)
        .replace('#include <beginnormal_vertex>', /* glsl */`
          vec2 pxz = position.xz;
          float e = 0.07;
          float h0 = paperH(pxz);
          float hx = paperH(pxz + vec2(e, 0.0)) - paperH(pxz - vec2(e, 0.0));
          float hz = paperH(pxz + vec2(0.0, e)) - paperH(pxz - vec2(0.0, e));
          vec3 objectNormal = normalize(vec3(-hx / (2.0 * e), 1.0, -hz / (2.0 * e)));
          #ifdef USE_TANGENT
            vec3 objectTangent = vec3( tangent.xyz );
          #endif
        `)
        .replace('#include <begin_vertex>', /* glsl */`
          vec3 transformed = vec3(position.x, uGrid.w + h0 + 0.012, position.z);
          // peel back from the fold line
          {
            vec2 n = uFold.zw;
            float dd = dot(transformed.xz - uFold.xy, n);
            if (dd > 0.0 && uFoldAng > 0.0) {
              float k = min(dd, 6.0);
              float ang = uFoldAng * smoothstep(0.0, 1.2, dd);
              vec3 q = vec3(uFold.x, uGrid.w + 0.3, uFold.y);
              vec3 r = transformed - q;
              float rn = dot(r.xz, n);
              vec2 t2 = r.xz - n * rn;
              float ny = r.y;
              float c = cos(ang), s = sin(ang);
              float rn2 = rn * c - ny * s;
              float ny2 = rn * s + ny * c;
              transformed = vec3(q.x + t2.x + n.x * rn2, q.y + ny2, q.z + t2.y + n.y * rn2);
              objectNormal = normalize(vec3(n.x * (-s) , c, n.y * (-s)));
            }
          }
          vPaperUv = position.xz / uSize + 0.5;
          vBoardPos = transformed;
        `)
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', /* glsl */`
          #include <common>
          uniform sampler2D uData; uniform float uFlipZ; uniform vec4 uGrid; uniform sampler2D uLint; uniform float uThermal; uniform float uOpacity; uniform float uImprint;
          varying vec2 vPaperUv; varying vec3 vBoardPos; varying float vHeat;
          vec3 heatRamp(float t){            // thermal-camera colours
            t = clamp(t, 0.0, 1.0);
            vec3 a = vec3(0.10, 0.18, 0.55), b = vec3(0.12, 0.62, 0.78), c = vec3(0.98, 0.86, 0.22), d = vec3(0.95, 0.32, 0.12), e = vec3(1.0, 0.92, 0.9);
            return t < 0.25 ? mix(a, b, t / 0.25) : t < 0.5 ? mix(b, c, (t - 0.25) / 0.25) : t < 0.8 ? mix(c, d, (t - 0.5) / 0.3) : mix(d, e, (t - 0.8) / 0.2);
          }
        `)
        .replace('#include <color_fragment>', /* glsl */`
          #include <color_fragment>
          vec2 cg = vBoardPos.xz / uGrid.z + 0.5 * uGrid.xy;
          if (uFlipZ > 0.5) cg.y = uGrid.y - cg.y;
          vec4 cd = texture2D(uData, clamp(cg / uGrid.xy, 0.0, 1.0));
          float cInside = step(0.0, cg.x) * step(cg.x, uGrid.x) * step(0.0, cg.y) * step(cg.y, uGrid.y);
          float cMelt = cd.r * 1.5 * cInside * cd.b;
          // clearer where beads have fused onto it
          float alpha = mix(uOpacity, uOpacity * 0.32, smoothstep(0.04, 0.55, cMelt));
          alpha = mix(alpha, 0.92, cd.a);                      // paper left stuck to the surface
          diffuseColor.a *= alpha;
          vec4 lint = texture2D(uLint, vec2(vPaperUv.x, vPaperUv.y));
          diffuseColor.rgb = mix(diffuseColor.rgb, lint.rgb, lint.a * 0.9);
          diffuseColor.a = mix(diffuseColor.a, 0.95, lint.a * 0.8);
          // thermal-vision overlay
          float tt = cd.g * 200.0;
          vec3 hc = heatRamp((tt - 25.0) / 130.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, hc, uThermal * cInside * 0.92);
          diffuseColor.a = mix(diffuseColor.a, 0.9, uThermal * cInside);
          // loofah / cloth weave
          if (uImprint > 0.0) {
            vec2 wv = vBoardPos.xz * 11.0;
            float dots = smoothstep(0.34, 0.2, length(fract(wv) - 0.5));
            diffuseColor.rgb *= 1.0 - 0.12 * uImprint * dots;
          }
        `)
        .replace('#include <roughnessmap_fragment>', /* glsl */`
          #include <roughnessmap_fragment>
          roughnessFactor = mix(roughnessFactor, 0.32, smoothstep(0.1, 0.7, cMelt));
        `)
    }
    this.mat.customProgramCacheKey = () => 'baking-paper'
  }

  tick(dt: number) { (this.uniforms.uTime.value as number) += dt }
  dispose() { this.mesh.geometry.dispose(); this.mat.dispose(); this.dataTex.dispose(); this.lintTex.dispose() }
}
