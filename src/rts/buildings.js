// FOGBOUND: DOMINION buildings facade (BUILDINGS lane). Defs in bdata.js/bdata_f.js, tech.js, production.js, territory.js, bld_ops.js (aura/burn/garrison).
// Exports used by other lanes: create, def, registerDefs, canPlace, canAfford, place, addProgress, addRepair, storageFor, nearestOwn, influenceAt, ownerAt, command, update, onDestroyed, BUILDINGS, TECHS,
// techAvailable, trainList, count, has, enter/leave (garrison), modelKey. Team extras maintained here: team.age, team.popMax, team.manaMax, team.manaRegen.
import { emit, killBld } from './core.js';
import * as Econ from './econ.js';
import * as Nav from './nav.js';
import * as Prod from './production.js';
import * as Tech from './tech.js';
import * as Terr from './territory.js';
import * as Ops from './bld_ops.js';
import { BUILDINGS, def, registerDefs, availableFor, modelKey as mk, fkeyOf } from './bdata.js';
import { canPlace as cp } from './bld_place.js';

export { BUILDINGS, def, registerDefs, availableFor };
export const TECHS = Tech.TECHS, TECH = Tech.TECHS;
export const modelKey = (b) => mk(b.type, b.team);
export const influenceAt = Terr.influenceAt, ownerAt = Terr.ownerAt, strengthAt = Terr.strengthAt;
export const enter = Ops.enter, leave = Ops.leave;
export const canTrain = Prod.canTrain, canResearch = Prod.canResearch, MAX_QUEUE = Prod.MAX_QUEUE;
export const operational = Prod.operational;
export const mod = Tech.mod;

export function create(st, type, team, x, z, rot, opts = {}) {
  const t = st.teams[team], d = def(type, t || team);
  let maxHp = d.hp;
  if (t && (d.wall || d.turret)) maxHp = Math.round(maxHp * (1 + Tech.mod(t, 'wallhp')));
  const b = {
    id: st.nextId++, kind: 'bld', type, team, x, z, rot: rot || 0, w: d.w, d: d.d, h: d.h, hp: opts.instant ? maxHp : Math.max(1, Math.round(maxHp * 0.1)), maxHp, armor: d.armor,
    state: opts.instant ? 'ready' : 'building', progress: opts.instant ? 1 : 0, buildT: d.buildTime, queue: [], rally: null, garrison: [], garrisonMax: d.garrison, wall: d.wall ? { ...d.wall } : null,
    turret: d.turret ? { ...d.turret } : null, store: d.store, vision: d.vision, influence: d.influence, pop: d.pop, paid: { ...(opts.paid || d.cost) }, name: d.name, born: st.t,
  };
  if (opts.fields) Object.assign(b, opts.fields);
  st.blds.push(b); st.byId.set(b.id, b);
  emit(st, { type: 'spawn', id: b.id });
  if (opts.instant) emit(st, { type: 'built', id: b.id, x, z, team });
  flag(st);
  if (Nav.dirty) Nav.dirty(st);
  return b;
}
const flag = (st) => { st._bd = true; Terr.markDirty(st); };

export function count(st, team, type, ready) {
  let n = 0;
  for (const b of st.blds) if (b.team === team && b.type === type && b.state !== 'ruin' && (!ready || Prod.operational(b))) n++;
  return n;
}
export const has = (st, team, type) => count(st, team, type, true) > 0;
export function canAfford(st, team, type) { return Econ.canAfford(st.teams[team], def(type, team).cost); }
export function canPlace(st, team, type, x, z, rot, opts) { return cp(st, team, type, x, z, rot, opts); }

// pay, check and create a scaffold; workers (ids) get a build order. Returns the building or a reason string.
export function place(st, teamId, type, x, z, rot, workers, opts = {}) {
  const t = st.teams[teamId], d = def(type, t);
  const why = cp(st, teamId, type, x, z, rot, opts);
  if (why) return why;
  if (!Econ.canAfford(t, d.cost)) return 'Not enough resources';
  Econ.spend(t, d.cost);
  const b = create(st, type, teamId, x, z, rot, { fields: opts.fields });
  for (const id of workers || []) {
    const u = st.byId.get(id);
    if (!u || !u.alive || u.team !== teamId || u.role !== 'worker') continue;
    const o = { type: 'build', bld: b.id };
    if (opts.queue && u.orders.length) u.orders.push(o); else u.orders = [o];
    u.order = u.orders[0];
  }
  return b;
}

// ---- construction. Econ calls these with seconds of effective work / hp restored (crew scaling is Econ's).
export function addProgress(st, b, sec) {
  if (!b || b.state !== 'building') return false;
  const team = st.teams[b.team], dp = (sec * (1 + (team ? Tech.mod(team, 'build') : 0))) / Math.max(1, b.buildT);
  const p = Math.min(1, b.progress + dp), gain = p - b.progress;
  b.progress = p;
  b.hp = Math.min(b.maxHp, b.hp + gain * 0.9 * b.maxHp);
  if (p >= 1) {
    b.state = 'ready'; b.hp = Math.min(b.maxHp, Math.max(b.hp, b.maxHp * 0.9));
    emit(st, { type: 'built', id: b.id, x: b.x, z: b.z, team: b.team });
    flag(st);
  }
  return true;
}
// hp restored (Econ charges the worker's own repair cost); returns hp actually added
export function addRepair(st, b, hp) {
  if (!b || b.state === 'ruin' || b.state === 'building') return 0;
  const add = Math.max(0, Math.min(hp, b.maxHp - b.hp));
  b.hp += add;
  if (b.state === 'burning' && b.hp > b.maxHp * 0.4) b.state = 'ready';
  return add;
}

// ---- storage / lookup
export function storageFor(st, team, res, x, z) {
  let best = null, bd = 1e9;
  for (const b of st.blds) {
    if (b.team !== team || !Prod.operational(b) || !b.store || !(b.store === true || b.store.includes(res))) continue;
    const d = Math.hypot(b.x - x, b.z - z) - Math.max(b.w, b.d) / 2;
    if (d < bd) { bd = d; best = b; }
  }
  if (best) return best;
  const k = st.teams[team].keep;
  return k && k.state !== 'ruin' ? k : null;
}
export function nearestOwn(st, team, type, x, z, opts = {}) {
  let best = null, bd = 1e9;
  for (const b of st.blds) {
    if (b.team !== team || b.state === 'ruin' || (type && b.type !== type) || (opts.ready !== false && !Prod.operational(b))) continue;
    const d = Math.hypot(b.x - x, b.z - z);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}
// UI helpers
export function trainList(st, b) {
  return Prod.trainableIds(st, b).map((id) => ({ unit: id, reason: Prod.canTrain(st, b, id) }));
}
export function techAvailable(st, teamId) {
  const team = st.teams[teamId], out = [];
  for (const id in Tech.TECHS) {
    const t = Tech.TECHS[id];
    if (t.faction !== 'all' && t.faction !== team.faction.key) continue;
    const done = !!team.tech[id] || (t.isAge && t.isAge <= Tech.ageOf(team));
    const why = done ? 'Already researched' : Tech.unavailable(st, team, id, (ty) => has(st, teamId, ty));
    out.push({ id, name: t.name, at: t.at, cost: t.cost, time: t.time, age: t.age, desc: t.desc, done, reason: why, available: !why });
  }
  return out;
}
export function buildList(st, teamId) {
  const team = st.teams[teamId];
  return availableFor(team.faction.key).map((d) => ({ type: d.id, name: def(d.id, team).name, cost: d.cost, age: d.age, needs: d.needs, reason: requirement(st, team, d) }));
}
export function requirement(st, team, d) {
  if (d.age > Tech.ageOf(team)) return 'Requires ' + Tech.AGE_NAMES[d.age];
  for (const n of d.needs) if (Tech.TECHS[n] ? !team.tech[n] : !has(st, team.id, n)) return 'Requires ' + (BUILDINGS[n] ? def(n, team).name : n);
  if (d.limit && count(st, team.id, d.id) >= d.limit) return 'Limit reached (' + d.limit + ')';
  return null;
}
export { Prod as production, Tech as tech, Terr as territory };

export function command(st, teamId, cmd) { return Ops.command(st, teamId, cmd); }
export function update(st, dt) { Ops.update(st, dt); }
export function onDestroyed(st, b, killer) { Ops.onDestroyed(st, b, killer); }
export function demolish(st, teamId, b) { return Ops.demolish(st, teamId, b); }
export { fkeyOf, killBld };
