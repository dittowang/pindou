import type { PaletteColor } from '../config/palette'
import { PALETTE } from '../config/palette'

type Child = Node | string | number | null | undefined | false
type Props = Record<string, unknown> | null

type Reg = Record<string, EventListener>
const REG = '__h'
/** one real listener per event type per element; the function it calls can be swapped later (see `patch`) */
function addHandler(el: Element, type: string, fn: EventListener) {
  const holder = el as unknown as Record<string, Reg>
  const reg = (holder[REG] ??= {})
  if (!reg[type]) el.addEventListener(type, (e) => holder[REG][type]?.(e))
  reg[type] = fn
}

/** hyperscript-lite: h('div', { class: 'x', onclick }, 'text', child) */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Props, ...kids: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue
      if (k === 'class') el.className = String(v)
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v)
      else if (k === 'style') el.setAttribute('style', String(v))
      else if (k.startsWith('on') && typeof v === 'function') addHandler(el, k.slice(2).toLowerCase(), v as EventListener)
      else if (k === 'html') { el.innerHTML = String(v); (el as unknown as { __html: string }).__html = String(v) }
      else if (k.startsWith('--')) el.style.setProperty(k, String(v))
      else if (v === true) el.setAttribute(k, '')
      else el.setAttribute(k, String(v))
    }
  }
  for (const c of kids.flat() as Child[]) {
    if (c === null || c === undefined || c === false) continue
    el.append(c instanceof Node ? c : document.createTextNode(String(c)))
  }
  return el
}

export const svg = (inner: string, vb = '0 0 24 24', cls = '') =>
  h('span', { class: cls, html: `<svg viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`, style: 'display:contents' })

export const ICON = {
  undo: '<path d="M9 7 4.5 11.5 9 16"/><path d="M5 11.5h8.5a5.5 5.5 0 0 1 0 11H9" transform="translate(0 -4)"/>',
  soundOn: '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4Z"/><path d="M15.5 9a4 4 0 0 1 0 6"/><path d="M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  soundOff: '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4Z"/><path d="m16 9.5 5 5m0-5-5 5"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  arrow: '<path d="M5 12h14m-5-6 6 6-6 6"/>',
  back: '<path d="M19 12H5m5-6-6 6 6 6"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
  flame: '<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2.2-4.6.2 1.4.9 2.2 1.8 2.6C10.2 8.2 11 5.6 12 3Z"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.5 4.5L20 16"/><path d="M20 20v-4h-4"/>',
  cam: '<path d="M3.5 8.5h3l1.5-2.5h8l1.5 2.5h3v10h-17v-10Z"/><circle cx="12" cy="13" r="3.5"/>',
  download: '<path d="M12 4v11m-4.5-4.5L12 15l4.5-4.5M5 19.5h14"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="m4 17 5-4.5 3.5 3 3-2.5 4.5 4"/>',
  focus: '<path d="M4 9V4.5h4.5M20 9V4.5h-4.5M4 15v4.5h4.5M20 15v4.5h-4.5"/>',
  dot: '<circle cx="12" cy="12" r="2"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.5a2.5 2.5 0 0 1 4.8.8c0 1.7-2.4 2-2.4 3.5"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  tweezers: '<path d="M9.2 3.5 11.5 20.5M14.8 3.5 12.5 20.5"/><path d="M9.2 3.5c0-1.2 5.6-1.2 5.6 0"/>',
  pen: '<path d="m5 19 1.1-4.3L16.7 4.1a2 2 0 0 1 2.8 2.8L8.9 17.5 5 19Z"/><path d="m14.4 6.4 3.2 3.2"/>',
  zoomIn: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m20 20-4.9-4.9M7.5 10.5h6M10.5 7.5v6"/>',
  zoomOut: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m20 20-4.9-4.9M7.5 10.5h6"/>',
  trash: '<path d="M5 7h14M10 7V4.5h4V7M7 7l.8 12.5h8.4L17 7"/>',
}

export function icon(name: keyof typeof ICON, cls = ''): HTMLElement { return svg(ICON[name], '0 0 24 24', cls) }

/** a bead seen from above, as a UI chip */
export function beadChip(c: PaletteColor | number, size = 36): HTMLElement {
  const col = typeof c === 'number' ? PALETTE[c] : c
  const el = h('span', { class: 'bead-chip' })
  el.style.setProperty('--c', col.hex)
  el.style.setProperty('--s', size + 'px')
  if (col.finish === 'translucent') el.classList.add('tr')
  if (col.finish === 'pearl') el.classList.add('pearl')
  if (col.finish === 'glow') el.classList.add('glow')
  const alt = col.alt && (col.states as any)
  if (col.finish === 'thermochromic' && (col.states as any)?.warm) { el.classList.add('alt'); el.style.setProperty('--c2', (col.states as any).warm) }
  if (col.finish === 'photochromic' && (col.states as any)?.uv) { el.classList.add('alt'); el.style.setProperty('--c', '#f3f1ea'); el.style.setProperty('--c2', (col.states as any).uv) }
  void alt
  return el
}

export function mount(parent: HTMLElement, ...kids: Child[]) { parent.replaceChildren(...(kids.flat().filter(Boolean) as (Node | string)[])) }

const NO_MORPH = new Set(['CANVAS', 'VIDEO', 'AUDIO', 'IFRAME', 'TEXTAREA', 'SELECT'])
function sameKind(a: Node, b: Node): boolean {
  if (a.nodeType !== b.nodeType) return false
  if (a.nodeType === Node.ELEMENT_NODE) { const x = a as Element, y = b as Element; return x.tagName === y.tagName && !NO_MORPH.has(x.tagName) }
  return a.nodeType === Node.TEXT_NODE
}
function morphNode(a: Node, b: Node) {
  if (a.nodeType === Node.TEXT_NODE) { if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue; return }
  const ea = a as HTMLElement, eb = b as HTMLElement
  for (const at of Array.from(eb.attributes)) if (ea.getAttribute(at.name) !== at.value) ea.setAttribute(at.name, at.value)
  for (const at of Array.from(ea.attributes)) if (!eb.hasAttribute(at.name)) ea.removeAttribute(at.name)
  const hb = (eb as unknown as Record<string, Reg>)[REG], ha = ((ea as unknown as Record<string, Reg>)[REG] ??= {})
  if (hb) for (const [t, fn] of Object.entries(hb)) addHandler(ea, t, fn)
  for (const t of Object.keys(ha)) if (!hb || !(t in hb)) delete ha[t]
  const html = (eb as unknown as { __html?: string }).__html
  if (html !== undefined) {
    const holder = ea as unknown as { __html?: string }
    if (holder.__html !== html) { ea.innerHTML = html; holder.__html = html }
    return
  }
  morphChildren(ea, Array.from(eb.childNodes))
}
function morphChildren(parent: Node, kids: Node[]) {
  let i = 0
  for (const nk of kids) {
    const ok = parent.childNodes[i] ?? null
    if (ok === nk) { i++; continue }
    if (ok && sameKind(ok, nk)) { morphNode(ok, nk); i++; continue }
    parent.insertBefore(nk, ok)
    i++
  }
  while (parent.childNodes.length > i) parent.lastChild!.remove()
}

/**
 * Like `mount`, but reuses the elements that are already there: the new tree is built as usual and then folded into the
 * old one (attributes, text and handlers are updated in place). A panel that refreshes while the visitor is pressing a
 * button or dragging a slider therefore keeps that very button / slider — a plain re-render would replace it under the
 * pointer and the click would never arrive. Every node passed in must be freshly made for this call.
 */
export function patch(parent: HTMLElement, ...kids: Child[]) {
  const nodes = (kids.flat().filter((k) => k !== null && k !== undefined && k !== false) as (Node | string | number)[])
    .map((k) => (k instanceof Node ? k : document.createTextNode(String(k))))
  morphChildren(parent, nodes)
}

export function toast(msg: string, ms = 2600) {
  let wrap = document.querySelector('.toast-wrap') as HTMLElement | null
  if (!wrap) {
    wrap = h('div', { class: 'toast-wrap' })
    const hud = document.querySelector('.hud')
    if (hud) hud.append(wrap); else document.body.append(wrap)
  }
  const t = h('div', { class: 'toast', role: 'status' }, msg)
  wrap.append(t)
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400) }, ms)
}
