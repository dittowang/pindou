#!/usr/bin/env node
/**
 * Headless capture harness (Playwright's cached Chromium, real GPU via ANGLE/Metal).
 *   node scripts/shot.mjs --url="http://localhost:5180/?q=medium" --eval="await __sim.wait(500)" --out=/tmp/a.png --size=1280x800
 * Flags: --url  --boot=ms (wait after load)  --eval (JS run in page, awaited; its return value is printed)  --wait=ms (before the shot)
 *        --out (png)  --size=WxH  --dpr=N  --log (print console)  --evals="js1;;js2" (several shots: out-1.png, out-2.png…)
 */
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
// Playwright is a dev-only tool and is not a dependency of the app. Use PLAYWRIGHT_PATH=/path/to/playwright/index.mjs,
// or `npm i -D playwright` here.
const candidates = [process.env.PLAYWRIGHT_PATH, 'playwright'].filter(Boolean)
let chromium
for (const c of candidates) {
  try { ;({ chromium } = await import(c)); break } catch { /* try the next */ }
}
if (!chromium) { console.error('Playwright not found. Set PLAYWRIGHT_PATH or run: npm i -D playwright && npx playwright install chromium'); process.exit(1) }

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=([\s\S]*))?$/)
  return m ? [m[1], m[2] ?? true] : [a, true]
}))
const url = args.url ?? 'http://localhost:5180/?q=medium'
const [W, H] = String(args.size ?? '1280x800').split('x').map(Number)
const out = args.out ?? '/tmp/pindou-shot.png'
mkdirSync(dirname(out), { recursive: true })

const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--enable-unsafe-webgpu', '--autoplay-policy=no-user-gesture-required'],
})
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: Number(args.dpr ?? 1) })
if (args.log) page.on('console', (m) => console.log('[console]', m.type(), m.text()))
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
await page.goto(url, { waitUntil: 'load', timeout: 120000 })
await page.waitForFunction(() => window.__studio, null, { timeout: 120000 }).catch(() => {})
await page.waitForTimeout(Number(args.boot ?? 1500))
const list = args.evals ? String(args.evals).split(';;') : [args.eval]
let n = 0
for (const code of list) {
  n++
  if (code) {
    const r = await page.evaluate(`(async()=>{ ${code} })()`).catch((e) => 'EVAL ERROR: ' + e.message)
    if (r !== undefined) console.log(typeof r === 'string' ? r : JSON.stringify(r))
  }
  await page.waitForTimeout(Number(args.wait ?? 300))
  const file = list.length > 1 ? out.replace(/\.png$/, `-${n}.png`) : out
  await page.screenshot({ path: file })
  console.log('saved', file)
}
await browser.close()
