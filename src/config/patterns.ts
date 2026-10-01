import { Art, shade, type Col } from './pixelArt'
import { nearestColor, PALETTE } from './palette'

export interface Pattern {
  id: string
  name: string
  en: string
  w: number
  h: number
  /** palette index per cell (row-major), -1 = empty */
  cells: Int16Array
  /** palette indices used, most-used first */
  colors: number[]
  counts: Map<number, number>
  total: number
  /** rough difficulty 1–3 */
  level: 1 | 2 | 3
}

const INK = 0x3a2a2a

function heartArt(): Art {
  const a = new Art(15, 14)
  const s = 6.3, cx = 7.5, cy = 6.9
  a.fill((x, y) => { const u = (x - cx) / s, v = (cy - y) / s; return (u * u + v * v - 1) ** 3 - u * u * v ** 3 <= 0 }, 0xe63946)
  a.fill((x, y) => { const u = (x - cx) / s, v = (cy - y) / s; return (u * u + v * v - 1) ** 3 - u * u * v ** 3 <= 0 && v < -0.45 && u > -0.2 }, shade(0xe63946, -0.16))
  a.rect(2.5, 2.5, 4.5, 3.9, 0xffb3bd); a.px(2, 3, 0xffb3bd); a.px(3, 4.2, 0xffb3bd)
  a.outline(0x8b1e2d)
  return a.trim()
}

function mushroomArt(): Art {
  const a = new Art(17, 17)
  // stem
  a.fill((x, y) => x >= 5.2 && x <= 11.8 && y >= 8.5 && y <= 15.2 && !(y > 14 && (x < 6 || x > 11)), 0xf5e6c6)
  a.fill((x, y) => x >= 9.7 && x <= 11.8 && y >= 9 && y <= 15.2 && !(y > 14 && x > 11), 0xdcc59b)
  // cap
  a.fill((x, y) => ((x - 8.5) / 8) ** 2 + ((y - 8.2) / 6.9) ** 2 <= 1 && y <= 9.2, 0xe53935)
  a.fill((x, y) => ((x - 8.5) / 8) ** 2 + ((y - 8.2) / 6.9) ** 2 <= 1 && y <= 9.2 && y >= 7.6, shade(0xe53935, -0.18))
  // spots
  for (const [px, py, r] of [[5, 5.4, 1.7], [11.6, 4.7, 1.45], [8.6, 2.9, 1.15], [13.4, 7.4, 1.0], [3.4, 7.6, 0.9]] as const) a.disc(px, py, r, 0xffffff, (c) => c !== null)
  a.outline(0x5b2a2a)
  return a.trim()
}

function ghostArt(): Art {
  const a = new Art(15, 17)
  const bodyCol = 0xfafafa
  const wave = (x: number) => 14.2 + (Math.floor(x) % 4 < 2 ? 0.0 : 1.2) - (x < 3 || x > 12 ? 0 : 0)
  a.fill((x, y) => (((x - 7.5) / 6.3) ** 2 + ((y - 6.4) / 6.2) ** 2 <= 1 && y <= 6.5) || (x >= 1.2 && x <= 13.8 && y >= 6.4 && y <= wave(x)), bodyCol)
  a.fill((x, y) => x >= 11.5 && a.get(Math.floor(x), Math.floor(y)) !== null, 0xdadcf2, (c) => c !== null)
  // face
  a.rect(4.2, 5.6, 5.4, 7.8, 0x2b2b3a); a.rect(9.6, 5.6, 10.8, 7.8, 0x2b2b3a)
  a.px(4.5, 5.9, 0xffffff); a.px(9.9, 5.9, 0xffffff)
  a.rect(6.5, 9.6, 8.4, 10.8, 0x2b2b3a); a.px(7, 10, 0xe86f8a)
  a.px(2.8, 9.2, 0xffb0c0); a.px(3.8, 9.2, 0xffb0c0); a.px(10.8, 9.2, 0xffb0c0); a.px(11.8, 9.2, 0xffb0c0)
  a.outline(0x3b3f5c)
  return a.trim()
}

function catArt(): Art {
  const a = new Art(21, 19)
  const fur = 0xf4a259, stripe = 0xd77a1f, inEar = 0xf6a6b2
  // ears (behind head)
  a.poly([[2, 1.5], [2, 8.5], [8.5, 5.5]], fur); a.poly([[19, 1.5], [19, 8.5], [12.5, 5.5]], fur)
  a.poly([[3.2, 4], [3.2, 7.4], [6.4, 6]], inEar); a.poly([[17.8, 4], [17.8, 7.4], [14.6, 6]], inEar)
  // head
  a.ellipse(10.5, 11.2, 9.3, 6.9, fur)
  // forehead stripes
  a.rect(10, 4.6, 11, 6.6, stripe); a.rect(7.4, 5.2, 8.2, 6.8, stripe); a.rect(12.8, 5.2, 13.6, 6.8, stripe)
  // cheeks stripes
  a.rect(1.6, 11, 3.3, 11.9, stripe); a.rect(1.9, 13, 3.4, 13.9, stripe); a.rect(17.7, 11, 19.4, 11.9, stripe); a.rect(17.6, 13, 19.1, 13.9, stripe)
  // muzzle
  a.ellipse(10.5, 14.2, 3.7, 2.5, 0xfff4e6)
  // eyes
  a.rect(5.4, 9.4, 6.6, 11.8, 0x2a1f1f); a.rect(14.4, 9.4, 15.6, 11.8, 0x2a1f1f)
  a.px(5.5, 9.6, 0xffffff); a.px(14.5, 9.6, 0xffffff)
  // nose + mouth
  a.rect(9.6, 12.6, 11.4, 13.5, 0xf07d90)
  a.px(10, 14.5, 0x2a1f1f); a.px(11, 14.5, 0x2a1f1f); a.px(9, 15, 0x2a1f1f); a.px(12, 15, 0x2a1f1f); a.px(10, 15.4, 0x2a1f1f); a.px(11, 15.4, 0x2a1f1f)
  a.outline(0x4a2c1a)
  return a.trim()
}

function daisyArt(): Art {
  const a = new Art(21, 27)
  const cx = 10.5, cy = 8.5
  // stem + leaves
  a.line(cx, cy + 2, cx + 0.4, 26, 0x3e8e41, 0.75)
  a.poly([[cx + 0.5, 19.5], [cx + 6.5, 14.2], [cx + 8, 17.6], [cx + 3.2, 21.6]], 0x4caf50)
  a.poly([[cx - 0.5, 22.4], [cx - 6.8, 18.2], [cx - 7.8, 21.4], [cx - 3, 24.4]], 0x4caf50)
  // petals
  for (let k = 0; k < 10; k++) {
    const ang = (k / 10) * Math.PI * 2
    const px = cx + Math.cos(ang) * 4.3, py = cy + Math.sin(ang) * 4.3
    a.fill((x, y) => {
      const dx = x - px, dy = y - py
      const c = Math.cos(-ang), s = Math.sin(-ang)
      const lx = dx * c - dy * s, ly = dx * s + dy * c
      return (lx / 3.5) ** 2 + (ly / 1.55) ** 2 <= 1
    }, 0xffffff)
  }
  a.disc(cx, cy, 3.0, 0xffc928)
  for (const [dx, dy] of [[-1, -1], [1, 0], [-0.5, 1.4], [1.2, -1.4]] as const) a.px(cx + dx, cy + dy, 0xf08a1c)
  a.outline(0x4f7a52)
  return a.trim()
}

function cherryArt(): Art {
  const a = new Art(19, 20)
  a.line(5.5, 13, 11, 2.5, 0x2f7d32, 0.6); a.line(13.5, 14, 11, 2.5, 0x2f7d32, 0.6)
  a.poly([[11, 2.6], [14.2, 0.8], [18, 3], [14.4, 5.2]], 0x4caf50)
  a.disc(5.5, 14.2, 4.3, 0xd81f26); a.disc(13.6, 15, 4.3, 0xd81f26)
  a.fill((x, y) => ((x - 5.5) ** 2 + (y - 14.2) ** 2 <= 18.5 && (x - 5.5 > 1.4 || y - 14.2 > 2.2)), shade(0xd81f26, -0.2), (c) => c !== null && c !== 0x2f7d32 && c !== 0x4caf50)
  a.fill((x, y) => ((x - 13.6) ** 2 + (y - 15) ** 2 <= 18.5 && (x - 13.6 > 1.4 || y - 15 > 2.2)), shade(0xd81f26, -0.2), (c) => c !== null && c !== 0x2f7d32 && c !== 0x4caf50)
  a.rect(3.2, 11.4, 4.6, 12.6, 0xffc2c8); a.rect(11.4, 12.2, 12.8, 13.4, 0xffc2c8)
  a.outline(0x4b1220)
  return a.trim()
}

function starArt(): Art {
  const a = new Art(17, 17)
  const pts: [number, number][] = []
  for (let k = 0; k < 10; k++) {
    const r = k % 2 === 0 ? 8.2 : 3.6, ang = -Math.PI / 2 + (k * Math.PI) / 5
    pts.push([8.5 + Math.cos(ang) * r, 9 + Math.sin(ang) * r])
  }
  a.poly(pts, 0xffd54a)
  a.fill((x, y) => y > 11.2 && a.get(Math.floor(x), Math.floor(y)) !== null, shade(0xffd54a, -0.12), (c) => c !== null)
  a.rect(7.3, 7.6, 8.4, 9.4, 0x3b2f2f); a.rect(10.5, 7.6, 11.6, 9.4, 0x3b2f2f)
  a.px(8.7, 10.9, 0x3b2f2f); a.px(9.7, 11.3, 0x3b2f2f); a.px(10.7, 10.9, 0x3b2f2f)
  a.px(6.2, 10.1, 0xff9aa8); a.px(12.4, 10.1, 0xff9aa8)
  a.outline(0xc9821a)
  return a.trim()
}

function strawberryArt(): Art {
  const a = new Art(17, 20)
  a.fill((x, y) => {
    if (y < 5.5 || y > 18.6) return false
    const t = (y - 5.5) / 13.1
    const half = 7.6 * Math.pow(1 - t, 0.62) * (t < 0.12 ? 0.9 + t * 0.8 : 1)
    return Math.abs(x - 8.5) <= half
  }, 0xe53935)
  a.fill((x, y) => x > 10.6 && a.get(Math.floor(x), Math.floor(y)) !== null, shade(0xe53935, -0.17), (c) => c !== null)
  for (const [px, py] of [[5, 8], [8.5, 7.5], [12, 8.4], [4, 11.5], [7, 11], [10, 11.4], [13, 11.8], [6, 14.5], [9.5, 14.4], [8, 17]] as const) a.px(px, py, 0xffe08a)
  // leaves
  a.poly([[8.5, 5.4], [2.2, 3.6], [5.4, 6.4]], 0x43a047); a.poly([[8.5, 5.4], [14.8, 3.6], [11.6, 6.4]], 0x43a047)
  a.poly([[8.5, 5.4], [6.2, 2.4], [8.5, 4.2], [10.8, 2.4]], 0x2e7d32)
  a.rect(8, 1.2, 9, 3.2, 0x2e7d32)
  a.outline(0x5a1717)
  return a.trim()
}

function rainbowArt(): Art {
  const a = new Art(23, 13)
  const bands = [0xe53935, 0xff9800, 0xffeb3b, 0x4caf50, 0x42a5f5, 0x7e57c2]
  bands.forEach((c, i) => {
    const r0 = 11.2 - i * 1.55
    a.fill((x, y) => { const d = Math.hypot(x - 11.5, y - 12); return d <= r0 && y <= 12 }, c)
  })
  a.fill((x, y) => Math.hypot(x - 11.5, y - 12) <= 1.9 && y <= 12, null)
  a.outline(0x4a3b52)
  // clouds
  for (const [cx, w] of [[3, 1], [20, 1]] as const) { a.ellipse(cx, 11.4, 2.6, 1.4, 0xffffff); a.ellipse(cx - 1.2, 10.8, 1.5, 1.2, 0xffffff) }
  return a.trim()
}

function iceCreamArt(): Art {
  const a = new Art(15, 24)
  a.poly([[2.5, 12], [12.5, 12], [7.5, 23.5]], 0xe9b36a)
  for (let k = 0; k < 5; k++) { a.line(2.5 + k * 2.5, 12, 7.5 + (k - 2) * 0.1, 23, 0xc88a43, 0.35); a.line(12.5 - k * 2.5, 12, 7.5, 23, 0xc88a43, 0.35) }
  a.ellipse(7.5, 10.8, 6.5, 2.6, 0xf59db3)
  a.disc(7.5, 6.2, 5.6, 0xf8bbd0)
  a.disc(7.5, 6.2, 5.6, 0xf8bbd0)
  a.ellipse(7.5, 2.2, 3, 2.2, 0xf8bbd0)
  a.rect(5.4, 3.2, 6.4, 4.2, 0xffffff); a.rect(9.6, 6, 10.6, 7, 0xffd54a); a.rect(4.2, 7.6, 5.2, 8.6, 0x7e57c2); a.rect(8.4, 8.6, 9.4, 9.6, 0x42a5f5)
  a.rect(6.6, 0.2, 7.6, 1.4, 0xe53935)
  a.outline(0x6b3d2e)
  return a.trim()
}

type Maker = () => Art
const DEFS: { id: string; name: string; en: string; make: Maker; level: 1 | 2 | 3 }[] = [
  { id: 'heart', name: '小爱心', en: 'Little heart', make: heartArt, level: 1 },
  { id: 'star', name: '笑脸星星', en: 'Smiley star', make: starArt, level: 1 },
  { id: 'cherry', name: '樱桃', en: 'Cherries', make: cherryArt, level: 1 },
  { id: 'mushroom', name: '小蘑菇', en: 'Mushroom', make: mushroomArt, level: 2 },
  { id: 'ghost', name: '害羞幽灵', en: 'Shy ghost', make: ghostArt, level: 2 },
  { id: 'strawberry', name: '草莓', en: 'Strawberry', make: strawberryArt, level: 2 },
  { id: 'rainbow', name: '彩虹云朵', en: 'Rainbow', make: rainbowArt, level: 2 },
  { id: 'daisy', name: '雏菊', en: 'Daisy', make: daisyArt, level: 3 },
  { id: 'cat', name: '虎斑小猫', en: 'Tabby cat', make: catArt, level: 3 },
  { id: 'icecream', name: '双球冰淇淋', en: 'Ice cream', make: iceCreamArt, level: 3 },
]

/** Snap the authored art to real MARD beads (opaque, base range) and index it. */
export function artToPattern(id: string, name: string, en: string, art: Art, level: 1 | 2 | 3 = 2): Pattern {
  const map = new Map<number, number>()
  const cells = new Int16Array(art.w * art.h).fill(-1)
  const counts = new Map<number, number>()
  for (let k = 0; k < art.cells.length; k++) {
    const c: Col = art.cells[k]
    if (c === null) continue
    let idx = map.get(c)
    if (idx === undefined) { idx = nearestColor(c, { finishes: ['opaque'], tiers: ['base221'] }).index; map.set(c, idx) }
    cells[k] = idx
    counts.set(idx, (counts.get(idx) ?? 0) + 1)
  }
  const colors = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([i]) => i)
  let total = 0
  counts.forEach((n) => (total += n))
  return { id, name, en, w: art.w, h: art.h, cells, colors, counts, total, level }
}

let cache: Pattern[] | null = null
export function builtinPatterns(): Pattern[] {
  if (!cache) cache = DEFS.map((d) => artToPattern(d.id, d.name, d.en, d.make(), d.level))
  return cache
}
export const paletteHex = (i: number) => PALETTE[i].hex
