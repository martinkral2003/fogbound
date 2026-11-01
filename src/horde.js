// v0.5 lane module "horde" (DEMONS lane, see src/V5.md "DEMONS lane API"): the demon invasion. Sim-only (no DOM/Three).
//   st.horde {path, cum, len, dist, speed, hc, rate, gates[], assaults[], waves, lord, capital, events[], stats, ...}  (JSON-able)
// Demon Gates (destructible, ward, guards, waves) pour imps/hounds/brutes/warlocks/hulks onto a scripted front line that moves along world.sites.frontPath;
// when the front reaches a town (or the capital) a warned assault band attacks it. Closing (destroying) all gates or killing the Demon Lord wins ('gates');
// the capital falling and not being reclaimed in time loses ('capital'). Side events (hunter packs, caravans) and the objective feed (st.objective) live here too.
// Everything from other lanes (towns, perks, endGame) is called defensively. Exports for UI: frontPos, activeAssaults, hordeList, frontDanger, setObjective, gateList.
import { HORDE, MONSTERS, WORLD, PACE } from './data.js';
import * as simMod from './sim.js';
import * as townsMod from './towns.js';
import * as perksMod from './perks.js';
import { clamp, TAU } from './util.js';

const A = () => simMod.simApi;
const hyp = Math.hypot;
const ev = (st, e) => st.events.push(e);
const fn = (m, name) => (m && typeof m[name] === 'function' ? m[name] : null);
const tierAt = (min) => (min >= HORDE.tierMin[2] ? 3 : min >= HORDE.tierMin[1] ? 2 : 1);
const rrange = (rng, a, b) => a + (b - a) * rng();

// ---------------------------------------------------------------- path helpers
function buildPath(h, pts) {
  h.path = pts.map((p) => [p[0], p[1]]);
  h.cum = [0];
  for (let i = 1; i < h.path.length; i++) h.cum.push(h.cum[i - 1] + hyp(h.path[i][0] - h.path[i - 1][0], h.path[i][1] - h.path[i - 1][1]));
  h.len = h.cum[h.cum.length - 1];
}
export function pathPos(h, d) {
  d = clamp(d, 0, h.len);
  let i = 1;
  while (i < h.cum.length - 1 && h.cum[i] < d) i++;
  const a = h.path[i - 1], b = h.path[i], seg = Math.max(1e-6, h.cum[i] - h.cum[i - 1]), u = (d - h.cum[i - 1]) / seg;
  return { x: a[0] + (b[0] - a[0]) * u, z: a[1] + (b[1] - a[1]) * u, dx: (b[0] - a[0]) / seg, dz: (b[1] - a[1]) / seg };
}
function project(h, x, z) {
  let best = 1e9, bd = 0;
  for (let i = 1; i < h.path.length; i++) {
    const a = h.path[i - 1], b = h.path[i], sx = b[0] - a[0], sz = b[1] - a[1], l2 = sx * sx + sz * sz || 1e-6;
    const u = clamp(((x - a[0]) * sx + (z - a[1]) * sz) / l2, 0, 1);
    const d = hyp(x - (a[0] + sx * u), z - (a[1] + sz * u));
    if (d < best) { best = d; bd = h.cum[i - 1] + Math.sqrt(l2) * u; }
  }
  return { d: bd, off: best };
}
function snap(st, x, z) {
  const w = st.world;
  if (!w.walkable || w.walkable(x, z)) return [x, z];
  for (let r = 3; r <= 70; r += 3) for (let k = 0; k < 12; k++) {
    const a = (k / 12) * TAU, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
    if (w.walkable(px, pz)) return [px, pz];
  }
  return [x, z];
}
function freeSpot(st, x, z) {
  const w = st.world;
  if (!w.walkable || w.walkable(x, z)) return [x, z];
  for (let rr = 2; rr <= 40; rr += 2) for (let k = 0; k < 10; k++) {
    const a = (k / 10) * TAU + rr, px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr;
    if (w.walkable(px, pz)) return [px, pz];
  }
  return [x, z];
}

// ---------------------------------------------------------------- sites (MAP lane output: world.sites.demon; derived from the old orc camps until it exists)
function demonSites(st) {
  const sites = st.world.sites || {}, d = sites.demon, o = sites.orc, S = WORLD.half;
  let gates = null, lord = null;
  if (d && Array.isArray(d.gates) && d.gates.length) {
    gates = d.gates.map((g) => ({ siteId: g.id, x: g.x, z: g.z, tier: g.tier || 0 }));
    lord = d.lord || null;
  } else if (o && o.camps && o.camps.length) {
    const wc = o.warcamp || o.camps[0], rest = o.camps.filter((c) => hyp(c.x - wc.x, c.z - wc.z) > 6);
    const chosen = [{ siteId: 0, x: wc.x, z: wc.z, tier: 3 }];
    for (let k = 0; k < 2 && rest.length; k++) { // farthest-point pick, forts first
      let best = -1, bs = -1;
      rest.forEach((c, i) => { const sep = Math.min(...chosen.map((q) => hyp(c.x - q.x, c.z - q.z))); const s = sep + (c.kind === 'fort' ? 25 : 0); if (s > bs) { bs = s; best = i; } });
      const c = rest.splice(best, 1)[0];
      chosen.push({ siteId: c.id || 0, x: c.x, z: c.z, tier: 2 - k });
    }
    gates = chosen;
    lord = o.warlord || { x: wc.x, z: wc.z };
  } else {
    const p = [[0.5, -0.55, 3], [0.74, -0.3, 2], [0.3, -0.76, 1]].map(([a, b, t]) => { const q = snap(st, a * S, b * S); return { siteId: 0, x: q[0], z: q[1], tier: t }; });
    gates = p; lord = { x: p[0].x - 8, z: p[0].z + 8 };
  }
  gates = gates.map((g) => ({ ...g, tier: clamp(Math.round(g.tier) || 0, 0, 3) }));
  if (!lord) lord = { x: gates[0].x, z: gates[0].z };
  if (new Set(gates.map((g) => g.tier)).size === 1 && gates.length > 1) { // MAP gave no tiers: nearest to the lord = main gate (tier 3), then 2, 1
    const order = gates.slice().sort((a, b) => hyp(a.x - lord.x, a.z - lord.z) - hyp(b.x - lord.x, b.z - lord.z));
    order.forEach((g, i) => { g.tier = clamp(3 - i, 1, 3); });
  }
  gates.forEach((g) => { if (!g.tier) g.tier = 1; });
  return { gates, lord: { x: lord.x, z: lord.z } };
}

function fallbackPath(st, gates, townsList) {
  const cap = townsList.find((t) => t.kind === 'capital') || townsList[townsList.length - 1];
  const g0 = gates[0], pts = [];
  const tx = cap ? cap.x : -WORLD.half * 0.6, tz = cap ? cap.z : WORLD.half * 0.6;
  for (let i = 0; i <= 10; i++) { const u = i / 10; pts.push(snap(st, g0.x + (tx - g0.x) * u, g0.z + (tz - g0.z) * u)); }
  return pts;
}

function prepare(st) {
  const h = st.horde, sites = st.world.sites || {};
  const ds = demonSites(st);
  const townsList = st.towns && st.towns.length ? st.towns : (sites.towns || []).map((t) => ({ id: t.id, name: t.name || 'Town ' + t.id, x: t.x, z: t.z, r: t.r || 26, kind: t.kind || 'village', state: 'safe' }));
  h.fb = st.towns && st.towns.length ? [] : townsList;
  let path = sites.frontPath;
  if (!Array.isArray(path) || path.length < 2) { path = fallbackPath(st, ds.gates, townsList); h.fallback = true; }
  buildPath(h, path);
  // gates: one monster entity each (stationary), a reserved st.camps slot so sim.js kill() finds its camp
  ds.gates.sort((a, b) => b.tier - a.tier);
  for (const g of ds.gates) if (g.tier >= 3 && ds.lord) { g.x = ds.lord.x + 3; g.z = ds.lord.z - 3; } // v0.6: the fortress heart stands in the middle of the castle, behind two wall rings
  ds.gates.forEach((g, i) => {
    const sc = { id: st.camps.length, x: g.x, z: g.z, tier: g.tier, types: [], biome: 0, mons: 0, respT: 0, boss: false, noResp: true, horde: i };
    st.camps.push(sc);
    const rec = { id: i, siteId: g.siteId, x: g.x, z: g.z, tier: g.tier, hp: 0, maxHp: 0, closed: false, vuln: false, entId: 0, ids: [], campIdx: sc.id, waveT: 12 + i * 6, waves: 0, phase: 0, guardT: 0, guardN: 0, openAt: 1e9 /* v0.6: the fortress is warded until the capital falls (capitalFell) */, warnT: -99, by: -1, lastHit: 0, lastAtt: 0, dmgBy: {} };
    h.gates.push(rec);
    const m = dmon(st, 'demonGate', 1, g.x, g.z, sc, { mode: 'gate', hx: g.x, hz: g.z });
    m.hgate = i; m.title = g.tier >= 3 ? 'The Fortress' : 'Demon Gate'; m.x = m.ox = g.x; m.z = m.oz = g.z;
    pinHp(m, HORDE.gate.hp[g.tier - 1] || HORDE.gate.hp[0]);
    rec.entId = m.id; rec.maxHp = m.maxHp; rec.hp = m.hp;
  });
  h.mainGate = h.gates.reduce((b, g, i) => (g.tier > h.gates[b].tier ? i : b), 0);
  const lsc = { id: st.camps.length, x: ds.lord.x, z: ds.lord.z, tier: 3, types: [], biome: 0, mons: 0, respT: 0, boss: false, noResp: true, horde: -1 };
  st.camps.push(lsc);
  h.lord = { id: 0, state: 'sealed', phase: 1, x: ds.lord.x, z: ds.lord.z, campIdx: lsc.id, spawned: false, summoned: [false, false], rage: false, cleaveT: 3, slamT: 6, ringT: 10, addT: 20, dmgBy: {}, killer: -1, t0: -1, idleT: 0 };
  h.capitalId = sites.capital != null ? sites.capital : (townsList.find((t) => t.kind === 'capital') || townsList[townsList.length - 1]).id;
  h.startId = sites.startTown != null ? sites.startTown : 0;
  // schedule: towns ordered along the path; the clock (hc, seconds) maps to a path distance by interpolation
  const stops = Array.isArray(sites.frontStops) && sites.frontStops.length ? sites.frontStops : null;
  const list = (stops ? stops.map((q) => ({ id: q.townId, d: q.dist + (q.off || 0) * 0.35 })) : townsList.map((t) => ({ id: t.id, d: project(h, t.x, t.z).d }))).map((q) => ({ ...q, cap: q.id === h.capitalId })).sort((a, b) => a.d - b.d);
  const cap = list.find((t) => t.cap) || list[list.length - 1];
  const normal = list.filter((t) => !t.cap && t.id !== h.startId && t.d < cap.d - 20);
  const pts = [];
  normal.forEach((t, i) => pts.push({ id: t.id, D: Math.max(0, t.d - HORDE.lead), T: HORDE.firstWarn + i * HORDE.townGap, cap: false }));
  const tLast = pts.length ? pts[pts.length - 1].T : HORDE.firstWarn - HORDE.townGap;
  pts.push({ id: cap.id, D: Math.max(0, cap.d - HORDE.lead), T: Math.max(HORDE.capitalAt, tLast + HORDE.townGap), cap: true });
  for (let i = 1; i < pts.length; i++) { if (pts[i].D <= pts[i - 1].D + 1) pts[i].D = pts[i - 1].D + 1; }
  h.sched = pts.map((p) => ({ ...p, trig: false }));
  h.clock = [[0, 0], ...pts.map((p) => [p.T, p.D])];
  h.evSched = HORDE.events.map((e, i) => ({ ...e, id: i + 1, done: false }));
  h.ready = true;
}

const distAtClock = (h, hc) => {
  const c = h.clock;
  if (hc <= 0) return 0;
  for (let i = 1; i < c.length; i++) {
    if (hc <= c[i][0]) return c[i - 1][1] + (c[i][1] - c[i - 1][1]) * ((hc - c[i - 1][0]) / Math.max(1e-6, c[i][0] - c[i - 1][0]));
  }
  const n = c.length, last = c[n - 1], prev = c[Math.max(0, n - 2)];
  const slope = (last[1] - prev[1]) / Math.max(1, last[0] - prev[0]);
  return Math.min(h.len, last[1] + (hc - last[0]) * slope);
};

// ---------------------------------------------------------------- towns (TOWNS lane exports are optional)
const townsOn = (st) => !!(st.towns && st.towns.length && fn(townsMod, 'setTownState'));
const townList = (st) => (st.towns && st.towns.length ? st.towns : st.horde.fb);
const townById = (st, id) => { for (const t of townList(st)) if (t.id === id) return t; return null; };
function setTownState(st, t, state) {
  const f = fn(townsMod, 'setTownState');
  if (f && townsOn(st)) { try { f(st, t.id, state); } catch (e) { /* TOWNS lane may be mid-edit */ } }
  if (t.state !== state) t.state = state;
}
function defenderCount(st, t) {
  let n = 0;
  const f = fn(townsMod, 'townDefenders');
  const R = (t.r || 26) * 1.1 + 6;
  if (f && townsOn(st)) {
    try { const v = f(st, t.id); if (Array.isArray(v)) n += v.filter((e) => e && e.alive !== false && (e.hp === undefined || e.hp > 0)).length; else if (typeof v === 'number') n += v; } catch (e) { /* fall through */ }
  }
  for (const e of st.ents) {
    if (!e.alive || e.dead || hyp(e.x - t.x, e.z - t.z) > R) continue;
    if (e.kind === 'hero') { n++; continue; }
    if (e.kind === 'unit' && e.team >= 0 && e.team < 4) { n++; continue; }
    if (!(f && townsOn(st)) && e.team === 4 && e.kind === 'unit') n++;
  }
  return n;
}

// ---------------------------------------------------------------- rewards / helpers
function grantXP(st, team, amt, reason, x, z) {
  const f = fn(perksMod, 'grantXP');
  if (f) { try { f(st, team, amt, reason, x, z); return; } catch (e) { /* fallback */ } }
  A().giveXP(st, team, x, z, amt);
}
function giveGold(st, team, g, x, z) {
  const t = st.teams[team]; if (!t || g <= 0) return;
  t.gold += g; ev(st, { type: 'gold', x, z, amt: g, team });
}
function endGame(st, winner, reason) {
  if (st.over) return;
  const f = fn(simMod, 'endGame');
  if (f) { try { f(st, winner, reason); } catch (e) { st.over = { winner, reason }; } } else st.over = { winner, reason };
  if (!st.over) st.over = { winner, reason };
}
const heroTeams = (st) => st.teams.filter((t) => t.id >= 0 && t.id <= 3 && t.hero);
const liveHeroes = (st) => heroTeams(st).map((t) => t.hero).filter((e) => e && e.alive && !e.dead);
function nearHeroes(st, x, z, r) {
  const out = [];
  for (const t of heroTeams(st)) { const e = t.hero; if (e && e.alive && !e.dead && hyp(e.x - x, e.z - z) < r) out.push(t.id); }
  return out;
}
const humanTeam = (st) => (st.humans && st.humans.length ? st.humans[0] : 0);
function pinHp(e, target) { // set the maximum HP independent of PACE / tier / time growth (re-applied every second: sim.js recalc() runs every 10 s)
  if (Math.abs(e.maxHp - target) < 0.5) return;
  const f = e.maxHp > 0 ? e.hp / e.maxHp : 1, k = e.base.hp > 0 && e.maxHp > 0 ? e.maxHp / e.base.hp : 1;
  e.maxHp = target; e.hp = target * f; e.base.hp = target / k;
}
const alive = (st, id) => { const m = st.byId.get(id); return m && m.alive && m.hp > 0 ? m : null; };
const aliveCount = (st, ids) => { let n = 0; for (const id of ids) if (alive(st, id)) n++; return n; };
function despawn(st, ids, fx) {
  for (const id of ids) { const m = st.byId.get(id); if (m && m.alive) { if (fx) ev(st, { type: 'hordeVanish', x: m.x, z: m.z }); m.alive = false; m.hp = 0; m.dead = false; } }
}

// ---------------------------------------------------------------- spawning demons
function dmon(st, key, tier, x, z, camp, o = {}) {
  const [px, pz] = freeSpot(st, x, z);
  const m = A().spawnMonster(st, key, tier, px, pz, camp, null);
  const d = MONSTERS[key];
  m.hz = o.mode || 'garrison'; m.horde = true; m.demon = d.demon; m.title = m.title || d.name;
  m.home = { x: o.hx ?? camp.x, z: o.hz ?? camp.z };
  if (d.bldMul) m.bldMul = d.bldMul;
  if (o.aid) m.aid = o.aid;
  if (o.gate !== undefined) m.fromGate = o.gate;
  if (o.slot) { m.slotX = o.slot[0]; m.slotZ = o.slot[1]; }
  m.abT = 1 + st.rng() * 3; m.pndT = 3 + st.rng() * 4;
  if (o.elite) makeElite(m, typeof o.elite === 'string' ? o.elite : '');
  return m;
}
function makeElite(m, title) {
  m.elite = 1; m.title = title || ('Elite ' + (MONSTERS[m.type] ? MONSTERS[m.type].name : 'Demon'));
  m.eliteHp = PACE.eliteHp || 2; m.eliteDmg = PACE.eliteDmg || 1.3; m.xpV *= 2.5; m.goldV *= 2.2;
  A().recalc(m);
}

// ---------------------------------------------------------------- init
export function init(st) {
  st.horde = {
    ready: false, fallback: false, path: [], cum: [], len: 0, dist: 0, speed: 0, hc: 0, rate: 1, destroyed: 0, clock: [], sched: [], gates: [], mainGate: 0,
    assaults: [], waves: [], occ: {}, nextId: 1, tickT: 0, abT: 0, objT: 0, fb: [], capitalId: 0, startId: 0, killPush: 0, pend: [], events: [], evSched: [], nextEvId: 1, raidT: 0, lordWhy: '',
    stats: { townsSaved: 0, townsFallen: 0, gatesClosed: 0, demonKills: 0, assaults: 0, eventsDone: 0, eventsFailed: 0 },
    lord: { id: 0, state: 'sealed' }, capital: { state: 'pending', t: 0, wave: 0, n: 0, nextWaveT: 0, fallT: 0, reclaimEnd: 0, nextSiegeT: 0, occ0: 0 },
  };
  st.sideEvents = [];
  prepare(st);
  ev(st, { type: 'msg', text: 'The Demon Gates have torn open! Hold the towns, then close the gates.', kind: 'warn' });
}

// ---------------------------------------------------------------- front line
export function frontPos(st) {
  const h = st.horde; if (!h || !h.ready) return null;
  const p = pathPos(h, h.dist);
  return { x: p.x, z: p.z, dx: p.dx, dz: p.dz, dist: h.dist, len: h.len, frac: h.len ? h.dist / h.len : 0, rate: h.rate };
}
export function frontDanger(st, x, z) {
  const h = st.horde; if (!h || !h.ready) return 0;
  const p = project(h, x, z);
  const behind = h.dist - p.d;              // > 0: already overrun by the front
  const lat = clamp(1 - p.off / 80, 0, 1);
  return clamp(lat * (behind > -30 ? 1 : clamp(1 + (behind + 30) / 120, 0, 1)), 0, 1);
}
const openGates = (h) => h.gates.filter((g) => !g.closed);
const openFrac = (h) => (h.gates.length ? openGates(h).length / h.gates.length : 1);

function advanceFront(st, dt) {
  const h = st.horde;
  h.rate = clamp(1 - HORDE.gateSlow * h.destroyed, HORDE.rateFloor, 1);
  h.hc = Math.max(0, h.hc + dt * h.rate * ((st.diff && st.diff.rate) || 1)); // difficulty: how fast the front advances
  const nd = distAtClock(h, h.hc);
  h.speed = (nd - h.dist) / Math.max(1e-6, dt);
  h.dist = nd;
  for (const s of h.sched) {
    if (s.trig || h.dist < s.D || h.hc < s.T - 0.001) continue;
    s.trig = true;
    const town = townById(st, s.id);
    if (!town) continue;
    if (s.cap) startSiege(st);
    else if (town.state === 'safe' || town.state === undefined) launchAssault(st, town, {});
  }
}

// ---------------------------------------------------------------- assaults
function bandSize(st, town, o) {
  const B = HORDE.band, min = st.t / 60, h = st.horde;
  if (o.size) return o.size;
  let n = B.base + min * B.perMin;
  if (town && town.kind === 'town') n *= B.townMul;
  n *= 0.55 + 0.45 * openFrac(h);
  n *= (st.diff && st.diff.wave) || 1; // difficulty
  return clamp(Math.round(n), B.min, Math.round(B.max * Math.max(1, (st.diff && st.diff.wave) || 1)));
}
function composeBand(st, size, tier, o) {
  const W = tier === 1 ? { imp: 10, hellhound: 3, warlock: 0.4, pyromancer: 0.5 }
    : tier === 2 ? { imp: 9, hellhound: 3, warlock: 1.2, brute: 1.1, pyromancer: 1, hexer: 0.7 }
      : { imp: 8, hellhound: 3, warlock: 1.6, brute: 1.7, hulk: 0.8, pyromancer: 1.3, hexer: 1, stormcaller: 1, bonecaller: 0.7 };
  if (o.siege) { W.hulk = (W.hulk || 0) + 1.6; W.brute = (W.brute || 0) + 1; }
  const keys = [], cnt = {}, keysW = Object.keys(W);
  let sum = 0; for (const k of keysW) sum += W[k];
  const cap = { hulk: Math.max(0, Math.floor(size / (o.siege ? 5 : 8))), brute: 1 + Math.floor(size / 7), warlock: 1 + Math.floor(size / 7), pyromancer: 1 + Math.floor(size / 9), hexer: 1 + Math.floor(size / 11), stormcaller: Math.floor(size / 10), bonecaller: Math.floor(size / 14) };
  if (o.siege) { keys.push('hulk'); cnt.hulk = 1; }
  if (tier >= 2 && size >= 18) { keys.push('brute'); cnt.brute = (cnt.brute || 0) + 1; }
  let guard = 0;
  while (keys.length < size && guard++ < size * 8) {
    let k = st.rng() * sum, pick = keysW[0];
    for (const q of keysW) { k -= W[q]; if (k <= 0) { pick = q; break; } }
    if (cap[pick] !== undefined && (cnt[pick] || 0) >= cap[pick]) continue;
    cnt[pick] = (cnt[pick] || 0) + 1; keys.push(pick);
  }
  while (keys.length < size) keys.push('imp');
  return keys;
}
function spawnPointFor(st, tx, tz) {
  const h = st.horde, f = pathPos(h, h.dist);
  const R = clamp(WORLD.half * 0.55, 60, 120);
  let dx = f.x - tx, dz = f.z - tz, d = hyp(dx, dz);
  if (d > R) { dx = dx / d * R; dz = dz / d * R; } else if (d < 50) { const l = hyp(f.dx, f.dz) || 1; dx = -f.dx / l * 60; dz = -f.dz / l * 60; }
  return freeSpot(st, tx + dx, tz + dz);
}

export function launchAssault(st, town, o = {}) {
  const h = st.horde, id = h.nextId++, min = st.t / 60;
  const tier = clamp(o.tier ?? tierAt(min), 1, 4);
  const size = bandSize(st, town, o);
  const keys = composeBand(st, size, tier, o);
  const tx = o.tx ?? town.x, tz = o.tz ?? town.z;
  const [sx, sz] = o.spawn || spawnPointFor(st, tx, tz);
  const pc = { id: -(200 + id), x: sx, z: sz, mons: 0 };
  const nElite = o.elite ?? ((size >= 24 ? 2 : size >= 16 ? 1 : 0) * (tier >= 2 ? 1 : 0));
  const ids = [];
  let minSpd = 99, nE = 0;
  keys.forEach((k, i) => {
    const a = (i / keys.length) * TAU * 1.7, rr = 3 + st.rng() * 6 + Math.sqrt(i) * 1.1;
    const elite = nE < nElite && (k === 'brute' || k === 'warlock' || k === 'hulk') ? (nE++, true) : false;
    const sa = st.rng() * TAU, sr = 2 + st.rng() * 5;
    const m = dmon(st, k, tier, sx + Math.cos(a) * rr, sz + Math.sin(a) * rr, pc, { mode: 'assault', aid: id, hx: sx, hz: sz, slot: [Math.cos(sa) * sr, Math.sin(sa) * sr], elite });
    minSpd = Math.min(minSpd, m.spd);
    ids.push(m.id);
  });
  const dist = hyp(tx - sx, tz - sz) * 1.3 + 10, march = dist / (minSpd * 0.85), warn = o.warn ?? HORDE.warn;
  const a = {
    id, townId: town ? town.id : 0, cap: !!o.cap || (!!town && town.id === h.capitalId), wave: o.wave || 0, raid: !!o.raid, state: 'warning', t0: st.t, warnT: st.t + warn, arriveT: st.t + warn + march,
    ids, size: ids.length, killed: 0, tier, x: sx, z: sz, tx, tz, razeT: 0, arrived: -1, endT: -1, result: '', left: ids.length, spd: minSpd * 0.85, part: {}, hitT: 0,
  };
  h.assaults.push(a); h.stats.assaults++;
  const eta = a.arriveT - st.t;
  ev(st, { type: 'townAttacked', warn: true, town: town.id, eta, x: tx, z: tz, name: town.name, size: a.size, assault: id, cap: a.cap, wave: a.wave });
  ev(st, { type: 'msg', text: a.cap ? `Capital siege wave ${a.wave + 1}: ${a.size} demons march on ${town.name}!` : `Demons pour out of a rift: ${a.size} march on ${town.name} (about ${Math.round(eta)} s).`, kind: a.cap ? 'big' : 'warn' });
  ev(st, { type: 'hordeHorn', x: tx, z: tz, assault: id });
  ev(st, { type: 'portalOpen', x: sx, z: sz, assault: id });
  return a;
}

const assaultOf = (st, id) => { for (const a of st.horde.assaults) if (a.id === id) return a; return null; };
const aliveIds = (st, a) => a.ids.filter((id) => alive(st, id));

function finishAssault(st, a, result) {
  if (a.state === 'done') return;
  const h = st.horde, town = townById(st, a.townId);
  a.state = 'done'; a.result = result; a.endT = st.t;
  if (result === 'saved') {
    h.stats.townsSaved++;
    h.hc = Math.max(0, h.hc - HORDE.savedPush * (a.cap ? 3 : 1));
    if (town && town.state !== 'fallen') setTownState(st, town, 'safe');
    const who = Object.keys(a.part).map(Number).filter((k) => st.teams[k] && st.teams[k].alive);
    const R = HORDE.reward;
    for (const k of who) { giveGold(st, k, Math.round(R.goldPer * a.size * (a.cap ? 2 : 1)), a.tx, a.tz); grantXP(st, k, R.xpPer * a.size * (a.cap ? 2 : 1), 'defend', a.tx, a.tz); }
    if (!townsOn(st)) ev(st, { type: 'townSaved', town: a.townId, x: a.tx, z: a.tz, by: who, assault: a.id, size: a.size, cap: a.cap, wave: a.wave });
  } else if (result === 'fallen') {
    h.stats.townsFallen++;
    let left = aliveIds(st, a);
    const keep = a.cap ? HORDE.occupy.cap : HORDE.occupy.town;
    if (left.length > keep) { // the strongest stay as the garrison, the rest press on towards the next target
      left.sort((p, q) => (st.byId.get(q).maxHp || 0) - (st.byId.get(p).maxHp || 0));
      despawn(st, left.slice(keep), true); left = left.slice(0, keep);
    }
    for (const id of left) { const m = st.byId.get(id); if (m) { m.hz = 'occupy'; m.home = { x: a.tx + (m.slotX || 0), z: a.tz + (m.slotZ || 0) }; m.tgt = 0; } }
    h.occ[a.townId] = (h.occ[a.townId] || []).concat(left);
    if (town) { setTownState(st, town, 'fallen'); town.fallT = st.t; }
    if (!townsOn(st)) {
      ev(st, { type: 'townFallen', town: a.townId, x: a.tx, z: a.tz, name: town ? town.name : '', assault: a.id });
      ev(st, { type: 'msg', text: `${town ? town.name : 'A town'} has fallen to the demons!`, kind: 'big' });
    }
    if (a.cap) capitalFell(st, a);
  } else despawn(st, aliveIds(st, a), true);
  a.ids = a.ids.filter((id) => { const m = st.byId.get(id); return m && m.alive && m.hz === 'occupy'; });
  ev(st, { type: 'assaultEnd', assault: a.id, town: a.townId, result, x: a.tx, z: a.tz });
}

function updateAssault(st, a, dt) {
  const town = townById(st, a.townId);
  if (!town) { a.state = 'done'; return; }
  if (a.state === 'warning') {
    if (town.state === 'fallen') { finishAssault(st, a, 'expired'); return; }
    if (st.t < a.warnT) return;
    a.state = 'marching';
    for (const id of a.ids) { const m = st.byId.get(id); if (m) { m.tgt = 0; m.returning = false; } }
    ev(st, { type: 'hordeMarch', assault: a.id, town: a.townId, x: a.x, z: a.z });
    return;
  }
  const ids = aliveIds(st, a);
  a.killed = a.size - ids.length;
  if (town.state === 'fallen') { finishAssault(st, a, 'fallen'); return; }
  if (!ids.length) { finishAssault(st, a, 'saved'); return; }
  let cx = 0, cz = 0, atCore = 0, dmgOut = 0;
  const coreR = Math.max(10, (town.r || 26) * 0.7);
  for (const id of ids) {
    const m = st.byId.get(id); cx += m.x; cz += m.z;
    if (hyp(m.x - town.x, m.z - town.z) < coreR) { atCore++; dmgOut += m.atk / Math.max(0.3, m.cd); }
  }
  a.x = cx / ids.length; a.z = cz / ids.length; a.left = ids.length;
  if (town.state === 'safe') for (const id of ids) { const m = st.byId.get(id); if (hyp(m.x - town.x, m.z - town.z) < (town.r || 26) + 18) { setTownState(st, town, 'besieged'); break; } }
  if (a.arrived < 0 && atCore >= Math.max(1, Math.ceil(ids.length * 0.35))) {
    a.arrived = st.t; a.state = 'siege';
    if (town.state === 'safe') setTownState(st, town, 'besieged');
  }
  if (a.arrived < 0 && st.t > a.arriveT + HORDE.stuckGrace) { // stuck on the way: the band appears at the edge of the town
    const ang = Math.atan2(a.z - town.z, a.x - town.x);
    for (const id of ids) {
      const m = st.byId.get(id), rr = (town.r || 26) * 0.85 + st.rng() * 4, aa = ang + (st.rng() - 0.5) * 0.8;
      const [px, pz] = freeSpot(st, town.x + Math.cos(aa) * rr, town.z + Math.sin(aa) * rr);
      m.x = m.ox = px; m.z = m.oz = pz; m.path = null; m.tgt = 0;
    }
    a.arriveT = st.t;
    return;
  }
  if (a.arrived < 0) return;
  const defenders = defenderCount(st, town);
  const rate = Math.min(1, atCore / 4) * (a.cap ? HORDE.capital.razeMul : 1);
  if (atCore > 0 && defenders === 0) a.razeT += dt * rate; else a.razeT = Math.max(0, a.razeT - dt * 0.6);
  a.hitT -= dt;
  if (a.hitT <= 0 && atCore > 0) {
    a.hitT = 2;
    const f = fn(townsMod, 'damageTown');
    if (f) { try { f(st, town.id, dmgOut * 2, { from: 'horde', assault: a.id, razing: a.razeT > 0 }); } catch (e) { /* optional */ } }
    ev(st, { type: 'townHit', town: town.id, x: town.x, z: town.z, razing: a.razeT > 0, assault: a.id });
  }
  const need = HORDE.razeTime * (a.cap ? 1.8 : 1);
  if (a.razeT >= need) finishAssault(st, a, 'fallen');
}

function assaultTick(st) {  // once per second: who took part
  for (const a of st.horde.assaults) {
    if (a.state === 'done' || a.state === 'warning') continue;
    const R = HORDE.reward.near;
    for (const k of nearHeroes(st, a.tx, a.tz, R)) a.part[k] = true;
    for (const k of nearHeroes(st, a.x, a.z, 40)) a.part[k] = true;
  }
  const arr = st.horde.assaults;
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i].state === 'done' && st.t - arr[i].endT > 25) arr.splice(i, 1);
}

// ---------------------------------------------------------------- capital siege
function startSiege(st) {
  const h = st.horde, c = h.capital, cap = townById(st, h.capitalId);
  if (!cap || c.state === 'siege' || c.state === 'fallen') return;
  c.state = 'siege'; c.n++; c.wave = 0; c.t = st.t; c.nextWaveT = st.t;
  if (cap.state === 'safe') setTownState(st, cap, 'besieged');
  ev(st, { type: 'capitalSiege', town: cap.id, x: cap.x, z: cap.z, n: c.n });
  ev(st, { type: 'msg', text: c.n > 1 ? `The demons return to the gates of ${cap.name}!` : `The capital is under siege! Defend ${cap.name}!`, kind: 'big' });
}
function capitalFell(st, a) {
  const h = st.horde, c = h.capital, cap = townById(st, h.capitalId);
  if (c.state === 'fallen') return;
  c.state = 'fallen'; c.fallT = st.t; c.reclaimEnd = 1e9; c.lives = (HORDE.capital.lives || 12) * ((st.diff && st.diff.lives) || 1);
  for (const g of h.gates) g.openAt = Math.min(g.openAt, st.t + 8); // the wards of the fortress fail when the capital falls
  if (cap) setTownState(st, cap, 'fallen');        // its waystone goes down, the safe zone ends, the services are lost
  ev(st, { type: 'capitalFallen', town: h.capitalId, x: cap ? cap.x : a.tx, z: cap ? cap.z : a.tz, reclaim: HORDE.capital.reclaim });
  ev(st, { type: 'msg', text: `${cap ? cap.name : 'The capital'} has fallen! Flee the city, then find the orc fortress in the ruins and destroy it!`, kind: 'big' });
  for (const q of h.assaults) if (q.cap && q.state !== 'done' && q !== a) { q.state = 'done'; q.result = 'fallen'; q.endT = st.t; const left = aliveIds(st, q); for (const id of left) { const m = st.byId.get(id); m.hz = 'occupy'; m.home = { x: a.tx, z: a.tz }; } h.occ[h.capitalId] = (h.occ[h.capitalId] || []).concat(left); q.ids = []; }
  c.occ0 = Math.max(1, aliveCount(st, h.occ[h.capitalId] || []));
}
function capitalUpdate(st) {
  const h = st.horde, c = h.capital, cap = townById(st, h.capitalId), C = HORDE.capital;
  if (!cap) return;
  if (c.state === 'siege') {
    const waves = C.waves + (c.n - 1);
    if (c.wave < waves && st.t >= c.nextWaveT) {
      const min = st.t / 60, w = c.wave;
      let size = Math.round((C.size + C.perWave * w + C.perMin * min) * (1 + 0.25 * (c.n - 1)) * (0.7 + 0.3 * openFrac(h)));
      size = Math.min(size, C.max + 6 * (c.n - 1));
      launchAssault(st, cap, { cap: true, wave: w, size, tier: clamp(tierAt(min) + (w >= 2 ? 1 : 0), 1, 4), siege: true, elite: 1 + Math.floor(w / 2) });
      c.wave++; c.nextWaveT = st.t + C.gap;
    }
    if ((c.wave >= waves && !h.assaults.some((q) => q.cap && q.state !== 'done')) || st.t >= (C.fallAt || 1e9)) { // v0.6: the capital CANNOT hold: it falls when the waves are done or at fallAt
      for (const q of h.assaults) if (q.cap && q.state !== 'done') { q.state = 'done'; q.result = 'fallen'; q.endT = st.t; }
      capitalFell(st, { tx: cap.x, tz: cap.z });
    }
  } else if (c.state === 'fallen') {
    h.occ[h.capitalId] = (h.occ[h.capitalId] || []).filter((id) => alive(st, id));
    // v0.6: the fall is final (no reclaiming); the shared lives (c.lives) are spent in onKill
  } else if (c.state === 'held' && c.n < C.sieges && st.t >= c.nextSiegeT && !st.horde.lord.dead) {
    startSiege(st);
  }
}

// reclaim fallen ordinary towns
function occupationTick(st) {
  const h = st.horde;
  for (const k of Object.keys(h.occ)) {
    const id = Number(k);
    if (id === h.capitalId) continue;
    h.occ[k] = h.occ[k].filter((mid) => alive(st, mid));
    if (!h.occ[k].length) {
      delete h.occ[k];
      const t = townById(st, id);
      if (t && t.state === 'fallen') {
        setTownState(st, t, 'safe'); t.reclaimed = true;
        if (!townsOn(st)) { ev(st, { type: 'townReclaimed', town: id, x: t.x, z: t.z, name: t.name }); ev(st, { type: 'msg', text: `${t.name} has been liberated!`, kind: 'info' }); }
        for (const hk of nearHeroes(st, t.x, t.z, 100)) { giveGold(st, hk, 60, t.x, t.z); grantXP(st, hk, 120, 'liberate', t.x, t.z); }
      }
    }
  }
}

// periodic extra assaults on standing towns once the scripted ones are done (long matches)
function raidTick(st) {
  const h = st.horde, R = HORDE.raid;
  if (st.t < R.from || st.t < h.raidT || h.capital.state === 'fallen') return;
  if (h.sched.some((s) => !s.trig)) return;
  if (h.assaults.some((a) => a.state !== 'done')) return;
  const cands = townList(st).filter((t) => t.state === 'safe' && t.id !== h.startId && (t.id !== h.capitalId || h.capital.state === 'held' || h.capital.state === 'pending'));
  if (!cands.length) return;
  const t = cands[Math.floor(st.rng() * cands.length) % cands.length];
  h.raidT = st.t + R.every;
  launchAssault(st, t, { raid: true });
}

// ---------------------------------------------------------------- demon gates
function guardTarget(st, g) {
  const G = HORDE.gate, min = st.t / 60;
  return clamp(G.guards[0] + (g.tier - 1) + (min > 8 ? 1 : 0), G.guards[0], G.guards[1]);
}
function spawnGuards(st, g, n) {
  const sc = st.camps[g.campIdx], min = st.t / 60;
  for (let i = 0; i < n; i++) {
    const a = st.rng() * TAU, rr = 5 + st.rng() * 5;
    const key = i === 0 && g.tier >= 3 && min > 3 ? 'brute' : i === 1 && g.tier >= 2 && min > 5 ? 'warlock' : i % 3 === 2 ? 'hellhound' : 'imp';
    const m = dmon(st, key, tierAt(min), g.x + Math.cos(a) * rr, g.z + Math.sin(a) * rr, sc, { mode: 'garrison', hx: g.x, hz: g.z, gate: g.id });
    g.ids.push(m.id);
  }
}
function waveKeys(st, g) {
  const min = st.t / 60, r = st.rng, keys = [];
  const imps = clamp(6 + Math.floor(min * 0.5) + (g.tier - 1) + Math.floor(r() * 3), 6, 12);
  for (let i = 0; i < imps; i++) keys.push('imp');
  const hounds = (min < 2 ? 1 : 2) + (min > 9 ? 1 : 0) + (r() < 0.4 ? 1 : 0);
  for (let i = 0; i < hounds; i++) keys.push('hellhound');
  if (min >= 4.5 && r() < 0.55) { keys.push('warlock'); if (min > 9 && r() < 0.5) keys.push('warlock'); }
  if (min >= 6 && r() < 0.45 + 0.1 * g.tier) { keys.push('brute'); if (min > 9 && r() < 0.4) keys.push('brute'); }
  if (min >= 8.5 && r() < 0.3) keys.push('hulk');
  return keys;
}
function spawnWave(st, g) {
  const h = st.horde, sc = st.camps[g.campIdx], tier = tierAt(st.t / 60), keys = waveKeys(st, g);
  const front = pathPos(h, h.dist + 8);
  const [fx, fz] = snap(st, front.x, front.z);
  const dw = (st.diff && st.diff.wave) || 1; // difficulty: wave size
  if (dw < 1) keys.length = Math.max(2, Math.round(keys.length * dw));
  else if (dw > 1) { const extra = Math.round(keys.length * (dw - 1)), n0 = keys.length; for (let i = 0; i < extra; i++) keys.push(keys[i % n0]); }
  const ids = [];
  keys.forEach((k) => {
    const a = st.rng() * TAU, rr = 4 + st.rng() * 6;
    const sa = st.rng() * TAU, sr = 3 + st.rng() * 9;
    const elite = k === 'brute' && st.t > 540 && st.rng() < 0.3;
    const m = dmon(st, k, tier, g.x + Math.cos(a) * rr, g.z + Math.sin(a) * rr, sc, { mode: 'wave', hx: fx, hz: fz, slot: [Math.cos(sa) * sr, Math.sin(sa) * sr], gate: g.id, elite });
    ids.push(m.id); h.waves.push(m.id);
  });
  g.waves++;
  ev(st, { type: 'hordeWave', gate: g.id, x: g.x, z: g.z, n: ids.length });
  return ids;
}
function gatePhases(st, g, e) {
  const G = HORDE.gate, sc = st.camps[g.campIdx], th = G.phases;
  while (g.phase < th.length && e.hp / e.maxHp <= th[g.phase]) {
    g.phase++;
    const n = G.phaseSize + g.tier, min = st.t / 60;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + st.rng(), rr = 4 + st.rng() * 5;
      const key = i % 4 === 3 ? 'hellhound' : i === 0 && g.phase >= 3 ? 'brute' : 'imp';
      const m = dmon(st, key, tierAt(min), g.x + Math.cos(a) * rr, g.z + Math.sin(a) * rr, sc, { mode: 'garrison', hx: g.x, hz: g.z, gate: g.id });
      if (g.lastAtt) m.tgt = g.lastAtt;
      g.ids.push(m.id);
    }
    ev(st, { type: 'gatePhase', gate: g.id, x: g.x, z: g.z, phase: g.phase });
    ev(st, { type: 'msg', text: g.phase === th.length ? 'The gate screams: its last guardians pour out!' : 'The demon gate spits out its guardians!', kind: 'warn' });
  }
}
function gateTick(st) {  // once per second
  const h = st.horde, G = HORDE.gate, min = st.t / 60;
  h.waves = h.waves.filter((id) => alive(st, id));
  for (const g of h.gates) {
    if (g.closed) continue;
    const e = st.byId.get(g.entId);
    if (e && e.alive) { pinHp(e, G.hp[g.tier - 1] || G.hp[0]); g.hp = e.hp; g.maxHp = e.maxHp; gatePhases(st, g, e); }
    g.ids = g.ids.filter((id) => alive(st, id));
    let near = 0; for (const id of g.ids) { const m = st.byId.get(id); if (hyp(m.x - g.x, m.z - g.z) < G.guardNear) near++; }
    g.guardN = near;
    if (!g.vuln && st.t >= g.openAt) {
      g.vuln = true; ev(st, { type: 'gateVulnerable', gate: g.id, x: g.x, z: g.z, tier: g.tier });
      if (g.id === h.mainGate || h.gates.every((q) => q.vuln || q === g)) ev(st, { type: 'msg', text: 'The wards on the demon gates are failing! Strike them down.', kind: 'warn' });
    }
    // guards: respawn up to the target every guardRespawn seconds
    const want = guardTarget(st, g);
    if (g.ids.length < want && st.t >= g.guardT) { spawnGuards(st, g, g.ids.length === 0 ? want : Math.min(2, want - g.ids.length)); g.guardT = st.t + G.guardRespawn * (g.ids.length < want / 2 ? 0.5 : 1); }
    // waves
    g.waveT -= 1;
    if (g.waveT <= 0) {
      if (h.waves.length >= G.waveCap) g.waveT = 5;
      else {
        spawnWave(st, g);
        g.waveT = Math.max(G.waveFloor, rrange(st.rng, G.wave[0], G.wave[1]) * (1 - clamp(min / 40, 0, 0.3)));
      }
    }
  }
  // the wave rally point follows the front
  const f = pathPos(h, h.dist + 6);
  const [rx, rz] = snap(st, f.x, f.z);
  for (const id of h.waves) { const m = st.byId.get(id); if (m && m.hz === 'wave') m.home = { x: rx + (m.slotX || 0), z: rz + (m.slotZ || 0) }; }
}
function closeGate(st, g, src) {
  const h = st.horde, G = HORDE.gate;
  if (g.closed) return;
  g.closed = true; g.hp = 0; g.closedAt = st.t; h.destroyed++; h.stats.gatesClosed++;
  h.hc = Math.max(0, h.hc - HORDE.gatePush);
  // everything this gate spawned collapses
  const fall = g.ids.slice();
  for (const id of h.waves) { const m = st.byId.get(id); if (m && m.fromGate === g.id) fall.push(id); }
  despawn(st, fall, true);
  g.ids = [];
  let team = src && src.team >= 0 && src.team <= 3 ? src.team : -1;
  const near = nearHeroes(st, g.x, g.z, 90);
  if (team < 0) { let best = -1, bd = 0; for (const k of Object.keys(g.dmgBy)) if (g.dmgBy[k] > bd) { bd = g.dmgBy[k]; best = Number(k); } team = best >= 0 ? best : (near[0] ?? 0); }
  g.by = team; h.lastCloser = team;
  const R = G.reward, i = g.tier - 1;
  const who = near.length ? near : [team];
  for (const k of who) { giveGold(st, k, R.gold[i] || R.gold[0], g.x, g.z); grantXP(st, k, R.xp[i] || R.xp[0], 'gate', g.x, g.z); }
  for (let k = 0; k < R.items; k++) A().dropItem(st, g.x + (k - 0.5) * 2.5, g.z + 2, A().rollItem(st, Math.min(4, g.tier + 1), { elite: 1, x: g.x, z: g.z }));
  const closed = h.gates.filter((q) => q.closed).length, total = h.gates.length;
  ev(st, { type: 'gateClosed', gate: g.id, x: g.x, z: g.z, tier: g.tier, team, n: closed, total });
  ev(st, { type: 'blast', x: g.x, z: g.z, r: 14, color: 0xffb040 });
  ev(st, { type: 'msg', text: closed >= total ? 'The last demon gate is sealed!' : `A demon gate is sealed! (${closed}/${total}) The horde weakens.`, kind: 'big' });
  if (closed >= total) { endGame(st, team, 'gates'); return; }
  if (closed >= Math.max(1, Math.round(total * 2 / 3))) summonLord(st, 'gates');
}

// ---------------------------------------------------------------- the Demon Lord
function summonLord(st, why) {
  const h = st.horde, w = h.lord;
  if (w.spawned || w.state === 'dead') return;
  const sc = st.camps[w.campIdx];
  const m = dmon(st, 'demonLord', 1, w.x, w.z, sc, { mode: 'lord', hx: w.x, hz: w.z });
  m.title = 'The Demon Lord';
  if (HORDE.lord.hp) pinHp(m, HORDE.lord.hp);
  w.id = m.id; w.spawned = true; w.state = 'idle'; w.t0 = st.t; h.lordWhy = why;
  ev(st, { type: 'lordRises', x: w.x, z: w.z, why });
  ev(st, { type: 'msg', text: why === 'gates' ? 'The Demon Lord rises to defend his crumbling gates!' : 'The Demon Lord rises! His hour has come.', kind: 'big' });
}
function telegraph(st, e, kind, x, z, r, dur, dmg, o = {}) {
  st.horde.pend.push({ at: st.t + dur, kind, x, z, r, inner: o.inner || 0, dmg, stun: o.stun || 0, src: e.id, bld: o.bld || 1 });
  ev(st, { type: 'telegraph', x, z, r, inner: o.inner || 0, dur, kind, color: kind === 'slam' ? 0xff3a1a : kind === 'ring' ? 0xff7a20 : kind === 'pound' ? 0xff5a2a : 0xffa030, src: e.id });
}
function pendTick(st) {
  const h = st.horde;
  if (!h.pend.length) return;
  for (let i = h.pend.length - 1; i >= 0; i--) {
    const p = h.pend[i];
    if (st.t < p.at) continue;
    h.pend.splice(i, 1);
    const e = st.byId.get(p.src);
    if (!e || !e.alive || e.hp <= 0) continue;
    if (p.inner > 0) {
      for (const t of st.ents) {
        if (!t.alive || t.dead || !simMod.hostile(e.team, t.team)) continue;
        const d = hyp(t.x - p.x, t.z - p.z);
        if (d + t.r * 0.4 < p.inner || d - t.r * 0.4 > p.r) continue;
        simMod.damage(st, e, t, p.dmg, { stun: p.stun, noFall: true, dtype: 'fire' });
      }
    } else simMod.areaDamage(st, e, p.x, p.z, p.r, p.dmg, { stun: p.stun, bldMul: p.bld, noFall: true, dtype: 'fire' });
    ev(st, { type: 'blast', x: p.x, z: p.z, r: p.r, color: p.kind === 'slam' ? 0xff4a20 : p.kind === 'ring' ? 0xff8a30 : 0xffb040 });
  }
}
function lordUpdate(st, dt) {
  const h = st.horde, w = h.lord, L = HORDE.lord;
  if (!w || w.state === 'dead') return;
  if (!w.spawned) { // sealed: rises at lordAt or when 2/3 of the gates are closed (closeGate)
    if (st.t >= HORDE.lordAt) summonLord(st, 'time');
    return;
  }
  const e = st.byId.get(w.id);
  if (!e || !e.alive) return;
  const frac = e.hp / e.maxHp;
  if (e.tgt && w.state === 'idle') { w.state = 'fight'; ev(st, { type: 'lordFight', x: e.x, z: e.z }); ev(st, { type: 'msg', text: 'The Demon Lord roars: "Kneel, mortals!"', kind: 'warn' }); }
  if (w.state === 'idle') { if (e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * L.regen * dt); return; }
  let near = 1e9; for (const hh of liveHeroes(st)) near = Math.min(near, hyp(hh.x - e.x, hh.z - e.z));
  if (!e.tgt && near > 80) { w.idleT += dt; if (w.idleT > 12) { w.state = 'idle'; w.idleT = 0; } } else w.idleT = 0;
  const sc = st.camps[w.campIdx];
  const summon = (n, big) => {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU, key = k % 5 === 4 ? 'warlock' : k % 3 === 2 ? 'hellhound' : 'imp';
      const m = dmon(st, key, 2, e.x + Math.cos(a) * 7, e.z + Math.sin(a) * 7, sc, { mode: 'garrison', hx: e.x, hz: e.z, elite: big && key === 'warlock' });
      m.tgt = e.tgt;
    }
    ev(st, { type: 'blast', x: e.x, z: e.z, r: 9, color: 0xff5a20 });
  };
  L.summonAt.forEach((th, i) => {
    if (w.summoned[i] || frac > th) return;
    w.summoned[i] = true; w.phase = i + 2;
    summon(L.summonN + i * 2, true);
    ev(st, { type: 'lordPhase', phase: w.phase, x: e.x, z: e.z });
    ev(st, { type: 'msg', text: 'The Demon Lord calls his legions!', kind: 'warn' });
  });
  if (!w.rage && frac <= L.rageAt) {
    w.rage = true; e.spd *= 1.22; w.phase = 4;
    ev(st, { type: 'lordPhase', phase: 4, x: e.x, z: e.z, rage: true });
    ev(st, { type: 'msg', text: 'The Demon Lord is enraged!', kind: 'big' });
  }
  if (w.rage) { e.buff = { until: st.t + 1, dmg: 1.35 }; w.addT -= dt; if (w.addT <= 0) { w.addT = 24; summon(5, false); } }
  const tgt = e.tgt ? st.byId.get(e.tgt) : null, cm = w.rage ? 0.65 : 1;
  w.cleaveT -= dt; w.slamT -= dt; w.ringT -= dt;
  if (tgt && tgt.alive) {
    const d = hyp(tgt.x - e.x, tgt.z - e.z);
    if (w.cleaveT <= 0 && d < 8) {
      w.cleaveT = 5 * cm; const f = Math.atan2(tgt.z - e.z, tgt.x - e.x);
      telegraph(st, e, 'cleave', e.x + Math.cos(f) * 3.8, e.z + Math.sin(f) * 3.8, 6.4, 0.85, e.atk * 1.9, { stun: 0.5 });
    }
    if (w.slamT <= 0 && d < 34) {
      w.slamT = L.slamCd * cm;
      telegraph(st, e, 'slam', tgt.x, tgt.z, 8.5, 1.4 * cm + 0.2, e.atk * 3.0, { stun: 1.2 });
      if (w.rage) telegraph(st, e, 'slam', tgt.x + (st.rng() - 0.5) * 18, tgt.z + (st.rng() - 0.5) * 18, 7, 1.8, e.atk * 2.6, { stun: 0.8 });
    }
    if (w.ringT <= 0 && d < 40) { // fire wave: three expanding rings with gaps between them
      w.ringT = L.ringCd * cm;
      for (let k = 0; k < 3; k++) telegraph(st, e, 'ring', e.x, e.z, 9 + k * 6.5, 1.5 + k * 0.6, e.atk * 1.5, { inner: 5.4 + k * 6.5, stun: 0.4 });
    }
  }
}
function lordDown(st, t, src) {
  const h = st.horde, w = h.lord;
  if (w.state === 'dead') return;
  w.state = 'dead'; w.dead = true; h.pend = [];
  let team = src && src.team >= 0 && src.team <= 3 ? src.team : -1;
  if (team < 0) { let bd = 0; for (const k of Object.keys(w.dmgBy)) if (w.dmgBy[k] > bd) { bd = w.dmgBy[k]; team = Number(k); } }
  if (team < 0) team = nearHeroes(st, t.x, t.z, 90)[0] ?? 0;
  w.killer = team;
  ev(st, { type: 'lordSlain', x: t.x, z: t.z, team });
  ev(st, { type: 'msg', text: 'The Demon Lord is slain! The legions scatter.', kind: 'big' });
  for (const o of st.ents) if (o.hz && o.alive && o.kind === 'mon' && o !== t) { o.hp = 0; o.alive = false; ev(st, { type: 'hordeVanish', x: o.x, z: o.z }); }
  endGame(st, team, 'gates');
}

// ---------------------------------------------------------------- side events (optional): hunter packs, caravans under attack
function eventSpot(st) {
  const h = st.horde;
  for (let k = 0; k < 14; k++) {
    const d = rrange(st.rng, 30, Math.max(60, h.dist * 0.95 + 40)), p = pathPos(h, d), off = (st.rng() < 0.5 ? -1 : 1) * rrange(st.rng, 14, 34);
    const [x, z] = snap(st, p.x - p.dz * off, p.z + p.dx * off);
    let ok = true;
    for (const t of townList(st)) if (hyp(t.x - x, t.z - z) < (t.r || 26) + 24) { ok = false; break; }
    for (const g of h.gates) if (hyp(g.x - x, g.z - z) < 40) { ok = false; break; }
    if (ok || k === 13) return [x, z];
  }
  return [0, 0];
}
function startEvent(st, spec) {
  const h = st.horde, [x, z] = eventSpot(st), sc = { id: -(400 + h.nextEvId), x, z, mons: 0 }, tier = tierAt(st.t / 60);
  const e = { id: h.nextEvId++, kind: spec.kind, x, z, r: 22, t0: st.t, tEnd: st.t + spec.dur, state: 'active', ids: [], need: 0, n: 0, big: !!spec.big, text: '', reward: { gold: 0, xp: 0 } };
  const add = (key, count, elite, title) => {
    for (let i = 0; i < count; i++) {
      const a = st.rng() * TAU, rr = 3 + st.rng() * 7;
      const m = dmon(st, key, tier, x + Math.cos(a) * rr, z + Math.sin(a) * rr, sc, { mode: 'event', hx: x, hz: z, elite: elite ? (title || true) : false });
      e.ids.push(m.id); if (elite) e.need++;
    }
  };
  if (spec.kind === 'hunt') {
    add('brute', spec.big ? 2 : 1, true, 'Demon Hunter Captain');
    add('hellhound', spec.big ? 5 : 3, false); add('imp', spec.big ? 8 : 5, false);
    if (spec.big) add('warlock', 2, false);
    e.text = 'Slay the demon hunters'; e.reward = { gold: spec.big ? 170 : 110, xp: spec.big ? 520 : 320 };
  } else {
    add('imp', 9, false); add('hellhound', 2, false); add('brute', 1, false);
    e.need = e.ids.length; e.text = 'Save the caravan'; e.reward = { gold: 140, xp: 380 };
  }
  e.total = e.ids.length;
  h.events.push(e);
  ev(st, { type: 'hordeEvent', id: e.id, kind: e.kind, x, z, text: e.text, dur: spec.dur, tEnd: e.tEnd });
  ev(st, { type: 'msg', text: e.kind === 'hunt' ? 'Demon hunters stalk the land! Slay their captain for a reward.' : 'A caravan is under attack! Drive off the demons.', kind: 'info' });
}
function eventTick(st) {
  const h = st.horde;
  for (const s of h.evSched) if (!s.done && st.t >= s.t) { s.done = true; startEvent(st, s); }
  for (const e of h.events) {
    if (e.state !== 'active') continue;
    const left = aliveCount(st, e.ids);
    if (e.kind === 'hunt') {
      let el = 0; for (const id of e.ids) { const m = alive(st, id); if (m && m.elite) el++; }
      e.n = e.need - el;
      if (el === 0) { endEvent(st, e, 'done'); continue; }
    } else { e.n = e.total - left; if (left === 0) { endEvent(st, e, 'done'); continue; } }
    if (st.t >= e.tEnd) endEvent(st, e, 'failed');
  }
  for (let i = h.events.length - 1; i >= 0; i--) if (h.events[i].state !== 'active' && st.t - (h.events[i].endT || 0) > 30) h.events.splice(i, 1);
  st.sideEvents = h.events.filter((e) => e.state === 'active').map((e) => ({ id: e.id, kind: e.kind, x: e.x, z: e.z, text: e.text, tEnd: e.tEnd, n: e.n, need: e.kind === 'hunt' ? e.need : e.total }));
}
function endEvent(st, e, result) {
  const h = st.horde;
  e.state = result; e.endT = st.t;
  if (result === 'done') {
    h.stats.eventsDone++;
    const who = nearHeroes(st, e.x, e.z, 70); if (!who.length) who.push(humanTeam(st));
    for (const k of who) { giveGold(st, k, e.reward.gold, e.x, e.z); grantXP(st, k, e.reward.xp, 'event', e.x, e.z); }
    for (let k = 0; k < (e.big ? 2 : 1); k++) A().dropItem(st, e.x + k * 2, e.z, A().rollItem(st, e.big ? 3 : 2, { elite: 1, x: e.x, z: e.z }));
    ev(st, { type: 'msg', text: e.kind === 'hunt' ? `The demon hunters are slain! (+${e.reward.gold} gold)` : `The caravan is saved! (+${e.reward.gold} gold)`, kind: 'info' });
  } else {
    h.stats.eventsFailed++;
    for (const id of e.ids) { const m = alive(st, id); if (m && m.hz === 'event') { m.hz = 'wave'; m.home = { x: e.x, z: e.z }; } }
    ev(st, { type: 'msg', text: e.kind === 'hunt' ? 'The demon hunters withdraw to the front.' : 'The caravan was lost.', kind: 'warn' });
  }
  ev(st, { type: 'hordeEventEnd', id: e.id, kind: e.kind, result, x: e.x, z: e.z });
}

// ---------------------------------------------------------------- abilities (warlock frenzy/heal, brute and hulk ground pounds) every 0.5 s
function abilityTick(st, dt) {
  const T = st.t, mons = [];
  for (const e of st.ents) if (e.hz && e.alive && e.hp > 0 && e.kind === 'mon' && e.demon) mons.push(e);
  for (const e of mons) {
    const role = e.demon;
    if (role === 'warlock') {
      e.abT -= dt;
      if (e.abT > 0) continue;
      let best = null, bs = 0.72, buffed = 0;
      for (const o of mons) { if (o === e || hyp(o.x - e.x, o.z - e.z) > 14) continue; const f = o.hp / o.maxHp; if (f < bs) { bs = f; best = o; } }
      if (best) {
        const amt = best.maxHp * (best.boss ? 0.01 : 0.2); best.hp = Math.min(best.maxHp, best.hp + amt); e.abT = 4.5;
        ev(st, { type: 'heal', x: best.x, z: best.z, amt, team: -1, from: e.id });
      } else if (e.tgt) {
        for (const o of mons) {
          if (o === e || o.demon === 'gate' || hyp(o.x - e.x, o.z - e.z) > 11 || buffed >= 6) continue;
          if (!o.buff || o.buff.until < T + 1) { o.buff = { until: T + 6, dmg: 1.35, atkSpd: 1.2 }; buffed++; }
        }
        if (buffed) ev(st, { type: 'demonCast', kind: 'frenzy', x: e.x, z: e.z, from: e.id });
        e.abT = 6;
      } else e.abT = 1.5;
    } else if (role === 'brute' || role === 'hulk') {
      e.pndT -= dt;
      const tgt = e.tgt ? st.byId.get(e.tgt) : null;
      if (e.pndT > 0 || !tgt || !tgt.alive) continue;
      const hulk = role === 'hulk', reach = hulk ? 7 : 5.2;
      if (simMod.gap(e, tgt) > reach) continue;
      e.pndT = (hulk ? 8 : 6.5) + st.rng() * 2;
      const dur = hulk ? 1.15 : 0.85;
      telegraph(st, e, 'pound', tgt.x, tgt.z, hulk ? 4.6 : 3.4, dur, e.atk * (hulk ? 2.0 : 1.5), { stun: hulk ? 0.8 : 0.5, bld: hulk ? 2.5 : 1 });
      e.atkT = Math.max(e.atkT, dur + 0.2);
    }
  }
}

// ---------------------------------------------------------------- demon AI (called from sim.js monUpdate for every monster with m.hz)
export function hordeMon(st, m, dt, speed) {
  if (!m.hz) return false;
  const h = st.horde;
  if (!h) return false;
  const S = simMod, A_ = A();
  if (m.hz === 'gate') { const g = h.gates[m.hgate]; if (g) { m.x = m.ox = g.x; m.z = m.oz = g.z; } return true; }
  let tgt = m.tgt ? st.byId.get(m.tgt) : null;
  const mode = m.hz;
  const aggro = m.aggro * (mode === 'assault' ? 1.15 : 1);
  if (tgt && (!tgt.alive || tgt.hp <= 0 || (tgt.hid > st.t && S.gap(m, tgt) > 5) || S.gap(m, tgt) > aggro * 2.2)) { tgt = null; m.tgt = 0; }
  const homeD = hyp(m.x - m.home.x, m.z - m.home.z);
  const leash = mode === 'lord' ? 48 : mode === 'wave' ? 48 : mode === 'patrol' || mode === 'event' ? 34 : mode === 'assault' ? 1e9 : 26;
  const a = mode === 'assault' ? assaultOf(st, m.aid) : null;
  if (mode === 'assault' && (!a || a.state === 'done')) { m.hz = 'wave'; m.home = { x: m.x, z: m.z }; return false; }
  if (tgt && homeD > leash && !(a && a.state !== 'warning')) { tgt = null; m.tgt = 0; m.returning = true; }
  if (m.returning) {
    m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.08 * dt);
    if (homeD < 3) m.returning = false; else { A_.goTo(st, m, m.home.x, m.home.z, dt, speed * 1.2, 1); return true; }
  }
  if (!tgt && m.scanT <= 0) {
    m.scanT = 0.35 + st.rng() * 0.2;
    if (m.demon === 'hulk') tgt = siegeTarget(st, m, aggro + 8);
    if (!tgt) tgt = A_.findTarget(st, m, aggro);
    if (!tgt && m.blockedBy) tgt = st.byId.get(m.blockedBy) || null;
    if (tgt) {
      m.tgt = tgt.id;
      for (const o of st.ents) if (o.kind === 'mon' && o.camp === m.camp && o.alive && !o.tgt && o.hz && o.hz !== 'gate' && Math.abs(o.x - m.x) < 24 && Math.abs(o.z - m.z) < 24) o.tgt = tgt.id;
    }
  }
  if (tgt) {
    const g = S.gap(m, tgt);
    if (g <= m.range) {
      m.face = Math.atan2(tgt.z - m.z, tgt.x - m.x);
      if (m.atkT <= 0 && !(m.pendUntil > st.t)) {
        A_.doAttack(st, m, tgt);
        if (m.bldMul && tgt.kind === 'bld') S.damage(st, m, tgt, m.atk * Math.max(0, m.bldMul - 0.6), { bldMul: 1 });
      }
    } else A_.goTo(st, m, tgt.x, tgt.z, dt, speed, 0.2);
    return true;
  }
  if (mode === 'assault') {
    if (a.state === 'warning') { if (homeD > 6) A_.goTo(st, m, m.home.x, m.home.z, dt, speed * 0.5, 1); }
    else A_.goTo(st, m, a.tx + (m.slotX || 0), a.tz + (m.slotZ || 0), dt, speed, 1.2);
  } else if (homeD > 4) A_.goTo(st, m, m.home.x, m.home.z, dt, speed * (mode === 'wave' && homeD > 22 ? 1 : 0.5), 1);
  return true;
}
function siegeTarget(st, m, rad) {
  let best = null, bd = rad;
  for (const b of st.blds) {
    if (b.hp <= 0 || b.trap || !simMod.hostile(m.team, b.team)) continue;
    const d = simMod.obbDist(m.x, m.z, b);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

// ---------------------------------------------------------------- objective feed
const CORE = ['id', 'text', 'kind', 'n', 'need', 'x', 'z', 't'];
function sameObj(a, b) { return a && b && a.id === b.id && a.text === b.text && a.n === b.n && a.need === b.need && a.kind === b.kind && Math.abs(a.x - b.x) < 0.5 && Math.abs(a.z - b.z) < 0.5; }
/** Set the ONE objective the HUD shows: {id, text, kind:'defend'|'gate'|'event'|'lord'|'waiting', n, need, x, z, ...extras}. `t` = time the id first appeared. */
export function setObjective(st, obj) {
  const prev = st.objective;
  const o = { id: obj.id, text: obj.text, kind: obj.kind || 'waiting', n: obj.n | 0, need: obj.need | 0, x: obj.x ?? 0, z: obj.z ?? 0, t: prev && prev.id === obj.id ? prev.t : st.t };
  for (const k of Object.keys(obj)) if (!CORE.includes(k)) o[k] = obj[k];
  if (prev && sameObj(prev, o)) { for (const k of Object.keys(o)) if (!CORE.includes(k)) prev[k] = o[k]; return prev; }
  if (!prev || prev.id !== o.id) ev(st, { type: 'objective', id: o.id, text: o.text, kind: o.kind });
  st.objective = o;
  return o;
}
function objectiveTick(st) {
  const h = st.horde, hero = (st.teams[humanTeam(st)] || {}).hero, hx = hero ? hero.x : 0, hz = hero ? hero.z : 0;
  const cap = townById(st, h.capitalId), c = h.capital;
  // 1. the capital fell: flee the city, then search the ruins for the fortress and destroy it
  if (c.state === 'fallen' && cap) {
    const fort = h.gates[h.mainGate];
    if (fort && !fort.closed) {
      if (hyp(cap.x - hx, cap.z - hz) < (cap.r || 30) + 22 && !h.fortSeen) return setObjective(st, { id: 'escape', text: `Escape ${cap.name}`, kind: 'event', n: 0, need: 0, x: fort.x, z: fort.z, flee: true });
      if (!h.fortSeen && hyp(fort.x - hx, fort.z - hz) < 70) { h.fortSeen = true; ev(st, { type: 'msg', text: 'You have found the orc fortress! Destroy it!', kind: 'big' }); }
      if (!h.fortSeen) { const ds = demonSites(st), L = ds.lands, cx = L && L.length === 4 ? (L[0] + L[2]) / 2 : fort.x, cz = L && L.length === 4 ? (L[1] + L[3]) / 2 : fort.z; return setObjective(st, { id: 'search', text: 'Search the ruins for the orc fortress', kind: 'event', n: 0, need: 0, x: cx, z: cz, search: true }); }
      return setObjective(st, { id: 'gate', text: 'Destroy the orc fortress', kind: 'gate', n: 0, need: 1, x: fort.x, z: fort.z, gate: fort.id, pct: Math.round((fort.hp / Math.max(1, fort.maxHp)) * 100) });
    }
  }
  // 2. an assault: the capital first, else the soonest to arrive (or nearest to the hero)
  let best = null, bs = 1e9;
  for (const a of h.assaults) {
    if (a.state === 'done') continue;
    const eta = a.state === 'warning' ? a.arriveT - st.t : 0;
    const s = (a.cap ? -1000 : 0) + eta + hyp(a.tx - hx, a.tz - hz) * 0.15;
    if (s < bs) { bs = s; best = a; }
  }
  if (best) {
    const town = townById(st, best.townId);
    return setObjective(st, { id: 'defend' + best.id, text: `Defend ${town ? town.name : 'the town'}`, kind: 'defend', n: best.killed || 0, need: best.size, x: best.tx, z: best.tz, eta: best.state === 'warning' ? Math.max(0, best.arriveT - st.t) : 0 });
  }
  // 3. the Demon Lord
  if (h.lord.spawned && h.lord.state !== 'dead') {
    const e = st.byId.get(h.lord.id);
    return setObjective(st, { id: 'lord', text: 'Slay the Demon Lord', kind: 'lord', n: 0, need: 0, x: e ? e.x : h.lord.x, z: e ? e.z : h.lord.z, pct: e ? Math.round((e.hp / e.maxHp) * 100) : 100 });
  }
  // 4. a side event right next to the hero
  for (const e of h.events) if (e.state === 'active' && hyp(e.x - hx, e.z - hz) < 55) return setObjective(st, { id: 'event' + e.id, text: e.text, kind: 'event', n: e.n, need: e.kind === 'hunt' ? e.need : e.total, x: e.x, z: e.z });
  // 5. the gates
  const open = openGates(h), total = h.gates.length, closed = total - open.length;
  const vuln = open.filter((g) => st.t >= g.openAt);
  if (vuln.length) {
    let g = vuln[0], bd = 1e9;
    for (const q of vuln) { const d = hyp(q.x - hx, q.z - hz) + (q.tier >= 3 ? 25 : 0); if (d < bd) { bd = d; g = q; } }
    return setObjective(st, { id: 'gate', text: open.length === 1 ? 'Destroy the last Demon Gate' : 'Close the Demon Gates', kind: 'gate', n: closed, need: total, x: g.x, z: g.z, gate: g.id, pct: Math.round((g.hp / Math.max(1, g.maxHp)) * 100) });
  }
  // 6. waiting for the first assault / for the wards to fall: point at the next threatened town
  const nxt = h.sched.find((s) => !s.trig), nt = nxt ? townById(st, nxt.id) : null;
  const tx = nt ? nt.x : cap ? cap.x : 0, tz = nt ? nt.z : cap ? cap.z : 0;
  return setObjective(st, { id: 'wait', text: nt ? `Prepare to defend ${nt.name}` : 'Hold the line', kind: 'waiting', n: 0, need: 0, x: tx, z: tz, eta: nxt ? Math.max(0, HORDE.firstWarn - st.t) : 0 });
}

// ---------------------------------------------------------------- hooks
export function update(st, dt) {
  const h = st.horde;
  if (!h || !h.ready || st.over) return;
  advanceFront(st, dt);
  h.tickT -= dt;
  if (h.tickT <= 0) { h.tickT = 1; gateTick(st); assaultTick(st); occupationTick(st); capitalUpdate(st); eventTick(st); raidTick(st); }
  h.abT -= dt;
  if (h.abT <= 0) { h.abT = 0.5; abilityTick(st, 0.5); }
  h.objT -= dt;
  if (h.objT <= 0) { h.objT = 0.5; objectiveTick(st); }
  for (const a of h.assaults) if (a.state !== 'done') updateAssault(st, a, dt);
  lordUpdate(st, dt);
  pendTick(st);
}

export function onDamage(st, src, t, amt, o) {
  if (!t || t.hz === undefined || !st.horde) return amt;
  const h = st.horde;
  if (t.hz === 'gate') {
    const g = h.gates[t.hgate], G = HORDE.gate;
    if (!g || g.closed) return amt;
    if (src && src.team >= 0 && src.team <= 3 && !(o && o.dot)) { g.dmgBy[src.team] = (g.dmgBy[src.team] || 0) + amt; g.lastAtt = src.id; }
    if (st.t < g.openAt) { amt *= G.wardMul; if (src && src.team >= 0 && st.t - g.warnT > 8) { g.warnT = st.t; ev(st, { type: 'gateWarded', gate: g.id, x: g.x, z: g.z, left: g.openAt - st.t }); } }
    else if (g.guardN >= G.guardMin) amt *= G.guardMul;
    g.lastHit = st.t;
  } else if (t.hz === 'lord' && src && src.team >= 0) {
    const w = h.lord; w.dmgBy[src.team] = (w.dmgBy[src.team] || 0) + amt;
  }
  return amt;
}

export function onKill(st, t, src) {
  const h = st.horde;
  if (h && t && t.kind === 'hero' && h.capital.state === 'fallen' && h.capital.lives > 0) { // v0.6 last stand: after the fall every hero death costs one of the shared lives
    const c = h.capital; c.lives--;
    ev(st, { type: 'msg', text: c.lives > 0 ? `A hero has fallen. Last stand: ${c.lives} ${c.lives === 1 ? 'life' : 'lives'} left!` : 'The last hero has fallen...', kind: c.lives <= 3 ? 'warn' : 'info' });
    if (c.lives <= 0) endGame(st, -1, 'wipe');
  }
  if (!h || !t || !t.hz || t.kind !== 'mon') return;
  if (t.hz === 'gate') { const g = h.gates[t.hgate]; if (g) closeGate(st, g, src); return; }
  if (t.hz === 'lord') { lordDown(st, t, src); return; }
  h.stats.demonKills++;
  const p = pathPos(h, h.dist);
  if (hyp(t.x - p.x, t.z - p.z) < 80 && h.killPush < HORDE.killPushCap) { h.killPush += HORDE.killPush; h.hc = Math.max(0, h.hc - HORDE.killPush); }
}

// ---------------------------------------------------------------- UI helpers
/** Assaults that are gathering/marching/besieging: [{id, town, x, z (band), tx, tz (target), eta, state, size, left, killed, cap, wave, tier, raid}] */
export function activeAssaults(st) {
  const out = [];
  for (const a of (st.horde && st.horde.assaults) || []) {
    if (a.state === 'done') continue;
    const eta = a.state === 'warning' ? a.arriveT - st.t : a.arrived >= 0 ? 0 : Math.max(0, hyp(a.tx - a.x, a.tz - a.z) / Math.max(1, a.spd));
    out.push({ id: a.id, town: a.townId, x: a.x, z: a.z, tx: a.tx, tz: a.tz, eta: Math.max(0, eta), state: a.state, size: a.size, left: a.left ?? a.size, killed: a.killed || 0, cap: a.cap, wave: a.wave, tier: a.tier, raid: !!a.raid });
  }
  return out;
}
/** [{id,x,z,tier,hp,maxHp,closed,warded,vulnIn,main}] for the map / HUD */
export function gateList(st) {
  const h = st.horde; if (!h || !h.ready) return [];
  return h.gates.map((g) => ({ id: g.id, x: g.x, z: g.z, tier: g.tier, hp: g.hp, maxHp: g.maxHp, closed: g.closed, warded: !g.closed && st.t < g.openAt, vulnIn: Math.max(0, g.openAt - st.t), main: g.id === h.mainGate }));
}
/** Everything the map draws: gates (open/closed), the Lord, the front, the capital state, side events. */
export function hordeList(st) {
  const h = st.horde; if (!h || !h.ready) return [];
  const out = [];
  for (const g of gateList(st)) out.push({ type: 'gate', id: g.id, x: g.x, z: g.z, tier: g.tier, kind: g.main ? 'main' : 'gate', alive: !g.closed, closed: g.closed, hp: g.maxHp ? g.hp / g.maxHp : 1, warded: g.warded });
  const w = h.lord;
  out.push({ type: 'lord', x: w.x, z: w.z, alive: w.state !== 'dead', state: w.state, phase: w.phase || 1, spawned: !!w.spawned });
  const f = frontPos(st); if (f) out.push({ type: 'front', x: f.x, z: f.z, dist: f.dist, frac: f.frac, dx: f.dx, dz: f.dz });
  out.push({ type: 'capital', state: h.capital.state, reclaimLeft: h.capital.state === 'fallen' ? Math.max(0, h.capital.reclaimEnd - st.t) : 0 });
  for (const e of h.events) if (e.state === 'active') out.push({ type: 'event', id: e.id, kind: e.kind, x: e.x, z: e.z, text: e.text, tEnd: e.tEnd });
  return out;
}
export const frontPath = (st) => (st.horde ? st.horde.path : []);
