// ECON lane: worker behaviour (gather -> carry -> deposit loop, build, repair, flee, idle detection).
// Orders handled here (u.role==='worker' only): {type:'gather',node} {type:'return'} {type:'build',bld} {type:'repair',bld}.
// Units.update must skip workers whose order type is one of those four (see WORKER_ORDERS).
import * as Units from './units.js';
import * as Buildings from './buildings.js';
import { emit } from './core.js';
import { NODE_TYPES, FARM, FARM_RE, ECON, STORE_PATTERNS } from './econ_data.js';
import { findNode, nodeUsable } from './econ_nodes.js';

export const WORKER_ORDERS = ['gather', 'return', 'build', 'repair'];
const near = (a, x, z) => Math.hypot(a.x - x, a.z - z);
export const reachOf = (b) => Math.hypot(b.w || 3, b.d || 3) / 2 + 1.4; // circumscribed circle: rotated footprints never trap the worker on a corner

// ---- helpers: movement, storage, building progress (with fallbacks while sibling lanes are stubs)
export function moveTo(st, u, x, z, dt) {
  if (typeof Units.stepMove === 'function') { Units.stepMove(st, u, x, z, dt); return; }
  const dx = x - u.x, dz = z - u.z, d = Math.hypot(dx, dz);
  if (d < 0.05) return;
  const s = Math.min(d, (u.speed || ECON.workerSpeedFallback) * dt), a0 = Math.atan2(dz, dx);
  for (const da of [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.3, -2.3]) { // fallback: slide around obstacles
    const a = a0 + da, nx = u.x + Math.cos(a) * s, nz = u.z + Math.sin(a) * s;
    if (st.world.walkable(nx, nz)) { u.x = nx; u.z = nz; u.y = st.world.heightAt(nx, nz); u.face = a; return; }
  }
}
export function storeAccepts(b, res) {
  if (!b || b.team == null || b.state === 'ruin' || b.state === 'building' || b.hp <= 0) return false;
  const d = Buildings.def ? Buildings.def(b.type) : null;
  const list = (d && d.store) || b.store;
  if (list) return list === true || list.includes(res);
  for (const [re, l] of STORE_PATTERNS) if (re.test(b.type)) return l.includes(res);
  return false;
}
export function storageFor(st, team, res, x, z) {
  if (typeof Buildings.storageFor === 'function') {
    const b = Buildings.storageFor(st, team, res, x, z);
    if (b) return b;
  }
  let best = null, bd = 1e9;
  for (const b of st.blds) {
    if (b.team !== team || !storeAccepts(b, res)) continue;
    const d = near(b, x, z); if (d < bd) { bd = d; best = b; }
  }
  const t = st.teams[team];
  return best || (t.keep && t.keep.state !== 'ruin' ? t.keep : null);
}
function addProgress(st, b, sec) {
  if (typeof Buildings.addProgress === 'function') return Buildings.addProgress(st, b, sec);
  b.progress = Math.min(1, (b.progress || 0) + sec / (b.buildT || 25));
  if (b.progress >= 1) { b.state = 'ready'; emit(st, { type: 'built', id: b.id, x: b.x, z: b.z }); }
}
function addRepair(st, b, hp) {
  if (typeof Buildings.addRepair === 'function') return Buildings.addRepair(st, b, hp);
  b.hp = Math.min(b.maxHp, b.hp + hp);
}
export const isFarm = (s) => s && s.kind === 'bld' && FARM_RE.test(s.type) && s.state === 'ready';
const srcInfo = (s) => (s.kind === 'bld' ? { res: FARM.res, rate: FARM.rate, cap: FARM.cap, slots: FARM.slots } : NODE_TYPES[s.rtype]);

// ---- order plumbing
function done(u) { u.orders.shift(); u.order = u.orders[0] || null; u.w = null; }
function carryAmt(u) { return u.carry ? u.carry.amt : 0; }
function autoGather(st, u, b) {
  if (u.orders.length) return;
  let list = null;
  if (isFarm(b)) { u.orders.push({ type: 'gather', node: b.id }); u.order = u.orders[0]; return; }
  for (const [re, l] of STORE_PATTERNS) if (re.test(b.type)) { list = l; break; }
  if (!list || list.length > 3) return;
  for (const res of list) {
    const n = findNode(st, b.x, b.z, res, { maxDist: 45 });
    if (n) { u.orders.push({ type: 'gather', node: n.id }); u.order = u.orders[0]; return; }
  }
}
function workerStore(st, u, t, res) {
  const w = u.w;
  let b = w.store ? st.byId.get(w.store) : null;
  if (!storeAccepts(b, res) || b.team !== u.team) { b = storageFor(st, u.team, res, u.x, u.z); w.store = b ? b.id : 0; }
  return b;
}
function deposit(st, u, t) {
  const c = u.carry; if (!c) return;
  const amt = Math.round(c.amt);
  if (amt > 0) {
    t.res[c.res] += amt; t.stats.gathered[c.res] += amt;
    if (t.econ) t.econ.noteIncome(c.res, amt);
    emit(st, { type: 'deposit', team: u.team, res: c.res, amt, unit: u.id, x: u.x, z: u.z });
  }
  u.carry = null;
}
// ---- the per-worker update. crew = Map(bldId -> n) of workers building/repairing this tick
export function updateWorker(st, u, t, dt, crew) {
  if ((u.stun || 0) > 0) return;
  const o = u.order;
  if (!u.w || u.w.o !== o) u.w = o ? { o, s: 'go', t: 0, store: 0, lt: st.t, lx: u.x, lz: u.z, stuck: 0, last: u.w && u.w.last } : null;
  if (!o || !WORKER_ORDERS.includes(o.type)) return;
  const w = u.w;
  // flee from enemy fighters
  if (w.flee > st.t) { const k = t.keep; if (k) moveTo(st, u, k.x + 4, k.z + 4, dt); return; }
  if (((st.tick + u.id) & 15) === 0) {
    for (const e of st.ents) {
      if (!e.alive || e.team === u.team || e.role === 'worker' || e.role === 'beast' || (!st.teams[e.team] && e.tgt !== u.id) || Math.abs(e.x - u.x) > ECON.fleeRange || Math.abs(e.z - u.z) > ECON.fleeRange) continue;
      if (near(e, u.x, u.z) < ECON.fleeRange) { w.flee = st.t + ECON.fleeTime; if (w.s === 'work') w.s = 'go'; const nd = o.type === 'gather' && st.byId.get(o.node); if (nd && nd.kind === 'node') nd.dangerT = st.t + 45; return; }
    }
  }
  // stuck detection (movement states only)
  if (w.ls !== w.s) { w.ls = w.s; w.stuck = 0; w.lt = st.t; w.lx = u.x; w.lz = u.z; }
  if (w.s !== 'work' && st.t - w.lt >= 3) {
    w.stuck = Math.hypot(u.x - w.lx, u.z - w.lz) < 0.4 ? w.stuck + 1 : 0; w.lt = st.t; w.lx = u.x; w.lz = u.z;
    if (w.stuck === 1) { u.path = null; u.stuck = 2; }
    if (w.stuck >= 3) { done(u); return; }
  }
  if (o.type === 'gather') return gatherStep(st, u, t, dt, o, w);
  if (o.type === 'return') return returnStep(st, u, t, dt, o, w);
  return buildStep(st, u, t, dt, o, w, crew);
}
function gatherStep(st, u, t, dt, o, w) {
  let src = st.byId.get(o.node);
  const farm = isFarm(src);
  if (!src || (!farm && !nodeUsable(src))) {
    // source gone: finish carrying, then move to the nearest like node
    const res = src && src.res || (u.carry && u.carry.res) || 'timber';
    const alt = findNode(st, u.x, u.z, res, { maxDist: 60 });
    if (alt && carryAmt(u) < 1) { o.node = alt.id; src = alt; w.s = 'go'; }
    else if (carryAmt(u) >= 1) { w.s = 'store'; }
    else { done(u); return; }
  }
  const info = src && srcInfo(src);
  const bonus = 1 + 0.15 * (t.up.gather || 0), cap = (info ? info.cap : 15) + 3 * (t.up.carry || 0);
  if (w.s === 'go') {
    if (u.carry && (u.carry.res !== info.res || u.carry.amt >= cap)) { w.s = 'store'; return; }
    const reach = (src.r || 3) + (src.kind === 'bld' ? reachOf(src) - (src.r || 0) : 1.2);
    if (near(src, u.x, u.z) > reach) { moveTo(st, u, src.x, src.z, dt); return; }
    if (!farm && src.dangerT > st.t) { const alt = findNode(st, u.x, u.z, src.res, { maxDist: 70 }); if (alt && alt !== src) { o.node = alt.id; return; } }
    if (!farm && src.workers >= src.slots) {
      const alt = findNode(st, u.x, u.z, src.res, { maxDist: 40 });
      if (alt && alt !== src) { o.node = alt.id; return; }
    }
    w.s = 'work'; w.t = 0; if (!u.carry) u.carry = { res: info.res, amt: 0 };
    if (!farm) src.workers++;
  }
  if (w.s === 'work') {
    const take = Math.min(info.rate * bonus * dt, farm || src.infinite ? 1e9 : src.amount, cap - u.carry.amt);
    u.carry.amt += take; if (!farm && !src.infinite) src.amount -= take;
    u.face += 0; w.last = src.id;
    if (u.carry.amt >= cap - 0.01 || (!farm && src.amount <= 0.5)) {
      emit(st, { type: 'gather', unit: u.id, res: info.res, amt: Math.round(u.carry.amt), node: src.id, x: u.x, z: u.z });
      w.s = 'store';
    }
    return;
  }
  if (w.s === 'store') {
    const c = u.carry;
    if (!c || c.amt < 1) { u.carry = null; w.s = 'go'; return; }
    const b = workerStore(st, u, t, c.res);
    if (!b) { done(u); return; }
    if (near(b, u.x, u.z) > reachOf(b)) { moveTo(st, u, b.x, b.z, dt); return; }
    deposit(st, u, t); w.s = 'go';
  }
}
function returnStep(st, u, t, dt, o, w) {
  const c = u.carry;
  if (c && c.amt >= 1) {
    const b = workerStore(st, u, t, c.res);
    if (!b) { done(u); return; }
    if (near(b, u.x, u.z) > reachOf(b)) { moveTo(st, u, b.x, b.z, dt); return; }
    deposit(st, u, t);
  }
  const last = w.last ? st.byId.get(w.last) : null;
  const rest = u.orders.length > 1;
  done(u);
  if (!rest && last && (last.kind === 'node' ? nodeUsable(last) : isFarm(last))) { u.orders = [{ type: 'gather', node: last.id }]; u.order = u.orders[0]; }
}
function buildStep(st, u, t, dt, o, w, crew) {
  const b = st.byId.get(o.bld);
  const building = o.type === 'build';
  if (!b || b.team !== u.team || b.state === 'ruin' || (building ? b.state !== 'building' : b.hp >= b.maxHp - 0.5 || b.state === 'building')) {
    done(u); if (b && building && b.state !== 'ruin') autoGather(st, u, b); return;
  }
  if (near(b, u.x, u.z) > reachOf(b) + 0.8) { w.s = 'go'; moveTo(st, u, b.x, b.z, dt); return; }
  w.s = 'work';
  const n = Math.max(1, crew.get(b.id) || 1);
  if (building) addProgress(st, b, dt * Math.pow(n, ECON.buildExp - 1));
  else {
    const hp = Math.min(ECON.repairHpPerSec * dt * Math.pow(n, ECON.buildExp - 1), b.maxHp - b.hp), cost = hp * ECON.repairTimberPerHp;
    if (t.res.timber < cost) { done(u); emit(st, { type: 'msg', team: u.team, text: 'Not enough Rotwood to repair', kind: 'warn' }); return; }
    t.res.timber -= cost; addRepair(st, b, hp);
  }
}
