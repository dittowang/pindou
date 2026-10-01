import * as THREE from 'three'
import { applyBeadVertex, makeBeadUniforms, type BeadUniforms } from './beadShader'
import type { Dims } from '../config/physical'
import { FINISH_VERT_PARS, FINISH_VERT_MAIN, FINISH_FRAG_PARS, FINISH_COLOR, FINISH_ROUGH, FINISH_AO, FINISH_EMISSIVE, finishEnv } from './beadFinish'

/** Published hex values are design values: real white beads are ≈ #E8EDF0, black ≈ #2A2A2C and everything is a touch
 *  less saturated (research §5.4). Maps a linear colour into the photographed range. */
export function realBeadAlbedo(c: THREE.Color): THREE.Color {
  const l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b
  // desaturate slightly toward luma, then squeeze into [0.02, 0.80]
  const k = 0.9
  c.r = l + (c.r - l) * k; c.g = l + (c.g - l) * k; c.b = l + (c.b - l) * k
  c.r = 0.02 + 0.78 * c.r; c.g = 0.02 + 0.78 * c.g; c.b = 0.02 + 0.78 * c.b
  return c
}

export interface BeadMaterialSet {
  lit: THREE.MeshPhysicalMaterial
  depth: THREE.MeshDepthMaterial
  normal: THREE.MeshNormalMaterial
  uniforms: BeadUniforms
  /** sRGB colour of every peg cell, alpha 255 when occupied — lets melted beads bleed into neighbours */
  colorTex: THREE.DataTexture
  /** per cell: paper left stuck on the bead (R) and embedded lint (G), 0..255 */
  resTex: THREE.DataTexture
  /** surface imprint left by the cover sheet: x = kind (0 none, 1 weave, 2 dots), y = strength */
  surf: { value: THREE.Vector2 }
  grid: { value: THREE.Vector4 }
}

const FRAG_PARS = /* glsl */`
varying vec3 vBeadInfo;
varying vec2 vBoardXZ;
varying vec3 vBeadLocal;
varying vec3 vBeadNL;
uniform sampler2D uColorTex;
uniform vec4 uGrid;  // cols, rows, pitch, bleed
uniform vec3 uBeadLook; // roughness when unmelted, roughness when melted, translucency glow
uniform float uBeadH;
uniform sampler2D uResTex;
uniform vec2 uSurf;

float occAt(vec2 c){
  if (c.x < 0.0 || c.y < 0.0 || c.x >= uGrid.x || c.y >= uGrid.y) return 0.0;
  return texture2D(uColorTex, (c + 0.5) / uGrid.xy).a > 0.5 ? 1.0 : 0.0;
}
// Analytic ambient occlusion for a bead sitting in a field of beads: neighbours' walls, the hole's depth, the plate.
float beadAO(){
  float yN = clamp((vBeadLocal.y + 0.5 * uBeadH) / uBeadH, 0.0, 1.0);
  vec2 nxz = vBeadNL.xz;
  float nlen = clamp(length(nxz), 0.0, 1.0);
  vec2 nd = nlen > 1e-4 ? nxz / nlen : vec2(0.0);
  vec2 u = vBoardXZ / uGrid.z + 0.5 * uGrid.xy;
  vec2 cell = floor(u);
  float occ = 0.0;
  occ += occAt(cell + vec2( 1.0, 0.0)) * max(nd.x, 0.0);
  occ += occAt(cell + vec2(-1.0, 0.0)) * max(-nd.x, 0.0);
  occ += occAt(cell + vec2(0.0,  1.0)) * max(nd.y, 0.0);
  occ += occAt(cell + vec2(0.0, -1.0)) * max(-nd.y, 0.0);
  float depth = 1.0 - yN;
  float wall = 1.0 - 0.60 * clamp(occ, 0.0, 1.0) * nlen * pow(depth, 0.65);
  // inside the hole: darker the deeper you look
  vec2 radial = length(vBeadLocal.xz) > 1e-4 ? normalize(vBeadLocal.xz) : vec2(1.0, 0.0);
  float inward = step(dot(nd, radial), -0.2) * nlen;
  float hole = 1.0 - 0.72 * inward * pow(depth, 1.1);
  // foot of the bead touches the plate
  float foot = mix(1.0 - 0.45 * nlen, 1.0, smoothstep(0.0, 0.32, yN));
  return clamp(wall * hole * foot, 0.0, 1.0);
}
`

/** Lit material for pegged beads: soft satin PE plastic that turns glossy and bleeds colour as it melts. */
export function createBeadMaterials(cols: number, rows: number, dims: Dims): BeadMaterialSet {
  const pitch = dims.pitch
  const uniforms = makeBeadUniforms(dims)
  const data = new Uint8Array(cols * rows * 4)
  const colorTex = new THREE.DataTexture(data, cols, rows, THREE.RGBAFormat, THREE.UnsignedByteType)
  colorTex.colorSpace = THREE.SRGBColorSpace
  colorTex.magFilter = colorTex.minFilter = THREE.NearestFilter
  colorTex.needsUpdate = true
  const resData = new Uint8Array(cols * rows * 4)
  const resTex = new THREE.DataTexture(resData, cols, rows, THREE.RGBAFormat, THREE.UnsignedByteType)
  resTex.magFilter = resTex.minFilter = THREE.NearestFilter
  resTex.needsUpdate = true
  const surf = { value: new THREE.Vector2(0, 0) }
  const grid = { value: new THREE.Vector4(cols, rows, pitch, 1) }
  const look = { value: new THREE.Vector3(0.50, 0.30, 0.10) }

  const lit = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.5,
    metalness: 0,
    ior: 1.5,
    specularIntensity: 0.85,
    envMapIntensity: 1.0,
  })
  applyBeadVertex(lit, uniforms, true, {
    uniforms: { uColorTex: { value: colorTex }, uGrid: grid, uBeadLook: look, uResTex: { value: resTex }, uSurf: surf, uFinEnv: finishEnv },
    vertPars: FINISH_VERT_PARS,
    vertExtra: 'transformed.y += uBend * dot(instanceMatrix[3].xz, instanceMatrix[3].xz);\n vBoardXZ = (instanceMatrix * vec4(transformed, 1.0)).xz;\n' + FINISH_VERT_MAIN,
    fragPars: FRAG_PARS + FINISH_FRAG_PARS,
    frag: (s) => s
      .replace('#include <color_fragment>', /* glsl */`
        #include <color_fragment>
        ${FINISH_COLOR}
        {
          float melt = vBeadInfo.x;
          float bleedAmt = smoothstep(0.55, 1.15, melt) * uGrid.w;
          if (bleedAmt > 0.001) {
            vec2 u = vBoardXZ / uGrid.z + 0.5 * uGrid.xy;
            vec2 cell = floor(u);
            vec2 f = fract(u) - 0.5;
            vec2 d = abs(f.x) > abs(f.y) ? vec2(sign(f.x), 0.0) : vec2(0.0, sign(f.y));
            float e = max(abs(f.x), abs(f.y));
            float w = smoothstep(0.26, 0.5, e) * bleedAmt;
            vec2 nuv = (cell + d + 0.5) / uGrid.xy;
            vec4 nb = texture2D(uColorTex, nuv);
            if (nb.a > 0.5) { vec3 nrgb = nb.rgb; float nl = dot(nrgb, vec3(0.2126, 0.7152, 0.0722)); nrgb = nl + (nrgb - nl) * 0.9; nrgb = 0.02 + 0.78 * nrgb; diffuseColor.rgb = mix(diffuseColor.rgb, nrgb, w * 0.62); }
          }
          // what the heat did to the colour: a touch deeper/brighter, then darker + yellowing when over-melted
          diffuseColor.rgb *= 1.0 + 0.04 * clamp(melt, 0.0, 1.0) - 0.12 * clamp(melt - 1.0, 0.0, 0.7);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.08, 0.92, 0.55), smoothstep(1.45, 2.0, melt));
          // paper left stuck on the surface, lint ironed into it
          vec2 uu = vBoardXZ / uGrid.z + 0.5 * uGrid.xy;
          vec4 rs = texture2D(uResTex, (floor(uu) + 0.5) / uGrid.xy);
          float topFace = smoothstep(0.55, 0.9, vBeadNL.y);
          float botFace = smoothstep(0.55, 0.9, -vBeadNL.y);
          float faceRes = rs.r * topFace + rs.b * botFace;
          float scrap = faceRes * smoothstep(0.25, 0.7, melt);
          float tex = fract(sin(dot(floor(vBoardXZ * 160.0), vec2(12.9898, 78.233))) * 43758.5453);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.9, 0.84) * (0.9 + 0.1 * tex), scrap * smoothstep(0.35, 0.8, tex * 0.8 + faceRes * 0.45));
          float lintMark = (rs.g * topFace + rs.a * botFace) * smoothstep(0.2, 0.6, melt);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.1, 0.08, 0.07), lintMark * 0.8);
          // imprint of the cover sheet
          if (uSurf.x > 0.5 && melt > 0.3) {
            float sk = smoothstep(0.3, 0.7, melt) * max(topFace, botFace) * uSurf.y;
            vec2 wv = vBoardXZ * (uSurf.x > 1.5 ? 17.0 : 26.0) / (uGrid.z / 0.5);
            float pat = uSurf.x > 1.5 ? smoothstep(0.36, 0.16, length(fract(wv) - 0.5)) : 0.5 + 0.5 * sin(wv.x * 6.2831) * sin(wv.y * 6.2831);
            diffuseColor.rgb *= 1.0 - 0.10 * sk * pat;
          }
        }`)
      .replace('#include <roughnessmap_fragment>', /* glsl */`
        #include <roughnessmap_fragment>
        roughnessFactor = mix(uBeadLook.x, uBeadLook.y, smoothstep(0.30, 1.0, vBeadInfo.x));
        roughnessFactor = mix(roughnessFactor, 0.72 + 0.1 * uSurf.y, smoothstep(0.3, 0.7, vBeadInfo.x) * step(0.5, uSurf.x));
        ${FINISH_ROUGH}
      `)
      .replace('#include <aomap_fragment>', /* glsl */`
        {
          float ambientOcclusion = beadAO();
          ${FINISH_AO}
          reflectedLight.indirectDiffuse *= ambientOcclusion;
          #if defined( USE_CLEARCOAT )
            clearcoatSpecularIndirect *= ambientOcclusion;
          #endif
          #if defined( USE_ENVMAP ) && defined( STANDARD )
            float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
            reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
          #endif
        }`)
      .replace('#include <emissivemap_fragment>', /* glsl */`
        #include <emissivemap_fragment>
        {
          // thin PE walls pass a little light: a faint warm lift that follows the bead colour
          vec3 vv = normalize(vViewPosition);
          float ndv = clamp(abs(dot(normalize(vNormal), vv)), 0.0, 1.0);
          float rim = pow(1.0 - ndv, 2.0);
          totalEmissiveRadiance += diffuseColor.rgb * (uBeadLook.z * (0.35 + rim));
          ${FINISH_EMISSIVE}
        }`),
  })

  const depth = applyBeadVertex(new THREE.MeshDepthMaterial(), uniforms, false)
  const normal = applyBeadVertex(new THREE.MeshNormalMaterial(), uniforms, true)
  normal.blending = THREE.NoBlending
  return { lit, depth, normal, uniforms, colorTex, resTex, surf, grid }
}
