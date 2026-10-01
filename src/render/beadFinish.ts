import * as THREE from 'three'
import { PALETTE, type PaletteColor } from '../config/palette'
import { realBeadAlbedo } from './beadMaterial'

/**
 * What the special bead lines look like (research §6): jelly beads are glassy and let light through, pearl beads
 * shimmer pastel as you move, glow beads store daylight and shine when the lights go out, thermochromic beads change
 * colour with temperature, photochromic beads are white until a UV lamp turns them, glitter beads flash.
 *
 * Per-instance attributes
 *   aFin = (finish id, state 0..1, 0, 0)        state: thermochromic → warm, 0 = room temperature
 *   aAlt = linear colour of the other state     thermochromic: warm colour; photochromic: UV colour; glow: emission colour
 * Global uniform uFinEnv = (uv lamp 0..1, room darkness 0..1)
 */
export const FIN = { opaque: 0, translucent: 1, pearl: 2, glow: 3, thermochromic: 4, photochromic: 5, glitter: 6 } as const

export const FINISH_VERT_PARS = /* glsl */`
attribute vec4 aFin;
attribute vec3 aAlt;
varying vec4 vFin;
varying vec3 vAlt;
`
export const FINISH_VERT_MAIN = /* glsl */`
vFin = aFin;
vAlt = aAlt;
`
export const FINISH_FRAG_PARS = /* glsl */`
varying vec4 vFin;
varying vec3 vAlt;
uniform vec2 uFinEnv;
float finHash(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
`
/** after `color_fragment`: thermochromic / photochromic colour change */
export const FINISH_COLOR = /* glsl */`
{
  float fid = vFin.x;
  if (fid > 3.5 && fid < 4.5) diffuseColor.rgb = mix(diffuseColor.rgb, vAlt, smoothstep(0.0, 1.0, vFin.y));
  else if (fid > 4.5 && fid < 5.5) diffuseColor.rgb = mix(diffuseColor.rgb, vAlt, smoothstep(0.0, 1.0, uFinEnv.x));
  else if (fid > 0.5 && fid < 1.5) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), 0.07);   // jelly reads lighter than its pigment
}
`
/** after `roughnessmap_fragment` (roughnessFactor is in scope) */
export const FINISH_ROUGH = /* glsl */`
{
  float fid = vFin.x;
  if (fid > 0.5 && fid < 1.5) roughnessFactor = min(roughnessFactor, 0.2);            // jelly: glassy
  else if (fid > 1.5 && fid < 2.5) roughnessFactor = min(roughnessFactor, 0.26);      // pearl: satin-gloss
  else if (fid > 5.5) roughnessFactor = min(roughnessFactor, 0.32);                   // glitter
}
`
/** a function of the ambient-occlusion factor: light passes through jelly, so it is not dark in the hole */
export const FINISH_AO = /* glsl */`ambientOcclusion = mix(ambientOcclusion, 1.0, 0.5 * step(0.5, vFin.x) * (1.0 - step(1.5, vFin.x)));`
/** inside `emissivemap_fragment`: `ndv` and `rim` must be defined */
export const FINISH_EMISSIVE = /* glsl */`
{
  float fid = vFin.x;
  if (fid > 0.5 && fid < 1.5) {
    // jelly: the colour glows from inside where the plastic is thick, edges brighter
    totalEmissiveRadiance += diffuseColor.rgb * (0.30 + 0.5 * rim);
  } else if (fid > 1.5 && fid < 2.5) {
    // pearl: a thin pastel film whose hue turns with the view angle
    vec3 irid = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + (1.0 - ndv) * 1.35 + vViewPosition.x * 0.012));
    totalEmissiveRadiance += (irid * 0.5 + 0.5) * 0.085 * (0.4 + 1.4 * pow(1.0 - ndv, 1.6)) * (1.0 - 0.8 * uFinEnv.y);
  } else if (fid > 2.5 && fid < 3.5) {
    // glow-in-the-dark: faint daylight cast, then it shines as the room darkens
    totalEmissiveRadiance += vAlt * (0.012 + 1.5 * uFinEnv.y * (0.78 + 0.22 * ndv));
  } else if (fid > 5.5) {
    // glitter: flecks that flash with the view
    vec3 gp = floor(vViewPosition * vec3(55.0, 55.0, 0.0) + normalize(vNormal) * 40.0);
    float f = finHash(gp);
    float flash = smoothstep(0.93, 1.0, f) * (0.5 + 0.5 * sin(f * 90.0 + vViewPosition.x * 3.1 + vViewPosition.y * 2.3));
    totalEmissiveRadiance += vec3(1.0, 0.97, 0.9) * flash * 0.9 * (1.0 - 0.7 * uFinEnv.y);
    totalEmissiveRadiance += diffuseColor.rgb * 0.18 * (0.35 + rim);
  }
  // a room gone dark: whatever is not glowing sinks (the lamps are dimmed too, this keeps tint-lit surfaces honest)
}
`

/** the shared environment uniform for every bead material */
export const finishEnv = { value: new THREE.Vector2(0, 0) }

export interface FinishAttrs { id: number; state: number; alt: THREE.Color }

const _glow = new THREE.Color()

/** per-bead finish attributes for a palette entry (alt colour already in the lit linear range) */
export function finishAttrsFor(code: number): FinishAttrs {
  const c: PaletteColor | undefined = code >= 0 ? PALETTE[code] : undefined
  const alt = new THREE.Color(0, 0, 0)
  if (!c) return { id: 0, state: 0, alt }
  const id = FIN[c.finish] ?? 0
  const states = c.states as { warm?: string; uv?: string } | undefined
  if (c.finish === 'thermochromic' && states?.warm) { alt.set(states.warm); realBeadAlbedo(alt) }
  else if (c.finish === 'photochromic' && states?.uv) { alt.set(states.uv); realBeadAlbedo(alt) }
  else if (c.finish === 'glow') {
    // how glow pigment shines: yellow-green phosphor tinted a little toward the bead's own hue
    _glow.set(c.hex)
    alt.setRGB(0.32 + 0.35 * _glow.r, 0.95, 0.5 + 0.1 * _glow.b)
  }
  return { id, state: 0, alt }
}

/** attach `aFin`/`aAlt` instance attributes to a bead geometry */
export function addFinishAttributes(geo: THREE.BufferGeometry, n: number) {
  const aFin = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4)
  const aAlt = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3)
  aFin.setUsage(THREE.DynamicDrawUsage)
  geo.setAttribute('aFin', aFin)
  geo.setAttribute('aAlt', aAlt)
  return { aFin, aAlt }
}

/** write one instance's finish */
export function writeFinish(att: { aFin: THREE.InstancedBufferAttribute; aAlt: THREE.InstancedBufferAttribute }, slot: number, code: number) {
  const f = finishAttrsFor(code)
  att.aFin.setXYZW(slot, f.id, f.state, 0, 0)
  att.aAlt.setXYZ(slot, f.alt.r, f.alt.g, f.alt.b)
  att.aFin.needsUpdate = true
  att.aAlt.needsUpdate = true
}
