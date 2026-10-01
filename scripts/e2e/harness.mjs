/**
 * End-to-end harness: a real browser, REAL mouse and keyboard events (Playwright's `page.mouse` goes through the
 * browser's input pipeline and normal hit-testing — nothing is dispatched straight onto the canvas).
 * Playwright is a dev-only tool and is not a dependency of the app: set PLAYWRIGHT_PATH=/path/to/playwright/index.mjs,
 * or `npm i -D playwright && npx playwright install chromium`.
 * PINDOU_URL points the tests at another build (default: the local dev server), e.g. the deployed site.
 */
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const candidates = [process.env.PLAYWRIGHT_PATH, 'playwright'].filter(Boolean)
let chromium
for (const c of candidates) { try { ;({ chromium } = await import(c)); break } catch { /* next */ } }
if (!chromium) { console.error('Playwright not found (set PLAYWRIGHT_PATH)'); process.exit(1) }

export const BASE = (process.env.PINDOU_URL ?? 'http://localhost:5180/').replace(/\/*$/, '/')

export async function launch({ width = 1440, height = 900, dpr = 1, url = BASE + '?q=medium&nowelcome=1' } = {}) {
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--autoplay-policy=no-user-gesture-required'] })
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: dpr })
  const errors = []
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })
  await page.goto(url, { waitUntil: 'load', timeout: 120000 })
  await page.waitForFunction(() => window.__studio && window.__dbg, null, { timeout: 120000 })
  await page.waitForTimeout(1500)
  return { browser, page, errors }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** run a function in the page */
export const ev = (page, fn, arg) => page.evaluate(fn, arg)

/** a real click on a visible button by its text */
export async function clickText(page, text, { exact = false } = {}) {
  const loc = page.locator('button', { hasText: text }).filter({ visible: true })
  const n = await loc.count()
  if (!n) throw new Error('no visible button with text: ' + text)
  await (exact ? page.getByRole('button', { name: text, exact: true }).first() : loc.first()).click()
}

export async function shot(page, path) {
  mkdirSync(dirname(path), { recursive: true })
  await page.screenshot({ path })
  return path
}

/** screen position of things, from the app's read-only debug helpers */
export const pegXY = (page, i, j) => page.evaluate(([i, j]) => window.__dbg.peg(i, j), [i, j])
export const wellXY = (page, w) => page.evaluate((w) => window.__dbg.well(w), w)
export const cellXY = (page, w, c) => page.evaluate(([w, c]) => window.__dbg.cell(w, c), [w, c])
export const state = (page) => page.evaluate(() => window.__dbg.state())
export const tipErr = (page) => page.evaluate(() => {
  const t = window.__dbg.tip(), m = window.__studio.ptr.client
  return Math.hypot(t[0] - m.x, t[1] - m.y)
})

/** a human-ish mouse path: a few intermediate moves */
export async function glide(page, [x0, y0], [x1, y1], steps = 8) {
  await page.mouse.move(x0, y0)
  for (let k = 1; k <= steps; k++) { await page.mouse.move(x0 + ((x1 - x0) * k) / steps, y0 + ((y1 - y0) * k) / steps); await sleep(12) }
}
