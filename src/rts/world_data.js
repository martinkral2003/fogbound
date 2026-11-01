// WORLD lane data (pure): site templates (team-0 frame, rotated 4x for fairness), neutral unit defs, relics, weather, events.


// Templates are given in the NW (team 0) frame; each is rotated 90 degrees 4 times (rot90) so every lord gets an identical set.
// pos = desired position, rad = search radius, kind = neutral site kind, ring = 'home'|'mid'|'far' (distance flavour), n = unique template index per kind.
export const TEMPLATES = [
  { kind: 'village', type: 'hamlet', x: -98, z: -150, rad: 18, ring: 'home', guards: 3 },
  { kind: 'village', type: 'farmstead', x: -150, z: -95, rad: 18, ring: 'home', guards: 3 },
  { kind: 'village', type: 'crossroads', x: -62, z: -112, rad: 16, ring: 'mid', guards: 4 },
  { kind: 'ruin', type: 'ruin', x: -70, z: -70, rad: 16, ring: 'mid', tier: 2 },
  { kind: 'ruin', type: 'ruin', x: -40, z: -150, rad: 16, ring: 'mid', tier: 2 },
  { kind: 'ruin', type: 'ruin', x: -34, z: -52, rad: 12, ring: 'far', tier: 3 },
  { kind: 'graveyard', type: 'graveyard', x: -110, z: -48, rad: 18, ring: 'mid' },
  { kind: 'altar', type: 'altar', x: -48, z: -96, rad: 16, ring: 'mid' },
  { kind: 'leyline', type: 'leyline', x: -88, z: -108, rad: 16, ring: 'home' },
  { kind: 'leyline', type: 'leyline', x: -46, z: -30, rad: 14, ring: 'far' },
  { kind: 'beacon', type: 'beacon', x: -76, z: -30, rad: 20, ring: 'mid', hill: true },
  { kind: 'mercs', type: 'mercs', x: -125, z: -72, rad: 16, ring: 'home' },
  { kind: 'shrine', type: 'hermit', x: -52, z: -120, rad: 16, ring: 'mid' },
  { kind: 'grove', type: 'cursed', x: -100, z: -82, rad: 16, ring: 'home' },
  { kind: 'battlefield', type: 'haunted', x: -64, z: -44, rad: 14, ring: 'mid' },
  { kind: 'vein', type: 'vein', x: -118, z: -122, rad: 14, ring: 'home' },
  { kind: 'vein', type: 'vein', x: -26, z: -80, rad: 14, ring: 'far' },
  { kind: 'trader', type: 'soultrader', x: -138, z: -40, rad: 16, ring: 'mid' },
  { kind: 'throne', type: 'throne', x: -22, z: -22, rad: 10, ring: 'far' },
  { kind: 'fogbank', type: 'fogbank', x: -90, z: -62, rad: 12, ring: 'mid' },
  // axis templates (rotate onto N/E/S/W): portals link opposite ends, herds graze the lowlands
  { kind: 'portal', type: 'hellgate', x: -4, z: -92, rad: 14, ring: 'axis' },
  { kind: 'herd', type: 'deer', x: -75, z: -140, rad: 22, ring: 'home' },
  { kind: 'herd', type: 'boar', x: -140, z: -60, rad: 22, ring: 'home' },
  { kind: 'wolfpack', type: 'wolves', x: -60, z: -85, rad: 20, ring: 'mid' },
  { kind: 'bear', type: 'bear', x: -90, z: -180, rad: 20, ring: 'far' },
  { kind: 'caravan', type: 'caravan', x: -98, z: -150, rad: 0, ring: 'home', to: 5 },
];

export const SITE_R = { village: 13, ruin: 9, graveyard: 11, altar: 7, leyline: 8, beacon: 6, mercs: 9, shrine: 5, grove: 12, battlefield: 15, vein: 4, trader: 7, throne: 8, fogbank: 14, portal: 5, temple: 16 };
export const MIN_SEP = 12;        // between sites
export const HEART_CLEAR = 36;    // from hearts
export const TEMPLE_CLEAR = 20;   // from the map centre (except ring 'far' sites which may be nearer)

// ---- extra unit defs (registered with Units.registerUnits; shape = roster defs). Other neutrals reuse engine ids: wolf, boar, deer, bear, behemoth, king, wraith, ghoul, skeleton, troll, crypt, orcRaider, bogBeast, skelArcher.
const X = (id, name, role, hp, ar, dmg, rng, cd, spd, r, o = {}) => ({
  id, type: id, name, faction: 'wild', role, desc: '', tier: 1, age: 1, needs: null, cost: {}, popCost: o.pop ?? 0, time: 0, hp, armor: ar,
  atk: { dmg, range: rng, cd, dtype: o.dt || 'physical', splash: 0, projectile: rng >= 5 ? 'arrow' : null, bonus: null, pierce: 0, onhit: o.onhit || null },
  speed: spd, vision: o.vis || (rng >= 5 ? 24 : 20), r, abilities: [], tags: { [role]: 1, ...(o.tags || {}) }, res: o.res || {}, fly: false, souls: o.souls ?? 1, upkeep: 0, group: 'wild', upgradeLines: [],
  neutral: !!o.neutral, aggro: o.aggro ?? 12, leash: 32, bounty: o.bounty || null, xpValue: o.xp ?? 8, passive: !!o.passive, model: o.model || id,
});
export const NEUTRAL_UNITS = Object.fromEntries([
  X('wx_militia', 'Village Militia', 'melee', 90, 5, 8, 0.9, 1.1, 4.6, 0.6, { neutral: true, aggro: 9, bounty: { gold: 5 }, xp: 6 }),
  X('wx_levy', 'Village Levy', 'melee', 95, 5, 9, 0.9, 1.1, 4.6, 0.6, { pop: 1, model: 'wx_militia' }),
  X('wx_guard', 'Caravan Guard', 'melee', 170, 10, 13, 0.9, 1.1, 4.3, 0.65, { neutral: true, aggro: 12, bounty: { gold: 9 }, xp: 12, model: 'bandit' }),
  X('wx_wagon', 'Supply Wagon', 'siege', 420, 5, 0, 0.9, 3, 3.2, 1.4, { neutral: true, aggro: 0, passive: true, tags: { wagon: 1 }, xp: 0, souls: 0 }),
  X('wx_zombie', 'Grave Zombie', 'melee', 110, 3, 10, 0.9, 1.3, 3.6, 0.6, { neutral: true, aggro: 10, dt: 'poison', bounty: { souls: 1 }, tags: { undead: 1 }, res: { poison: 0.8, cold: 0.4, fire: -0.2 }, model: 'skeleton' }),
  X('wx_bound', 'Risen Skeleton', 'melee', 80, 6, 10, 0.8, 1.0, 4.4, 0.55, { tags: { undead: 1 }, souls: 0, res: { poison: 0.8, cold: 0.4, fire: -0.2 }, model: 'skeleton' }),
  X('wx_merc_pike', 'Pikeman Mercenary', 'melee', 170, 14, 12, 1.4, 1.1, 4.6, 0.65, { pop: 1, souls: 1 }),
  X('wx_merc_xbow', 'Crossbow Mercenary', 'ranged', 90, 4, 18, 15, 1.8, 4.4, 0.6, { pop: 1, souls: 1, vis: 26 }),
  X('wx_merc_knight', 'Sellsword Knight', 'cavalry', 280, 24, 20, 1.1, 1.2, 6.4, 0.85, { pop: 2, souls: 2 }),
  X('wx_merc_ogre', 'Ogre Mercenary', 'heavy', 560, 14, 34, 1.4, 1.8, 3.8, 1.2, { pop: 2, souls: 3, tags: { big: 1 } }),
  X('wx_revenant', 'Bought Revenant', 'heavy', 380, 18, 26, 1.2, 1.1, 4.8, 0.85, { pop: 2, souls: 0, tags: { undead: 1 }, res: { poison: 0.8, cold: 0.4 }, model: 'skeleton' }),
].map((d) => [d.id, d]));


// ---- relics (ruins). kind: aura | mana | scroll | gear
export const RELICS = {
  ashbanner: { name: 'Warbanner of Ash', kind: 'aura', dmg: 1.12, radius: 16, desc: '+12% damage to your units near the bearer.' },
  bloodring: { name: 'Ring of the Red Tide', kind: 'mana', mana: 1.6, desc: '+1.6 mana/s while carried.' },
  scroll: { name: 'Scroll of Forbidden Rites', kind: 'scroll', desc: 'Teaches a spell when picked up.' },
  ironheart: { name: 'Ironheart Cuirass', kind: 'gear', armor: 12, hp: 1.2, regen: 1.0, desc: '+12 armour, +20% HP, regeneration.' },
  nightcrown: { name: 'Crown of the Long Night', kind: 'aura', dmg: 1.08, vision: 1.15, radius: 20, desc: '+8% damage, +15% vision near the bearer.' },
  soulphial: { name: 'Phial of Captured Souls', kind: 'souls', souls: 0.35, desc: '+0.35 souls/s while carried.' },
};
export const RELIC_ORDER = ['ashbanner', 'bloodring', 'scroll', 'ironheart', 'nightcrown', 'soulphial'];

// ---- mercenary offers: unit id, cost, stock, refill seconds
export const MERC_OFFERS = [
  { unit: 'wx_merc_pike', cost: { gold: 90 }, n: 2, stock: 4, refill: 120 },
  { unit: 'wx_merc_xbow', cost: { gold: 110 }, n: 2, stock: 4, refill: 130 },
  { unit: 'wx_merc_knight', cost: { gold: 260 }, n: 1, stock: 2, refill: 200 },
  { unit: 'wx_merc_ogre', cost: { gold: 200, blood: 60 }, n: 1, stock: 2, refill: 220 },
];
export const TRADER_OFFERS = [{ unit: 'wx_revenant', cost: { souls: 45 }, n: 1, stock: 3, refill: 240 }];

// ---- weather / time
export const DAY_LEN = 480;
export const WEATHER = {
  clear: { w: 4, dur: [90, 180] }, rain: { w: 3, dur: [60, 130] }, fog: { w: 2, dur: [70, 140] }, storm: { w: 1.4, dur: [45, 90] }, blizzard: { w: 1.2, dur: [60, 110] },
};
export const DREAD_TIMES = [480, 960, 1440, 1920, 2400];
export const DREAD = { warn: 25, dur: 90, dmg: 1.25, aggro: 1.4, souls: 2 };
export const BEAM_TIME = 720;
export const RITUAL_TIME = 180;
export const TIMES = { village: { capture: 8, levyEvery: 150, income: { gold: 0.6, blood: 0.4 }, allyCost: { gold: 200 }, levyCost: { gold: 50 } } };
