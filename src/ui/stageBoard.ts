import { h, icon, mount } from './dom'
import type { PanelCtx, StagePanel } from './shell'
import { builtinPatterns, type Pattern } from '../config/patterns'
import { PALETTE } from '../config/palette'
import type { ScaleId } from '../config/physical'
import type { BoardShape } from '../render/board'
import { makeDims } from '../config/physical'
import { imageToPattern, DEFAULT_IMAGE_OPTS, type ImageOpts } from '../config/imagePattern'

const SHAPE_SVG: Record<BoardShape, string> = {
  square: '<rect x="6" y="6" width="28" height="28" rx="4" fill="none" stroke="currentColor" stroke-width="1.6"/>' + dots(5, 'square'),
  circle: '<circle cx="20" cy="20" r="14.5" fill="none" stroke="currentColor" stroke-width="1.6"/>' + dots(5, 'circle'),
  heart: '<path d="M20 33.5C8 25.5 5 18 5 13.2 5 8.6 8.6 6 12.4 6c3 0 5.6 1.6 7.6 4.6C22 7.6 24.6 6 27.6 6 31.4 6 35 8.6 35 13.2c0 4.8-3 12.3-15 20.3Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>' + dots(5, 'heart'),
}
function dots(n: number, shape: BoardShape): string {
  let s = ''
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = 11 + i * 4.5, y = 11 + j * 4.5
    const dx = (i - (n - 1) / 2), dy = (j - (n - 1) / 2)
    if (shape === 'circle' && Math.hypot(dx, dy) > 2.4) continue
    if (shape === 'heart' && ((j === 0 && (i === 2)) || (j >= 3 && Math.abs(dx) > 3 - (j - 2) * 1.1) || (j === 4 && Math.abs(dx) > 0.6))) continue
    s += `<circle cx="${x}" cy="${y}" r="1.1" fill="currentColor" opacity=".55"/>`
  }
  return s
}

export function drawPatternThumb(c: HTMLCanvasElement, p: Pattern) {
  const S = 120
  c.width = S; c.height = S
  const g = c.getContext('2d')!
  g.clearRect(0, 0, S, S)
  const cell = Math.min((S - 14) / p.w, (S - 14) / p.h)
  const ox = (S - cell * p.w) / 2, oy = (S - cell * p.h) / 2
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    const i = p.cells[y * p.w + x]
    if (i < 0) continue
    g.fillStyle = PALETTE[i].hex
    g.beginPath()
    g.arc(ox + x * cell + cell / 2, oy + y * cell + cell / 2, cell * 0.46, 0, Math.PI * 2)
    g.fill()
  }
}

export function buildBoardPanel({ session, shell }: PanelCtx): StagePanel {
  const el = h('div')
  const foot = h('div', { class: 'panel-foot' })
  let shape: BoardShape = 'square'
  let size: 'small' | 'standard' = 'small'
  let customSrc: HTMLImageElement | null = null
  let customOpts: ImageOpts = { ...DEFAULT_IMAGE_OPTS }
  const fileInput = h('input', { type: 'file', accept: 'image/*', style: 'display:none' }) as HTMLInputElement
  fileInput.onchange = () => {
    const f = fileInput.files?.[0]
    if (!f) return
    const img = new Image()
    img.onload = () => { customSrc = img; regenerate(true) }
    img.onerror = () => shellToast('这张图片打不开，换一张试试')
    img.src = URL.createObjectURL(f)
  }
  const shellToast = (m: string) => shell.toast(m)
  const regenerate = (first = false) => {
    if (!customSrc) return
    const p = imageToPattern(customSrc, customOpts)
    const s = session.setup
    const dims = makeDims(s.scale)
    let n = size === 'small' ? dims.boards.small : dims.boards.standard
    n = Math.max(n, session.boardFor(p))
    size = n >= dims.boards.standard ? 'standard' : 'small'
    session.applySetup({ pattern: p, n })
    if (first) shellToast(`识别出 ${p.colors.length} 种颜色、${p.total} 颗豆`)
    render()
  }

  const render = () => {
    const s = session.setup
    const dims = makeDims(s.scale)
    const sizes = { small: dims.boards.small, standard: dims.boards.standard }
    const cm = (n: number) => (n * dims.pitch + 0.9).toFixed(1)

    const beadCards = (['mini', 'midi'] as ScaleId[]).map((id) => {
      const d = makeDims(id)
      return h('button', {
        class: 'card', 'aria-pressed': String(s.scale === id),
        onclick: () => { if (s.scale !== id) { session.applySetup({ scale: id, n: session.boardFor(s.pattern, id) === 0 ? 26 : session.boardFor(s.pattern, id), pattern: s.pattern }); size = 'small'; render() } },
      },
        h('span', { class: 'ico', html: beadIcon(id) }),
        h('span', { class: 't' }, id === 'mini' ? '迷你豆 2.6mm' : '标准豆 5mm'),
        h('span', { class: 'd' }, id === 'mini' ? `店里最常见 · ${d.boards.standard}×${d.boards.standard} 大板，精细耐看` : `颗粒大、好夹取 · ${d.boards.standard}×${d.boards.standard} 板，新手友好`),
      )
    })

    const shapeTiles = (['square', 'circle', 'heart'] as BoardShape[]).map((sh) =>
      h('button', {
        class: 'tile', 'aria-pressed': String(shape === sh),
        onclick: () => { shape = sh; pickBoard() },
      }, h('span', { html: `<svg viewBox="0 0 40 40">${SHAPE_SVG[sh]}</svg>`, style: 'display:contents' }), sh === 'square' ? '方板' : sh === 'circle' ? '圆板' : '心形板'),
    )

    const need = s.pattern ? Math.max(s.pattern.w, s.pattern.h) + 2 : 0
    const sizeSeg = h('div', { class: 'seg', role: 'group', 'aria-label': '板的大小' },
      h('button', { 'aria-pressed': String(size === 'small'), onclick: () => { size = 'small'; pickBoard() } }, `小板 ${sizes.small}×${sizes.small}`),
      h('button', { 'aria-pressed': String(size === 'standard'), onclick: () => { size = 'standard'; pickBoard() } }, `大板 ${sizes.standard}×${sizes.standard}`),
    )

    const pats = builtinPatterns()
    const patCards = [
      h('button', { class: 'pat free', 'aria-pressed': String(!s.pattern), onclick: () => choosePattern(null) },
        h('div', { class: 'ph' }, '自由创作'),
        h('div', null, h('div', { class: 'nm' }, '空白图纸'), h('div', { class: 'meta' }, '想拼什么就拼什么')),
      ),
      ...pats.map((p) => {
        const cv = h('canvas') as HTMLCanvasElement
        drawPatternThumb(cv, p)
        return h('button', { class: 'pat', 'aria-pressed': String(s.pattern?.id === p.id), onclick: () => choosePattern(p) },
          cv,
          h('div', null,
            h('div', { class: 'nm' }, p.name),
            h('div', { class: 'meta num' }, `${p.w}×${p.h} · ${p.total}颗`, h('span', { class: 'dots' }, ...[1, 2, 3].map((k) => h('i', { class: k <= p.level ? 'on' : '' })))),
          ),
        )
      }),
    ]

    const customCard = (() => {
      if (!customSrc || session.setup.pattern?.id !== 'custom' && !s.pattern) return null
      return null
    })()
    void customCard
    const isCustom = s.pattern?.id === 'custom'
    if (customSrc) {
      const cp = isCustom ? s.pattern! : imageToPattern(customSrc, customOpts)
      const cv = h('canvas') as HTMLCanvasElement
      drawPatternThumb(cv, cp)
      patCards.splice(1, 0, h('button', { class: 'pat', 'aria-pressed': String(isCustom), onclick: () => regenerate() },
        cv, h('div', null, h('div', { class: 'nm' }, '我的图片'), h('div', { class: 'meta num' }, `${cp.w}×${cp.h} · ${cp.total}颗`))))
    }
    patCards.push(h('button', { class: 'pat free', onclick: () => fileInput.click() },
      h('div', { class: 'ph' }, '＋ 导入图片'),
      h('div', null, h('div', { class: 'nm' }, '用你自己的图'), h('div', { class: 'meta' }, '只在浏览器里处理'))))

    const editor = isCustom && customSrc ? h('div', { class: 'sec' },
      h('div', { class: 'sec-h' }, h('h3', null, '调整图片'), h('span', { class: 'hint num' }, `约 ${s.pattern!.total} 颗`)),
      slider('宽度', customOpts.size, 10, Math.min(52, makeDims(s.scale).boards.standard), (v) => { customOpts.size = v; regenerate() }, (v) => `${v} 颗`),
      slider('颜色数', customOpts.colors, 3, 14, (v) => { customOpts.colors = v; regenerate() }, (v) => `${v} 种`),
      toggleRow('去掉白色背景', customOpts.removeBackground, (v) => { customOpts.removeBackground = v; regenerate() }),
      toggleRow('抖动（照片更自然）', customOpts.dither, (v) => { customOpts.dither = v; regenerate() }),
      toggleRow('增强对比', customOpts.punch, (v) => { customOpts.punch = v; regenerate() }),
    ) : null

    mount(el,
      h('div', { class: 'eyebrow' }, '01 / 选板 · Board'),
      h('h1', { class: 'h-display' }, '今天，想拼点什么？'),
      h('p', { class: 'lead' }, '和线下店一样：先挑豆子和豆板，再拿一张图纸——也可以空着，随心拼。'),
      h('div', { class: 'sec' }, h('div', { class: 'sec-h' }, h('h3', null, '豆子')), h('div', { class: 'opt' }, ...beadCards)),
      h('div', { class: 'sec' },
        h('div', { class: 'sec-h' }, h('h3', null, '豆板'), h('span', { class: 'hint num' }, `${s.n}×${s.n} · 约 ${cm(s.n)} cm`)),
        h('div', { class: 'tiles' }, ...shapeTiles),
        h('div', { style: 'margin-top:10px' }, sizeSeg),
        need && s.n < need ? h('p', { class: 'hint', style: 'margin-top:8px;color:var(--accent-2)' }, `这张图至少需要 ${need}×${need} 的板`) : null,
      ),
      h('div', { class: 'sec' }, h('div', { class: 'sec-h' }, h('h3', null, '图纸'), h('span', { class: 'hint' }, '垫在透明板下面')), h('div', { class: 'pat-grid' }, ...patCards)),
      editor,
      fileInput,
      h('div', { class: 'tipnote' }, h('b', null, 'Tip'), '新手挑轮廓清晰、色块分明的图；渐变多的图会让人摆到怀疑人生。'),
    )
  }

  const pickBoard = () => {
    const s = session.setup
    const dims = makeDims(s.scale)
    let n = size === 'small' ? dims.boards.small : dims.boards.standard
    if (s.pattern) n = Math.max(n, session.boardFor(s.pattern))
    session.applySetup({ shape, n })
    render()
  }
  const choosePattern = (p: Pattern | null) => {
    const s = session.setup
    const dims = makeDims(s.scale)
    let n = size === 'small' ? dims.boards.small : dims.boards.standard
    if (p) n = Math.max(n, session.boardFor(p))
    size = n >= dims.boards.standard ? 'standard' : 'small'
    session.applySetup({ pattern: p, n })
    render()
  }

  const next = h('button', { class: 'btn primary', onclick: () => session.go('beads') }, '去取豆', icon('arrow'))
  mount(foot, next)
  render()
  return { el, foot, show: render }
}

function beadIcon(id: ScaleId): string {
  const r = id === 'mini' ? 7 : 12
  return `<svg viewBox="0 0 44 44" width="44" height="44"><circle cx="22" cy="22" r="${r}" fill="none" stroke="var(--accent)" stroke-width="${id === 'mini' ? 5 : 7}"/>${id === 'mini' ? '<circle cx="8" cy="9" r="3.5" fill="none" stroke="var(--ink-3)" stroke-width="2.4"/><circle cx="36" cy="33" r="3.5" fill="none" stroke="var(--ink-3)" stroke-width="2.4"/>' : ''}</svg>`
}


function slider(label: string, value: number, min: number, max: number, on: (v: number) => void, fmt: (v: number) => string) {
  const out = h('span', { class: 'hint num' }, fmt(value))
  const input = h('input', { type: 'range', min, max, value, class: 'range', 'aria-label': label }) as HTMLInputElement
  input.oninput = () => { out.textContent = fmt(Number(input.value)) }
  input.onchange = () => on(Number(input.value))
  return h('div', { style: 'margin-bottom:10px' }, h('div', { class: 'sec-h', style: 'margin-bottom:2px' }, h('h3', { style: 'text-transform:none;letter-spacing:0;font-weight:500' }, label), out), input)
}
function toggleRow(label: string, on: boolean, set: (v: boolean) => void) {
  const b = h('button', { class: 'sw-btn', 'aria-pressed': String(on), 'aria-label': label }) as HTMLButtonElement
  b.onclick = () => { const v = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', String(v)); set(v) }
  return h('div', { class: 'toggle' }, h('div', { class: 'l' }, label), b)
}
