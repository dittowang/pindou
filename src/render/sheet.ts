import * as THREE from 'three'
import type { Board } from './board'
import { cellX, cellZ } from './board'
import type { Pattern } from '../config/patterns'
import { PALETTE } from '../config/palette'

export interface SheetPlacement { i0: number; j0: number }

/** where a pattern sits on a board (centred) */
export function placePattern(board: Board, pattern: Pattern): SheetPlacement {
  const { cols, rows } = board.layout
  return { i0: Math.floor((cols - pattern.w) / 2), j0: Math.floor((rows - pattern.h) / 2) }
}

const lum = (hex: number) => {
  const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

/**
 * The printed sheet slid UNDER the clear pegboard: grid, coordinates, and — when following a pattern — a coloured
 * square with its 色号 in every cell, exactly like the printouts a shop hands you.
 */
export function makeSheetTexture(board: Board, pattern: Pattern | null, renderer: THREE.WebGLRenderer, title = ''): THREE.CanvasTexture {
  const { layout, dims, sheetSize } = board
  const ppc = Math.min(260, 4096 / Math.max(sheetSize.x, sheetSize.y))
  const W = Math.round(sheetSize.x * ppc), H = Math.round(sheetSize.y * ppc)
  const cv = document.createElement('canvas')
  cv.width = W; cv.height = H
  const g = cv.getContext('2d')!
  g.fillStyle = '#f8f5ef'
  g.fillRect(0, 0, W, H)

  const cell = dims.pitch * ppc
  const cx = (i: number) => (cellX(i, layout.cols, dims.pitch) - dims.pitch / 2 + sheetSize.x / 2) * ppc
  const cz = (j: number) => (cellZ(j, layout.rows, dims.pitch) - dims.pitch / 2 + sheetSize.y / 2) * ppc

  // pattern cells
  const place = pattern ? placePattern(board, pattern) : null
  const fontPx = Math.max(7, Math.round(cell * 0.4))
  g.textAlign = 'center'; g.textBaseline = 'middle'
  g.font = `600 ${fontPx}px "Instrument Sans", "SF Pro Text", Helvetica, Arial, sans-serif`
  const inset = Math.max(1, cell * 0.06)
  for (let j = 0; j < layout.rows; j++) {
    for (let i = 0; i < layout.cols; i++) {
      if (!layout.mask[j * layout.cols + i]) continue
      let idx = -1
      if (pattern && place) {
        const pi = i - place.i0, pj = j - place.j0
        if (pi >= 0 && pj >= 0 && pi < pattern.w && pj < pattern.h) idx = pattern.cells[pj * pattern.w + pi]
      }
      const x = cx(i), y = cz(j)
      if (idx >= 0) {
        const c = PALETTE[idx]
        g.fillStyle = c.hex
        g.fillRect(x + inset, y + inset, cell - inset * 2, cell - inset * 2)
        if (cell > 18) {
          g.fillStyle = lum(c.hexNum) > 0.58 ? 'rgba(30,24,20,.82)' : 'rgba(255,255,255,.92)'
          g.fillText(c.code, x + cell / 2, y + cell / 2 + fontPx * 0.04)
        }
      }
    }
  }

  // grid
  for (let j = 0; j <= layout.rows; j++) {
    const y = cz(0) + j * cell
    g.strokeStyle = j % 5 === 0 ? 'rgba(90,80,64,.50)' : 'rgba(90,80,64,.20)'
    g.lineWidth = j % 5 === 0 ? Math.max(1.2, ppc * 0.012) : Math.max(0.8, ppc * 0.006)
    g.beginPath(); g.moveTo(cx(0), y); g.lineTo(cx(layout.cols - 1) + cell, y); g.stroke()
  }
  for (let i = 0; i <= layout.cols; i++) {
    const x = cx(0) + i * cell
    g.strokeStyle = i % 5 === 0 ? 'rgba(90,80,64,.50)' : 'rgba(90,80,64,.20)'
    g.lineWidth = i % 5 === 0 ? Math.max(1.2, ppc * 0.012) : Math.max(0.8, ppc * 0.006)
    g.beginPath(); g.moveTo(x, cz(0)); g.lineTo(x, cz(layout.rows - 1) + cell); g.stroke()
  }

  // coordinates in the margin (every 5)
  g.fillStyle = 'rgba(80,70,58,.65)'
  g.font = `500 ${Math.max(9, Math.round(cell * 0.34))}px "Instrument Sans", Helvetica, Arial, sans-serif`
  for (let i = 4; i < layout.cols; i += 5) {
    g.fillText(String(i + 1), cx(i) + cell / 2, cz(0) - cell * 0.55)
    g.fillText(String(i + 1), cx(i) + cell / 2, cz(layout.rows - 1) + cell * 1.55)
  }
  for (let j = 4; j < layout.rows; j += 5) {
    g.fillText(String(j + 1), cx(0) - cell * 0.6, cz(j) + cell / 2)
    g.fillText(String(j + 1), cx(layout.cols - 1) + cell * 1.6, cz(j) + cell / 2)
  }

  // registration marks + title block
  g.strokeStyle = 'rgba(80,70,58,.55)'
  g.lineWidth = Math.max(1, ppc * 0.01)
  const mk = (x: number, y: number) => { const r = cell * 0.5; g.beginPath(); g.moveTo(x - r, y); g.lineTo(x + r, y); g.moveTo(x, y - r); g.lineTo(x, y + r); g.stroke() }
  const m = 0.55 * ppc
  mk(m, m); mk(W - m, m); mk(m, H - m); mk(W - m, H - m)
  g.fillStyle = 'rgba(70,60,50,.8)'
  g.textAlign = 'left'
  g.font = `600 ${Math.max(10, Math.round(cell * 0.5))}px "Fraunces", "Noto Serif SC", Georgia, serif`
  const t = title || (pattern ? `${pattern.name} · ${pattern.w}×${pattern.h} · ${pattern.total}颗` : '自由创作 FREE STYLE')
  g.fillText(t, m * 1.5, H - m * 0.55)
  g.textAlign = 'right'
  g.font = `500 ${Math.max(8, Math.round(cell * 0.32))}px "Instrument Sans", Helvetica, Arial, sans-serif`
  g.fillText('BEAD STUDIO · MARD 色号', W - m * 1.5, H - m * 0.55)

  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy()
  tex.generateMipmaps = true
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.needsUpdate = true
  return tex
}
