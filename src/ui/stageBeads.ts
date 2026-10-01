import { h, icon, mount, beadChip } from './dom'
import type { PanelCtx, StagePanel } from './shell'
import { PALETTE, SERIES_INFO, SERIES_ORDER, type PaletteColor } from '../config/palette'

interface NeedRow { el: HTMLButtonElement; cnt: HTMLElement; have: HTMLElement; bar: HTMLElement; need: number; pal: number }

/**
 * Stage 2 — the bead wall. Pick colours; they appear in the tray as neat rows of standing beads.
 * The DOM is built once and only its numbers change, so a click is never lost to a re-render.
 */
export function buildBeadsPanel({ session, shell }: PanelCtx): StagePanel {
  const el = h('div')
  const foot = h('div', { class: 'panel-foot' })
  const studio = session.studio
  let series = 'A'
  const model = () => studio.world.trayModel

  const needBox = h('div')
  const wallBox = h('div', { class: 'chips', style: 'margin-top:8px' })
  const tabsBox = h('div', { class: 'series-tabs', role: 'tablist' })
  const usedHint = h('span', { class: 'hint num' })
  const fillAll = h('button', { class: 'btn small line', style: 'width:100%;margin-bottom:8px' }, icon('plus'), '按图纸一次取齐') as HTMLButtonElement

  let needRows: NeedRow[] = []
  const chipBadges = new Map<number, HTMLElement>()

  const addBeads = (c: PaletteColor, n?: number) => {
    const m = model()
    const w = m.scoop(c, n ?? m.scoopSize)
    if (w < 0) { shell.toast('豆盘的 12 格都用上了——先到「拼」那一步倒掉不用的颜色'); return }
    studio.audio.pour(n ?? m.scoopSize)
  }

  // ---- the colours this pattern needs
  const buildNeeds = () => {
    needRows = []
    const p = session.setup.pattern
    if (!p) { mount(needBox); return }
    const rows = p.colors.map((idx) => {
      const c = PALETTE[idx]
      const need = p.counts.get(idx) ?? 0
      const have = h('b', null, '0')
      const bar = h('i')
      const cnt = h('div', { class: 'cnt' }, have, ` / ${need}`)
      const row = h('button', {
        class: 'need-row', title: `取 ${c.code}`,
        onclick: () => {
          const got = model().countIn(model().indexOfPalette(idx))
          // first click brings exactly what the pattern needs; later clicks add a spare scoop
          addBeads(c, got < need ? need - got : undefined)
        },
      },
      beadChip(c, 30),
      h('div', { class: 'nm' }, h('span', null, c.code, ' ', h('small', { style: 'display:inline;margin-left:4px' }, SERIES_INFO[c.series]?.zh ?? '')), h('div', { class: 'bar' }, bar)),
      cnt) as HTMLButtonElement
      needRows.push({ el: row, cnt, have, bar, need, pal: idx })
      return row
    })
    mount(needBox,
      h('div', { class: 'sec' },
        h('div', { class: 'sec-h' }, h('h3', null, '图纸用色'), h('span', { class: 'hint num' }, `${p.colors.length} 色 · ${p.total} 颗`)),
        fillAll,
        h('div', { class: 'need' }, ...rows)))
  }
  fillAll.onclick = () => {
    const p = session.setup.pattern
    if (!p) return
    let full = false
    for (const idx of p.colors) {
      const need = p.counts.get(idx) ?? 0
      const got = model().countIn(model().indexOfPalette(idx))
      if (got >= need) continue
      if (model().scoop(PALETTE[idx], need - got) < 0) { full = true; break }
    }
    if (full) shell.toast('豆盘的格子不够用了')
    else studio.audio.pour(60)
  }

  // ---- the wall
  const buildWall = () => {
    chipBadges.clear()
    const chips = PALETTE.filter((c) => c.series === series).map((c) => {
      const badge = h('span', { class: 'badge', style: 'display:none' })
      chipBadges.set(c.index, badge)
      return h('button', { class: 'chip', title: `${c.code}${c.finish === 'opaque' ? '' : ' · ' + c.finish}`, onclick: () => addBeads(c) },
        beadChip(c, 34), h('span', { class: 'code' }, c.code), badge)
    })
    mount(wallBox, ...chips)
  }
  const buildTabs = () => {
    mount(tabsBox, ...SERIES_ORDER.map((s) => {
      const first = PALETTE.find((c) => c.series === s)!
      return h('button', { 'aria-pressed': String(series === s), onclick: () => { series = s; buildTabs(); buildWall(); refresh() }, title: SERIES_INFO[s]?.en },
        h('span', { class: 'sw', style: `--c:${first.hex}` }), s)
    }))
  }

  // ---- numbers only
  const refresh = () => {
    const m = model()
    for (const r of needRows) {
      const got = m.countIn(m.indexOfPalette(r.pal))
      r.have.textContent = String(got)
      r.bar.style.width = `${Math.min(100, (got / Math.max(1, r.need)) * 100)}%`
      r.bar.parentElement!.classList.toggle('ok', got >= r.need)
    }
    for (const [idx, badge] of chipBadges) {
      const got = m.countIn(m.indexOfPalette(idx))
      badge.style.display = got ? '' : 'none'
      badge.textContent = String(got)
    }
    usedHint.textContent = `豆盘 ${m.usedWells} / ${m.wellCount} 格`
  }

  mount(el,
    h('div', { class: 'eyebrow' }, '02 / 取豆 · Bead wall'),
    h('h1', { class: 'h-display' }, '去豆墙，按色号取豆'),
    h('p', { class: 'lead' }, '点一个颜色，它就整整齐齐地立进豆盘的一格里。不够再点一次，用不上的颜色之后可以倒掉。'),
    needBox,
    h('div', { class: 'sec' },
      h('div', { class: 'sec-h' }, h('h3', null, '豆墙'), usedHint),
      tabsBox, wallBox),
    h('div', { class: 'tipnote' }, h('b', null, 'Tip'), '相近的颜色（白/奶白、黑/深灰）在盒子里几乎看不出差别，铺到板上才暴露——认准色号。'),
  )

  const go = h('button', { class: 'btn primary', onclick: () => {
    if (!model().hasBeads) { shell.toast('豆盘还是空的——先点几个颜色取豆'); return }
    session.go('build')
  } }, '开始拼', icon('arrow'))
  const back = h('button', { class: 'btn ghost', onclick: () => session.go('board') }, icon('back'))
  mount(foot, back, go)

  session.bus.on('tray', refresh)
  session.bus.on('setup', () => { buildNeeds(); refresh() })
  return {
    el, foot,
    show: () => { buildNeeds(); buildTabs(); buildWall(); refresh() },
  }
}
