// FOGBOUND: DOMINION production queues (BUILDINGS lane): train / research / upgrade / rally, population caps, spawning.
// Queue entry: {kind:'unit'|'tech'|'upgrade', unit|tech|upgrade, t (elapsed s), total (s), cost{res}, pcat:'mil'|'work'|'gen', pcost}.  MAX_QUEUE per building = 5.
import { emit } from './core.js';
import * as Units from './units.js';
import * as Econ from './econ.js';
import { def, fkeyOf } from './bdata.js';
import * as Tech from './tech.js';

export const MAX_QUEUE = 5;
const ALIAS = { archery_range: 'archery', hunting_lodge: 'archery', archers: 'archery', stables: 'stable', kennel: 'stable', workshop: 'siege_workshop', siege: 'siege_workshop', siege_yard: 'siege_workshop',
  town_center: 'keep', hall: 'keep', castle: 'keep', crypt: 'bone_crypt', hell_gate: 'hellgate', altar: 'blood_altar', temple_of_blood: 'blood_altar', fort: 'keep', mage_tower: 'sanctum' };
const norm = (n) => ALIAS[n] || n;
const ROLE_TOKENS = { worker: ['worker'], general: ['general'], infantry: ['melee', 'heavy'], ranged: ['ranged'], cavalry: ['cavalry', 'beast'], siege: ['siege'], caster: ['caster'], flyer: ['flyer'] };

// ---- roster access (defensive: the UNITS lane owns the shape)
export function rosterList(fkey) {
  const R = Units.ROSTER;
  if (!R) return [];
  let arr = Array.isArray(R) ? R : Array.isArray(R[fkey]) ? R[fkey] : R[fkey] && typeof R[fkey] === 'object' ? Object.values(R[fkey]) : Object.values(R);
  arr = arr.filter((u) => u && typeof u === 'object' && u.id);
  return arr.filter((u) => !u.faction || u.faction === fkey || u.faction === 'all').filter((u) => u.id.startsWith(fkey + '_') || u.faction === fkey || !/^(necro|orc|demon|cult)_/.test(u.id));
}
const udef = (id) => Units.def(id) || {};
const roleOf = (ud) => ud.role || 'melee';
function needsList(ud) { const n = ud.needs; return n == null ? null : (Array.isArray(n) ? n : [n]).map(norm); }
export function ageOfUnit(ud) { return ud.age || ud.tier || 1; }
export function unitCategory(ud) { const r = roleOf(ud); return r === 'worker' ? 'work' : r === 'general' ? 'gen' : 'mil'; }

// can building b (type) train this unit? (static link only)
export function trains(b, unitId) {
  const d = def(b.type), ud = udef(unitId), nl = needsList(ud);
  const short = unitId.replace(/^(necro|orc|demon|cult)_/, '');
  if (d.trains.includes(unitId) || d.trains.includes(short)) return true;
  if (nl) return nl.includes(b.type) || !!(d.alsoTrains && nl.some((n) => d.alsoTrains.includes(n)));
  const roles = d.trains.flatMap((tk) => ROLE_TOKENS[tk] || []);
  return roles.includes(roleOf(ud));
}
export function trainableIds(st, b) {
  const t = st.teams[b.team], fk = t.faction.key, out = [];
  const d = def(b.type);
  for (const u of rosterList(fk)) if (trains(b, u.id)) out.push(u.id);
  if (!out.length) for (const id of d.trains) if (id.startsWith(fk + '_') || (!ROLE_TOKENS[id] && Units.def)) { if (udef(id).type) out.push(id); }
  if (!out.length && d.trains.includes('worker')) out.push(fk + '_worker');
  if (!out.length && d.trains.includes('general')) out.push(fk + '_general');
  return [...new Set(out)];
}
export const operational = (b) => b.state === 'ready' || b.state === 'upgrading' || b.state === 'burning';
const hasReady = (st, team, type) => st.blds.some((x) => x.team === team && x.type === type && operational(x));

export function queuedPop(st, teamId) {
  const q = { mil: 0, work: 0, gen: 0 };
  for (const b of st.blds) if (b.team === teamId && b.queue.length) for (const e of b.queue) if (e.kind === 'unit') q[e.pcat] += e.pcost || 0;
  return q;
}
export function popRoom(st, team, pcat, pcost) {
  const q = queuedPop(st, team.id);
  if (pcat === 'gen') return team.generals.length + q.gen + 1 > team.cap.gen ? 'General limit (' + team.cap.gen + ')' : null;
  if (pcost <= 0) return null;
  if (team.pop.mil + team.pop.work + q.mil + q.work + pcost > team.popMax) return 'Need more houses';
  if (pcat === 'work' && team.pop.work + q.work + pcost > team.cap.work) return 'Worker limit (' + team.cap.work + ')';
  if (pcat === 'mil' && team.pop.mil + q.mil + pcost > team.cap.mil) return 'Military limit (' + team.cap.mil + ')';
  return null;
}
function unitCostFor(team, b, unitId) {
  const d = def(b.type), ud = udef(unitId), m = d.trainMul || { time: 1, cost: 1 };
  const cost = {};
  for (const r in ud.cost || {}) cost[r] = r === 'souls' ? ud.cost[r] : Math.max(0, Math.round(ud.cost[r] * (m.cost == null ? 1 : m.cost)));
  let time = (ud.time || 20) * (m.time == null ? 1 : m.time);
  if (team.faction.key === 'orc') time *= 0.85;
  time /= 1 + Tech.mod(team, 'prod');
  return { cost, time: Math.max(1, time) };
}
// null | reason
export function canTrain(st, b, unitId) {
  const team = st.teams[b.team], ud = udef(unitId);
  if (!operational(b)) return 'Not finished';
  if (b.queue.length >= MAX_QUEUE) return 'Queue full';
  if (!trains(b, unitId)) return 'Cannot train here';
  if (roleOf(ud) === 'general' && team.generals.some((g) => { const e = st.byId.get(g); return e && e.type === unitId; })) return 'Already recruited';
  if (ageOfUnit(ud) > Tech.ageOf(team)) return 'Requires ' + Tech.AGE_NAMES[ageOfUnit(ud)];
  if (ud.needsTech && !team.tech[ud.needsTech]) return 'Requires technology';
  const pcat = unitCategory(ud), pcost = pcat === 'gen' ? 0 : ud.popCost == null ? 1 : ud.popCost;
  const room = popRoom(st, team, pcat, pcost);
  if (room) return room;
  if (!Econ.canAfford(team, unitCostFor(team, b, unitId).cost)) return 'Not enough resources';
  return null;
}
export function queueTrain(st, teamId, b, unitId, n = 1) {
  let queued = 0, why = null;
  for (let i = 0; i < Math.max(1, Math.min(MAX_QUEUE, n | 0)); i++) {
    why = canTrain(st, b, unitId);
    if (why) break;
    const team = st.teams[teamId], ud = udef(unitId), uc = unitCostFor(team, b, unitId), pcat = unitCategory(ud);
    Econ.spend(team, uc.cost);
    b.queue.push({ kind: 'unit', unit: unitId, t: 0, total: uc.time, cost: uc.cost, pcat, pcost: pcat === 'gen' ? 1 : ud.popCost == null ? 1 : ud.popCost });
    queued++;
  }
  return queued ? null : why || 'Cannot train';
}
export function techCost(team, techId) { return { ...Tech.TECHS[techId].cost }; }
export function canResearch(st, b, techId) {
  const team = st.teams[b.team], t = Tech.TECHS[techId];
  if (!t) return 'Unknown technology';
  if (!operational(b)) return 'Not finished';
  if (b.queue.length >= MAX_QUEUE) return 'Queue full';
  if (!t.at.includes(b.type)) return 'Cannot research here';
  for (const x of st.blds) if (x.team === b.team) for (const e of x.queue) if ((e.kind === 'tech' && e.tech === techId) || (t.isAge && e.kind === 'tech' && Tech.TECHS[e.tech].isAge)) return 'Already researching';
  const why = Tech.unavailable(st, team, techId, (type) => hasReady(st, b.team, type));
  if (why) return why;
  return Econ.canAfford(team, t.cost) ? null : 'Not enough resources';
}
export function queueResearch(st, teamId, b, techId) {
  const why = canResearch(st, b, techId);
  if (why) return why;
  const team = st.teams[teamId], t = Tech.TECHS[techId];
  Econ.spend(team, t.cost);
  b.queue.push({ kind: 'tech', tech: techId, t: 0, total: t.time / (1 + Tech.mod(team, 'research')), cost: { ...t.cost } });
  return null;
}
// ---- unit upgrade lines (UNITS lane: Units.UNIT_UPGRADES), read defensively
export function upgradeInfo(id, level) {
  const U = Units.UNIT_UPGRADES, u = U && U[id];
  if (!u) return null;
  const tiers = Array.isArray(u.tiers) ? u.tiers : null;
  const max = tiers ? tiers.length : u.max || (Array.isArray(u.cost) ? u.cost.length : 3);
  if (level >= max) return { max, done: true };
  const tier = tiers ? tiers[level] : null;
  const pick = (v) => (Array.isArray(v) ? v[level] : v);
  const cost = (tier && tier.cost) || pick(u.cost) || { gold: 150 + 150 * level };
  const time = (tier && tier.time) || pick(u.time) || 40 + 15 * level;
  return { max, cost, time, at: u.at || u.building || null, name: u.name || id };
}
export function queueUpgrade(st, teamId, b, upId) {
  const team = st.teams[teamId], lvl = team.up[upId] || 0, info = upgradeInfo(upId, lvl);
  if (!info) return 'Unknown upgrade';
  if (info.done) return 'Fully upgraded';
  if (!operational(b)) return 'Not finished';
  if (b.queue.length >= MAX_QUEUE) return 'Queue full';
  if (info.at && ![].concat(info.at).map(norm).includes(b.type)) return 'Cannot upgrade here';
  if (!info.at && b.type !== 'forge' && b.type !== 'barracks') return 'Cannot upgrade here';
  for (const x of st.blds) if (x.team === teamId) for (const e of x.queue) if (e.kind === 'upgrade' && e.upgrade === upId) return 'Already upgrading';
  if (!Econ.canAfford(team, info.cost)) return 'Not enough resources';
  Econ.spend(team, info.cost);
  b.queue.push({ kind: 'upgrade', upgrade: upId, level: lvl + 1, t: 0, total: info.time, cost: { ...info.cost } });
  return null;
}
export function cancel(st, b, idx) {
  if (idx == null || idx < 0 || idx >= b.queue.length) idx = b.queue.length - 1;
  const e = b.queue.splice(idx, 1)[0];
  if (e) Econ.refund(st.teams[b.team], e.cost, 1);
  return !!e;
}
export function refundAll(st, b) { for (const e of b.queue) Econ.refund(st.teams[b.team], e.cost, 1); b.queue.length = 0; }
export function setRally(b, x, z, extra) { b.rally = x == null ? null : { x, z, ...(extra || {}) }; }

// ---- spawning
export function exitPoint(st, b) {
  const r = Math.max(b.w, b.d) / 2 + 1.6, tx = b.rally ? b.rally.x : 0, tz = b.rally ? b.rally.z : 0;
  const a0 = Math.atan2(tz - b.z, tx - b.x), w = st.world;
  for (let i = 0; i < 12; i++) {
    const a = a0 + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.52, x = b.x + Math.cos(a) * r, z = b.z + Math.sin(a) * r;
    if (w.walkable(x, z)) return { x: x + (st.rng() - 0.5) * 1.2, z: z + (st.rng() - 0.5) * 1.2 };
  }
  return { x: b.x, z: b.z + r };
}
function finishUnit(st, b, e) {
  const team = st.teams[b.team], p = exitPoint(st, b);
  const ud = udef(e.unit);
  let u;
  if (roleOf(ud) === 'general' && Units.spawnGeneral) u = Units.spawnGeneral(st, b.team, team.generals.length, p.x, p.z, e.unit);
  else u = Units.spawn(st, e.unit, b.team, p.x, p.z, {});
  if (!u) return;
  emit(st, { type: 'trained', bld: b.id, unit: u.id, team: b.team });
  if (b.rally) {
    const o = b.rally.node && st.byId.get(b.rally.node) && u.role === 'worker' ? { type: 'gather', node: b.rally.node } : { type: 'move', x: b.rally.x, z: b.rally.z };
    u.orders = [o]; u.order = o;
  }
}
export function update(st, dt) {
  for (const b of st.blds) {
    if (!b.queue.length || !operational(b)) continue;
    const e = b.queue[0], team = st.teams[b.team];
    e.t += dt * (b.prodMul || 1);
    if (e.t < e.total) continue;
    b.queue.shift();
    if (e.kind === 'unit') finishUnit(st, b, e);
    else if (e.kind === 'tech') Tech.complete(st, team, e.tech);
    else if (e.kind === 'upgrade') {
      team.up[e.upgrade] = e.level;
      if (Units.applyUpgrades) Units.applyUpgrades(st, team, e.upgrade);
      emit(st, { type: 'researched', team: team.id, id: e.upgrade });
    }
  }
}
export { fkeyOf };
