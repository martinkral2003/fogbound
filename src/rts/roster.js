// UNITS lane: ROSTER registry. ROSTER = {id: def} for every TRAINABLE unit (4 factions x 7 military + worker + 3 generals), plus registerUnits() for the Siege lane.
// Pure data, no sim imports (circular-safe). Lookup: def(type) resolves roster ids, wild/neutral ids, short aliases ('imp' -> demon_imp) and src/data.js MONSTERS ids.
import { FKEYS } from './roster_lib.js';
import { NECRO } from './roster_necro.js';
import { ORC } from './roster_orc.js';
import { DEMON } from './roster_demon.js';
import { CULT } from './roster_cult.js';
import { WILD } from './roster_wild.js';
import { MONSTERS } from '../data.js';

export { FKEYS, WILD };
export const ROSTER = {};
const BY_FACTION = { necro: [], orc: [], demon: [], cult: [] };
const EXTRA = {};       // registered by other lanes (siege units) and monster-derived defs
for (const arr of [NECRO, ORC, DEMON, CULT]) for (const d of arr) { ROSTER[d.id] = d; BY_FACTION[d.faction].push(d); }

// Siege (or any) lane: Units.registerUnits({id: partialDef}). Missing fields get defaults; ids starting with a faction key join that faction's list.
export function registerUnits(defs) {
  for (const id in defs) {
    const o = defs[id];
    const d = Object.assign({
      id, type: id, name: id, faction: FKEYS.find((k) => id.startsWith(k + '_')) || 'all', role: 'siege', desc: '', tier: 2, age: o.tier || 2, needs: 'siege_workshop', cost: { gold: 100, timber: 100 }, popCost: 2, time: 30, hp: 300, armor: 10,
      speed: 3, vision: 20, r: 1.2, abilities: [], tags: { siege: 1 }, res: {}, fly: false, souls: 2, upkeep: 1, group: 'siege', upgradeLines: [],
    }, o, { id, type: id });
    d.atk = Object.assign({ dmg: 40, range: 22, cd: 4, dtype: 'siege', splash: 2, projectile: 'boulder', bonus: null, pierce: 0, onhit: null }, o.atk || {});
    if (!d.tags[d.role]) d.tags = { ...d.tags, [d.role]: 1 };
    EXTRA[id] = d;
    const list = BY_FACTION[d.faction];
    if (list) { ROSTER[id] = d; const i = list.findIndex((x) => x.id === id); if (i >= 0) list[i] = d; else list.push(d); }   // only faction units are trainable (neutral/wild defs stay out of ROSTER)
    delete SUFFIX.done;
  }
}
const SUFFIX = {};
function suffixIndex() {
  if (SUFFIX.done) return SUFFIX;
  for (const id in ROSTER) { const s = id.replace(/^(necro|orc|demon|cult)_/, ''); if (!SUFFIX[s]) SUFFIX[s] = ROSTER[id]; }
  for (const id in WILD) { const s = id.replace(/^wild_/, ''); if (!SUFFIX[s]) SUFFIX[s] = WILD[id]; }
  SUFFIX.done = true; return SUFFIX;
}
// monster ids from src/data.js (e.g. 'orcRaider') -> neutral defs, cached
function monsterDef(id) {
  const m = MONSTERS[id];
  if (!m) return null;
  const d = {
    id, type: id, name: m.name, faction: 'wild', role: m.ranged ? 'ranged' : m.boss ? 'heavy' : 'melee', desc: '', tier: 1, age: 1, needs: null, cost: {}, popCost: 0, time: 0, hp: m.hp * 2, armor: m.armor || 0,
    atk: { dmg: m.atk * 1.2, range: m.range * 0.5 + (m.ranged ? 4 : 0.3), cd: m.cd, dtype: m.dtype || 'physical', splash: 0, projectile: m.ranged ? 'arrow' : null, bonus: null, pierce: 0, onhit: null },
    speed: m.spd * 0.9, vision: m.aggro + 8, r: m.r, abilities: [], tags: { [m.ranged ? 'ranged' : 'melee']: 1 }, res: Object.fromEntries(Object.entries(m.res || {}).map(([k, v]) => [k, v / 100])),
    fly: false, souls: 1, upkeep: 0, group: 'wild', upgradeLines: [], neutral: true, aggro: m.aggro, leash: 32, bounty: { gold: m.gold }, xpValue: m.xp, boss: !!m.boss, model: m.model,
  };
  EXTRA[id] = d; return d;
}
export function def(type) {
  return ROSTER[type] || WILD[type] || EXTRA[type] || (/_general$/.test(type) && ROSTER[type + '_0']) || monsterDef(type) || suffixIndex()[type] || null;
}
export function list(fkey) { return fkey ? (BY_FACTION[fkey] || []).slice() : Object.values(ROSTER); }
export const generalsOf = (fkey) => BY_FACTION[fkey].filter((d) => d.role === 'general');
export const militaryOf = (fkey) => BY_FACTION[fkey].filter((d) => d.role !== 'general' && d.role !== 'worker');
