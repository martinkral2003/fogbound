// UNITS lane: derived unit stats. recalc(st,u) = base def x veterancy x tech x unit upgrades x gear; applyMods(u) = temporary buff multipliers.
// Buff shape (shared with Magic): {id, t (s left), dmg:mul, as:mul (attack speed), spd:mul, take:mul (damage taken), armor:+pts, regen:+hp/s, dps, dtype, src, vis:+m}.
import * as Tech from './tech.js';
import { upgradeMods } from './unit_upgrades.js';
import { MAX_VET, MAX_GENERAL_LVL } from './consts.js';

export const VET_XP = [0, 60, 160, 320, 560, 900];          // xp needed for vet 1..6
export const GEN_XP = [0, 100, 260, 480, 760, 1100, 1500, 2000, 2600, 3300]; // xp for general level 1..10
// visible bonuses: damage/hp mul + armour points + speed mul
export function vetBonus(u) {
  if (u.general) { const l = (u.lvl || 1) - 1; return { dmg: 1 + 0.06 * l, hp: 1 + 0.09 * l, armor: 1.5 * l, speed: 1 + 0.005 * l }; }
  const v = Math.max(0, Math.min(MAX_VET, u.vet || 1) - 1);
  return { dmg: 1 + 0.08 * v, hp: 1 + 0.1 * v, armor: 2 * v, speed: 1 + 0.01 * v };
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function recalc(st, u) {
  const d = u.def, team = st.teams[u.team] || st.teams[u.popTeam];
  const vb = vetBonus(u);
  let dmgM = vb.dmg, hpM = vb.hp, armA = vb.armor, spdM = vb.speed, visA = 0;
  const g = u.gear ? u.gear.mods : null;
  if (team && !u.neutral) {
    const ranged = d.atk.range >= 5, mil = u.role !== 'worker';
    if (mil) {
      dmgM *= 1 + Tech.mod(team, ranged ? 'rdmg' : 'dmg');
      armA += 3 * Tech.mod(team, 'armor');
      spdM *= 1 + Tech.mod(team, 'speed');
      visA += Tech.mod(team, 'vision');
      hpM *= 1 + Tech.mod(team, 'hpMul');
    }
    const up = upgradeMods(team, d);
    dmgM *= 1 + up.dmg; hpM *= 1 + up.hp; armA += up.armor; spdM *= 1 + up.speed;
  }
  if (g) { dmgM *= 1 + (g.dmg || 0); hpM *= 1 + (g.hp || 0); armA += g.armor || 0; spdM *= 1 + (g.speed || 0); }
  const sc = u.scale || 1;
  const mh = Math.round(d.hp * sc * hpM);
  if (u.maxHp > 0) u.hp = Math.min(mh, u.hp * mh / u.maxHp); else u.hp = mh;
  u.maxHp = mh;
  u.baseArmor = clamp(d.armor + armA, 0, 75);
  u.atk = Object.assign({}, d.atk, { dmg: d.atk.dmg * sc * dmgM });
  u.speed0 = d.speed * spdM;
  u.vision0 = d.vision + visA;
  applyMods(u);
}
export function applyMods(u) {
  let dmg = 1, as = 1, spd = 1, take = 1, armor = 0, regen = u.def.regen || 0, vis = 0;
  for (const b of u.buffs) {
    if (b.dmg) dmg *= b.dmg; if (b.as) as *= b.as; if (b.spd != null) spd *= b.spd; if (b.take) take *= b.take;
    if (b.armor) armor += b.armor; if (b.regen) regen += b.regen; if (b.vis) vis += b.vis;
  }
  u.mod = { dmg, as, spd, take, armor, regen };
  u.armor = clamp(u.baseArmor + armor, 0, 75);
  u.speed = u.speed0 * Math.max(0, spd);
  u.vision = u.vision0 + vis + (u.layer === 'wall' ? u.vision0 * 0.25 : 0);
  u.modDirty = false;
}
export { MAX_GENERAL_LVL };
