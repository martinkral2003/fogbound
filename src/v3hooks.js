// Sim-side extension points for the v0.3 rework. sim.js calls these; each lane module (see V3.md) may export any of:
//   init(st), update(st, dt), command(st, team, c) -> true if handled, onDamage(st, src, t, amt, o) -> amt (<=0 cancels), onKill(st, t, src)
import * as perks from './perks.js';
import * as dungeons from './dungeons.js';
import * as pois from './pois.js';
import * as travel from './travel.js';
import * as towns from './towns.js';
import * as horde from './horde.js';
import * as recruits from './recruits.js';
import * as pots from './pots.js'; // v5: potion drops + gold scarcity (was orbs.js)
import * as ults from './ults.js'; // v5: ultimate casters + equip commands (was orbs.js)
import * as mspells from './mspells.js'; // v0.6: enemy casters
import * as orders from './orders.js'; // v0.6: co-op orders to the allied AI
import * as castles from './castles.js'; // v0.6: town walls + shooting towers, the fortress
import * as levy from './levy.js'; // v0.6: the free peoples' soldier squads
import * as gear from './gear.js'; // UI lane: backpack, potions, dodge roll, run stats

const MODS = [perks, dungeons, pois, travel, towns, horde, recruits, pots, ults, gear, mspells, orders, castles, levy]; // v0.4: regions, raids and research are gone (CORE strip)
export function initV3(st) { for (const m of MODS) if (m.init) m.init(st); }
export function updateV3(st, dt) { for (const m of MODS) if (m.update) m.update(st, dt); }
export function commandV3(st, team, c) { for (const m of MODS) if (m.command && m.command(st, team, c)) return true; return false; }
export function damageV3(st, src, t, amt, o) { for (const m of MODS) if (m.onDamage) { amt = m.onDamage(st, src, t, amt, o); if (!(amt > 0)) return 0; } return amt; }
export function killV3(st, t, src) { for (const m of MODS) if (m.onKill) m.onKill(st, t, src); }
export function pickupV3(st, e, it) { for (const m of MODS) if (m.pickup && m.pickup(st, e, it)) return true; return false; } // a lane takes a picked-up item (backpack)
