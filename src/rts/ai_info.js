// AI lane: defensive adapters over the other lanes (feature-detect everything; degrade gracefully while lanes are stubs).
// No top-level use of imported bindings (circular imports).
import * as Units from './units.js';
import * as Buildings from './buildings.js';
import * as Econ from './econ.js';
import * as Walls from './walls.js';
import * as Siege from './siege.js';
import * as Magic from './magic.js';
import * as Nav from './nav.js';
import { RES } from './consts.js';
import * as BD from './bdata.js';
import * as Tech from './tech.js';
import * as RosterMod from './roster.js';

export const has = (m, name) => m && typeof m[name] === 'function';
export const safe = (fn, fb) => { try { const r = fn(); return r === undefined ? fb : r; } catch (e) { return fb; } };

// canonical guesses used only when a lane does not (yet) publish its data
const CANON = {
  archery: 'archery', tithe: 'tithe_house', soulaltar: 'soul_altar', house: 'house', storehouse: 'storehouse', lumber: 'lumber', quarry: 'quarry', granary: 'granary', farm: 'farm', barracks: 'barracks', stables: 'stables',
  workshop: 'siege_workshop', forge: 'forge', market: 'market', sanctum: 'sanctum', library: 'library', graveyard: 'graveyard', temple: 'temple',
  arrow: 'arrow_tower', cannon: 'cannon_tower', magic: 'magic_tower', ballista: 'ballista_tower', wall: 'wall', gate: 'gate', corner: 'corner', stairs: 'stairs', keep: 'keep',
};
const PAT = {
  archery: /archery|range|lodge|butts/, tithe: /tithe|treasury|hoard/, soulaltar: /soul_altar|sacrifice_altar/,
  house: /house|hut|hovel|tent|burrow|barrow|dwelling|shack|bonepile/, storehouse: /storehouse|warehouse|depot|stockpile/, lumber: /lumber|sawmill|woodcamp/, quarry: /quarry|stonecutter/,
  granary: /granary|bloodfarm|blood_farm|bloodpit|slaughter/, farm: /farm|pasture|pen$/, barracks: /barrack|warren|pit$|^orc_pit|hall$|garrison_hall/, stables: /stable|kennel|wolfden|den$/,
  workshop: /workshop|siege|foundry|forge_works|engine/, forge: /forge|smith|armou?ry/, market: /market|bazaar/, sanctum: /sanctum|shrine_of|altar_hall/, library: /library|scriptorium|archive/,
  graveyard: /graveyard|ossuary/, temple: /temple|cathedral|chapel/, arrow: /arrow|archer|watch|bone_tower|palisade_tower/, cannon: /cannon|hellfire|mortar/, magic: /magic|spire|arcane|rune/, ballista: /ballista/,
  wall: /(^|_)wall$|palisade/, gate: /gate/, corner: /corner|bastion/, stairs: /stair|ladder/, keep: /^keep$|citadel|fortress/,
};
const WALL_ROLES = { wall: 'wall', gate: 'gate', corner: 'corner', stairs: 'stairs' };

export function bdefs() { const b = Buildings.BUILDINGS; return b && Object.keys(b).length > 1 ? b : BD.BUILDINGS || b || {}; }
export function facKey(st, teamId) { return st.teams[teamId].faction.key; }
function compatible(def, fk) {
  const f = def.faction ?? def.factions ?? def.fac;
  if (f === undefined || f === null || f === '*' || f === 'all' || f === 'any') return true;
  if (Array.isArray(f)) return f.includes(fk) || f.includes('all');
  return f === fk;
}
// resolve a building role ('house','barracks','arrow',...) to a type id for this team's faction; cached per ai
export function resolveB(st, ai, role) {
  const c = ai.rcache || (ai.rcache = { t: -99, m: {} });
  if (st.t - c.t > 20) { c.t = st.t; c.m = {}; }
  if (role in c.m) return c.m[role];
  const fk = facKey(st, ai.team), defs = bdefs(), ids = Object.keys(defs);
  let best = null, bs = 0;
  for (const id of ids) {
    const d = defs[id];
    if (!d || !compatible(d, fk)) continue;
    let s = 0;
    if (d.role === role || d.cat === role || d.category === role || d.ai === role) s = 100;
    else if (id === role || id === fk + '_' + role || id === CANON[role] || id === fk + '_' + CANON[role]) s = 90;
    else if (WALL_ROLES[role] && d.wall && d.wall.piece === WALL_ROLES[role]) s = 80;
    else if (PAT[role] && PAT[role].test(id)) s = 50;
    else if (role === 'house' && d.pop > 0 && !d.trains) s = 70;
    if (s && d.wall && !WALL_ROLES[role] && !/arrow|cannon|magic|ballista/.test(role)) s -= 40;
    if (s && fk && id.startsWith(fk + '_')) s += 5;
    if (s > bs || (s === bs && s && best && id.length < best.length)) { bs = s; best = id; }
  }
  if (!best && ids.length <= 1) best = CANON[role] || role; // lanes not landed: use canonical guess
  c.m[role] = best;
  return best;
}
export function bdef(type) { return bdefs()[type] || safe(() => Buildings.def(type), null) || null; }
export function cost(d) { return (d && (d.cost || d.price)) || {}; }
export function affordable(team, c, mult = 1) {
  for (const r of RES) if ((team.res[r] || 0) < (c[r] || 0) * mult) return false;
  return true;
}
export function costTotal(c) { let s = 0; for (const r of RES) s += c[r] || 0; return s; }

// ---------------------------------------------------------------- roster
const FALLBACK_ROSTER = {
  necro: [['skeleton', 'melee'], ['skeleton_archer', 'ranged'], ['ghoul', 'heavy'], ['wraith', 'cavalry'], ['bone_catapult', 'siege'], ['necro_adept', 'caster']],
  orc: [['grunt', 'melee'], ['orc_archer', 'ranged'], ['troll', 'heavy'], ['wolf_rider', 'cavalry'], ['ram', 'siege'], ['shaman', 'caster']],
  demon: [['imp', 'flyer'], ['hellhound', 'melee'], ['fiend', 'heavy'], ['hellfire_archer', 'ranged'], ['hellcannon', 'siege'], ['warlock', 'caster']],
  cult: [['zealot', 'melee'], ['cultist_archer', 'ranged'], ['flagellant', 'heavy'], ['priest', 'caster'], ['inquisitor', 'cavalry'], ['battering_ram', 'siege']],
};
export function roster(st, ai) {
  const c = ai.roster;
  if (c && st.t - c.t < 20) return c.list;
  const fk = facKey(st, ai.team);
  let src = Units.ROSTER, list = [];
  if (!src || !Object.keys(src).length) src = RosterMod.ROSTER;
  list = safe(() => RosterMod.list(fk), []).map((u) => ({ ...u }));
  if (!list.length && src) {
    let r = src[fk] || src[ai.team];
    if (!r && Array.isArray(src)) r = src.filter((u) => u.faction === fk || u.faction === ai.team);
    if (r) for (const [k, v] of Array.isArray(r) ? r.map((v) => [v.id || v.type, v]) : Object.entries(r)) list.push({ ...v, id: v.id || v.type || k });
    if (!list.length && !Array.isArray(src)) for (const [k, v] of Object.entries(src)) if (v && typeof v === 'object' && (k.startsWith(fk + '_') || v.faction === fk)) list.push({ ...v, id: v.id || k });
  }
  if (!list.length) list = FALLBACK_ROSTER[fk].map(([id, role]) => ({ id: fk + '_' + id, role, fallback: true }));
  for (const u of list) { if (!u.role) u.role = safe(() => Units.def(u.id).role, 'melee'); }
  ai.roster = { t: st.t, list };
  return list;
}
export const popCost = (u) => u.popCost ?? u.pop ?? 1;
export function unitCost(u) { return u.cost || {}; }
export function workerId(st, ai) { return facKey(st, ai.team) + '_worker'; }
export function isMil(u) { return u.role !== 'worker' && u.role !== 'general'; }

// ---------------------------------------------------------------- nodes
const NODE_RES = { tree: 'timber', mine: 'gold', quarry: 'stone', bloodwell: 'blood', soulwell: 'souls', farm: 'blood', herd: 'blood', graveyard: 'souls' };
export const nodeRes = (n) => n.res || NODE_RES[n.rtype] || 'gold';
export function nodeLeft(n) { return n.amount === undefined ? 1 : n.amount; }

// ---------------------------------------------------------------- tech / upgrades / spells
export function techList() {
  const T = Tech.TECHS || Buildings.TECH || Buildings.TECHS || null;
  if (!T) return [];
  return (Array.isArray(T) ? T.map((v) => [v.id, v]) : Object.entries(T)).map(([id, v]) => ({ ...v, id }));
}
export function upgradeList() {
  const U = Units.UNIT_UPGRADES;
  if (!U) return [];
  return (Array.isArray(U) ? U.map((v) => [v.id, v]) : Object.entries(U)).map(([id, v]) => ({ ...v, id }));
}
export function spellList() {
  const S = Magic.SPELLS;
  if (!S) return [];
  return (Array.isArray(S) ? S.map((v) => [v.id, v]) : Object.entries(S)).map(([id, v]) => ({ ...v, id }));
}
export function siegePick(st, teamId, enemyId) { return has(Siege, 'pickTarget') ? safe(() => Siege.pickTarget(st, teamId, enemyId), null) : null; }
export function breaches(st, teamId) { return has(Walls, 'breaches') ? safe(() => Walls.breaches(st, teamId), null) : null; }
export function canPlace(st, team, type, x, z, rot) { return safe(() => Buildings.canPlace(st, team, type, x, z, rot), null); }
export function rates(st, teamId) { return has(Econ, 'rates') ? safe(() => Econ.rates(st, teamId), null) : null; }
export function findPathOk(st, unit, x, z) { return has(Nav, 'reachable') ? safe(() => Nav.reachable(st, unit, x, z), true) : true; }
