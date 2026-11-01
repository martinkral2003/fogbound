// FOGBOUND: DOMINION navigation (WALLS+SIEGE+NAV lane). 2 m grid, ground layer + wall-top layer (nav_wall.js).
// Own buildings are solid (gates/gatehouses pass for the owner and allies); enemy buildings are solid but walkable-at-cost in A*,
// so a route "through" them ends at an approach point and path.blocker names the building to attack.
// findPath(st, unit, x, z, opts) -> [{x,z,layer, climb?}] ; props: .blocker (bld id|0), .partial (true if goal not reached), .goalLayer
import * as Wall from './nav_wall.js';
import { astarGround, cellOf, cellCenter, N, C, H, clearLine, cellCost } from './nav_ground.js';

export { N, C, H, cellOf, allied };
function allied(st, a, b) {
  if (a === b) return true;
  const ta = st.teams[a], tb = st.teams[b];
  if (!ta || !tb) return false;
  if (ta.allies && ta.allies.includes(b)) return true;
  return ta.group != null && ta.group === tb.group;
}

function terrain(world) {
  if (world._navTerr) return world._navTerr;
  const terr = new Uint8Array(N * N), road = new Uint8Array(N * N);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const cx = i * C - H + C / 2, cz = j * C - H + C / 2;
      let bad = world.walkable(cx, cz) ? 0 : 2;
      for (const [ox, oz] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) if (!world.walkable(cx + ox, cz + oz)) bad++;
      terr[j * N + i] = bad >= 2 ? 1 : 0;
      if (!terr[j * N + i] && world.roadDist && world.roadDist(cx, cz) < 2.4) road[j * N + i] = 1;
    }
  }
  return (world._navTerr = { terr, road });
}

export function create(st) {
  const T = terrain(st.world);
  return {
    N, terr: T.terr, road: T.road, bld: new Int32Array(N * N), bteam: new Int8Array(N * N), bkind: new Uint8Array(N * N), bcost: new Float32Array(N * N),
    g: new Float32Array(N * N), stamp: new Int32Array(N * N), from: new Int32Array(N * N), closed: new Int32Array(N * N), gen: 0, hk: [], hv: [],
    ver: 1, tc: [], dirty: true, sig: 0, cache: new Map(), wall: Wall.empty(), dock: [], stats: { paths: 0, exp: 0, hits: 0, rebuilds: 0 },
  };
}
function ensure(st) { if (!st.nav) st.nav = create(st); return st.nav; }
export function dirty(st) { if (st.nav) st.nav.dirty = true; }

// kinds: 0 free, 1 solid building, 2 passable-for-friends (gate), 3 slow zone (moat/spikes)
const solidBld = (b) => b.hp > 0 && b.state !== 'ruin' && b.state !== 'dead' && !b.trap && !(b.wall && (b.wall.piece === 'spikes' || b.wall.piece === 'moat')) && !b.noBlock;
export function rebuild(st) {
  const nav = ensure(st);
  nav.bld.fill(0); nav.bteam.fill(0); nav.bkind.fill(0); nav.bcost.fill(0);
  for (const b of st.blds) {
    if (b.hp <= 0 || b.state === 'ruin' || b.state === 'dead') continue;
    const slow = b.wall && (b.wall.piece === 'spikes' || b.wall.piece === 'moat');
    if (!solidBld(b) && !slow) continue;
    const pass = b.wall && b.wall.passable && !b.wall.locked ? 2 : 0;
    const kind = slow ? 3 : pass || 1;
    const pad = slow ? 0 : 0.6;
    const hw = b.w / 2 + pad, hd = b.d / 2 + pad, rad = Math.hypot(hw, hd);
    const i0 = Math.max(0, Math.floor((b.x - rad + H) / C)), i1 = Math.min(N - 1, Math.floor((b.x + rad + H) / C));
    const j0 = Math.max(0, Math.floor((b.z - rad + H) / C)), j1 = Math.min(N - 1, Math.floor((b.z + rad + H) / C));
    const cs = Math.cos(b.rot || 0), sn = Math.sin(b.rot || 0);
    const cost = (kind === 2 ? 0.7 : 1) * (10 + Math.min(40, b.hp / 60));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const dx = i * C - H + C / 2 - b.x, dz = j * C - H + C / 2 - b.z;
        const lx = dx * cs + dz * sn, lz = -dx * sn + dz * cs;
        if (Math.abs(lx) <= hw && Math.abs(lz) <= hd) {
          const idx = j * N + i;
          if (nav.bkind[idx] === 2 && kind === 1) continue; // keep gate cells passable where walls overlap them
          nav.bld[idx] = b.id; nav.bteam[idx] = b.team; nav.bkind[idx] = kind; nav.bcost[idx] = cost;
        }
      }
    }
  }
  Wall.build(st, nav);
  nav.ver++; nav.dirty = false; nav.cache = new Map(); nav.stats.rebuilds++;
}

export function passable(st, team, x, z) { const nav = ensure(st); if (nav.dirty) rebuild(st); return cellCost(nav, st, cellOf(x, z), team, false) >= 0 && cellCost(nav, st, cellOf(x, z), team, false) < 2; }
export function reachable(st, unit, x, z) {
  const p = findPath(st, unit, x, z, { avoidWalls: true });
  return !p.partial;
}
// building (enemy) occupying the cell at x,z or 0
export function blockerAt(st, team, x, z) {
  const nav = ensure(st); if (nav.dirty) rebuild(st);
  const c = cellOf(x, z);
  return nav.bld[c] && nav.bteam[c] !== team && !allied(st, team, nav.bteam[c]) ? nav.bld[c] : 0;
}

export function findPath(st, unit, x, z, opts = {}) {
  const nav = ensure(st);
  if (nav.dirty) rebuild(st);
  const sx = unit.x, sz = unit.z, team = unit.team;
  const fly = opts.flying || unit.flying || unit.role === 'flyer';
  if (fly) { const p = [{ x, z, layer: 'ground' }]; p.blocker = 0; p.partial = false; p.goalLayer = 'ground'; return p; }
  const sl = unit.layer === 'wall' ? 'wall' : 'ground';
  const key = team + '|' + sl + '|' + cellOf(sx, sz) + '|' + cellOf(x, z) + '|' + (opts.layer || '') + (opts.avoidWalls ? 'a' : '') + (opts.toBld || '');
  const hit = nav.cache.get(key);
  if (hit) { nav.stats.hits++; return clonePath(hit); }
  nav.stats.paths++;
  const res = Wall.route(st, nav, unit, sl, x, z, opts);
  if (nav.cache.size > 500) nav.cache.clear();
  nav.cache.set(key, res);
  return clonePath(res);
}
function clonePath(p) {
  const o = p.map((w) => ({ ...w }));
  o.blocker = p.blocker; o.partial = p.partial; o.goalLayer = p.goalLayer;
  return o;
}
export { astarGround, clearLine };
export const stats = (st) => ensure(st).stats;

// Move a unit along a path produced by findPath (used by anyone who wants wall-aware movement). Returns true when the path is finished.
// Handles layer switches at climb waypoints. u.pathI is the waypoint index (reset by passing path.reset or a new array).
export function advance(st, u, path, dt, speed) {
  if (!path || !path.length) return true;
  if (u._pathRef !== path) { u._pathRef = path; u.pathI = 0; }
  let left = (speed || u.speed || 5) * dt;
  while (left > 1e-6 && u.pathI < path.length) {
    const w = path[u.pathI];
    if (w.climb && u.layer !== w.layer) u.layer = w.layer;
    const dx = w.x - u.x, dz = w.z - u.z, d = Math.hypot(dx, dz);
    if (d <= left) { u.x = w.x; u.z = w.z; left -= d; u.pathI++; if (d > 0.01) u.face = Math.atan2(dz, dx); }
    else { u.x += (dx / d) * left; u.z += (dz / d) * left; u.face = Math.atan2(dz, dx); left = 0; }
  }
  u.y = Wall.heightFor(st, u);
  return u.pathI >= path.length;
}
