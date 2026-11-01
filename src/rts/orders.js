// UNITS lane: orders. Per-unit order execution (run) and the command handler ({t:'order'|'setStance'|'garrison'|'ungarrison'|'ability'}).
// Orders: move amove attack patrol hold stop guard follow garrison ability; gather/return/build/repair belong to Econ, cast to Magic (we only store them).
import * as Target from './orders_target.js';
import { stepMove } from './units_move.js';
import { gap } from './units_grid.js';
import { def as bdef } from './bdata.js';
import * as Abil from './combat_abilities.js';

const FOREIGN = new Set(['gather', 'return', 'build', 'repair', 'cast']);
const MINE = new Set(['move', 'amove', 'attack', 'patrol', 'hold', 'stop', 'guard', 'follow', 'garrison', 'ability']);
export { onHurt } from './orders_target.js';
const FORM = new Set(['move', 'amove', 'patrol']);

function next(u) { u.orders.shift(); u.order = u.orders[0] || null; u.tgt = 0; u.anchor = null; u.path = null; u.blockedBy = 0; }
export function clear(u) { u.orders.length = 0; u.order = null; u.tgt = 0; u.anchor = null; u.path = null; u.moving = false; }

export function run(st, u, dt) {
  u.moving = false;
  if (u.garrison || u.siegeCtl) return;                  // siege units with a siege target are driven by the Siege lane
  if (u.stun > 0) return;
  if (u.neutral) return Target.neutralAI(st, u, dt);
  u.anchored = false;
  const o = u.order;
  if (!o) return idle(st, u, dt);
  switch (o.type) {
    case 'move': if (stepMove(st, u, o.x, o.z, dt, { speed: o.spd })) next(u); u.tgt = 0; return;
    case 'amove':
      if (Target.fight(st, u, dt, u.vision, 2, null, 0)) return;
      if (stepMove(st, u, o.x, o.z, dt, { speed: o.spd })) next(u);
      return;
    case 'attack': {
      const t = st.byId.get(o.target);
      if (!Target.validT(t) || t.team === u.team || !Target.canHit(u, t)) return next(u);
      u.tgt = t.id; Target.engage(st, u, t, dt); return;
    }
    case 'patrol':
      if (o.x0 == null) { o.x0 = u.x; o.z0 = u.z; }
      if (Target.fight(st, u, dt, u.vision, 1, null, 0)) return;
      if (stepMove(st, u, o.leg ? o.x0 : o.x, o.leg ? o.z0 : o.z, dt, { arrive: 1.2 })) o.leg = o.leg ? 0 : 1;
      return;
    case 'hold': return hold(st, u, dt);
    case 'stop': return clear(u);
    case 'guard': {
      const g = st.byId.get(o.target);
      if (!g || (g.kind === 'unit' ? !g.alive : g.hp <= 0)) return next(u);
      if (Target.fight(st, u, dt, u.vision, 1, g, 16)) return;
      if (Math.hypot(u.x - g.x, u.z - g.z) > 7) stepMove(st, u, g.x, g.z, dt, { arrive: 4 });
      return;
    }
    case 'follow': {
      const g = st.byId.get(o.target);
      if (!g || (g.kind === 'unit' && !g.alive)) return next(u);
      if (Math.hypot(u.x - g.x, u.z - g.z) > 3.2) stepMove(st, u, g.x, g.z, dt, { arrive: 2.6, speed: g.speed ? g.speed * 1.05 : undefined });
      return;
    }
    case 'garrison': return garrisonOrder(st, u, o, dt);
    case 'ability': return Abil.orderStep(st, u, o, dt, () => next(u));
    default:
      if (FOREIGN.has(o.type)) { if (!o._seen) o._seen = st.t; else if (st.t - o._seen > 90 && u.role !== 'worker') next(u); return; }
      next(u);
  }
}
function hold(st, u, dt) {
  u.anchored = true;
  const r = Target.effRange(u) + 0.5;
  let t = Target.curTarget(st, u);
  if (t && gap(u, t) > Target.effRange(u)) { t = null; u.tgt = 0; }
  if (!t && ((st.tick + u.id) & 3) === 0) { const n = Target.acquire(st, u, r + u.r + 1, 1); if (n && gap(u, n) <= Target.effRange(u)) t = n; }
  if (t) { u.tgt = t.id; u.face = Math.atan2(t.z - u.z, t.x - u.x); } else u.tgt = 0;
}
function idle(st, u, dt) {
  if (u.role === 'worker') return;                       // Econ drives idle workers
  const s = u.stance;
  if (s === 'hold') return hold(st, u, dt);
  if (!u.anchor) u.anchor = { x: u.x, z: u.z };
  const hurt = u.hurtT && st.t - u.hurtT < 3;
  const R = s === 'aggressive' ? u.vision : Target.effRange(u) + 5;
  const leash = s === 'aggressive' ? 22 : 9;
  if (Target.fight(st, u, dt, hurt ? Math.max(R, 26) : R, 1, u.anchor, hurt ? 40 : leash)) return;
  if (Math.hypot(u.x - u.anchor.x, u.z - u.anchor.z) > 3.5) stepMove(st, u, u.anchor.x, u.anchor.z, dt, { arrive: 1.5 });
}
// ---------------------------------------------------------------- garrison
const capOf = (b) => (b.garrisonCap != null ? b.garrisonCap : bdef(b.type, b.team).garrison || 0);
function garrisonOrder(st, u, o, dt) {
  const b = st.byId.get(o.bld);
  if (!b || b.kind !== 'bld' || b.team !== u.team || b.hp <= 0 || b.state === 'ruin' || b.state === 'building') return next(u);
  if (gap(u, b) > 1.6) { stepMove(st, u, b.x, b.z, dt, { arrive: 0.3 }); return; }
  if (!b.garrison) b.garrison = [];
  if (b.garrison.length >= capOf(b)) return next(u);
  b.garrison.push(u.id); u.garrison = b.id; u.x = b.x; u.z = b.z; u.tgt = 0; u.moving = false;
  next(u);
}
export function eject(st, u) {
  const b = st.byId.get(u.garrison);
  u.garrison = 0;
  if (b) {
    if (b.garrison) b.garrison = b.garrison.filter((i) => i !== u.id);
    const r = Math.max(b.w || 4, b.d || 4) / 2 + 1.5, a0 = b.rally ? Math.atan2(b.rally.z - b.z, b.rally.x - b.x) : Math.PI / 2;
    for (let i = 0; i < 10; i++) {
      const a = a0 + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.5, x = b.x + Math.cos(a) * r, z = b.z + Math.sin(a) * r;
      if (st.world.walkable(x, z)) { u.x = x; u.z = z; break; }
    }
    u.y = st.world.heightAt(u.x, u.z);
  }
}
export function onDeath(st, u, killer) { Abil.onDeath(st, u, killer); }

// ---------------------------------------------------------------- commands
const mine = (st, teamId, ids) => (ids || []).map((i) => st.byId.get(i)).filter((u) => u && u.kind === 'unit' && u.alive && u.team === teamId);
function formation(st, us, x, z) {
  const n = us.length, rmax = us.reduce((m, u) => Math.max(m, u.r), 0.5), sp = rmax * 2.4 + 0.5, cols = Math.ceil(Math.sqrt(n * 1.3));
  const slots = [];
  for (let i = 0; i < n; i++) slots.push({ x: (i % cols - (cols - 1) / 2) * sp, z: (Math.floor(i / cols) - (Math.ceil(n / cols) - 1) / 2) * sp });
  slots.sort((a, b) => a.x * a.x + a.z * a.z - b.x * b.x - b.z * b.z);
  const order = us.slice().sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
  const res = new Map();
  order.forEach((u, i) => { const px = x + slots[i].x, pz = z + slots[i].z; res.set(u.id, st.world.walkable(px, pz) || u.fly ? { x: px, z: pz } : { x, z }); });
  return res;
}
export function command(st, teamId, cmd) {
  switch (cmd.t) {
    case 'order': {
      const us = mine(st, teamId, cmd.ids), o = cmd.order;
      if (!o || !us.length) return true;
      if ((FORM.has(o.type)) && !(Number.isFinite(o.x) && Number.isFinite(o.z))) return true;
      if (o.type === 'attack' && o.target == null) return true;
      const fm = FORM.has(o.type) && us.length > 1 && o.formation !== false ? formation(st, us, o.x, o.z) : null;
      const spd = o.type === 'move' && cmd.sync ? Math.min(...us.map((u) => u.speed0 || u.speed)) : undefined;
      for (const u of us) {
        const q = Object.assign({}, o);
        if (fm) { const p = fm.get(u.id); q.x = p.x; q.z = p.z; }
        if (spd) q.spd = spd;
        if (u.garrison && q.type !== 'garrison') eject(st, u);
        if (q.type === 'stop') { clear(u); continue; }
        if (cmd.queue && u.order) u.orders.push(q); else { u.orders = [q]; u.tgt = 0; u.anchor = null; u.path = null; u.blockedBy = 0; }
        u.order = u.orders[0];
      }
      return true;
    }
    case 'setStance': for (const u of mine(st, teamId, cmd.ids)) if (['aggressive', 'defensive', 'hold'].includes(cmd.stance)) u.stance = cmd.stance; return true;
    case 'garrison': {
      for (const u of mine(st, teamId, cmd.ids)) { const q = { type: 'garrison', bld: cmd.bld }; if (cmd.queue && u.order) u.orders.push(q); else { u.orders = [q]; u.path = null; } u.order = u.orders[0]; }
      return true;
    }
    case 'ungarrison': {
      const b = st.byId.get(cmd.bld);
      if (!b || b.team !== teamId || !b.garrison) return true;
      const want = cmd.ids ? new Set(cmd.ids) : null;
      for (const id of b.garrison.slice()) { if (want && !want.has(id)) continue; const u = st.byId.get(id); if (u && u.alive) eject(st, u); else b.garrison = b.garrison.filter((i) => i !== id); }
      return true;
    }
    case 'ability': {
      for (const u of mine(st, teamId, cmd.ids)) {
        if (!u.abilities.some((a) => a.id === cmd.id)) continue;
        const q = { type: 'ability', id: cmd.id, x: cmd.x, z: cmd.z, target: cmd.target };
        if (cmd.queue && u.order) u.orders.push(q); else u.orders = [q];
        u.order = u.orders[0];
      }
      return true;
    }
    default: return false;
  }
}
