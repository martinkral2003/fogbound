// UNITS lane: unit upgrade lines. Every non-worker unit def has upgradeLines [`<fac>_<group>_w`, `<fac>_<group>_a`] (weapon + armour line, 2-3 tiers).
// UNIT_UPGRADES[lineId] = {id,name,desc,faction,group,kind:'weapon'|'armor',at:['forge'],max,tiers:[{cost,time,mods}],applies:[unit ids]}; team.up[lineId] = level (0..max).
// mods: {dmg: +frac, hp: +frac, armor: +percent points, speed: +frac}. Production lane queues {t:'upgrade', bld, upgrade: lineId}, sets team.up and calls Units.applyUpgrades.
import { ROSTER } from './roster.js';

const WN = { necro: 'Honed Bone', orc: 'Keener Edges', demon: 'Hellforged Arms', cult: 'Sanctified Arms' };
const AN = { necro: 'Bone Plating', orc: 'Hide & Iron', demon: 'Brimstone Plate', cult: 'Blessed Vestments' };
const GL = { bone: 'Bone Legion', bow: 'Archers', spirit: 'Spirits', brute: 'Brutes', spear: 'Spear-Throwers', ride: 'Riders', totem: 'Shamans', imp: 'Imps', hound: 'Hounds',
  legion: 'Legion', dark: 'Succubi', elite: 'Elites', fire: 'Fire Archers', zeal: 'Zealots', bolt: 'Crossbows', faith: 'Faithful', knight: 'Knights', siege: 'Siege' };
const ROMAN = ['I', 'II', 'III'];
const WCOST = [{ gold: 120, stone: 40 }, { gold: 240, stone: 90 }, { gold: 420, stone: 150, souls: 20 }];
const ACOST = [{ gold: 110, stone: 60 }, { gold: 230, stone: 110 }, { gold: 400, stone: 170, souls: 20 }];

export const UNIT_UPGRADES = {};
const groups = {};
for (const id in ROSTER) {
  const d = ROSTER[id];
  if (!d.upgradeLines || !d.upgradeLines.length) continue;
  const k = d.faction + '|' + d.group;
  (groups[k] || (groups[k] = { f: d.faction, g: d.group, units: [] })).units.push(id);
}
for (const k in groups) {
  const { f, g, units } = groups[k], n = g === 'elite' || g === 'knight' ? 2 : 3, label = GL[g] || g;
  UNIT_UPGRADES[`${f}_${g}_w`] = {
    id: `${f}_${g}_w`, name: `${WN[f]}: ${label}`, desc: `${label}: +12% damage per tier.`, faction: f, group: g, kind: 'weapon', at: ['forge'], max: n, applies: units,
    tiers: Array.from({ length: n }, (_, i) => ({ name: `${WN[f]} ${ROMAN[i]}`, cost: { ...WCOST[i] }, time: 35 + i * 15, mods: { dmg: i === 2 ? 0.14 : 0.12 } })),
  };
  UNIT_UPGRADES[`${f}_${g}_a`] = {
    id: `${f}_${g}_a`, name: `${AN[f]}: ${label}`, desc: `${label}: +5 armour and +5% health per tier.`, faction: f, group: g, kind: 'armor', at: ['forge'], max: n, applies: units,
    tiers: Array.from({ length: n }, (_, i) => ({ name: `${AN[f]} ${ROMAN[i]}`, cost: { ...ACOST[i] }, time: 35 + i * 15, mods: { armor: i === 2 ? 6 : 5, hp: 0.05 } })),
  };
}
// Siege lane may add lines for registered units
export function registerUpgradeLine(line) { UNIT_UPGRADES[line.id] = line; }
// cumulative mods of one unit def for a team's research levels
export function upgradeMods(team, def) {
  const m = { dmg: 0, hp: 0, armor: 0, speed: 0 };
  if (!team || !def.upgradeLines) return m;
  for (const lid of def.upgradeLines) {
    const L = UNIT_UPGRADES[lid], lvl = team.up && team.up[lid] | 0;
    if (!L || !lvl) continue;
    for (let i = 0; i < Math.min(lvl, L.tiers.length); i++) { const t = L.tiers[i].mods; for (const key in t) m[key] = (m[key] || 0) + t[key]; }
  }
  return m;
}
export const upgradeSum = (team) => { let s = 0; for (const k in team.up || {}) s += team.up[k] | 0; return s; };
