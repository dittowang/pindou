// take a screenshot of a named scene with real clicks (no pattern → free build on a chosen board)
import { launch, sleep, clickText, shot, BASE } from './harness.mjs'
const out = process.argv[2], what = process.argv[3] || 'build'
const { browser, page, errors } = await launch({ width: 1440, height: 900, url: BASE + '?q=medium&nowelcome=1&seed=21' })
if (what === 'build' || what === 'build-round') {
  if (what === 'build-round') await page.locator('.tile', { hasText: '圆板' }).click()
  await page.evaluate(() => document.querySelector('.panel-scroll').scrollTo(0, 99999))
  await page.locator('.pat', { hasText: what === 'build' ? '小爱心' : '空白图纸' }).click()
  await clickText(page, '去取豆'); await sleep(800)
  if (what === 'build') await clickText(page, '按图纸一次取齐'); else { await page.locator('.chip').nth(3).click(); await page.locator('.chip').nth(8).click() }
  await sleep(500)
  await clickText(page, '开始拼'); await sleep(2500)
  const [px, py] = await page.evaluate(() => window.__dbg.peg(13, 11))
  await page.mouse.move(px - 30, py + 20); await sleep(150); await page.mouse.move(px, py); await sleep(500)
}
await shot(page, out)
console.log('errors:', errors.length ? errors : 'none')
await browser.close()
