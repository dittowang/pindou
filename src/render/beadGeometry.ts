import * as THREE from 'three'
import type { Dims } from '../config/physical'

interface Ring { r: number; y: number; nr: number; ny: number }

/**
 * A fuse bead: a short tube with filleted outer edges and softly chamfered hole edges.
 * Built as one smooth closed profile revolved around Y, so every vertex carries an analytic normal.
 * The profile is dense enough along the walls for the melt shader to pinch the hole and flatten the top.
 */
export function buildBeadGeometry(dims: Dims, radial = 24, quality: 'high' | 'low' = 'high'): THREE.BufferGeometry {
  const B = dims.bead
  const R = B.outerR, r = B.holeR, h2 = B.height / 2
  const co = B.filletOuter, ci = B.filletInner
  const arcN = quality === 'high' ? 3 : 2
  const wallN = quality === 'high' ? 3 : 2
  const rings: Ring[] = []
  const push = (rr: number, y: number, nr: number, ny: number) => rings.push({ r: rr, y, nr, ny })

  // bottom face, inner → outer
  push(r + ci, -h2, 0, -1)
  push(R - co, -h2, 0, -1)
  // outer bottom fillet
  for (let i = 1; i <= arcN; i++) {
    const a = (-Math.PI / 2) + (i / arcN) * (Math.PI / 2)
    push(R - co + co * Math.cos(a), -h2 + co + co * Math.sin(a), Math.cos(a), Math.sin(a))
  }
  // outer wall (very slight barrel so highlights roll)
  for (let i = 1; i < wallN; i++) {
    const t = i / wallN
    const y = -h2 + co + t * (2 * h2 - 2 * co)
    const bulge = 0.005 * R * Math.sin(t * Math.PI)
    push(R + bulge, y, 1, 0)
  }
  // outer top fillet
  for (let i = 0; i <= arcN; i++) {
    const a = (i / arcN) * (Math.PI / 2)
    push(R - co + co * Math.cos(a), h2 - co + co * Math.sin(a), Math.cos(a), Math.sin(a))
  }
  // top face, outer → inner
  push(r + ci, h2, 0, 1)
  // inner top fillet
  for (let i = 1; i <= arcN; i++) {
    const a = Math.PI / 2 + (i / arcN) * (Math.PI / 2)
    push(r + ci + ci * Math.cos(a), h2 - ci + ci * Math.sin(a), Math.cos(a), Math.sin(a))
  }
  // inner wall
  for (let i = 1; i < wallN; i++) {
    const t = i / wallN
    push(r, h2 - ci - t * (2 * h2 - 2 * ci), -1, 0)
  }
  // inner bottom fillet
  for (let i = 0; i <= arcN; i++) {
    const a = Math.PI + (i / arcN) * (Math.PI / 2)
    push(r + ci + ci * Math.cos(a), -h2 + ci + ci * Math.sin(a), Math.cos(a), Math.sin(a))
  }

  const n = rings.length
  const pos = new Float32Array(n * (radial + 1) * 3)
  const nor = new Float32Array(n * (radial + 1) * 3)
  const uv = new Float32Array(n * (radial + 1) * 2)
  let o = 0, u = 0
  for (let i = 0; i < n; i++) {
    const rg = rings[i]
    for (let j = 0; j <= radial; j++) {
      const th = (j / radial) * Math.PI * 2
      const c = Math.cos(th), s = Math.sin(th)
      pos[o] = rg.r * c; pos[o + 1] = rg.y; pos[o + 2] = rg.r * s
      nor[o] = rg.nr * c; nor[o + 1] = rg.ny; nor[o + 2] = rg.nr * s
      o += 3
      uv[u++] = j / radial
      uv[u++] = i / (n - 1)
    }
  }
  const idx: number[] = []
  for (let i = 0; i < n - 1; i++) {
    const a0 = i * (radial + 1), b0 = (i + 1) * (radial + 1)
    for (let j = 0; j < radial; j++) {
      const a = a0 + j, b = b0 + j
      // profile runs CCW in (r,y) with outward normals; revolving about +Y flips the winding
      idx.push(a, b, a + 1, a + 1, b, b + 1)
    }
  }
  // (the last ring coincides with the first, so the loop is already closed)
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeBoundingSphere()
  return g
}
