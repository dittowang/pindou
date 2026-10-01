import { launch, sleep, clickText, shot, state, pegXY, cellXY, BASE } from './harness.mjs'
const OUT = process.argv[2] || '/tmp/e2e'
const { browser, page, errors } = await launch({ width: 1440, height: 900, url: BASE + '?q=medium&nowelcome=1&seed=21' })
const results = []
const check = (name, ok, extra = '') => { results.push(ok); console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')) }
const layout = () => page.evaluate(() => { const l = window.__studio.world.board.layout; return { shape: l.shape, n: l.cols, scale: window.__studio.world.dims.id, pegs: window.__studio.world.board.layout.mask.reduce((a, b) => a + b, 0) } })

// every control on the first screen, by real clicks
await page.locator('.tile', { hasText: '圆板' }).click(); await sleep(900)
let l = await layout(); check('round board', l.shape === 'circle', JSON.stringify(l))
await page.locator('.tile', { hasText: '心形板' }).click(); await sleep(900)
l = await layout(); check('heart board', l.shape === 'heart', JSON.stringify(l))
await page.locator('.tile', { hasText: '方板' }).click(); await sleep(600)
await page.locator('button', { hasText: '大板 52×52' }).click(); await sleep(1500)
l = await layout(); check('big board 52×52', l.n === 52 && l.shape === 'square', JSON.stringify(l))
await page.locator('.card', { hasText: '标准豆 5mm' }).click(); await sleep(1500)
l = await layout(); check('midi beads → 29×29', l.scale === 'midi', JSON.stringify(l))
await page.locator('.card', { hasText: '迷你豆 2.6mm' }).click(); await sleep(1500)
await page.locator('button', { hasText: '小板 26×26' }).click(); await sleep(1200)
l = await layout(); check('back to mini 26×26', l.scale === 'mini' && l.n === 26, JSON.stringify(l))
await shot(page, `${OUT}/b1-board.png`)

// free building (no pattern): take colours from the wall with real clicks, then place on a round board
await page.locator('.tile', { hasText: '圆板' }).click(); await sleep(900)
await clickText(page, '去取豆'); await sleep(1000)
await page.locator('.chip').nth(3).click(); await sleep(300)          // A4
await page.locator('.chip').nth(8).click(); await sleep(300)
let st = await state(page)
check('wall chips fill compartments (free build)', st.wells.filter(Boolean).length === 2, JSON.stringify(st.wells.filter(Boolean)))
await page.locator('.series-tabs button').nth(5).click(); await sleep(200)   // series F
await page.locator('.chip').nth(0).click(); await sleep(300)
st = await state(page)
check('another series works', st.wells.filter(Boolean).length === 3)
await clickText(page, '开始拼'); await sleep(2200)
await shot(page, `${OUT}/b2-free-build.png`)
// pick with the HUD chip and place on the round board's centre
await page.locator('.pal-chip').first().click(); await sleep(250)
const [px, py] = await pegXY(page, 12, 12)
await page.mouse.move(px - 40, py - 30); await sleep(100)
await page.mouse.click(px, py); await sleep(400)
st = await state(page)
check('free build: chip → peg places a bead on a round board', st.placed === 1, `placed=${st.placed}`)
// a peg that does not exist (the corner of a round board) must not take a bead
const [cx, cy] = await pegXY(page, 0, 0)
await page.locator('.pal-chip').first().click(); await sleep(200)
await page.mouse.move(cx, cy); await page.mouse.click(cx, cy); await sleep(300)
st = await state(page)
check('corner of a round board takes no bead', st.placed === 1 && !!st.held, `placed=${st.placed} held=${!!st.held}`)
await page.mouse.click(cx + 5, cy + 5, { button: 'right' }); await sleep(200)

// back and forth between stages must not leave anything behind
await clickText(page, '去熨烫'); await sleep(2500)
await page.locator('button.btn.ghost').first().click(); await sleep(2200)       // ← back to build
check('back from the iron stage returns to build', (await page.evaluate(() => window.__session.stage)) === 'build')
await page.locator('.step', { hasText: '取豆' }).click(); await sleep(1500)
check('the stepper goes back to 取豆', (await page.evaluate(() => window.__session.stage)) === 'beads')
console.log('\nconsole/page errors:', errors.length ? errors : 'none')
const failed = results.filter((r) => !r).length
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED')
await browser.close()
process.exit(failed || errors.length ? 1 : 0)
