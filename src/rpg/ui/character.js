// CHARACTER panel (key U): level/XP, attributes with + buttons, derived stats table, resistances.
import * as Skills from '../skills.js';
import * as Items from '../items.js';
import { ATTRS, DTYPES, MAX_LVL } from '../consts.js';
import { h, clear, num, createTip, DTYPE_INFO } from './itemui.js';

const ATTR_INFO = {
  str: ['Strength', 'Melee damage +2.5% per point over 10. Carry weight. Gates heavy armour and two-handers.'],
  dex: ['Dexterity', 'Stamina, bow damage, attack speed, crit chance. Cheaper dodges.'],
  int: ['Intelligence', 'Mana, spell damage and mana regeneration.'],
  vit: ['Vitality', 'Health, stamina regeneration and health regeneration.'],
};
const pc = (v, d = 0) => num(v * 100, d) + '%';

export function createCharacterPanel(ctx) {
  const S = { open: false, sig: '' };
  const tip = createTip(ctx.root);
  const head = h('div', { class: 'rpg-ch-head' }), attrEl = h('div', { class: 'rpg-ch-attrs' }), statEl = h('div', { class: 'rpg-ch-stats' }), resEl = h('div', { class: 'rpg-ch-res' }), perkEl = h('div', { class: 'rpg-ch-perks' });
  const el = h('div', { class: 'rpg-iw rpg-modal rpg-gothic rpg-narrow rpg-chr rpg-hidden' },
    h('div', { class: 'rpg-iw-head' }, h('h2', { text: 'Character' }), h('span', { class: 'rpg-iw-hint', text: 'spend attribute points with +' }), h('button', { class: 'rpg-x', text: '×', title: 'Close (Esc)', on: { click: () => close() } })),
    h('div', { class: 'rpg-iw-body rpg-ch-body' }, h('div', { class: 'rpg-ch-col' }, head, attrEl, h('div', { class: 'rpg-sub', text: 'Resistances' }), resEl, perkEl), h('div', { class: 'rpg-ch-col' }, statEl)));
  ctx.root.appendChild(el);
  const P = () => ctx.player();

  function renderHead(a) {
    clear(head);
    const need = Skills.xpNeed ? Skills.xpNeed(a.lvl) : 100, maxed = a.lvl >= MAX_LVL, f = maxed ? 1 : Math.min(1, a.xp / need);
    head.append(h('div', { class: 'rpg-ch-name' }, h('span', { class: 'rpg-ch-lvl', text: a.lvl }), h('div', {}, h('div', { class: 'rpg-ch-n', text: a.name || 'You' }), h('div', { class: 'rpg-dimtxt', text: 'Level ' + a.lvl + (maxed ? ' (max)' : '') }))),
      h('div', { class: 'rpg-ibar rpg-xpbar' }, h('div', { class: 'rpg-ibar-fill', style: 'width:' + f * 100 + '%;background:#c9a24a' })),
      h('div', { class: 'rpg-wt-row' }, h('span', { text: maxed ? 'Max level' : 'Experience' }), h('span', { text: maxed ? '' : num(a.xp) + ' / ' + num(need) })),
      h('div', { class: 'rpg-ch-mini' }, h('span', {}, 'Kills ', h('b', { text: num(a.kills || 0) })), h('span', {}, h('span', { class: 'rpg-coin' }), h('b', { class: 'rpg-gold', text: num(a.gold || 0) }), ' gold'),
        h('span', {}, 'Skill points ', h('b', { text: num((a.points && a.points.skill) || 0) }))));
  }
  function renderAttrs(a) {
    clear(attrEl);
    const pts = (a.points && a.points.attr) || 0, d = a.d || {}, eff = d.attrs || a.attrs;
    attrEl.append(h('div', { class: 'rpg-sub', text: 'Attributes' }), h('div', { class: 'rpg-ch-pts' + (pts ? ' rpg-has' : ''), text: pts ? pts + ' point' + (pts > 1 ? 's' : '') + ' to spend' : 'No points to spend' }));
    for (const k of ATTRS) {
      const base = a.attrs[k], bonus = Math.round(((eff && eff[k]) || base) - base), info = ATTR_INFO[k] || [k, ''];
      const row = h('div', { class: 'rpg-ch-attr' }, h('span', { class: 'rpg-ch-an', text: info[0] }), h('b', { class: 'rpg-ch-av', text: base }),
        h('span', { class: 'rpg-ch-ab' + (bonus < 0 ? ' rpg-neg' : ''), text: bonus ? (bonus > 0 ? '+' : '') + bonus : '' }),
        h('button', { class: 'rpg-btn rpg-sq rpg-plus', text: '+', disabled: pts > 0 ? null : true, title: pts > 0 ? 'Add a point to ' + info[0] : 'No attribute points', on: { click: () => ctx.cmd({ t: 'attr', attr: k }) } }));
      row.addEventListener('mouseenter', (e) => tip.text(info[0], [{ t: info[1], c: 'dim' }], e)); row.addEventListener('mousemove', (e) => tip.move(e)); row.addEventListener('mouseleave', () => tip.hide());
      attrEl.append(row);
    }
  }
  function renderPerks(a) {
    clear(perkEl);
    const lv = (a.perks && a.perks.levels) || [];
    if (lv.length) { perkEl.append(h('div', { class: 'rpg-sub', text: 'Milestone perks' })); for (const p of lv) perkEl.append(h('div', { class: 'rpg-ch-perk', text: '✦ ' + (typeof p === 'string' ? p : p.name || p.id || '') })); }
  }
  function stat(label, val, tipText) {
    const r = h('div', { class: 'rpg-ch-row' }, h('span', { text: label }), h('b', { text: val }));
    if (tipText) { r.addEventListener('mouseenter', (e) => tip.text(label, [{ t: tipText, c: 'dim' }], e)); r.addEventListener('mousemove', (e) => tip.move(e)); r.addEventListener('mouseleave', () => tip.hide()); }
    return r;
  }
  function renderStats(a) {
    clear(statEl); clear(resEl);
    const d = a.d || {}, w = d.weapon || {}, avg = w.dmg ? (w.dmg[0] + w.dmg[1]) / 2 : 0, wt = Items.weightOf ? Items.weightOf(a) : d.weight || 0;
    statEl.append(h('div', { class: 'rpg-sub', text: 'Combat' }),
      stat('Health', num(a.hp) + ' / ' + num(d.maxHp || a.maxHp)), stat('Stamina', num(a.stamina) + ' / ' + num(d.maxStamina || a.maxStamina)), stat('Mana', num(a.mana) + ' / ' + num(d.maxMana || a.maxMana)),
      stat('Armour', num(d.armor || 0, 1) + '%', 'Percentage of physical damage absorbed (max 75%).'),
      stat('Weapon damage', w.dmg ? num(w.dmg[0]) + '–' + num(w.dmg[1]) : '—', w.kind ? 'Wielding: ' + w.kind : null),
      stat('Damage multiplier', pc(d.dmgMul || 1), 'Attributes, perks and gear.'), stat('Average hit', num(avg * (d.dmgMul || 1), 1)),
      stat('Attack speed', 'x' + num((d.atkSpeed || 1) * (w.speed || 1), 2)), stat('Critical chance', pc(d.critChance || 0, 1)), stat('Critical damage', 'x' + num(d.critMul || 1.5, 2)),
      stat('Lifesteal', pc(d.lifesteal || 0, 1)),
      h('div', { class: 'rpg-sub', text: 'Body' }),
      stat('Move speed', num(d.moveSpeed || 0, 2) + ' m/s'), stat('Carry weight', num(wt, 1) + ' / ' + num(d.carry || 0), 'Over the limit you slow down; the hard cap is ' + num(d.hardCap || 0) + '.'),
      stat('Health regen', num(d.hpRegen || 0, 2) + ' /s'), stat('Stamina regen', num(d.staminaRegen || 0, 1) + ' /s'), stat('Mana regen', num(d.manaRegen || 0, 2) + ' /s'));
    for (const k of DTYPES) {
      const i = DTYPE_INFO[k], v = Math.round((d.res && d.res[k]) || (a.res && a.res[k]) || 0);
      resEl.append(h('div', { class: 'rpg-ch-resrow' }, h('span', { class: 'rpg-ch-ri', text: i.icon, style: 'color:' + i.color }), h('span', { text: i.name }),
        h('div', { class: 'rpg-ibar' }, h('div', { class: 'rpg-ibar-fill', style: 'width:' + Math.max(0, Math.min(100, v)) + '%;background:' + i.color })), h('b', { class: v < 0 ? 'rpg-neg' : '', text: v + '%' })));
    }
  }
  function render(force) {
    const a = P(); if (!a) return;
    const sig = [a.lvl, a.xp, a.kills, a.gold, a.hp | 0, a.stamina | 0, a.mana | 0, JSON.stringify(a.attrs), JSON.stringify(a.points), a.d && a.d.armor, a.d && a.d.moveSpeed, JSON.stringify(a.equip && Object.values(a.equip).map((i) => i && i.uid)), Items.weightOf ? Items.weightOf(a) : 0].join('|');
    if (!force && sig === S.sig) return;
    S.sig = sig; tip.hide(); renderHead(a); renderAttrs(a); renderPerks(a); renderStats(a);
  }
  function open() { S.open = true; el.classList.remove('rpg-hidden'); render(true); }
  function close() { S.open = false; el.classList.add('rpg-hidden'); tip.hide(); }
  return { el, open, close, isOpen: () => S.open, update() { if (S.open) render(false); } };
}
