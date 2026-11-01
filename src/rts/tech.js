// FOGBOUND: DOMINION tech tree and ages (BUILDINGS lane).
// team.age (1 Dark, 2 Iron, 3 Cursed; lazily 1), team.tech[id]=true. Other lanes read bonuses with Tech.mod(team,key) (summed effects):
//   carry (+worker carry), gather (+frac gather speed), build (+frac build speed), farm (+frac farm yield), speed (+frac military move speed), vision (+m),
//   dmg / rdmg (+frac melee / ranged damage), armor (+armor points), wallhp (+frac wall & tower HP), heal (+frac heal rate), mana (+max mana), manaRegen, magic (spell tier unlocked, max()).
// Tech hooks into the UNITS lane read defensively: Units.applyUpgrades(st, team, techId) after completion.
import { emit } from './core.js';

export const AGE_NAMES = ['', 'Dark Age', 'Iron Age', 'Cursed Age'];
export const TECHS = {};
const T = (id, o) => { TECHS[id] = Object.assign({ id, name: id, age: 1, faction: 'all', at: ['keep'], cost: { gold: 100 }, time: 30, needs: [], effects: {}, desc: '', school: null }, o); };

T('age_iron', { name: 'Iron Age', age: 1, at: ['keep'], cost: { gold: 350, timber: 250, stone: 100 }, time: 60, needs: ['barracks', 'house'], isAge: 2, desc: 'Unlocks stronger buildings, units and techs.' });
T('age_cursed', { name: 'Cursed Age', age: 2, at: ['keep', 'library'], cost: { gold: 700, stone: 400, souls: 80 }, time: 90, needs: ['forge', 'library'], isAge: 3, desc: 'Unlocks elite units, wonders and the deepest magic.' });
// economy
T('eco_carry1', { name: 'Heavy Sacks', age: 1, at: ['keep'], cost: { gold: 120, timber: 60 }, time: 28, effects: { carry: 4 }, desc: 'Workers carry +4.' });
T('eco_gather1', { name: 'Sharpened Tools', age: 1, at: ['keep'], cost: { gold: 140, timber: 80 }, time: 32, effects: { gather: 0.2 }, desc: 'Workers gather 20% faster.' });
T('eco_carry2', { name: 'Hauling Carts', age: 2, at: ['library'], cost: { gold: 250, timber: 120 }, time: 40, needs: ['eco_carry1'], effects: { carry: 6 }, desc: 'Workers carry +6.' });
T('eco_gather2', { name: 'Iron Tools', age: 2, at: ['library'], cost: { gold: 300, stone: 100 }, time: 44, needs: ['eco_gather1'], effects: { gather: 0.25 }, desc: 'Workers gather 25% faster.' });
T('eco_build1', { name: 'Master Builders', age: 2, at: ['library'], cost: { gold: 220, timber: 100 }, time: 40, effects: { build: 0.35 }, desc: 'Construction 35% faster.' });
T('eco_farm1', { name: 'Grim Husbandry', age: 2, at: ['library'], cost: { gold: 200, timber: 100 }, time: 36, effects: { farm: 0.3 }, desc: 'Farms yield 30% more Blood.' });
// military
const FG = ['forge'];
T('forge_blade1', { name: 'Keen Blades I', age: 1, at: FG, cost: { gold: 150, stone: 50 }, time: 40, effects: { dmg: 0.1 }, desc: 'Melee damage +10%.' });
T('forge_armor1', { name: 'Hardened Plate I', age: 1, at: FG, cost: { gold: 150, stone: 60 }, time: 40, effects: { armor: 1 }, desc: 'Armour +1.' });
T('forge_blade2', { name: 'Keen Blades II', age: 2, at: FG, cost: { gold: 300, stone: 100 }, time: 55, needs: ['forge_blade1'], effects: { dmg: 0.12 }, desc: 'Melee damage +12%.' });
T('forge_armor2', { name: 'Hardened Plate II', age: 2, at: FG, cost: { gold: 300, stone: 120 }, time: 55, needs: ['forge_armor1'], effects: { armor: 2 }, desc: 'Armour +2.' });
T('forge_blade3', { name: 'Keen Blades III', age: 3, at: FG, cost: { gold: 550, stone: 200, souls: 30 }, time: 70, needs: ['forge_blade2'], effects: { dmg: 0.15 }, desc: 'Melee damage +15%.' });
T('forge_armor3', { name: 'Hardened Plate III', age: 3, at: FG, cost: { gold: 550, stone: 240, souls: 30 }, time: 70, needs: ['forge_armor2'], effects: { armor: 3 }, desc: 'Armour +3.' });
T('forge_ranged1', { name: 'Fletching I', age: 1, at: FG, cost: { gold: 150, timber: 100 }, time: 40, effects: { rdmg: 0.12 }, desc: 'Ranged damage +12%.' });
T('forge_ranged2', { name: 'Fletching II', age: 2, at: FG, cost: { gold: 320, timber: 150 }, time: 55, needs: ['forge_ranged1'], effects: { rdmg: 0.15 }, desc: 'Ranged damage +15%.' });
T('forge_wall1', { name: 'Stone Mortar', age: 1, at: FG, cost: { gold: 180, stone: 150 }, time: 45, effects: { wallhp: 0.25 }, desc: 'Walls and towers +25% HP.' });
T('forge_wall2', { name: 'Black Stone Masonry', age: 2, at: FG, cost: { gold: 380, stone: 300 }, time: 60, needs: ['forge_wall1'], effects: { wallhp: 0.35 }, desc: 'Walls and towers +35% HP.' });
T('mil_speed1', { name: 'Forced March', age: 2, at: ['library'], cost: { gold: 260, blood: 100 }, time: 40, effects: { speed: 0.08 }, desc: 'Army marches 8% faster.' });
T('mil_vision1', { name: 'Far Watchers', age: 2, at: ['library'], cost: { gold: 200, timber: 60 }, time: 36, effects: { vision: 4 }, desc: 'Army sees 4 m further.' });
T('holy_heal', { name: 'Dark Blessings', age: 2, at: ['temple'], cost: { gold: 220, souls: 20 }, time: 40, effects: { heal: 0.5 }, desc: 'Temple healing +50%.' });
// magic (spell tiers: the MAGIC lane reads team.tech.magic_N / Tech.mod(team,'magic'))
T('magic_1', { name: 'Dark Studies', age: 1, at: ['sanctum'], cost: { gold: 200, souls: 20 }, time: 40, effects: { magic: 1, mana: 50, manaRegen: 0.2 }, desc: 'Unlocks tier-1 spells.' });
T('magic_2', { name: 'Forbidden Rites', age: 2, at: ['sanctum'], cost: { gold: 400, souls: 60 }, time: 60, needs: ['magic_1'], effects: { magic: 2, mana: 100, manaRegen: 0.3 }, desc: 'Unlocks tier-2 spells.' });
T('magic_3', { name: 'Arcane Dominion', age: 3, at: ['sanctum'], cost: { gold: 700, souls: 150 }, time: 80, needs: ['magic_2'], effects: { magic: 3, mana: 150, manaRegen: 0.5 }, desc: 'Unlocks tier-3 spells.' });
// faction techs
T('necro_bone_armor', { name: 'Bone Plating', faction: 'necro', age: 2, at: ['bone_crypt'], cost: { stone: 150, souls: 30 }, time: 45, effects: { armor: 1, hpMul: 0.1 }, desc: 'Undead gain armour and HP.' });
T('orc_bloodlust', { name: 'Bloodlust', faction: 'orc', age: 2, at: ['war_hall'], cost: { gold: 250, blood: 150 }, time: 45, effects: { dmg: 0.1, speed: 0.05 }, desc: 'Orcs strike harder and march faster.' });
T('demon_pact', { name: 'Infernal Pact', faction: 'demon', age: 2, at: ['hellgate'], cost: { gold: 250, souls: 50 }, time: 45, effects: { dmg: 0.08, rdmg: 0.08, mana: 50 }, desc: 'Fiends hit harder and mana grows.' });
T('cult_zeal', { name: 'Fervour', faction: 'cult', age: 2, at: ['blood_altar'], cost: { gold: 200, blood: 150 }, time: 45, effects: { heal: 0.3, dmg: 0.06, armor: 1 }, desc: 'Zealots are tougher and heal faster.' });

export const ageOf = (team) => team.age || 1;
export function mod(team, key) {
  let s = 0;
  if (!team.tech) return 0;
  for (const id in team.tech) {
    if (!team.tech[id]) continue;
    const e = TECHS[id] && TECHS[id].effects;
    if (e && e[key] != null) s = key === 'magic' ? Math.max(s, e[key]) : s + e[key];
  }
  return s;
}
// null if the team may research techId at a ready building of type atType (atType optional), else a reason string
export function unavailable(st, team, techId, hasBld) {
  const t = TECHS[techId];
  if (!t) return 'Unknown technology';
  if (team.tech[techId]) return 'Already researched';
  if (t.faction !== 'all' && t.faction !== team.faction.key) return 'Other faction';
  if (t.isAge && t.isAge <= ageOf(team)) return 'Already researched';
  if (t.age > ageOf(team)) return 'Requires ' + AGE_NAMES[t.age];
  for (const n of t.needs) {
    if (TECHS[n]) { if (!team.tech[n]) return 'Requires ' + TECHS[n].name; } else if (!hasBld(n)) return 'Requires ' + n.replace(/_/g, ' ');
  }
  return null;
}
export function complete(st, team, techId) {
  const t = TECHS[techId];
  if (!t) return;
  if (t.isAge) team.age = Math.max(ageOf(team), t.isAge);
  team.tech[techId] = true;
  emit(st, { type: 'researched', team: team.id, id: techId });
  emit(st, { type: 'msg', team: team.id, kind: 'info', text: (t.isAge ? 'The ' + t.name + ' dawns.' : t.name + ' researched.') });
}
