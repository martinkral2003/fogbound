// ECON lane data: all tuning for the dark economy (pure data, no imports of sim modules).
// Resources: gold=Tithe, timber=Rotwood, stone=Black Stone, blood=Blood (food), souls=Souls.

// node kinds -> what they give and how fast a worker harvests (units/sec while gathering)
export const NODE_TYPES = {
  tree: { res: 'timber', rate: 1.2, cap: 15, slots: 5, name: 'Dead Grove', regrow: 0.12, r: 4 },
  mine: { res: 'gold', rate: 1.0, cap: 12, slots: 6, name: 'Tithe Mine', regrow: 0, r: 4.5 },
  quarry: { res: 'stone', rate: 0.75, cap: 10, slots: 5, name: 'Black Quarry', regrow: 0, r: 4.5 },
  bloodwell: { res: 'blood', rate: 1.05, cap: 15, slots: 4, name: 'Blood Well', regrow: 0.14, r: 3 },
  herd: { res: 'blood', rate: 1.5, cap: 15, slots: 4, name: 'Grazing Herd', regrow: 0.04, r: 4 },
  soulwell: { res: 'souls', rate: 0, cap: 0, slots: 0, name: 'Soul Well', regrow: 0, r: 3.5, infinite: true },
  graveyard: { res: 'souls', rate: 0, cap: 0, slots: 0, name: 'Haunted Graveyard', regrow: 0, r: 9, infinite: true },
};
export const FARM = { res: 'blood', rate: 1.0, cap: 15, slots: 5, passive: 0.3, maxPassive: 8 };

// per-start-region node layout, relative to the heart: dist (m from heart), ang (rad from the inward axis heart->centre)
export const REGION_SITES = [
  { rtype: 'tree', dist: 22, ang: 0.95, amount: 1300 },
  { rtype: 'tree', dist: 27, ang: -1.15, amount: 1300 },
  { rtype: 'tree', dist: 46, ang: 0.35, amount: 1800 },
  { rtype: 'quarry', dist: 33, ang: -0.3, amount: 2200 },
  { rtype: 'bloodwell', dist: 19, ang: -2.1, amount: 2600 },
  { rtype: 'herd', dist: 52, ang: 1.5, amount: 700 },
];
// contested sites between a lord and the temple (still per region so every lord gets the same)
export const CONTESTED_SITES = [
  { rtype: 'tree', dist: 90, ang: 0.45, amount: 2200 },
  { rtype: 'quarry', dist: 98, ang: -0.45, amount: 3200 },
  { rtype: 'soulwell', dist: 110, ang: 0.0, amount: 1 },
  { rtype: 'bloodwell', dist: 82, ang: -0.9, amount: 2600 },
];
export const MINE_AMOUNT = { 1: 3500, 2: 5200, 3: 9000, 4: 9000 };
export const NEUTRAL_LIMITS = { grove: 10, quarry: 5, graveyard: 8, minSep: 22 };

// economy rules
export const ECON = {
  carryMax: 20,
  workerSpeedFallback: 4.6,
  upkeepMil: 0.5, // blood per minute per pop point of a military unit
  upkeepWork: 0.18, // blood per minute per worker
  starveDrain: 0.012, // fraction of max hp lost per second while starving (floor 25%)
  starveDesertEvery: 14, // seconds between desertions while blood is 0
  buildExp: 0.8, // total build speed with n workers = n^buildExp
  repairHpPerSec: 26,
  repairTimberPerHp: 0.04,
  fleeRange: 9,
  fleeTime: 5,
  marketFee: 0.15,
  baseValue: { gold: 1, timber: 0.8, stone: 1.7, blood: 0.7, souls: 0 }, // souls cannot be traded
  priceDriftEvery: 10,
  tradeImpact: 0.0007, // price shift per unit traded
  tradeMax: 500,
};
// soul rules
export const SOULS = {
  killerShare: 0.4,
  siteShare: 0.5,
  siteBonus: 1.5, // x when the killer's team owns the ground it happened on
  hauntBonus: 1.5, // x on haunted graveyard nodes / owner graveyards
  necroBonus: 1.5,
  siteRadius: 30,
  wellRate: 0.4, // souls/sec per harvested well
  sacrifice: { necro: 1.0, orc: 0.9, demon: 1.25, cult: 1.6 },
  sacrificeBlood: 0.35, // fraction of the unit's blood value returned as blood
  tierValue: { worker: 1, melee: 1.5, ranged: 1.5, cavalry: 2.2, heavy: 3.2, siege: 3.0, caster: 3.0, flyer: 2.0, beast: 2.5, general: 9 },
};
// building type name -> what it stores (fallback when Buildings.def has no `store`)
export const STORE_PATTERNS = [
  [/keep|heart|citadel|castle/, ['gold', 'timber', 'stone', 'blood', 'souls']],
  [/storehouse|lumber|quarry|sawmill|stonecutter|warehouse/, ['timber', 'stone']],
  [/granary|bloodfarm|blood_farm|slaughter|mill|pens/, ['blood']],
  [/tithe|treasury|bank|counting/, ['gold']],
  [/soul_?altar|soul_?well|sacrific|bloodaltar|blood_altar/, ['souls']],
];
export const SOUL_SITE_RE = /soul_?altar|graveyard|sanctum|sacrific|blood_?altar|bone_?pit/;
export const SOUL_HARVEST_RE = /soul_?(harvest|pylon|tap|siphon|reaper|extract)|harvester|soul_?well/;
export const FARM_RE = /farm|pens/;
export const MARKET_RE = /market|bazaar/;
