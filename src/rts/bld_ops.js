// FOGBOUND: DOMINION building runtime (BUILDINGS lane): commands, per-tick update, garrison, auras, burning, destruction, demolish.
import { emit, killBld } from './core.js';
import * as Econ from './econ.js';
import * as Buildings from './buildings.js';
import * as Prod from './production.js';
import * as Terr from './territory.js';
import * as Tech from './tech.js';
import { def } from './bdata.js';

const RUIN_TIME = 60;
const msg = (st, team, text) => emit(st, { type: 'msg', team, text, kind: 'warn' });
const own = (st, teamId, id) => { const b = st.byId.get(id); return b && b.kind === 'bld' && b.team === teamId && b.state !== 'ruin' ? b : null; };

export function command(st, teamId, cmd) {
  switch (cmd.t) {
    case 'build': {
      const r = Buildings.place(st, teamId, cmd.type, cmd.x, cmd.z, cmd.rot || 0, cmd.workers, { queue: cmd.queue });
      if (typeof r === 'string') msg(st, teamId, r);
      return true;
    }
    case 'demolish': { const b = own(st, teamId, cmd.id); if (b) demolish(st, teamId, b); return true; }
    case 'train': { const b = own(st, teamId, cmd.bld); if (!b) return true; const r = Prod.queueTrain(st, teamId, b, cmd.unit, cmd.n || 1); if (r) msg(st, teamId, r); return true; }
    case 'cancelTrain': { const b = own(st, teamId, cmd.bld); if (b) Prod.cancel(st, b, cmd.idx); return true; }
    case 'rally': {
      const b = own(st, teamId, cmd.bld);
      if (b) Prod.setRally(b, cmd.x, cmd.z, cmd.node ? { node: cmd.node } : null);
      return true;
    }
    case 'research': {
      const b = own(st, teamId, cmd.bld);
      if (!b) return true;
      if (!Tech.TECHS[cmd.tech]) return false; // maybe a spell (MAGIC lane)
      const r = Prod.queueResearch(st, teamId, b, cmd.tech); if (r) msg(st, teamId, r);
      return true;
    }
    case 'upgrade': { const b = own(st, teamId, cmd.bld); if (!b) return true; const r = Prod.queueUpgrade(st, teamId, b, cmd.upgrade); if (r) msg(st, teamId, r); return true; }
    case 'garrison': {
      const b = own(st, teamId, cmd.bld);
      if (!b) return true;
      for (const id of cmd.ids || []) {
        const u = st.byId.get(id);
        if (!u || !u.alive || u.team !== teamId || u.garrison) continue;
        if (Math.hypot(u.x - b.x, u.z - b.z) <= Math.max(b.w, b.d) / 2 + 2.5) enter(st, u, b);
        else { const o = { type: 'garrison', bld: b.id }; u.orders = cmd.queue ? u.orders.concat(o) : [o]; u.order = u.orders[0]; }
      }
      return true;
    }
    case 'ungarrison': {
      const b = own(st, teamId, cmd.bld);
      if (!b) return true;
      for (const id of (cmd.ids && cmd.ids.length ? cmd.ids : b.garrison.slice())) { const u = st.byId.get(id); if (u) leave(st, u, b); }
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------- garrison
export function enter(st, u, b) {
  if (!b || !Prod.operational(b) || u.garrison || b.garrison.length >= (b.garrisonMax || 0)) return false;
  b.garrison.push(u.id); u.garrison = b.id; u.x = b.x; u.z = b.z; u.orders = []; u.order = null;
  emit(st, { type: 'garrison', unit: u.id, bld: b.id });
  return true;
}
export function leave(st, u, b) {
  const i = b.garrison.indexOf(u.id);
  if (i >= 0) b.garrison.splice(i, 1);
  if (u.garrison === b.id) {
    u.garrison = 0;
    const p = Prod.exitPoint(st, b); u.x = p.x; u.z = p.z; u.y = st.world.heightAt(p.x, p.z);
    emit(st, { type: 'ungarrison', unit: u.id, bld: b.id });
  }
}

// ---------------------------------------------------------------- demolish / destroy
export function demolish(st, teamId, b) {
  if (b.type === 'keep' || b.state === 'ruin') return false;
  const t = st.teams[teamId];
  Econ.refund(t, b.paid || def(b.type).cost, 0.5);
  b.demolished = true;
  killBld(st, b, null); // -> onDestroyed
  return true;
}
export function onDestroyed(st, b, killer) {
  const t = st.teams[b.team], unfinished = b.progress < 1;
  for (const id of b.garrison.slice()) { const u = st.byId.get(id); if (u && u.alive) leave(st, u, b); }
  if (t) { for (const e of b.queue) Econ.refund(t, e.cost, 1); }
  b.queue.length = 0;
  b.state = 'ruin'; b.ruinT = b.type === 'keep' ? Infinity : st.t + (b.demolished ? 2 : RUIN_TIME); b.collapsed = unfinished; b.hp = 0;
  if (!b.demolished) emit(st, { type: 'collapse', id: b.id, x: b.x, z: b.z, team: b.team, unfinished });
  st._bd = true; Terr.markDirty(st);
}

// ---------------------------------------------------------------- per tick
function recalcTeam(st, team) {
  let pop = 0;
  for (const b of st.blds) if (b.team === team.id && Prod.operational(b)) pop += b.pop || 0;
  team.popMax = Math.max(8, Math.min(pop, team.cap.mil + team.cap.work));
  team.age = team.age || 1;
}
export function update(st, dt) {
  Terr.update(st);
  if (st._bd) { st._bd = false; for (const t of st.teams) recalcTeam(st, t); }
  Prod.update(st, dt);
  const tk = st.tick;
  if (tk % 5 === 0) garrisonScan(st);
  if (tk % 15 === 0) { auras(st, 0.5); burn(st, 0.5); souls(st, 0.5); }
  if (tk % 30 === 0) cleanup(st);
}
function garrisonScan(st) {
  for (const u of st.ents) {
    const o = u.alive && !u.garrison ? u.order : null;
    if (!o || o.type !== 'garrison') continue;
    const b = st.byId.get(o.bld);
    if (!b || b.state === 'ruin') { u.orders.shift(); u.order = u.orders[0] || null; continue; }
    if (Math.hypot(u.x - b.x, u.z - b.z) <= Math.max(b.w, b.d) / 2 + 2.5) {
      u.orders.shift(); u.order = u.orders[0] || null;
      if (!enter(st, u, b)) msg(st, u.team, 'Garrison full');
    }
  }
}
function auras(st, step) {
  const rageB = [], healB = [];
  for (const b of st.blds) {
    if (!Prod.operational(b)) continue;
    const d = def(b.type);
    if (d.aura) rageB.push([b, d.aura]);
    if (d.provides && d.provides.heal) healB.push([b, d.provides]);
  }
  if (!rageB.length && !healB.length) return;
  for (const u of st.ents) {
    if (!u.alive) continue;
    u.auraDmg = 0; u.auraSpeed = 0;
    for (const [b, a] of rageB) {
      if (b.team !== u.team || u.role === 'worker') continue;
      if ((u.x - b.x) ** 2 + (u.z - b.z) ** 2 <= a.radius * a.radius) { u.auraDmg = Math.max(u.auraDmg, a.dmg || 0); u.auraSpeed = Math.max(u.auraSpeed, a.speed || 0); }
    }
    if (u.hp >= u.maxHp) continue;
    for (const [b, p] of healB) {
      if (b.team !== u.team) continue;
      const r = p.healRadius || 14, inside = u.garrison === b.id;
      if (inside || (u.x - b.x) ** 2 + (u.z - b.z) ** 2 <= r * r) {
        u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.02 * step * (1 + Tech.mod(st.teams[b.team], 'heal')) * (inside ? 2 : 1) * 2);
        break;
      }
    }
  }
}
function burn(st, step) {
  const rain = st.weather && (st.weather.kind === 'rain' || st.weather.kind === 'storm');
  for (const b of st.blds) {
    if (b.state === 'ruin' || b.state === 'building' || b.wall || b.turret || def(b.type).burns === false) continue;
    if (b.state !== 'burning') { if (b.hp < b.maxHp * 0.3 && b.hp > 0) { b.state = 'burning'; emit(st, { type: 'fire', x: b.x, z: b.z, id: b.id }); } continue; }
    if (b.hp > b.maxHp * 0.4) { b.state = 'ready'; continue; }
    b.hp -= b.maxHp * 0.006 * step * (rain ? 0.3 : 1);
    if (b.hp <= 0) killBld(st, b, null);
  }
}
function souls(st, step) {
  for (const b of st.blds) {
    const p = Prod.operational(b) ? def(b.type).provides : null;
    if (!p || !p.souls) continue;
    const t = st.teams[b.team];
    t._soulAcc = (t._soulAcc || 0) + p.souls * step * (b.type === 'graveyard' ? 1 : 1);
    if (t._soulAcc >= 1) { const n = Math.floor(t._soulAcc); t.res.souls += n; t._soulAcc -= n; }
  }
}
function cleanup(st) {
  let any = false;
  for (const b of st.blds) if (b.state === 'ruin' && b.ruinT != null && st.t >= b.ruinT) { b.gone = true; any = true; }
  if (!any) return;
  st.blds = st.blds.filter((b) => { if (b.gone) { st.byId.delete(b.id); return false; } return true; });
  for (const t of st.teams) if (t.keep && t.keep.gone) t.keep = null;
}
