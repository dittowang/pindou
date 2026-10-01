/**
 * A tiny pixel-art painter used to author the built-in patterns procedurally: shapes are
 * evaluated at cell centres, so symmetry and rounded forms come out clean. Colours are plain
 * hex targets — patterns.ts snaps them to real MARD beads.
 */
export type Col = number | null

export class Art {
  readonly cells: Col[]
  constructor(readonly w: number, readonly h: number) { this.cells = new Array(w * h).fill(null) }

  get(x: number, y: number): Col { return x < 0 || y < 0 || x >= this.w || y >= this.h ? null : this.cells[y * this.w + x] }
  set(x: number, y: number, c: Col) { if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.cells[y * this.w + x] = c }

  /** fill every cell whose centre satisfies `inside(x, y)` (x,y are cell-centre coordinates, cell (0,0) centre = (0.5,0.5)) */
  fill(inside: (x: number, y: number) => boolean, c: Col, only?: (cur: Col) => boolean): this {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (inside(x + 0.5, y + 0.5) && (!only || only(this.get(x, y)))) this.set(x, y, c)
    }
    return this
  }
  disc(cx: number, cy: number, r: number, c: Col, only?: (cur: Col) => boolean) { return this.fill((x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r, c, only) }
  ellipse(cx: number, cy: number, rx: number, ry: number, c: Col, only?: (cur: Col) => boolean) { return this.fill((x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1, c, only) }
  rect(x0: number, y0: number, x1: number, y1: number, c: Col, only?: (cur: Col) => boolean) { return this.fill((x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1, c, only) }
  poly(pts: [number, number][], c: Col, only?: (cur: Col) => boolean) {
    return this.fill((x, y) => {
      let inside = false
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j]
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
      }
      return inside
    }, c, only)
  }
  /** thick line segment */
  line(x0: number, y0: number, x1: number, y1: number, c: Col, thick = 0.6) {
    return this.fill((x, y) => {
      const dx = x1 - x0, dy = y1 - y0
      const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / (dx * dx + dy * dy || 1)))
      return (x - (x0 + dx * t)) ** 2 + (y - (y0 + dy * t)) ** 2 <= thick * thick
    }, c)
  }
  px(x: number, y: number, c: Col) { this.set(Math.floor(x), Math.floor(y), c); return this }
  mirrorX(): this {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < Math.floor(this.w / 2); x++) {
      const a = this.get(x, y), b = this.get(this.w - 1 - x, y)
      if (a !== null && b === null) this.set(this.w - 1 - x, y, a)
      else if (b !== null && a === null) this.set(x, y, b)
    }
    return this
  }
  /** 1-cell outline around everything painted so far */
  outline(c: Col, diagonals = false): this {
    const add: [number, number][] = []
    for (let y = -1; y <= this.h; y++) for (let x = -1; x <= this.w; x++) {
      if (this.get(x, y) !== null) continue
      let near = this.get(x + 1, y) !== null || this.get(x - 1, y) !== null || this.get(x, y + 1) !== null || this.get(x, y - 1) !== null
      if (!near && diagonals) near = this.get(x + 1, y + 1) !== null || this.get(x - 1, y - 1) !== null || this.get(x + 1, y - 1) !== null || this.get(x - 1, y + 1) !== null
      if (near) add.push([x, y])
    }
    for (const [x, y] of add) this.set(x, y, c)
    return this
  }
  /** trim empty rows/cols and return a compact copy */
  trim(pad = 0): Art {
    let x0 = this.w, y0 = this.h, x1 = -1, y1 = -1
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.get(x, y) !== null) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
    if (x1 < 0) return new Art(1, 1)
    const out = new Art(x1 - x0 + 1 + pad * 2, y1 - y0 + 1 + pad * 2)
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.set(x - x0 + pad, y - y0 + pad, this.get(x, y))
    return out
  }
}

/** darken / lighten a hex colour (sRGB, simple) */
export function shade(hex: number, f: number): number {
  const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255
  const m = (v: number) => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f)))
  return (m(r) << 16) | (m(g) << 8) | m(b)
}
