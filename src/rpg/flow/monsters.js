// FLOW: monster creation (stats from data.js MONSTERS scaled by camp tier) and camp population.
import { MONSTERS, TIER_MUL } from '../../data.js';
import { makeActor } from '../core.js';
import { TAU } from '../../util.js';

const HP_K = 1.0;      // global monster hp factor for hero-scale combat
const CHAMP_TITLES = ['the Gaunt', 'Bonecrusher', 'the Hollow', 'Gravewalker', 'Dreadmaw', 'the Unquiet', 'Ashen', 'Rotgut'];
const TIER_LVL = [1, 3, 6, 9, 12];

// derived stats for a monster (core would call Items.derived; monsters bypass it so the Items agent needs no monster knowledge)
export function monsterDerived(def, mul) {
  const dmg = def.atk * mul.dmg;
  const ranged = def.ranged ? { draw: 0, projSpeed: def.proj ? def.proj.spd : 20, range: def.range } : undefined;
  const res = { physical: 0, fire: 0, cold: 0, lightning: 0, poison: 0, ...(def.res || {}) };
  return {
    maxHp: Math.round(def.hp * mul.hp), maxStamina: 100, maxMana: 0, armor: Math.min(75, def.armor || 0), res,
    moveSpeed: def.spd * (def.model === 'wolf' ? 0.52 : 0.6) * (mul.spd || 1), carry: 99, weight: 0, dmgMul: 1, atkSpeed: 1 / Math.max(0.5, def.cd / 1.1), critChance: 0.03,
    staminaRegen: 30, manaRegen: 0, hpRegen: 0, lifesteal: 0,
    weapon: { dmg: [dmg * 0.85, dmg * 1.15], speed: 1, reach: def.range, stam: 0, dtype: def.dtype || 'physical', kind: def.ranged ? 'monsterRanged' : 'monster', ranged },
  };
}

export function spawnMonster(st, type, tier, x, z, o = {}) {
  const def = MONSTERS[type]; if (!def) return null;
  const tm = TIER_MUL[Math.min(4, tier)] || 1;
  const champ = !!o.champion;
  const mul = { hp: HP_K * tm * (champ ? 2.2 : 1) * (def.boss ? 0.9 : 1), dmg: 0.38 * (def.ranged ? 0.65 : 1) * (1 + (tm - 1) * 0.6) * (champ ? 1.3 : 1), spd: champ && st.rng() < 0.4 ? 1.2 : 1 };
  const a = makeActor(st, {
    kind: 'monster', type, name: champ ? `${def.name} ${CHAMP_TITLES[Math.floor(st.rng() * CHAMP_TITLES.length)]}` : def.name, model: def.model, x, z, yaw: st.rng() * TAU,
    lvl: (def.boss ? 16 : (TIER_LVL[Math.min(4, tier)] || 1)) + (champ ? 2 : 0) + Math.floor(st.rng() * 2), radius: def.r, height: Math.max(1.1, def.r * 2.6),
    scale: champ ? 1.2 : 1, loot: def.boss ? 'mon_boss' : champ ? 'mon_elite' : 'mon_' + type, bounty: Math.round(def.gold * tm), team: -1,
    ai: { role: 'monster', home: { x, z }, camp: o.camp ?? -1, state: 'idle', t: st.rng() * 3, tier, champion: champ, boss: !!def.boss, wander: null, wanderT: 1 + st.rng() * 4, target: 0, phase: 0, fleeing: false },
    extra: { monDef: type, tier, champion: champ, boss: !!def.boss },
  });
  a.d = monsterDerived(def, mul);
  a.maxHp = a.d.maxHp; a.hp = a.maxHp; a.maxStamina = 100; a.stamina = 100; a.maxMana = 0; a.mana = 0;
  for (const k of Object.keys(a.res)) a.res[k] = a.d.res[k] || 0;
  return a;
}

// all camps (hill-fort camps, temple guards) + the Drowned King
export function populateMonsters(st) {
  const f = st.world.features, camps = [];
  f.camps.forEach((c, ci) => {
    const types = c.types, n = types.length;
    const champIdx = c.tier >= 2 && st.rng() < 0.3 ? Math.floor(st.rng() * n) : -1;
    const camp = { id: ci, x: c.x, z: c.z, tier: c.tier, temple: !!c.temple, fort: !!c.fort, mons: [] };
    types.forEach((t, i) => {
      const ang = (i / n) * TAU + st.rng(), rr = n === 1 ? 0 : 2.5 + st.rng() * 1.8;
      const m = spawnMonster(st, t, c.temple ? 2 : c.tier, c.x + Math.cos(ang) * rr, c.z + Math.sin(ang) * rr, { camp: ci, champion: i === champIdx });
      if (m) { m.ai.home = { x: c.x, z: c.z }; camp.mons.push(m.id); }
    });
    camps.push(camp);
  });
  const b = f.boss;
  if (b) {
    const k = spawnMonster(st, 'king', 3, b.x, b.z, { camp: -2 });
    k.ai.home = { x: b.x, z: b.z }; k.ai.leash = 38;
    st.flow.boss = k.id;
  }
  // a few wandering packs on the roads between strongholds so the open land is not empty
  const roamers = ['wolf', 'skeleton', 'ghoul', 'orcRaider'];
  for (let i = 0; i < 6; i++) {
    for (let tries = 0; tries < 30; tries++) {
      const a = st.rng() * TAU, r = 40 + st.rng() * 120, x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!st.world.walkable(x, z)) continue;
      if (st.world.hearts.some((h) => Math.hypot(h.x - x, h.z - z) < 40)) continue;
      if ((st.flow.spawns || []).some((q) => Math.hypot(q.x - x, q.z - z) < 60)) continue;
      const t = roamers[Math.floor(st.rng() * roamers.length)], n = t === 'wolf' ? 3 : 2;
      for (let q = 0; q < n; q++) { const m = spawnMonster(st, t, r > 100 ? 1 : 2, x + q * 1.6, z + (q & 1) * 1.4, { camp: -3 - i }); if (m) m.ai.home = { x, z }; }
      break;
    }
  }
  st.flow.camps = camps;
}
