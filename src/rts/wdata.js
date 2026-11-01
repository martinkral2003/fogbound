// FOGBOUND: DOMINION wall / tower definitions (WALLS lane). Pure data, no sim imports (circular-safe).
// Registered into the building registry by walls.js (ensureDefs). Each def: standard bdata fields + `wall` (piece info) + optional `turret`.
export const LOOK = { necro: 'bone', orc: 'orc', demon: 'hell', cult: 'blood' }; // faction key -> model look key (wall.look)
// tiers: 0 timber, 1 stone, 2 black stone. Multipliers are relative to the stone value stored in the def.
export const TIERS = [
  { id: 'timber', name: 'Timber', hp: 0.35, armor: 0, siegeRes: 1.3, fire: 1.0 },
  { id: 'stone', name: 'Stone', hp: 1.0, armor: 12, siegeRes: 1.0, fire: 0.12 },
  { id: 'black', name: 'Black Stone', hp: 1.7, armor: 22, siegeRes: 0.7, fire: 0.0 },
];
// cost to raise a piece from tier -> tier+1 (per piece), applied by {t:'wallUpgrade'}
export const TIER_UP = [{ stone: 10, timber: 0 }, { stone: 22, gold: 8 }];
export const TOWER_TIERS = [{ dmg: 1, hp: 1, range: 1 }, { dmg: 1.25, hp: 1.3, range: 1.06 }, { dmg: 1.55, hp: 1.7, range: 1.12 }, { dmg: 1.9, hp: 2.2, range: 1.18 }];
export const TOWER_UP = [{ stone: 40, gold: 30 }, { stone: 80, gold: 60 }, { stone: 140, gold: 110, souls: 5 }];

const WALLISH = (piece, o) => Object.assign({ piece, tier: 1, walkable: true, height: 4.5, passable: false }, o);

export const WALL_DEFS = {
  palisade: { name: 'Palisade', w: 4, d: 1.0, h: 3, hp: 380, armor: 0, cost: { timber: 6 }, buildTime: 4, age: 1, influence: 0, vision: 4, burns: true, model: 'palisade', wall: WALLISH('palisade', { tier: 0, walkable: false, height: 3 }) },
  wall: { name: 'Stone Wall', w: 4, d: 1.3, h: 4.5, hp: 1100, armor: 12, cost: { stone: 14 }, buildTime: 6, age: 1, influence: 0, vision: 4, burns: false, model: 'wall', wall: WALLISH('wall', {}) },
  corner: { name: 'Corner Bastion', w: 3, d: 3, h: 6, hp: 1400, armor: 14, cost: { stone: 30, timber: 8 }, buildTime: 12, age: 1, influence: 0, vision: 8, burns: false, model: 'corner', wall: WALLISH('corner', { height: 6 }) },
  gate: { name: 'Gate', w: 4, d: 2, h: 4.5, hp: 800, armor: 4, cost: { timber: 30, stone: 20 }, buildTime: 8, age: 1, influence: 0, vision: 6, burns: true, model: 'gate', wall: WALLISH('gate', { passable: true, open: false }) },
  gatehouse: { name: 'Gatehouse', w: 6, d: 4, h: 7, hp: 2200, armor: 16, cost: { stone: 110, timber: 40 }, buildTime: 22, age: 1, influence: 4, vision: 14, garrison: 6, burns: false, model: 'gatehouse',
    wall: WALLISH('gatehouse', { passable: true, open: false, height: 7 }), turret: 'arrow' },
  stairs: { name: 'Wall Stairs', w: 4, d: 2, h: 4.5, hp: 500, armor: 6, cost: { stone: 10 }, buildTime: 4, age: 1, influence: 0, vision: 0, burns: false, model: 'stairs', wall: WALLISH('stairs', {}) },
  ladder: { name: 'Ladder', w: 1.4, d: 0.9, h: 4.5, hp: 120, armor: 0, cost: { timber: 3 }, buildTime: 2, age: 1, influence: 0, vision: 0, burns: true, model: 'ladder', wall: WALLISH('ladder', {}) },
  spikes: { name: 'Spike Line', w: 4, d: 1.6, h: 0.8, hp: 160, armor: 0, cost: { timber: 8 }, buildTime: 3, age: 1, influence: 0, vision: 0, burns: true, model: 'spikes', wall: WALLISH('spikes', { tier: 0, walkable: false, height: 0.8, dps: 9, slow: 0.55 }) },
  moat: { name: 'Moat', w: 4, d: 4, h: 0.2, hp: 200, armor: 0, cost: { stone: 4 }, buildTime: 3, age: 2, influence: 0, vision: 0, burns: false, model: 'moat', wall: WALLISH('moat', { tier: 1, walkable: false, height: 0, slow: 0.45 }) },
};

// turret spec per kind. dmg per shot, range m, cd s, splash m; hitsAir; prio: target preference
export const TURRETS = {
  arrow: { kind: 'arrow', dmg: 15, range: 26, cd: 1.1, dtype: 'physical', proj: 'arrow', speed: 40, hitsAir: true, prio: 'unit', garrisonDmg: 0.12, garrisonRange: 0.8 },
  cannon: { kind: 'cannon', dmg: 85, range: 30, cd: 3.4, dtype: 'physical', splash: 3.6, proj: 'cannonball', speed: 26, hitsAir: false, prio: 'siege', siegeMul: 2.2, garrisonDmg: 0.06, garrisonRange: 0.5, minRange: 6 },
  magic: { kind: 'magic', dmg: 42, range: 27, cd: 2.2, dtype: 'dark', splash: 2.2, proj: 'bolt', speed: 30, hitsAir: true, prio: 'unit', garrisonDmg: 0.05, garrisonRange: 0.3 },
  ballista: { kind: 'ballista', dmg: 130, range: 40, cd: 4.2, dtype: 'physical', proj: 'bolt_big', speed: 55, hitsAir: false, prio: 'big', bigMul: 1.7, garrisonDmg: 0.08, garrisonRange: 0.6 },
  none: null,
};
// magic tower projectile flavour per school (matches magic_data SCHOOLS[].tower)
export const SCHOOL_BOLT = { necromancy: 'bone_bolt', warmagic: 'storm_bolt', infernal: 'hell_bolt', blood: 'blood_bolt' };

const TOWER = (name, o) => Object.assign({ name, armor: 10, age: 1, influence: 8, vision: 30, burns: false, garrison: 4, wall: WALLISH('tower', { height: 8 }) }, o);
export const TOWER_DEFS = {
  tower: TOWER('Wall Tower', { w: 3, d: 3, h: 8, hp: 1000, cost: { stone: 60, timber: 20 }, buildTime: 14, model: 'tower', turret: 'arrow', garrison: 3 }),
  arrow_tower: TOWER('Arrow Tower', { w: 4, d: 4, h: 10, hp: 1300, cost: { stone: 90, timber: 40 }, buildTime: 18, model: 'arrow_tower', turret: 'arrow', wall: WALLISH('tower', { height: 10 }) }),
  cannon_tower: TOWER('Cannon Tower', { w: 4.5, d: 4.5, h: 9, hp: 1600, armor: 14, cost: { stone: 140, timber: 40, gold: 60 }, buildTime: 26, age: 2, needs: ['forge'], model: 'cannon_tower', turret: 'cannon', wall: WALLISH('tower', { height: 9 }) }),
  magic_tower: TOWER('Magic Tower', { w: 4, d: 4, h: 11, hp: 1100, cost: { stone: 110, gold: 80, souls: 4 }, buildTime: 24, age: 2, needs: ['sanctum'], model: 'magic_tower', turret: 'magic', garrison: 2, wall: WALLISH('tower', { height: 11 }) }),
  ballista_tower: TOWER('Ballista Tower', { w: 4, d: 4, h: 10, hp: 1200, cost: { timber: 120, stone: 60, gold: 40 }, buildTime: 22, age: 2, needs: ['forge'], model: 'ballista_tower', turret: 'ballista', wall: WALLISH('tower', { height: 10 }) }),
  watchtower: TOWER('Watchtower', { w: 3, d: 3, h: 12, hp: 600, cost: { timber: 60, stone: 20 }, buildTime: 12, vision: 38, model: 'watchtower', turret: 'none', garrison: 2, influence: 12, burns: true, wall: WALLISH('tower', { height: 12 }) }),
};
// aliases other lanes may use for the same turret kinds
export const TURRET_ALIAS = { arrow: 'arrow', cannon: 'cannon', magic: 'magic', ballista: 'ballista', tower_arrow: 'arrow', tower_cannon: 'cannon', tower_magic: 'magic', tower_ballista: 'ballista' };
export const ALL_DEFS = Object.assign({}, WALL_DEFS, TOWER_DEFS);
export const isWallType = (t) => !!ALL_DEFS[t];

export function pieceMaxHp(def, tier, towerTier = 0) {
  const base = def.hp / TIERS[def.wall.tier == null ? 1 : def.wall.tier].hp; // def hp is the hp at the def's own tier
  if (def.turret) return Math.round(def.hp * TOWER_TIERS[towerTier].hp);
  return Math.round(base * TIERS[tier].hp);
}
