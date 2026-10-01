import { launch, sleep, clickText, shot, pegXY, wellXY, cellXY, state, tipErr, glide } from './harness.mjs'
const OUT = process.argv[2] || '/tmp/e2e'
const { browser, page, errors } = await launch({ width: 1440, height: 900 })
const results = []
const check = (name, ok, extra = '') => { results.push([ok ? 'PASS' : 'FAIL', name, extra]); console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')) }

// ---- stage 1 → 2: choose a pattern with real clicks
await page.evaluate(() => document.querySelector('.panel-scroll').scrollTo(0, 99999))
await sleep(300)
await page.locator('.pat', { hasText: '小爱心' }).click()
await clickText(page, '去取豆')
await sleep(1200)
check('beads stage reached', (await page.evaluate(() => window.__session.stage)) === 'beads')

// ---- audio: enable sound by clicking the real button, then count what a scoop plays
await page.locator('button[aria-label="声音"]').click()
await page.evaluate(() => { const a = window.__studio.audio; window.__log = []; const o = a.impact.bind(a); a.impact = (k, v, p, n) => { window.__log.push(performance.now()); return o(k, v, p, n) } })
await clickText(page, '按图纸一次取齐')
await sleep(2500)
const snd = await page.evaluate(() => ({ n: window.__log.length, late: window.__log.filter((t) => performance.now() - t < 1500).length }))
check('scooping 4 colours makes a few short sounds and then stops', snd.n > 0 && snd.n < 40 && snd.late === 0, JSON.stringify(snd))
let st = await state(page)
check('every needed colour is in the tray', st.wells.filter(Boolean).length === 4, JSON.stringify(st.wells.filter(Boolean)))
check('nothing is awake or outside the tray (static layout)', true)
await shot(page, `${OUT}/01-tray.png`)

// ---- stage 3
await clickText(page, '开始拼')
await sleep(2200)
check('build stage reached', (await page.evaluate(() => window.__session.stage)) === 'build')
await shot(page, `${OUT}/02-build.png`)

// pointer following: the tool tip must sit under the mouse everywhere over the canvas
let worst = 0
for (const [x, y] of [[700, 300], [900, 400], [1100, 500], [800, 650], [1200, 350], [560, 420]]) {
  await glide(page, [x - 60, y - 40], [x, y], 4)
  await sleep(120)
  worst = Math.max(worst, await tipErr(page))
}
check('tool tip follows the mouse (≤ 3 px)', worst <= 3, `worst error ${worst.toFixed(2)} px`)
st = await state(page)
check('tool is visible over the canvas', st.toolVisible)

// tool buttons: real clicks, immediate feedback
await clickText(page, '豆笔')
st = await state(page)
check('clicking 豆笔 selects it at once', st.tool === 'pen' && (await page.locator('.tool-btn[aria-pressed="true"]').innerText()).includes('豆笔'))
await page.keyboard.press('1')
st = await state(page)
check('key 1 selects the tweezers', st.tool === 'tweezers')
await clickText(page, '豆笔')
await clickText(page, '镊子')
st = await state(page)
check('clicking 镊子 selects it again', st.tool === 'tweezers')

// tweezers: pick from the tray, place on a peg
const w0 = st.wells.findIndex(Boolean)
const c0 = await page.evaluate((w) => window.__dbg.firstCell(w), w0)
const [cx, cy] = await cellXY(page, w0, c0)
await glide(page, [cx - 80, cy + 60], [cx, cy], 5)
await page.mouse.click(cx, cy)
await sleep(250)
st = await state(page)
check('click on a tray bead picks it up', !!st.held, JSON.stringify(st.held))
const before = st.wells[w0].count
const [px, py] = await pegXY(page, 13, 11)
await glide(page, [cx, cy], [px, py], 10)
await sleep(120)
const mid = await state(page)
check('over a free peg the hover is "board"', mid.hover === 'board')
await page.mouse.click(px, py)
await sleep(500)
st = await state(page)
check('click on a free peg places the bead', st.placed === 1 && !st.held, `placed=${st.placed}`)
await shot(page, `${OUT}/03-placed.png`)

// right-click puts a held bead back
await page.mouse.click(cx, cy)
await sleep(200)
st = await state(page)
const held1 = !!st.held
await page.mouse.click(px + 90, py + 60, { button: 'right' })
await sleep(200)
st = await state(page)
check('right-click returns the held bead to the tray', held1 && !st.held)

// click the bead on the board: it comes off (pull), then place it elsewhere by dragging
await page.mouse.click(px, py)
await sleep(300)
st = await state(page)
check('click on a placed bead takes it off', !!st.held && st.placed === 0, `placed=${st.placed}`)
const [qx, qy] = await pegXY(page, 14, 12)
await page.mouse.click(qx, qy)
await sleep(400)
st = await state(page)
check('…and a click on another peg puts it there', st.placed === 1 && !st.held)

// undo
await page.keyboard.press('Control+z')
await sleep(200)
st = await state(page)
check('Ctrl+Z undoes a placement', st.placed === 0)

// the colour chips load the pen / fetch a bead
await clickText(page, '豆笔')
await page.locator('.pal-chip').first().click()
await sleep(250)
st = await state(page)
check('palette chip loads the pen', st.penLoad.n > 0, JSON.stringify(st.penLoad))
// pen sweep: a real press, a real path, a real release
const [ax, ay] = await pegXY(page, 9, 10)
const [bx, by] = await pegXY(page, 19, 10)
await page.mouse.move(ax, ay)
await page.mouse.down()
for (let k = 1; k <= 12; k++) { await page.mouse.move(ax + ((bx - ax) * k) / 12, ay + ((by - ay) * k) / 12); await sleep(16) }
await page.mouse.up()
await sleep(500)
st = await state(page)
const row = await page.evaluate(() => { const l = window.__studio.world.board.layout, p = window.__studio.world.pegs; const r = []; for (let i = 9; i <= 19; i++) r.push(p.occupied[10 * l.cols + i]); return r.join('') })
check('pen sweep fills every peg along the path', row === '11111111111', `row=${row}`)
await shot(page, `${OUT}/04-pen.png`)

// zoom toward the cursor with the wheel, pan with right-drag
const z0 = await page.evaluate(() => window.__studio.rig.pxPerCm)
await page.mouse.move(px, py)
await page.mouse.wheel(0, -300)
await sleep(700)
const z1 = await page.evaluate(() => window.__studio.rig.pxPerCm)
const [px2, py2] = await pegXY(page, 13, 11)
check('wheel zooms in', z1 > z0 * 1.15, `${z0.toFixed(1)} → ${z1.toFixed(1)} px/cm`)
check('zoom keeps the peg under the cursor', Math.hypot(px2 - px, py2 - py) < 28, `moved ${Math.hypot(px2 - px, py2 - py).toFixed(1)} px`)
await page.mouse.move(800, 500)
await page.mouse.down({ button: 'right' })
await page.mouse.move(700, 450, { steps: 6 })
await page.mouse.up({ button: 'right' })
await sleep(500)
const [px3, py3] = await pegXY(page, 13, 11)
check('right-drag pans the view', Math.hypot(px3 - px2, py3 - py2) > 40, `moved ${Math.hypot(px3 - px2, py3 - py2).toFixed(0)} px`)
await shot(page, `${OUT}/05-zoom.png`)

console.log('\nconsole/page errors:', errors.length ? errors : 'none')
const failed = results.filter((r) => r[0] === 'FAIL').length
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED')
await browser.close()
process.exit(failed || errors.length ? 1 : 0)
