// INVENTORY panel (key I): category tabs, sortable list, paper doll with 9 equipment slots, weight bar, quick slots 1-8.
import * as Items from '../items.js';
import { SLOTS, QUICK_SLOTS } from '../consts.js';
import { h, clear, num, rarityColor, glyphOf, slotGlyph, itemName, statBrief, createTip, createCtx, promptQty, SLOT_LABEL } from './itemui.js';

const TABS = [['all', 'All'], ['weapons', 'Weapons'], ['armour', 'Armour'], ['potions', 'Potions'], ['food', 'Food'], ['ammo', 'Ammo'], ['scrolls', 'Scrolls'], ['misc', 'Misc']];
const WEAPON_KINDS = ['sword', 'axe', 'mace', 'dagger', 'spear', 'twohand', 'bow', 'crossbow', 'staff'];
const ARMOUR_SLOTS = ['head', 'chest', 'legs', 'boots', 'hands', 'amulet', 'ring'];
export function categoryOf(it) {
  if (it.slot === 'weapon' || WEAPON_KINDS.includes(it.kind)) return 'weapons';
  if (ARMOUR_SLOTS.includes(it.slot) || it.kind === 'shield') return 'armour';
  if (it.kind === 'potion') return 'potions';
  if (it.kind === 'food') return 'food';
  if (it.kind === 'arrow' || it.kind === 'bolt' || it.ammoKind) return 'ammo';
  if (it.kind === 'scroll') return 'scrolls';
  return 'misc';
}
export const canUse = (it) => ['potion', 'food', 'scroll'].includes(it.kind) || !!(it.heal || it.mana || it.spell || it.usable);

export function createInventoryPanel(ctx) {
  const S = { open: false, tab: 'all', sortKey: 'name', sortDir: 1, sel: null, sig: '' };
  let drag = null;
  const tip = createTip(ctx.root), menu = createCtx(ctx.root);
  const listEl = h('div', { class: 'rpg-il-body' }), tabsEl = h('div', { class: 'rpg-tabs' }), headEl = h('div', { class: 'rpg-il-head' });
  const dollEl = h('div', { class: 'rpg-doll' }), quickEl = h('div', { class: 'rpg-qkr' }), actEl = h('div', { class: 'rpg-actions' });
  const wtFill = h('div', { class: 'rpg-ibar-fill' }), wtTxt = h('span'), goldEl = h('b'), armEl = h('span', { style: 'margin-left:6px' }), emptyEl = h('div', { class: 'rpg-empty', text: 'Nothing here.' });
  const el = h('div', { class: 'rpg-iw rpg-modal rpg-gothic rpg-inv rpg-hidden' },
    h('div', { class: 'rpg-iw-head' }, h('h2', { text: 'Inventory' }), h('span', { class: 'rpg-iw-hint', text: 'double-click: equip / use · right-click: menu · drag onto a slot' }),
      h('button', { class: 'rpg-x', text: '×', title: 'Close (Esc)', on: { click: () => close() } })),
    h('div', { class: 'rpg-iw-body' },
      h('div', { class: 'rpg-inv-left' }, tabsEl, headEl, h('div', { class: 'rpg-il-scroll' }, listEl, emptyEl), actEl),
      h('div', { class: 'rpg-inv-right' }, dollEl,
        h('div', { class: 'rpg-wt' }, h('div', { class: 'rpg-wt-row' }, h('span', { text: 'Carry weight' }), wtTxt), h('div', { class: 'rpg-ibar' }, wtFill)),
        h('div', { class: 'rpg-gold-row' }, h('span', { class: 'rpg-coin' }), goldEl, h('span', { class: 'rpg-dimtxt', text: 'gold' }), h('span', { class: 'rpg-grow' }), h('span', { class: 'rpg-dimtxt', text: 'Armour'  }), armEl),
        h('div', { class: 'rpg-sub', text: 'Quick slots (keys 1–8)' }), quickEl)));
  ctx.root.appendChild(el);

  const P = () => ctx.player();
  const equipped = (it) => { const a = P(); return !!(a && it.slot && a.equip[it.slot] && a.equip[it.slot].uid === it.uid); };
  function allItems() {
    const a = P(); if (!a) return [];
    const out = a.inv.map((it) => ({ it, eq: false }));
    for (const s of SLOTS) if (a.equip[s]) out.push({ it: a.equip[s], eq: true });
    return out;
  }
  const findItem = (uid) => { const e = allItems().find((x) => x.it.uid === uid); return e ? e.it : null; };
  const nameOf = (it) => itemName(it) + ((it.qty || 1) > 1 ? '  ×' + it.qty : '');

  // ---- actions (all through cmd)
  const doEquip = (it) => ctx.cmd({ t: 'equip', uid: it.uid });
  const doUnequip = (it) => ctx.cmd({ t: 'unequip', slot: it.slot });
  const doUse = (it) => ctx.cmd({ t: 'use', uid: it.uid });
  function doDrop(it) {
    if ((it.qty || 1) > 1) promptQty(ctx.root, 'Drop ' + it.name, it.qty, 'Drop', (q) => ctx.cmd({ t: 'drop', uid: it.uid, qty: q }));
    else { if (equipped(it)) doUnequip(it); ctx.cmd({ t: 'drop', uid: it.uid, qty: 1 }); }
  }
  const doQuick = (slot, uid) => ctx.cmd({ t: 'quick', slot, uid: uid || null });
  function primary(it) { if (equipped(it)) doUnequip(it); else if (it.slot) doEquip(it); else if (canUse(it)) doUse(it); }
  function itemMenu(e, it) {
    e.preventDefault(); S.sel = it.uid; tip.hide();
    const eq = equipped(it), m = [];
    if (it.slot) m.push({ label: eq ? 'Unequip' : 'Equip', fn: () => (eq ? doUnequip(it) : doEquip(it)) });
    if (canUse(it)) m.push({ label: it.kind === 'food' ? 'Eat' : it.kind === 'scroll' ? 'Read' : 'Use', fn: () => doUse(it) });
    m.push(null);
    for (let i = 0; i < QUICK_SLOTS; i++) m.push({ label: 'Assign to quick slot ' + (i + 1), fn: () => doQuick(i, it.uid) });
    m.push(null, { label: 'Drop' + ((it.qty || 1) > 1 ? '…' : ''), fn: () => doDrop(it) });
    menu.open(e, m, it.name); render(true);
  }

  // ---- rendering
  function sorted(list) {
    const k = S.sortKey, d = S.sortDir;
    const val = (x) => (k === 'name' ? itemName(x.it).toLowerCase() : k === 'qty' ? x.it.qty || 1 : k === 'weight' ? (x.it.weight || 0) * (x.it.qty || 1) : k === 'value' ? (x.it.value || 0) * (x.it.qty || 1) : x.it.rarity || 0);
    return list.slice().sort((p, q) => { const a = val(p), b = val(q); return (a < b ? -1 : a > b ? 1 : 0) * d || (p.eq ? -1 : 0) || itemName(p.it).localeCompare(itemName(q.it)); });
  }
  function renderTabs(all) {
    clear(tabsEl);
    for (const [id, label] of TABS) {
      const n = id === 'all' ? all.length : all.filter((x) => categoryOf(x.it) === id).length;
      tabsEl.append(h('button', { class: 'rpg-tab' + (S.tab === id ? ' rpg-on' : ''), on: { click: () => { S.tab = id; render(true); } } }, label, h('i', { text: n })));
    }
  }
  function renderHead() {
    clear(headEl);
    for (const [k, label, cls] of [['name', 'Name', 'rpg-c-name'], ['qty', 'Qty', 'rpg-c-n'], ['weight', 'Wt', 'rpg-c-n'], ['value', 'Value', 'rpg-c-n']])
      headEl.append(h('button', { class: 'rpg-th ' + cls + (S.sortKey === k ? ' rpg-on' : ''), text: label + (S.sortKey === k ? (S.sortDir > 0 ? ' ▴' : ' ▾') : ''),
        on: { click: () => { if (S.sortKey === k) S.sortDir *= -1; else { S.sortKey = k; S.sortDir = k === 'name' ? 1 : -1; } render(true); } } }));
  }
  function renderList(all) {
    clear(listEl);
    const rows = sorted(all.filter((x) => S.tab === 'all' || categoryOf(x.it) === S.tab));
    emptyEl.classList.toggle('rpg-hidden', rows.length > 0);
    for (const { it, eq } of rows) {
      const row = h('div', { class: 'rpg-row' + (S.sel === it.uid ? ' rpg-sel' : '') + (eq ? ' rpg-eq' : ''), draggable: 'true', 'data-uid': it.uid },
        h('span', { class: 'rpg-ico', text: glyphOf(it), style: 'color:' + rarityColor(it) }),
        h('span', { class: 'rpg-c-name' }, h('span', { class: 'rpg-nm', text: nameOf(it), style: 'color:' + rarityColor(it) }), h('small', { text: statBrief(it) })),
        h('span', { class: 'rpg-c-n', text: eq ? 'worn' : it.qty > 1 ? num(it.qty) : '' }),
        h('span', { class: 'rpg-c-n', text: num((it.weight || 0) * (it.qty || 1), 1) }), h('span', { class: 'rpg-c-n rpg-gold', text: num((it.value || 0) * (it.qty || 1)) }));
      row.addEventListener('click', () => { S.sel = it.uid; render(true); });
      row.addEventListener('dblclick', () => primary(it));
      row.addEventListener('contextmenu', (e) => itemMenu(e, it));
      row.addEventListener('dragstart', (e) => { drag = { uid: it.uid, from: eq ? 'doll' : 'list' }; e.dataTransfer.setData('text/plain', it.uid); tip.hide(); });
      row.addEventListener('dragend', () => { drag = null; });
      row.addEventListener('mouseenter', (e) => tip.show(P(), it, e, eq ? 'Equipped' : null));
      row.addEventListener('mousemove', (e) => tip.move(e)); row.addEventListener('mouseleave', () => tip.hide());
      listEl.append(row);
    }
  }
  function renderActions() {
    clear(actEl);
    const it = S.sel && findItem(S.sel);
    const btn = (label, fn, cls) => actEl.append(h('button', { class: 'rpg-btn' + (cls ? ' ' + cls : ''), text: label, on: { click: fn } }));
    if (!it) { actEl.append(h('span', { class: 'rpg-dimtxt', text: 'Select an item.' })); return; }
    const eq = equipped(it);
    if (it.slot) btn(eq ? 'Unequip' : 'Equip', () => (eq ? doUnequip(it) : doEquip(it)), 'rpg-primary');
    if (canUse(it)) btn(it.kind === 'food' ? 'Eat' : it.kind === 'scroll' ? 'Read' : 'Use', () => doUse(it), it.slot ? '' : 'rpg-primary');
    btn((it.qty || 1) > 1 ? 'Drop…' : 'Drop', () => doDrop(it));
    actEl.append(h('span', { class: 'rpg-grow' }), h('span', { class: 'rpg-dimtxt', text: 'Quick slot:' }));
    for (let i = 0; i < QUICK_SLOTS; i++) actEl.append(h('button', { class: 'rpg-btn rpg-sq', text: i + 1, title: 'Assign to quick slot ' + (i + 1), on: { click: () => doQuick(i, it.uid) } }));
  }
  function renderDoll() {
    clear(dollEl); const a = P();
    for (const s of SLOTS) {
      const it = a && a.equip[s], d = h('div', { class: 'rpg-eqs rpg-es-' + s + (it ? ' rpg-filled' : '') + (S.sel && it && it.uid === S.sel ? ' rpg-sel' : '') + (S.sel && !it && (findItem(S.sel) || {}).slot === s ? ' rpg-slotok' : ''),
        style: it ? 'border-color:' + rarityColor(it) : null }, h('span', { class: 'rpg-eg', text: it ? glyphOf(it) : slotGlyph(s), style: it ? 'color:' + rarityColor(it) : null }), h('small', { text: it ? itemName(it) : SLOT_LABEL[s] }));
      d.addEventListener('click', () => { if (it) S.sel = it.uid; else { const c = S.sel && findItem(S.sel); if (c && c.slot === s) return doEquip(c); } render(true); });
      d.addEventListener('dblclick', () => { if (it) doUnequip(it); });
      if (it) {
        d.draggable = true; d.addEventListener('dragstart', (e) => { drag = { uid: it.uid, from: 'doll' }; e.dataTransfer.setData('text/plain', it.uid); tip.hide(); });
        d.addEventListener('dragend', () => { drag = null; });
        d.addEventListener('contextmenu', (e) => itemMenu(e, it));
        d.addEventListener('mouseenter', (e) => tip.show(a, it, e, 'Equipped')); d.addEventListener('mousemove', (e) => tip.move(e)); d.addEventListener('mouseleave', () => tip.hide());
      }
      d.addEventListener('dragover', (e) => { const c = drag && findItem(drag.uid); if (c && c.slot === s && drag.from === 'list') e.preventDefault(); });
      d.addEventListener('drop', (e) => { e.preventDefault(); const c = drag && findItem(drag.uid); if (c && c.slot === s) doEquip(c); });
      dollEl.append(d);
    }
    dollEl.append(h('div', { class: 'rpg-figure', text: '♘' }));
  }
  function quickInfo(v) {
    if (!v) return null;
    if (typeof v === 'string' && v.startsWith('spell:')) return { label: v.slice(6), glyph: '✨', color: '#9ec8ff', spell: true };
    const it = findItem(v); return it ? { label: itemName(it), glyph: glyphOf(it), color: rarityColor(it), qty: it.qty, it } : { label: '?', glyph: '?', color: '#777' };
  }
  function renderQuick() {
    clear(quickEl); const a = P();
    for (let i = 0; i < QUICK_SLOTS; i++) {
      const q = quickInfo(a && a.quick[i]);
      const d = h('div', { class: 'rpg-qk' + (q ? ' rpg-filled' : '') }, h('em', { text: i + 1 }), q ? h('span', { class: 'rpg-eg', text: q.glyph, style: 'color:' + q.color }) : null,
        q && q.qty > 1 ? h('b', { text: q.qty }) : null, h('small', { text: q ? q.label : '' }));
      d.addEventListener('click', () => { const c = S.sel && findItem(S.sel); if (c) doQuick(i, c.uid); });
      d.addEventListener('contextmenu', (e) => { e.preventDefault(); doQuick(i, null); });
      d.addEventListener('dragover', (e) => { if (drag) e.preventDefault(); });
      d.addEventListener('drop', (e) => { e.preventDefault(); if (drag) doQuick(i, drag.uid); });
      if (q && q.it) { d.addEventListener('mouseenter', (e) => tip.show(a, q.it, e)); d.addEventListener('mousemove', (e) => tip.move(e)); d.addEventListener('mouseleave', () => tip.hide()); }
      quickEl.append(d);
    }
  }
  function renderStats() {
    const a = P(); if (!a) return;
    const w = Items.weightOf ? Items.weightOf(a) : 0, cap = (a.d && a.d.carry) || 100, f = w / cap;
    wtTxt.textContent = num(w, 1) + ' / ' + num(cap); wtFill.style.width = Math.min(100, f * 100) + '%';
    wtFill.style.background = f > 1 ? '#d8503c' : f > 0.85 ? '#d99a3a' : '#7d9a5a';
    goldEl.textContent = num(a.gold || 0); armEl.textContent = num((a.d && a.d.armor) || 0) + '%';
  }
  function signature() {
    const a = P(); if (!a) return 'x';
    return [a.inv.map((i) => i.uid + ':' + (i.qty || 1) + ':' + (i.upgrade || 0)).join(','), SLOTS.map((s) => (a.equip[s] ? a.equip[s].uid : '-')).join(','), a.quick.join(','), a.gold, Math.round((a.d && a.d.carry) || 0), (a.d && a.d.armor) || 0, Math.round(Items.weightOf ? Items.weightOf(a) * 10 : 0)].join('|');
  }
  function render(force) {
    const sig = signature();
    if (!force && sig === S.sig) return;
    S.sig = sig; tip.hide();
    const all = allItems();
    if (S.sel && !all.some((x) => x.it.uid === S.sel)) S.sel = null;
    renderTabs(all); renderHead(); renderList(all); renderActions(); renderDoll(); renderQuick(); renderStats();
  }
  listEl.addEventListener('dragover', (e) => { if (drag && drag.from === 'doll') e.preventDefault(); });
  listEl.addEventListener('drop', (e) => { e.preventDefault(); const c = drag && findItem(drag.uid); if (c && drag.from === 'doll') doUnequip(c); });

  function open() { S.open = true; el.classList.remove('rpg-hidden'); render(true); }
  function close() { S.open = false; el.classList.add('rpg-hidden'); tip.hide(); menu.close(); }
  return { el, open, close, isOpen: () => S.open, update() { if (S.open) render(false); } };
}
