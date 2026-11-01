// FOGBOUND: DOMINION order issuing for controls.js: smart right-click, targeting modes, stances, rally, garrison, abilities.
import * as Buildings from '../buildings.js';

export function installOrders(ctl) {
  const { st } = ctl;
  const me = () => ctl.local;
  ctl.queueCmd = (cmd) => { ctl.cmds.push(cmd); };
  const bdef = (b) => (Buildings.def ? Buildings.def(b.type, st.teams[b.team]) : {}) || {};
  const hostileEnt = (e) => e && e.team !== undefined && e.team !== me() && e.team >= 0 && e.team < 4 && (e.kind === 'unit' || e.kind === 'bld') && (e.kind === 'bld' ? e.state !== 'ruin' : e.alive);
  const hostileNeutralUnit = (e) => e && e.kind === 'unit' && e.alive && e.team !== me();
  ctl.hostileEnt = (e) => hostileEnt(e) || hostileNeutralUnit(e);

  ctl.ping = (x, z, kind) => { ctl.pings.push({ x, z, kind: kind || 'move', t: 0, life: 1.1 }); if (ctl.pings.length > 12) ctl.pings.shift(); };
  ctl.issue = function issue(order, queue, ids) {
    ids = ids || ctl.selUnits().map((u) => u.id); if (!ids.length) return false;
    ctl.queueCmd({ t: 'order', ids, order, queue: !!queue }); return true;
  };
  ctl.centroid = () => { const us = ctl.selUnits(); if (!us.length) return null; return { x: us.reduce((a, u) => a + u.x, 0) / us.length, z: us.reduce((a, u) => a + u.z, 0) / us.length }; };
  ctl.setMode = function setMode(kind, data) { ctl.mode = kind ? { kind, data: data || {} } : null; ctl.selVer++; ctl.ui && ctl.ui.modeChanged && ctl.ui.modeChanged(ctl.mode); };
  ctl.cancelMode = function cancelMode() { if (ctl.mode) { ctl.setMode(null); if (ctl.build) ctl.build.cancel(); return true; } return false; };

  ctl.stop = () => { const ids = ctl.selUnits().map((u) => u.id); if (ids.length) ctl.queueCmd({ t: 'order', ids, order: { type: 'stop' }, queue: false }); };
  ctl.hold = () => ctl.issue({ type: 'hold' }, false);
  ctl.stance = (stance) => { const ids = ctl.selUnits().map((u) => u.id); if (ids.length) ctl.queueCmd({ t: 'setStance', ids, stance }); };
  ctl.run = false;

  // right-click on the world
  ctl.smartCommand = function smartCommand(mx, my, shift, ctrl, dbl) {
    const g = ctl.renderer.screenToGround(mx, my); const e = ctl.pickAt(mx, my);
    const units = ctl.selUnits(), blds = ctl.selBlds();
    if (!units.length && blds.length) { // production buildings: rally point
      const p = g || (e && { x: e.x, z: e.z }); if (!p) return;
      for (const b of blds) if (bdef(b).trains && bdef(b).trains.length || (bdef(b).research || []).length === 0) ctl.queueCmd({ t: 'rally', bld: b.id, x: p.x, z: p.z, target: e && e.kind !== 'bld' ? e.id : undefined });
      ctl.ping(p.x, p.z, 'rally'); return;
    }
    if (!units.length) return;
    const ids = units.map((u) => u.id), workers = units.filter((u) => u.role === 'worker'), fighters = units.filter((u) => u.role !== 'worker');
    if (e && e.kind === 'node') {
      if (workers.length) { ctl.issue({ type: 'gather', node: e.id }, shift, workers.map((u) => u.id)); const rest = fighters.map((u) => u.id); if (rest.length) ctl.issue({ type: 'move', x: e.x, z: e.z }, shift, rest); ctl.ping(e.x, e.z, 'gather'); return; }
    }
    if (e && e.kind === 'bld' && e.team === me()) {
      const d = bdef(e);
      if (e.state === 'building' && workers.length) { ctl.issue({ type: 'build', bld: e.id }, shift, workers.map((u) => u.id)); ctl.ping(e.x, e.z, 'build'); return; }
      if (e.hp < e.maxHp && workers.length && e.state !== 'building') { ctl.queueCmd({ t: 'repair', ids: workers.map((u) => u.id), bld: e.id, queue: shift }); ctl.ping(e.x, e.z, 'build'); return; }
      if (d.garrison > 0 && fighters.some((u) => u.role !== 'siege')) { ctl.queueCmd({ t: 'garrison', ids: fighters.filter((u) => u.role !== 'siege').map((u) => u.id), bld: e.id }); ctl.ping(e.x, e.z, 'garrison'); return; }
    }
    if (e && ctl.hostileEnt(e)) { ctl.issue({ type: 'attack', target: e.id }, shift, ids); ctl.ping(e.x, e.z, 'attack'); return; }
    if (e && e.isNeutral && e.owner !== me()) { ctl.issue({ type: 'move', x: e.x, z: e.z, interact: e.id }, shift, ids); ctl.ping(e.x, e.z, 'move'); return; }
    if (!g) return;
    if (ctrl && units.some((u) => u.role === 'siege')) { ctl.issue({ type: 'attack', x: g.x, z: g.z, ground: true }, shift, units.filter((u) => u.role === 'siege').map((u) => u.id)); ctl.ping(g.x, g.z, 'attack'); const o = units.filter((u) => u.role !== 'siege'); if (o.length) ctl.issue({ type: 'amove', x: g.x, z: g.z }, shift, o.map((u) => u.id)); return; }
    ctl.issue(dbl ? { type: 'move', x: g.x, z: g.z, run: true } : { type: 'move', x: g.x, z: g.z }, shift, ids);
    ctl.ping(g.x, g.z, 'move');
  };

  // left-click while a targeting mode is armed. returns true if consumed (mode usually ends unless shift)
  ctl.targetClick = function targetClick(mx, my, shift) {
    const m = ctl.mode; if (!m) return false;
    const g = ctl.renderer.screenToGround(mx, my); const e = ctl.pickAt(mx, my);
    const p = g || (e && { x: e.x, z: e.z }); if (!p) return true;
    const k = m.kind; let keep = false;
    if (k === 'amove') { const t = e && ctl.hostileEnt(e) ? e : null; ctl.issue(t ? { type: 'attack', target: t.id } : { type: 'amove', x: p.x, z: p.z }, shift); ctl.ping(p.x, p.z, 'attack'); keep = shift; }
    else if (k === 'move') { ctl.issue({ type: 'move', x: p.x, z: p.z }, shift); ctl.ping(p.x, p.z, 'move'); keep = shift; }
    else if (k === 'patrol') { const c = ctl.centroid(); if (c) ctl.issue({ type: 'patrol', x: p.x, z: p.z, x0: c.x, z0: c.z }, shift); ctl.ping(p.x, p.z, 'move'); }
    else if (k === 'guard') { const t = e && e.team === me() ? e : null; ctl.issue(t ? { type: 'guard', target: t.id } : { type: 'guard', x: p.x, z: p.z }, shift); ctl.ping(p.x, p.z, 'move'); }
    else if (k === 'attackground') { ctl.issue({ type: 'attack', x: p.x, z: p.z, ground: true }, shift); ctl.ping(p.x, p.z, 'attack'); }
    else if (k === 'rally') { for (const b of ctl.selBlds()) ctl.queueCmd({ t: 'rally', bld: b.id, x: p.x, z: p.z, target: e && e.kind !== 'bld' ? e.id : undefined }); ctl.ping(p.x, p.z, 'rally'); }
    else if (k === 'ability') { const d = m.data; ctl.queueCmd({ t: 'ability', ids: d.ids || ctl.selUnits().filter((u) => (u.abilities || []).some((a) => a.id === d.id)).map((u) => u.id), id: d.id, x: p.x, z: p.z, target: e ? e.id : undefined }); ctl.ping(p.x, p.z, 'cast'); }
    else if (k === 'cast') { const d = m.data; ctl.queueCmd({ t: 'cast', caster: d.caster, spell: d.spell, x: p.x, z: p.z, target: e ? e.id : undefined }); ctl.ping(p.x, p.z, 'cast'); }
    else if (k === 'repair') { if (e && e.kind === 'bld' && e.team === me()) { ctl.queueCmd({ t: 'repair', ids: ctl.selUnits().filter((u) => u.role === 'worker').map((u) => u.id), bld: e.id, queue: shift }); } keep = shift; }
    else if (k === 'demolish') { if (e && e.kind === 'bld' && e.team === me() && e.type !== 'keep') { ctl.queueCmd({ t: 'demolish', id: e.id }); ctl.ui && ctl.ui.toast && ctl.ui.toast('Demolished ' + (bdef(e).name || e.type)); } keep = true; }
    else return false;
    if (!keep) ctl.setMode(null);
    return true;
  };
}
