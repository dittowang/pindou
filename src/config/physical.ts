/**
 * Real-world dimensions. World unit = 1 cm (a 5 mm bead is 0.5 units wide).
 * Two bead scales exist in the shops: the 2.6 mm "mini" bead (MARD & most Chinese 拼豆 shops, 52×52 boards)
 * and the 5 mm "midi" bead (Perler / Hama / Artkal S, 29×29 boards).
 * Provenance of every number: docs/research/materials-physics.md (official / derived / estimate tags there).
 */
export type ScaleId = 'mini' | 'midi'

export interface Dims {
  id: ScaleId
  label: string
  pitch: number
  bead: {
    outerR: number
    holeR: number
    height: number
    filletOuter: number
    filletInner: number
    /** relative std-dev of bead length within a batch */
    lengthSpread: number
    mass: number
  }
  peg: { r: number; rBase: number; h: number }
  plate: { t: number; margin: number; cornerR: number }
  tray: { cols: number; rows: number; well: number; wall: number; floor: number; depth: number; scoop: number }
  /** boards a shop would hand you at this scale (square sizes, in pegs) */
  boards: { small: number; standard: number }
  /** how far from the peg axis a bead can still be threaded (cm) */
  captureR: number
  /** melt time-scale: seconds for the front face to reach "closed" (u = 1) at a 140 °C dial and light pressure */
  closeSeconds: number
}

export function makeDims(id: ScaleId): Dims {
  if (id === 'midi') {
    return {
      id, label: '标准豆 5mm',
      pitch: 0.5,
      bead: { outerR: 0.24, holeR: 0.125, height: 0.5, filletOuter: 0.022, filletInner: 0.016, lengthSpread: 0.012, mass: 0.059 },
      peg: { r: 0.095, rBase: 0.115, h: 0.36 },
      plate: { t: 0.22, margin: 0.5, cornerR: 0.5 },
      tray: { cols: 4, rows: 3, well: 3.3, wall: 0.2, floor: 0.25, depth: 1.6, scoop: 30 },
      boards: { small: 15, standard: 29 },
      captureR: 0.13,
      closeSeconds: 28,
    }
  }
  return {
    id, label: '迷你豆 2.6mm',
    pitch: 0.26,
    bead: { outerR: 0.125, holeR: 0.065, height: 0.26, filletOuter: 0.011, filletInner: 0.008, lengthSpread: 0.02, mass: 0.010 },
    peg: { r: 0.0475, rBase: 0.0575, h: 0.19 },
    plate: { t: 0.18, margin: 0.3, cornerR: 0.35 },
    tray: { cols: 4, rows: 3, well: 2.7, wall: 0.18, floor: 0.22, depth: 1.5, scoop: 90 },
    boards: { small: 26, standard: 52 },
    captureR: 0.07,
    closeSeconds: 14,
  }
}

export const TABLE = {
  width: 120,
  depth: 80,
} as const
