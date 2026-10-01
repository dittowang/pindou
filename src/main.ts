import './ui/styles.css'
import { Studio } from './app/studio'
import { Session } from './app/session'
import { Shell } from './ui/shell'
import { showPatternPreview } from './debug/patternPreview'
import { installDebug, installFill } from './debug/sim'
import { PALETTE, byCode } from './config/palette'
import { h } from './ui/dom'
import { showWelcome } from './ui/welcome'

const canvas = document.getElementById('stage') as HTMLCanvasElement
const params = new URLSearchParams(location.search)
const quality = (params.get('q') as 'low' | 'medium' | 'high') || 'medium'

if (params.get('scene') === 'patterns') { showPatternPreview(); throw new Error('pattern preview') }

const loader = h('div', { class: 'loader' }, h('div', { class: 'in' }, h('div', { class: 'ring' }), h('p', null, '正在把豆子摆上桌…')))
document.body.append(loader)
document.getElementById('boot')?.remove()

/** the table needs WebGL 2; say so plainly instead of leaving a spinner */
function webglMissing(err: unknown) {
  console.error(err)
  loader.classList.add('gone')
  const msg = h('div', { class: 'loader', style: 'z-index:70' }, h('div', { class: 'in', style: 'max-width:420px;padding:24px' },
    h('p', { style: 'font-size:22px;color:var(--ink)' }, '这张工作台需要 WebGL'),
    h('p', { style: 'font-size:15px;line-height:1.7' }, '浏览器没能创建 3D 画面。试试：换成最新版 Chrome / Safari / Edge，或在设置里打开「硬件加速」，再刷新一次。')))
  document.body.append(msg)
}
const testGl = document.createElement('canvas').getContext('webgl2')
if (!testGl) { webglMissing('no webgl2'); throw new Error('WebGL2 unavailable') }

const scale = (params.get('scale') as 'mini' | 'midi') || 'mini'
const studio = new Studio(canvas)
try {
  await studio.init(quality, scale, {
    shape: (params.get('shape') as 'square' | 'circle' | 'heart') || 'square',
    n: Number(params.get('n') ?? (scale === 'midi' ? 15 : 26)),
  }, params.has('seed') ? Number(params.get('seed')) >>> 0 : undefined)
} catch (e) { webglMissing(e); throw e }
const session = new Session(studio)
session.seed = studio.initSeed
session.setup = { ...session.setup, scale, n: studio.world.board.layout.cols, shape: studio.world.board.layout.shape }
const shell = new Shell(session)
session.printSheet()
session.goShot('board', true)

;(window as any).__studio = studio
;(window as any).__session = session
;(window as any).__shell = shell
;(window as any).__pal = { PALETTE, byCode }
installDebug(studio)
installFill(studio)

if (params.has('debug')) {
  const d = document.getElementById('dbg')!
  d.hidden = false
  d.style.cssText = 'position:fixed;right:10px;bottom:10px;z-index:99;font:12px ui-monospace,monospace;color:#fff;background:rgba(0,0,0,.55);padding:6px 9px;border-radius:8px'
  const prev = studio.onFrame
  studio.onFrame = (dt) => { prev?.(dt); d.textContent = `fps ${studio.fps.toFixed(0)} · beads ${studio.build.placedCount}` }
}
requestAnimationFrame(() => setTimeout(() => loader.classList.add('gone'), 200))
if (!params.has('nowelcome')) showWelcome(studio.audio, () => {
  shell.setSound(true); session.goShot('board')
  // the shop notes the time you sat down
  studio.world.props.setNoteTime(new Date()); session.startedAt = performance.now()
})
