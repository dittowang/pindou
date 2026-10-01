import { launch, sleep, clickText, shot, state, glide, BASE } from './harness.mjs'
const OUT = process.argv[2] || '/tmp/e2e'
const MODE = process.argv[3] || 'holes'
const { browser, page, errors } = await launch({ width: 1440, height: 900, url: BASE + '?q=medium&nowelcome=1&seed=11' })
const results = []
const check = (name, ok, extra = '') => { results.push(ok); console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')) }
const bench = () => page.evaluate(() => window.__dbg.bench())
const onPaper = (x, z) => page.evaluate(([x, z]) => window.__dbg.onPaper(x, z), [x, z])
const stepIs = async (s) => (await bench()).step === s

await page.locator('button[aria-label="声音"]').click(); await sleep(400)
// get to a filled board quickly (the placing itself is covered by build.mjs): a real click on a pattern, then fill
await page.evaluate(() => document.querySelector('.panel-scroll').scrollTo(0, 99999))
await page.locator('.pat', { hasText: '樱桃' }).click()
await clickText(page, '去取豆'); await sleep(800)
await clickText(page, '按图纸一次取齐'); await sleep(600)
await clickText(page, '开始拼'); await sleep(1500)
await page.evaluate(() => window.__fill('cherry'))
await sleep(500)
await clickText(page, '去熨烫'); await sleep(2800)
check('iron stage reached (prep)', await stepIs('prep'))
await shot(page, `${OUT}/iron-1-prep.png`)

if (MODE === 'flat') {
  await page.locator('.card', { hasText: '无孔烫' }).click()
  await sleep(300)
  check('无孔烫 selected', (await bench()).mode === 'flat')
  await clickText(page, '贴美纹纸'); await sleep(2800)
  check('tape step', await stepIs('tape'))
  // roll over the beads with the real mouse
  for (let r = 0; r < 7; r++) {
    const a = await onPaper(-2.4, -2.6 + r * 0.8), b = await onPaper(2.4, -2.6 + r * 0.8)
    await page.mouse.move(a[0], a[1]); await page.mouse.down()
    for (let k = 1; k <= 14; k++) { await page.mouse.move(a[0] + ((b[0] - a[0]) * k) / 14, a[1] + ((b[1] - a[1]) * k) / 14); await sleep(20) }
    await page.mouse.up()
  }
  const b1 = await bench()
  check('rolling presses the tape on', b1.stick > 0.25, `stick=${b1.stick.toFixed(2)}`)
  await shot(page, `${OUT}/iron-2-tape.png`)
  await clickText(page, '倒扣脱板'); await sleep(3500)
  check('board lifted off, piece flipped', await stepIs('flipped'))
  await clickText(page, '盖纸烫（无孔）'); await sleep(2800)
} else {
  await clickText(page, '盖上去'); await sleep(2800)
}
check('lint step', await stepIs('lint'))
const left0 = (await bench()).lintLeft
// real rolling over the whole sheet
for (let r = 0; r < 9; r++) {
  const a = await onPaper(-3.6, -3.4 + r * 0.85), b = await onPaper(3.6, -3.4 + r * 0.85)
  await page.mouse.move(a[0], a[1]); await page.mouse.down()
  for (let k = 1; k <= 14; k++) { await page.mouse.move(a[0] + ((b[0] - a[0]) * k) / 14, a[1] + ((b[1] - a[1]) * k) / 14); await sleep(20) }
  await page.mouse.up()
}
const left1 = (await bench()).lintLeft
check('lint roller picks up the fluff', left1 < left0, `${left0} → ${left1}`)
await shot(page, `${OUT}/iron-3-lint.png`)
await clickText(page, left1 ? '就这样吧' : '开始烫'); await sleep(1500)
check('ironing step', ['iron', 'back'].includes((await bench()).step))

// the iron must follow the real mouse
await page.evaluate(() => { window.__studio.iron.thermo.plateT = 150 })
let worst = 0
for (const [x, z] of [[-1.5, -1.2], [1.5, 0.5], [0, 1.8], [-2, 1.5]]) {
  const p = await onPaper(x, z)
  await glide(page, [p[0] - 50, p[1] - 30], p, 5)
  await sleep(500)
  const b = await bench()
  const m = await page.evaluate(() => window.__studio.ptr.client.toArray())
  const cur = await page.evaluate(() => { const c = window.__studio.iron.cursorWorld; return window.__dbg.project(c.x, c.y, c.z) })
  worst = Math.max(worst, Math.hypot(cur[0] - m[0], cur[1] - m[1]))
}
check('the iron follows the mouse (≤ 6 px)', worst <= 6, `worst ${worst.toFixed(1)} px`)

// press and heat with real clicks, time sped up
await page.evaluate(() => { window.__studio.iron.sim.timeScale = 7 })
const pts = [[-1.8, -2], [1.8, -2], [1.8, 0], [-1.8, 0], [0, -1], [0, 1.5], [-1.8, 1.8], [1.8, 1.8]]
for (let rep = 0; rep < 3; rep++) for (const [x, z] of pts) {
  const p = await onPaper(x, z)
  await page.mouse.move(p[0], p[1]); await sleep(120)
  await page.mouse.down(); await sleep(520); await page.mouse.up(); await sleep(60)
}
await page.evaluate(() => { window.__studio.iron.sim.timeScale = 1 })
const st = await page.evaluate(() => window.__studio.iron.sim.stats())
check('holding the mouse heats and melts the beads', st.mean > 0.2, `mean dose ${st.mean.toFixed(2)}`)
await shot(page, `${OUT}/iron-4-ironing.png`)
await clickText(page, /烫好了|反面烫好了/.source ? '烫好了' : '烫好了'); await sleep(600)
await page.evaluate(() => window.__studio.iron.sim.coolAll(120))
await sleep(400)
check('cooling step', await stepIs('cool'))
await clickText(page, '揭纸'); await sleep(3200)

if (MODE === 'flat') {
  check('peeled, ready to press', await stepIs('press'))
} else {
  check('paper peeled, piece on the board', await stepIs('onboard'))
  await clickText(page, '脱板，翻过来'); await sleep(3400)
  check('piece flipped', await stepIs('flipped'))
  await clickText(page, '盖纸烫背面'); await sleep(2800)
  for (let r = 0; r < 9; r++) {
    const a = await onPaper(-3.6, -3.4 + r * 0.85), b = await onPaper(3.6, -3.4 + r * 0.85)
    await page.mouse.move(a[0], a[1]); await page.mouse.down()
    for (let k = 1; k <= 8; k++) { await page.mouse.move(a[0] + ((b[0] - a[0]) * k) / 8, a[1] + ((b[1] - a[1]) * k) / 8); await sleep(15) }
    await page.mouse.up()
  }
  await clickText(page, '就这样吧').catch(() => clickText(page, '开始烫')); await sleep(1200)
  await page.evaluate(() => { window.__studio.iron.thermo.plateT = 150; window.__studio.iron.sim.timeScale = 7 })
  for (let rep = 0; rep < 2; rep++) for (const [x, z] of pts) {
    const p = await page.evaluate(([x, z]) => { const I = window.__studio.iron; return window.__dbg.project(x, I.slabT + 0.35, z) }, [x, z])
    await page.mouse.move(p[0], p[1]); await sleep(120); await page.mouse.down(); await sleep(520); await page.mouse.up(); await sleep(60)
  }
  await page.evaluate(() => { window.__studio.iron.sim.timeScale = 1 })
  await clickText(page, '反面烫好了'); await sleep(600)
  await page.evaluate(() => window.__studio.iron.sim.coolAll(120)); await sleep(400)
  await clickText(page, '揭纸'); await sleep(3200)
  check('back peeled → press', await stepIs('press'))
}
await page.locator('.card', { hasText: '厚书' }).click(); await sleep(11000)
check('pressing finishes', (await bench()).step === 'pressing' || (await bench()).step === 'done')
await clickText(page, '拿起来'); await sleep(1500)
await clickText(page, '去看看成品'); await sleep(4500)
check('finish stage reached', (await page.evaluate(() => window.__session.stage)) === 'finish')
const fin = await state(page)
check('no sound is left running (only the 2 room-tone loops)', fin.loops <= 2, `loops=${fin.loops}`)
await shot(page, `${OUT}/iron-5-finish.png`)
// finish stage interactions with real clicks
await page.locator('.card', { hasText: '装进相框' }).click(); await sleep(3500)
await shot(page, `${OUT}/iron-6-frame.png`)
await page.locator('.card', { hasText: '做成钥匙扣' }).click(); await sleep(3500)
await shot(page, `${OUT}/iron-7-keychain.png`)

console.log('\nconsole/page errors:', errors.length ? errors : 'none')
const failed = results.filter((r) => !r).length
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED')
await browser.close()
process.exit(failed || errors.length ? 1 : 0)
