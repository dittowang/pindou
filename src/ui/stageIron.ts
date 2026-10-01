import { h, icon, patch } from './dom'
import type { PanelCtx, StagePanel } from './shell'
import { COVERS, type CoverId } from '../render/paper'
import { DIAL, type DialId } from '../render/iron'
import type { IronStep } from '../interact/iron'

const STEPS: { id: IronStep[]; zh: string; sub: string }[] = [
  { id: ['prep'], zh: '备烫', sub: '垫大理石，挑盖布' },
  { id: ['lint'], zh: '粘毛', sub: '粘掉浮毛，免得烫进豆子' },
  { id: ['iron'], zh: '烫正面', sub: '按压、抬起、换位置' },
  { id: ['cool', 'peeling', 'onboard', 'flipping'], zh: '揭纸·脱板', sub: '等凉再撕，别心急' },
  { id: ['flipped', 'back'], zh: '翻面·烫反面', sub: '背面更快，别烫过头' },
  { id: ['press', 'pressing', 'done'], zh: '压平', sub: '趁热压住，压到凉透' },
]

const STEPS_FLAT: { id: IronStep[]; zh: string; sub: string }[] = [
  { id: ['prep'], zh: '备烫', sub: '选无孔烫，垫大理石' },
  { id: ['tape'], zh: '贴美纹纸', sub: '压牢每一颗，边缘多压' },
  { id: ['flipping', 'flipped'], zh: '倒扣脱板', sub: '板子拿走，豆子留在纸上' },
  { id: ['lint', 'back'], zh: '盖纸·烫', sub: '烫到孔洞全部合上' },
  { id: ['cool', 'peeling'], zh: '揭纸', sub: '等凉透再撕，胶才不留' },
  { id: ['press', 'pressing', 'done'], zh: '压平', sub: '单面烫最爱翘，压到凉透' },
]

export function buildIronPanel({ session, shell }: PanelCtx): StagePanel {
  const el = h('div')
  const foot = h('div', { class: 'panel-foot' })
  const studio = session.studio
  const iron = studio.iron
  let timer = 0

  const steps = () => (iron.mode === 'flat' ? STEPS_FLAT : STEPS)
  const stepIndex = () => {
    if (iron.mode === 'flat') return STEPS_FLAT.findIndex((s) => s.id.includes(iron.step))
    // the second lint pass (before the back) belongs to "翻面·烫反面"
    if (iron.step === 'lint' && iron.pass === 'back') return 4
    if ((iron.step === 'cool' || iron.step === 'peeling') && iron.pass === 'back') return 5
    return STEPS.findIndex((s) => s.id.includes(iron.step))
  }

  const timeline = () => h('ol', { class: 'steps' }, ...steps().map((s, i) => {
    const cur = stepIndex()
    const cls = i < cur ? 'done' : i === cur ? 'on' : ''
    return h('li', { class: cls }, h('span', { class: 'dot' }), h('div', null, h('b', null, s.zh), h('small', null, s.sub)))
  }))

  const coverCards = () => (Object.keys(COVERS) as CoverId[]).map((id) =>
    h('button', { class: 'card', 'aria-pressed': String(iron.cover === id), onclick: () => { iron.cover = id; render() } },
      h('span', { class: 'ico', html: coverIcon(id) }), h('span', { class: 't' }, COVERS[id].zh), h('span', { class: 'd' }, COVERS[id].note)))

  const modeCards = () => ([
    ['holes', '有孔烫', '直接在板上烫：孔洞缩小、保留颗粒感，板子不用拆'],
    ['flat', '无孔烫', '先转印到美纹纸，再烫背面：整面平滑、没有孔，要多一道工序'],
  ] as const).map(([id, t, d]) => h('button', { class: 'card', 'aria-pressed': String(iron.mode === id), onclick: () => iron.setMode(id) },
    h('span', { class: 'ico', html: modeIcon(id) }), h('span', { class: 't' }, t), h('span', { class: 'd' }, d)))

  const ironControls = () => {
    const flat = iron.mode === 'flat'
    const t = Math.round(iron.temperature)
    const ready = iron.thermo.isReady
    return h('div', null,
      h('div', { class: 'sec' },
        h('div', { class: 'sec-h' }, h('h3', null, '温度'), h('span', { class: 'hint num' }, h('b', { style: `color:${ready ? 'var(--ok)' : 'var(--accent-2)'}` }, `${t}°C`), ready ? ' · 到温' : ' · 预热中')),
        h('div', { class: 'seg', role: 'group' }, ...DIAL.map((d) => h('button', { 'aria-pressed': String(iron.dial === d.id), onclick: () => iron.setDial(d.id as DialId) }, `${d.zh} ${'●'.repeat(d.dots)}`))),
        h('div', { class: 'sec-h', style: 'margin-top:16px' }, h('h3', null, '力度'), h('span', { class: 'hint' }, iron.pressure < 0.33 ? '很轻' : iron.pressure < 0.55 ? '熨斗自重' : iron.pressure < 0.8 ? '偏重' : '用力压')),
        h('input', { type: 'range', min: 15, max: 100, value: Math.round(iron.pressure * 100), class: 'range', 'aria-label': '力度', oninput: (e: Event) => { iron.setPressure(Number((e.target as HTMLInputElement).value) / 100) } }),
      ),
      h('div', { class: 'sec' },
        h('div', { class: 'sec-h' }, h('h3', null, '看一看')),
        toggle('掀起一角', '看看纸下面的豆子粘上了没有', iron.peeking, (v) => iron.setPeek(v)),
        toggle('热感模式', '用热成像看哪里烫到了、哪里还没到', iron.thermal, (v) => iron.setThermal(v)),
      ),
      h('div', { class: 'tipnote' }, h('b', null, '怎么看'), flat ? '无孔烫：每个点停 3–6 秒再换位置，要烫到孔洞全部合上、整面发亮平滑；但烫到发黄、边缘外溢就过头了。中温起步，慢慢加。' : '隔着纸看：豆子颜色变深、圆圈变成方块，就是粘上了。每个点停 3–6 秒再换位置，别一直拖；不用使劲，熨斗自重就够。'),
    )
  }

  const heatState = () => {
    const t = iron.beadTemp
    return t > 70 ? ['烫手', 'var(--accent-2)'] : t > 45 ? ['温热', 'var(--warn)'] : ['凉了', 'var(--ok)']
  }

  const render = () => {
    const step = iron.step
    let body: HTMLElement | null = null
    let primary: HTMLButtonElement | null = null
    const btn = (label: string, fn: () => void, arrow = true, disabled = false) =>
      h('button', { class: 'btn primary', disabled, onclick: fn }, label, arrow ? icon('arrow') : null) as HTMLButtonElement

    const flat = iron.mode === 'flat'
    if (step === 'prep') {
      body = h('div', null,
        h('div', { class: 'sec' }, h('div', { class: 'sec-h' }, h('h3', null, '烫法')), h('div', { class: 'opt' }, ...modeCards()),
          flat ? h('p', { class: 'hint', style: 'margin-top:10px' }, '先用美纹纸把整幅豆粘起来，翻过来拿掉豆板，再隔纸烫豆子原来贴板的那一面——钉子不在了，不会烫到板子，也不会闷豆。') : null),
        h('div', { class: 'sec' },
          h('div', { class: 'sec-h' }, h('h3', null, flat ? '烫的时候盖什么' : '盖布')),
          h('div', { class: 'opt' }, ...coverCards()),
          h('p', { class: 'hint', style: 'margin-top:10px' }, '豆板已经放到大理石上——石头会把多余的热量带走，防止闷豆。')))
      primary = flat ? btn('贴美纹纸', () => iron.layTape()) : btn('盖上去', () => iron.layPaper(iron.cover))
    } else if (step === 'tape') {
      const pct = Math.round(iron.stickMean * 100), loose = iron.stickLoose
      body = h('div', { class: 'sec' },
        h('div', { class: 'sec-h' }, h('h3', null, '压牢'), h('span', { class: 'hint num' }, `${pct}%`)),
        h('div', { class: 'bar' + (pct >= 92 ? ' ok' : ''), style: 'height:6px' }, h('i', { style: `width:${pct}%` })),
        h('p', { class: 'hint', style: 'margin-top:10px' }, loose ? `还有 ${loose} 颗豆几乎没压到——边缘和单颗的豆最容易在翻面时掉下去。` : '每一颗都压到了。再从中间往边缘滚一遍会更稳。'),
        h('p', { class: 'hint', style: 'margin-top:8px' }, '按住鼠标，用滚筒在纸上来回压。纸一旦贴上就别再掀——「3-2-1，快准狠」。压得越牢，翻面时掉的豆越少。'))
      primary = btn('倒扣脱板', () => iron.transferBoard())
    } else if (step === 'lint') {
      const left = iron.lintLeft, tot = iron.lintTotal
      body = h('div', { class: 'sec' },
        h('div', { class: 'sec-h' }, h('h3', null, '粘毛器'), h('span', { class: 'hint num' }, left ? `还剩 ${left} 处` : '干净了')),
        h('div', { class: 'bar' + (left === 0 ? ' ok' : ''), style: 'height:6px' }, h('i', { style: `width:${tot ? (1 - left / tot) * 100 : 100}%` })),
        h('p', { class: 'hint', style: 'margin-top:10px' }, '按住鼠标，在纸上来回滚。毛发和灰尘留在纸上，熨斗一压就会烫进豆子里。'))
      primary = btn(left ? '就这样吧' : '开始烫', () => iron.startIroning())
    } else if (step === 'iron' || step === 'back') {
      body = ironControls()
      primary = btn(step === 'iron' ? '烫好了' : '反面烫好了', () => iron.finishIroning())
    } else if (step === 'cool') {
      const [label, color] = heatState()
      const hot = iron.beadTemp > 62
      body = h('div', { class: 'sec' },
        h('div', { class: 'sec-h' }, h('h3', null, '降温'), h('span', { class: 'hint' }, h('b', { style: `color:${color}` }, label), ` · ${Math.round(iron.beadTemp)}°C`)),
        h('div', { class: 'bar', style: 'height:6px' }, h('i', { style: `width:${Math.max(0, Math.min(100, (1 - (iron.beadTemp - 25) / 120) * 100))}%;background:${color}` })),
        h('p', { class: 'hint', style: 'margin-top:10px' }, hot ? (flat ? '热的时候美纹纸的胶是软的，现在撕会把胶留在豆子上。再等一会儿，吹吹风、用湿巾擦擦纸面。' : '热的豆子是软的，现在撕会把它拉变形、粘在纸上。再等一会儿，或者吹吹风、用湿巾擦擦纸面。') : (flat ? '不烫手了。盖纸和美纹纸一起，从一个角水平地慢慢揭。' : '不烫手了，可以慢慢揭纸。从一个角水平地揭，别垂直往上拽。')),
        h('div', { style: 'display:flex;gap:8px;margin-top:12px' },
          h('button', { class: 'btn small line', onclick: () => { studio.iron.sim?.coolAll(18); studio.audio.impact('tableKnock', 0.2, 2); render() } }, '扇一扇'),
          h('button', { class: 'btn small line', onclick: () => iron.setPeek(!iron.peeking) }, iron.peeking ? '放回去' : '掀角看看'),
        ))
      primary = btn(iron.pass === 'front' ? '揭纸' : '揭纸', () => iron.peelPaper())
    } else if (step === 'peeling') {
      body = h('div', { class: 'sec' }, h('p', { class: 'lead' }, '沙沙沙……慢慢来。'))
      primary = btn('揭纸中…', () => {}, false, true)
    } else if (step === 'onboard') {
      const oc = iron.outcome
      body = h('div', { class: 'sec' },
        h('div', { class: 'sec-h' }, h('h3', null, '脱板')),
        h('p', { class: 'hint' }, '纸揭掉了。把整片从钉子上取下来——熔在一起的会一起走，没粘牢的和孤零零的豆子会掉下去。'),
        oc.lostWithPaper ? h('p', { class: 'hint', style: 'margin-top:8px;color:var(--accent-2)' }, `刚才有 ${oc.lostWithPaper} 颗豆被纸带走了。`) : null)
      primary = btn('脱板，翻过来', () => iron.liftPiece())
    } else if (step === 'flipping') {
      body = h('div', { class: 'sec' }, h('p', { class: 'lead' }, '翻面……'))
      primary = btn('翻面中…', () => {}, false, true)
    } else if (step === 'flipped' && flat) {
      const oc = iron.outcome
      body = h('div', { class: 'sec' },
        h('div', { class: 'sec-h' }, h('h3', null, '脱板了')),
        h('p', { class: 'hint' }, '板子拿走了，豆子都留在美纹纸上，孔朝上，没有钉子挡着。盖上纸烫这一面——要烫到孔洞全部合上，但别烫黄。'),
        oc.transferLost ? h('p', { class: 'hint', style: 'margin-top:8px;color:var(--accent-2)' }, `刚才有 ${oc.transferLost} 颗豆没粘住，留在了板子上${oc.isolated ? `（其中 ${oc.isolated} 颗是孤零零的）` : ''}。`) : h('p', { class: 'hint', style: 'margin-top:8px;color:var(--ok)' }, '一颗都没掉，纸贴得真牢。'))
      primary = btn('盖纸烫（无孔）', () => iron.layBackPaper())
    } else if (step === 'flipped') {
      const oc = iron.outcome
      body = h('div', { class: 'sec' },
        h('div', { class: 'sec-h' }, h('h3', null, '背面')),
        h('p', { class: 'hint' }, '这一面还留着板钉压出的小坑，是散的。盖上纸再烫一遍——比正面快，别烫过头。'),
        oc.leftOnBoard ? h('p', { class: 'hint', style: 'margin-top:8px;color:var(--accent-2)' }, `脱板时有 ${oc.leftOnBoard} 颗豆没粘牢，掉下去了${oc.isolated ? `（其中 ${oc.isolated} 颗是孤零零的）` : ''}。`) : h('p', { class: 'hint', style: 'margin-top:8px;color:var(--ok)' }, '一颗都没掉，漂亮。'),
        oc.fragments > 1 ? h('p', { class: 'hint', style: 'margin-top:4px;color:var(--accent-2)' }, `作品断成了 ${oc.fragments} 块——连接处没烫牢。`) : null)
      primary = btn('盖纸烫背面', () => iron.layBackPaper())
    } else if (step === 'press') {
      body = h('div', { class: 'sec' },
        h('div', { class: 'sec-h' }, h('h3', null, '压平')),
        h('p', { class: 'hint' }, '刚烫完是平的，几十秒后会开始卷。趁还软，压上重物，压到凉透。'),
        h('div', { class: 'opt', style: 'margin-top:12px' },
          pressCard('厚书', '最常用：压板要比作品大', () => iron.pressWith('book')),
          pressCard('瓷砖', '更重、散热更快', () => iron.pressWith('tile')),
          pressCard('不压了', '放着晾，看会卷成什么样', () => iron.pressWith('none'))))
      primary = btn('选一个重物', () => {}, false, true)
    } else if (step === 'pressing') {
      const pct = Math.round(iron.pressProgress * 100)
      body = h('div', { class: 'sec' },
        h('div', { class: 'sec-h' }, h('h3', null, '压着'), h('span', { class: 'hint num' }, `${pct}%`)),
        h('div', { class: 'bar' + (pct >= 100 ? ' ok' : ''), style: 'height:6px' }, h('i', { style: `width:${pct}%` })),
        h('p', { class: 'hint', style: 'margin-top:10px' }, pct >= 100 ? '凉透了。' : '耐心等一等——压的时间往往比想象的长。'))
      primary = btn(pct >= 100 ? '拿起来' : '压着…', () => iron.finishPressing(), pct >= 100, pct < 100)
    } else if (step === 'done') {
      body = h('div', { class: 'sec' }, h('p', { class: 'lead' }, '出炉了。轻轻拿起来，看看你的作品。'))
      primary = btn('去看看成品', () => session.go('finish'))
    }
    patch(el,
      h('div', { class: 'eyebrow' }, '04 / 熨烫 · Iron'),
      h('h1', { class: 'h-display' }, '烫一烫，看一看'),
      h('p', { class: 'lead' }, iron.mode === 'flat' ? '无孔烫：把整幅豆先转印到美纹纸上，再烫背面——孔会全部合上。这一步不可逆，慢一点。' : '这一步不可逆。慢一点——烫到孔洞缩到一半左右，就是最好看的样子。'),
      h('div', { class: 'sec' }, timeline()),
      body,
    )
    const back = h('button', { class: 'btn ghost', disabled: !(step === 'prep' || ((step === 'lint' || step === 'tape') && iron.pass === 'front')), onclick: () => session.go('build'), title: '回去再检查一遍' }, icon('back'))
    patch(foot, back, primary)
  }

  // HUD: temperature + thermostat light
  const dot = h('i', { class: 'led' })
  const tempEl = h('b', { class: 'num' }, '23°C')
  const hint = h('span', null, '按住鼠标按压 · Q/E 转向')
  const hud = h('div', { class: 'bl' }, h('div', { class: 'pill' }, dot, tempEl, h('span', { class: 'sep' }), hint))

  iron.onChange = () => { if (session.stage === 'iron') render() }
  iron.onToast = (m) => shell.toast(m)
  return {
    el, foot,
    show: () => {
      render()
      shell.hud.append(hud)
      timer = window.setInterval(() => {
        tempEl.textContent = `${Math.round(iron.isIroningStep || iron.step === 'prep' || iron.step === 'lint' ? iron.temperature : iron.beadTemp)}°C`
        dot.className = 'led' + (iron.thermo.heater ? ' on' : iron.thermo.isReady ? ' ready' : '')
        hint.textContent = iron.step === 'lint' ? '按住鼠标，滚过纸面' : iron.step === 'tape' ? '按住鼠标，滚过美纹纸压牢' : iron.isIroningStep ? '按住鼠标按压 · Q/E 转向' : ''
      }, 150)
    },
    hide: () => { clearInterval(timer); hud.remove() },
  }
}

function pressCard(t: string, d: string, fn: () => void) {
  return h('button', { class: 'card', onclick: fn }, h('span', { class: 'ico', html: '<svg viewBox="0 0 44 44"><rect x="8" y="14" width="28" height="18" rx="3" fill="#dfd6c4" stroke="#bfae92" stroke-width="1.5"/><path d="M8 20h28" stroke="#bfae92"/></svg>' }), h('span', { class: 't' }, t), h('span', { class: 'd' }, d))
}

function toggle(label: string, sub: string, on: boolean, set: (v: boolean) => void) {
  const b = h('button', {
    class: 'sw-btn', 'aria-pressed': String(on), 'aria-label': label,
    onclick: (e: Event) => { const el = e.currentTarget as HTMLElement; const v = el.getAttribute('aria-pressed') !== 'true'; el.setAttribute('aria-pressed', String(v)); set(v) },
  })
  return h('div', { class: 'toggle' }, h('div', { class: 'l' }, label, h('small', null, sub)), b)
}

function coverIcon(id: CoverId): string {
  if (id === 'parchment') return '<svg viewBox="0 0 44 44"><rect x="8" y="9" width="28" height="26" rx="3" fill="#f4ecdd" stroke="#bfae92" stroke-width="1.5"/><path d="M12 15c5-3 7 3 12 0s6 2 8 0" stroke="#d6c7aa" fill="none" stroke-width="1.5"/></svg>'
  if (id === 'cloth') return '<svg viewBox="0 0 44 44"><rect x="8" y="9" width="28" height="26" rx="3" fill="#efe1c9" stroke="#bfae92" stroke-width="1.5"/><path d="M8 17h28M8 25h28M16 9v26M26 9v26" stroke="#d3c19f" stroke-width="1.2"/></svg>'
  return '<svg viewBox="0 0 44 44"><rect x="8" y="9" width="28" height="26" rx="3" fill="#e6d7bd" stroke="#bfae92" stroke-width="1.5"/>' + Array.from({ length: 12 }, (_, i) => `<circle cx="${14 + (i % 4) * 6.5}" cy="${16 + Math.floor(i / 4) * 7}" r="1.8" fill="#c9b793"/>`).join('') + '</svg>'
}

function modeIcon(id: 'holes' | 'flat'): string {
  if (id === 'holes') return '<svg viewBox="0 0 44 44"><rect x="8" y="12" width="28" height="20" rx="3" fill="#e9a89d" stroke="#bf5a49" stroke-width="1.5"/>' + Array.from({ length: 8 }, (_, i) => `<circle cx="${14 + (i % 4) * 5.5}" cy="${19 + Math.floor(i / 4) * 7}" r="1.7" fill="#fff"/>`).join('') + '</svg>'
  return '<svg viewBox="0 0 44 44"><rect x="8" y="12" width="28" height="20" rx="3" fill="#e9a89d" stroke="#bf5a49" stroke-width="1.5"/><path d="M12 17h20" stroke="#fff" stroke-opacity=".55" stroke-width="2" stroke-linecap="round"/><rect x="6" y="28" width="32" height="6" rx="1.5" fill="#e8d49a" stroke="#c9b062" stroke-width="1.2"/></svg>'
}
