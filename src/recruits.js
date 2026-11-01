// v0.5 SERVANTS lane module "recruits": the hero's servants (permanent followers, max 4), their three sources, summoned minions and town militia.
// Sources: (1) free a prisoner from a cage POI (`offerFromCage`, type chosen by the cage tier), (2) hire in a city (`mercenaryOffers` + cmd {t:'recruit', town, type}),
// (3) the hero SUMMON skill (`summonServants`, temporary, outside the cap). No levels / XP / evolution / gear / revival: a dead follower is gone and can be hired again.
// Followers: entities kind:'unit', recruit:true, team = hero team, team.followers = ids. Stances follow / hold / amove. Beyond FOLLOWER_TUNE.warpDist from the hero they teleport to him.
// Sim-side only (no DOM/Three). Randomness: st.rng() or seeded generators. See src/V5.md "SERVANTS lane API".
import * as D from './data.js';
import { simApi } from './sim.js';
import * as SP from './servant_spells.js';
import { mulberry32, clamp } from './util.js';

const { UNITS, FOLLOWER_MAX, FOLLOWER_TUNE: FT, MERC_TYPES, MERC_STOCK, CAGE_TYPES, MILITIA } = D;
const TAU = Math.PI * 2;
const ev = (st, e) => st.events.push(e);
const msg = (st, team, text, kind = 'info') => ev(st, { type: 'msg', text, kind, team: team.id });
const isHeroTeam = (t) => !!t && t.id >= 0 && t.id < 4 && !t.humanity;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// ---------------------------------------------------------------------------------------------------- queries
export const followerCap = (team) => FOLLOWER_MAX + ((team && team.bonus && team.bonus.followers) | 0);
export function followersOf(st, teamId) {
  const team = st.teams[teamId], out = [];
  if (!team || !team.followers) return out;
  for (const id of team.followers) { const e = st.byId.get(id); if (e && e.alive && e.recruit) out.push(e); }
  return out;
}
export const followerCount = (st, team) => (team && team.followers ? team.followers.length : 0);
export const roomFor = (st, team) => followerCount(st, team) < followerCap(team);
// temporary summoned servants of a team (outside the cap)
export function summonedOf(st, teamId) { const out = []; for (const e of st.ents) if (e.alive && e.summoned && e.team === teamId) out.push(e); return out; }

// ---------------------------------------------------------------------------------------------------- towns
function townList(st) {
  if (st.towns && st.towns.length) return st.towns;
  return (st.world && st.world.sites && st.world.sites.towns) || [];
}
export function findTown(st, id) { return townList(st).find((t) => t.id === id) || null; }
// the (standing) town whose zone contains x,z, else null
export function townAt(st, x, z, extra = 0) {
  for (const t of townList(st)) if (t.state !== 'fallen' && Math.hypot(t.x - x, t.z - z) <= (t.r || 40) + extra) return t;
  return null;
}
const placesKnown = (st) => townList(st).length > 0;

// ---------------------------------------------------------------------------------------------------- hire offers
const typeInfo = (type) => {
  const d = UNITS[type];
  return { hp: Math.round(d.hp), dmg: Math.round(d.atk), dps: Math.round(d.atk / d.cd), role: d.role, label: d.name, blurb: d.blurb, icon: d.icon, spells: d.spells || [] };
};
export function hireCost(st, team, type, town) {
  const d = UNITS[type];
  const m = ((team && team.mods && team.mods.hireMul) || 1) * (1 - Math.min(0.3, (town && town.disc) || 0));
  return Math.round((d && d.cost > 0 ? d.cost : 100) * m);
}
// The 3 servants a town sells (fixed per seed and town): one cheap, one mid-priced, one any. -> [{ id, idx, type, name, cost, role, label, blurb, icon, spells, hp, dmg, dps, sold }]
export function mercenaryOffers(st, townId) {
  const town = findTown(st, townId);
  if (!town || town.state === 'fallen') return [];
  const tiers = MERC_STOCK[town.kind || 'town'] || MERC_STOCK.town;
  const rnd = mulberry32((((st.seed | 0) * 73856093) ^ (townId * 19349663) ^ 0x5bd1e995) >>> 0);
  const pool = MERC_TYPES.filter((k) => tiers.includes(UNITS[k].tier));
  const takeFrom = (list) => { const l = list.filter((k) => pool.includes(k)); return l.length ? l[Math.floor(rnd() * l.length)] : null; };
  const picked = [];
  const add = (k) => { if (k && !picked.includes(k)) { picked.push(k); pool.splice(pool.indexOf(k), 1); } };
  add(takeFrom(MERC_TYPES.filter((k) => UNITS[k].tier === 1)));
  add(takeFrom(MERC_TYPES.filter((k) => UNITS[k].tier === 2)));
  while (picked.length < 3 && pool.length) add(pool[Math.floor(rnd() * pool.length)]);
  picked.sort((a, b) => UNITS[a].cost - UNITS[b].cost);
  const team = st.teams[0];
  return picked.map((type, i) => ({ id: `${townId}:${type}`, idx: i, type, name: UNITS[type].name, lvl: 1, cost: hireCost(st, team, type, town), ...typeInfo(type), sold: false }));
}
// null if `team` can hire `type` from town `townId` now, else a short reason
export function hireBlock(st, team, townId, type) {
  const h = team.hero;
  if (!team.alive || !h || !h.alive) return 'You are dead';
  const town = townId === undefined || townId === null ? townAt(st, h.x, h.z, FT.hireRange) : findTown(st, townId);
  if (placesKnown(st)) {
    if (!town) return 'No mercenaries here';
    if (town.state === 'fallen') return 'The town has fallen';
    if (Math.hypot(town.x - h.x, town.z - h.z) > (town.r || 40) + FT.hireRange) return 'Too far from the broker';
  }
  if (!roomFor(st, team)) return `Your band is full (${followerCap(team)})`;
  const offer = town ? mercenaryOffers(st, town.id).find((x) => x.type === type) : null;
  if (town && !offer) return 'Nobody here sells that';
  if (!town && !(UNITS[type] && UNITS[type].cost > 0)) return 'Unknown servant';
  const cost = offer ? offer.cost : hireCost(st, team, type);
  if (team.gold < cost) return `Not enough gold (${cost})`;
  return null;
}

// ---------------------------------------------------------------------------------------------------- creating servants
// spawn a permanent follower near the hero (or at o.x/o.z). o: { src, x, z, free (ignore the cap) }
export function spawnFollower(st, team, type, o = {}) {
  const d = UNITS[type];
  if (!d || !team) return null;
  if (!o.free && !roomFor(st, team)) return null;
  const h = team.hero, a = st.rng() * TAU;
  const x = o.x !== undefined ? o.x : (h ? h.x + Math.cos(a) * 2.6 : 0), z = o.z !== undefined ? o.z : (h ? h.z + Math.sin(a) * 2.6 : 0);
  const e = simApi.spawnUnit(st, type, team.id, x, z, {});
  if (!e) return null;
  e.recruit = true; e.owner = h ? h.id : 0; e.src = o.src || 'town'; e.name = d.name;
  e.mode = team.stance === 'hold' ? 'hold' : 'follow'; e.hold = { x, z };
  e.hp = e.maxHp;
  if (!team.followers) team.followers = [];
  team.followers.push(e.id);
  ev(st, { type: 'recruited', id: e.id, team: team.id, name: e.name, unit: type, src: e.src, x: e.x, z: e.z });
  ev(st, { type: 'buff', x: e.x, z: e.z, r: 1.8, color: 0xffe9a0 });
  return e;
}

// HERO SUMMON skill API (SKILLS lane): `n` temporary servants of `type` (any UNITS key) for `dur` s near the hero (or o.x/o.z). They fight and follow like
// followers but count outside the follower cap, are never listed in team.followers and vanish when the timer ends. Returns the spawned entities.
export function summonServants(st, teamId, type, n = 1, dur = 20, o = {}) {
  const team = st.teams[teamId], d = UNITS[type], out = [];
  if (!team || !d) return out;
  const h = team.hero, cx = o.x !== undefined ? o.x : h ? h.x : 0, cz = o.z !== undefined ? o.z : h ? h.z : 0, rad = o.r || 2.8;
  const mine = summonedOf(st, teamId);
  for (let i = 0; i < n; i++) {
    if (mine.length + out.length >= (o.cap || 14)) { const old = mine.shift(); if (old) { old.life = 0; old.hp = 0; simApi.kill(st, old, null); } }
    const a = (i / Math.max(1, n)) * TAU + st.rng() * 0.8, r = rad * (0.6 + st.rng() * 0.6);
    const e = simApi.spawnUnit(st, type, teamId, cx + Math.cos(a) * r, cz + Math.sin(a) * r, { temp: true, life: dur });
    if (!e) continue;
    e.summoned = true; e.owner = h ? h.id : 0; e.hp = e.maxHp;
    if (o.mode) e.mode = o.mode;
    ev(st, { type: 'summon', x: e.x, z: e.z, color: o.color || 0xc08cff });
    out.push(e);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------- death
// sim hook (v3hooks killV3): every death is seen once before it is processed
export function onKill(st, t) {
  if (!t.recruit || t.kind !== 'unit' || t.recFell) return;
  t.recFell = true;
  const team = st.teams[t.team];
  if (!team || !team.followers) return;
  team.followers = team.followers.filter((id) => id !== t.id);
  ev(st, { type: 'followerDied', id: t.id, team: t.team, name: t.name, unit: t.type, x: t.x, z: t.z });
  msg(st, team, `${t.name} has fallen. Hire another in a city.`, 'warn');
}

// ---------------------------------------------------------------------------------------------------- cage prisoners
export function cageType(st, poi) {
  const camp = st.camps && poi.camp !== undefined ? st.camps[poi.camp] : null;
  const tier = clamp((poi.tier | 0) || (camp && camp.tier) || 2, 1, 3);
  const list = CAGE_TYPES[tier] || CAGE_TYPES[2];
  const rnd = mulberry32((((st.seed | 0) * 2654435761) + (poi.id | 0) * 40503) >>> 0);
  return poi.servant && UNITS[poi.servant] ? poi.servant : list[Math.floor(rnd() * list.length)];
}
// pois.js 'cage' (guards dead): the prisoner swears service on the spot. Returns true when the cage was handled (freed, or the band is full).
export function offerFromCage(st, team, poi) {
  if (!isHeroTeam(team)) return false;
  if (poi.used) return true;
  if (!roomFor(st, team)) { msg(st, team, `Your band is full (${followerCap(team)}). Dismiss someone to free the prisoner.`, 'warn'); return true; }
  const type = cageType(st, poi), h = team.hero;
  const e = spawnFollower(st, team, type, { src: 'cage', x: h ? h.x + 2 : poi.x, z: h ? h.z + 2 : poi.z });
  if (!e) return false;
  poi.used = true;
  ev(st, { type: 'cage', team: team.id, x: poi.x, z: poi.z, ok: true });
  msg(st, team, `The ${UNITS[type].name} is free and swears service to you!`, 'big');
  const grant = D.POI && D.POI.cage ? (D.POI.cage.xp || FT.cageXp) : FT.cageXp;
  if (simApi.giveXP) simApi.giveXP(st, team.id, e.x, e.z, grant);
  return true;
}

// pois.js 'graveyard' (kept while the POI exists): temporary skeletons, no permanent follower. -> { permanent, id, temps }
export function graveyardRaise(st, team, p, A) {
  const n = (A && A.n) || 3, life = (A && A.life) || 40;
  summonServants(st, team.id, 'skeleton', n, life, { x: p.x, z: p.z, r: 3.2, color: 0x7dffd0 });
  return { permanent: false, id: 0, temps: n };
}

// ---------------------------------------------------------------------------------------------------- town militia (team 4, free)
// towns.js asks for the plan of a town kind and the respawn delay; it spawns the units itself with its guard code (spawnGuard / gq queue).
// plan: [[unitKey, role]] with role 'guard' | 'archer' | 'captain' (the roles towns.js already uses).
export const militia = {
  respawn: MILITIA.respawn,
  hold: MILITIA.hold,
  keys: { guard: 'militia', archer: 'militiaArcher', captain: 'militiaCaptain' },
  plan(kind) {
    const p = MILITIA.plan[kind] || MILITIA.plan.village, out = [];
    for (let i = 0; i < p[0]; i++) out.push(['militia', 'guard']);
    for (let i = 0; i < p[1]; i++) out.push(['militiaArcher', 'archer']);
    for (let i = 0; i < p[2]; i++) out.push(['militiaCaptain', 'captain']);
    return out;
  },
  size: (kind) => { const p = MILITIA.plan[kind] || MILITIA.plan.village; return p[0] + p[1] + p[2]; },
  // may a militia replacement spawn now? (the town stands: not fallen and its walls still have health)
  canRespawn: (town) => !!town && town.state !== 'fallen' && (town.hp === undefined || town.hp > 0),
};

// ---------------------------------------------------------------------------------------------------- per-follower behaviour (called from servants.tick)
function warp(st, u, h) {
  const a = st.rng() * TAU, r = 2 + st.rng() * 2.4;
  ev(st, { type: 'buff', x: u.x, z: u.z, r: 1.6, color: 0x9fd0ff });
  u.x = h.x + Math.cos(a) * r; u.z = h.z + Math.sin(a) * r; u.ox = u.x; u.oz = u.z;
  u.path = null; u.tgt = 0; u.farT = 0; u.hold = { x: u.x, z: u.z };
  ev(st, { type: 'buff', x: u.x, z: u.z, r: 1.6, color: 0x9fd0ff });
}
export function tickRecruit(st, u, dt) {
  // regeneration out of combat (faster inside a town)
  if (u.hp < u.maxHp && st.t - u.lastHit > 6) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * FT.regen * dt * (townAt(st, u.x, u.z) ? 3 : 1));
  const h = st.teams[u.team] && st.teams[u.team].hero;
  // ranged roles keep their distance
  if (u.kite && u.tgt && !(u.stun > 0) && u.moving === false) {
    const t = st.byId.get(u.tgt);
    if (t && t.alive && t.kind !== 'bld' && (!h || !h.alive || dist(u, h) < 18)) {
      const dx = u.x - t.x, dz = u.z - t.z, dd = Math.hypot(dx, dz) || 1, gap = dd - t.r - u.r;
      if (gap < u.kite) simApi.stepToward(st, u, u.x + (dx / dd) * 3, u.z + (dz / dd) * 3, dt, u.spd * 0.9 * (u.mspd || 1));
    }
  }
}

// ---------------------------------------------------------------------------------------------------- module hooks
export function init(st) {
  st.recr = { acc: 0 };
  for (const team of st.teams) {
    if (!isHeroTeam(team)) continue;
    team.followers = []; team.fpos = null;
  }
}
export function update(st, dt) {
  if (!st.recr) init(st);
  const R = st.recr; R.acc += dt;
  const slow = R.acc >= 0.5; if (slow) R.acc -= 0.5;
  SP.update(st, dt);
  for (const team of st.teams) {
    if (!team.followers) continue;
    const h = team.hero;
    if (slow) team.followers = team.followers.filter((id) => { const e = st.byId.get(id); return e && e.alive && e.recruit; }); // dead / removed entities
    if (!team.followers.length) { if (h) team.fpos = { x: h.x, z: h.z }; continue; }
    if (!h || !h.alive) continue;
    const fp = team.fpos;
    const jumped = fp && Math.hypot(h.x - fp.x, h.z - fp.z) > FT.warpDist * 0.6; // teleport or respawn: everybody comes along
    for (const id of team.followers) {
      const u = st.byId.get(id);
      if (!u || !u.alive) continue;
      if (jumped) { warp(st, u, h); continue; }
      if (u.mode === 'hold') { u.farT = 0; continue; }
      if (Math.hypot(u.x - h.x, u.z - h.z) > FT.warpDist && !(u.sv && u.sv.busy)) { u.farT = (u.farT || 0) + dt; if (u.farT > FT.warpT) warp(st, u, h); } else u.farT = 0;
    }
    team.fpos = { x: h.x, z: h.z };
  }
}

// ---------------------------------------------------------------------------------------------------- commands
// stance / roster commands. Targets: c.id (one follower) or every follower
function targets(st, team, c) {
  if (c.id) { const e = st.byId.get(c.id); return e && e.alive && e.recruit && e.team === team.id ? [e] : []; }
  return followersOf(st, team.id);
}
export function command(st, team, c) {
  switch (c.t) {
    case 'recruit': {
      const h = team.hero;
      const town = c.town !== undefined && c.town !== null ? findTown(st, c.town) : (h ? townAt(st, h.x, h.z, FT.hireRange) : null);
      const why = hireBlock(st, team, town ? town.id : c.town, c.type);
      if (why) { if (team.human) msg(st, team, why, 'warn'); return true; }
      const o = town ? mercenaryOffers(st, town.id).find((x) => x.type === c.type) : null;
      const cost = o ? o.cost : hireCost(st, team, c.type);
      const e = spawnFollower(st, team, c.type, { src: 'town' });
      if (e) {
        team.gold -= cost;
        msg(st, team, `${e.name} joins you for ${cost} gold.`, 'info');
      }
      return true;
    }
    case 'dismiss': {
      for (const e of targets(st, team, { id: c.id })) {
        e.recFell = true; e.alive = false; e.hp = 0; e.dead = false;
        team.followers = (team.followers || []).filter((id) => id !== e.id);
        ev(st, { type: 'buff', x: e.x, z: e.z, r: 1.6, color: 0xb0b8c0 });
        ev(st, { type: 'followerDismissed', id: e.id, team: team.id, name: e.name });
        msg(st, team, `${e.name} leaves your service.`, 'info');
      }
      return true;
    }
    case 'stance': {
      const mode = c.mode;
      for (const u of targets(st, team, c)) {
        if (mode === 'follow') { u.mode = 'follow'; u.path = null; }
        else if (mode === 'hold') { u.mode = 'hold'; u.hold = { x: u.x, z: u.z }; u.path = null; }
        else if (mode === 'amove' && c.x !== undefined) { u.mode = 'amove'; u.dest = { x: c.x, z: c.z }; u.path = null; u.tgt = 0; }
      }
      return true;
    }
    default: return false;
  }
}
