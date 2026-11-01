// UNITS lane: movement. stepMove (path following via Nav.findPath, stuck repaths, building collision), separation (50 units do not stack).
// Nav contract used: Nav.findPath(st,u,x,z,opts) -> [{x,z,layer?}] | null. A waypoint with .layer switches u.layer when reached ('ground'|'wall').
import * as Nav from './nav.js';
import { forNear, forNearBlds, bldDist } from './units_grid.js';

const REPATH_BUDGET = 10;                       // path requests per tick
export function startTick(st) { st._rb = REPATH_BUDGET; }

export function solidFor(u, b) {
  if (b.state === 'ruin' || b.hp <= 0 || b.passable || b.trap) return false;
  if (u.layer === 'wall' || u.def.fly) return false;
  const w = b.wall;
  if (w) {
    if (w.piece === 'stairs' || w.piece === 'trap' || w.piece === 'spikes') return false;
    if ((w.piece === 'gate' || w.piece === 'gatehouse') && (b.team === u.team || b.open || w.open)) return false;
  }
  if (b.h < 2) return false;
  return true;
}
// is (x,z) blocked for u by a building? returns the building or null
function blockerAt(st, u, x, z) {
  let hit = null;
  forNearBlds(st, x, z, u.r + 8, (b) => {
    if (b.kind !== 'bld' || !solidFor(u, b)) return false;
    const nd = bldDist(b, x, z);
    if (nd < u.r * 0.8 && nd < bldDist(b, u.x, u.z) - 0.001) { hit = b; return true; }
    return false;
  });
  return hit;
}
export function stepMove(st, u, x, z, dt, o = {}) {
  const arrive = o.arrive ?? 0.6;
  let dx = x - u.x, dz = z - u.z, d = Math.hypot(dx, dz);
  if (d <= arrive) { u.moving = false; u.path = null; return true; }
  if (u.stun > 0 || u.speed <= 0) { u.moving = false; return false; }
  const fly = u.def.fly;
  let tx = x, tz = z;
  if (!fly && !o.straight && d > 3) {
    const goalMoved = u.path && (Math.abs(u.pgx - x) > 3 || Math.abs(u.pgz - z) > 3);
    if (!u.path || goalMoved || u.stuck >= 2) {
      if (st._rb > 0) {
        st._rb--;
        const p = Nav.findPath(st, u, x, z, o);
        u.path = p && p.length ? p : [{ x, z }]; u.pi = 0; u.pgx = x; u.pgz = z; u.stuck = 0; u.pathFail = !(p && p.length);
      }
    }
    if (u.path) {
      const P = u.path;
      while (u.pi < P.length - 1 && (P[u.pi].x - u.x) ** 2 + (P[u.pi].z - u.z) ** 2 < 1.44) { if (P[u.pi].layer) u.layer = P[u.pi].layer; u.pi++; }
      tx = P[u.pi].x; tz = P[u.pi].z;
      if (u.pi === P.length - 1 && P[u.pi].layer && d < 2) u.layer = P[u.pi].layer;
    }
  }
  dx = tx - u.x; dz = tz - u.z; d = Math.hypot(dx, dz);
  if (d < 1e-4) return false;
  const spd = o.speed ? Math.min(u.speed, o.speed) : u.speed;
  const s = Math.min(d, spd * dt);
  let nx = u.x + (dx / d) * s, nz = u.z + (dz / d) * s;
  const w = st.world;
  let ok = fly || w.walkable(nx, nz);
  if (!ok) {
    if (w.walkable(nx, u.z)) { nz = u.z; ok = true; } else if (w.walkable(u.x, nz)) { nx = u.x; ok = true; }
  }
  if (ok && !fly) {
    const bl = blockerAt(st, u, nx, nz);
    if (bl) {
      u.blockedBy = bl.id; u.blockT = st.t;
      const ax = blockerAt(st, u, nx, u.z) ? null : nx, az = blockerAt(st, u, u.x, nz) ? null : nz;
      if (ax != null && Math.abs(dx) > 0.01) { nz = u.z; } else if (az != null && Math.abs(dz) > 0.01) { nx = u.x; } else ok = false;
    }
  }
  u.mvAcc = (u.mvAcc || 0) + s;
  if (ok) {
    u.x = nx; u.z = nz; u.face = Math.atan2(dz, dx); u.moving = true;
    u.y = st.world.heightAt(nx, nz) + (fly ? 3.5 : 0) + (u.yOff || 0);
  } else u.moving = false;
  // stuck detection every ~0.8 s
  if (!u.sT) { u.sT = st.t; u.sx = u.x; u.sz = u.z; u.mvAcc = 0; }
  else if (st.t - u.sT > 0.8) {
    const moved = Math.hypot(u.x - u.sx, u.z - u.sz);
    u.stuck = moved < u.mvAcc * 0.25 ? (u.stuck || 0) + 1 : 0;
    u.sT = st.t; u.sx = u.x; u.sz = u.z; u.mvAcc = 0;
  }
  return false;
}

// ---------------------------------------------------------------- separation: gentle pairwise push-out, moving units yield less
export function separate(st, dt) {
  const w = st.world;
  for (const u of st.ents) {
    if (!u.alive || u.garrison) continue;
    const fu = u.def.fly, ru = u.r;
    forNear(st, u.x, u.z, ru + 2.2, (e) => {
      if (e.id <= u.id || e.def.fly !== fu) return false;
      const dx = e.x - u.x, dz = e.z - u.z, rs = (ru + e.r) * 0.92, d2 = dx * dx + dz * dz;
      if (d2 >= rs * rs) return false;
      const d = Math.sqrt(d2) || 0.001, ov = (rs - d);
      const nx = d2 < 1e-6 ? 1 : dx / d, nz = d2 < 1e-6 ? 0 : dz / d;
      const wu = u.moving ? 0.35 : 0.65, we = e.moving ? 0.35 : 0.65, tot = wu + we;
      const k = Math.min(ov, 0.12 + 3 * dt) * 0.6;
      const mu = k * we / tot, me = k * wu / tot;
      if (!u.anchored) { const ux = u.x - nx * mu, uz = u.z - nz * mu; if (fu || w.walkable(ux, uz)) { u.x = ux; u.z = uz; } }
      if (!e.anchored) { const ex = e.x + nx * me, ez = e.z + nz * me; if (fu || w.walkable(ex, ez)) { e.x = ex; e.z = ez; } }
      return false;
    });
  }
}
