import { mkdirSync } from 'node:fs'
import { sleep, BASE } from './harness.mjs'
const candidates = [process.env.PLAYWRIGHT_PATH, 'playwright'].filter(Boolean)
let chromium, devices
for (const c of candidates) { try { const m = await import(c); chromium = m.chromium; devices = m.devices; break } catch { /* next */ } }
const OUT = process.argv[2] || '/tmp/e2e'
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'] })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
await page.goto(BASE + '?q=medium&nowelcome=1&seed=3', { waitUntil: 'load' })
await page.waitForFunction(() => window.__studio && window.__dbg, null, { timeout: 120000 })
await sleep(1500)
const results = []
const check = (name, ok, extra = '') => { results.push(ok); console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')) }
const tapText = async (t) => { const l = page.locator('button', { hasText: t }).filter({ visible: true }).first(); await l.tap() }
await page.evaluate(() => document.querySelector('.panel-scroll').scrollTo(0, 99999)); await sleep(300)
await page.locator('.pat', { hasText: '小爱心' }).tap()
await tapText('去取豆'); await sleep(1000)
await tapText('按图纸一次取齐'); await sleep(800)
await page.screenshot({ path: `${OUT}/m1-beads.png` })
await tapText('开始拼'); await sleep(2500)
await page.screenshot({ path: `${OUT}/m2-build.png` })
let st = await page.evaluate(() => window.__dbg.state())
check('build stage on a phone', (await page.evaluate(() => window.__session.stage)) === 'build')
// tap a palette chip to take a bead, then tap a peg to place it
await page.locator('.pal-chip').first().tap(); await sleep(300)
st = await page.evaluate(() => window.__dbg.state())
check('tapping a colour chip picks a bead', !!st.held)
const [px, py] = await page.evaluate(() => window.__dbg.peg(12, 11))
// the working point sits ABOVE the finger on touch: tap a bit below the peg
await page.touchscreen.tap(px, py + 55)
await sleep(500)
st = await page.evaluate(() => window.__dbg.state())
check('tapping near a peg places the bead (finger offset)', st.placed === 1, `placed=${st.placed}`)
await page.screenshot({ path: `${OUT}/m3-placed.png` })
console.log('errors:', errors.length ? errors : 'none')
await browser.close()
process.exit(results.includes(false) || errors.length ? 1 : 0)
