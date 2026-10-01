import raw from './palette-mard.json'

export type Finish = 'opaque' | 'translucent' | 'pearl' | 'glow' | 'photochromic' | 'thermochromic' | 'glitter'

export interface PaletteColor {
  /** MARD-style code, e.g. "A4" */
  code: string
  series: string
  group: string
  tier: string
  hex: string
  hexNum: number
  finish: Finish
  conf: string
  note?: string
  /** colour after the state change (thermochromic: when hot; photochromic: under UV) */
  alt?: Record<string, string>
  states?: unknown
  index: number
  lab: [number, number, number]
}

export function srgbToLab(r: number, g: number, b: number): [number, number, number] {
  const lin = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }
  const R = lin(r), G = lin(g), B = lin(b)
  const X = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047
  const Y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B
  const Z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const fx = f(X), fy = f(Y), fz = f(Z)
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

export const PALETTE: PaletteColor[] = (raw as any[]).map((c, index) => {
  const hexNum = parseInt(c.hex.slice(1), 16)
  return {
    code: c.code, series: c.series, group: c.group, tier: c.tier, hex: c.hex, hexNum,
    finish: c.finish as Finish, conf: c.conf, note: c.note, alt: c.alt, states: c.states, index,
    lab: srgbToLab((hexNum >> 16) & 255, (hexNum >> 8) & 255, hexNum & 255),
  }
})

export const byCode = new Map(PALETTE.map((c) => [c.code, c]))

/** series → how a shop shelves them (and a friendly name) */
export const SERIES_INFO: Record<string, { zh: string; en: string }> = {
  A: { zh: '黄橙', en: 'Yellow · Orange' },
  B: { zh: '绿', en: 'Green' },
  C: { zh: '青蓝', en: 'Cyan · Blue' },
  D: { zh: '蓝紫', en: 'Blue · Violet' },
  E: { zh: '粉', en: 'Pink' },
  F: { zh: '红', en: 'Red' },
  G: { zh: '棕·肤', en: 'Brown · Skin' },
  H: { zh: '黑白灰', en: 'Neutrals' },
  M: { zh: '莫兰迪', en: 'Muted earth' },
  P: { zh: '珠光', en: 'Pearl' },
  R: { zh: '果冻', en: 'Jelly' },
  Y: { zh: '夜光', en: 'Glow' },
  Q: { zh: '温变', en: 'Thermochromic' },
  ZG: { zh: '光变', en: 'Photochromic' },
  T: { zh: '闪粉', en: 'Glitter' },
}
export const SERIES_ORDER = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'M', 'P', 'R', 'Y', 'Q', 'ZG', 'T']

const dist2 = (a: [number, number, number], b: [number, number, number]) => {
  const dl = a[0] - b[0], da = a[1] - b[1], db = a[2] - b[2]
  return dl * dl + da * da + db * db
}

/** nearest palette colour (CIELAB) — used to snap pattern art and imported photos to real beads */
export function nearestColor(hex: number, opts: { finishes?: Finish[]; exclude?: Set<number>; tiers?: string[] } = {}): PaletteColor {
  const lab = srgbToLab((hex >> 16) & 255, (hex >> 8) & 255, hex & 255)
  const finishes = opts.finishes ?? ['opaque']
  let best = PALETTE[0], bd = Infinity
  for (const c of PALETTE) {
    if (!finishes.includes(c.finish)) continue
    if (opts.tiers && !opts.tiers.includes(c.tier)) continue
    if (opts.exclude?.has(c.index)) continue
    const d = dist2(lab, c.lab)
    if (d < bd) { bd = d; best = c }
  }
  return best
}

export function colorsOfSeries(series: string): PaletteColor[] {
  return PALETTE.filter((c) => c.series === series)
}
