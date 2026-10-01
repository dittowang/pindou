import * as THREE from 'three'
import type { Dims } from '../config/physical'

/**
 * Melt deformation shared by every material that draws a pegged bead
 * (lit, shadow-depth, GTAO normal pre-pass), so shadows and AO follow the melt.
 *
 * Per-instance attribute  aBead = (meltTop, meltBottom, seed+1, lengthScale)
 *   meltTop/meltBottom : heat dose u of each face — 0 loose, .25 edges fused (window look), .45–.75 holes shrinking
 *                        (the target), 1 closed slab, >1.3 over-melted.  Stage table: docs/research/materials-physics.md §3.2
 *   seed+1            : >=1 marks "this is a bead" (so the shared override materials leave other meshes alone)
 * Per-instance attribute  aTilt = (tiltX, tiltZ, 0, 0) radians, relaxes to 0 as the bead melts.
 */
export const BEAD_VERT_PARS = /* glsl */`
attribute vec4 aBead;
attribute vec2 aTilt;
varying vec3 vBeadInfo;   // x: melt at this height, y: seed, z: 1 if bead
varying vec2 vBoardXZ;
varying vec3 vBeadLocal;  // deformed bead-local position
varying vec3 vBeadNL;     // deformed bead-local normal
uniform float uBeadHole;
uniform float uBeadR;
uniform float uBeadH;
uniform float uCell;   // half of the peg pitch: the square a melted bead grows into
uniform float uBend;   // cooling curl of the whole piece (cm of lift per cm² from the centre)

mat3 beadRotX(float a){ float c=cos(a), s=sin(a); return mat3(1.,0.,0., 0.,c,s, 0.,-s,c); }
mat3 beadRotZ(float a){ float c=cos(a), s=sin(a); return mat3(c,s,0., -s,c,0., 0.,0.,1.); }

// stage curves from the research table (hole Ø and thickness vs heat dose u)
float holeRatio(float u){
  if (u < 0.25) return 1.0;
  if (u < 0.45) return mix(1.00, 0.88, (u - 0.25) / 0.20);
  if (u < 0.75) return mix(0.88, 0.52, (u - 0.45) / 0.30);
  return mix(0.52, 0.0, clamp((u - 0.75) / 0.25, 0.0, 1.0));
}
float thickRatio(float u){
  if (u < 0.10) return mix(1.00, 0.98, u / 0.10);
  if (u < 0.25) return mix(0.98, 0.90, (u - 0.10) / 0.15);
  if (u < 0.45) return mix(0.90, 0.78, (u - 0.25) / 0.20);
  if (u < 0.75) return mix(0.78, 0.64, (u - 0.45) / 0.30);
  if (u < 1.00) return mix(0.64, 0.54, (u - 0.75) / 0.25);
  return mix(0.54, 0.50, clamp((u - 1.0) / 0.3, 0.0, 1.0));
}

// returns deformed position + normal; no-op for geometry that is not a bead
void beadDeform(in vec3 pos, in vec3 nor, out vec3 outPos, out vec3 outNor, out float outMelt){
  outPos = pos; outNor = nor; outMelt = 0.0;
  if (aBead.z < 0.5) return;
  float R0 = uBeadR, r0 = uBeadHole, h = 0.5 * uBeadH;
  float seed = aBead.z - 1.0;
  float rad = length(pos.xz);
  vec2 dir = rad > 1e-5 ? pos.xz / rad : vec2(1.0, 0.0);
  float yN = clamp((pos.y + h) / (2.0 * h), 0.0, 1.0);
  float mT = aBead.x, mB = aBead.y;
  float m = mix(mB, mT, yN);
  outMelt = m;
  float mm = clamp(m, 0.0, 1.25);

  // --- radial: circle → rounded square (fills its cell), hole pinches shut ---------------------------
  float p = mix(2.0, 8.0, smoothstep(0.04, 0.80, mm));
  vec2 ad = abs(dir);
  float sq = uCell * pow(pow(ad.x, p) + pow(ad.y, p), -1.0 / p);       // superellipse radius at this angle
  float holeNew = max(0.006, r0 * holeRatio(mm));
  float tIn = clamp((rad - r0) / (R0 - r0), 0.0, 1.0);
  float outer = mix(R0, sq, smoothstep(0.02, 0.45, mm));
  float radNew = holeNew + tIn * (outer - holeNew);
  vec3 q = vec3(dir.x * radNew, pos.y, dir.y * radNew);

  // --- vertical: the face that met the iron takes the squash; lengths even out ---------------------
  float lenS = mix(aBead.w, 1.0, smoothstep(0.08, 0.6, max(mT, mB)));
  float F = thickRatio(max(mT, mB));
  float wT = mT / max(mT + mB, 1e-4);
  float cutT = (1.0 - F) * uBeadH * wT;
  float cutB = (1.0 - F) * uBeadH * (1.0 - wT);
  float yBot = -h + cutB;
  float yTop = yBot + (2.0 * h - cutT - cutB) * lenS;
  q.y = mix(yBot, yTop, yN);
  // a faint dome while the plastic is still liquid-ish and nothing has flattened it yet
  q.y += 0.04 * uBeadH * sin(clamp(mT, 0.0, 1.0) * 3.14159) * yN * (1.0 - smoothstep(0.6, 1.0, mT)) * (0.5 - tIn * 0.5);

  // --- normal ---------------------------------------------------------------------------------
  float nr = dot(nor.xz, dir);
  float ny = nor.y;
  vec2 g = vec2(sign(dir.x) * pow(ad.x, p - 1.0), sign(dir.y) * pow(ad.y, p - 1.0));
  g = length(g) > 1e-5 ? normalize(g) : dir;
  vec2 radialDir = mix(dir, g, smoothstep(0.05, 0.7, mm));
  vec3 n;
  if (nr >= 0.0) {
    n = vec3(radialDir.x * nr, ny, radialDir.y * nr);
  } else {
    // hole wall: funnel-shaped once the top has pinched more than the bottom
    float slope = r0 * (holeRatio(clamp(mT,0.,1.25)) - holeRatio(clamp(mB,0.,1.25))) / uBeadH;
    n = vec3(dir.x * nr, ny + abs(nr) * slope, dir.y * nr);
  }
  n = normalize(n);

  // --- seating wobble that relaxes as soon as the bead starts to melt --------------------------
  float relax = 1.0 - smoothstep(0.05, 0.5, max(mT, mB));
  mat3 rot = beadRotX(aTilt.x * relax) * beadRotZ(aTilt.y * relax);
  vec3 base = vec3(0.0, -h, 0.0);
  q = rot * (q - base) + base;
  n = rot * n;

  outPos = q; outNor = n;
}
`

/** vertex main(): run once, early (before the normal is transformed) */
export const BEAD_VERT_BEGIN = /* glsl */`
vec3 beadPos; vec3 beadNor; float beadMeltHere;
beadDeform(position, normal, beadPos, beadNor, beadMeltHere);
vBeadInfo = vec3(beadMeltHere, aBead.z - 1.0, step(0.5, aBead.z));
vBeadLocal = beadPos; vBeadNL = beadNor;
`

export interface BeadUniforms {
  uBeadHole: { value: number }
  uBeadR: { value: number }
  uBeadH: { value: number }
  uCell: { value: number }
  uBend: { value: number }
}
export const makeBeadUniforms = (d: Dims): BeadUniforms => ({
  uBeadHole: { value: d.bead.holeR },
  uBeadR: { value: d.bead.outerR },
  uBeadH: { value: d.bead.height },
  uCell: { value: d.pitch / 2 },
  uBend: { value: 0 },
})

/** Patch a built-in material so it deforms like a melting bead. */
export function applyBeadVertex<T extends THREE.Material>(
  mat: T,
  uniforms: BeadUniforms,
  withNormals: boolean,
  extra?: { frag?: (s: string) => string; fragPars?: string; uniforms?: Record<string, { value: unknown }>; vertExtra?: string; vertPars?: string },
): T {
  const prev = mat.onBeforeCompile
  mat.onBeforeCompile = (shader, renderer) => {
    prev?.call(mat, shader, renderer)
    Object.assign(shader.uniforms, uniforms, extra?.uniforms ?? {})
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${BEAD_VERT_PARS}\n${extra?.vertPars ?? ''}`)
    if (withNormals) {
      shader.vertexShader = shader.vertexShader
        .replace('#include <beginnormal_vertex>', `${BEAD_VERT_BEGIN}\nvec3 objectNormal = beadNor;\n#ifdef USE_TANGENT\nvec3 objectTangent = vec3( tangent.xyz );\n#endif`)
        .replace('#include <begin_vertex>', `vec3 transformed = beadPos;\n${extra?.vertExtra ?? ''}`)
    } else {
      shader.vertexShader = shader.vertexShader
        .replace('#include <begin_vertex>', `${BEAD_VERT_BEGIN}\nvec3 transformed = beadPos;\n${extra?.vertExtra ?? ''}`)
    }
    if (extra?.frag) shader.fragmentShader = extra.frag(shader.fragmentShader)
    if (extra?.fragPars) shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${extra.fragPars}`)
  }
  mat.customProgramCacheKey = () => 'bead-' + (withNormals ? 'n' : 'd') + (extra?.fragPars ? 'f' : '')
  return mat
}

