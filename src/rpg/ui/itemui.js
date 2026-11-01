// Shared helpers for the item/character UI panels (UI-A lane): DOM builder, rarity colours, tooltips, context menu, qty prompt.
// Everything reads subsystem data defensively: Items.describeItem / compareItem may or may not exist yet.
import * as Items from '../items.js';

export const RARITY_FALLBACK = ['#d8dccf', '#e8d870', '#6fd870', '#6aa8ff', '#c070ff'];
export const RARITY_NAMES = ['Common', 'Magic', 'Rare', 'Epic', 'Legendary'];
export const DTYPE_INFO = {
  physical: { color: '#c9c9c0', icon: '⚔', name: 'Physical' }, fire: { color: '#ff8a4a', icon: '♨', name: 'Fire' },
  cold: { color: '#7cc8ff', icon: '❄', name: 'Cold' }, lightning: { color: '#f2e45c', icon: 'ϟ', name: 'Lightning' },
  poison: { color: '#8ad84a', icon: '☣', name: 'Poison' },
};
export const SLOT_LABEL = { weapon: 'Weapon', offhand: 'Offhand', head: 'Head', chest: 'Chest', legs: 'Legs', boots: 'Boots', hands: 'Hands', amulet: 'Amulet', ring: 'Ring' };
const GLYPH = {
  sword: '⚔', axe: '⚒', mace: '⚒', dagger: '†', spear: '⇑', twohand: '⚔', bow: '➳', crossbow: '➳', staff: '★',
  shield: '⛨', torch: '♨', potion: '⚗', food: '☕', scroll: '✉', arrow: '↑', bolt: '↑', lockpick: '⚿', key: '⚿', misc: '◆',
};
const SLOT_GLYPH = { head: '♖', chest: '☖', legs: '∥', boots: '⊓', hands: '✋', amulet: '❂', ring: '○', offhand: '⛨', weapon: '⚔' };

export function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  if (props) for (const k of Object.keys(props)) {
    const v = props[k];
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k === 'style') e.style.cssText = v;
    else if (k === 'on') for (const ev of Object.keys(v)) e.addEventListener(ev, v[ev]);
    else if (k === 'title') e.title = v; else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}
export const clear = (e) => { while (e.firstChild) e.removeChild(e.firstChild); return e; };
export const num = (v, d = 0) => (Math.round(v * 10 ** d) / 10 ** d).toLocaleString('en-US', { maximumFractionDigits: d });
export const rarityOf = (it) => Math.max(0, Math.min(4, (it && it.rarity) | 0));
export function rarityColor(it) {
  const r = Items.RARITIES && Items.RARITIES[rarityOf(it)];
  return (r && r.color) || RARITY_FALLBACK[rarityOf(it)];
}
export const rarityName = (it) => ((Items.RARITIES && Items.RARITIES[rarityOf(it)]) || {}).name || RARITY_NAMES[rarityOf(it)];
export const glyphOf = (it) => (it && (GLYPH[it.kind] || (it.slot && SLOT_GLYPH[it.slot]))) || '◆';
export const slotGlyph = (s) => SLOT_GLYPH[s] || '◆';
export const itemName = (it) => it.name + (it.upgrade ? ' +' + it.upgrade : '');
export const isStack = (it) => (it.qty || 1) > 1;
export function typeLabel(it) {
  if (it.slot) return (SLOT_LABEL[it.slot] || it.slot) + (it.kind && it.kind !== it.slot ? ' · ' + it.kind : '');
  return it.kind ? it.kind[0].toUpperCase() + it.kind.slice(1) : 'Item';
}

// stat summary shown in lists, e.g. "6-9 dmg" or "12 armour"
export function statBrief(it) {
  if (it.dmg) return num(it.dmg[0]) + '–' + num(it.dmg[1]) + ' dmg';
  if (it.armor) return num(it.armor) + ' arm';
  if (it.heal) return '+' + num(it.heal) + ' hp';
  if (it.mana && it.kind !== 'scroll') return '+' + num(it.mana) + ' mp';
  return '';
}

const toLine = (l) => (typeof l === 'string' ? { t: l } : { t: l.text ?? l.t ?? '', c: l.color ?? l.c });
function fallbackLines(it) {
  const L = [{ t: rarityName(it) + ' ' + typeLabel(it).toLowerCase(), c: 'dim' }];
  if (it.dmg) L.push({ t: 'Damage ' + num(it.dmg[0]) + '–' + num(it.dmg[1]) + (it.dtype && it.dtype !== 'physical' ? ' ' + it.dtype : '') });
  if (it.speed && it.dmg) L.push({ t: 'Speed ' + num(it.speed, 2) + '   Reach ' + num(it.reach || 0, 1) + ' m' + (it.stam ? '   Stamina ' + num(it.stam) : '') });
  if (it.armor) L.push({ t: 'Armour ' + num(it.armor) });
  if (it.res) for (const k of Object.keys(it.res)) if (it.res[k]) L.push({ t: '+' + num(it.res[k]) + '% ' + k + ' resistance', c: 'mod' });
  if (it.bonus) for (const k of Object.keys(it.bonus)) if (it.bonus[k]) L.push({ t: (it.bonus[k] > 0 ? '+' : '') + num(it.bonus[k], 2) + ' ' + k, c: 'mod' });
  for (const af of it.affixes || []) L.push({ t: typeof af === 'string' ? af : af.text || af.name || af.id || '', c: 'mod' });
  if (it.heal) L.push({ t: 'Restores ' + num(it.heal) + ' health' });
  if (it.mana && it.kind !== 'scroll') L.push({ t: 'Restores ' + num(it.mana) + ' mana' });
  if (it.spell) L.push({ t: 'Teaches the spell ' + it.spell });
  if (it.desc) L.push({ t: it.desc, c: 'dim' });
  return L;
}
const sg = (v, d = 1) => (v > 0 ? '+' : '') + num(v, d);
const STAT = { str: 'Strength', dex: 'Dexterity', int: 'Intelligence', vit: 'Vitality', hp: 'Health', stamina: 'Stamina', mana: 'Mana', moveSpeed: 'move speed', dmgPct: 'damage', critPct: 'crit chance', lifesteal: 'lifesteal' };
// green/red comparison lines vs the item equipped in the same slot (Items.compareItem(a, item))
function deltaLines(a, it) {
  const out = [];
  if (!a || !it.slot || (a.equip[it.slot] && a.equip[it.slot].uid === it.uid) || !Items.compareItem) return out;
  let c = null; try { c = Items.compareItem(a, it); } catch (e) { c = null; }
  if (!c) return out;
  const row = (v, label, d = 1, inv = false) => { if (typeof v !== 'number' || Math.abs(v) < 0.005) return; out.push({ t: (v > 0 ? '▲ ' : '▼ ') + sg(v, d) + ' ' + label, c: (v > 0) !== inv ? 'good' : 'bad' }); };
  row(c.dpsDelta, 'damage per second'); row(c.dmgDelta, 'average damage'); row(c.armorDelta, 'armour');
  for (const k of Object.keys(c.bonusDelta || {})) row(c.bonusDelta[k], STAT[k] || k, 2);
  for (const k of Object.keys(c.resDelta || {})) row(c.resDelta[k], k + ' resistance', 0);
  row(c.weightDelta, 'weight', 1, true);
  if (out.length) out.unshift({ t: c.equipped ? 'Compared to ' + c.equipped.name : 'Nothing equipped in this slot', c: 'dim' });
  return out;
}

// {title, color, lines:[{t,c}]} for any item, using Items.describeItem when present
export function describe(a, it, extra) {
  let title = itemName(it), color = rarityColor(it), lines = null, real = false;
  if (Items.describeItem) {
    try {
      const d = Items.describeItem(it, a);
      if (d && Array.isArray(d.lines)) { lines = d.lines.map(toLine); real = true; if (d.title) title = d.title; if (d.color) color = d.color; }
    } catch (e) { lines = null; }
  }
  if (!lines) lines = fallbackLines(it);
  lines = lines.concat(deltaLines(a, it));
  if (!real) {
    const foot = [];
    if (it.weight != null) foot.push('Weight ' + num(it.weight * (it.qty || 1), 1));
    if (it.value != null) foot.push('Value ' + num(it.value * (it.qty || 1)) + ' g');
    if (foot.length) lines.push({ t: foot.join('   ·   '), c: 'dim' });
  }
  if (extra) for (const x of [].concat(extra)) lines.push(toLine(x));
  return { title, color, lines };
}

// ---- tooltip (one per panel root)
export function createTip(root) {
  const el = h('div', { class: 'rpg-tip rpg-hidden' });
  root.appendChild(el);
  const place = (e) => {
    const r = el.getBoundingClientRect(), W = innerWidth, H = innerHeight;
    let x = e.clientX + 16, y = e.clientY + 14;
    if (x + r.width > W - 6) x = Math.max(6, e.clientX - r.width - 16);
    if (y + r.height > H - 6) y = Math.max(6, H - r.height - 6);
    el.style.left = x + 'px'; el.style.top = y + 'px';
  };
  return {
    el,
    show(a, it, e, extra) {
      const d = describe(a, it, extra);
      clear(el); el.append(h('div', { class: 'rpg-tip-title', text: d.title, style: 'color:' + d.color }));
      for (const l of d.lines) el.append(h('div', { class: 'rpg-tip-line' + (l.c ? ' rpg-tl-' + (['dim', 'good', 'bad', 'mod'].includes(l.c) ? l.c : 'x') : ''), text: l.t, style: l.c && !['dim', 'good', 'bad', 'mod'].includes(l.c) ? 'color:' + l.c : null }));
      el.classList.remove('rpg-hidden'); place(e);
    },
    text(title, lines, e, color) {
      clear(el); el.append(h('div', { class: 'rpg-tip-title', text: title, style: color ? 'color:' + color : null }));
      for (const l of lines) { const o = toLine(l); el.append(h('div', { class: 'rpg-tip-line' + (o.c === 'dim' || o.c === 'bad' || o.c === 'good' || o.c === 'mod' ? ' rpg-tl-' + o.c : ''), text: o.t })); }
      el.classList.remove('rpg-hidden'); place(e);
    },
    move(e) { if (!el.classList.contains('rpg-hidden')) place(e); },
    hide() { el.classList.add('rpg-hidden'); },
  };
}
// attach hover tooltip to an element; getItem() -> item or null
export function hoverTip(tip, elm, a, getItem, extra) {
  elm.addEventListener('mouseenter', (e) => { const it = getItem(); if (it) tip.show(a(), it, e, extra && extra(it)); });
  elm.addEventListener('mousemove', (e) => tip.move(e));
  elm.addEventListener('mouseleave', () => tip.hide());
}

// ---- context menu: items = [{label, fn, disabled, sub}] ; null entries are separators
export function createCtx(root) {
  const el = h('div', { class: 'rpg-ctx rpg-modal rpg-hidden' });
  root.appendChild(el);
  const close = () => { el.classList.add('rpg-hidden'); };
  addEventListener('mousedown', (e) => { if (!el.contains(e.target)) close(); }, true);
  addEventListener('blur', close);
  return {
    el, close,
    open(e, items, head) {
      clear(el);
      if (head) el.append(h('div', { class: 'rpg-ctx-head', text: head }));
      for (const m of items) {
        if (!m) { el.append(h('div', { class: 'rpg-ctx-sep' })); continue; }
        el.append(h('button', { class: 'rpg-ctx-item' + (m.disabled ? ' rpg-dis' : ''), text: m.label, on: { click: () => { if (m.disabled) return; close(); m.fn(); } } }));
      }
      el.classList.remove('rpg-hidden');
      const r = el.getBoundingClientRect();
      el.style.left = Math.min(e.clientX, innerWidth - r.width - 6) + 'px'; el.style.top = Math.min(e.clientY, innerHeight - r.height - 6) + 'px';
    },
  };
}

// ---- tiny modal quantity prompt
export function promptQty(root, title, max, label, cb) {
  let q = Math.max(1, Math.min(max, max > 1 ? Math.ceil(max / 2) : 1));
  const inp = h('input', { type: 'number', min: 1, max, value: q, class: 'rpg-qty-in' });
  const sync = (v) => { q = Math.max(1, Math.min(max, v | 0 || 1)); inp.value = q; };
  const box = h('div', { class: 'rpg-qty-box' },
    h('div', { class: 'rpg-qty-title', text: title }),
    h('div', { class: 'rpg-qty-row' },
      h('button', { class: 'rpg-btn', text: '−', on: { click: () => sync(q - 1) } }), inp,
      h('button', { class: 'rpg-btn', text: '+', on: { click: () => sync(q + 1) } }),
      h('button', { class: 'rpg-btn', text: 'Max', on: { click: () => sync(max) } })),
    h('div', { class: 'rpg-qty-row' },
      h('button', { class: 'rpg-btn rpg-primary', text: label, on: { click: () => { done(); cb(q); } } }),
      h('button', { class: 'rpg-btn', text: 'Cancel', on: { click: () => done() } })));
  const wrap = h('div', { class: 'rpg-qty-wrap rpg-modal', on: { mousedown: (e) => { if (e.target === wrap) done(); } } }, box);
  inp.addEventListener('input', () => { q = Math.max(1, Math.min(max, inp.value | 0 || 1)); });
  inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { done(); cb(q); } else if (e.key === 'Escape') done(); });
  const done = () => wrap.remove();
  root.appendChild(wrap); inp.focus(); inp.select();
}

// player-facing number formatting of seconds
export const fmtT = (s) => (s >= 60 ? Math.floor(s / 60) + 'm ' + Math.floor(s % 60) + 's' : Math.ceil(s) + 's');
