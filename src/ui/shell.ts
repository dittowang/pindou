import { h, icon, toast, mount } from './dom'
import { STAGES, type Session, type StageId } from '../app/session'
import { buildBoardPanel } from './stageBoard'
import { buildBeadsPanel } from './stageBeads'
import { buildBuildPanel } from './stageBuild'
import { buildIronPanel } from './stageIron'
import { buildFinishPanel } from './stageFinish'
import { TrayStickers } from './stickers'

export interface StagePanel {
  el: HTMLElement
  foot: HTMLElement
  /** called every time the panel is shown */
  show?(): void
  hide?(): void
}

const LOGO = `<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="16" cy="16" r="9.4" fill="var(--accent)"/><circle cx="16" cy="16" r="3.6" fill="var(--paper)"/><path d="M9.5 11.5a8 8 0 0 1 5.5-3" stroke="#fff" stroke-opacity=".7" stroke-width="1.4" stroke-linecap="round" fill="none"/></svg>`

/** Builds the page chrome (top bar with the bead-string stepper, left paper panel, HUD) and swaps stage panels. */
export class Shell {
  readonly root: HTMLElement
  private stepper!: HTMLElement
  private panelWrap!: HTMLElement
  private panels = new Map<StageId, StagePanel>()
  private current: StagePanel | null = null
  readonly hud: HTMLElement
  private soundBtn!: HTMLButtonElement
  private stickers!: TrayStickers
  private panelToggle!: HTMLButtonElement
  private collapsed = false

  constructor(private session: Session) {
    const app = document.getElementById('app')!
    this.hud = h('div', { class: 'hud' })
    this.root = app

    const brand = h('div', { class: 'brand' },
      h('span', { class: 'mark', style: 'color:var(--ink)', html: LOGO }),
      h('div', null, h('div', { class: 'name' }, '拼豆工坊'), h('div', { class: 'sub' }, 'Bead Studio')),
    )
    this.stepper = h('nav', { class: 'stepper', 'aria-label': '制作步骤' })
    this.soundBtn = h('button', { class: 'icon-btn', 'aria-label': '声音', 'aria-pressed': 'false', title: '开启声音 · Sound',
      onclick: async () => { const on = await session.studio.audio.toggle(); this.setSound(on) } }) as HTMLButtonElement
    this.setSound(false)
    const actions = h('div', { class: 'top-actions' }, this.soundBtn)
    const topbar = h('header', { class: 'topbar' }, brand, this.stepper, actions)

    this.panelWrap = h('aside', { class: 'panel' })
    app.replaceChildren(topbar, this.panelWrap, this.hud)
    // the left panel can slide away to give the table the whole window
    this.panelToggle = h('button', { class: 'panel-toggle', title: '收起 / 展开左边的面板', 'aria-label': '收起面板', 'aria-pressed': 'false',
      onclick: () => this.setCollapsed(!this.collapsed) }) as HTMLButtonElement
    this.panelToggle.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg><span>收起面板</span>'
    this.hud.append(this.panelToggle)

    const ctx = { session, shell: this }
    this.panels.set('board', buildBoardPanel(ctx))
    this.panels.set('beads', buildBeadsPanel(ctx))
    this.panels.set('build', buildBuildPanel(ctx))
    this.panels.set('iron', buildIronPanel(ctx))
    this.panels.set('finish', buildFinishPanel(ctx))

    session.studio.build.onToast = (m) => toast(m)
    this.stickers = new TrayStickers(session.studio, this.hud)
    session.studio.onFrame = () => this.stickers.update()
    session.bus.on('setup', () => this.stickers.rebuild())
    session.bus.on('stage', () => this.sync())
    this.sync()
    this.layout()
    window.addEventListener('resize', () => this.layout())
  }

  /** tell the camera how much of the canvas the UI covers so the table is centred in what's left */
  layout() {
    const narrow = window.innerWidth <= 860
    const top = (document.querySelector('.topbar') as HTMLElement).offsetHeight
    const panel = this.panelWrap.getBoundingClientRect()
    const left = this.collapsed ? 0 : panel.width
    this.session.studio.rig.setInsets(narrow ? { left: 0, right: 0, top, bottom: this.collapsed ? 0 : panel.height } : { left, right: 0, top, bottom: 0 })
  }

  setCollapsed(c: boolean) {
    this.collapsed = c
    document.body.classList.toggle('panel-collapsed', c)
    this.panelToggle.setAttribute('aria-pressed', String(c))
    this.panelToggle.setAttribute('aria-label', c ? '展开面板' : '收起面板')
    const label = this.panelToggle.querySelector('span')
    if (label) label.textContent = c ? '展开面板' : '收起面板'
    this.layout()
  }

  setSound(on: boolean) {
    this.soundBtn.setAttribute('aria-pressed', String(on))
    mount(this.soundBtn, icon(on ? 'soundOn' : 'soundOff'))
  }

  private sync() {
    const s = this.session
    // stepper
    const order = STAGES.map((x) => x.id)
    const cur = order.indexOf(s.stage)
    const kids: HTMLElement[] = []
    STAGES.forEach((st, i) => {
      const cls = i === cur ? 'on' : i < cur || i <= s.reached ? 'done' : ''
      const el = h('button', {
        class: `step ${cls}`, 'aria-current': i === cur ? 'step' : null, disabled: i > s.reached,
        onclick: () => { if (i <= s.reached && i !== cur) s.go(st.id) },
      }, h('span', { class: 'bead' }), h('span', { class: 'lbl' }, st.zh), h('span', { class: 'n' }, String(i + 1).padStart(2, '0')))
      kids.push(el)
      if (i < STAGES.length - 1) kids.push(h('span', { class: 'step-link' }))
    })
    mount(this.stepper, ...kids)
    // panel
    const next = this.panels.get(s.stage) ?? null
    if (this.current !== next) {
      this.current?.hide?.()
      this.current = next
      if (next) {
        const scroll = h('div', { class: 'panel-scroll' }, next.el)
        mount(this.panelWrap, scroll, next.foot)
        next.show?.()
      } else {
        mount(this.panelWrap, h('div', { class: 'panel-scroll' }, h('p', { class: 'lead' }, '这一步正在搭建…')))
      }
    } else next?.show?.()
    this.stickers.setVisible(s.stage === 'beads' || s.stage === 'build')
    this.layout()
  }

  toast(msg: string) { toast(msg) }
}

export interface PanelCtx { session: Session; shell: Shell }
