// Hand-designed COMPACT map layout (MAP lane). Pure data, no imports.
// Everything is authored in the "design frame": x east, z south, the island is 300 x 300 m (+-150).
//   NE  = DEMON REALM (scorched ash): a ridge ring ("Rampart") with THREE PASSES (~65 m apart), the Demon Gate (fortress heart) behind the main pass,
//         the Demon Lord's plateau in the middle of the bowl.
//   SW  = HUMAN REALM: the capital Highmark (town + walled citadel plateau), mirrored opposite the demon citadel so the two realms are equal.
//   Centre = WASTELAND HUB: no longer anyone's safe zone (v0.7) - the Sunken Temple dungeon + a knot of tough camps/chests, reached by crossing the
//         open ground between the two realms. Two monster-held "forts" (CAMPS_RAW, tag 'fort') sit on that crossing as waypoints/prizes.
//   N = frozen ridges + Frostwatch, S = mire + Saltmarsh, E = highlands + Emberfall, SE = deadwood, NW = abbey ruins.
//   A ring of weak (tier 1, unbumped) CAMPS_STARTER camps sits just outside Highmark's safe zone - low-level wanderers to learn combat on
//   (Gothic-style gentle start) before the wasteland and the demon realm get properly dangerous.
// world.js may mirror the whole design across the NE-SW diagonal (x,z) -> (-z,-x) for half of all seeds (gates stay NE, capital stays SW, the start village
// moves from the west edge to the south edge). Angles are degrees (0 = +x east, 90 = +z south).

export const LORD = [104, -104];                   // the Demon Lord's plateau
export const KEEP = LORD;                          // legacy names
export const WARLORD = LORD;
export const BOSS = { x: 0, z: 0 };                 // v0.7: Drowned King back in the centre (the wasteland hub) now the capital has moved back to the SW

export const TERRAIN = {
  edge: { r: 0.94, soft: 0.05, warp: 0.07 },       // superellipse coast: |x|^4 + |z|^4 = (r*H)^4
  // plateaus: flat top, cliff rim, graded ramps (angles at the plateau centre). No ramps = a soft green hill.
  citadels: [
    { id: 'demon', x: 104, z: -104, r: 17, rise: 8, skirt: 4, rampW: 7, ramps: [90, 180] },       // the Demon Lord's arena, ramps face the bowl (south, west)
    { id: 'capital', x: -104, z: 104, r: 34, rise: 7, skirt: 5, rampW: 8, ramps: [-90, 0, 90, 180] }, // v0.7: back in the SW (mirrors the demon citadel NE) - two equal realms, the centre is open wasteland now
    { id: 'oakvale', x: -112, z: -8, r: 17, rise: 3, skirt: 16, rampW: 0, ramps: [] },             // the start village's green hill
  ],
  // "Rampart" ridge ring with three passes (angles at the ring centre): the demon bowl. Gates sit just inside the passes.
  ramparts: [
    { id: 'demon', x: 108, z: -108, r: 88, w: 7.5, h: 11, flat: 0.28, from: 25, to: 245, passes: [90, 135, 180], gap: 7, wobble: 4 },
  ],
  // canyons: a pair of cliff walls either side of a centre line (gap = wall centre offset, w = wall half-width)
  canyons: [
    { pts: [[-44, 74], [-52, 90]], gap: 9, w: 4.2, h: 7 },         // the alley before Highmark's east ramp
    { pts: [[-128, -42], [-122, -66]], gap: 8, w: 3.8, h: 6 },     // short gorge by the first crypt
  ],
  // crater around the centre: ring with a gap on each diagonal, sunken floor
  crater: { r: 15, w: 4.5, h: 0, floorR: -50, floor: 1.0, gapDeg: 13 },   // v0.6: no crater (the capital stands in the centre): h 0 = no ring, floorR < 0 = no sunken floor
  // lakes: ellipse (rx along x for ang 0, rz across), depth; fords are shallow sand-bars (segment a-b, width w, level)
  lakes: [
    { x: -22, z: -122, rx: 8, rz: 16, ang: 0, d: -2.2, fords: [{ a: [-40, -122], b: [-4, -122], w: 5, lv: 0.62 }] },     // frozen north lake
    { x: 133, z: 50, rx: 7, rz: 15, ang: 0, d: -2.2, fords: [{ a: [114, 50], b: [150, 50], w: 5, lv: 0.62 }] },           // east lake
    { x: -34, z: 128, rx: 15, rz: 6, ang: 0, d: -2.2, fords: [{ a: [-34, 114], b: [-34, 142], w: 5, lv: 0.62 }] },         // south mire lake
    { x: 62, z: 84, rx: 8, rz: 6, ang: 20, d: -1.6 },              // mire / deadwood tarns
    { x: -62, z: 14, rx: 6, rz: 8, ang: 0, d: -1.6 },              // twin ponds flanking the road to Highmark
    { x: 38, z: 44, rx: 7, rz: 5, ang: -30, d: -1.6 },
    { x: -78, z: -112, rx: 8, rz: 5, ang: -15, d: -1.6 },          // frost tarn
    { x: 112, z: 112, rx: 7, rz: 5, ang: 30, d: -1.6 },            // deadwood pond
  ],
  ridges: [],
  scatter: { mountains: 3, mesas: 5, domes: 9 },   // seeded landforms in the free parts of the island
  roadHalf: 1.5, roadShoulder: 3.0,
  fort: { R: 6.5, skirt: 4, rise: [0, 3, 4.2, 5.5, 5.5], ramp: 0.5, knollR: 3.6, knollSkirt: 6, knollRise: 2.4 },
};

// biome anchors (design frame): the nearest anchor (distance / r, with a noisy boundary) wins. b = BIOME key name (resolved in world.js).
export const BIOME_ANCHORS = [
  { b: 'MOOR', x: -104, z: 104, r: 70 },       // heartland around the capital (v0.7: SW)
  { b: 'MOOR', x: -108, z: 0, r: 52 },         // Oakvale's fields
  { b: 'ASH', x: 104, z: -104, r: 80 },
  { b: 'ASH', x: 60, z: -60, r: 34 },
  { b: 'ABBEY', x: -100, z: -100, r: 52 },
  { b: 'DEAD', x: 100, z: 104, r: 56 },
  { b: 'FROST', x: -12, z: -118, r: 50 },
  { b: 'HIGH', x: 132, z: 16, r: 40 },
  { b: 'MIRE', x: -4, z: 128, r: 52 },
];

// ------------------------------------------------------------------ sites
// towns: kind capital | town | village. r = flat, safe radius (the ground is flattened to this size).
export const TOWNS = [
  { key: 'capital',     name: 'Highmark',    kind: 'capital', x: -104, z: 104,  r: 34, start: true },
  { key: 'stonebridge', name: 'Stonebridge', kind: 'town',    x: -66,  z: 48,   r: 26 },
  { key: 'saltmarsh',   name: 'Saltmarsh',   kind: 'town',    x: 30,   z: 112,  r: 26 },
  { key: 'oakvale',     name: 'Oakvale',     kind: 'village', x: -112, z: -8,   r: 22 },
  { key: 'emberfall',   name: 'Emberfall',   kind: 'village', x: 84,   z: -6,   r: 22 },
  { key: 'frostwatch',  name: 'Frostwatch',  kind: 'village', x: -50,  z: -86,  r: 22 },
];
export const START_TOWN = 'capital';
export const CAPITAL = 'capital';

// the front path: from the main Demon Gate ('gate:main') through these stops (town keys or [x,z] design-frame waypoints)
export const FRONT = ['gate:main', [62, -40], 'emberfall', [0, 0], [-50, 50], 'capital']; // v0.7: the front now crosses the whole island through the wasteland hub, SW capital to NE gate
// road network (same notation as FRONT); the front path is routed first and is also a road
export const ROADS = [
  ['gate:main', [90, -40], [84, -22], 'emberfall'],
  ['capital', [-108, 48], 'oakvale'],
  ['stonebridge', [-85, 76], 'capital'],
  ['oakvale', [-92, -52], 'frostwatch'],
  ['frostwatch', [-70, -20], [-90, 40], 'capital'],
  ['emberfall', [44, 52], 'saltmarsh'],
  ['saltmarsh', [-37, 108], 'capital'],
];

// the Demon Lands: three gates (positions come from the ring passes in world.js, 6 m inside each pass), the Lord's plateau, and demon guard posts in the bowl
export const DEMON = {
  gates: [{ key: 'main', ang: 135, tier: 3 }],   // v0.6: ONE orc fortress (the former main gate); the other two passes are just passes
  inset: 6,
  lord: LORD,
  lands: [14, -150, 150, -14],
  poly: [[16, -150], [150, -150], [150, -18], [108, -12], [72, -22], [48, -42], [26, -72], [10, -108]],
  camps: [
    { kind: 'camp', tier: 2, x: 128, z: -66 },
    { kind: 'camp', tier: 2, x: 66, z: -126 },
    { kind: 'camp', tier: 1, x: 80, z: -84 },
  ],
};

// wild monster camps and loot (tier = monster tier / richness; fort = hill-fort camp; exact = stay put). Camps keep clear of towns; the start village most of all.
const CAMPS_RAW = [
  // start region (W): first fights, 50+ m from Oakvale
  [-64, -26, 1], [-96, 40, 1, 'fort'], [-146, 20, 1],
  // NW abbey / north frost
  [-94, -80, 2, 'fort'], [-110, -120, 2], [-8, -90, 2, 'fort'], [-60, -126, 2],
  // heartland edges (weak)
  [-130, 70, 1], [-46, 96, 1, 'fort'], [-26, 70, 1],
  // centre ring
  [-36, -20, 2], [34, 22, 2, 'fort'], [-4, 54, 2],
  // east highlands
  [118, 6, 2, 'fort'], [100, 38, 2], [124, 56, 3],
  // SE deadwood
  [84, 84, 3, 'fort'], [118, 98, 3], [58, 128, 3],
  // south mire
  [-4, 120, 2], [-62, 120, 2],
  // v0.7: two monster-held "fortresses" on the road between the human capital (SW) and the demon lands (NE) - the territory in between to fight over
  [-30, 30, 2, 'fort'], [30, -30, 2, 'fort'],
];
// v0.7.1 "calmer, more Gothic" pass: the v0.6 "every camp +1 tier, plus 22-camp danger ring" overlay is GONE - camps keep their
// hand-authored tier (CAMPS_RAW already goes gentle-near-start/tougher-further-out on its own) and there are far fewer of them,
// so the world has real empty, breathable ground between fights instead of wall-to-wall tier-3 packs.
const CAMPS_EXTRA = [
  [60, -44, 2], [78, 30, 2], [96, 62, 2, 'fort'], [-20, -60, 2], [100, -62, 2], [-130, 110, 1],
];
// a gentle ring just outside the SW capital - tier 1, small (Gothic-style: a few weak wanderers to learn combat on before the real wasteland)
const CAMPS_STARTER = [[-40, 85, 1], [-70, 40, 1], [-95, 40, 1]];
export const CAMPS = [...CAMPS_RAW, ...CAMPS_EXTRA, ...CAMPS_STARTER]
  .filter(([x, z]) => Math.hypot(x + 104, z - 104) > 58); // clear of the capital's own safe zone (SW, not the origin any more)
export const CENTER_CAMPS = [[0, 44, 2], [-38, -22, 2]]; // v0.7.1: thinned out further - the wasteland hub is dangerous but not wall-to-wall
export const CENTER_CHESTS = [[30, 30, 3], [-30, -30, 3]];
export const CHESTS = [
  // safe-ish loot near the towns
  [-100, -34, 1], [-130, 14, 1], [-78, 30, 1], [-52, 56, 1], [30, 76, 1], [74, 14, 1],
  // wilds
  [-80, -96, 2], [-34, -66, 2], [-120, -90, 2], [-14, -30, 2], [60, 54, 2], [124, 24, 2],
  [-20, 130, 2], [-110, 98, 2], [100, 70, 3], [136, -12, 3], [-60, -128, 2], [20, -50, 3],
  [126, 118, 3], [64, 120, 3],
  // demon lands
  [92, -52, 3], [128, -96, 4], [60, -112, 4],
];
export const SHRINES = [
  [-92, -18], [-60, -60], [-20, 74], [34, 4], [90, 54], [-60, 110], [6, -64], [112, 80], [-130, 40], [70, -20], [-8, -40], [60, 100],
];

// dungeons [x, z, tier, theme, name]; the single 'sunken' dungeon is CENTER_DUNGEON
export const DUNGEONS = [
  [-112, -62, 1, 'crypt', 'Barrow of the Lost'],       // first dungeon, a short walk from Oakvale
  [-102, -100, 2, 'crypt', 'Abbey Undercroft'],
  [-6, -86, 2, 'forge', 'Frostforge'],
  [96, 100, 2, 'warren', 'Deadwood Warren'],
  [134, 20, 2, 'warren', 'Highland Den'],
  [-22, 112, 2, 'crypt', 'Drowned Crypt'],
];
export const CENTER_DUNGEON = [0, 0, 3, 'sunken'];   // v0.7: back in the dead centre of the wasteland, now that the capital has moved back to the SW

// monster lairs [x, z, tier]
export const LAIRS = [
  [-70, -56, 1], [100, 30, 2], [64, 70, 2], [-60, 108, 1], [-104, 62, 1], [-30, -112, 2],
];

// points of interest [type, x, z]: only the types that still exist in v0.5 (cage, hoard, watchtower, caravan = position only; shrines are world.features.shrines)
export const POIS = [
  ['cage', 70, 36], ['cage', -88, -72], ['cage', 126, -40], ['cage', -10, 66],
  ['hoard', -134, 52], ['hoard', 100, 112],
  ['watchtower', -70, 16], ['watchtower', 40, 12], ['watchtower', 66, -36],
  ['caravan', -58, 42], ['caravan', 4, 72],
];

// waystones beyond the town ones and the gate-approach ones: [x, z, name]
export const WAYSTONES = [
  [-22, -4, 'Crater Road'], [-124, -56, 'Barrow Waystone'], [-34, -62, 'Frostwatch Road'], [96, 92, 'Deadwood Waystone'], [-30, 108, 'Mire Waystone'], [112, 20, 'Highland Waystone'],
];

// compatibility names (data.js re-exports these)
export const QUADRANT_LAYOUT = [];
export const SHARED_LAYOUT = [];
export const CENTER_LAYOUT = [];
export const ORC = DEMON;   // deprecated alias
export const SITE_LAYOUT = { towns: TOWNS, demon: DEMON, orc: DEMON, front: FRONT, roads: ROADS, camps: CAMPS, chests: CHESTS, shrines: SHRINES, dungeons: DUNGEONS, lairs: LAIRS, pois: POIS, waystones: WAYSTONES };
