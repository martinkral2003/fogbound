// v0.4 travel: waystones + channelled teleport (no ownership, no home tower). See src/V4.md (CORE lane API).
// Sim-only (no DOM/Three). Hooks: init, update, command, onDamage. Everything the AI needs is exported below.
// Waystones come from world.sites.waystones [{id,x,z,townId?,name?}]. The start village's stone is "home": free to teleport to, known to everybody.
// team.lastWs = the last waystone the hero rested at (walked up to) or teleported to: dead heroes respawn there (sim.js respawnPoint).
import { simApi } from './sim.js';

export const TRAVEL = {
  channel: 3.5,       // seconds standing still
  cdBase: 8,          // cooldown = cdBase + distance / cdPerM, capped at cdMax (going to the start village's stone: no cooldown)
  cdPerM: 20,
  cdMax: 60,
  discoverR: 12,      // walk this close to a waystone to discover it
  restR: 7,           // closer than this: it becomes the respawn point (team.lastWs)
  nearR: 8,           // closer than this to the destination: "already there"
  enemyBeamR: 70,     // other heroes this close see the departure beam through the fog (render.js / ui.js)
  spread: 3.2,        // arrival offset from the stone
};

const D2 = (a, b, c, d) => Math.hypot(a - c, b - d);
const emit = (st, e) => simApi.ev(st, e);
const HEROES = 4;

// ---------------------------------------------------------------- lookups
export function waystoneById(st, id) { return (st.waystones || []).find((w) => w.id === id) || null; }
function townOf(st, ws) {
  if (ws.townId === undefined) return null;
  return (st.towns && st.towns.find((t) => t.id === ws.townId)) || ((st.world.sites && st.world.sites.towns) || []).find((t) => t.id === ws.townId) || null;
}
/** v0.3 compat: nobody owns waystones any more. */
export function wsOwner() { return -1; }
export function wsName(st, ws) { const t = townOf(st, ws); return ws.name || (t && t.name) || 'Waystone'; }
/** the start village's stone (free destination, known to everyone) */
export function homeWaystone(st) { return waystoneById(st, st.startWs) || (st.waystones || [])[0] || null; }
export const isHome = (st, ws) => !!ws && ws.id === st.startWs;
/** a destination that cannot be used right now: the stone was lost (its town fell / was razed) */
export function isBlocked(st, ws) {
  if (ws.lost) return true;
  const t = townOf(st, ws);
  return !!(t && t.state === 'fallen' && !t.wsKept);
}
export function cooldownFor(st, team, ws) {
  if (isHome(st, ws)) return 0;
  const h = team.hero;
  const d = h ? D2(h.x, h.z, ws.x, ws.z) : 0;
  return Math.min(TRAVEL.cdMax, TRAVEL.cdBase + d / TRAVEL.cdPerM) * ((team.mods && team.mods.teleCd) || 1);
}
/** a clear walkable spot beside the stone */
export function arrivalFor(st, ws) {
  const w = st.world, base = Math.atan2(-ws.z, -ws.x);
  for (let i = 0; i < 16; i++) {
    const a = base + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.5236, ax = ws.x + Math.cos(a) * TRAVEL.spread, az = ws.z + Math.sin(a) * TRAVEL.spread;
    if (w.walkable && !w.walkable(ax, az)) continue;
    let ok = true;
    for (const b of st.blds) if (Math.abs(b.x - ax) < (b.rad || 3) + 1.5 && Math.abs(b.z - az) < (b.rad || 3) + 1.5 && D2(b.x, b.z, ax, az) < (b.rad || 3) + 1) { ok = false; break; }
    if (ok) return { x: ax, z: az };
  }
  return { x: ws.x, z: ws.z };
}
/** the stone a dead hero comes back at: last rested/used stone, else the start village's */
export function respawnStone(st, team) {
  const ws = team.lastWs ? waystoneById(st, team.lastWs) : null;
  // v0.6: never respawn into a fight: a waystone with live monsters within 24 m is skipped, and a fallen town's waystone is gone (the capital falls in the story)
  const clear = (w) => { for (const e of st.ents) if (e.alive && e.kind === 'mon' && Math.abs(e.x - w.x) < 24 && Math.abs(e.z - w.z) < 24 && D2(e.x, e.z, w.x, w.z) < 24) return false; return true; };
  if (ws && !isBlocked(st, ws) && !ws.down && clear(ws)) return ws;
  const h = team.hero; let best = null, bd = 1e9, bestAny = null, bda = 1e9;
  for (const w of st.waystones || []) {
    if (w.down || !w.disc || !w.disc[team.id]) continue;
    const d = h ? D2(h.x, h.z, w.x, w.z) : 0;
    if (d < bda) { bda = d; bestAny = w; }
    if (d < bd && (w.townId || w.regionId) && clear(w)) { bd = d; best = w; } // prefer a safe TOWN waystone, nearest to where the hero died
  }
  if (!best) for (const w of st.waystones || []) { if (w.down || !w.disc || !w.disc[team.id] || !clear(w)) continue; const d = h ? D2(h.x, h.z, w.x, w.z) : 0; if (d < bd) { bd = d; best = w; } }
  return best || bestAny || homeWaystone(st);
}
/** All destinations a team may pick right now: discovered waystones. Each: { ws, id, name, x, z, dist, cd, home, blocked, owner }. */
export function destinationsOf(st, teamId, includeBlocked = false) {
  const team = st.teams[teamId], out = [];
  if (!team || !team.hero) return out;
  for (const w of st.waystones || []) {
    if (!w.disc[teamId]) continue;
    const blocked = isBlocked(st, w);
    if (blocked && !includeBlocked) continue;
    out.push({ ws: w, id: w.id, name: wsName(st, w), x: w.x, z: w.z, dist: D2(team.hero.x, team.hero.z, w.x, w.z), cd: cooldownFor(st, team, w), home: isHome(st, w), blocked, owner: -1 });
  }
  return out;
}
/** Legacy shape used by ai.js / render.js: [{ id, kind:'home'|'ws', x, z, ax, az, name, blocked }] (home first). */
export function waypointsOf(st, teamId, includeBlocked = false) {
  const out = destinationsOf(st, teamId, includeBlocked).map((d) => {
    const a = arrivalFor(st, d.ws);
    return { id: d.id, kind: d.home ? 'home' : 'ws', x: d.x, z: d.z, ax: a.x, az: a.z, name: d.name, blocked: d.blocked };
  });
  out.sort((a, b) => (a.kind === 'home' ? -1 : 0) - (b.kind === 'home' ? -1 : 0));
  return out;
}
/** Can this team start a teleport to ws right now? -> { ok, reason, cd, dist } */
export function canTeleport(st, team, ws) {
  const h = team.hero;
  if (!ws) return { ok: false, reason: 'No such waystone' };
  if (!h || !h.alive) return { ok: false, reason: 'You are dead' };
  if (!ws.disc[team.id]) return { ok: false, reason: 'Waystone not discovered' };
  if (isBlocked(st, ws)) return { ok: false, reason: 'This waystone was lost' };
  const dist = D2(h.x, h.z, ws.x, ws.z), cd = cooldownFor(st, team, ws);
  if (h.stun > 0 || h.charging) return { ok: false, reason: 'Cannot teleport now', cd, dist };
  if (dist < TRAVEL.nearR) return { ok: false, reason: 'You are already there', cd, dist };
  if (cd > 0 && team.teleCd > 0) return { ok: false, reason: 'Teleport recharging (' + Math.ceil(team.teleCd) + ' s)', cd, dist };
  return { ok: true, cd, dist };
}

// ---------------------------------------------------------------- channel
export function cancelChannel(st, team, why) {
  if (!team.tele) return;
  const h = team.hero;
  team.tele = null;
  if (h) h.tele = 0;
  emit(st, { type: 'telecancel', team: team.id, x: h ? h.x : 0, z: h ? h.z : 0, why });
  if (team.human) emit(st, { type: 'msg', text: why === 'damage' ? 'Teleport interrupted!' : why === 'blocked' ? 'The destination was lost' : 'Teleport cancelled', kind: 'warn', team: team.id });
}
function startChannel(st, team, wsId) {
  const h = team.hero;
  const ws = wsId === undefined || wsId === 'home' ? homeWaystone(st) : waystoneById(st, wsId);
  if (team.tele && ws && team.tele.ws === ws.id) return; // already on its way
  const chk = canTeleport(st, team, ws);
  if (!chk.ok) { if (team.human) emit(st, { type: 'msg', text: chk.reason, kind: 'warn', team: team.id }); return; }
  team.tele = { ws: ws.id, left: TRAVEL.channel, total: TRAVEL.channel, x0: h.x, z0: h.z, t0: st.t };
  h.dest = null; h.path = null; h.tele = 0.001;
  emit(st, { type: 'telestart', x: h.x, z: h.z, team: team.id, color: team.f.color }); // other heroes within 70 m see the beam
}
function completeChannel(st, team) {
  const h = team.hero, ws = waystoneById(st, team.tele.ws);
  team.tele = null; h.tele = 0;
  if (!ws || isBlocked(st, ws)) { if (team.human) emit(st, { type: 'msg', text: 'The destination was lost', kind: 'warn', team: team.id }); return; }
  const home = isHome(st, ws), cd = cooldownFor(st, team, ws), a = arrivalFor(st, ws);
  emit(st, { type: 'tele', x: h.x, z: h.z, team: team.id, color: team.f.color });
  h.x = a.x; h.z = a.z; h.ox = h.x; h.oz = h.z; h.dest = null; h.path = null;
  if (!home) team.teleCd = Math.max(team.teleCd, cd);
  h.face = Math.atan2(a.z - ws.z, a.x - ws.x);
  team.lastWs = ws.id;
  for (const id of team.followers || []) { // followers come along
    const u = st.byId.get(id);
    if (u && u.alive) { u.x = a.x + Math.cos(id * 2.4) * 2.4; u.z = a.z + Math.sin(id * 2.4) * 2.4; u.ox = u.x; u.oz = u.z; u.path = null; u.tgt = 0; }
  }
  emit(st, { type: 'tele', x: h.x, z: h.z, team: team.id, color: team.f.color, arrive: true, wp: wsName(st, ws), ws: ws.id });
}

// ---------------------------------------------------------------- discovery
function discover(st, team, ws, how) {
  ws.disc[team.id] = true;
  emit(st, { type: 'discover', kind: 'waystone', how, team: team.id, id: ws.id, name: wsName(st, ws), x: ws.x, z: ws.z });
}

// ---------------------------------------------------------------- hooks
export function init(st) {
  const sites = (st.world.sites && st.world.sites.waystones) || [];
  st.waystones = sites.map((w) => ({ id: w.id, x: w.x, z: w.z, townId: w.townId, regionId: w.regionId, name: w.name || undefined, lost: false, disc: [false, false, false, false] }));
  // the start village's stone: sites.startTown (town id) -> town.wsId, else the stone nearest to the first hero spawn, else the first stone
  const S = st.world.sites || {};
  const tw = (S.towns || []).find((t) => t.id === S.startTown) || (S.towns || []).find((t) => t.start);
  let start = tw && tw.wsId !== undefined ? waystoneById(st, tw.wsId) : null;
  if (!start && st.teams[0] && st.teams[0].spawn) {
    let bd = 1e9;
    for (const w of st.waystones) { const d = D2(w.x, w.z, st.teams[0].spawn.x, st.teams[0].spawn.z); if (d < bd) { bd = d; start = w; } }
  }
  st.startWs = start ? start.id : 0;
  for (const t of st.teams) { t.tele = null; if (t.id < HEROES) t.lastWs = st.startWs; }
  if (start) start.disc = [true, true, true, true];
  st.travelT = 0;
}

export function update(st, dt) {
  // channels run every step
  for (const team of st.teams) {
    if (!team.tele) continue;
    const h = team.hero;
    if (!h || !h.alive || !team.alive) { team.tele = null; if (h) h.tele = 0; continue; }
    if (h.stun > 0 || h.charging) { cancelChannel(st, team, 'stun'); continue; }
    if (D2(h.x, h.z, team.tele.x0, team.tele.z0) > 1.5) { cancelChannel(st, team, 'moved'); continue; }
    const ws = waystoneById(st, team.tele.ws);
    if (!ws || isBlocked(st, ws)) { cancelChannel(st, team, 'blocked'); continue; }
    team.tele.left -= dt;
    if (team.tele.left <= 0) completeChannel(st, team);
  }
  // discovery + resting point ~5x/s
  st.travelT -= dt;
  if (st.travelT > 0) return;
  st.travelT = 0.2;
  for (const team of st.teams) {
    const h = team.hero;
    if (!team.alive || !h || !h.alive || team.id >= HEROES) continue;
    for (const w of st.waystones) {
      const d = D2(h.x, h.z, w.x, w.z);
      if (!w.disc[team.id]) { if (d < TRAVEL.discoverR) discover(st, team, w, 'walk'); }
      if (w.disc[team.id] && d < TRAVEL.restR && team.lastWs !== w.id && !isBlocked(st, w)) {
        team.lastWs = w.id;
        if (team.human) emit(st, { type: 'msg', text: 'You will return to ' + wsName(st, w) + ' if you fall.', kind: 'info', team: team.id });
      }
    }
  }
}

export function command(st, team, c) {
  if (c.t === 'tele') { if (team.hero && team.alive) startChannel(st, team, c.ws); return true; }
  if (c.t === 'telecancel') { cancelChannel(st, team, 'cancel'); return true; }
  return false;
}

export function onDamage(st, src, t, amt) {
  if (amt > 0 && t && t.kind === 'hero') { const team = st.teams[t.team]; if (team && team.tele) cancelChannel(st, team, 'damage'); }
  return amt;
}
