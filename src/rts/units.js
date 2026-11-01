// FOGBOUND: DOMINION units (UNITS lane). Spawning, stats, orders/movement driver, upgrades, population. Roster data: roster*.js; orders: orders*.js; fighting: combat*.js; generals: generals*.js.
// Exports others rely on: ROSTER, UNIT_UPGRADES, def, list, registerUnits, spawn, spawnGeneral, command, update, onDeath, near, forNear, stepMove, applyUpgrades, canTrain, recalc, equipGeneral, hostile.
import { emit, killEnt } from './core.js';
import * as R from './roster.js';
import { UNIT_UPGRADES, upgradeSum } from './unit_upgrades.js';
import { recalc, applyMods } from './units_stats.js';
import { near, forNear, gap } from './units_grid.js';
import { stepMove, separate, startTick } from './units_move.js';
import * as Orders from './orders.js';
import * as Gen from './generals.js';

export { ROSTER, registerUnits } from './roster.js';
export { UNIT_UPGRADES, registerUpgradeLine } from './unit_upgrades.js';
export { near, forNear, gap, stepMove, recalc };
export const def = R.def;
export const list = R.list;
export const hostile = (a, b) => !!a && !!b && a.team !== b.team;
export const isEnemy = hostile;

const FALLBACK = (type) => R.registerUnits({ [type]: { name: type, role: 'melee', needs: null, popCost: 1, hp: 100, tier: 1, atk: { dmg: 10, range: 0.9, cd: 1.2, dtype: 'physical', projectile: null }, speed: 4, r: 0.6, vision: 20, upgradeLines: [], tags: { melee: 1 } } });

export function spawn(st, type, team, x, z, opts = {}) {
  let d = R.def(type);
  if (!d) { FALLBACK(type); d = R.def(type); }
  const neutral = !!opts.neutral || team < 0 || !!d.neutral && !st.teams[team];
  const tid = neutral ? -1 : team, t = st.teams[tid];
  const u = {
    id: st.nextId++, kind: 'unit', type: d.id, def: d, team: tid, x, z, y: st.world.heightAt(x, z) + (d.fly ? 3.5 : 0), r: d.r, face: opts.face || 0, hp: 0, maxHp: 0, armor: 0, baseArmor: 0, atk: d.atk, speed: d.speed, vision: d.vision,
    role: d.role, lvl: 1, xp: 0, vet: opts.vet || 1, orders: [], order: null, stance: d.role === 'worker' ? 'defensive' : 'aggressive', layer: 'ground', garrison: 0, carry: null,
    abilities: d.abilities.map((id) => ({ id, cd: 0 })), buffs: [], stun: 0, alive: true, tgt: 0, atkCd: st.rng() * 0.6, scale: opts.scale || 1, neutral, mod: null, fly: !!d.fly,
    pc: opts.noPop || neutral ? 0 : d.popCost, popTeam: tid, tags: d.tags, bounty: d.bounty ? { ...d.bounty } : null, souls: d.souls, kills: 0,
  };
  if (neutral) { u.home = opts.home || { x, z }; u.aggro = opts.aggro ?? d.aggro ?? 13; u.leash = opts.leash ?? d.leash ?? 32; u.stance = d.passive ? 'defensive' : 'aggressive'; }
  for (const k in opts) if (!(k in u) || k === 'orders' || k === 'stance') u[k] = opts[k];
  u.neutral = neutral;
  if (opts.life && u.ttl === undefined && opts.expireAt === undefined) u.ttl = opts.life;
  if (u.ttl !== undefined || opts.summoned) { u.tags = Object.assign({}, d.tags, { summoned: 1 }); u.pc = 0; if (!neutral && opts.noSouls) u.souls = 0; }
  recalc(st, u);
  u.hp = u.maxHp;
  if (u.orders.length) u.order = u.orders[0];
  st.ents.push(u); st.byId.set(u.id, u);
  if (t && u.pc) { if (u.role === 'worker') t.pop.work += u.pc; else if (u.role !== 'general') t.pop.mil += u.pc; }
  if (d.general) Gen.onSpawn(st, u);
  emit(st, { type: 'spawn', id: u.id });
  return u;
}
export function spawnGeneral(st, team, idx, x, z, unitId) { return Gen.spawnGeneral(st, team, idx, x, z, unitId, spawn); }
export function onDeath(st, u, killer) {
  const t = st.teams[u.popTeam];
  if (t && u.pc && !u.popFreed) { u.popFreed = true; if (u.role === 'worker') t.pop.work -= u.pc; else if (u.role !== 'general') t.pop.mil -= u.pc; }
  if (u.garrison) Orders.eject(st, u);
  Gen.onDeath(st, u, killer);
  Orders.onDeath(st, u, killer);
}
// null if the team may train this unit now (pop/cap checks; the Buildings lane also checks cost/age/queue)
export function canTrain(st, teamId, type) {
  const t = st.teams[teamId], d = R.def(type);
  if (!t || !d) return 'Unknown unit';
  if (d.role === 'general') return t.generals.length >= t.cap.gen ? 'General limit' : null;
  if (t.pop.mil + t.pop.work + d.popCost > t.popMax) return 'Need more houses';
  if (d.role === 'worker') return t.pop.work + d.popCost > t.cap.work ? 'Worker limit' : null;
  return t.pop.mil + d.popCost > t.cap.mil ? 'Military limit' : null;
}
// recompute stats of living units after research. (st, team|teamId, upgradeId optional)
export function applyUpgrades(st, team, upId) {
  const tid = typeof team === 'object' ? team.id : team;
  for (const u of st.ents) if (u.alive && u.team === tid) recalc(st, u);
}
export function equipGeneral(st, g, item) { return Gen.equip(st, g, item); }
export const GEAR = Gen.GEAR;
export const GEN_SKILLS = Gen.GEN_SKILLS;

export function command(st, teamId, cmd) {
  if (cmd.t === 'general') return Gen.command(st, teamId, cmd);
  return Orders.command(st, teamId, cmd);
}
export function update(st, dt) {
  startTick(st);
  const tm = st.teams;
  // tech / upgrade changes (research completes via other lanes): recompute when the signature changes
  if (st.tick % 15 === 0) for (const t of tm) {
    const sig = upgradeSum(t) * 1000 + Object.keys(t.tech || {}).length + (t.age || 1) * 100000;
    if (t._usig !== sig) { if (t._usig !== undefined) applyUpgrades(st, t); t._usig = sig; }
  }
  for (const u of st.ents) {
    if (!u.alive) continue;
    if (u.modDirty) applyMods(u);
    Orders.run(st, u, dt);
  }
  separate(st, dt);
  Gen.update(st, dt);
}
