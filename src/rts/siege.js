// FOGBOUND: DOMINION siege (WALLS+SIEGE+NAV lane). Siege units own their attack behaviour (u.siegeCtl = true: the Units/Combat lanes skip them
// while they have a siege target); movement goes through Units.stepMove. Orders understood: {type:'attack',target}, {type:'amove'}, none/hold (auto-acquire).
// Exports: command, update, pickTarget, ensureUnits, SIEGE_DEFS, dockedBlds, rectDist
import * as Units from './units.js';
import * as Nav from './nav.js';
import * as Walls from './walls.js';
import * as Combat from './combat.js';
import * as Fire from './siege_proj.js';
import { emit, killEnt } from './core.js';
import { SIEGE_DEFS } from './siege_data.js';
import { ignite } from './wall_fire.js';
export { SIEGE_DEFS };

let registered = false;
export function ensureUnits() {
  if (registered) return;
  registered = true;
  if (Units.registerUnits) Units.registerUnits(SIEGE_DEFS);
  else if (Units.ROSTER) for (const id in SIEGE_DEFS) Units.ROSTER[id] = SIEGE_DEFS[id];
}
export const specOf = (u) => (u.def && u.def.siege) || (SIEGE_DEFS[u.type] && SIEGE_DEFS[u.type].siege) || null;

// distance from a point to the edge of a building footprint (0 inside)
export function rectDist(b, x, z) {
  const c = Math.cos(b.rot || 0), s = Math.sin(b.rot || 0), dx = x - b.x, dz = z - b.z;
  const lx = Math.abs(dx * c + dz * s) - b.w / 2, lz = Math.abs(-dx * s + dz * c) - b.d / 2;
  return Math.hypot(Math.max(0, lx), Math.max(0, lz));
}
const hostileB = (st, u, b) => b.hp > 0 && b.state !== 'ruin' && b.team !== u.team && !Nav.allied(st, u.team, b.team) && !b.trap && b.type !== 'ladder';
const hostileU = (st, u, e) => e.alive && e.hp > 0 && e.team !== u.team && !Nav.allied(st, u.team, e.team);
const centre = (t) => ({ x: t.x, y: (t.y || 0) + (t.kind === 'bld' ? (t.h || 4) * 0.5 : 1), z: t.z });

function structPriority(b) {
  if (b.turret) return 60;
  if (b.wall && b.wall.passable) return 55;
  if (b.wall) return 45;
  if (b.type === 'keep') return 30;
  return 25;
}
// pick a structure target for a unit: prefers what blocks the way to the enemy keep, then turrets, gates, walls
function acquireBld(st, u, S, radius) {
  let best = null, bs = -1e9;
  for (const b of st.blds) {
    if (!hostileB(st, u, b)) continue;
    const d = rectDist(b, u.x, u.z);
    if (d > radius) continue;
    if (S.kind === 'tower' && !(b.wall && b.wall.walkable)) continue;
    let sc = structPriority(b) - d * 1.2;
    if (S.kind === 'ram' && b.wall && b.wall.passable) sc += 20;
    if (S.fire && b.wall && b.wall.tier === 0) sc += 15;
    if (S.kind === 'flame' && !(b.wall && b.wall.tier === 0) && b.type !== 'gate') sc -= 40;
    if (sc > bs) { bs = sc; best = b; }
  }
  return best;
}
function acquireUnit(st, u, S, radius) {
  let best = null, bs = -1e9;
  for (const e of st.ents) {
    if (!hostileU(st, u, e)) continue;
    const d = Math.hypot(e.x - u.x, e.z - u.z);
    if (d > radius || d < (S.minRange || 0)) continue;
    if ((e.flying || e.role === 'flyer') && S.kind !== 'ballista') continue;
    let sc = -d;
    if (e.role === 'siege') sc += 30;
    if (S.kind === 'ballista' && (e.maxHp > 500 || e.general)) sc += 40;
    if (sc > bs) { bs = sc; best = e; }
  }
  return best;
}

function resolveTarget(st, u, S) {
  const o = u.order;
  if (o && o.type === 'attack' && o.target) {
    const t = st.byId.get(o.target);
    if (t && t.hp > 0 && t.state !== 'ruin' && t.alive !== false) return t;
    u.orders.shift(); u.order = u.orders[0] || null; // target gone
  }
  if (o && (o.type === 'move' || o.type === 'patrol' || o.type === 'garrison' || o.type === 'cast')) return null; // plain movement: leave to Units
  const t = u.sTgt && st.byId.get(u.sTgt);
  if (t && t.hp > 0 && t.state !== 'ruin' && t.alive !== false && st.t < (u.sTgtUntil || 0)) return t;
  if (st.t < (u.sNext || 0)) return null;
  u.sNext = st.t + 0.5;
  const hold = u.stance === 'hold' || (o && o.type === 'hold');
  const reach = S.range || S.reach || 3;
  const rad = hold ? reach : (o && o.type === 'amove' ? 60 : (S.kind === 'sapper' ? 55 : Math.max(26, reach + 16)));
  let tg = null;
  if (S.kind === 'catapult' || S.kind === 'cannon' || S.kind === 'ballista' || S.kind === 'flame') {
    tg = (S.kind === 'ballista' ? acquireUnit(st, u, S, reach) : null) || acquireBld(st, u, S, rad) || acquireUnit(st, u, S, reach);
    if (S.kind === 'cannon' || S.kind === 'flame') { const eu = acquireUnit(st, u, S, reach * 0.7); if (eu && (!tg || tg.kind === 'bld' && eu.role === 'siege')) tg = eu; }
  } else tg = acquireBld(st, u, S, rad);
  if (tg) { u.sTgt = tg.id; u.sTgtUntil = st.t + 6; }
  return tg;
}

const distTo = (t, u) => (t.kind === 'bld' ? rectDist(t, u.x, u.z) : Math.hypot(t.x - u.x, t.z - u.z) - (t.r || 0.5));
function approach(st, u, t, dt, stopAt) {
  const hold = u.stance === 'hold' || (u.order && u.order.type === 'hold');
  if (hold) return false;
  let tx = t.x, tz = t.z;
  if (t.kind === 'bld') { const c = Math.cos(t.rot || 0), s = Math.sin(t.rot || 0), dx = u.x - t.x, dz = u.z - t.z; // nearest point of the footprint
    const lx = Math.max(-t.w / 2, Math.min(t.w / 2, dx * c + dz * s)), lz = Math.max(-t.d / 2, Math.min(t.d / 2, -dx * s + dz * c));
    tx = t.x + lx * c - lz * s; tz = t.z + lx * s + lz * c; }
  Units.stepMove(st, u, tx, tz, dt, { arrive: stopAt });
  return true;
}

export function update(st, dt) {
  ensureUnits();
  const docks = st.nav && st.nav.dock;
  if (docks) for (let i = docks.length - 1; i >= 0; i--) {
    const d = docks[i], tw = st.byId.get(d.tower), pc = st.byId.get(d.piece);
    if (!tw || !tw.alive || !pc || pc.hp <= 0 || pc.state === 'ruin' || Math.hypot(tw.x - d.gx, tw.z - d.gz) > 2.5) { docks.splice(i, 1); if (tw) tw.docked = 0; Nav.dirty(st); }
  }
  for (const u of st.ents) {
    if (!u.alive || u.hp <= 0) continue;
    const S = specOf(u);
    if (!S) continue;
    u.siegeCtl = false;
    if (u.stun > 0) continue;
    if (u.cdS > 0) u.cdS -= dt;
    const t = resolveTarget(st, u, S);
    if (!t) { u.siegeBusy = false; continue; }
    u.siegeBusy = true; u.siegeCtl = true;
    if (S.kind === 'ram' || S.kind === 'sapper') meleeSiege(st, u, S, t, dt);
    else if (S.kind === 'tower') towerSiege(st, u, S, t, dt);
    else shootSiege(st, u, S, t, dt);
  }
}

function meleeSiege(st, u, S, t, dt) {
  const d = distTo(t, u);
  if (d > S.reach) { approach(st, u, t, dt, S.reach * 0.8); return; }
  u.face = Math.atan2(t.z - u.z, t.x - u.x);
  if (S.kind === 'sapper') {
    u.fuse = (u.fuse || 0) + dt;
    if (u.fuse >= S.fuse) explode(st, u, S);
    return;
  }
  if (u.cdS > 0) return;
  u.cdS = S.cd; u.swing = st.t;
  emit(st, { type: 'siege', src: u.id, tgt: t.id });
  const vm = 1 + (u.vet ? (u.vet - 1) * 0.06 : 0);
  if (t.kind === 'bld') {
    const gm = t.wall && t.wall.passable ? S.gateMul || 1 : 1;
    Walls.damageBld(st, u, t, S.bld * gm * vm, { siege: true });
    if (S.fire && t.hp > 0) ignite(st, t, 6, 12);
  } else Combat.damage(st, u, t, S.unit * vm, { dtype: 'physical' });
}
function explode(st, u, S) {
  Fire.fire(st, { kind: 'bomb', srcRef: u, team: u.team, from: { x: u.x, y: u.y || 0, z: u.z }, to: { x: u.x, y: u.y || 0, z: u.z }, speed: 100, dmg: S.unit, splash: S.splash, dtype: 'siege', siege: true, bldMul: S.bld / S.unit, fire: false });
  emit(st, { type: 'fx', kind: 'explosion', x: u.x, z: u.z, r: S.splash });
  killEnt(st, u, null);
}

function shootSiege(st, u, S, t, dt) {
  const d = distTo(t, u);
  const tooClose = S.minRange && d < S.minRange && t.kind === 'bld' && false;
  if (d > S.range * 0.98) { approach(st, u, t, dt, S.range * 0.85); return; }
  u.face = Math.atan2(t.z - u.z, t.x - u.x);
  if (tooClose || u.cdS > 0) return;
  u.cdS = S.cd;
  const from = { x: u.x, y: (u.y || 0) + 1.8, z: u.z }, c = centre(t);
  const lead = t.kind === 'unit' && S.splash ? 0.4 : 0;
  const to = { x: c.x + Math.cos(t.face || 0) * (t.speed || 0) * lead, y: c.y, z: c.z + Math.sin(t.face || 0) * (t.speed || 0) * lead };
  let dmg = t.kind === 'bld' ? S.bld : S.unit;
  if (S.kind === 'ballista' && t.kind === 'unit' && (t.maxHp > 500 || t.general)) dmg *= S.bigMul || 1;
  Fire.fire(st, { kind: S.projectile || 'boulder', srcRef: u, team: u.team, from, to, speed: S.speed || 24, arc: S.arc || 0, dmg, splash: S.splash || 0, dtype: S.fire ? 'fire' : 'physical',
    tgtId: t.id, siege: true, bldMul: t.kind === 'bld' ? 1 : (S.bld || 0) / (S.unit || 1), unitMul: 1, fire: !!S.fire, homing: !S.splash });
  emit(st, { type: 'siege', src: u.id, tgt: t.id });
}

// siege tower: walk to a walkable enemy wall piece and dock. Dock links make the wall-top reachable for the tower's team (see nav_wall.js)
function towerSiege(st, u, S, t, dt) {
  if (!(t.wall && t.wall.walkable)) { u.sTgt = 0; return; }
  const d = distTo(t, u);
  const docked = st.nav.dock.find((x) => x.tower === u.id);
  if (docked) { u.anchored = true; return; }
  if (d > S.reach) { u.anchored = false; approach(st, u, t, dt, S.reach * 0.9); return; }
  u.anchored = true; u.docked = t.id;
  st.nav.dock.push({ team: u.team, piece: t.id, gx: u.x, gz: u.z, tower: u.id });
  Nav.dirty(st);
  emit(st, { type: 'msg', team: u.team, text: 'Siege tower docked', kind: 'info' });
}

export function command(st, teamId, cmd) {
  ensureUnits();
  if (cmd.t === 'siege') { // {t:'siege', ids, bld}: order siege units to attack a structure / unit
    for (const id of cmd.ids || []) {
      const u = st.byId.get(id);
      if (!u || u.team !== teamId || !u.alive) continue;
      const o = { type: 'attack', target: cmd.bld || cmd.target };
      if (cmd.queue) u.orders.push(o); else u.orders = [o];
      u.order = u.orders[0];
    }
    return true;
  }
  return false;
}

// AI helper: where should `team` break into `enemy` (a team id; default: nearest living enemy)?
// -> { kind:'breach'|'gate'|'wall'|'tower'|'keep', bld, x, z, enemy } or null
export function pickTarget(st, team, enemy) {
  const me = st.teams[team];
  if (enemy == null) {
    let bd = 1e9;
    for (const t of st.teams) if (t.alive && t.id !== team && !Nav.allied(st, team, t.id) && t.keep) { const d = Math.hypot(t.keep.x - me.base.x, t.keep.z - me.base.z); if (d < bd) { bd = d; enemy = t.id; } }
  }
  if (enemy == null) return null;
  const et = st.teams[enemy], keep = et.keep;
  if (!keep || keep.hp <= 0) return null;
  const br = Walls.breaches(st, enemy).filter((g) => g.kind === 'gap');
  if (br.length) { br.sort((a, b) => Math.hypot(a.x - me.base.x, a.z - me.base.z) - Math.hypot(b.x - me.base.x, b.z - me.base.z)); return { kind: 'breach', bld: null, x: br[0].x, z: br[0].z, enemy }; }
  if (!Walls.enclosed(st, enemy)) return { kind: 'keep', bld: keep, x: keep.x, z: keep.z, enemy };
  // sealed: choose the weakest point on the side facing us: gates first, else wall pieces by hp and distance to the line me->keep
  const ax = me.base.x, az = me.base.z, kx = keep.x - ax, kz = keep.z - az, kl = Math.hypot(kx, kz) || 1;
  let best = null, bs = 1e9;
  for (const b of st.blds) {
    if (b.team !== enemy || !b.wall || b.hp <= 0 || b.state === 'ruin' || b.wall.piece === 'stairs' || b.wall.piece === 'ladder' || b.wall.piece === 'spikes' || b.wall.piece === 'moat') continue;
    const px = b.x - ax, pz = b.z - az, along = (px * kx + pz * kz) / kl, off = Math.abs(px * kz - pz * kx) / kl;
    if (along < kl - 60 && Math.hypot(b.x - keep.x, b.z - keep.z) > 70) continue;
    const toKeep = Math.hypot(b.x - keep.x, b.z - keep.z);
    let sc = b.hp * 0.35 + off * 4 + toKeep * 0.5 + (b.turret ? 160 : 0) - (b.wall.passable ? 380 : 0) - (b.wall.tier === 0 ? 220 : 0);
    if (sc < bs) { bs = sc; best = b; }
  }
  if (!best) return { kind: 'keep', bld: keep, x: keep.x, z: keep.z, enemy };
  return { kind: best.wall.passable ? 'gate' : best.turret ? 'tower' : 'wall', bld: best, x: best.x, z: best.z, enemy };
}
