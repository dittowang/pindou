import { h, icon, mount, toast } from './dom'
import type { PanelCtx, StagePanel } from './shell'
import { diagnose, type Diagnosis } from '../sim/report'
import { renderCard } from '../export/card'
import type { Display } from '../interact/finish'

export function buildFinishPanel({ session, shell }: PanelCtx): StagePanel {
  const el = h('div')
  const foot = h('div', { class: 'panel-foot' })
  const studio = session.studio
  const fin = studio.finish
  let diag: Diagnosis | null = null
  let to = '', msg = '', from = ''
  let open = new Set<string>()
  let cardUrl = ''
  let cardCanvas: HTMLCanvasElement | null = null
  let genTimer = 0

  const compute = () => {
    const i = studio.iron
    const m = i.pieceMetrics()
    diag = diagnose(i.outcome, m, studio.build.stats, session.buildSummary, i.pressure)
  }

  const generate = async () => {
    if (!diag) return
    const photo = await studio.photo(1296, 1146, (cam) => fin.photoFrame(cam))
    const pat = session.setup.pattern
    cardCanvas = await renderCard(photo, {
      no: session.pieceNo, date: new Date(), title: pat ? pat.name : '自由创作', to, message: msg, from, diagnosis: diag,
      beads: studio.iron.outcome.kept || studio.world.pegs.count, seconds: (performance.now() - session.startedAt) / 1000,
      setupLabel: `${session.setup.scale === 'mini' ? '2.6mm' : '5mm'}`, tag: diag.tag,
    })
    cardUrl = cardCanvas.toDataURL('image/png')
    const img = el.querySelector('.card-preview') as HTMLImageElement | null
    if (img) img.src = cardUrl
  }
  const scheduleGenerate = () => { clearTimeout(genTimer); genTimer = window.setTimeout(generate, 450) }

  const displayCards = () => ([
    ['table', '摆在桌上', '平放，看正面'] as [Display, string, string],
    ['keychain', '做成钥匙扣', '钻个孔，穿上环和链'] as [Display, string, string],
    ['frame', '装进相框', '木框 + 玻璃'] as [Display, string, string],
  ]).map(([id, t, d]) => h('button', { class: 'card', 'aria-pressed': String(fin.display === id), onclick: () => { fin.setDisplay(id); session.finishShot(id); render(); setTimeout(() => generate().catch(() => {}), 1400) } },
    h('span', { class: 'ico', html: displayIcon(id) }), h('span', { class: 't' }, t), h('span', { class: 'd' }, d)))

  const sevDots = (n: number) => h('span', { class: 'sev' }, ...[1, 2, 3].map((k) => h('i', { class: k <= n ? 'on' : '' })))

  const render = () => {
    if (!diag) compute()
    const dg = diag!
    const findings = dg.findings.map((f) => {
      const isOpen = open.has(f.id)
      return h('div', { class: 'finding' + (isOpen ? ' open' : '') },
        h('button', { class: 'f-head', 'aria-expanded': String(isOpen), onclick: () => { if (isOpen) open.delete(f.id); else open.add(f.id); render() } },
          h('span', { class: 'f-name' }, f.name, f.slang ? h('small', null, `「${f.slang}」`) : null), sevDots(f.sev)),
        isOpen ? h('div', { class: 'f-body' }, h('p', null, h('b', null, '症状 '), f.what), h('p', null, h('b', null, '病因 '), f.why), h('p', null, h('b', null, '处方 '), f.fix)) : null)
    })
    const sp = fin.specials
    const tricks = [
      sp.glow ? lampToggle('关灯', '夜光豆吸足了光，在暗处会亮', fin.lampOn('dark'), (v) => fin.setLamp('dark', v)) : null,
      sp.uv ? lampToggle('紫外灯', '光变豆原本发白，照紫外线才显色', fin.lampOn('uv'), (v) => fin.setLamp('uv', v)) : null,
      sp.warm ? lampToggle('捂一捂', '温变豆过了 31°C 就换颜色', fin.lampOn('warm'), (v) => fin.setLamp('warm', v)) : null,
    ].filter(Boolean)
    mount(el,
      h('div', { class: 'eyebrow' }, '05 / 成品 · Finish'),
      h('h1', { class: 'h-display' }, '出炉了'),
      h('p', { class: 'lead' }, dg.verdict),
      h('div', { class: 'sec' }, h('div', { class: 'sec-h' }, h('h3', null, '怎么摆')), h('div', { class: 'opt' }, ...displayCards()),
        fin.display === 'keychain' ? h('div', { style: 'margin-top:10px;display:flex;gap:8px;align-items:center' },
          h('button', { class: 'btn small line', onclick: () => fin.poke() }, '拨一下'),
          fin.cracked ? h('span', { class: 'hint', style: 'color:var(--accent-2)' }, '钻孔的时候裂了一小块——后处理的经典翻车。') : null) : null),
      tricks.length ? h('div', { class: 'sec' }, h('div', { class: 'sec-h' }, h('h3', null, '特殊豆的小把戏')), ...(tricks as HTMLElement[])) : null,
      h('div', { class: 'sec' },
        h('div', { class: 'sec-h' }, h('h3', null, '赛博义诊'), h('span', { class: 'hint' }, dg.tag)),
        h('div', { class: 'grade' }, h('div', { class: 'seal' }, dg.grade), h('div', null, h('b', null, dg.title), h('small', null, dg.findings.length ? `${dg.findings.length} 项发现` : '没有发现毛病'))),
        dg.praise.length ? h('ul', { class: 'praise' }, ...dg.praise.map((p) => h('li', null, icon('check'), p))) : null,
        ...findings),
      h('div', { class: 'sec' },
        h('div', { class: 'sec-h' }, h('h3', null, '写给谁'), h('span', { class: 'hint' }, '可以空着')),
        field('送给', to, '一个名字', (v) => { to = v; scheduleGenerate() }),
        textarea('祝福的话', msg, '最多三行', (v) => { msg = v; scheduleGenerate() }),
        field('署名', from, '你的名字', (v) => { from = v; scheduleGenerate() }),
        h('img', { class: 'card-preview', alt: '卡片预览', src: cardUrl || undefined, style: cardUrl ? '' : 'display:none' }),
      ),
    )
    const again = h('button', { class: 'btn ghost', onclick: () => location.reload(), title: '再做一个' }, icon('refresh'), '再做一个')
    const dl = h('button', { class: 'btn primary', onclick: async () => {
      await generate()
      if (!cardCanvas) return
      const a = document.createElement('a')
      a.href = cardUrl; a.download = `bead-studio-${String(session.pieceNo).padStart(3, '0')}.png`
      a.click()
      toast('卡片已保存')
    } }, icon('download'), '保存卡片')
    // phones (and Safari on Mac) can hand the card straight to Messages / WeChat / Photos
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
    const share = h('button', { class: 'btn ghost', title: '分享', onclick: async () => {
      await generate()
      if (!cardCanvas) return
      const blob: Blob | null = await new Promise((res) => cardCanvas!.toBlob(res, 'image/png'))
      if (!blob) return
      const file = new File([blob], `bead-studio-${String(session.pieceNo).padStart(3, '0')}.png`, { type: 'image/png' })
      try { await nav.share({ files: [file], title: '我的拼豆作品' }) } catch { /* cancelled */ }
    } }, '分享')
    let canShare = false
    try { canShare = typeof nav.share === 'function' && !!nav.canShare?.({ files: [new File([], 'x.png', { type: 'image/png' })] }) } catch { /* */ }
    mount(foot, again, ...(canShare ? [share] : []), dl)
  }

  return {
    el, foot,
    show: () => {
      diag = null
      compute()
      render()
      // wait a beat for the flip-to-front, then take the first photo
      setTimeout(() => { generate().catch(() => {}) }, 1500)
    },
    hide: () => clearTimeout(genTimer),
  }
}

function field(label: string, value: string, ph: string, on: (v: string) => void) {
  return h('label', { class: 'field' }, h('span', null, label), h('input', { type: 'text', value, placeholder: ph, maxlength: 24, oninput: (e: Event) => on((e.target as HTMLInputElement).value) }))
}
function textarea(label: string, value: string, ph: string, on: (v: string) => void) {
  return h('label', { class: 'field' }, h('span', null, label), h('textarea', { rows: 3, placeholder: ph, maxlength: 60, oninput: (e: Event) => on((e.target as HTMLTextAreaElement).value) }, value))
}

function displayIcon(id: Display): string {
  if (id === 'table') return '<svg viewBox="0 0 44 44"><rect x="9" y="16" width="26" height="14" rx="3" fill="#e9a89d" stroke="#bf5a49" stroke-width="1.5"/><path d="M6 33h32" stroke="#b9a07a" stroke-width="2"/></svg>'
  if (id === 'keychain') return '<svg viewBox="0 0 44 44"><circle cx="22" cy="7" r="3.5" fill="none" stroke="#b9a07a" stroke-width="1.8"/><path d="M22 10.5v7" stroke="#b9a07a" stroke-width="1.8" stroke-dasharray="1.5 2"/><rect x="12" y="18" width="20" height="18" rx="3" fill="#e9a89d" stroke="#bf5a49" stroke-width="1.5"/><circle cx="22" cy="21.5" r="1.8" fill="#fff"/></svg>'
  return '<svg viewBox="0 0 44 44"><rect x="7" y="7" width="30" height="30" rx="2" fill="#f5efe4" stroke="#8b5a34" stroke-width="3"/><rect x="14" y="15" width="16" height="14" rx="2" fill="#e9a89d" stroke="#bf5a49" stroke-width="1.5"/></svg>'
}

function lampToggle(label: string, sub: string, on: boolean, set: (v: boolean) => void) {
  const b = h('button', { class: 'sw-btn', 'aria-pressed': String(on), 'aria-label': label }) as HTMLButtonElement
  b.onclick = () => { const v = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', String(v)); set(v) }
  return h('div', { class: 'toggle' }, h('div', { class: 'l' }, label, h('small', null, sub)), b)
}
