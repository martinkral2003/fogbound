// Host-authoritative game simulation: state + step(st, dt, inputs). No DOM, no Three.
import {
  WORLD, BACKGROUNDS, TEAM_COLORS, RIVAL_NAMES, HUMANITY, RESPAWN, WIN_REASONS, UNITS, MONSTERS, TIER_MUL, STRUCTURES,
  MAX_HERO_LVL, MAX_UNIT_LVL, START_GOLD, DAY_LEN, MONSTER_GROWTH, DREAD, SKILLS, MONSTER_SPEED,
} from './data.js';
import { generateWorld } from './world.js';
import { createNav, rebuildNav, findPath, clearLine } from './nav.js';
import { clamp, lerp, angDiff, mulberry32, TAU } from './util.js';
import { COMBAT, CHAMPION, PACE, GEAR_CAP, DROP, ITEM_SLOTS } from './data.js';
import { rollItem as lootRoll, makeGear, rollChampion, sellValue } from './loot.js';
import { generateSites } from './sites.js';
import { DIFFICULTY, CASTLE } from './data.js';
import { initV3, updateV3, commandV3, damageV3, killV3, pickupV3 } from './v3hooks.js';
import { perkStats, modSkill, onHeroLevel, dangerAt, heroXpNeed, xpGainFor, castRiders, summonKit, initKit } from './perks.js'; // HERO lane: perks, skill modifiers, level-up offers
import { holdScaled } from './skillaim.js';
import { cancelChannel as travelCancel, arrivalFor, respawnStone } from './travel.js';
import * as SV from './servants.js';
import { hordeMon } from './horde.js'; // v0.5 DEMONS lane: demons (m.hz) are driven by horde.hordeMon
import { ultOf, castUlt } from './ults.js'; // ECON lane: pickable ultimates

const H = WORLD.half;
let T = 0; // current sim time, set at the start of every step

// ---------------------------------------------------------------- helpers
// team ids (v5): -1 = demons and wild monsters (hostile to everyone else), 0-3 = the four allied heroes, 4 = HUMANITY (militia, guards, villagers). Only the monster side is hostile.
// v0.7: optional competitive mode. setFactions(map) assigns hero team id -> faction id (0/1); teams on different factions become hostile too.
// FACTION_OF stays null unless a match explicitly opts into it (createGame opts.factions), so every existing co-op call site is unaffected.
let FACTION_OF = null;
export function setFactions(map) { FACTION_OF = map; }
export const hostile = (a, b) => {
  if ((a < 0) !== (b < 0)) return true; // the monster side is always hostile to the rest
  if (a < 0 || a === b) return false;
  return !!(FACTION_OF && FACTION_OF[a] !== undefined && FACTION_OF[b] !== undefined && FACTION_OF[a] !== FACTION_OF[b]);
};
// Optional behaviour hooks other lanes may set at module load: monster(st, m, dt, speed) -> true when handled (called for monsters with m.ai / m.raid / m.lair),
// unitMode(st, u, dt, speed) (idle behaviour of units in a mode sim.js does not know, e.g. 'patrol'), unitLeash(st, u, tgt) -> true to drop the target.
export const simHooks = { monster: null, unitMode: null, unitLeash: null };
const dist2d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function obbDist(px, pz, b) {
  const dx = px - b.x, dz = pz - b.z;
  const lx = Math.abs(dx * b.c + dz * b.s) - b.w / 2, lz = Math.abs(-dx * b.s + dz * b.c) - b.d / 2;
  if (lx <= 0 && lz <= 0) return 0;
  return Math.hypot(Math.max(lx, 0), Math.max(lz, 0));
}
// distance between the edge of `a` (a circle) and the edge of target `t`
export function gap(a, t) {
  if (t.kind === 'bld') return obbDist(a.x, a.z, t) - a.r;
  return Math.hypot(a.x - t.x, a.z - t.z) - a.r - t.r;
}
const bfm = (e, k) => (e.buff && T < e.buff.until && e.buff[k]) || 1;
export const isDread = (st) => !!st.dread && st.t < st.dread.until;
export const isNight = (st) => { if (isDread(st)) return true; const p = (st.t % DAY_LEN) / DAY_LEN; return p > 0.6 && p < 0.92; };
export const dayPhase = (st) => (st.t % DAY_LEN) / DAY_LEN;
const rf = (st) => st.rng();
const ev = (st, e) => st.events.push(e);

function pushOutOBB(e, b) {
  const dx = e.x - b.x, dz = e.z - b.z;
  const lx = dx * b.c + dz * b.s, lz = -dx * b.s + dz * b.c;
  const hw = b.w / 2, hd = b.d / 2;
  const cx = clamp(lx, -hw, hw), cz = clamp(lz, -hd, hd);
  let nx = lx - cx, nz = lz - cz, d = Math.hypot(nx, nz), pen;
  if (d >= e.r) return false;
  if (d < 1e-5) {
    const px = hw - Math.abs(lx), pz = hd - Math.abs(lz);
    if (px < pz) { nx = Math.sign(lx) || 1; nz = 0; pen = e.r + px; } else { nx = 0; nz = Math.sign(lz) || 1; pen = e.r + pz; }
  } else { nx /= d; nz /= d; pen = e.r - d; }
  e.x += (nx * b.c - nz * b.s) * pen;
  e.z += (nx * b.s + nz * b.c) * pen;
  return true;
}

function obbCorners(b, m = 0) {
  const hw = b.w / 2 - m, hd = b.d / 2 - m, c = b.c, s = b.s;
  return [[b.x + c * hw - s * hd, b.z + s * hw + c * hd], [b.x - c * hw - s * hd, b.z - s * hw + c * hd],
    [b.x - c * hw + s * hd, b.z - s * hw - c * hd], [b.x + c * hw + s * hd, b.z + s * hw - c * hd]];
}
function obbOverlap(a, b) {
  const ca = obbCorners(a, 0.06), cb = obbCorners(b, 0.06);
  const axes = [[a.c, a.s], [-a.s, a.c], [b.c, b.s], [-b.s, b.c]];
  for (const [ax, az] of axes) {
    let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9;
    for (const [x, z] of ca) { const p = x * ax + z * az; if (p < a0) a0 = p; if (p > a1) a1 = p; }
    for (const [x, z] of cb) { const p = x * ax + z * az; if (p < b0) b0 = p; if (p > b1) b1 = p; }
    if (a1 < b0 || b1 < a0) return false;
  }
  return true;
}

// ---------------------------------------------------------------- creation
// opts: { seed, humans:[team ids] (default [0]), bg: background of team 0 (index or key), bgs: [background per hero team], world }
export function createGame(opts = {}) {
  const seed = opts.seed ?? 1337;
  DIFF = DIFFICULTY[opts.diff] || DIFFICULTY.normal;
  const world = opts.world || generateWorld(seed);
  if (!world.sites) world.sites = generateSites(world); // towns, camps, lairs, dungeons, pois, waystones (see V4.md)
  const st = {
    diff: DIFF,     seed, world, nav: createNav(world), rng: mulberry32(seed * 7 + 1), t: 0, nextId: 1, stepN: 0,
    ents: [], blds: [], projs: [], zones: [], timers: [], nodes: [], chests: [], shrines: [], items: [], camps: [],
    teams: [], events: [], byId: new Map(), navDirty: true, over: null,
    humans: opts.humans ?? [0], stats: { kills: 0 }, dread: null, dreadIdx: 0, dreadWarned: false, growT: 0, timeMul: 1,
  };
  T = 0;
  const bgIdx = (v, d) => { const i = typeof v === 'string' ? BACKGROUNDS.findIndex((b) => b.key === v) : Number.isInteger(v) ? v : d; return (((i < 0 ? d : i) % 4) + 4) % 4; };
  const b0 = bgIdx(opts.bg, 0);
  for (let i = 0; i < 4; i++) {
    const bg = BACKGROUNDS[bgIdx(opts.bgs && opts.bgs[i], (b0 + i) % 4)];
    // team.f = the background's kit plus the team's own colour and hero name (code written for v0.3 factions keeps reading team.f.color / title / hero / charge / pool)
    const f = { ...bg, id: i, key: bg.key, title: i ? RIVAL_NAMES[i - 1] : bg.title, color: TEAM_COLORS[i].color, css: TEAM_COLORS[i].css };
    const team = {
      id: i, f, bg: bg.key, human: st.humans.includes(i), gold: START_GOLD, hero: null, alive: true, respT: 0, cd: {},
      chCd: 0, teleCd: 0, lastCast: null, income: 0, stance: 'follow', alertT: 0, goldAcc: 0, heroDeaths: 0,
      followers: [], lastWs: 0,
      faction: opts.factions && opts.factions[i] !== undefined ? opts.factions[i] : 0, // v0.7: all 0 = today's co-op; setFactions() call below only activates PvP if opts.factions was actually passed
    };
    st.teams.push(team);
    initKit(team); // v0.5 SKILLS lane: team.kit (+ read-only mirrors team.sk / team.perks)
    team.spawn = heroSpawn(world, i);
    team.hero = makeHero(st, team);
    giveStartWeapon(st, team.hero, f);
  }
  st.war = !!opts.factions; // v0.7: competitive mode flag, read by UI/AI
  // FACTION_OF is a module-level singleton like `T` above: every createGame call fully re-decides it (never leaves a stale map from a previous game in the same process, e.g. a batch-test loop)
  setFactions(opts.factions ? Object.fromEntries(st.teams.map((t) => [t.id, t.faction])) : null);
  // team 4 = HUMANITY (town guards, villagers, merchants). A stub so loops that index st.teams[e.team] do not crash.
  st.teams.push({
    id: HUMANITY, alive: true, human: false, ai: false, hero: null, gold: 0, humanity: true, respT: 0, cd: {}, alertT: 0, income: 0, followers: [],
    sk: { known: [], slots: [null, null, null, null], offers: [], ver: 0 }, perks: { offers: [], picks: [], ver: 0, disc: {} }, stance: 'follow', goldAcc: 0, heroDeaths: 0, chCd: 0, teleCd: 0, lastWs: 0,
    f: { id: HUMANITY, key: 'humanity', name: 'Humanity', title: 'Humanity', color: TEAM_COLORS[HUMANITY].color, css: TEAM_COLORS[HUMANITY].css },
  });

  world.features.camps.forEach((c, i) => {
    const camp = { id: i, x: c.x, z: c.z, tier: c.tier, types: c.types, biome: c.biome, mons: 0, respT: 0, boss: false };
    st.camps.push(camp); spawnCamp(st, camp);
  });
  // the Drowned King and the other bosses live in the dungeons (src/dungeons.js)
  for (const c of world.features.chests) {
    st.chests.push({ id: st.nextId++, x: c.x, z: c.z, tier: c.tier, gold: Math.round((c.tier * 33 + rf(st) * 27 * c.tier) / 5) * 5, opened: false, item: null });
  }
  for (const s of world.features.shrines) st.shrines.push({ id: st.nextId++, x: s.x, z: s.z, kind: s.kind, cd: 0 });
  rebuildNav(st.nav, st.blds); st.navDirty = false;
  initV3(st);
  return st;
}

// where hero i starts: world.sites.heroSpawns[i] (MAP lane), else a ring around the start village / town, else beside the old corner keep
function heroSpawn(world, i) {
  const S = world.sites || {};
  let x, z;
  if (S.heroSpawns && S.heroSpawns[i]) { x = S.heroSpawns[i].x; z = S.heroSpawns[i].z; }
  else {
    const tw = S.towns && (S.towns.find((q) => q.start) || S.towns.find((q) => q.id === S.startTown) || S.towns[0]);
    if (tw) { const a = (i / 4) * TAU + 0.6; x = tw.x + Math.cos(a) * 9; z = tw.z + Math.sin(a) * 9; }
    else if (world.hearts && world.hearts[i]) { const hp = world.hearts[i], dx = -Math.sign(hp.x), dz = -Math.sign(hp.z), dl = Math.hypot(dx, dz) || 1; x = hp.x + (dx / dl) * 8; z = hp.z + (dz / dl) * 8; }
    else { x = -H * 0.6 + i * 6; z = -H * 0.6; }
  }
  if (world.walkable && !world.walkable(x, z)) {
    for (let r = 2; r < 40; r += 2) for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r; if (world.walkable(px, pz)) return { x: px, z: pz }; }
  }
  return { x, z };
}
function giveStartWeapon(st, h, f) {
  const w = f.weapon || { name: 'Rusty Sword' };
  h.eq.weapon = { slot: 'weapon', stat: 'dmg', val: 0, tier: 0, rarity: 0, affixes: [], name: w.name, score: 0, start: true };
  h.gear.weapon = 1; recalc(h); h.hp = h.maxHp;
}

function addEnt(st, e) {
  e.id = st.nextId++; e.alive = true; e.ox = e.x; e.oz = e.z; e.dead = false;
  st.ents.push(e); st.byId.set(e.id, e);
  return e;
}

function newAgent(extra) {
  return Object.assign({
    face: 0, lvl: 1, xp: 0, atkT: 0.3, swing: 0, hitT: 0, stun: 0, buff: null, hid: 0, burnUntil: 0, burnDps: 0, tgt: 0, scanT: 0,
    path: null, pathT: 0, pathGoal: null, blockedBy: 0, lastHit: -99, walkPh: 0, moving: false, gear: { weapon: 0, helmet: 0, armor: 0, amulet: 0 }, armor: 0,
    eq: { weapon: null, helmet: null, armor: null, amulet: null }, res: {}, dtype: 'physical', psnUntil: 0, psnDps: 0, dotTeam: -1, slowUntil: 0, slowMul: 1, stagT: -9,
    crit: 0, lifesteal: 0, aspd: 1, mspd: 1, elite: 0, title: '', affixes: [], thorns: 0,
  }, extra);
}

let DIFF = DIFFICULTY.normal; // set by createGame (module-level like T: one match per process)
function recalc(e) {
  const hero = e.kind === 'hero', unit = e.kind === 'unit';
  const lm = 1 + 0.13 * (e.lvl - 1), am = 1 + 0.11 * (e.lvl - 1);
  const tm = (e.tierMul || 1) * (e.timeMul || 1), tam = 1 + (tm - 1) * 0.7;
  const mini = e.elite === 2 && !e.boss; // dungeon bosses / hand-made mini-bosses
  const foe = !hero && !unit; // demons and wild monsters follow the difficulty
  const hpM = (hero ? PACE.heroHp : unit ? PACE.unitHp : e.boss ? PACE.bossHp : PACE.monHp * (mini ? PACE.miniHp : 1)) * (foe ? DIFF.monHp : 1);
  const dmM = (hero ? PACE.heroDmg : unit ? PACE.unitDmg : PACE.monDmg * (e.boss ? PACE.bossDmg : mini ? PACE.miniDmg : 1)) * (foe ? DIFF.monDmg : 1);
  const sw = e.base.swarm; // weak horde units: much less HP, a bit less damage
  // gear: ONE stat per item (dmg / hp / spd / cdr, percent) + perk stats (percent points)
  const ib = { dmg: 0, hp: 0, armor: 0, crit: 0, aspd: 0, lifesteal: 0, mspd: 0 };
  for (const k in e.eq) { const it = e.eq[k]; if (it && it.stat) ib[it.stat === 'spd' ? 'mspd' : it.stat] = (ib[it.stat === 'spd' ? 'mspd' : it.stat] || 0) + (it.val || 0); }
  const pst = perkStats(e); // SKILLS lane: talent / perk stat bonuses (may be null)
  if (pst) for (const k in pst) ib[k] = (ib[k] || 0) + pst[k];
  if (ib.mspd > GEAR_CAP.spd + 15) ib.mspd = GEAR_CAP.spd + 15;
  if (ib.cdr > GEAR_CAP.cdr + 10) ib.cdr = GEAR_CAP.cdr + 10;
  const maxHp = e.base.hp * lm * tm * hpM * (sw ? PACE.swarmHp : 1) * (1 + ib.hp / 100) * (e.eliteHp || 1);
  e.atk = e.base.atk * am * tam * dmM * (sw ? PACE.swarmDmg : 1) * (1 + ib.dmg / 100) * (e.eliteDmg || 1);
  e.armor = (e.base.armor || 0) + ib.armor; // ONE armour percent (absorbs all damage; capped in damage())
  e.res = {}; // v0.5: no resistances (kept as an empty object for old readers)
  e.crit = (hero ? COMBAT.heroCrit : unit ? COMBAT.unitCrit : 0) + (e.base.crit || 0) + ib.crit / 100;
  e.lifesteal = ib.lifesteal / 100 + (e.affixes.includes('vampiric') ? 0.25 : 0);
  e.aspd = 1 + ib.aspd / 100; e.mspd = 1 + ib.mspd / 100;
  e.critRes = ib.critRes || 0; e.critDmg = ib.critDmg || 0; e.regen = ib.regen || 0; e.xpBonus = ib.xpGain || 0; e.cdr = ib.cdr || 0; e.skDmg = ib.skillDmg || 0; e.skRad = ib.skRad || 0;
  e.gearThorns = (ib.thorns || 0) / 100; e.killHeal = ib.killHeal || 0; e.killGold = ib.killGold || 0; e.killHaste = ib.killHaste || 0;
  if (e.maxHp) e.hp += maxHp - e.maxHp; else e.hp = maxHp;
  e.maxHp = maxHp;
}

function makeHero(st, team) {
  const f = team.f, h = f.hero;
  const e = newAgent({
    kind: 'hero', team: team.id, faction: team.id, bg: f.key, heroName: f.title, x: team.spawn.x, z: team.spawn.z, r: h.r, spd: h.spd, range: h.range, cd: h.cd,
    ranged: !!h.ranged, proj: h.proj, arc: h.arc || 0, base: { hp: h.hp, atk: h.atk, armor: h.armor || 0, crit: h.crit || 0 }, dtype: h.dtype || 'physical', charging: false, chargeT: 0, tele: 0, cast: 0, dest: null, model: h.model,
  });
  e.face = Math.atan2(-team.spawn.z, -team.spawn.x);
  recalc(e);
  return addEnt(st, e);
}

// units of a team that are not temporary summons (followers, recruits); st.teams[id].followers lists the recruited ones
export function servants(st, teamId, withTemp = false) {
  return st.ents.filter((e) => e.kind === 'unit' && e.team === teamId && e.alive && !e.guard && (withTemp || !e.temp));
}

function spawnUnit(st, key, teamId, x, z, o) {
  const d = UNITS[key];
  const e = newAgent({
    kind: 'unit', type: key, team: teamId, x, z, r: d.r, spd: d.spd, range: d.range, cd: d.cd, ranged: !!d.ranged, proj: d.proj, model: d.model,
    base: { hp: d.hp, atk: d.atk, armor: d.armor || 0 }, dtype: d.dtype || 'physical', mode: o.guard ? 'patrol' : st.teams[teamId] && st.teams[teamId].stance === 'hold' ? 'hold' : 'follow', hold: { x, z }, dest: null, temp: !!o.temp, guard: !!o.guard, life: o.life || 0,
    slot: rf(st) * TAU, slotR: 2.4 + rf(st) * 2.4, deathBlast: d.deathBlast, bomber: d.bomber, scanT: rf(st) * 0.4, ...SV.unitExtra(d, st.rng),
  });
  recalc(e);
  return addEnt(st, e);
}

function spawnMonster(st, key, tier, x, z, camp, champ = null) {
  const d = MONSTERS[key];
  const e = newAgent({
    kind: 'mon', type: key, team: -1, x, z, r: d.r, spd: d.spd * MONSTER_SPEED, range: d.range, cd: d.cd, ranged: !!d.ranged, proj: d.proj, model: d.model,
    base: { hp: d.hp, atk: d.atk, armor: d.armor || 0, swarm: !!d.swarm }, dtype: d.dtype || 'physical',
    tierMul: TIER_MUL[Math.min(4, tier)] || 1, timeMul: st.timeMul, tier, camp: camp.id, home: { x: camp.x, z: camp.z }, aggro: d.aggro, xpV: d.xp, goldV: d.gold,
    returning: false, boss: !!d.boss, scanT: rf(st) * 0.4, slamT: 6, adds: false, spells: d.spells || null, // v0.6 casters (mspells.js)
  });
  if (d.boss) { e.elite = 2; e.title = d.name; }
  if (champ) applyChampion(e, champ);
  recalc(e);
  if (e.affixes.includes('shielded')) { const mx = e.maxHp * 0.35; e.shield = { amt: mx, max: mx, until: 1e9 }; }
  camp.mons++;
  return addEnt(st, e);
}

// Champion: elite=1, tougher and harder hitting, 1-2 affixes (see MON_AFFIXES in data.js)
function applyChampion(e, champ) {
  e.elite = 1; e.title = champ.title; e.affixes = champ.affixes.slice();
  e.eliteHp = CHAMPION.hp; e.eliteDmg = CHAMPION.dmg; e.xpV *= CHAMPION.xp; e.goldV *= CHAMPION.gold;
  e.affRes = {};
  for (const id of e.affixes) {
    if (id === 'fast') { e.spd *= 1.35; e.cd *= 0.78; }
    else if (id === 'thorns') e.thorns = 0.15;
  }
}

function spawnCamp(st, camp) {
  const n = camp.types.length;
  const boost = st.t > 600 && camp.spawned ? 1 : 0; // respawned camps come back a tier higher after minute 10
  camp.spawned = true;
  const eff = camp.tier + boost;
  // at most one champion per camp (tier 2+, never among swarm units); the boss camp has no champions (the boss itself is elite 2)
  const cand = []; camp.types.forEach((k, i) => { if (!(MONSTERS[k] && MONSTERS[k].swarm)) cand.push(i); });
  const champIdx = !camp.boss && eff >= CHAMPION.minTier && cand.length && rf(st) < CHAMPION.chance ? cand[Math.floor(rf(st) * cand.length)] : -1;
  const ring = n <= 4 ? 2.5 : 2.5 + Math.sqrt(n - 4) * 1.2; // 6-12 swarm units need room
  camp.types.forEach((k, i) => {
    const a = (i / n) * TAU + rf(st), rr = n === 1 ? 0 : ring + rf(st) * 1.5;
    spawnMonster(st, k, eff, camp.x + Math.cos(a) * rr, camp.z + Math.sin(a) * rr, camp, i === champIdx ? rollChampion(st.rng, k) : null);
  });
}

const rollItem = (st, tier, o = {}) => lootRoll(st.rng, tier, o.x === undefined ? o : { ...o, danger: dangerAt(st, o.x, o.z) }); // o.x/o.z: better loot far from home
function dropItem(st, x, z, item) {
  if (!item.stat) item = makeGear(st.rng, item.slot, Math.max(0, Math.min(2, (item.tier || 1) - 1)));
  st.items.push({ id: st.nextId++, x: x + (rf(st) - 0.5) * 2, z: z + (rf(st) - 0.5) * 2, slot: item.slot, stat: item.stat, val: item.val, tier: item.tier, rarity: item.tier, affixes: [], name: item.name, score: item.score, born: st.t });
}
// drop gear on the ground (kill drops, chests, gates, dungeons). o: { team (favours its hero's empty slots), tier (monster tier 1..4), elite, boss, chest, n pieces }
function dropLoot(st, x, z, o = {}) {
  const n = Math.max(1, o.n || 1), team = o.team !== undefined ? st.teams[o.team] : null, h = team && team.hero;
  const empty = h ? ITEM_SLOTS.filter((sl) => !h.eq[sl]) : [];
  for (let i = 0; i < n; i++) {
    const it = rollItem(st, o.tier || 1, { elite: o.elite, boss: o.boss, chest: o.chest, empty, x, z });
    const a = (i / n) * TAU + rf(st) * 0.8, r = n > 1 ? 1.4 : 0.6;
    dropItem(st, x + Math.cos(a) * r, z + Math.sin(a) * r, it);
  }
}

// Static structures (town walls, gates, houses, watchtowers). There is no player base in v0.4: other lanes (towns, horde) place them.
// opts: { def: {w,d,hp,model,passable,atk:{dmg,range,cd,heroMul,dtype},vision}, hp, invuln, tag }. They block movement and stamp the nav grid; enemy ones are walkable at cost in A*.
export function addBuilding(st, type, team, x, z, rot, opts = {}) {
  const d = opts.def || STRUCTURES[type] || STRUCTURES.wall;
  const maxHp = opts.hp || d.hp || 500;
  const b = {
    kind: 'bld', id: st.nextId++, type, team, x, z, rot, c: Math.cos(rot), s: Math.sin(rot), w: d.w, d: d.d, r: Math.max(d.w, d.d) / 2 + 0.4,
    rad: Math.hypot(d.w, d.d) / 2 + 0.3, hp: maxHp, maxHp, cdT: 0.5, scanT: 0, tgt: 0, hitAt: -99, alive: true, swing: 0, armor: 0, born: st.t,
    bt: 0, bt0: 0, building: false, trap: null, passable: !!d.passable, atk: d.atk || null, vision: d.vision || 0, model: d.model || type, invuln: !!opts.invuln, tag: opts.tag || '',
  };
  st.blds.push(b); st.byId.set(b.id, b);
  st.navDirty = true;
  return b;
}

// ---------------------------------------------------------------- teleport (v3: waystones live in travel.js)
export { waypointsOf } from './travel.js'; // legacy shape [{id,kind,x,z,ax,az,name}] of the usable waystones

// ---------------------------------------------------------------- damage / death
function srcOf(team, id = 0) { return { team, id, kind: 'timer' }; }

// o: { dtype, bldMul, heroMul, stun, burn, dot, dotMul, noCrit, noReflect }
export function damage(st, src, t, amt, o = {}) {
  if (!t.alive || t.dead || t.hp <= 0) return;
  if ((t.inv && st.t < t.inv) || t.invuln) return;
  if (src && src.team >= 0 && t.team >= 0 && src.team !== t.team && !hostile(src.team, t.team)) return; // v5: allies never hurt each other
  amt = damageV3(st, src, t, amt, o); // v3 lanes may scale or cancel damage (e.g. a shielded Dark Tower)
  if (!(amt > 0)) return;
  if (CAST && src && src.id === CAST.id && t.kind !== 'bld' && t.kind !== 'hero' && t.team !== src.team) amt *= HIT_FALL[Math.min(CAST.n++, HIT_FALL.length - 1)]; // see HIT_FALL
  const C = COMBAT, dtype = o.dtype || 'physical', isB = t.kind === 'bld';
  const se = !src || src.kind === 'timer' ? null : src.kind ? src : st.byId.get(src.id) || null;
  let crit = false;
  if (!isB && !o.dot && !o.noCrit && se && se.crit > 0 && rf(st) < se.crit * (1 - clamp(t.critRes || 0, 0, 80) / 100)) { amt *= C.critMul + (se.critDmg || 0) / 100; crit = true; }
  if (isB) { amt *= o.bldMul || 1; if (src && (src.kind === 'hero' || (src.kind === 'timer' && src.team >= 0 && src.team < 4))) amt *= CASTLE.heroBldMul || 1; } // heroes break walls faster (v0.6)
  else {
    if (o.heroMul && t.kind === 'hero') amt *= o.heroMul;
    amt *= 1 - clamp(t.armor || 0, 0, C.armorCap) / 100; // armour = ONE percent absorption of all damage (v0.5: no damage types, no resistances)
  }
  if (t.debuff && st.t < t.debuff.until) amt *= t.debuff.take;
  if (t.shield && st.t < t.shield.until && t.shield.amt > 0) {
    const ab = Math.min(t.shield.amt, amt); t.shield.amt -= ab; amt -= ab;
    if (amt <= 0.01) { t.lastHit = st.t; t.hitT = 0.1; return; }
  }
  if (t.kind === 'hero' && t.charging && amt > t.maxHp * 0.12) {
    t.charging = false; t.chargeT = 0;
    if (st.teams[t.team].human) ev(st, { type: 'msg', text: 'Charge interrupted!', kind: 'warn', team: t.team });
  }
  t.hp -= amt; t.hitT = 0.14; t.lastHit = st.t;
  if (isB) t.hitAt = st.t;
  if (t.kind === 'hero') { t.tele = 0; }
  if (o.stun && t.stun !== undefined && !isB) t.stun = Math.max(t.stun, o.stun * (t.boss ? 0.3 : 1));
  if (!isB && !o.dot) {
    procEffects(st, t, src, dtype, amt, o);
    if (se && se.lifesteal > 0 && se.alive && se.hp > 0) se.hp = Math.min(se.maxHp, se.hp + amt * se.lifesteal);
    const thorns = (t.thorns || 0) + (t.gearThorns || 0);
    if (thorns > 0 && se && se.alive && !o.noReflect && se.kind !== 'bld' && Math.hypot(se.x - t.x, se.z - t.z) < 6) damage(st, t, se, amt * thorns, { noReflect: true, noCrit: true });
  }
  if (o.dot) { // damage-over-time ticks are batched into one floating number every ~0.6 s
    t.dotAcc = (t.dotAcc || 0) + amt;
    if (st.t - (t.dotEv || 0) >= 0.6) { ev(st, { type: 'dmg', x: t.x, z: t.z, amt: t.dotAcc, kind: t.kind, team: t.team, dtype, crit: false, dot: true }); t.dotAcc = 0; t.dotEv = st.t; }
  } else ev(st, { type: 'dmg', x: t.x, z: t.z, amt, kind: t.kind, team: t.team, dtype, crit });
  if (t.team >= 0 && src && src.team !== t.team) {
    const tm = st.teams[t.team];
    if (tm.alertT <= 0 && (t.kind === 'bld' || t.kind === 'hero')) { tm.alertT = 7; tm.alertAt = t.kind === 'bld' ? { x: t.x, z: t.z } : null; ev(st, { type: 'alert', team: t.team, x: t.x, z: t.z, what: t.kind === 'bld' ? t.type : 'hero' }); }
  }
  if (t.hp <= 0) kill(st, t, src);
}

// status riders: ONLY abilities apply them, through damage options: burn (seconds), psn (seconds, dotMul), slow (speed multiplier 0..1, slowDur), stun (seconds).
// The damage type (dtype) is just a colour tag. Heavy hits stagger.
function procEffects(st, t, src, dtype, dealt, o) {
  const C = COMBAT, tc = src ? src.team : -1;
  if (o.burn > 0) {
    const dps = clamp(dealt * C.burn.frac, C.burn.min, C.burn.max);
    t.burnDps = st.t < t.burnUntil ? Math.max(t.burnDps, dps) : dps;
    t.burnUntil = Math.max(t.burnUntil, st.t + o.burn); t.dotTeam = tc;
  }
  if (o.psn > 0) {
    const dps = clamp(dealt * C.poison.frac * (o.dotMul || 1), C.poison.min, C.poison.max);
    t.psnDps = st.t < t.psnUntil ? Math.max(t.psnDps, dps) : dps;
    t.psnUntil = Math.max(t.psnUntil, st.t + o.psn); t.dotTeam = tc;
  }
  if (o.slow > 0 && o.slow < 1) {
    const mul = t.boss ? Math.max(o.slow, 0.88) : o.slow, dur = o.slowDur || C.cold.dur;
    if (!(t.slowUntil > st.t && t.slowMul < mul)) { t.slowUntil = st.t + dur; t.slowMul = mul; }
  }
  const sf = t.kind === 'hero' ? C.stagger.heroFrac : C.stagger.frac;
  if (!t.boss && dealt > t.maxHp * sf && st.t - t.stagT > C.stagger.cd && !(t.stun > 0)) { t.stun = C.stagger.dur; t.stagT = st.t; }
}

// burn + poison ticks (credited to whoever applied them)
function dots(st, e, dt) {
  if (!e.alive || e.dead) return;
  if (e.burnUntil > st.t) damage(st, srcOf(e.dotTeam), e, e.burnDps * dt, { dtype: 'fire', dot: true });
  if (e.alive && e.psnUntil > st.t) damage(st, srcOf(e.dotTeam), e, e.psnDps * dt, { dtype: 'poison', dot: true });
}

// champion behaviours: regeneration, recharging shield, frozen aura
function eliteUpdate(st, m, dt) {
  if (!m.alive || !m.affixes.length) return;
  const aff = m.affixes;
  if (aff.includes('regen') && m.hp < m.maxHp) m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.025 * dt);
  if (m.shield && m.shield.max !== undefined) {
    const mx = m.maxHp * 0.35; m.shield.max = mx;
    if (st.t - m.lastHit > 7 && m.shield.amt < mx) m.shield.amt = Math.min(mx, m.shield.amt + mx * 0.25 * dt);
  }
  if (aff.includes('frozen')) {
    m.auraT -= dt;
    if (m.auraT <= 0) {
      m.auraT = 0.4;
      for (const o of st.ents) {
        if (!o.alive || o.team < 0 || Math.hypot(o.x - m.x, o.z - m.z) > 7 + o.r) continue;
        if (!(o.slowUntil > st.t && o.slowMul < 0.75)) { o.slowUntil = st.t + 0.9; o.slowMul = 0.75; }
      }
    }
  }
}

function equipItem(st, e, it) { return e.kind === 'hero' ? pickupV3(st, e, it) : false; } // v0.5: only heroes wear gear (gear.js takeItem)

const xpNeed = heroXpNeed; // hero levels 1..MAX_HERO_LVL (10): XP_NEED table in perks.js
function unitXpNeed(l) { return Math.round(35 * Math.pow(l, 1.3)); }

// shared = co-op kill XP: every allied hero within 50 m levels together; otherwise only the given team's hero
function giveXP(st, teamId, x, z, amt, shared = false) {
  const team = st.teams[teamId];
  if (shared) { for (let k = 0; k < 4; k++) { const hh = st.teams[k] && st.teams[k].hero; if (hh && hh.alive && Math.hypot(hh.x - x, hh.z - z) < 50) addXP(st, hh, amt); } }
  else { const h = team.hero; if (h && h.alive && Math.hypot(h.x - x, h.z - z) < 50) addXP(st, h, amt); }
  for (const u of st.ents) if (u.kind === 'unit' && u.team === teamId && u.alive && !u.temp && !u.guard && Math.hypot(u.x - x, u.z - z) < 32) addXP(st, u, amt * 0.8);
}
function tickCd(team, dt) {
  for (const k in team.cd) if (team.cd[k] > 0) team.cd[k] -= dt;
  team.chCd -= dt; team.teleCd -= dt;
}
const slowF = (e) => (e.slowUntil > T ? e.slowMul : 1);

function addXP(st, e, amt) {
  const hero = e.kind === 'hero', max = hero ? MAX_HERO_LVL : MAX_UNIT_LVL;
  if (e.lvl >= max) return;
  e.xp += hero ? xpGainFor(st, e, amt) : amt; // heroes: gear bonus + the pace rubber band toward level 10 at ~14 min (perks.js)
  for (;;) {
    const need = hero ? xpNeed(e.lvl) : unitXpNeed(e.lvl);
    if (e.xp < need || e.lvl >= max) break;
    e.xp -= need; e.lvl++;
    recalc(e);
    if (hero) onHeroLevel(st, st.teams[e.team], e.lvl); // perk card every level, skill card at SKILL_LEVELS
    if (hero) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.3);
    ev(st, { type: 'level', id: e.id, x: e.x, z: e.z, lvl: e.lvl, hero });
  }
}

function kill(st, t, src) {
  const sTeam = src ? src.team : -2;
  if (!t.dead) killV3(st, t, src); // lane modules see every death once, before it is processed
  if (t.kind === 'bld') {
    if (t.dead) return;
    t.hp = 0; t.alive = false; t.dead = true;
    st.blds.splice(st.blds.indexOf(t), 1); st.byId.delete(t.id);
    st.navDirty = true;
    ev(st, { type: 'death', kind: 'bld', btype: t.type, x: t.x, z: t.z, team: t.team, big: t.w > 2.5 });
    return;
  }
  if (t.dead) return;
  t.alive = false; t.hp = 0;
  const team = t.team >= 0 ? st.teams[t.team] : null;
  if (t.kind === 'hero') {
    t.dead = true; t.charging = false; t.chargeT = 0; t.tele = 0;
    team.heroDeaths++;
    team.respT = clamp(RESPAWN.min + t.lvl * RESPAWN.perLevel, RESPAWN.min, RESPAWN.max);
    ev(st, { type: 'death', kind: 'hero', id: t.id, x: t.x, z: t.z, team: t.team });
    return;
  }
  ev(st, { type: 'death', kind: t.kind, id: t.id, x: t.x, z: t.z, team: t.team, model: t.model, big: t.r > 1.2, elite: t.elite | 0 });
  st.stats.kills++;
  if (t.deathBlast) areaDamage(st, srcOf(t.team), t.x, t.z, t.deathBlast.r, t.deathBlast.dmg, { bldMul: 1.5, dtype: t.deathBlast.dtype });
  if (t.kind === 'mon') {
    const camp = st.camps[t.camp]; // raid monsters and lairs have no camp (camp -1)
    if (camp) { camp.mons--; if (camp.mons <= 0 && !camp.boss) camp.respT = 180 + camp.tier * 40; }
    if (sTeam >= 0) {
      const k = st.teams[sTeam];
      const g = Math.round(t.goldV * 0.7 * (t.tierMul || 1) * (isDread(st) ? DREAD.loot : 1));
      k.gold += g;
      giveXP(st, sTeam, t.x, t.z, t.xpV * COMBAT.xpMul * (t.tierMul || 1) * (isDread(st) ? DREAD.loot : 1), true);
      ev(st, { type: 'gold', x: t.x, z: t.z, amt: g, team: sTeam });
    }
    // loot (gear drops, potions): gear.js onKill
  }
}

// End the match. reason: 'warlord' (the Orc Warlord is dead: humanity is saved), 'capital' (the capital fell and was not reclaimed: defeat for all), 'dead' (the human hero is permanently out; unused in v0.4).
// winner = the team credited with the win (killer of the Warlord) or -1. The sim stops stepping once st.over is set.
export function endGame(st, winner, reason) {
  if (st.over) return st.over;
  st.over = { winner, reason, t: st.t, text: WIN_REASONS[reason] || '' };
  ev(st, { type: 'gameover', winner, reason });
  ev(st, { type: 'msg', text: WIN_REASONS[reason] || 'The game is over', kind: 'big' });
  return st.over;
}

export function areaDamage(st, src, x, z, r, dmg, o = {}) {
  for (const e of st.ents) {
    if (!e.alive || !hostile(src.team, e.team)) continue;
    const d = Math.hypot(e.x - x, e.z - z) - e.r;
    if (d > r) continue;
    damage(st, src, e, dmg * (o.noFall ? 1 : 1 - 0.4 * clamp(d / r, 0, 1)), o);
  }
  for (const b of st.blds.slice()) {
    if (!hostile(src.team, b.team) || b.hp <= 0) continue;
    const d = obbDist(x, z, b);
    if (d > r) continue;
    damage(st, src, b, dmg * (o.noFall ? 1 : 1 - 0.4 * clamp(d / r, 0, 1)), o);
  }
}

// ---------------------------------------------------------------- targeting
function findTarget(st, e, rad, noBld = false) {
  let best = null, bs = 1e9;
  for (const o of st.ents) {
    if (o === e || !o.alive || !hostile(e.team, o.team)) continue;
    const dd = Math.hypot(o.x - e.x, o.z - e.z);
    if (dd > rad + o.r) continue;
    if (o.hid > T && dd > 5) continue;
    if (dd < bs) { bs = dd; best = o; }
  }
  if (!noBld) {
    for (const b of st.blds) {
      if (!hostile(e.team, b.team) || b.hp <= 0 || b.trap) continue;
      const dd = obbDist(e.x, e.z, b);
      if (dd > rad) continue;
      const s = dd + (/wall/.test(b.type) ? 16 : b.type === 'gate' ? 10 : 3);
      if (s < bs) { bs = s; best = b; }
    }
  }
  return best;
}

// ---------------------------------------------------------------- movement
// spatial grid of buildings (8 m cells, each building listed in every cell its disk + 3 m touches): rebuilt when the number of buildings changes
const BG = 8;
function bldNear(st, x, z) {
  if (!st.blds.length) return st.blds;
  if (!st._bg || st._bgN !== st.blds.length) {
    const g = new Map();
    for (const b of st.blds) {
      const R = b.rad + 3, i0 = Math.floor((b.x - R) / BG), i1 = Math.floor((b.x + R) / BG), j0 = Math.floor((b.z - R) / BG), j1 = Math.floor((b.z + R) / BG);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const k = i * 4096 + j; const l = g.get(k); if (l) l.push(b); else g.set(k, [b]); }
    }
    st._bg = g; st._bgN = st.blds.length;
  }
  return st._bg.get(Math.floor(x / BG) * 4096 + Math.floor(z / BG)) || EMPTY;
}
const EMPTY = [];
function moveBy(st, e, dx, dz) {
  const w = st.world;
  let nx = e.x + dx, nz = e.z + dz;
  if (!w.walkable(nx, nz)) {
    if (w.walkable(nx, e.z)) nz = e.z; else if (w.walkable(e.x, nz)) nx = e.x; else { nx = e.x; nz = e.z; }
  }
  e.x = nx; e.z = nz;
  e.blockedBy = 0;
  for (const b of bldNear(st, e.x, e.z)) {
    if (Math.abs(b.x - e.x) > b.rad + e.r + 1 || Math.abs(b.z - e.z) > b.rad + e.r + 1) continue;
    if (b.passable && (b.team === e.team || (b.team === HUMANITY && e.team >= 0 && e.team < HUMANITY))) continue;
    if (pushOutOBB(e, b) && hostile(e.team, b.team)) e.blockedBy = b.id;
  }
  if (!w.walkable(e.x, e.z)) { e.x = nx - dx; e.z = nz - dz; }
}

function stepToward(st, e, wx, wz, dt, speed) {
  const dx = wx - e.x, dz = wz - e.z, d = Math.hypot(dx, dz);
  if (d < 1e-4) return;
  const s = Math.min(d, speed * dt);
  e.face = Math.atan2(dz, dx);
  e.moving = true;
  e.walkPh += speed * dt * 0.9;
  moveBy(st, e, (dx / d) * s, (dz / d) * s);
}

function goTo(st, e, gx, gz, dt, speed, arrive = 0.6) {
  const d = Math.hypot(gx - e.x, gz - e.z);
  if (d < arrive) return true;
  let wx = gx, wz = gz;
  if (d > 2.5 && !clearLine(st.nav, e.team, e.x, e.z, gx, gz)) {
    e.pathT -= dt;
    if (!e.path || e.pathT <= 0 || !e.pathGoal || Math.hypot(e.pathGoal[0] - gx, e.pathGoal[1] - gz) > 4) {
      if (st.pathBudget > 0) { st.pathBudget--; e.path = findPath(st.nav, e.team, e.x, e.z, gx, gz, 5000); e.pathGoal = [gx, gz]; e.pathT = 1.4 + rf(st) * 0.8; }
      else if (!e.path) e.path = [];
    }
    while (e.path.length > 1 && Math.hypot(e.path[0].x - e.x, e.path[0].z - e.z) < 1.3) e.path.shift();
    if (e.path.length) { wx = e.path[0].x; wz = e.path[0].z; }
  } else e.path = null;
  stepToward(st, e, wx, wz, dt, speed);
  return false;
}

const SEP_CELL = 6; // spatial grid for separate(): the largest radius sum is ~5.2 m, so the 3x3 neighbour cells cover every overlap
function separate(st) {
  const a = st.ents, n = a.length, N = Math.ceil(WORLD.size / SEP_CELL) + 2;
  let grid = st._sepGrid;
  if (!grid || grid.length !== N * N) grid = st._sepGrid = new Array(N * N);
  for (let c = 0; c < grid.length; c++) { const g = grid[c]; if (g) g.length = 0; }
  const cellOf = (v) => { const c = ((v + H) / SEP_CELL + 1) | 0; return c < 0 ? 0 : c > N - 1 ? N - 1 : c; };
  for (let i = 0; i < n; i++) { const p = a[i]; if (!p.alive || p.dead) continue; const c = cellOf(p.z) * N + cellOf(p.x); (grid[c] || (grid[c] = [])).push(i); }
  for (let i = 0; i < n; i++) {
    const p = a[i]; if (!p.alive || p.dead) continue;
    const cx = cellOf(p.x), cz = cellOf(p.z);
    for (let gz = cz - 1; gz <= cz + 1; gz++) {
      if (gz < 0 || gz >= N) continue;
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        if (gx < 0 || gx >= N) continue;
        const list = grid[gz * N + gx];
        if (!list) continue;
        for (let k = 0; k < list.length; k++) {
          const j = list[k]; if (j <= i) continue;
          const q = a[j]; if (!q.alive || q.dead) continue;
          const dx = q.x - p.x, dz = q.z - p.z, m = p.r + q.r;
          if (Math.abs(dx) > m || Math.abs(dz) > m) continue;
          const d = Math.hypot(dx, dz);
          if (d >= m || d < 1e-4) continue;
          const push = (m - d) * 0.35, nx = dx / d, nz = dz / d;
          const wp = p.kind === 'hero' ? 0.2 : p.kind === 'mon' && p.r > 1.3 ? 0.3 : 1, wq = q.kind === 'hero' ? 0.2 : q.kind === 'mon' && q.r > 1.3 ? 0.3 : 1;
          const tot = wp + wq;
          moveBy(st, p, -nx * push * (wp / tot) * 2, -nz * push * (wp / tot) * 2);
          moveBy(st, q, nx * push * (wq / tot) * 2, nz * push * (wq / tot) * 2);
        }
      }
    }
  }
}

// ---------------------------------------------------------------- attacks
function atkDamage(st, e) {
  let d = e.atk * bfm(e, 'dmg');
  if (e.debuff && T < e.debuff.until) d *= e.debuff.deal;
  if (e.kind === 'mon' && isDread(st)) d *= DREAD.dmg;
  return d;
}
const atkCd = (e) => e.cd / ((e.kind === 'mon' ? 1 : bfm(e, 'atkSpd')) * (e.aspd || 1) * (e.haste && T < e.haste.until ? e.haste.m : 1));

function fireProjectile(st, src, x, z, ang, o) {
  const spd = o.spd;
  st.projs.push({
    id: st.nextId++, x, z, vx: Math.cos(ang) * spd, vz: Math.sin(ang) * spd, spd, team: src.team, src: src.id, dmg: o.dmg, bldMul: o.bldMul || 1,
    tgt: o.tgt || 0, life: o.life || 1.4, r: o.r || 0.7, color: o.color || 0xffffff, pierce: !!o.pierce, hit: o.pierce ? new Set() : null,
    kind: o.kind || 'bolt', heroMul: o.heroMul || 1, ang, dtype: o.dtype || 'physical', rider: o.rider || null, // rider: { burn, psn, slow, slowDur, stun, dotMul } status riders applied on hit
  });
}

function doAttack(st, e, tgt) {
  e.atkT = atkCd(e);
  e.swing = 0.28;
  e.face = Math.atan2(tgt.z - e.z, tgt.x - e.x);
  if (e.bomber) { explode(st, e); return; }
  const dmg = atkDamage(st, e);
  if (e.ranged) {
    const p = e.proj || { spd: 22, color: 0xffffff };
    fireProjectile(st, e, e.x + Math.cos(e.face) * 0.8, e.z + Math.sin(e.face) * 0.8, e.face, { spd: p.spd, dmg, tgt: tgt.id, color: p.color, life: 2, dtype: e.dtype, bldMul: SV.bldMulOf(st, e) || 1, kind: e.role === 'siege' ? 'rock' : undefined });
  } else {
    damage(st, e, tgt, dmg, { bldMul: SV.bldMulOf(st, e) || (e.kind === 'mon' ? 0.6 : 1), dtype: e.dtype });
  }
}

function explode(st, e) {
  const b = e.bomber;
  e.alive = false; e.hp = 0;
  ev(st, { type: 'blast', x: e.x, z: e.z, r: b.r, color: 0xff8030 });
  areaDamage(st, e, e.x, e.z, b.r, b.dmg * (1 + 0.08 * (e.lvl - 1)), { bldMul: b.bldMul * (st.teams[e.team] && st.teams[e.team].mods ? st.teams[e.team].mods.siegeDmg : 1), dtype: b.dtype });
  e.hp = 0; kill(st, e, null);
}

// ---------------------------------------------------------------- hero
function heroUpdate(st, team, h, inp, dt) {
  inp = inp || {};
  const f = team.f;
  tickCd(team, dt);
  if (team.alertT > 0) team.alertT -= dt;
  h.atkT -= dt; h.swing -= dt; h.cast -= dt; h.hitT -= dt;
  h.moving = false; h.repairing = false;
  dots(st, h, dt);
  if (h.alive && h.stun > 0) { h.stun -= dt; h.charging = false; h.chargeT = 0; h.tele = 0; return; }
  if (!h.alive) return;
  // regen
  const combat = st.t - h.lastHit < PACE.oocDelay;
  let reg = combat ? PACE.regenCombat : PACE.regenOoc;
  reg += (h.regen || 0) / 1000; // gear / perk regeneration (percent of max health per 10 s)
  if (reg) h.hp = Math.min(h.maxHp, h.hp + h.maxHp * reg * dt);

  let mx = inp.mx || 0, mz = inp.mz || 0;
  const ml = Math.hypot(mx, mz);
  const manual = ml > 0.1;
  if (manual) { mx /= Math.max(1, ml); mz /= Math.max(1, ml); }
  const aimX = inp.aimX ?? h.x + Math.cos(h.face), aimZ = inp.aimZ ?? h.z + Math.sin(h.face);
  const aimAng = Math.atan2(aimZ - h.z, aimX - h.x);

  // teleport channel (v3: team.tele = {ws,left,...} is owned by travel.js; started by the command {t:'tele', ws}). Moving or charging cancels it.
  if (team.tele && (manual || h.dest || h.charging)) travelCancel(st, team, 'moved');
  h.tele = team.tele ? Math.max(0.001, team.tele.total - team.tele.left) : 0;

  // charged spell
  const ch = ultOf(team); // v0.5: R = the kit's ultimate (hero level 5); locked (null) before that
  if (ch && inp.charge && team.chCd <= 0 && h.tele === 0) {
    h.charging = true; h.chargeT = Math.min(ch.maxCharge, h.chargeT + dt);
    h.face = aimAng;
  } else if (h.charging) {
    if (h.chargeT >= 0.45 && team.chCd <= 0) castCharge(st, team, h, aimX, aimZ);
    h.charging = false; h.chargeT = 0;
  }

  // movement
  let speed = h.spd * bfm(h, 'spd') * (h.mspd || 1) * slowF(h) * (h.charging ? 0.45 : 1) * (h.tele > 0 ? 0 : 1);
  if (manual && !h.charging) {
    h.moving = true; h.walkPh += speed * dt * 0.9;
    moveBy(st, h, mx * speed * dt, mz * speed * dt);
    if (!(inp.atk)) h.face = Math.atan2(mz, mx);
    h.dest = null;
  } else if (manual && h.charging) {
    moveBy(st, h, mx * speed * dt, mz * speed * dt); h.moving = true; h.walkPh += speed * dt * 0.9;
  } else if (h.dest && h.tele === 0 && !h.charging) {
    if (goTo(st, h, h.dest.x, h.dest.z, dt, speed, h.dest.r || 0.8)) h.dest = null;
  }

  // skills
  if (!h.charging && h.tele === 0) {
    if (inp.casts && inp.casts.length) {
      for (const slot of inp.casts) {
        const id = slot >= 0 && slot < 3 && team.kit ? team.kit.slots[slot] : null; // Q W E (slot 3 = R is the charged ultimate, input.charge)
        if (!id || (team.cd[id] || 0) > 0) continue;
        if (castSkill(st, team, h, SKILLS[id], aimX, aimZ, aimAng, (inp.hold && inp.hold[slot]) || 0) !== false) break;
      }
    }
  }
  // basic attack
  if (inp.atk && !h.charging && h.tele === 0 && h.atkT <= 0) {
    h.face = aimAng; h.atkT = atkCd(h); h.swing = 0.28;
    const dmg = atkDamage(st, h);
    if (h.ranged) {
      const p = h.proj;
      fireProjectile(st, h, h.x + Math.cos(aimAng) * 1, h.z + Math.sin(aimAng) * 1, aimAng, { spd: p.spd, dmg, color: p.color, life: h.range / p.spd + 0.15, r: 0.85, dtype: h.poisonUntil > st.t ? 'poison' : h.dtype });
    } else {
      const reach = h.range + h.r;
      for (const o of st.ents.slice()) {
        if (!o.alive || !hostile(h.team, o.team) || o.hid > T) continue;
        const d = Math.hypot(o.x - h.x, o.z - h.z) - o.r;
        if (d > reach || Math.abs(angDiff(aimAng, Math.atan2(o.z - h.z, o.x - h.x))) > h.arc / 2 + Math.atan2(o.r, Math.max(d, 1))) continue;
        damage(st, h, o, dmg, h.poisonUntil > st.t ? { dtype: 'poison', psn: 5, dotMul: 3 } : { dtype: h.dtype });
      }
      for (const b of st.blds.slice()) {
        if (!hostile(h.team, b.team)) continue;
        const d = obbDist(h.x, h.z, b);
        if (d > reach - 0.4 || Math.abs(angDiff(aimAng, Math.atan2(b.z - h.z, b.x - h.x))) > h.arc / 2 + 0.6) continue;
        damage(st, h, b, dmg);
      }
      ev(st, { type: 'slash', x: h.x, z: h.z, ang: aimAng, arc: h.arc, reach, team: h.team });
    }
  }
}

const lvm = (h) => 1 + 0.1 * (h.lvl - 1);
const aimClamp = (h, ax, az, range) => { const d = Math.hypot(ax - h.x, az - h.z), k = range && d > range ? range / d : 1; return [h.x + (ax - h.x) * k, h.z + (az - h.z) * k]; };

// target is "not facing" the attacker (used by Backstab and Assassinate)
const facingAway = (o, from) => Math.abs(angDiff(o.face || 0, Math.atan2(from.z - o.z, from.x - o.x))) > 1.75;

// returns false when the skill could not be used (no cooldown is spent). `hold` = seconds the key was held (charge-and-release skills).
// Perks and gear modify the skill first (perks.modSkill), then the hold scales it (skillaim.holdScaled). See data.js SKILLS for the field vocabulary.
const sRider = (s) => { const r = {}; if (s.stun) r.stun = s.stun; if (s.burn) r.burn = s.burn; if (s.slow && typeof s.slow === 'object') { r.slow = s.slow.m; r.slowDur = s.slow.dur; } return Object.keys(r).length ? r : null; }; // status riders of projectile skills
// LoL-style area limits: within ONE cast (or one blast / one zone tick) the 1st target takes full damage, the next ones less (HIT_FALL), so a skill is a
// trade (aim it at the group's centre or at the elite) and cannot delete a 40-strong horde. Applied in damage() while CAST is set.
const HIT_FALL = [1, 0.78, 0.6, 0.46, 0.34, 0.24];
let CAST = null;
function castSkill(st, team, h, s0, ax, az, ang, hold = 0) {
  CAST = { id: h.id, n: 0 };
  try { return castSkillInner(st, team, h, s0, ax, az, ang, hold); } finally { CAST = null; }
}
function castSkillInner(st, team, h, s0, ax, az, ang, hold = 0) {
  const s = holdScaled(modSkill(team, s0, h), hold);
  const last = team.lastCast, cb = s.combo;
  const emp = !!(cb && last && cb.from.includes(last.id) && st.t - last.t <= (cb.window || 3)); // combo: cast right after one of the `from` skills
  h.cast = 0.45; h.face = ang;
  const dm = lvm(h) * bfm(h, 'dmg') * COMBAT.skillDmg * (1 + (h.skDmg || 0) / 100) * (emp ? cb.mul : 1);
  let ok = true;
  switch (s.type) {
    case 'line': {
      const c = Math.cos(ang), sn = Math.sin(ang);
      const probe = (px, pz, r) => { const dx = px - h.x, dz = pz - h.z; const l = dx * c + dz * sn, w = Math.abs(-dx * sn + dz * c); return l > 0 && l < s.len + r && w < s.w / 2 + r; };
      for (const o of st.ents.slice()) if (o.alive && hostile(h.team, o.team) && o.hid <= T && probe(o.x, o.z, o.r)) damage(st, h, o, s.dmg * dm, { stun: s.stun, dtype: s.dtype, burn: s.burn });
      for (const b of st.blds.slice()) if (hostile(h.team, b.team) && probe(b.x, b.z, b.r * 0.6)) damage(st, h, b, s.dmg * 0.6);
      ev(st, { type: 'line', x: h.x, z: h.z, ang, len: s.len, w: s.w, color: s.color });
      break;
    }
    case 'summon': if (summonKit(st, team, h, s, ang) <= 0) ok = false; break; // servants through the SERVANTS lane (perks.js summonKit)
    case 'buff': {
      const b = { until: st.t + s.dur, dmg: s.dmg || 1, atkSpd: s.atkSpd || 1, spd: s.spd || 1 };
      for (const e of st.ents) if (e.alive && e.team === h.team && (e.kind === 'unit' || e.kind === 'hero') && Math.hypot(e.x - h.x, e.z - h.z) <= s.radius) {
        if (s.dur > 0.5) e.buff = b;
        if (s.healPct) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * s.healPct);
      }
      ev(st, { type: 'buff', x: h.x, z: h.z, r: Math.max(s.radius, 2.5), color: team.f.color });
      break;
    }
    case 'aoe': {
      const [cx, cz] = s.self ? [h.x, h.z] : aimClamp(h, ax, az, s.range);
      let dmg = s.dmg * dm;
      if (s.lowHp) dmg *= 1 + s.lowHp * (1 - clamp(h.hp / h.maxHp, 0, 1)); // Penance: stronger the closer to death
      if (s.delay > 0) { // telegraphed: the renderer draws the warning ring for every timer
        st.timers.push({ type: 'blast', t: st.t + s.delay, x: cx, z: cz, r: s.radius, dmg, bldMul: s.bldMul, stun: s.stun, burn: s.burn, team: h.team, src: h.id, dtype: s.dtype, color: s.color || team.f.color, born: st.t, delay: s.delay });
      } else {
        areaDamage(st, h, cx, cz, s.radius, dmg, { stun: s.stun, burn: s.burn, bldMul: s.bldMul, dtype: s.dtype });
        ev(st, { type: 'blast', x: cx, z: cz, r: s.radius, color: s.color || team.f.color });
      }
      break;
    }
    case 'strike': { // cone hit: close-range bonus, bonus against enemies that are not facing you
      const half = s.arc / 2, bm = s.behind ? s.behind.mul + (s.behindAdd || 0) : 0;
      for (const o of st.ents.slice()) {
        if (!o.alive || !hostile(h.team, o.team) || o.hid > T) continue;
        const d = Math.hypot(o.x - h.x, o.z - h.z) - o.r;
        if (d > s.len || Math.abs(angDiff(ang, Math.atan2(o.z - h.z, o.x - h.x))) > half + Math.atan2(o.r, Math.max(d, 1))) continue;
        let m = 1;
        if (bm && facingAway(o, h)) m *= bm;
        if (s.close && d <= s.close.r) m *= s.close.mul;
        damage(st, h, o, s.dmg * dm * m, { stun: s.stun, dtype: s.dtype, burn: s.burn });
      }
      for (const b of st.blds.slice()) {
        if (!hostile(h.team, b.team) || b.trap) continue;
        const d = obbDist(h.x, h.z, b);
        if (d > s.len - 0.4 || Math.abs(angDiff(ang, Math.atan2(b.z - h.z, b.x - h.x))) > half + 0.6) continue;
        damage(st, h, b, s.dmg * dm * (s.bldMul || 0.5));
      }
      ev(st, { type: 'slash', x: h.x, z: h.z, ang, arc: s.arc, reach: s.len, team: h.team });
      break;
    }
    case 'dash': {
      const sx = h.x, sz = h.z, step = 0.5;
      const dist = s.toPoint ? clamp(Math.hypot(ax - h.x, az - h.z), 2.5, s.dist) : s.dist; // dash-to-point: stop at the cursor
      for (let d = 0; d < dist; d += step) {
        const nx = h.x + Math.cos(ang) * step, nz = h.z + Math.sin(ang) * step;
        if (!st.world.walkable(nx, nz)) break;
        const ox = h.x, oz = h.z;
        h.x = nx; h.z = nz;
        let hit = false;
        for (const b of st.blds) {
          if (Math.abs(b.x - h.x) > b.rad + 2 || Math.abs(b.z - h.z) > b.rad + 2) continue;
          if (b.passable && (b.team === h.team || b.team === HUMANITY)) continue;
          if (pushOutOBB({ x: h.x, z: h.z, r: h.r }, b)) { hit = true; break; }
        }
        if (hit) { h.x = ox; h.z = oz; break; }
      }
      if (s.dmg) {
        const dx = h.x - sx, dz = h.z - sz, l2 = Math.max(0.01, dx * dx + dz * dz);
        for (const o of st.ents.slice()) {
          if (!o.alive || !hostile(h.team, o.team) || o.hid > T) continue;
          const t = clamp(((o.x - sx) * dx + (o.z - sz) * dz) / l2, 0, 1);
          if (Math.hypot(o.x - (sx + dx * t), o.z - (sz + dz * t)) < o.r + 2.2) damage(st, h, o, s.dmg * dm, { stun: s.stun, dtype: s.dtype });
        }
      }
      h.ox = h.x - Math.cos(ang) * 2; h.oz = h.z - Math.sin(ang) * 2;
      if (s.hide) h.hid = st.t + s.hide;
      if (s.inv) h.inv = st.t + s.inv;
      ev(st, { type: 'dash', x: h.x, z: h.z, ang, color: team.f.color });
      if (s.land) { // landing blast (Savage Leap, Aftershock)
        areaDamage(st, h, h.x, h.z, s.land.radius, s.land.dmg * dm, { stun: s.land.stun, dtype: s.dtype, bldMul: 0.6 });
        ev(st, { type: 'blast', x: h.x, z: h.z, r: s.land.radius, color: s.color || team.f.color });
      }
      break;
    }
    case 'fan': {
      const n = Math.max(1, Math.round(s.n));
      for (let k = 0; k < n; k++) {
        const a2 = ang + (n > 1 ? (k / (n - 1) - 0.5) * s.arc : 0);
        fireProjectile(st, h, h.x + Math.cos(a2), h.z + Math.sin(a2), a2, { spd: 30, dmg: s.dmg * dm, life: s.range / 30, r: 0.6, color: s.color, kind: s.kind || 'knife', dtype: s.dtype, rider: sRider(s) });
      }
      break;
    }
    case 'zone': {
      const [zx, zz] = aimClamp(h, ax, az, s.range);
      const dps = s.dps * lvm(h) * COMBAT.skillDmg * (1 + (h.skDmg || 0) / 100) * (emp ? cb.mul : 1);
      if (s.wall) { // a wall of zones across the cursor, perpendicular to the aim direction
        const pa = ang + Math.PI / 2, n = Math.max(1, Math.round(s.wall.n));
        for (let k = 0; k < n; k++) {
          const off = (k - (n - 1) / 2) * s.wall.gap;
          st.zones.push({ x: zx + Math.cos(pa) * off, z: zz + Math.sin(pa) * off, r: s.radius, dps, until: st.t + s.dur, team: h.team, color: s.color, t0: st.t, slow: s.slow, dtype: s.dtype });
        }
      } else st.zones.push({ x: zx, z: zz, r: s.radius, dps, until: st.t + s.dur, team: h.team, color: s.color, t0: st.t, slow: s.slow, dtype: s.dtype });
      break;
    }
    case 'drain': {
      let n = 0;
      for (const o of st.ents.slice()) {
        if (!o.alive || !hostile(h.team, o.team) || o.hid > T) continue;
        const d = Math.hypot(o.x - h.x, o.z - h.z) - o.r;
        if (d > s.range || Math.abs(angDiff(ang, Math.atan2(o.z - h.z, o.x - h.x))) > s.arc / 2) continue;
        damage(st, h, o, s.dmg * dm, { dtype: s.dtype }); n++;
      }
      h.hp = Math.min(h.maxHp, h.hp + Math.min(h.maxHp * 0.35, s.dmg * n * s.heal * COMBAT.heroHp));
      ev(st, { type: 'slash', x: h.x, z: h.z, ang, arc: s.arc, reach: s.range, team: h.team });
      break;
    }
    case 'debuff': {
      const [cx, cz] = aimClamp(h, ax, az, s.range);
      for (const o of st.ents) if (o.alive && hostile(h.team, o.team) && Math.hypot(o.x - cx, o.z - cz) < s.radius + o.r) o.debuff = { until: st.t + s.dur, take: s.take, deal: s.deal };
      ev(st, { type: 'blast', x: cx, z: cz, r: s.radius, color: s.color });
      break;
    }
    case 'veil':
      h.inv = st.t + s.dur + (s.inv || 0); h.buff = { until: st.t + s.dur, dmg: 1, atkSpd: 1, spd: s.spd };
      ev(st, { type: 'buff', x: h.x, z: h.z, r: 2.5, color: 0xbfffe8 });
      break;
    case 'shield':
      h.shield = { amt: s.amt * lvm(h) * COMBAT.heroHp, until: st.t + s.dur };
      ev(st, { type: 'buff', x: h.x, z: h.z, r: 2.5, color: 0xffffff });
      break;
    case 'bolt': {
      const n = Math.max(1, Math.round(s.split || 1)); // Splitting Bolts perk: a fan of bolts at 60% damage each
      for (let k = 0; k < n; k++) {
        const a2 = ang + (k - (n - 1) / 2) * 0.3;
        fireProjectile(st, h, h.x + Math.cos(a2), h.z + Math.sin(a2), a2, { spd: s.spd, dmg: s.dmg * dm * (n > 1 ? 0.6 : 1), life: s.range / s.spd, r: 1.0, color: s.color, pierce: true, kind: 'bolt2', dtype: s.dtype, rider: sRider(s) });
      }
      break;
    }
    case 'poison':
      h.poisonUntil = st.t + s.dur;
      ev(st, { type: 'buff', x: h.x, z: h.z, r: 2.5, color: 0x88e040 });
      break;
    case 'smoke': { // thrown at the cursor; standing inside hides you
      const [cx, cz] = aimClamp(h, ax, az, s.range);
      st.zones.push({ x: cx, z: cz, r: s.radius, dps: 0, until: st.t + s.dur, team: h.team, color: 0x9aa0aa, t0: st.t, slow: s.slow });
      if (Math.hypot(cx - h.x, cz - h.z) <= s.radius + h.r) h.hid = st.t + s.hide;
      ev(st, { type: 'buff', x: cx, z: cz, r: s.radius, color: 0x9aa0aa });
      break;
    }
    case 'blink': { // blink behind the enemy nearest the cursor and strike
      let tgt = null, bd = s.radius || 6;
      for (const o of st.ents) {
        if (!o.alive || !hostile(h.team, o.team) || o.hid > T) continue;
        const da = Math.hypot(o.x - ax, o.z - az), dh = Math.hypot(o.x - h.x, o.z - h.z);
        if (dh > s.range || da > bd) continue;
        bd = da; tgt = o;
      }
      if (!tgt) { ok = false; break; }
      const a2 = Math.atan2(tgt.z - h.z, tgt.x - h.x), dd = tgt.r + h.r + 0.8;
      let nx = tgt.x + Math.cos(a2) * dd, nz = tgt.z + Math.sin(a2) * dd; // behind the target
      if (!st.world.walkable(nx, nz)) { nx = tgt.x - Math.cos(a2) * dd; nz = tgt.z - Math.sin(a2) * dd; }
      if (!st.world.walkable(nx, nz)) { ok = false; break; }
      ev(st, { type: 'dash', x: h.x, z: h.z, ang: a2, color: team.f.color });
      const away = facingAway(tgt, { x: nx, z: nz });
      h.x = nx; h.z = nz; h.ox = nx; h.oz = nz; h.face = Math.atan2(tgt.z - nz, tgt.x - nx); h.inv = st.t + 0.3;
      damage(st, h, tgt, s.dmg * dm * (tgt.hp < tgt.maxHp * 0.5 ? 1.4 : 1) * (away ? 1.3 : 1), { dtype: s.dtype });
      ev(st, { type: 'dash', x: h.x, z: h.z, ang: a2, color: team.f.color });
      break;
    }
    case 'martyr': {
      let u = null, bd = 1e9;
      for (const e of st.ents) {
        if (!e.alive || e.kind !== 'unit' || e.team !== h.team) continue;
        const d = Math.hypot(e.x - h.x, e.z - h.z), sc = e.temp ? d + 30 : d;
        if (d <= s.radius && sc < bd) { bd = sc; u = e; }
      }
      if (!u) { if (team.human) ev(st, { type: 'msg', text: 'No follower nearby to sacrifice', kind: 'warn', team: team.id }); ok = false; break; }
      const ux = u.x, uz = u.z;
      u.hp = 0; kill(st, u, null);
      areaDamage(st, h, ux, uz, s.blast, s.dmg * dm, { bldMul: 2, dtype: s.dtype });
      ev(st, { type: 'blast', x: ux, z: uz, r: s.blast, color: 0xff7a2a });
      h.hp = Math.min(h.maxHp, h.hp + h.maxHp * s.heal);
      break;
    }
  }
  if (ok === false) { h.cast = 0; return false; }
  team.cd[s.id] = s.cd;
  team.lastCast = { id: s.id, t: st.t };
  if (emp) ev(st, { type: 'combo', team: team.id, id: s.id, x: h.x, z: h.z });
  if (s.castHeal) h.hp = Math.min(h.maxHp, h.hp + h.maxHp * s.castHeal);
  if (s.castShield) { const amt = h.maxHp * s.castShield; if (!(h.shield && st.t < h.shield.until && h.shield.amt >= amt)) h.shield = { amt, until: st.t + 4 }; }
  if (s.rider) { // kit branches: burst / scatter / echo / zone / haste / ally heal / slow (perks.castRiders)
    const gt = (s.type === 'aoe' && !s.self) || s.type === 'zone' || s.type === 'smoke' || s.type === 'debuff';
    const [ix, iz] = gt ? aimClamp(h, ax, az, s.range) : [h.x, h.z];
    castRiders(st, team, h, s, ix, iz, dm);
  }
  return true;
}

function castCharge(st, team, h, ax, az) {
  const c = ultOf(team);
  if (!c) return;
  if (c.kind && c.kind !== 'blast') { castUlt(st, team, h, c, ax, az); return; } // rain / storm ultimates (ults.js)
  const ratio = clamp(h.chargeT / c.maxCharge, 0, 1);
  const d = Math.hypot(ax - h.x, az - h.z);
  const k = d > c.range ? c.range / d : 1;
  const x = h.x + (ax - h.x) * k, z = h.z + (az - h.z) * k;
  const r = lerp(c.minR, c.maxR, ratio) * (1 + (h.skRad || 0) / 100), dmg = lerp(c.minDmg, c.maxDmg, ratio) * (1 + 0.05 * (h.lvl - 1)) * bfm(h, 'dmg');
  team.chCd = c.cd * (1 - clamp(h.cdr || 0, 0, 50) / 100); h.cast = 0.6;
  h.face = Math.atan2(z - h.z, x - h.x);
  const spec = { type: 'blast', t: st.t + c.delay, x, z, r, dmg, bldMul: c.bldMul, stun: c.stun, burn: c.burn, team: h.team, src: h.id, dtype: c.dtype, color: c.color, vis: c.id, born: st.t, delay: c.delay };
  if (c.delay > 0) st.timers.push(spec); else resolveBlast(st, spec);
}

function resolveBlast(st, tm) {
  ev(st, { type: 'blast', x: tm.x, z: tm.z, r: tm.r, color: tm.color, big: true, vis: tm.vis });
  if (tm.team >= 0 && tm.team < 4) CAST = { id: tm.src, n: 0 }; // hero blast: diminishing damage per extra target (HIT_FALL)
  try { areaDamage(st, srcOf(tm.team, tm.src), tm.x, tm.z, tm.r, tm.dmg, { bldMul: tm.bldMul, stun: tm.stun, burn: tm.burn, dtype: tm.dtype }); } finally { CAST = null; }
}

// ---------------------------------------------------------------- units (servants)
function unitUpdate(st, u, dt) {
  u.atkT -= dt; u.swing -= dt; u.hitT -= dt; u.moving = false; u.scanT -= dt;
  dots(st, u, dt);
  if (u.stun > 0) { u.stun -= dt; return; }
  if (!u.alive) return;
  if (u.temp) { u.life -= dt; if (u.life <= 0) { u.hp = 0; kill(st, u, null); return; } }
  const team = st.teams[u.team], hero = team.hero;
  const hAlive = hero && hero.alive;
  const speed = u.spd * bfm(u, 'spd') * (u.mspd || 1) * slowF(u);
  if (SV.tick(st, u, dt) === true || !u.alive) return; // v0.5: servants busy casting (dash, whirl) skip the normal AI
  // regen
  if (st.t - u.lastHit > 6) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.015 * dt);

  let tgt = u.tgt ? st.byId.get(u.tgt) : null;
  if (tgt && (!tgt.alive || tgt.hp <= 0 || (tgt.hid > T && gap(u, tgt) > 5))) { tgt = null; u.tgt = 0; }
  if (!tgt && u.blockedBy) { const b = st.byId.get(u.blockedBy); if (b && b.alive && hostile(u.team, b.team)) { tgt = b; u.tgt = b.id; } }
  if (!tgt && u.scanT <= 0) {
    u.scanT = 0.3 + rf(st) * 0.15;
    const rad = u.mode === 'hold' ? 11 : 15;
    tgt = (u.role === 'siege' && SV.siegeTarget(st, u, Math.max(rad, 26))) || findTarget(st, u, rad);
    u.tgt = tgt ? tgt.id : 0;
  }
  // leash to hero when following
  if (tgt && u.mode === 'follow' && hAlive && Math.hypot(u.x - hero.x, u.z - hero.z) > 36) { tgt = null; u.tgt = 0; }
  if (tgt && u.mode === 'hold' && Math.hypot(u.x - u.hold.x, u.z - u.hold.z) > 22) { tgt = null; u.tgt = 0; }
  if (tgt && u.mode === 'patrol' && simHooks.unitLeash && simHooks.unitLeash(st, u, tgt)) { tgt = null; u.tgt = 0; }

  if (tgt) {
    const g = gap(u, tgt);
    if (g <= u.range) {
      u.face = Math.atan2(tgt.z - u.z, tgt.x - u.x);
      if (u.atkT <= 0) doAttack(st, u, tgt);
    } else goTo(st, u, tgt.x, tgt.z, dt, speed, 0.2);
    return;
  }
  if (u.mode === 'follow') {
    if (hAlive) {
      const tx = hero.x + Math.cos(u.slot) * u.slotR, tz = hero.z + Math.sin(u.slot) * u.slotR;
      const d = Math.hypot(tx - u.x, tz - u.z);
      if (d > 1.2) goTo(st, u, tx, tz, dt, d > 10 ? speed * 1.35 : speed, 0.8);
    } // the hero is down: followers wait where they are (they respawn with the hero)
  } else if (u.mode === 'amove') {
    if (goTo(st, u, u.dest.x + Math.cos(u.slot) * 1.5, u.dest.z + Math.sin(u.slot) * 1.5, dt, speed, 1.2)) { u.mode = 'hold'; u.hold = { x: u.dest.x, z: u.dest.z }; }
  } else if (u.mode === 'hold') {
    if (Math.hypot(u.hold.x - u.x, u.hold.z - u.z) > 2.5) goTo(st, u, u.hold.x, u.hold.z, dt, speed, 1.2);
  } else if (simHooks.unitMode) simHooks.unitMode(st, u, dt, speed); // modes sim.js does not know ('patrol' of town guards...)
}

// ---------------------------------------------------------------- monsters
function monUpdate(st, m, dt) {
  m.atkT -= dt; m.swing -= dt; m.hitT -= dt; m.moving = false; m.scanT -= dt;
  dots(st, m, dt);
  if (m.elite) eliteUpdate(st, m, dt);
  if (m.stun > 0) { m.stun -= dt; return; }
  if (!m.alive) return;
  const speed = m.spd * slowF(m);
  if (m.hz && hordeMon(st, m, dt, speed)) return; // demons: gates, waves, assault bands, the Demon Lord (horde.js)
  if (m.ai && simHooks.monster && simHooks.monster(st, m, dt, speed)) return; // optional custom monster behaviour
  let tgt = m.tgt ? st.byId.get(m.tgt) : null;
  if (tgt && (!tgt.alive || tgt.hp <= 0 || (tgt.hid > T && gap(m, tgt) > 5))) { tgt = null; m.tgt = 0; }
  const homeD = Math.hypot(m.x - m.home.x, m.z - m.home.z);
  const leash = m.boss ? 30 : 22;
  if (tgt && homeD > leash) { tgt = null; m.tgt = 0; m.returning = true; }
  if (m.returning) {
    m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.12 * dt);
    if (homeD < 3) m.returning = false;
    else { goTo(st, m, m.home.x, m.home.z, dt, speed * 1.2, 1); return; }
  }
  if (!tgt && m.scanT <= 0) {
    m.scanT = 0.35 + rf(st) * 0.2;
    tgt = findTarget(st, m, m.aggro * (isDread(st) ? DREAD.aggro : isNight(st) ? 1.25 : 1));
    if (tgt) {
      m.tgt = tgt.id;
      for (const o of st.ents) if (o.kind === 'mon' && o.camp === m.camp && o.alive && !o.tgt) o.tgt = tgt.id;
    }
  }
  if (m.boss) bossUpdate(st, m, dt);
  if (tgt) {
    const g = gap(m, tgt);
    if (g <= m.range) { m.face = Math.atan2(tgt.z - m.z, tgt.x - m.x); if (m.atkT <= 0) doAttack(st, m, tgt); }
    else goTo(st, m, tgt.x, tgt.z, dt, speed, 0.2);
  } else if (homeD > 4) goTo(st, m, m.home.x, m.home.z, dt, speed * 0.5, 1);
}

function bossUpdate(st, m, dt) {
  m.slamT -= dt;
  if (m.tgt && m.slamT <= 0) {
    m.slamT = 7;
    // telegraphed: the ring is drawn for 1 s (st.timers), then it lands where the boss stood: step out of it
    st.timers.push({ type: 'blast', t: st.t + 1.0, x: m.x, z: m.z, r: 9, dmg: m.atk * 2.6, bldMul: 1, stun: 1.0, team: m.team, src: m.id, dtype: 'cold', color: 0x6fa0b0, born: st.t, delay: 1.0 });
  }
  if (!m.adds && m.hp < m.maxHp * 0.5) {
    m.adds = true;
    const camp = st.camps[m.camp];
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU;
      const e = spawnMonster(st, k % 2 ? 'skelArcher' : 'skeleton', 2, m.x + Math.cos(a) * 5, m.z + Math.sin(a) * 5, camp);
      e.tgt = m.tgt;
    }
    ev(st, { type: 'msg', text: 'The Drowned King calls his dead!', kind: 'warn' });
  }
}

// ---------------------------------------------------------------- structures
function bldUpdate(st, b, dt) {
  b.swing -= dt;
  const A = b.atk;
  if (!A || b.hp <= 0) return;
  b.cdT -= dt; b.scanT -= dt;
  let tgt = b.tgt ? st.byId.get(b.tgt) : null;
  if (tgt && (!tgt.alive || tgt.hp <= 0 || tgt.kind === 'bld' || Math.hypot(tgt.x - b.x, tgt.z - b.z) > A.range + tgt.r + 1 || (tgt.hid > T && Math.hypot(tgt.x - b.x, tgt.z - b.z) > 5))) { tgt = null; b.tgt = 0; }
  if (!tgt && b.scanT <= 0) {
    b.scanT = 0.35;
    let best = null, bs = 1e9;
    for (const o of st.ents) {
      if (!o.alive || !hostile(b.team, o.team)) continue;
      const dd = Math.hypot(o.x - b.x, o.z - b.z);
      if (dd > A.range + o.r) continue;
      if (o.hid > T && dd > 5) continue;
      if (dd < bs) { bs = dd; best = o; }
    }
    tgt = best; b.tgt = best ? best.id : 0;
  }
  if (tgt && b.cdT <= 0) {
    b.cdT = A.cd; b.swing = 0.3;
    const ang = Math.atan2(tgt.z - b.z, tgt.x - b.x);
    b.aim = ang;
    fireProjectile(st, b, b.x, b.z, ang, { spd: 26, dmg: A.dmg, tgt: tgt.id, color: 0xe8dcc0, life: 2, heroMul: A.heroMul || 1, kind: 'arrow', dtype: A.dtype });
  }
}

// ---------------------------------------------------------------- projectiles
function projUpdate(st, dt) {
  for (let i = st.projs.length - 1; i >= 0; i--) {
    const p = st.projs[i];
    p.life -= dt;
    if (p.life <= 0) { st.projs.splice(i, 1); continue; }
    let tg = p.tgt ? st.byId.get(p.tgt) : null;
    if (p.tgt && (!tg || !tg.alive)) { p.tgt = 0; tg = null; }
    if (tg) {
      const a = Math.atan2(tg.z - p.z, tg.x - p.x); p.ang = a;
      p.vx = Math.cos(a) * p.spd; p.vz = Math.sin(a) * p.spd;
    }
    p.x += p.vx * dt; p.z += p.vz * dt;
    const src = { team: p.team, id: p.src };
    if (tg) {
      const d = tg.kind === 'bld' ? obbDist(p.x, p.z, tg) : Math.hypot(tg.x - p.x, tg.z - p.z) - tg.r;
      if (d < 0.5) { damage(st, src, tg, p.dmg, p.rider ? { ...p.rider, heroMul: p.heroMul, bldMul: p.bldMul, dtype: p.dtype } : { heroMul: p.heroMul, bldMul: p.bldMul, dtype: p.dtype }); st.projs.splice(i, 1); }
      continue;
    }
    let hitSomething = false;
    for (const o of st.ents) {
      if (!o.alive || !hostile(p.team, o.team) || (p.hit && p.hit.has(o.id)) || o.hid > T) continue;
      if (Math.hypot(o.x - p.x, o.z - p.z) < o.r + p.r) {
        damage(st, src, o, p.dmg, p.rider ? { ...p.rider, heroMul: p.heroMul, dtype: p.dtype } : { heroMul: p.heroMul, dtype: p.dtype });
        if (p.pierce) p.hit.add(o.id); else { hitSomething = true; break; }
      }
    }
    if (!hitSomething) {
      for (const b of st.blds) {
        if (!hostile(p.team, b.team) || b.hp <= 0 || b.trap) continue;
        if (Math.abs(b.x - p.x) > b.rad + 2) continue;
        if (obbDist(p.x, p.z, b) < p.r) { damage(st, src, b, p.dmg * 0.8, { bldMul: p.bldMul, dtype: p.dtype }); hitSomething = true; break; }
      }
    }
    if (hitSomething) st.projs.splice(i, 1);
  }
}

// ---------------------------------------------------------------- world objects
function pickupUpdate(st, dt) {
  // chests
  for (const c of st.chests) {
    if (c.opened) continue;
    for (const e of st.ents) {
      if (!e.alive || e.dead || e.team < 0 || e.team >= HUMANITY || e.temp || e.guard || (e.kind !== 'hero' && e.kind !== 'unit')) continue;
      if (Math.hypot(e.x - c.x, e.z - c.z) < 2.6 + e.r) {
        c.opened = true; c.respT = 300;
        st.teams[e.team].gold += c.gold;
        ev(st, { type: 'chest', x: c.x, z: c.z, amt: c.gold, team: e.team });
        dropLoot(st, c.x, c.z, { team: e.team, tier: c.tier, chest: true, n: DROP.chestGear }); // chests give 2 pieces
        break;
      }
    }
  }
  for (const c of st.chests) if (c.opened && c.respT > 0) { c.respT -= dt; if (c.respT <= 0) { c.opened = false; c.gold = Math.round(c.tier * 36 / 5) * 5; c.item = null; } }
  // items: only heroes take gear (auto-equip when better, else sold: gear.js)
  for (let i = st.items.length - 1; i >= 0; i--) {
    const it = st.items[i];
    for (const e of st.ents) {
      if (e.kind !== 'hero' || !e.alive || e.dead || e.team < 0 || e.team >= HUMANITY) continue;
      if (Math.hypot(e.x - it.x, e.z - it.z) > 2.4 + e.r) continue;
      if (!pickupV3(st, e, it)) { const g = sellValue(it); st.teams[e.team].gold += g; ev(st, { type: 'gold', x: it.x, z: it.z, amt: g, team: e.team }); }
      st.items.splice(i, 1);
      break;
    }
  }
  // shrines
  for (const s of st.shrines) {
    if (s.cd > 0) { s.cd -= dt; continue; }
    for (const e of st.ents) {
      if (!e.alive || e.dead || e.team < 0 || e.team >= HUMANITY || e.kind !== 'hero') continue;
      if (Math.hypot(e.x - s.x, e.z - s.z) < 3.5) {
        s.cd = 150;
        for (const u of st.ents) if (u.alive && u.team === e.team && (u.kind === 'unit' || u.kind === 'hero') && Math.hypot(u.x - s.x, u.z - s.z) < 14) {
          if (s.kind === 'heal') u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.6);
          else if (s.kind === 'might') u.buff = { until: st.t + 60, dmg: 1.3, atkSpd: 1.1, spd: 1 };
          else u.buff = { until: st.t + 60, dmg: 1, atkSpd: 1.1, spd: 1.28 };
        }
        ev(st, { type: 'shrine', x: s.x, z: s.z, kind: s.kind, team: e.team });
        break;
      }
    }
  }
}

function zonesUpdate(st, dt) {
  for (let i = st.zones.length - 1; i >= 0; i--) {
    const z = st.zones[i];
    if (st.t >= z.until) { st.zones.splice(i, 1); continue; }
    CAST = z.team >= 0 && z.team < 4 && z.dps > 0 ? { id: 0, n: 0 } : null; // hero zone tick: srcOf(team) has id 0
    for (const e of st.ents) {
      if (!e.alive || !hostile(z.team, e.team)) continue;
      if (Math.hypot(e.x - z.x, e.z - z.z) < z.r + e.r) {
        if (z.dps > 0) damage(st, srcOf(z.team), e, z.dps * dt, { dtype: z.dtype, dot: true });
        if (z.slow) { e.slowUntil = st.t + 0.4; e.slowMul = z.slow; }
      }
    }
    CAST = null;
    if (z.dps > 0) for (const b of st.blds.slice()) if (hostile(z.team, b.team) && obbDist(z.x, z.z, b) < z.r) damage(st, srcOf(z.team), b, z.dps * dt * 0.4, { dtype: z.dtype, dot: true });
  }
}

function campsUpdate(st, dt) {
  for (const c of st.camps) {
    if (c.boss || c.noResp || c.mons > 0) continue;
    c.respT -= dt;
    if (c.respT > 0) continue;
    let near = false;
    for (const e of st.ents) if (e.alive && e.team >= 0 && Math.hypot(e.x - c.x, e.z - c.z) < 28) { near = true; break; }
    if (!near) spawnCamp(st, c);
    else c.respT = 5;
  }
}

// ---------------------------------------------------------------- pacing events
function eventsUpdate(st, dt) {
  // monsters grow stronger over time
  st.growT -= dt;
  if (st.growT <= 0) {
    st.growT = 10;
    const mul = 1 + MONSTER_GROWTH * (st.t / 60);
    if (mul - st.timeMul > 0.004) {
      st.timeMul = mul;
      for (const e of st.ents) if (e.kind === 'mon' && e.alive) { e.timeMul = e.boss ? 1 + (mul - 1) * 0.3 : mul; recalc(e); }
    }
  }
  // Dread Moon
  if (st.dread && st.t >= st.dread.until) {
    st.dread = null;
    ev(st, { type: 'msg', text: 'The Dread Moon wanes.', kind: 'info' });
  }
  const at = DREAD.times[st.dreadIdx];
  if (at !== undefined) {
    if (!st.dreadWarned && st.t >= at - DREAD.warn && st.t < at) {
      st.dreadWarned = true;
      ev(st, { type: 'msg', text: 'A blood-red moon rises... the Dread Moon comes.', kind: 'warn' });
    }
    if (st.t >= at) {
      st.dread = { start: st.t, until: st.t + DREAD.dur };
      st.dreadIdx++; st.dreadWarned = false;
      ev(st, { type: 'msg', text: 'The Dread Moon! Monsters rage, but yield more gold and XP.', kind: 'big' });
    }
  }
}

// ---------------------------------------------------------------- commands
function runCommands(st, team, inp) {
  if (!inp || !inp.cmds) return;
  for (const c of inp.cmds) {
    if (!team.alive) break;
    switch (c.t) {
      case 'follow': team.stance = 'follow'; for (const u of servants(st, team.id, true)) { u.mode = 'follow'; u.path = null; } break;
      case 'hold': team.stance = 'hold'; for (const u of servants(st, team.id, true)) { u.mode = 'hold'; u.hold = { x: u.x, z: u.z }; u.path = null; } break;
      case 'amove': for (const u of servants(st, team.id, true)) { u.mode = 'amove'; u.dest = { x: c.x, z: c.z }; u.path = null; u.tgt = 0; } break;
      case 'goto': if (team.hero) team.hero.dest = { x: c.x, z: c.z, r: c.r }; break;
      case 'stop': if (team.hero) team.hero.dest = null; break;
      default: commandV3(st, team, c); // lane commands (perk picks, teleport to waystones, shop, quests, recruits...)
    }
  }
}

// ---------------------------------------------------------------- main step
// where a dead hero returns: its last waystone, else its starting spot
export function respawnPoint(st, team) {
  const ws = respawnStone(st, team);
  if (ws) return arrivalFor(st, ws);
  return { x: team.spawn.x, z: team.spawn.z };
}
function respawnHero(st, team, h) {
  const p = respawnPoint(st, team);
  h.dead = false; h.alive = true; h.x = p.x; h.z = p.z; h.ox = h.x; h.oz = h.z; h.hp = h.maxHp; h.stun = 0; h.burnUntil = 0; h.psnUntil = 0; h.slowUntil = 0; h.dest = null; h.path = null;
  h.shield = null; h.buff = null; h.debuff = null; h.hid = 0; h.inv = st.t + 2.5; h.lastHit = -99; team.tele = null; h.tele = 0;
  for (const id of team.followers || []) { // followers return with the hero
    const u = st.byId.get(id);
    if (u && u.alive) { const a = rf(st) * TAU; u.x = h.x + Math.cos(a) * 2.5; u.z = h.z + Math.sin(a) * 2.5; u.ox = u.x; u.oz = u.z; u.path = null; u.tgt = 0; }
  }
  ev(st, { type: 'tele', x: h.x, z: h.z, team: team.id, color: team.f.color, arrive: true });
  ev(st, { type: 'respawn', team: team.id, x: h.x, z: h.z, ws: team.lastWs || 0 });
  if (team.human) ev(st, { type: 'msg', text: 'You have returned.', kind: 'info', team: team.id });
}

// ---------------------------------------------------------------- main step
export function step(st, dt, inputs) {
  if (st.over) { st.t += dt; return; }
  st.t += dt; T = st.t; st.stepN++; st.pathBudget = 3;
  for (const e of st.ents) { e.ox = e.x; e.oz = e.z; }

  if (st.navDirty) { rebuildNav(st.nav, st.blds); st.navDirty = false; }

  for (const team of st.teams) if (team.alive) runCommands(st, team, inputs[team.id]);

  eventsUpdate(st, dt);

  // heroes (team 4 has none)
  for (const team of st.teams) {
    const h = team.hero;
    if (!team.alive || !h) continue;
    if (h.dead) {
      team.respT -= dt;
      tickCd(team, dt);
      if (team.respT <= 0) respawnHero(st, team, h);
      continue;
    }
    heroUpdate(st, team, h, inputs[team.id], dt);
  }

  for (const e of st.ents) {
    if (!e.alive) continue;
    if (e.kind === 'unit') unitUpdate(st, e, dt);
    else if (e.kind === 'mon') monUpdate(st, e, dt);
  }
  separate(st);
  for (const b of st.blds.slice()) bldUpdate(st, b, dt);
  projUpdate(st, dt);
  zonesUpdate(st, dt);
  for (let i = st.timers.length - 1; i >= 0; i--) { const tm = st.timers[i]; if (st.t >= tm.t) { st.timers.splice(i, 1); resolveBlast(st, tm); } }
  pickupUpdate(st, dt);
  campsUpdate(st, dt);
  updateV3(st, dt);

  // cleanup (heroes stay)
  for (let i = st.ents.length - 1; i >= 0; i--) {
    const e = st.ents[i];
    if (!e.alive && e.kind !== 'hero') { st.ents.splice(i, 1); st.byId.delete(e.id); }
  }
  if (st.items.length > 60) st.items.splice(0, st.items.length - 60);
}

// Internals exposed to the lane modules (perks, dungeons, pois, travel, towns, horde, recruits, orbs...). Use at call time only (circular import).
export const simApi = {
  addEnt, newAgent, recalc, spawnUnit, spawnMonster, spawnCamp, makeHero, addXP, giveXP, kill, endGame, damage, areaDamage, dropItem, dropLoot, rollItem, equipItem,
  addBuilding, moveBy, stepToward, goTo, findTarget, atkDamage, doAttack, tickCd, xpNeed, unitXpNeed, ev, rf, srcOf, respawnPoint, fireProjectile,
};
