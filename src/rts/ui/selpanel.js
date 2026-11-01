// FOGBOUND: DOMINION selection panel (bottom centre): unit portraits grid, single unit/building details, production queue, inspected foreign entity.
import { h, esc, cssColor, fmtNum } from './dom.js';
import { worldDescribe, udef, bdef, unitName, roleGlyph, bldGlyph, costHtml, prettyId, templeState } from './adapt.js';
import { RES_ICONS, RES_NAMES } from '../consts.js';
import { GEN_XP } from '../units_stats.js';
const xpFrac = (u) => { const lv = u.lvl || 1; if (lv >= 10) return 1; const a = GEN_XP[lv - 1] || 0, b = GEN_XP[lv] || 100; return Math.max(0, Math.min(1, ((u.xp || 0) - a) / (b - a || 1))); };

const hpCol = (f) => (f > 0.6 ? '#58c060' : f > 0.3 ? '#d8b040' : '#d8503c');
const bar = (f, col, cls = '') => `<div class="sbar ${cls}"><i style="width:${Math.max(0, Math.min(1, f)) * 100}%;background:${col}"></i></div>`;
const stars = (n) => '★'.repeat(Math.max(0, (n || 1) - 1));

export function createSelPanel(ui, root) {
  const el = h('div', 'rts-sel panel ui hidden', root);
  let timer = 0, lastVer = -1;
  el.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act]'); if (!t) return;
    const ctl = ui.ctl, id = +t.dataset.id, act = t.dataset.act;
    if (act === 'tile') {
      const u = ui.st.byId.get(id); if (!u) return;
      if (e.shiftKey) { ctl.toggle(u); } else if (e.ctrlKey) ctl.select(ctl.selUnits().filter((q) => q.type === u.type), false);
      else if (e.detail > 1) ctl.centerOn(u.x, u.z); else ctl.select([u], false);
    } else if (act === 'type') { const ty = t.dataset.type; ctl.select(ctl.selUnits().filter((q) => q.type === ty), false); }
    else if (act === 'cancel') { const b = ui.st.byId.get(id); if (b) ctl.queueCmd({ t: 'cancelTrain', bld: b.id, idx: +t.dataset.idx }); }
    else if (act === 'nact') { const a = ui.nactions && ui.nactions[+t.dataset.i]; if (a) { const c = Object.assign({}, a, { ids: ctl.selUnits().map((u) => u.id) }); delete c.label; if (c.t === 'hireMerc') c.camp = c.site; ctl.queueCmd(c); } }
    else if (act === 'goto') { const u = ui.st.byId.get(id); if (u) ctl.centerOn(u.x, u.z); }
    ui.cardDirty = true;
  });
  function unitStats(u) {
    const d = udef(u.type), a = u.atk || d.atk || {};
    return `<span title="Damage">⚔ ${a.dmg ? Math.round(a.dmg) : '-'}</span><span title="Armour">⛨ ${Math.round(u.armor || 0)}</span><span title="Speed">➤ ${(u.speed || 0).toFixed(1)}</span><span title="Range">◎ ${a.range ? +(+a.range).toFixed(1) : '-'}</span>`;
  }
  function single(u) {
    const f = u.hp / (u.maxHp || 1), col = cssColor(ui.st.teams[u.team].faction.color), d = udef(u.type);
    const xp = u.general ? `<div class="sxp">Level ${u.lvl || 1}${u.points ? ` · <b>${u.points} skill point${u.points > 1 ? 's' : ''}</b>` : ''}${bar(xpFrac(u), '#b88cff', 'xp')}</div>` : `<div class="sxp">${stars(u.vet) ? '<span class="vet">' + stars(u.vet) + '</span> ' : ''}${esc(d.role || u.role)}${u.lvl > 1 ? ' · lvl ' + u.lvl : ''}</div>`;
    const order = u.garrison ? 'Garrisoned' : u.order ? prettyId(u.order.type) : 'Idle';
    return `<div class="s1"><div class="por" style="--c:${col}"><span>${roleGlyph(u.role)}</span></div><div class="sd"><div class="nm">${esc(unitName(u))}</div>${xp}
      <div class="hpl">${Math.ceil(u.hp)} / ${Math.round(u.maxHp)}</div>${bar(f, hpCol(f))}<div class="st">${unitStats(u)}</div><div class="od">${esc(order)}${u.carry && u.carry.amt ? ' · carrying ' + Math.floor(u.carry.amt) + ' ' + (RES_ICONS[u.carry.res] || '') : ''}</div></div></div>`;
  }
  function multi(units, blds) {
    const types = {};
    for (const u of units) types[u.type] = (types[u.type] || 0) + 1;
    const sum = Object.entries(types).map(([t, n]) => `<button class="chip" data-act="type" data-type="${t}" title="Select only these">${n}× ${esc(udef(t).name || t)}</button>`).join('');
    const tiles = units.slice(0, 60).map((u) => { const f = u.hp / (u.maxHp || 1); return `<div class="tile ${ui.ctl.activeType() === u.type ? 'act' : ''}" data-act="tile" data-id="${u.id}" title="${esc(unitName(u))}" style="--c:${cssColor(ui.st.teams[u.team].faction.color)}"><span>${roleGlyph(u.role)}</span>${u.vet > 1 ? `<em>${u.vet - 1}</em>` : ''}${bar(f, hpCol(f))}</div>`; }).join('');
    return `<div class="sm"><div class="smh"><b>${units.length}</b> units${blds.length ? ' + ' + blds.length + ' buildings' : ''}</div><div class="chips">${sum}</div><div class="tiles">${tiles}</div></div>`;
  }
  function queueHtml(b) {
    if (!b.queue || !b.queue.length) return '';
    const items = b.queue.map((q, i) => {
      const f = q.total ? q.t / q.total : 0;
      const nm = q.kind === 'unit' ? udef(q.unit).name : q.kind === 'tech' ? ((ui.techName && ui.techName(q.tech)) || prettyId(q.tech)) : prettyId(q.upgrade || '?');
      const g = q.kind === 'unit' ? roleGlyph(udef(q.unit).role) : q.kind === 'tech' ? '✎' : '⬆';
      return `<button class="qi ${i === 0 ? 'first' : ''}" data-act="cancel" data-id="${b.id}" data-idx="${i}" title="${esc(nm)} - click to cancel (refund)"><span>${g}</span>${i === 0 ? bar(f, '#e0bb5c') : ''}</button>`;
    }).join('');
    const first = b.queue[0];
    return `<div class="queue"><div class="qh">${first ? `Training ${first.total ? Math.max(0, Math.ceil(first.total - first.t)) + 's' : ''}` : ''}</div><div class="qs">${items}</div></div>`;
  }
  function bld(b, blds) {
    const d = bdef(b.type, ui.team), f = b.hp / (b.maxHp || 1), col = cssColor(ui.st.teams[b.team].faction.color);
    const building = b.state === 'building';
    const gar = d.garrison ? `<span title="Garrison">⛫ ${(b.garrison || []).length}/${d.garrison}</span>` : '';
    const extra = blds.length > 1 ? `<div class="chips"><span class="chip">${blds.length} selected</span></div>` : '';
    return `<div class="s1"><div class="por bld" style="--c:${col}"><span>${bldGlyph(b.type)}</span></div><div class="sd"><div class="nm">${esc(d.name)}</div>
      <div class="sxp">${building ? 'Under construction ' + Math.floor((b.progress || 0) * 100) + '%' : b.state === 'upgrading' ? 'Upgrading' : b.state === 'burning' ? '<b class="warn">Burning!</b>' : esc(d.desc || '').slice(0, 70)}</div>
      <div class="hpl">${Math.ceil(b.hp)} / ${Math.round(b.maxHp)}</div>${bar(f, hpCol(f))}${building ? bar(b.progress || 0, '#e0bb5c', 'prog') : ''}<div class="st">${gar}${b.wall ? `<span>Tier ${b.wall.tier}</span>` : ''}${b.rally ? '<span>⚑ rally set</span>' : ''}</div>${extra}</div>${queueHtml(b)}</div>`;
  }
  function neutralInfo(e) {
    const d = worldDescribe(ui.st, e) || { name: prettyId(e.kind), lines: [], actions: [] }; ui.nactions = d.actions || [];
    const own = e.owner >= 0 ? ui.st.teams[e.owner].faction.name : 'Neutral';
    const col = e.owner >= 0 ? cssColor(ui.st.teams[e.owner].faction.color) : '#e8e0b0';
    return `<div class="s1"><div class="por" style="--c:${col}"><span>◈</span></div><div class="sd"><div class="nm">${esc(d.name || prettyId(e.kind))}</div><div class="sxp">${esc(prettyId(e.kind))} · ${esc(own)}</div>${(d.lines || []).map((l) => `<div class="od">${esc(l)}</div>`).join('')}<div class="chips">${(d.actions || []).map((a, i) => `<button class="chip" data-act="nact" data-i="${i}">${esc(a.label || a.t)}${a.cost ? ' ' + costHtml(a.cost, ui.team) : ''}</button>`).join('')}</div></div></div>`;
  }
  function foreign(e) {
    if (e.isNeutral) return neutralInfo(e);
    if (e.kind === 'node') {
      const r = e.res || e.rtype;
      return `<div class="s1"><div class="por node"><span>${RES_ICONS[r] || '◈'}</span></div><div class="sd"><div class="nm">${esc(prettyId(e.rtype))}</div><div class="sxp">${RES_NAMES[r] || r}</div><div class="hpl">${fmtNum(e.amount || 0)} left</div></div></div>`;
    }
    const tm = ui.st.teams[e.team];
    const nm = e.kind === 'bld' ? bdef(e.type, tm).name : e.kind === 'unit' ? unitName(e) : (e.name || prettyId(e.type || e.kind));
    const col = tm ? cssColor(tm.faction.color) : '#aaaaaa';
    const f = e.maxHp ? e.hp / e.maxHp : 1;
    const own = tm ? `<span class="foe">${esc(tm.name)}</span>` : '<span class="foe">Neutral</span>';
    return `<div class="s1"><div class="por ${e.kind === 'bld' ? 'bld' : ''}" style="--c:${col}"><span>${e.kind === 'bld' ? bldGlyph(e.type) : roleGlyph(e.role)}</span></div><div class="sd"><div class="nm">${esc(nm)}</div><div class="sxp">${own}</div>${e.maxHp ? `<div class="hpl">${Math.ceil(e.hp)} / ${Math.round(e.maxHp)}</div>${bar(f, hpCol(f))}` : ''}${e.kind === 'unit' ? `<div class="st">${unitStats(e)}</div>` : ''}</div></div>`;
  }
  return {
    el,
    update(dt) {
      timer -= dt; if (timer > 0 && ui.ctl.selVer === lastVer) return; timer = 0.12; lastVer = ui.ctl.selVer;
      const ctl = ui.ctl, units = ctl.selUnits(), blds = ctl.selBlds();
      let html = '';
      const inf = ctl.info && ui.st.byId.get(ctl.info);
      if (inf && inf.isNeutral) html = neutralInfo(inf);
      else if (units.length === 1 && !blds.length) html = single(units[0]);
      else if (units.length) html = multi(units, blds);
      else if (blds.length) html = bld(blds[0], blds);
      else if (ctl.info) { const e = ui.st.byId.get(ctl.info); if (e) html = foreign(e); }
      el.classList.toggle('hidden', !html);
      if (html !== el._html) { el._html = html; el.innerHTML = html; }
    },
  };
}
