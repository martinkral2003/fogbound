// FOGBOUND: DOMINION UI helpers (DOM building, formatting). No sim imports.
export function h(tag, cls, parent, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined && text !== null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}
export const $ = (id) => document.getElementById(id);
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export function fmtTime(s) { s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
export function fmtNum(n) { n = Math.floor(n); return n >= 10000 ? (n / 1000).toFixed(1) + 'k' : String(n); }
export function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
export function cssColor(n) { return '#' + (n >>> 0).toString(16).padStart(6, '0'); }
export function loadSettings() {
  const d = { edgePan: 1, camSpeed: 1, invertRotate: false, wasd: 'auto', volume: 0.5, showHp: true };
  try { return Object.assign(d, JSON.parse(localStorage.getItem('fogbound.rts.settings') || '{}')); } catch (e) { return d; }
}
export function saveSettings(s) { try { localStorage.setItem('fogbound.rts.settings', JSON.stringify(s)); } catch (e) { /* ignore */ } }
