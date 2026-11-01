// UI lane v0.5: the gear panel (I). Four slots (weapon, helmet, armour, amulet), each shows its name, the ONE stat it gives and its tier colour,
// plus a small log of "Equipped X (+8 damage)". Items are auto-equipped by the sim (gear.js); there is no backpack, compare, sell or drop here.
// createPanels(ctx) -> { update(dt), handleEvents(events), toggle(), show(), close(), open, log }. Non-blocking: the game keeps running.
import { gearView, equipText, esc, SLOTS, TIER_NAME, itemLine } from './hud_state.js';

export function createPanels({ game, st, local, team, ui }) {
  const hud = document.getElementById('h5') || document.body;
  const el = document.createElement('div'); el.id = 'h5Gear'; el.className = 'glass ui hidden'; hud.appendChild(el);
  const S = { open: false, sig: '', log: [] };

  function render() {
    const V = gearView(team);
    el.innerHTML = `<div class="hd"><span>Gear</span><span class="x" title="Close (I)">&times;</span></div>`
      + V.map((s) => `<div class="h5-gslot${s.item ? '' : ' empty'}" style="--tc:${s.color}"><div class="g">${s.glyph}</div><div><div class="sl">${s.label}${s.item && s.item.tier !== undefined ? ' · ' + TIER_NAME[Math.max(0, Math.min(2, s.item.tier | 0))] : ''}</div>${s.item ? `<div class="n">${esc(s.name)}</div>` : ''}<div class="l">${esc(s.line)}</div></div></div>`).join('')
      + `<div id="h5Log">${S.log.length ? S.log.map((t) => `<div>${esc(t)}</div>`).join('') : '<div class="none">Better gear you find is worn automatically.</div>'}</div>`
      + `<div class="ft">Press <kbd>I</kbd> to close</div>`;
    el.querySelector('.x').onclick = () => api.close();
  }
  const sigNow = () => SLOTS.map((s) => { const it = team.hero.eq && team.hero.eq[s]; return it ? it.name + itemLine(it) : '-'; }).join('|') + S.log.length;

  function noteEquip(slot, name) {
    const eq = team.hero.eq || {};
    const it = (slot && eq[slot]) || SLOTS.map((s) => eq[s]).find((q) => q && q.name === name) || null;
    const text = equipText(it || { name }, slot);
    if (S.log[0] === text) return;
    S.log.unshift(text); if (S.log.length > 5) S.log.length = 5;
    if (ui && ui.toast) ui.toast(text, 'info');
    S.sig = '';
  }
  const api = {
    get open() { return S.open; }, // shown; it never stops the hero (controls read ui.v3.open, and hud_ui reports open=false)
    log: S.log,
    toggle() { S.open ? api.close() : api.show(); },
    show() { S.open = true; S.sig = ''; el.classList.remove('hidden'); },
    close() { S.open = false; el.classList.add('hidden'); },
    update() { if (S.open) { const s = sigNow(); if (s !== S.sig) { S.sig = s; render(); } } },
    handleEvents(events) {
      for (const e of events) {
        if (e.team !== undefined && e.team !== local) continue;
        if (e.type === 'item' && e.hero && e.equipped) noteEquip(null, e.name);
        else if (e.type === 'equip') noteEquip(e.slot, e.name);
      }
    },
  };
  return api;
}
