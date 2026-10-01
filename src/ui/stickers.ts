import * as THREE from 'three'
import { h } from './dom'
import type { Studio } from '../app/studio'
import { PALETTE } from '../config/palette'

/** Little paper labels on the tray's compartments: colour code and how many beads are left. Labels only — they never take clicks. */
export class TrayStickers {
  private layer: HTMLElement
  private els: HTMLElement[] = []
  private v = new THREE.Vector3()
  private visible = false
  private seen = -1
  private lastCounts: number[] = []

  constructor(private studio: Studio, parent: HTMLElement) {
    this.layer = h('div', { class: 'stage-overlay' })
    parent.append(this.layer)
  }

  setVisible(v: boolean) { this.visible = v; this.layer.style.display = v ? '' : 'none' }

  rebuild() {
    this.layer.replaceChildren()
    this.els = []
    const n = this.studio.world.tray.count
    for (let i = 0; i < n; i++) {
      const el = h('div', { class: 'sticker' })
      el.style.display = 'none'
      this.layer.append(el)
      this.els.push(el)
    }
    this.lastCounts = []
    this.seen = -1
  }

  update() {
    if (!this.visible) return
    const st = this.studio, w = st.world
    if (this.els.length !== w.tray.count) this.rebuild()
    const model = w.trayModel
    const textsChanged = model.version !== this.seen
    this.seen = model.version
    const cam = w.camera
    const rect = st.canvasRect()
    for (let i = 0; i < this.els.length; i++) {
      const el = this.els[i]
      const well = model.wells[i]
      if (!well) { el.style.display = 'none'; continue }
      const c = w.tray.wellCenter(i, this.v)
      // sit on the near wall of the compartment, just above its rim
      const d = w.dims.tray
      this.v.z += d.well / 2 + d.wall * 0.2
      this.v.y = w.tray.topY + 0.05
      this.v.project(cam)
      if (this.v.z > 1) { el.style.display = 'none'; continue }
      const x = ((this.v.x + 1) / 2) * rect.width + rect.left - rect.left0
      const y = ((1 - this.v.y) / 2) * rect.height - rect.top0 + rect.top
      el.style.display = ''
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`
      if (textsChanged || this.lastCounts[i] === undefined || el.childElementCount === 0) {
        if (well.count !== this.lastCounts[i] || el.childElementCount === 0) {
          this.lastCounts[i] = well.count
          const col = PALETTE[well.pal]
          el.replaceChildren(h('span', { class: 'c', style: `--c:${col.hex}` }, h('i'), col.code), h('span', { class: 'n' }, `${well.count}`))
        }
      }
      void c
    }
  }
}
