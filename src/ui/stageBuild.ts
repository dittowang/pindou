import { h, icon, mount, beadChip } from './dom'
import type { PanelCtx, StagePanel } from './shell'
import { PALETTE } from '../config/palette'
import type { Tool } from '../interact/build'

/**
 * Stage 3 — placing beads. Two things live here:
 *   • the left panel (progress, the tray's compartments, the check button), and
 *   • on the canvas: a coach line that always says what to do next, and a toolbar with the two tools, undo and zoom.
 * Everything is built once and updated in place; nothing is re-created on a timer, so clicks always land.
 */
export function buildBuildPanel({ session, shell }: PanelCtx): StagePanel {
  const el = h('div')
  const foot = h('div', { class: 'panel-foot' })
  const studio = session.studio
  const build = () => studio.build
  const model = () => studio.world.trayModel

  // ------------------------------------------------------------------ left panel
  const total = () => session.setup.pattern?.total ?? 0
  const progText = h('span', { class: 'hint num' })
  const progBar = h('i')
  const progWrap = h('div', { class: 'bar', style: 'height:6px' }, progBar)
  const wellBox = h('div', { class: 'need' })
  const wellRows = new Map<number, { row: HTMLElement; cnt: HTMLElement; locate: HTMLButtonElement | null }>()
  let wellKey = ''
  const checkBtn = h('button', { class: 'btn small line', style: 'width:100%' }) as HTMLButtonElement
  const checkText = h('span', { class: 'hint num' })
  const checkSec = h('div', { class: 'sec' },
    h('div', { class: 'sec-h' }, h('h3', null, '对图'), checkText),
    checkBtn,
    h('p', { class: 'hint', style: 'margin-top:8px' }, '红圈：颜色和图纸对不上；黄点：这个位置还没拼。'))

  const buildWells = () => {
    const m = model()
    const key = m.wells.map((w) => (w ? w.pal : '-')).join(',') + '|' + String(!!session.setup.pattern)
    if (key === wellKey) return
    wellKey = key
    wellRows.clear()
    const rows: HTMLElement[] = []
    m.wells.forEach((w, i) => {
      if (!w) return
      const c = PALETTE[w.pal]
      const cnt = h('small', null, '')
      let locate: HTMLButtonElement | null = null
      if (session.setup.pattern) {
        locate = h('button', { class: 'btn small line', title: '在图纸上标出这个颜色还没拼的位置', onclick: () => {
          const g = studio.guide
          const on = g?.mode === 'color' && g.colorIdx === w.pal
          g?.setMode(on ? 'off' : 'color', w.pal)
          syncPanel()
        } }, icon('eye')) as HTMLButtonElement
      }
      const row = h('div', { class: 'need-row' },
        beadChip(c, 30),
        h('div', { class: 'nm' }, c.code, cnt),
        h('div', { style: 'display:flex;gap:6px' },
          locate,
          h('button', { class: 'btn small line', title: '再取一勺', onclick: () => {
            const mm = model()
            mm.scoop(c, mm.scoopSize)
            studio.audio.pour(mm.scoopSize)
          } }, icon('plus'), '一勺')))
      wellRows.set(i, { row, cnt, locate })
      rows.push(row)
    })
    mount(wellBox, ...(rows.length ? rows : [h('p', { class: 'hint' }, '豆盘是空的——回到上一步取豆。')]))
  }

  const syncPanel = () => {
    const placed = build().placedCount, tot = total()
    progText.textContent = tot ? `${placed} / ${tot} 颗` : `${placed} 颗`
    progWrap.style.display = tot ? '' : 'none'
    progBar.style.width = `${tot ? Math.min(100, (placed / tot) * 100) : 0}%`
    progWrap.classList.toggle('ok', tot > 0 && placed >= tot)
    buildWells()
    const m = model()
    const g = studio.guide
    for (const [i, r] of wellRows) {
      const w = m.wells[i]
      if (!w) continue
      r.cnt.textContent = w.count ? `${w.count} 颗在盘里` : '空了'
      if (r.locate) {
        const on = g?.mode === 'color' && g.colorIdx === w.pal
        r.locate.style.cssText = on ? 'background:var(--accent-soft);border-color:var(--accent)' : ''
      }
    }
    checkSec.style.display = session.setup.pattern ? '' : 'none'
    const checking = g?.mode === 'check'
    checkText.textContent = checking ? `${g!.wrong} 处不对 · ${g!.missing} 处没拼` : '烫之前，核对一遍'
    mount(checkBtn, icon('eye'), checking ? '收起标记' : '请店员帮我看看')
  }
  checkBtn.onclick = () => {
    const g = studio.guide
    g?.setMode(g.mode === 'check' ? 'off' : 'check')
    syncPanel()
  }

  mount(el,
    h('div', { class: 'eyebrow' }, '03 / 拼 · Place'),
    h('h1', { class: 'h-display' }, '一颗一颗，慢慢来'),
    h('div', { class: 'howto' },
      h('div', null, h('b', null, '镊子'), '点豆盘里的豆子夹起来 → 点板上的钉子放下'),
      h('div', null, h('b', null, '豆笔'), '点豆盘里的颜色装豆 → 按住鼠标在钉子上划过'),
      h('div', { class: 'muted' }, '右键单击放回 · 右键拖动平移 · 滚轮缩放 · 板上的豆点一下可取下')),
    h('div', { class: 'sec' }, h('div', { class: 'sec-h' }, h('h3', null, '进度'), progText), progWrap),
    h('div', { class: 'sec' }, h('div', { class: 'sec-h' }, h('h3', null, '豆盘')), wellBox),
    checkSec,
  )

  const back = h('button', { class: 'btn ghost', onclick: () => session.go('beads') }, icon('back'))
  const go = h('button', { class: 'btn primary', onclick: () => session.go('iron') }, '去熨烫', icon('arrow'))
  mount(foot, back, go)

  // ------------------------------------------------------------------ on the canvas
  const coach = h('div', { class: 'coach', role: 'status' })
  const mkTool = (id: Tool, label: string, tip: string, key: string) =>
    h('button', { class: 'tool-btn', title: `${tip}（按 ${key}）`, onclick: () => { build().setTool(id); syncHud() } },
      icon(id === 'tweezers' ? 'tweezers' : 'pen'), h('span', { class: 't' }, label), h('kbd', null, key)) as HTMLButtonElement
  const bTweezers = mkTool('tweezers', '镊子', '精准夹取，一次一颗', '1')
  const bPen = mkTool('pen', '豆笔', '装一排豆，按住划过钉子连续放', '2')
  const bUndo = h('button', { class: 'tool-btn plain', title: '撤销（Ctrl/⌘ + Z）', onclick: () => build().undo() }, icon('undo'), h('span', { class: 't' }, '撤销')) as HTMLButtonElement
  const bOut = h('button', { class: 'tool-btn icon-only', title: '缩小', 'aria-label': '缩小', onclick: () => studio.rig.zoom(1.25) }, icon('zoomOut')) as HTMLButtonElement
  const bIn = h('button', { class: 'tool-btn icon-only', title: '放大', 'aria-label': '放大', onclick: () => studio.rig.zoom(0.8) }, icon('zoomIn')) as HTMLButtonElement
  const bFit = h('button', { class: 'tool-btn icon-only', title: '回到全景（按 0）', 'aria-label': '回到全景', onclick: () => studio.rig.resetUser() }, icon('focus')) as HTMLButtonElement
  const count = h('b', { class: 'num' }, '0')
  const countWrap = h('span', { class: 'count' }, '已放 ', count)
  const toolbar = h('div', { class: 'toolbar' },
    h('div', { class: 'seg-tools' }, bTweezers, bPen), h('span', { class: 'sep' }), bUndo, h('span', { class: 'sep' }), bOut, bIn, bFit, h('span', { class: 'sep' }), countWrap)

  // colour chips: a shortcut to the tray (take a bead of that colour / load the pen), always in reach however the view is zoomed
  const palette = h('div', { class: 'palette' })
  const palChips = new Map<number, { btn: HTMLButtonElement; cnt: HTMLElement }>()
  let palKey = ''
  const buildPalette = () => {
    const m = model()
    const key = m.wells.map((w) => (w ? w.pal : '-')).join(',')
    if (key === palKey) return
    palKey = key
    palChips.clear()
    const kids: HTMLElement[] = []
    m.wells.forEach((w, i) => {
      if (!w) return
      const c = PALETTE[w.pal]
      const cnt = h('span', { class: 'n' })
      const btn = h('button', { class: 'pal-chip', title: `取一颗 ${c.code}`, onclick: () => { build().chooseColor(i) } }, beadChip(c, 24), h('span', { class: 'c' }, c.code), cnt) as HTMLButtonElement
      palChips.set(i, { btn, cnt })
      kids.push(btn)
    })
    mount(palette, ...(kids.length ? [h('span', { class: 'pal-label' }, '点颜色取豆'), ...kids] : []))
  }
  const syncPalette = () => {
    buildPalette()
    const m = model(), b = build()
    const inHand = b.held?.pal ?? (b.penLoad.n > 0 ? b.penLoad.pal : -1)
    for (const [i, ch] of palChips) {
      const w = m.wells[i]
      if (!w) continue
      ch.cnt.textContent = String(w.count)
      ch.btn.setAttribute('aria-pressed', String(w.pal === inHand))
      ch.btn.disabled = w.count <= 0
    }
  }

  // the palette and the toolbar stack in one dock, so they can never cover each other
  const dock = h('div', { class: 'hud-dock' }, palette, toolbar)

  const syncHud = () => {
    syncPalette()
    const b = build()
    bTweezers.setAttribute('aria-pressed', String(b.tool === 'tweezers'))
    bPen.setAttribute('aria-pressed', String(b.tool === 'pen'))
    bUndo.disabled = !b.canUndo
    count.textContent = total() ? `${b.placedCount} / ${total()}` : String(b.placedCount)
    coach.textContent = b.hint
    coach.dataset.state = b.held ? 'holding' : b.penLoad.n > 0 ? 'loaded' : 'idle'
  }
  const syncAll = () => { syncPanel(); syncHud() }

  window.addEventListener('keydown', (e) => {
    if (session.stage !== 'build') return
    const tag = (e.target as HTMLElement | null)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') return
    if (e.key === '1') { build().setTool('tweezers'); syncHud() }
    if (e.key === '2') { build().setTool('pen'); syncHud() }
  })

  session.bus.on('build', () => { if (session.stage === 'build') syncAll() })
  session.bus.on('tray', () => { if (session.stage === 'build') syncAll() })
  session.bus.on('setup', () => { wellKey = ''; if (session.stage === 'build') syncAll() })

  return {
    el, foot,
    show: () => {
      wellKey = ''
      palKey = ''
      syncAll()
      shell.hud.append(coach, dock)
    },
    hide: () => { coach.remove(); dock.remove(); studio.guide?.setMode('off') },
  }
}
