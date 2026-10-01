import { builtinPatterns } from '../config/patterns'
import { PALETTE } from '../config/palette'

/** ?scene=patterns — quick contact sheet of every built-in pattern, to review the pixel art. */
export function showPatternPreview() {
  document.body.style.cssText = 'margin:0;background:#f6f2ea;color:#2a2420;font:13px system-ui;overflow:auto'
  document.getElementById('stage')?.remove()
  document.getElementById('dbg')?.remove()
  const wrap = document.createElement('div')
  wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:22px;padding:22px'
  for (const p of builtinPatterns()) {
    const cell = 16
    const c = document.createElement('canvas')
    c.width = p.w * cell; c.height = p.h * cell
    const g = c.getContext('2d')!
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height)
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
      const i = p.cells[y * p.w + x]
      if (i < 0) continue
      g.fillStyle = PALETTE[i].hex
      g.beginPath(); g.arc(x * cell + cell / 2, y * cell + cell / 2, cell / 2 - 0.5, 0, Math.PI * 2); g.fill()
    }
    const box = document.createElement('div')
    const t = document.createElement('div')
    t.textContent = `${p.name} · ${p.w}×${p.h} · ${p.total} 颗 · ${p.colors.length} 色 · ${p.colors.map((i) => PALETTE[i].code).join(' ')}`
    t.style.cssText = 'margin:6px 0;max-width:' + c.width + 'px'
    box.append(c, t)
    wrap.append(box)
  }
  document.body.append(wrap)
}
