import type { Diagnosis } from '../sim/report'

export interface CardData {
  no: number
  date: Date
  title: string
  to: string
  message: string
  from: string
  diagnosis: Diagnosis
  beads: number
  seconds: number
  setupLabel: string
  tag: string
}

const W = 1080, H = 1620

/** the greeting-card / "出品单" image (3:4, 1080×1620) */
export async function renderCard(photo: HTMLCanvasElement, d: CardData): Promise<HTMLCanvasElement> {
  const cv = document.createElement('canvas')
  cv.width = W; cv.height = H
  const g = cv.getContext('2d')!
  try { await (document as unknown as { fonts: FontFaceSet }).fonts.ready } catch { /* */ }
  const serif = '"Fraunces","Noto Serif SC","Songti SC",serif'
  const sans = '"Instrument Sans","Noto Sans SC","PingFang SC",system-ui,sans-serif'

  // paper
  const bg = g.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#f6f1e7'); bg.addColorStop(1, '#efe8da')
  g.fillStyle = bg; g.fillRect(0, 0, W, H)
  const rnd = mulberry(d.no * 7919)
  for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(120,100,70,${rnd() * 0.035})`; g.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 2, 1 + rnd() * 2) }
  g.strokeStyle = 'rgba(70,55,40,.35)'; g.lineWidth = 2
  g.strokeRect(36, 36, W - 72, H - 72)

  // header
  g.fillStyle = '#2b2520'
  g.font = `600 64px ${serif}`
  g.textAlign = 'left'; g.textBaseline = 'alphabetic'
  g.fillText(`NO. ${String(d.no).padStart(3, '0')}`, 84, 140)
  g.font = `500 26px ${sans}`
  g.fillStyle = 'rgba(43,37,32,.62)'
  g.fillText(`${d.date.getFullYear()}.${String(d.date.getMonth() + 1).padStart(2, '0')}.${String(d.date.getDate()).padStart(2, '0')}`, 84, 182)
  g.textAlign = 'right'
  g.font = `600 30px ${serif}`
  g.fillStyle = '#2b2520'
  g.fillText('拼豆工坊', W - 84, 120)
  g.font = `500 20px ${sans}`
  g.fillStyle = 'rgba(43,37,32,.55)'
  g.fillText('B E A D   S T U D I O', W - 84, 152)

  // photo
  const px = 84, py = 226, pw = W - 168, ph = 860
  g.save()
  g.shadowColor = 'rgba(60,40,20,.28)'; g.shadowBlur = 40; g.shadowOffsetY = 18
  roundRect(g, px, py, pw, ph, 22); g.fillStyle = '#d9c9ac'; g.fill()
  g.restore()
  g.save(); roundRect(g, px, py, pw, ph, 22); g.clip()
  const iw = photo.width, ih = photo.height
  const s = Math.max(pw / iw, ph / ih)
  g.drawImage(photo, px + (pw - iw * s) / 2, py + (ph - ih * s) / 2, iw * s, ih * s)
  g.restore()
  // vermilion seal with the grade
  const sx = px + pw - 118, sy = py + ph - 118
  g.save(); g.translate(sx, sy); g.rotate(-0.12)
  g.fillStyle = 'rgba(205,64,40,.92)'; roundRect(g, -52, -52, 104, 104, 10); g.fill()
  g.strokeStyle = 'rgba(255,240,230,.85)'; g.lineWidth = 3; roundRect(g, -44, -44, 88, 88, 6); g.stroke()
  g.fillStyle = 'rgba(255,244,236,.96)'; g.textAlign = 'center'; g.textBaseline = 'middle'
  g.font = `700 54px ${serif}`
  g.fillText(d.diagnosis.grade, 0, -8)
  g.font = `600 17px ${sans}`
  g.fillText('出品', 0, 28)
  g.restore()

  // message
  const lines = wrapLines(g, d.message.trim(), W - 220, `500 44px ${serif}`, 3)
  g.textAlign = 'left'; g.textBaseline = 'alphabetic'
  let y = py + ph + 98
  if (d.to.trim()) { g.font = `500 30px ${sans}`; g.fillStyle = 'rgba(43,37,32,.6)'; g.fillText(`送给 ${d.to.trim()}`, 84, y - 26) }
  g.font = `500 44px ${serif}`; g.fillStyle = '#2b2520'
  if (!lines.length) { g.fillStyle = 'rgba(43,37,32,.4)'; g.fillText(d.title, 84, y + 10); y += 62 }
  for (const l of lines) { g.fillText(l, 84, y + 10); y += 62 }
  if (d.from.trim()) { g.font = `500 32px ${serif}`; g.textAlign = 'right'; g.fillStyle = 'rgba(43,37,32,.78)'; g.fillText(`— ${d.from.trim()}`, W - 84, 1394) }

  // diagnosis strip
  g.textAlign = 'left'
  g.strokeStyle = 'rgba(70,55,40,.25)'; g.lineWidth = 1.5
  g.beginPath(); g.moveTo(84, 1440); g.lineTo(W - 84, 1440); g.stroke()
  g.fillStyle = 'rgba(205,64,40,1)'; g.font = `700 26px ${serif}`
  g.fillText(`${d.diagnosis.grade} · ${d.diagnosis.title}`, 84, 1488)
  g.fillStyle = 'rgba(43,37,32,.7)'; g.font = `500 22px ${sans}`
  const top = d.diagnosis.findings.slice(0, 3).map((f) => f.name).join(' · ') || '没有发现明显毛病'
  g.fillText(`义诊：${top}`, 84, 1528)
  g.fillStyle = 'rgba(43,37,32,.5)'; g.font = `500 20px ${sans}`
  const mm = Math.floor(d.seconds / 60), ss = String(Math.round(d.seconds % 60)).padStart(2, '0')
  g.fillText(`${d.beads} 颗 · ${d.setupLabel} · 用时 ${mm}:${ss} · ${d.tag}`, 84, 1566)
  return cv
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath()
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath()
}

function wrapLines(g: CanvasRenderingContext2D, text: string, maxW: number, font: string, maxLines: number): string[] {
  if (!text) return []
  g.font = font
  const out: string[] = []
  for (const para of text.split('\n')) {
    let cur = ''
    for (const ch of [...para]) {
      if (g.measureText(cur + ch).width > maxW) { out.push(cur); cur = ch } else cur += ch
    }
    out.push(cur)
  }
  return out.slice(0, maxLines)
}

function mulberry(seed: number) {
  let a = seed >>> 0
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
