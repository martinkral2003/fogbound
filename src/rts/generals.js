// UNITS lane: generals (Original War-style named heroes). 3 per faction (idx 0 starts free; idx 1-2 trained at the Keep), level 1-10, 4 faction skills (+1 point/level),
// command-radius aura, one gear slot, death -> revive at the Keep after a timer (gold/souls cut it short). team.generals keeps ALL generals incl. dead ones (cap.gen counts them).
// Commands: {t:'general', op:'skill', gen:unitId, skill:abilityId} {op:'revive', gen} {op:'equip', gen, item:gearId} {op:'unequip', gen}.
import { emit } from './core.js';
import * as Econ from './econ.js';
import { recalc, GEN_XP } from './units_stats.js';
import { forNear } from './units_grid.js';
import * as C from './combat.js';
import { ABIL } from './combat_abil_data.js';

export const MAX_LVL = 10;
// [ability id, required general level, max skill level]
export const GEN_SKILLS = {
  necro: [['raise_dead', 1, 3], ['bone_ward', 1, 3], ['death_nova', 3, 3], ['soul_drain', 6, 2]],
  orc: [['gen_bloodlust', 1, 3], ['war_stomp', 1, 3], ['chain_lightning', 3, 3], ['waaagh', 6, 2]],
  demon: [['hellstorm', 1, 3], ['summon_fiends', 1, 3], ['infernal_armor', 3, 3], ['demon_form', 6, 2]],
  cult: [['martyrs_blessing', 1, 3], ['smite', 1, 3], ['blood_rite', 3, 3], ['crimson_tide', 6, 2]],
};
// passive command aura (scales with general level): applied to nearby friendly military every 0.5 s
export const GEN_AURA = {
  necro: { name: 'Unholy Presence', mods: { id: 'gen_aura', armor: 6 } },
  orc: { name: 'Warchief Roar', mods: { id: 'gen_aura', dmg: 1.1 } },
  demon: { name: 'Brimstone Aura', mods: { id: 'gen_aura', dmg: 1.08, armor: 3 } },
  cult: { name: 'Fervent Faith', mods: { id: 'gen_aura', regen: 1.5, dmg: 1.04 } },
};
export const GEAR = {
  rusted_blade: { id: 'rusted_blade', name: 'Rusted Blade', slot: 'weapon', mods: { dmg: 0.1 }, rating: 1 },
  warlords_axe: { id: 'warlords_axe', name: "Warlord's Axe", slot: 'weapon', mods: { dmg: 0.2, speed: 0.03 }, rating: 3 },
  bone_scepter: { id: 'bone_scepter', name: 'Bone Scepter', slot: 'weapon', mods: { dmg: 0.16, hp: 0.05 }, rating: 2 },
  iron_helm: { id: 'iron_helm', name: 'Iron Helm', slot: 'armor', mods: { armor: 6 }, rating: 1 },
  black_plate: { id: 'black_plate', name: 'Black Plate', slot: 'armor', mods: { armor: 14, speed: -0.04 }, rating: 3 },
  cursed_amulet: { id: 'cursed_amulet', name: 'Cursed Amulet', slot: 'trinket', mods: { hp: 0.2 }, rating: 2 },
  wind_boots: { id: 'wind_boots', name: 'Boots of Wind', slot: 'trinket', mods: { speed: 0.12 }, rating: 2 },
  crown_of_ash: { id: 'crown_of_ash', name: 'Crown of Ash', slot: 'trinket', mods: { dmg: 0.12, hp: 0.12, armor: 4 }, rating: 4 },
};
const GEAR_IDS = Object.keys(GEAR);
const keyOf = (st, tid) => st.teams[tid].faction.key;

export function reviveCost(g) { return { gold: 100 + 60 * g.lvl, souls: g.lvl >= 4 ? 2 * g.lvl : 0 }; }
export function onSpawn(st, u) {
  const t = st.teams[u.team];
  u.general = true; u.name = u.def.name; u.skills = {}; u.points = 1; u.lvl = 1; u.xp = 0; u.gear = null; u.reviveT = null;
  if (t && !t.generals.includes(u.id)) t.generals.push(u.id);
}
export function spawnGeneral(st, teamId, idx, x, z, unitId, spawn) {
  const t = st.teams[teamId], key = t.faction.key;
  if (t.generals.length >= t.cap.gen) return null;
  const have = new Set(t.generals.map((i) => st.byId.get(i)).filter(Boolean).map((g) => g.type));
  let type = unitId && /_general_\d$/.test(unitId) && unitId.startsWith(key + '_') ? unitId : `${key}_general_${Math.max(0, Math.min(2, idx | 0))}`;
  if (have.has(type)) { type = null; for (let i = 0; i < 3; i++) if (!have.has(`${key}_general_${i}`)) { type = `${key}_general_${i}`; break; } }
  if (!type) return null;
  return spawn(st, type, teamId, x, z, {});
}
export function onDeath(st, u, killer) {
  if (u.general) {
    u.reviveT = 40 + 10 * u.lvl; u.orders = []; u.order = null; u.buffs = []; u.garrison = 0; u.tgt = 0;
    emit(st, { type: 'alert', team: u.team, what: 'general_down', x: u.x, z: u.z });
    emit(st, { type: 'msg', team: u.team, text: `${u.name} has fallen.`, kind: 'bad' });
    return;
  }
  if (u.neutral && (u.def.boss || st.rng() < 0.04)) dropLoot(st, u.x, u.z, GEAR_IDS[Math.floor(st.rng() * (u.def.boss ? GEAR_IDS.length : 4 + 1)) % GEAR_IDS.length]);
}
export function dropLoot(st, x, z, itemId) {
  if (!st.loot) st.loot = [];
  st.loot.push({ id: st.nextId++, x, z, item: itemId });
  emit(st, { type: 'neutral', what: 'loot', x, z, item: itemId });
}
export function equip(st, g, item) {
  const it = typeof item === 'string' ? GEAR[item] : item;
  if (!g || !g.general || !it) return false;
  g.gear = { id: it.id, name: it.name, slot: it.slot, mods: it.mods, rating: it.rating || 1 };
  recalc(st, g);
  emit(st, { type: 'msg', team: g.team, text: `${g.name} equips ${it.name}.`, kind: 'info' });
  return true;
}
export function gainXp(st, g, amt) {
  if (!g.alive || g.lvl >= MAX_LVL) return;
  g.xp += amt;
  let up = false;
  while (g.lvl < MAX_LVL && g.xp >= GEN_XP[g.lvl]) { g.lvl++; g.points++; up = true; }
  if (up) { recalc(st, g); g.hp = Math.min(g.maxHp, g.hp + g.maxHp * 0.3); emit(st, { type: 'levelup', unit: g.id, lvl: g.lvl }); }
}
export function shareXp(st, killer, amt) {
  if (killer.general) return;
  const t = st.teams[killer.team];
  if (!t) return;
  for (const id of t.generals) { const g = st.byId.get(id); if (g && g.alive && (g.x - killer.x) ** 2 + (g.z - killer.z) ** 2 < 900) gainXp(st, g, amt * 0.4); }
}
export function learn(st, g, skillId) {
  const list = GEN_SKILLS[keyOf(st, g.team)], row = list && list.find((r) => r[0] === skillId);
  if (!row || g.points <= 0 || g.lvl < row[1] || (g.skills[skillId] | 0) >= row[2]) return false;
  g.skills[skillId] = (g.skills[skillId] | 0) + 1; g.points--;
  let ab = g.abilities.find((a) => a.id === skillId);
  if (!ab) { ab = { id: skillId, cd: 0 }; g.abilities.push(ab); }
  ab.lvl = g.skills[skillId];
  return true;
}
export function revive(st, g) {
  const t = st.teams[g.team], k = t.keep;
  if (!t.alive || !k || k.state === 'ruin') return false;
  const r = Math.max(k.w, k.d) / 2 + 2;
  g.alive = true; g.popFreed = false; g.hp = g.maxHp; g.buffs = []; g.stun = 0; g.exploded = false; g.reviveT = null; g.tgt = 0; g.orders = []; g.order = null; g.garrison = 0;
  g.x = k.x + (st.rng() - 0.5) * 2; g.z = k.z + r; g.y = st.world.heightAt(g.x, g.z); delete g.diedAt;
  for (const a of g.abilities) a.cd = Math.max(a.cd, 10);
  recalc(st, g); g.hp = g.maxHp;
  if (!st.ents.includes(g)) st.ents.push(g);
  emit(st, { type: 'spawn', id: g.id });
  emit(st, { type: 'msg', team: g.team, text: `${g.name} returns.`, kind: 'good' });
  return true;
}
export function command(st, teamId, cmd) {
  if (cmd.op == null) return false;
  const g = st.byId.get(cmd.gen);
  if (!g || !g.general || g.team !== teamId) return true;
  const t = st.teams[teamId];
  if (cmd.op === 'skill') learn(st, g, cmd.skill);
  else if (cmd.op === 'revive') {
    if (!g.alive && g.reviveT != null && g.reviveT > 4) { const c = reviveCost(g); if (Econ.canAfford(t, c)) { Econ.spend(t, c); g.reviveT = 4; } }
  } else if (cmd.op === 'equip') { const it = GEAR[cmd.item]; if (it && g.alive && (!t.items || t.items.includes(cmd.item))) equip(st, g, it); }
  else if (cmd.op === 'unequip') { g.gear = null; recalc(st, g); }
  return true;
}
export function update(st, dt) {
  const tick = st.tick;
  for (const t of st.teams) {
    if (!t.alive) continue;
    for (const id of t.generals) {
      const g = st.byId.get(id);
      if (!g) continue;
      if (!g.alive) {
        if (g.reviveT != null) { g.reviveT -= dt * (t.keep && hasTemple(st, t.id) ? 1.5 : 1); if (g.reviveT <= 0) revive(st, g); }
        continue;
      }
      if ((tick + g.id) % 15 === 0) {
        const A = GEN_AURA[t.faction.key], sc = 1 + 0.1 * g.lvl, m = {};
        for (const k in A.mods) m[k] = k === 'id' ? A.mods[k] : k === 'dmg' ? 1 + (A.mods[k] - 1) * sc : A.mods[k] * sc;
        forNear(st, g.x, g.z, 16 + 1.5 * g.lvl, (e) => { if (e.team === t.id && e.role !== 'worker' && e.hp > 0) C.addBuff(st, e, m, 1.2); return false; });
        if (st.loot && st.loot.length) for (let i = st.loot.length - 1; i >= 0; i--) {
          const l = st.loot[i];
          if ((l.x - g.x) ** 2 + (l.z - g.z) ** 2 < 9 && (!g.gear || (GEAR[l.item].rating > g.gear.rating))) { equip(st, g, l.item); st.loot.splice(i, 1); break; }
        }
      }
      if (t.ai && g.points > 0 && (tick + g.id) % 30 === 0) {
        const order = GEN_SKILLS[t.faction.key].map((r) => r[0]).sort((a, b) => (g.skills[a] | 0) - (g.skills[b] | 0));
        for (const s of order) if (learn(st, g, s)) break;
      }
    }
  }
}
function hasTemple(st, tid) { for (const b of st.blds) if (b.team === tid && b.type === 'temple' && b.state === 'ready') return true; return false; }
export { ABIL };
