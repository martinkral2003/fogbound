// FOGBOUND: DOMINION building definitions (BUILDINGS lane). Pure data + registry, no sim imports (circular-safe).
// def fields: id,name,faction('all'|'necro'|'orc'|'demon'|'cult'),w,d,h,hp,armor,cost{res},buildTime(s),age(1-3),needs[building types|tech ids],
// pop (adds popMax), store[res], trains[unit ids hint; roster `needs` also counts], research[tech ids], garrison, vision, influence(m radius),
// provides{mana,manaRegen,souls,heal,rage,revive,...}, desc, model, limit, border(true = may be placed on the edge of territory), names{factionKey:name}.
import { FACTION_BUILDINGS } from './bdata_f.js';

export const FKEYS = ['necro', 'orc', 'demon', 'cult'];
export const BUILDINGS = {};

function B(id, o) {
  const d = Object.assign({
    id, name: id, faction: 'all', w: 5, d: 5, h: 4, hp: 800, armor: 2, cost: { timber: 100 }, buildTime: 30, age: 1, needs: [], pop: 0, store: [], trains: [], research: [],
    garrison: 0, vision: 18, influence: 14, provides: null, desc: '', model: id, limit: 0, border: false, names: null, burns: true,
  }, o);
  BUILDINGS[id] = d;
  return d;
}
export { B as defineBuilding };

// ---------------------------------------------------------------- shared buildings (all factions; names/costs vary by faction)
B('keep', { name: 'Keep', w: 9, d: 9, h: 8, hp: 3000, armor: 8, cost: { gold: 0 }, buildTime: 60, pop: 10, store: ['gold', 'timber', 'stone', 'blood', 'souls'], trains: ['worker', 'general'],
  research: ['age_iron', 'age_cursed', 'eco_carry1', 'eco_gather1'], garrison: 20, vision: 40, influence: 50, provides: { mana: 100, manaRegen: 0.5, revive: 1 }, limit: 1, burns: false,
  names: { necro: 'Bone Keep', orc: 'Warchief Fortress', demon: 'Infernal Citadel', cult: 'Sanctum Keep' }, desc: 'Heart of your realm. Stores everything, trains workers and generals, advances the Age.' });
B('house', { name: 'House', w: 4, d: 4, h: 3.2, hp: 350, cost: { timber: 50 }, buildTime: 16, pop: 6, influence: 12, vision: 12,
  names: { necro: 'Bone Hovel', orc: 'Hide Hut', demon: 'Imp Burrow', cult: 'Pilgrim Cell' }, desc: 'Houses 6 more subjects (population).' });
B('storehouse', { name: 'Storehouse', w: 6, d: 5, h: 3.5, hp: 600, cost: { timber: 80 }, buildTime: 22, store: ['timber', 'stone'], influence: 16,
  names: { necro: 'Bone Depot', orc: 'Plunder Shed', demon: 'Brimstone Store', cult: 'Tithe Barn' }, desc: 'Drop-off for Rotwood and Black Stone.' });
B('granary', { name: 'Granary', w: 6, d: 6, h: 4, hp: 600, cost: { timber: 90 }, buildTime: 22, store: ['blood'], influence: 16,
  names: { necro: 'Carrion Larder', orc: 'Meat Rack', demon: 'Flesh Vault', cult: 'Blood Cellar' }, desc: 'Drop-off for Blood (food).' });
B('tithe_house', { name: 'Tithe House', w: 5, d: 5, h: 4, hp: 700, cost: { timber: 70, stone: 30 }, buildTime: 24, store: ['gold'], influence: 16, provides: { tradeBonus: 0.05 },
  names: { necro: 'Grave Treasury', orc: 'Loot Hoard', demon: 'Pact Vault', cult: 'Offering Hall' }, desc: 'Drop-off for Tithe (gold).' });
B('farm', { name: 'Blood Farm', w: 8, d: 8, h: 1.6, hp: 300, armor: 0, cost: { timber: 70 }, buildTime: 18, influence: 10, vision: 10, node: { rtype: 'farm', res: 'blood', amount: 700, workers: 5 }, burns: false,
  names: { necro: 'Carrion Pit', orc: 'Meat Pen', demon: 'Flesh Farm', cult: 'Blood Farm' }, desc: 'Workers harvest Blood here. Up to 5 workers.' });
B('soul_altar', { name: 'Soul Altar', w: 5, d: 5, h: 4.5, hp: 900, armor: 4, cost: { stone: 90, blood: 60 }, buildTime: 28, store: ['souls'], influence: 16, provides: { sacrifice: 1, souls: 0.05 },
  names: { necro: 'Soul Cairn', orc: 'Skull Altar', demon: 'Soul Forge', cult: 'Sacrifice Altar' }, desc: 'Stores Souls; sacrifice units here for Souls and power.' });
B('barracks', { name: 'Barracks', w: 8, d: 6, h: 5, hp: 1200, armor: 4, cost: { timber: 150, stone: 40 }, buildTime: 34, garrison: 10, influence: 16, trains: ['infantry'],
  names: { necro: 'Bone Barracks', orc: 'War Pit', demon: 'Legion Hold', cult: 'Zealot Hall' }, desc: 'Trains infantry.' });
B('archery', { name: 'Archery Range', w: 8, d: 5, h: 4.5, hp: 900, cost: { timber: 140, stone: 20 }, buildTime: 30, garrison: 6, influence: 14, trains: ['ranged'],
  names: { necro: 'Bone Butts', orc: 'Hunting Lodge', demon: 'Cinder Range', cult: 'Crossbow Cloister' }, desc: 'Trains ranged units.' });
B('stable', { name: 'Stable', w: 8, d: 6, h: 4.5, hp: 1000, cost: { timber: 160, stone: 30 }, buildTime: 34, age: 2, needs: ['barracks'], garrison: 4, influence: 14, trains: ['cavalry'],
  names: { necro: 'Wraith Stable', orc: 'Warg Kennel', demon: 'Hellhound Kennel', cult: 'Mount Chapel' }, desc: 'Trains cavalry and beasts.' });
B('forge', { name: 'Forge', w: 7, d: 6, h: 5, hp: 1100, armor: 4, cost: { timber: 120, stone: 100 }, buildTime: 36, age: 1, needs: ['barracks'], influence: 14, limit: 3,
  research: ['forge_blade1', 'forge_armor1', 'forge_blade2', 'forge_armor2', 'forge_blade3', 'forge_armor3', 'forge_ranged1', 'forge_ranged2', 'forge_wall1', 'forge_wall2'],
  names: { necro: 'Bone Forge', orc: 'Slag Forge', demon: 'Hellforge', cult: 'Reliquary Forge' }, desc: 'Weapon, armour and wall upgrades; unit upgrade lines.' });
B('siege_workshop', { name: 'Siege Workshop', w: 10, d: 8, h: 6, hp: 1300, armor: 3, cost: { timber: 220, stone: 120 }, buildTime: 44, age: 2, needs: ['forge'], influence: 16, trains: ['siege'],
  names: { necro: 'Bone Works', orc: 'Warwagon Yard', demon: 'Infernal Foundry', cult: 'Fanatic Workshop' }, desc: 'Builds siege engines.' });
B('sanctum', { name: 'Sanctum', w: 6, d: 6, h: 7, hp: 1000, armor: 3, cost: { stone: 120, timber: 80, gold: 100 }, buildTime: 40, age: 2, needs: ['keep'], influence: 16, trains: ['caster'],
  research: ['magic_1', 'magic_2', 'magic_3'], provides: { mana: 100, manaRegen: 0.6 }, limit: 3,
  names: { necro: 'Lich Sanctum', orc: 'Totem Sanctum', demon: 'Pentagram Sanctum', cult: 'Blood Sanctum' }, desc: 'Raises mana capacity and regeneration; trains casters; spell research.' });
B('library', { name: 'Library', w: 6, d: 5, h: 5.5, hp: 800, cost: { timber: 120, stone: 80 }, buildTime: 34, age: 2, needs: ['keep'], influence: 14, limit: 1,
  research: ['age_cursed', 'eco_carry2', 'eco_gather2', 'eco_build1', 'mil_speed1', 'mil_vision1', 'eco_farm1'],
  names: { necro: 'Crypt Library', orc: 'Shaman Hut', demon: 'Hall of Pacts', cult: 'Scriptorium' }, desc: 'Advanced technologies; required for the Cursed Age.' });
B('market', { name: 'Market', w: 8, d: 6, h: 4.5, hp: 700, cost: { timber: 150, gold: 80 }, buildTime: 30, age: 2, needs: ['tithe_house'], influence: 14, limit: 1, store: ['gold'],
  provides: { trade: 1 }, names: { necro: 'Grave Market', orc: 'Loot Bazaar', demon: 'Pact Bazaar', cult: 'Alms Market' }, desc: 'Trade resources for Tithe.' });
B('temple', { name: 'Temple', w: 7, d: 7, h: 7, hp: 1100, armor: 4, cost: { stone: 140, gold: 90 }, buildTime: 38, age: 2, needs: ['keep'], garrison: 8, influence: 16, limit: 2,
  provides: { heal: 1, healRadius: 16, reviveSpeed: 1.5 }, research: ['holy_heal'],
  names: { necro: 'Crypt Shrine', orc: 'Spirit Hall', demon: 'Hell Shrine', cult: 'Cathedral Shrine' }, desc: 'Heals nearby units and speeds general revival.' });

for (const arr of FACTION_BUILDINGS) B(arr[0], arr[1]);

// ---------------------------------------------------------------- registry (WALLS lane registers piece/tower defs here)
export function registerDefs(defs) {
  for (const id in defs) {
    const d = defs[id];
    if (BUILDINGS[id]) Object.assign(BUILDINGS[id], d);
    else B(id, Object.assign({ cost: { timber: 20 }, buildTime: 10, influence: 0, vision: 14 }, d));
  }
}
// resolve a def for a faction (variant name; same stats). faction may be a key ('orc'), id (1) or team object
export function fkeyOf(f) { return typeof f === 'number' ? FKEYS[f] : f && f.faction ? f.faction.key : f && f.key ? f.key : f; }
export function def(type, faction) {
  const d = BUILDINGS[type];
  if (!d) return { id: type, name: type, faction: 'all', w: 4, d: 4, h: 4, hp: 500, armor: 0, cost: {}, buildTime: 20, age: 1, needs: [], pop: 0, store: [], trains: [], research: [], garrison: 0, vision: 14, influence: 0, provides: null, model: type, limit: 0, burns: true };
  const k = fkeyOf(faction);
  if (k && d.names && d.names[k]) return Object.assign({}, d, { name: d.names[k] });
  return d;
}
export function availableFor(faction) {
  const k = fkeyOf(faction);
  return Object.values(BUILDINGS).filter((d) => d.faction === 'all' || d.faction === k);
}
export function modelKey(type, faction) {
  const d = BUILDINGS[type];
  if (!d) return type;
  return d.faction === 'all' && d.perFaction !== false ? fkeyOf(faction) + '_' + (d.model || type) : d.model || type;
}
