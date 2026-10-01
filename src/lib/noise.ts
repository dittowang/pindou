import { hash2 } from './rng'

/** Smooth 2D value noise in [0,1]. */
export function vnoise(x: number, y: number, seed = 0): number {
  const xi = Math.floor(x), yi = Math.floor(y)
  const xf = x - xi, yf = y - yi
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf)
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed)
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

export function fbm(x: number, y: number, oct = 5, seed = 0, lac = 2, gain = 0.5): number {
  let amp = 0.5, f = 1, sum = 0, norm = 0
  for (let i = 0; i < oct; i++) {
    sum += amp * vnoise(x * f, y * f, seed + i * 17)
    norm += amp
    amp *= gain
    f *= lac
  }
  return sum / norm
}
