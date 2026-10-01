import { h } from './dom'
import type { AudioEngine } from '../audio/audio'

/**
 * The door of the shop. One screen: what this is, how to move around, and a single button that also unlocks
 * the browser's audio (so the door-bell can ring).
 */
export function showWelcome(audio: AudioEngine, onEnter: () => void) {
  const key = 'bead-studio:seen'
  let seen = false
  try { seen = localStorage.getItem(key) === '1' } catch { /* private mode */ }
  const el = h('div', { class: 'welcome', role: 'dialog', 'aria-label': '欢迎光临' },
    h('div', { class: 'w-card' },
      h('div', { class: 'w-mark', html: '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="26" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="32" cy="32" r="18" fill="var(--accent)"/><circle cx="32" cy="32" r="7" fill="var(--paper)"/><path d="M19 23a16 16 0 0 1 11-6" stroke="#fff" stroke-opacity=".7" stroke-width="3" stroke-linecap="round" fill="none"/></svg>' }),
      h('div', { class: 'w-eyebrow' }, 'BEAD STUDIO'),
      h('h1', { class: 'w-title' }, '欢迎光临', h('br'), '拼豆工坊'),
      h('p', { class: 'w-lead' }, '一张桌子，一块豆板，一盒豆子。和线下店一样：选图、取豆、一颗一颗摆、熨烫、压平——每一步都是真的，每一件都不一样。'),
      h('ul', { class: 'w-tips' },
        h('li', null, h('b', null, '拼'), '点豆盘里的豆夹起，再点钉子放下；豆笔按住划过'),
        h('li', null, h('b', null, '烫'), '隔着纸，按住按压、抬起、换位置'),
        h('li', null, h('b', null, '看'), '滚轮缩放，右键拖动平移 / 旋转；戴上耳机更好'),
      ),
      h('button', { class: 'btn primary w-go', onclick: async () => {
        try { await audio.enable() } catch { /* */ }
        audio.impact('ui', 0.7, 1.6); setTimeout(() => audio.impact('ui', 0.6, 2.0), 140)
        try { localStorage.setItem(key, '1') } catch { /* */ }
        el.classList.add('gone')
        setTimeout(() => el.remove(), 700)
        onEnter()
      } }, seen ? '推门进去' : '推门进去 · 开始'),
      h('p', { class: 'w-foot' }, '不需要标准答案。烫成什么样，都是你的样子。'),
    ))
  document.body.append(el)
  return el
}
