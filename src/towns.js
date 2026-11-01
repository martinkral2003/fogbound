// v4 lane module "towns" (TOWNS lane): human settlements. See src/V4.md ("TOWNS lane API").
// st.towns[] = site fields {id,name,x,z,r,kind,wsId,start} + { state:'safe'|'besieged'|'fallen', def, hp, maxHp, pop, services:{shop,trainer,board}, stock, quests (board offers), tr:{skills},
//   fallT, saved, disc, safeR, npcs[], guards[], gq[], lay (layout shared with towns_view.js), ... }.
// Populations: team-4 guards are real sim units (kind 'unit', e.guard=true, e.town=id); merchants / trainer / board / villagers are light records in town.npcs (not st.ents).
// Hooks: init, update, command, onDamage, onKill (see v3hooks.js). Sim only: no DOM, no Three, no Math.random.
import { simApi } from './sim.js';
import * as SIM from './sim.js';
import { TOWN, UNITS, MONSTERS, ITEM_SLOTS, RARITY } from './data.js';
import * as loot from './loot.js';
import * as perks from './perks.js';
import * as gear from './gear.js';
import * as recruits from './recruits.js'; // v0.5 SERVANTS lane: militia plan / respawn delay
import { mulberry32, TAU, clamp } from './util.js';

// ---------------------------------------------------------------- unit defs for the town garrison (hidden: never hired)
UNITS.tguard = { name: 'Town Guard', hidden: true, role: 'tank', hp: 250, atk: 19, range: 2.4, spd: 6.0, cd: 1.1, cost: 0, r: 0.7, model: 'shieldman', armor: 22 };
UNITS.tarcher = { name: 'Town Archer', hidden: true, role: 'ranged', hp: 150, atk: 21, range: 15, spd: 6.0, cd: 1.5, cost: 0, r: 0.62, model: 'crossbow', ranged: true, proj: { spd: 30, color: 0xcfd6e0 } };
UNITS.tcaptain = { name: 'Guard Captain', hidden: true, role: 'elite', hp: 520, atk: 36, range: 2.6, spd: 6.4, cd: 0.95, cost: 0, r: 0.85, model: 'captain', armor: 26 };

export const NPC_NAMES = ['Aldric', 'Brenna', 'Cedric', 'Dara', 'Edmund', 'Fenna', 'Garrick', 'Hilde', 'Ivar', 'Jorun', 'Kael', 'Lysa', 'Marek', 'Nessa', 'Osric', 'Petra', 'Quill', 'Rowan', 'Sela', 'Tobias', 'Ulla', 'Varek', 'Wren', 'Yara', 'Bram', 'Cora', 'Dunstan', 'Elsa', 'Gunnar', 'Helga'];
const TOWN_NAMES = ['Oakvale', 'Harrowmere', 'Stonebridge', 'Ashford', 'Greywatch', 'Willowmere', 'Highcairn', 'Duskhaven'];
export const BG_ROLE = { merchant: 'Merchant', villager: 'Villager', smith: 'Smith', priest: 'Priest' };
const TALK_ROLES = { merchant: 1 };

const ev = (st, e) => simApi.ev(st, e);
const D2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
const kindOf = (t) => TOWN.kinds[t.kind] || TOWN.kinds.village;
const isHeroTeam = (id) => id >= 0 && id <= 3;
const msg = (st, text, kind = 'info', team) => ev(st, team === undefined ? { type: 'msg', text, kind } : { type: 'msg', text, kind, team });
const msgH = (st, team, text, kind = 'info') => { if (team && team.human) ev(st, { type: 'msg', text, kind, team: team.id }); };
const R5 = (v) => Math.round(v / 5) * 5;

// ---------------------------------------------------------------- lookups (exported)
export const townList = (st) => st.towns || [];
export const townById = (st, id) => (st.towns || []).find((t) => t.id === id) || null;
export function townAt(st, x, z) {
  let best = null, bd = 1e9;
  for (const t of st.towns || []) { const d = D2(x, z, t.x, t.z); if (d < t.r && d < bd) { bd = d; best = t; } }
  return best;
}
export function nearestTown(st, x, z, standingOnly = false) {
  let best = null, bd = 1e9;
  for (const t of st.towns || []) { if (standingOnly && t.state === 'fallen') continue; const d = D2(x, z, t.x, t.z); if (d < bd) { bd = d; best = t; } }
  return best;
}
/** inside the safe radius of a town that is not besieged / fallen */
export function isSafeZone(st, x, z) {
  for (const t of st.towns || []) if (t.state === 'safe' && D2(x, z, t.x, t.z) < t.safeR) return true;
  return false;
}
export const capitalOf = (st) => (st.towns || []).find((t) => t.kind === 'capital') || null;
export const startTownOf = (st) => (st.towns || []).find((t) => t.start) || (st.towns || [])[0] || null;
export function isWaystoneUsable(st, wsId) { const w = (st.waystones || []).find((q) => q.id === wsId); return !w || !w.down; }
export function townDefenders(st, id) {
  const t = townById(st, id), out = [];
  if (!t) return out;
  for (const gid of t.guards) { const e = st.byId.get(gid); if (e && e.alive) out.push(e); }
  return out;
}

// ---------------------------------------------------------------- items / prices
// Backpack = team.bag (gear.js): gear {slot,tier,rarity,affixes,name,score,uid}. Potions are team.pots {heal, surge} (gear.addPotion).
export const potionDef = (k) => TOWN.potions[k];
export function makePotion(k) { const d = TOWN.potions[k]; return { kind: 'potion', k, name: d.name, tier: d.tier || 1, rarity: d.rarity || 0, desc: d.desc, icon: d.icon }; }
export function itemValue(it) {
  if (!it) return 0;
  if (it.kind === 'potion') return (TOWN.potions[it.k] || {}).price || 30;
  return R5(30 + it.tier * 38 + it.rarity * it.rarity * 24 + it.rarity * it.tier * 14);
}
export const sellPrice = (it) => Math.max(1, Math.round(itemValue(it) * TOWN.sellMul));
export const buyPrice = (town, entry) => Math.max(1, Math.round(entry.price * (1 - (town.disc || 0))));
export function bagOf(team) { return team.bag || (team.bag = []); }
const bagCap = () => (gear.GEAR_CFG && gear.GEAR_CFG.bag) || TOWN.bagMax;
/** put a gear piece in the backpack (uid assigned); false when it is full */
export function giveItem(st, team, it) {
  const bag = bagOf(team);
  if (bag.length >= bagCap()) return false;
  const b = Object.assign({}, JSON.parse(JSON.stringify(it)), { uid: it.uid || st.nextId++ });
  bag.push(b);
  return true;
}
export function givePotion(team, k, n = 1) { return typeof gear.addPotion === 'function' ? gear.addPotion(team, k, n) : 0; }
const potFull = (team, k) => ((team.pots && team.pots[k]) | 0) >= ((gear.GEAR_CFG && gear.GEAR_CFG.potMax) || 6);
const canHold = (team, it) => (it.kind === 'potion' ? !potFull(team, it.k) : bagOf(team).length < bagCap());

function weightedRarity(rng, w) {
  let r = rng() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return i; }
  return 0;
}
function rollStock(st, town) {
  const K = kindOf(town), rng = st.rng, out = [];
  const add = (item, qty) => out.push({ item, price: Math.max(1, Math.round(itemValue(item) * TOWN.priceMul)), qty });
  for (const k of K.potions) add(makePotion(k), K.potQty);
  for (let i = 0; i < K.gear; i++) {
    const slot = ITEM_SLOTS[i % ITEM_SLOTS.length], tier = clamp(K.gearTier + (rng() < 0.3 ? 1 : 0), 1, 4);
    add(loot.makeItem(rng, slot, tier, weightedRarity(rng, K.rarity)), 1);
  }
  return out;
}
// ---------------------------------------------------------------- site list (MAP lane: world.sites.towns; stand-ins until it lands)
function siteTowns(world) {
  const s = world.sites || {};
  if (Array.isArray(s.towns) && s.towns.length) return s.towns;
  const out = [];
  const regs = s.regions || [];
  const keeps = regs.filter((r) => r.kind === 'keep');
  if (keeps.length) {
    keeps.forEach((k, i) => out.push({ id: k.id, name: k.name, x: k.x, z: k.z, r: k.r, kind: i === keeps.length - 1 ? 'capital' : 'town', wsId: k.wsId }));
    const free = regs.filter((r) => r.kind === 'free').sort((a, b) => Math.hypot(a.x + 150, a.z + 150) - Math.hypot(b.x + 150, b.z + 150)).slice(0, 2);
    free.forEach((k, i) => out.push({ id: k.id, name: k.name, x: k.x, z: k.z, r: k.r, kind: 'village', wsId: k.wsId, start: i === 0 }));
  } else {
    const H = world.half || 400;
    [['village', -0.45, -0.45, true], ['town', 0.35, -0.2], ['capital', -0.4, 0.4]].forEach(([kind, fx, fz, start], i) => out.push({ id: 100 + i, name: TOWN_NAMES[i], x: fx * H, z: fz * H, r: kind === 'village' ? 26 : kind === 'town' ? 36 : 52, kind, wsId: 0, start: !!start }));
  }
  return out;
}

// ---------------------------------------------------------------- layout (deterministic; shared by sim NPC placement and towns_view.js)
export function layoutOf(st, town) {
  if (town.lay) return town.lay;
  const w = st.world, rnd = mulberry32(town.id * 7919 + 17);
  const R = clamp(town.r, 20, 80), cap = town.kind === 'capital', walled = town.kind !== 'village';
  const ok = (x, z) => (!w.walkable || w.walkable(x, z)) && (!w.slopeAt || w.slopeAt(x, z) < 0.55) && (!w.heightAt || w.heightAt(x, z) > 0.2);
  const pr = cap ? 11 : town.kind === 'town' ? 8.5 : 6.5;
  const Rw = R * 0.9;
  const nG = cap ? 4 : town.kind === 'town' ? 3 : 0;
  const a0r = rnd() * TAU, a0 = cap ? 0 : a0r; // v0.6: the capital gates face its four ramps (angles 0, 90, 180, 270)
  const gates = []; for (let i = 0; i < nG; i++) gates.push(a0 + (i * TAU) / nG);
  const lay = { R, pr, Rw, stalls: [], houses: [], gates, wall: walled ? { r: Rw, gates, gateHalf: 0.085 * (50 / Rw) + 0.05 } : null, citadel: null, lamps: [], posts: [], banners: [], roads: [], fires: [] };
  const cx = town.x, cz = town.z;
  const P = (a, d) => [cx + Math.cos(a) * d, cz + Math.sin(a) * d];
  // stalls round the plaza (the NPC stands just behind the counter)
  const roles = ['merchant'];
  if (walled) roles.push('smith');
  if (cap) roles.push('priest', 'merchant2');
  const sa = rnd() * TAU;
  roles.forEach((role, i) => {
    const a = sa + (i * TAU) / roles.length, rs = pr - 1.2;
    const [x, z] = P(a, rs), [nx, nz] = P(a, rs + 1.7);
    lay.stalls.push({ role, x, z, rot: a, nx, nz });
  });
  lay.well = { x: cx, z: cz };
  // roads from the gates (or from 3 directions in a village) to the plaza
  const dirs = nG ? gates : [a0, a0 + 2.1, a0 + 4.2];
  for (const a of dirs) { const [x1, z1] = P(a, nG ? Rw : R * 0.85); lay.roads.push([cx, cz, x1, z1]); }
  const nearRoad = (x, z, m) => { for (const [x0, z0, x1, z1] of lay.roads) { const dx = x1 - x0, dz = z1 - z0, t = clamp(((x - x0) * dx + (z - z0) * dz) / (dx * dx + dz * dz), 0, 1); if (D2(x, z, x0 + dx * t, z0 + dz * t) < m) return true; } return false; };
  // citadel (capital) opposite the first gate
  if (cap) { const [x, z] = P(a0 + Math.PI / 4, Rw * 0.56); lay.citadel = { x, z, rot: a0 + Math.PI / 4 + Math.PI, r: 13 }; }
  // houses
  const nH = cap ? 34 : town.kind === 'town' ? 17 : 8;
  const kinds = ['inn', 'smithy', 'chapel', 'tower'];
  for (let tries = 0; tries < 700 && lay.houses.length < nH; tries++) {
    const a = rnd() * TAU, d = pr + 6.5 + Math.sqrt(rnd()) * (Rw - pr - 12 + (walled ? 0 : R * 0.1));
    const [x, z] = P(a, d);
    if (!ok(x, z) || nearRoad(x, z, 4.6)) continue;
    if (lay.houses.some((h) => D2(h.x, h.z, x, z) < 7.2)) continue;
    if (lay.citadel && D2(x, z, lay.citadel.x, lay.citadel.z) < lay.citadel.r + 6) continue;
    const i = lay.houses.length, kind = i < kinds.length && (walled || i < 1) ? kinds[i] : rnd() < 0.3 ? 'long' : 'house';
    const big = kind === 'inn' ? 1.35 : kind === 'chapel' ? 1.2 : 1;
    lay.houses.push({ x, z, rot: a + Math.PI + (rnd() - 0.5) * 0.5, w: (3.6 + rnd() * 1.6) * big * (kind === 'long' ? 1.7 : 1), d: (3.4 + rnd() * 1.2) * big, h: 2.4 + rnd() * 0.9, kind, c: Math.floor(rnd() * 5) });
  }
  // guard posts: just inside the gates (walled) or round the village, plus the plaza
  if (nG) for (const a of gates) { const [x, z] = P(a, Rw - 3.5); lay.posts.push({ x, z }); } else for (let i = 0; i < 3; i++) { const [x, z] = P(a0 + 1 + i * 2.1, R * 0.55); lay.posts.push({ x, z }); }
  for (let i = 0; i < 2; i++) { const [x, z] = P(a0 + 0.7 + i * Math.PI, pr + 3); lay.posts.push({ x, z }); }
  // lamps along the roads and on the plaza ring, banners at gates and the plaza
  for (const [x0, z0, x1, z1] of lay.roads) {
    const L = D2(x0, z0, x1, z1), n = Math.max(2, Math.floor(L / 9)), nx = (z1 - z0) / L, nz = -(x1 - x0) / L;
    for (let i = 1; i <= n; i++) { const t = (i / (n + 1)), s = i % 2 ? 2.7 : -2.7; lay.lamps.push({ x: x0 + (x1 - x0) * t + nx * s, z: z0 + (z1 - z0) * t + nz * s }); }
  }
  for (let i = 0; i < 4; i++) { const [x, z] = P(a0 + 0.4 + (i * TAU) / 4, pr - 0.3); lay.lamps.push({ x, z }); }
  for (const a of gates) { for (const s of [-1, 1]) { const [x, z] = P(a + s * 0.07, Rw - 1.2); lay.banners.push({ x, z, rot: a }); } }
  for (let i = 0; i < 3; i++) { const [x, z] = P(a0 + 0.2 + (i * TAU) / 3, pr + 1.2); lay.banners.push({ x, z, rot: a0 + (i * TAU) / 3 }); }
  lay.fires.push({ x: cx, z: cz });
  town.lay = lay;
  return lay;
}

// ---------------------------------------------------------------- NPCs
function makeNpcs(st, town) {
  const lay = layoutOf(st, town), rnd = st.rng, K = kindOf(town);
  const used = new Set(), name = () => { for (let i = 0; i < 40; i++) { const n = NPC_NAMES[Math.floor(rnd() * NPC_NAMES.length)]; if (!used.has(n)) { used.add(n); return n; } } return NPC_NAMES[0]; };
  const out = [];
  const mk = (role, x, z, a, extra = {}) => out.push(Object.assign({ id: st.townN++, town: town.id, role, name: name(), x, z, hx: x, hz: z, a, alive: true, fleeing: false, moving: false, wt: rnd() * 4, tx: x, tz: z, look: Math.floor(rnd() * 5) }, extra));
  for (const s of lay.stalls) if (s.role !== 'merchant2') mk(s.role, s.nx, s.nz, s.rot + Math.PI, { stall: true });
  const stall2 = lay.stalls.find((s) => s.role === 'merchant2');
  if (stall2) mk('merchant', stall2.nx, stall2.nz, stall2.rot + Math.PI, { stall: true, alt: true });
  for (let i = 0; i < K.villagers; i++) {
    const a = rnd() * TAU, d = lay.pr + 3 + rnd() * (lay.R * 0.55);
    const x = town.x + Math.cos(a) * d, z = town.z + Math.sin(a) * d;
    mk('villager', x, z, rnd() * TAU, { stall: false });
  }
  return out;
}

function stepVillagers(st, town, dt) {
  const w = st.world, K = TOWN;
  for (const n of town.npcs) {
    if (!n.alive || n.stall) continue;
    const fleeing = town.state === 'besieged' || (town.threat && D2(n.x, n.z, town.threat.x, town.threat.z) < 20);
    n.fleeing = fleeing;
    let tx = n.tx, tz = n.tz, speed = 1.4;
    if (fleeing) { tx = town.x + (n.hx - town.x) * 0.15; tz = town.z + (n.hz - town.z) * 0.15; speed = 4.4; }
    else {
      n.wt -= dt;
      if (n.wt <= 0 && (D2(n.x, n.z, n.tx, n.tz) < 0.6)) {
        n.wt = 3 + st.rng() * 7;
        const a = st.rng() * TAU, d = st.rng() * 7;
        const x = n.hx + Math.cos(a) * d, z = n.hz + Math.sin(a) * d;
        if (!w.walkable || w.walkable(x, z)) { n.tx = x; n.tz = z; }
      }
      tx = n.tx; tz = n.tz;
    }
    const dx = tx - n.x, dz = tz - n.z, d = Math.hypot(dx, dz);
    if (d < 0.4) { n.moving = false; continue; }
    const nx = n.x + (dx / d) * speed * dt, nz = n.z + (dz / d) * speed * dt;
    if (w.walkable && !w.walkable(nx, nz)) { n.tx = n.x; n.tz = n.z; n.moving = false; continue; }
    n.x = nx; n.z = nz; n.a = Math.atan2(dz, dx); n.moving = true;
  }
}

// ---------------------------------------------------------------- guards
function spawnGuard(st, town, key, i, role) {
  const K = kindOf(town), lay = layoutOf(st, town);
  const post = lay.posts[i % lay.posts.length];
  const a = st.rng() * TAU, x = post.x + Math.cos(a) * 1.5, z = post.z + Math.sin(a) * 1.5;
  const e = simApi.spawnUnit(st, key, 4, x, z, { guard: true });
  e.mode = 'hold'; e.hold = { x, z }; e.dest = null; e.town = town.id; e.tg = role; e.post = i % lay.posts.length; e.pt = 4 + st.rng() * 8;
  e.lvl = K.lvl + (role === 'captain' ? 1 : 0);
  e.tierMul = K.tierMul * (role === 'captain' ? 1.15 : 1);
  e.timeMul = 1 + TOWN.guardGrowth * (st.t / 60);
  e.title = role === 'captain' ? 'Guard Captain' : '';
  if (role === 'captain') e.elite = 1;
  simApi.recalc(e); e.hp = e.maxHp; e.growT = st.t;
  town.guards.push(e.id);
  return e;
}
// v0.5: the guards are free militia (recruits.js militia.plan: 3 village / 5 town / 8 capital), respawning militia.respawn s after each death while the town stands
function guardPlan(town) {
  if (recruits.militia) return recruits.militia.plan(town.kind);
  const K = kindOf(town), plan = [];
  for (let i = 0; i < K.guards; i++) plan.push(['tguard', 'guard']);
  for (let i = 0; i < K.archers; i++) plan.push(['tarcher', 'archer']);
  for (let i = 0; i < K.captains; i++) plan.push(['tcaptain', 'captain']);
  return plan;
}
const respawnDelay = () => (recruits.militia ? recruits.militia.respawn : TOWN.guardRespawn);
function populate(st, town, frac = 1) {
  const plan = guardPlan(town);
  const n = Math.max(1, Math.round(plan.length * frac));
  town.maxGuards = plan.length;
  for (let i = 0; i < n; i++) spawnGuard(st, town, plan[i][0], i, plan[i][1]);
  town.active = true;
}
const aliveGuards = (st, town) => { let n = 0; for (const id of town.guards) { const e = st.byId.get(id); if (e && e.alive) n++; } return n; };

function guardTick(st, town, dt) {
  const w = st.world, lay = town.lay;
  town.guards = town.guards.filter((id) => { const e = st.byId.get(id); return e && e.alive; });
  const gt = 1 + TOWN.guardGrowth * (st.t / 60);
  for (const id of town.guards) {
    const e = st.byId.get(id);
    if (e.mode === 'hold' && !e.tgt && D2(e.x, e.z, e.hold.x, e.hold.z) < 3) {
      e.pt -= dt;
      if (e.pt <= 0) {
        e.pt = 6 + st.rng() * 10;
        const post = lay.posts[e.post % lay.posts.length], a = st.rng() * TAU, d = 3 + st.rng() * (e.tg === 'captain' ? 5 : 12);
        const x = post.x + Math.cos(a) * d, z = post.z + Math.sin(a) * d;
        if (!w.walkable || w.walkable(x, z)) { e.mode = 'amove'; e.dest = { x, z }; e.path = null; }
      }
    }
    if (st.t - e.growT > 30) { e.growT = st.t; e.timeMul = gt; const f = e.hp / e.maxHp; simApi.recalc(e); e.hp = e.maxHp * f; }
  }
  // free replacements while the town stands (safe or besieged with walls left), even under attack
  if ((town.state === 'safe' || town.state === 'besieged') && town.hp > 0 && town.gq.length) {
    for (let i = town.gq.length - 1; i >= 0; i--) if (st.t >= town.gq[i].t) {
      const q = town.gq.splice(i, 1)[0];
      if (town.guards.length < town.maxGuards) spawnGuard(st, town, q.key, q.post, q.role);
    }
  }
}

// ---------------------------------------------------------------- creation
function makeTown(st, site, idx) {
  const K = TOWN.kinds[site.kind] ? site.kind : 'village', kd = TOWN.kinds[K];
  const t = Object.assign({}, site, { kind: K, name: site.name || TOWN_NAMES[idx % TOWN_NAMES.length] });
  t.r = clamp(t.r || 30, 20, 80);
  Object.assign(t, {
    start: !!site.start, state: 'safe', def: 1, hp: kd.hp, maxHp: kd.hp, pop: kd.villagers + kd.guards + kd.archers + kd.captains, safeR: t.kind === 'capital' ? Math.max(TOWN.safeMin, t.r * 1.3) : 0, // v0.6: the capital is the ONLY safe zone
    services: { shop: true, hire: true, trainer: false, board: false }, stock: [], quests: [], tr: { skills: [] }, // v5: quests/tr/trainer/board are inert stubs (UI lane deletes their readers)
    fallT: 0, saved: 0, disc: 0, reclaimed: 0, siegeT: 0, help: {}, npcs: [], guards: [], gq: [], active: false, near: false,
    threat: null, restockT: TOWN.restockT, maxGuards: 0, burn: false,
  });
  return t;
}
function ensureTeam4(st) {
  if (st.teams[4]) return;
  st.teams[4] = { id: 4, alive: true, human: false, ai: false, hero: null, gold: 0, humanity: true, income: 0, cd: {}, up: {}, f: { id: 4, title: 'Humanity', name: 'Humanity', color: 0x4a78c8, css: '#4a78c8', units: [] } };
}

export function init(st) {
  st.towns = []; st.townN = 1; st.townT = 0;
  ensureTeam4(st);
  const sites = siteTowns(st.world);
  sites.forEach((s, i) => st.towns.push(makeTown(st, s, i)));
  if (!st.towns.some((t) => t.start) && st.towns.length) { const v = st.towns.find((t) => t.kind === 'village') || st.towns[0]; v.start = true; }
  for (const t of st.towns) {
    layoutOf(st, t);
    t.npcs = makeNpcs(st, t);
    t.stock = rollStock(st, t);
  }
  for (const tm of st.teams) { tm.quests = { active: [], done: 0 }; tm.townNear = null; tm.bag = tm.bag || []; } // quests: inert stub for old UI readers
  const start = startTownOf(st);
  if (start && st.world.sites && Array.isArray(st.waystones)) { /* start-village waystone is discovered by every hero (travel.js tutorial step) */ }
  for (const t of st.towns) if (D2(...heroPos(st), t.x, t.z) < TOWN.activate) populate(st, t);
}
function heroPos(st) { const h = st.teams[0] && st.teams[0].hero; return h ? [h.x, h.z] : [1e9, 1e9]; }

export const trainPrice = () => 0; // v5 stub: trainers are gone (towns_ui.js still imports it; UI lane deletes)
// town-saved reward: gold + xp (the old quest payout, trimmed)
function payReward(st, team, rw) {
  const h = team.hero;
  if (rw.gold) { team.gold += rw.gold; ev(st, { type: 'gold', x: h ? h.x : 0, z: h ? h.z : 0, amt: rw.gold, team: team.id }); }
  if (rw.xp && h) { if (typeof perks.grantXP === 'function') { try { perks.grantXP(st, team.id, rw.xp, 'defend', h.x, h.z); } catch (e) { simApi.giveXP(st, team.id, h.x, h.z, rw.xp); } } else simApi.giveXP(st, team.id, h.x, h.z, rw.xp); }
}

// ---------------------------------------------------------------- town commands
function serviceReach(st, team, town) {
  const h = team.hero;
  return !!h && h.alive && D2(h.x, h.z, town.x, town.z) <= town.r + TOWN.service;
}
function cmdBuy(st, team, c) {
  const town = townById(st, c.town);
  if (!town || town.state === 'fallen' || !town.services.shop) return msgH(st, team, 'The merchant is gone', 'warn');
  if (!serviceReach(st, team, town)) return msgH(st, team, 'Too far from the merchant', 'warn');
  const e = town.stock[c.idx | 0];
  if (!e || e.qty <= 0) return msgH(st, team, 'Sold out', 'warn');
  const price = buyPrice(town, e);
  if (team.gold < price) return msgH(st, team, 'Not enough gold', 'warn');
  const it = e.item;
  if (!canHold(team, it)) return msgH(st, team, it.kind === 'potion' ? 'You cannot carry more' : 'Your pack is full', 'warn');
  team.gold -= price; e.qty--;
  if (it.kind === 'potion') givePotion(team, it.k, 1); else giveItem(st, team, it);
  ev(st, { type: 'buy', town: town.id, team: team.id, name: it.name, price });
  msgH(st, team, `Bought ${it.name} (-${price} gold)`, 'info');
}
function cmdSell(st, team, c) {
  const h = team.hero;
  const town = h ? nearestTown(st, h.x, h.z, true) : null;
  if (!town || !town.services.shop || !serviceReach(st, team, town)) return msgH(st, team, 'No merchant here', 'warn');
  const bag = bagOf(team);
  let i = c.item !== undefined ? bag.findIndex((b) => b.uid === c.item) : -1;
  if (i < 0 && Number.isInteger(c.idx)) i = c.idx;
  const it = bag[i];
  if (!it) return;
  const gold = sellPrice(it);
  bag.splice(i, 1);
  team.gold += gold;
  ev(st, { type: 'gold', x: h.x, z: h.z, amt: gold, team: team.id });
  ev(st, { type: 'sell', town: town.id, team: team.id, name: it.name, gold });
  msgH(st, team, `Sold ${it.name} (+${gold} gold)`, 'info');
}
export function command(st, team, c) {
  switch (c.t) {
    case 'buy': cmdBuy(st, team, c); return true;
    case 'sell': cmdSell(st, team, c); return true;
    default: return false;
  }
}

// ---------------------------------------------------------------- town states
function killNpcs(town) { for (const n of town.npcs) { n.alive = false; n.moving = false; } }
function stateMsg(st, text, kind) { for (const tm of st.teams) if (tm.human) ev(st, { type: 'msg', text, kind, team: tm.id }); }
/** HORDE lane entry point: 'besieged' | 'fallen' | 'safe' (safe after besieged = saved, safe after fallen = reclaimed). 'siege' is an alias of 'besieged'. */
export function setTownState(st, id, state) {
  const t = typeof id === 'object' ? id : townById(st, id);
  if (!t) return false;
  if (state === 'siege') state = 'besieged';
  if (state === t.state) return true;
  const prev = t.state;
  if (state === 'besieged') {
    if (prev === 'fallen') return false;
    t.state = 'besieged'; t.siegeT = st.t; t.help = {}; t.hp = t.maxHp;
    if (!t.active) populate(st, t);
    for (const n of t.npcs) n.fleeing = true;
    ev(st, { type: 'townAttacked', town: t.id, name: t.name, x: t.x, z: t.z, kind: t.kind });
    return true;
  }
  if (state === 'fallen') {
    t.state = 'fallen'; t.fallT = st.t; t.burn = true; t.def = 0; t.hp = 0; t.pop = 0;
    t.services = { shop: false, hire: false, trainer: false, board: false }; t.stock = []; t.gq = [];
    for (const id2 of t.guards.slice()) { const e = st.byId.get(id2); if (e && e.alive) { e.hp = 0; simApi.kill(st, e, null); } }
    t.guards = []; killNpcs(t);
    const w = (st.waystones || []).find((q) => q.id === t.wsId);
    if (w) { w.down = true; for (const tm of st.teams) if (tm.tele && tm.tele.ws === w.id) tm.tele = null; }
    for (const tm of st.teams) if (tm.lastWs === t.wsId) tm.lastWs = null;
    ev(st, { type: 'townFallen', town: t.id, name: t.name, x: t.x, z: t.z, kind: t.kind });
    return true;
  }
  if (state === 'safe') {
    if (prev === 'besieged') { // saved
      t.state = 'safe'; t.saved++; t.hp = t.maxHp; t.def = 1;
      t.disc = Math.min(TOWN.save.discMax, t.disc + TOWN.save.disc);
      for (const n of t.npcs) n.fleeing = false;
      const K = TOWN.save;
      for (const tid in t.help) {
        const tm = st.teams[+tid];
        if (!tm || !isHeroTeam(tm.id) || t.help[tid] < K.minHelp) continue;
        payReward(st, tm, { gold: K.gold[t.kind], xp: K.xp[t.kind] });
        msgH(st, tm, `${t.name} is saved! (+${K.gold[t.kind]} gold)`, 'big');
      }
      t.stock = rollStock(st, t); t.restockT = TOWN.restockT;
      ev(st, { type: 'townSaved', town: t.id, name: t.name, x: t.x, z: t.z, saved: t.saved });
      // missing guards are replaced over time
      const missing = Math.max(0, t.maxGuards - aliveGuards(st, t));
      const plan = guardPlan(t);
      for (let i = 0; i < missing; i++) { const p = plan[(plan.length - 1 - i + plan.length) % plan.length]; t.gq.push({ t: st.t + 15 + i * 6, key: p[0], role: p[1], post: i }); }
      return true;
    }
    if (prev === 'fallen') { // reclaimed
      t.state = 'safe'; t.burn = false; t.reclaimed++; t.hp = t.maxHp * 0.5; t.def = 1;
      t.services = { shop: true, hire: true, trainer: false, board: false };
      t.stock = rollStock(st, t);
      for (const n of t.npcs) { n.alive = true; n.x = n.hx; n.z = n.hz; n.tx = n.hx; n.tz = n.hz; n.fleeing = false; }
      t.pop = kindOf(t).villagers + kindOf(t).guards;
      t.guards = []; t.active = false; populate(st, t, 0.6);
      const w = (st.waystones || []).find((q) => q.id === t.wsId); if (w) w.down = false;
      ev(st, { type: 'townReclaimed', town: t.id, name: t.name, x: t.x, z: t.z });
      stateMsg(st, `${t.name} has been retaken!`, 'big');
      return true;
    }
    return true;
  }
  return false;
}
/** assault units call this to hurt the walls / gates; returns the new defence value 0..1. Falls when walls are down and no guard lives (TOWN.autoFall). */
export function damageTown(st, id, amt, src) {
  const t = typeof id === 'object' ? id : townById(st, id);
  if (!t || t.state === 'fallen') return 0;
  if (t.state === 'safe') setTownState(st, t, 'besieged');
  t.hp = Math.max(0, t.hp - Math.max(0, amt));
  updateDef(st, t);
  if (TOWN.autoFall && t.hp <= 0 && aliveGuards(st, t) === 0) setTownState(st, t, 'fallen');
  return t.def;
}
function updateDef(st, t) {
  const g = t.maxGuards ? aliveGuards(st, t) / t.maxGuards : 1;
  t.def = clamp(0.6 * (t.hp / t.maxHp) + 0.4 * g, 0, 1);
}

// ---------------------------------------------------------------- hooks
export function onDamage(st, src, t, amt) {
  if (!(amt > 0) || !src || !t) return amt;
  const tt = t.team, stt = src.team;
  if (tt === 4 && isHeroTeam(stt)) return 0;              // heroes and their followers never hurt the town guard
  if (stt === 4 && isHeroTeam(tt)) return 0;
  if (isHeroTeam(tt) && (t.kind === 'hero' || t.kind === 'unit') && isSafeZone(st, t.x, t.z)) {
    if (stt < 0) return 0; // no monster attacks inside a standing town (heroes are allies: no PvP)
  }
  return amt;
}
export function onKill(st, t, src) {
  if (!t) return;
  if (t.kind === 'unit' && t.town !== undefined && t.guard) {
    const town = townById(st, t.town);
    if (town && (town.state === 'safe' || town.state === 'besieged') && town.gq.length < 24) town.gq.push({ t: st.t + respawnDelay(), key: t.type, role: t.tg, post: t.post | 0 });
    if (town && town.state === 'besieged') { updateDef(st, town); }
    return;
  }
}

export function update(st, dt) {
  if (!st.towns) return;
  st.townT -= dt;
  const slow = st.townT <= 0;
  if (slow) st.townT += 0.25;
  const heroes = [];
  for (const tm of st.teams) if (tm.hero && tm.hero.alive && isHeroTeam(tm.id)) heroes.push(tm.hero);
  for (const t of st.towns) {
    t.near = false;
    for (const h of heroes) if (D2(h.x, h.z, t.x, t.z) < TOWN.activate + 40) { t.near = true; break; }
    if (t.near && t.state !== 'fallen') stepVillagers(st, t, dt);
    if (!slow) continue;
    const step = 0.25;
    if (t.state === 'fallen') continue;
    if (!t.active && t.near) for (const h of heroes) if (D2(h.x, h.z, t.x, t.z) < TOWN.activate) { populate(st, t); break; }
    // threat: nearest hostile monster near the town (villagers flee, guard replacements wait)
    let th = null, td = t.r + 28;
    for (const e of st.ents) { if (e.kind !== 'mon' || !e.alive) continue; const d = D2(e.x, e.z, t.x, t.z); if (d < td) { td = d; th = e; } }
    t.threat = th ? { x: th.x, z: th.z } : null;
    if (t.active) guardTick(st, t, step);
    if (t.state === 'safe') {
      // monsters never enter a standing town
      if (th) for (const e of st.ents) {
        if (e.kind !== 'mon' || !e.alive || e.assault || e.horde || e.raid) continue;
        const dx = e.x - t.x, dz = e.z - t.z, d = Math.hypot(dx, dz);
        if (d < t.safeR) { const k = (t.safeR + 1.5) / Math.max(d, 0.1); e.x = t.x + dx * k; e.z = t.z + dz * k; e.tgt = 0; e.returning = true; e.path = null; }
      }
      t.restockT -= step;
      if (t.restockT <= 0) { t.restockT = TOWN.restockT; t.stock = rollStock(st, t); ev(st, { type: 'townRestock', town: t.id }); }
      t.def = 1;
    } else if (t.state === 'besieged') {
      for (const h of heroes) if (D2(h.x, h.z, t.x, t.z) < t.r + 35) t.help[h.team] = (t.help[h.team] || 0) + step;
      updateDef(st, t);
      if (TOWN.autoFall && t.hp <= 0 && aliveGuards(st, t) === 0) setTownState(st, t, 'fallen');
    }
  }
  if (!slow) return;
  // interaction: the NPC in reach of each hero (drives the "[E] talk" prompt)
  for (const tm of st.teams) {
    const h = tm.hero;
    tm.townNear = null;
    if (!h || !h.alive || !isHeroTeam(tm.id)) continue;
    let best = null, bd = TOWN.reach;
    for (const t of st.towns) {
      if (t.state === 'fallen' || D2(h.x, h.z, t.x, t.z) > t.r + 6) continue;
      for (const n of t.npcs) {
        if (!n.alive || !TALK_ROLES[n.role]) continue;
        const d = D2(h.x, h.z, n.x, n.z);
        if (d < bd) { bd = d; best = { town: t.id, npc: n.id, role: n.role, name: n.name }; }
      }
    }
    tm.townNear = best;
  }
}
