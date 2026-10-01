import { PALETTE, srgbToLab } from './palette'
import type { Pattern } from './patterns'

export interface ImageOpts {
  /** longest side in beads */
  size: number
  /** at most this many different colours (a tray holds 12) */
  colors: number
  /** treat near-white / transparent pixels as "no bead" */
  removeBackground: boolean
  /** Floyd–Steinberg error diffusion (good for photos) */
  dither: boolean
  /** gentle contrast boost so small pieces stay readable */
  punch: boolean
}

export const DEFAULT_IMAGE_OPTS: ImageOpts = { size: 24, colors: 10, removeBackground: true, dither: false, punch: true }

const dist2 = (a: number[], b: number[]) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
// only plain colours — pearls, jellies and glow beads would surprise the visitor
const BASE = PALETTE.filter((c) => c.finish === 'opaque' && c.tier === 'base221')

/** Turn any picture into a bead pattern: area-average down, snap to real MARD colours, merge down to N colours. */
export function imageToPattern(src: CanvasImageSource & { width: number; height: number }, o: ImageOpts, name = '我的图片'): Pattern {
  const sw = (src as { naturalWidth?: number }).naturalWidth ?? src.width, sh = (src as { naturalHeight?: number }).naturalHeight ?? src.height
  const scale = o.size / Math.max(sw, sh)
  const w = Math.max(2, Math.round(sw * scale)), h = Math.max(2, Math.round(sh * scale))
  // area-average by drawing at a few times the target size, then box-filtering
  const ss = 4
  const big = document.createElement('canvas')
  big.width = w * ss; big.height = h * ss
  const bg = big.getContext('2d', { willReadFrequently: true })!
  bg.imageSmoothingQuality = 'high'
  bg.drawImage(src, 0, 0, big.width, big.height)
  const data = bg.getImageData(0, 0, big.width, big.height).data
  const px = new Float32Array(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0, a = 0
    for (let yy = 0; yy < ss; yy++) for (let xx = 0; xx < ss; xx++) {
      const i = ((y * ss + yy) * big.width + (x * ss + xx)) * 4
      const al = data[i + 3] / 255
      r += data[i] * al; g += data[i + 1] * al; b += data[i + 2] * al; a += al
    }
    const k = (y * w + x) * 4
    const n = ss * ss
    px[k + 3] = a / n
    if (a > 0) { px[k] = r / a; px[k + 1] = g / a; px[k + 2] = b / a }
  }

  const cells = new Int16Array(w * h).fill(-1)
  const empty = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) {
    const k = i * 4
    const white = px[k] > 238 && px[k + 1] > 238 && px[k + 2] > 238
    if (px[k + 3] < 0.45 || (o.removeBackground && white)) empty[i] = 1
  }

  // quantise (optionally with error diffusion in RGB)
  const err = new Float32Array(w * h * 3)
  const nearest = (r: number, g: number, b: number): number => {
    const lab = srgbToLab(r, g, b)
    let best = 0, bd = Infinity
    for (let i = 0; i < BASE.length; i++) {
      const d = dist2(lab, BASE[i].lab)
      if (d < bd) { bd = d; best = i }
    }
    return best
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x
    if (empty[i]) continue
    let r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2]
    if (o.punch) { r = (r / 255 - 0.5) * 1.12 * 255 + 127.5; g = (g / 255 - 0.5) * 1.12 * 255 + 127.5; b = (b / 255 - 0.5) * 1.12 * 255 + 127.5 }
    if (o.dither) { r += err[i * 3]; g += err[i * 3 + 1]; b += err[i * 3 + 2] }
    r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b))
    const bi = nearest(r, g, b)
    cells[i] = BASE[bi].index
    if (o.dither) {
      const c = BASE[bi].hexNum
      const dr = r - ((c >> 16) & 255), dg = g - ((c >> 8) & 255), db = b - (c & 255)
      const push = (xx: number, yy: number, f: number) => {
        if (xx < 0 || yy < 0 || xx >= w || yy >= h || empty[yy * w + xx]) return
        const j = (yy * w + xx) * 3
        err[j] += dr * f; err[j + 1] += dg * f; err[j + 2] += db * f
      }
      push(x + 1, y, 7 / 16); push(x - 1, y + 1, 3 / 16); push(x, y + 1, 5 / 16); push(x + 1, y + 1, 1 / 16)
    }
  }

  // merge the rarest colours into their nearest surviving neighbour until only `colors` remain
  const counts = new Map<number, number>()
  for (const c of cells) if (c >= 0) counts.set(c, (counts.get(c) ?? 0) + 1)
  while (counts.size > o.colors) {
    let rare = -1, rc = Infinity
    for (const [c, n] of counts) if (n < rc) { rc = n; rare = c }
    let tgt = -1, td = Infinity
    for (const c of counts.keys()) {
      if (c === rare) continue
      const d = dist2(PALETTE[c].lab, PALETTE[rare].lab)
      if (d < td) { td = d; tgt = c }
    }
    for (let i = 0; i < cells.length; i++) if (cells[i] === rare) cells[i] = tgt
    counts.set(tgt, (counts.get(tgt) ?? 0) + rc)
    counts.delete(rare)
  }
  // tidy: crop empty borders
  let x0 = w, y0 = h, x1 = -1, y1 = -1
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (cells[y * w + x] >= 0) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
  if (x1 < 0) { x0 = 0; y0 = 0; x1 = w - 1; y1 = h - 1 }
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1
  const out = new Int16Array(cw * ch).fill(-1)
  const cc = new Map<number, number>()
  let total = 0
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const c = cells[(y + y0) * w + (x + x0)]
    out[y * cw + x] = c
    if (c >= 0) { cc.set(c, (cc.get(c) ?? 0) + 1); total++ }
  }
  const colors = [...cc.entries()].sort((a, b) => b[1] - a[1]).map(([i]) => i)
  return { id: 'custom', name, en: 'My picture', w: cw, h: ch, cells: out, colors, counts: cc, total, level: total > 400 ? 3 : total > 160 ? 2 : 1 }
}
