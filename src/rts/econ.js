// ECON lane facade: dark economy (nodes, workers, storage, upkeep/starvation, market, souls, income rates).
// Files: econ_data.js (tuning), econ_nodes.js (placement/regrowth), econ_workers.js (worker AI), econ_rules.js (trade/sacrifice/souls).
import { RES, SIM_DT } from './consts.js';
import { killEnt, emit } from './core.js';
import * as Units from './units.js';
import { ECON, SOULS, FARM, FARM_RE, SOUL_HARVEST_RE } from './econ_data.js';
import { populateNodes as populate, updateNodes, findNode } from './econ_nodes.js';
import { updateWorker, WORKER_ORDERS, storageFor, isFarm } from './econ_workers.js';
import { trade, sacrifice, soulsOnDeath, soulValue, tickMarket, prices } from './econ_rules.js';

export { findNode, storageFor, WORKER_ORDERS, trade, sacrifice, soulValue, prices };
export function populateNodes(st) { return populate(st); }

// ---- costs
export function canAfford(team, cost) { if (!cost) return true; for (const r of RES) if ((team.res[r] || 0) < (cost[r] || 0)) return false; return true; }
export function missing(team, cost) { return RES.filter((r) => (team.res[r] || 0) < ((cost && cost[r]) || 0)); }
export function spend(team, cost) { if (!cost) return; for (const r of RES) team.res[r] = Math.max(0, (team.res[r] || 0) - (cost[r] || 0)); }
export function refund(team, cost, frac = 1) { if (!cost) return; for (const r of RES) team.res[r] += Math.round((cost[r] || 0) * frac); }

// ---- per-team bookkeeping: fractional accumulators + 12 x 5 s income log
export function ensure(t) {
  if (t.econ) return t.econ;
  const log = {}; for (const r of RES) log[r] = new Float64Array(12);
  t.econ = {
    frac: Object.fromEntries(RES.map((r) => [r, 0])), log, bucket: 0, sources: {}, upkeep: 0, starveT: 0, desertT: 0, starving: false, farms: 0,
    noteIncome(res, amt) { log[res][this.bucket % 12] += amt; },
  };
  return t.econ;
}
export function addRes(st, t, res, amt) {
  const e = ensure(t);
  e.frac[res] += amt;
  const whole = e.frac[res] >= 0 ? Math.floor(e.frac[res]) : Math.ceil(e.frac[res]);
  if (whole !== 0) { e.frac[res] -= whole; t.res[res] += whole; if (whole > 0) { e.noteIncome(res, whole); t.stats.gathered[res] += whole; } }
}
// passive income. World lane: call every tick with the per-second amount (dt defaults to SIM_DT), or use setIncomeRate once.
export function addIncome(st, teamId, res, amountPerSec, dt = SIM_DT) { const t = st.teams[teamId]; if (t && t.alive) addRes(st, t, res, amountPerSec * dt); }
export function addIncomeAmount(st, teamId, res, amount) { const t = st.teams[teamId]; if (t) addRes(st, t, res, amount); }
export function setIncomeRate(st, teamId, key, res, perSec) { const e = ensure(st.teams[teamId]); if (perSec) e.sources[key] = { res, perSec }; else delete e.sources[key]; }
export function onDeath(st, victim, killer) { soulsOnDeath(st, victim, killer, addRes); }

// ---- upkeep: blood per minute
const popCache = new Map();
function popOf(u) {
  if (u.popCost != null) return u.popCost;
  let p = popCache.get(u.type);
  if (p == null) { let d = null; try { d = Units.def(u.type); } catch (e) { d = null; } p = d && d.popCost != null ? d.popCost : 1; popCache.set(u.type, p); }
  return p;
}
function upkeepPerMin(st, teamId) {
  let s = 0;
  for (const u of st.ents) { if (!u.alive || u.team !== teamId || u.role === 'general') continue; s += u.role === 'worker' ? ECON.upkeepWork : ECON.upkeepMil * popOf(u); }
  return s;
}
export function rates(st, teamId) {
  const t = st.teams[teamId], e = ensure(t), win = Math.max(15, Math.min(60, st.t));
  const income = {}, up = {}, out = {};
  for (const r of RES) { let s = 0; for (const v of e.log[r]) s += v; income[r] = s * 60 / win; up[r] = r === 'blood' ? e.upkeep : 0; out[r] = income[r] - up[r]; }
  Object.defineProperty(out, 'income', { value: income }); Object.defineProperty(out, 'upkeep', { value: up });
  Object.defineProperty(out, 'starving', { value: e.starving });
  return out;
}
export function idleWorkers(st, teamId) { return (st.teams[teamId].idle || []).map((id) => st.byId.get(id)).filter((u) => u && u.alive); }

// ---- commands
function assign(st, teamId, ids, order, queue) {
  let n = 0;
  for (const id of ids || []) {
    const u = st.byId.get(id);
    if (!u || !u.alive || u.team !== teamId || u.role !== 'worker') continue;
    if (queue && u.orders.length) u.orders.push({ ...order }); else u.orders = [{ ...order }];
    u.order = u.orders[0]; n++;
  }
  return n > 0;
}
export function command(st, teamId, cmd) {
  switch (cmd.t) {
    case 'order': return !!(cmd.order && WORKER_ORDERS.includes(cmd.order.type) && assign(st, teamId, cmd.ids, cmd.order, cmd.queue));
    case 'repair': return assign(st, teamId, cmd.ids, { type: 'repair', bld: cmd.bld }, cmd.queue);
    case 'gather': return assign(st, teamId, cmd.ids, { type: 'gather', node: cmd.node }, cmd.queue);
    case 'return': return assign(st, teamId, cmd.ids, { type: 'return' }, cmd.queue);
    case 'trade': return trade(st, teamId, cmd.give, cmd.get, cmd.amount, addRes);
    case 'sacrifice': return sacrifice(st, teamId, cmd.ids, addRes);
    default: return false;
  }
}

// ---- starvation
function starve(st, t, e, dt) {
  e.starveT += dt; e.desertT += dt;
  for (const u of st.ents) if (u.alive && u.team === t.id && u.role !== 'general') { u.starving = true; if (u.hp > u.maxHp * 0.25) u.hp -= u.maxHp * ECON.starveDrain * dt; }
  if (e.desertT >= ECON.starveDesertEvery) {
    e.desertT = 0;
    const pool = st.ents.filter((u) => u.alive && u.team === t.id && u.role !== 'general' && u.role !== 'worker');
    if (pool.length) { const u = pool[Math.floor(st.rng() * pool.length)]; u.deserted = true; emit(st, { type: 'msg', team: t.id, text: 'A starving ' + u.type + ' deserts!', kind: 'warn' }); killEnt(st, u, null); }
  }
}
function unstarve(st, t, e) { e.starving = false; e.starveT = 0; e.desertT = 0; for (const u of st.ents) if (u.team === t.id && u.starving) u.starving = false; }

// ---- update (step order: after Buildings.update, before Units.update)
export function update(st, dt) {
  updateNodes(st, dt);
  tickMarket(st, dt);
  for (const n of st.nodes) n.workers = 0;
  const crew = new Map(), workers = [];
  for (const u of st.ents) {
    if (!u.alive || u.role !== 'worker') continue;
    workers.push(u);
    const w = u.w, o = u.order;
    if (w && o && w.o === o && w.s === 'work') {
      if (o.type === 'gather') { const nd = st.byId.get(o.node); if (nd && nd.kind === 'node') nd.workers++; } else if (o.bld) crew.set(o.bld, (crew.get(o.bld) || 0) + 1);
    }
  }
  const slow = st.tick % 30 === 0;
  for (const t of st.teams) {
    const e = ensure(t);
    const b = Math.floor(st.t / 5);
    while (e.bucket < b) { e.bucket++; for (const r of RES) e.log[r][e.bucket % 12] = 0; }
    if (!t.alive) continue;
    t.idle = [];
    if (slow) econSlow(st, t, e);
    for (const k in e.sources) addRes(st, t, e.sources[k].res, e.sources[k].perSec * dt);
    if (e.farms) addRes(st, t, 'blood', e.farms * FARM.passive * dt);
    for (const n of st.nodes) if (n.rtype === 'soulwell' && n.owner === t.id) addRes(st, t, 'souls', SOULS.wellRate * dt);
    if (e.upkeep > 0) {
      e.frac.blood -= e.upkeep * dt / 60;
      if (e.frac.blood <= -1) { const w = Math.ceil(-e.frac.blood) - 0; const take = Math.min(w, t.res.blood); e.frac.blood += w; t.res.blood -= take; }
      if (t.res.blood <= 0 && e.frac.blood < 0) { t.res.blood = 0; e.frac.blood = 0; e.starving = true; }
      else if (t.res.blood > 5 && e.starving) unstarve(st, t, e);
    }
    if (e.starving) starve(st, t, e, dt);
  }
  for (const u of workers) {
    const t = st.teams[u.team];
    updateWorker(st, u, t, dt, crew);
    if (!u.order && !u.garrison) t.idle.push(u.id);
  }
}
function econSlow(st, t, e) {
  e.upkeep = upkeepPerMin(st, t.id);
  let farms = 0;
  for (const b of st.blds) if (b.team === t.id && b.state === 'ready' && FARM_RE.test(b.type)) farms++;
  e.farms = Math.min(farms, FARM.maxPassive);
  for (const n of st.nodes) {
    if (n.rtype !== 'soulwell') continue;
    let own = -1, bd = 1e9;
    for (const b of st.blds) if (b.state === 'ready' && b.hp > 0 && SOUL_HARVEST_RE.test(b.type)) { const d = Math.hypot(b.x - n.x, b.z - n.z); if (d < n.r + 14 && d < bd) { bd = d; own = b.team; } }
    n.owner = own;
  }
}
