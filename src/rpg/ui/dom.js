// Tiny DOM + formatting helpers shared by the UI-B modules (HUD, map, dialogue, journal, end screens).
export function h(tag, cls, parent, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined && text !== null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}
// set text / a style value only when it changed (HUD updates run every frame)
export function setText(e, s) { s = String(s); if (e._t !== s) { e._t = s; e.textContent = s; } }
export function setHtml(e, s) { if (e._h !== s) { e._h = s; e.innerHTML = s; } }
export function setW(e, frac) { const v = Math.max(0, Math.min(1, frac || 0)); const s = (v * 100).toFixed(1) + '%'; if (e._w !== s) { e._w = s; e.style.width = s; } }
export function setShow(e, on) { const v = !!on; if (e._s !== v) { e._s = v; e.classList.toggle('rpg-hidden', !v); } }
export function setCls(e, c, on) { const v = !!on; const k = '_c' + c; if (e[k] !== v) { e[k] = v; e.classList.toggle(c, v); } }
export function setStyle(e, prop, val) { const k = '_p' + prop; if (e[k] !== val) { e[k] = val; e.style[prop] = val; } }
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export function fmtTime(s) { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const RARITY_COL = ['#d8dccf', '#e8d870', '#6fd870', '#6aa8ff', '#c070ff'];
export const rarityColor = (r) => RARITY_COL[r | 0] || RARITY_COL[0];

// glyph per item kind / slot (no external images)
const KIND_GLYPH = {
  sword: '⚔', axe: '⛏', mace: '⚒', dagger: '†', spear: '↑', twohand: '⚔', bow: '➶', crossbow: '⌖', staff: '⚚',
  shield: '⛨', torch: '♨', potion: '⚗', food: '☕', scroll: '✉', arrow: '➳', bolt: '➳', lockpick: '⚿', key: '⚷', misc: '✦',
};
const SLOT_GLYPH = { weapon: '⚔', offhand: '⛨', head: '♕', chest: '☖', legs: '∥', boots: '⿃', hands: '✋', amulet: '✵', ring: '○' };
export function itemGlyph(it) { if (!it) return ''; return KIND_GLYPH[it.kind] || SLOT_GLYPH[it.slot] || '◆'; }
const DT_COL = { fire: '#ff8a3a', cold: '#8ad8ff', lightning: '#ffe65a', poison: '#7fdc5a', physical: '#d8dccf' };
export const dtypeColor = (d) => DT_COL[d] || DT_COL.physical;
const SPELL_GLYPH = { firebolt: '☄', frostshard: '❄', arc: '↯', venom: '☠', mend: '✚', stoneskin: '⛨', nova: '✹', blink: '⇝', bonewarden: '☠', drain: '❦' };
export const spellGlyph = (id) => SPELL_GLYPH[id] || '✦';

// status effects (a.status[{id,t,power}])
export const STATUS = {
  burn: ['♨', '#ff8a3a', 'Burning', true], bleed: ['❦', '#d8503c', 'Bleeding', true], poison: ['☠', '#7fdc5a', 'Poisoned', true],
  slow: ['↓', '#8ad8ff', 'Slowed', true], stun: ['★', '#ffe65a', 'Stunned', true], root: ['⚓', '#a08a5a', 'Rooted', true],
  regen: ['✚', '#58c060', 'Regeneration', false], shield: ['⛨', '#6aa8ff', 'Shielded', false], haste: ['»', '#e0bb5c', 'Haste', false],
  fog: ['☁', '#c05a6a', 'Dread Fog', true], frozen: ['❄', '#8ad8ff', 'Frozen', true], might: ['⚔', '#e0bb5c', 'Might', false], swift: ['»', '#e0bb5c', 'Swift', false],
};
export const statusInfo = (id) => STATUS[id] || ['◆', '#d8dccf', id, false];

// persisted settings (defensive localStorage)
const SKEY = 'fogbound-hero-settings';
export const DEFAULT_SETTINGS = { sens: 1, fov: 70, invertY: false, volume: 0.7, quality: 'high', northUp: false };
export function loadSettings() {
  try { return { ...DEFAULT_SETTINGS, ...(JSON.parse(localStorage.getItem(SKEY)) || {}) }; } catch (e) { return { ...DEFAULT_SETTINGS }; }
}
export function saveSettings(s) { try { localStorage.setItem(SKEY, JSON.stringify(s)); } catch (e) { /* ignore */ } }
