// LOOT window: opens when player.openC is set (index.js drives open/close). Take, Take all (E / F / Enter), closing sends closeContainer.
import * as Items from '../items.js';
import { h, clear, num, rarityColor, glyphOf, itemName, statBrief, createTip } from './itemui.js';

const KIND_LABEL = { chest: 'Chest', crate: 'Supply crate', corpse: 'Remains' };
const TIER_LABEL = ['', 'Common', 'Fine', 'Rich'];

export function createLootPanel(ctx) {
  const S = { open: false, cid: 0, sig: '', sel: 0 };
  const tip = createTip(ctx.root);
  const titleEl = h('h2'), subEl = h('span', { class: 'rpg-iw-hint' }), listEl = h('div', { class: 'rpg-lt-list' }), footEl = h('div', { class: 'rpg-lt-foot' });
  const takeAll = h('button', { class: 'rpg-btn rpg-primary', on: { click: () => doTakeAll() } }, 'Take all ', h('kbd', { class: 'rpg-key', text: 'E' }));
  const wtEl = h('span', { class: 'rpg-dimtxt' });
  const el = h('div', { class: 'rpg-iw rpg-modal rpg-gothic rpg-loot rpg-hidden' },
    h('div', { class: 'rpg-iw-head' }, titleEl, subEl, h('button', { class: 'rpg-x', text: '×', title: 'Close (Esc)', on: { click: () => ctx.ui && ctx.ui.close ? ctx.ui.close('loot') : close() } })),
    listEl, h('div', { class: 'rpg-lt-foot' }, takeAll, h('span', { class: 'rpg-grow' }), wtEl));
  ctx.root.appendChild(el);
  const cont = () => { const p = ctx.player(); const id = S.cid || (p && p.openC); return id ? ctx.st().containers.find((q) => q.id === id) : null; };
  const doTake = (c, it) => ctx.cmd({ t: 'loot', container: c.id, uid: it.uid });
  function doTakeAll() { const c = cont(); if (c && c.items.length) ctx.cmd({ t: 'lootAll', container: c.id }); }

  function render(force) {
    const c = cont(), a = ctx.player(); if (!c || !a) return;
    const sig = [c.id, c.locked, c.items.map((i) => i.uid + ':' + (i.qty || 1)).join(','), Math.round((Items.weightOf ? Items.weightOf(a) : 0) * 10)].join('|');
    if (!force && sig === S.sig) return;
    S.sig = sig; tip.hide();
    titleEl.textContent = c.name || KIND_LABEL[c.kind] || 'Container';
    subEl.textContent = (KIND_LABEL[c.kind] || '') + (c.tier ? ' · ' + (TIER_LABEL[c.tier] || 'Tier ' + c.tier) : '') + (c.locked ? ' · Locked' : '');
    clear(listEl);
    if (!c.items.length) listEl.append(h('div', { class: 'rpg-empty', text: 'Empty.' }));
    for (const it of c.items) {
      const gold = it.kind === 'gold';
      const row = h('div', { class: 'rpg-row' }, h('span', { class: 'rpg-ico', text: gold ? '●' : glyphOf(it), style: 'color:' + (gold ? '#e0bb5c' : rarityColor(it)) }),
        h('span', { class: 'rpg-c-name' }, h('span', { class: 'rpg-nm', style: 'color:' + (gold ? '#e0bb5c' : rarityColor(it)), text: gold ? num(it.qty) + ' gold' : itemName(it) + ((it.qty || 1) > 1 ? '  ×' + it.qty : '') }), h('small', { text: gold ? '' : statBrief(it) })),
        h('span', { class: 'rpg-c-n', text: gold ? '' : num((it.weight || 0) * (it.qty || 1), 1) + ' wt' }), h('span', { class: 'rpg-c-n rpg-gold', text: gold ? '' : num((it.value || 0) * (it.qty || 1)) }),
        h('button', { class: 'rpg-btn', text: 'Take', on: { click: (e) => { e.stopPropagation(); doTake(c, it); } } }));
      row.addEventListener('dblclick', () => doTake(c, it));
      if (!gold) { row.addEventListener('mouseenter', (e) => tip.show(a, it, e)); row.addEventListener('mousemove', (e) => tip.move(e)); row.addEventListener('mouseleave', () => tip.hide()); }
      listEl.append(row);
    }
    takeAll.disabled = !c.items.length;
    const w = Items.weightOf ? Items.weightOf(a) : 0, d = a.d || {};
    wtEl.textContent = 'Carrying ' + num(w, 1) + ' / ' + num(d.carry || 0) + (d.hardCap ? ' (max ' + num(d.hardCap) + ')' : '');
  }
  function open(c) { S.open = true; S.cid = c && c.id ? c.id : 0; el.classList.remove('rpg-hidden'); render(true); }
  function close() { S.open = false; S.cid = 0; el.classList.add('rpg-hidden'); tip.hide(); }
  return {
    el, open, close, isOpen: () => S.open,
    update() { if (S.open) render(false); },
    keyHandler(e) {
      if (!S.open) return false;
      if (e.code === 'KeyE' || e.code === 'KeyF' || e.code === 'Enter') { const c = cont(); if (c && !c.items.length && ctx.ui) ctx.ui.close('loot'); else doTakeAll(); return true; }
      return false;
    },
  };
}
