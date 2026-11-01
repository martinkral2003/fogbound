// Coarse 2 m nav grid. Terrain is static; buildings are stamped into it.
// Enemy buildings stay "walkable at a cost" so A* routes through them and units attack what blocks them.
import { WORLD } from './data.js';

const N = WORLD.navN, C = WORLD.navCell, H = WORLD.half;
const ENEMY_BLD_COST = 22;
const ROAD_COST = 0.65; // packed-earth roads are cheaper to walk, so units follow them

export function createNav(world) {
  const nav = {
    N, road: new Uint8Array(N * N), terr: new Uint8Array(N * N), bld: new Int32Array(N * N), bteam: new Int8Array(N * N), bgate: new Uint8Array(N * N),
    g: new Float32Array(N * N), stamp: new Int32Array(N * N), from: new Int32Array(N * N), closed: new Int32Array(N * N), gen: 0,
    hk: [], hv: [],
  };
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const cx = i * C - H + C / 2, cz = j * C - H + C / 2;
      let bad = world.walkable(cx, cz) ? 0 : 2;
      for (const [ox, oz] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) if (!world.walkable(cx + ox, cz + oz)) bad++;
      nav.terr[j * N + i] = bad >= 2 ? 1 : 0;
      if (!nav.terr[j * N + i] && world.roadDist && world.roadDist(cx, cz) < 2.4) nav.road[j * N + i] = 1;
    }
  }
  return nav;
}

export const cellOf = (x, z) => {
  const i = Math.max(0, Math.min(N - 1, Math.floor((x + H) / C)));
  const j = Math.max(0, Math.min(N - 1, Math.floor((z + H) / C)));
  return j * N + i;
};
const cellX = (idx) => (idx % N) * C - H + C / 2;
const cellZ = (idx) => Math.floor(idx / N) * C - H + C / 2;

export function rebuildNav(nav, blds) {
  nav.bld.fill(0); nav.bteam.fill(0); nav.bgate.fill(0);
  for (const b of blds) {
    if (b.hp <= 0 || b.trap) continue; // traps are walk-over (structures carry their own flags: b.trap, b.passable)
    const hw = b.w / 2 + 0.6, hd = b.d / 2 + 0.6;
    const rad = Math.hypot(hw, hd);
    const i0 = Math.max(0, Math.floor((b.x - rad + H) / C)), i1 = Math.min(N - 1, Math.floor((b.x + rad + H) / C));
    const j0 = Math.max(0, Math.floor((b.z - rad + H) / C)), j1 = Math.min(N - 1, Math.floor((b.z + rad + H) / C));
    const cs = Math.cos(b.rot), sn = Math.sin(b.rot);
    const gate = b.passable ? 1 : 0;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const dx = i * C - H + C / 2 - b.x, dz = j * C - H + C / 2 - b.z;
        const lx = dx * cs + dz * sn, lz = -dx * sn + dz * cs;
        if (Math.abs(lx) <= hw && Math.abs(lz) <= hd) {
          const idx = j * N + i;
          nav.bld[idx] = b.id; nav.bteam[idx] = b.team; nav.bgate[idx] = gate;
        }
      }
    }
  }
}

// -1 = impassable, otherwise step cost multiplier
function cellCost(nav, idx, team) {
  if (nav.terr[idx]) return -1;
  if (!nav.bld[idx]) return nav.road[idx] ? ROAD_COST : 1;
  const bt = nav.bteam[idx];
  if (bt === team || (bt === 4 && team >= 0 && team < 4) || (team === 4 && bt >= 0 && bt < 4)) return nav.bgate[idx] ? 1.2 : -1; // own / humanity structures: only gates open
  return ENEMY_BLD_COST;
}

export function clearLine(nav, team, ax, az, bx, bz) {
  const d = Math.hypot(bx - ax, bz - az);
  const n = Math.ceil(d / 1.0);
  for (let k = 1; k <= n; k++) {
    const t = k / n;
    const c = cellCost(nav, cellOf(ax + (bx - ax) * t, az + (bz - az) * t), team);
    if (c < 0 || c > 2) return false;
  }
  return true;
}

function nearestOpen(nav, idx, team) {
  const bi = idx % N, bj = Math.floor(idx / N);
  for (let r = 1; r < 14; r++) {
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = bi + di, j = bj + dj;
        if (i < 0 || j < 0 || i >= N || j >= N) continue;
        const k = j * N + i;
        if (cellCost(nav, k, team) >= 0) return k;
      }
    }
  }
  return idx;
}

// binary heap on parallel arrays
function hpush(nav, f, v) {
  const k = nav.hk, vv = nav.hv;
  let i = k.length; k.push(f); vv.push(v);
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (k[p] <= k[i]) break;
    [k[p], k[i]] = [k[i], k[p]]; [vv[p], vv[i]] = [vv[i], vv[p]]; i = p;
  }
}
function hpop(nav) {
  const k = nav.hk, vv = nav.hv;
  const top = vv[0], lk = k.pop(), lv = vv.pop();
  if (k.length) {
    k[0] = lk; vv[0] = lv;
    let i = 0; const n = k.length;
    for (;;) {
      const l = 2 * i + 1, r = l + 1; let m = i;
      if (l < n && k[l] < k[m]) m = l;
      if (r < n && k[r] < k[m]) m = r;
      if (m === i) break;
      [k[m], k[i]] = [k[i], k[m]]; [vv[m], vv[i]] = [vv[i], vv[m]]; i = m;
    }
  }
  return top;
}

const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];

export function findPath(nav, team, sx, sz, gx, gz, maxExp = 7000) {
  let s = cellOf(sx, sz), g = cellOf(gx, gz);
  if (cellCost(nav, s, team) < 0) s = nearestOpen(nav, s, team);
  if (cellCost(nav, g, team) < 0) g = nearestOpen(nav, g, team);
  if (s === g) return [{ x: gx, z: gz }];
  const gi = g % N, gj = Math.floor(g / N);
  const hfun = (idx) => {
    const dx = Math.abs((idx % N) - gi), dz = Math.abs(Math.floor(idx / N) - gj);
    return (dx + dz) + (1.414 - 2) * Math.min(dx, dz);
  };
  nav.gen++;
  const gen = nav.gen;
  nav.hk.length = 0; nav.hv.length = 0;
  nav.g[s] = 0; nav.stamp[s] = gen; nav.from[s] = -1;
  hpush(nav, hfun(s), s);
  let best = s, bestH = hfun(s), exp = 0, reached = false;
  while (nav.hk.length) {
    const cur = hpop(nav);
    if (nav.closed[cur] === gen) continue;
    nav.closed[cur] = gen;
    if (cur === g) { reached = true; best = g; break; }
    if (++exp > maxExp) break;
    const ci = cur % N, cj = Math.floor(cur / N), cg = nav.g[cur];
    for (let d = 0; d < 8; d++) {
      const di = DIRS[d][0], dj = DIRS[d][1];
      const ni = ci + di, nj = cj + dj;
      if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
      const nb = nj * N + ni;
      if (nav.closed[nb] === gen) continue;
      const cc = cellCost(nav, nb, team);
      if (cc < 0) continue;
      if (di !== 0 && dj !== 0) { // no corner cutting
        if (cellCost(nav, cj * N + ni, team) < 0 || cellCost(nav, nj * N + ci, team) < 0) continue;
      }
      const ng = cg + DIRS[d][2] * cc;
      if (nav.stamp[nb] !== gen || ng < nav.g[nb]) {
        nav.stamp[nb] = gen; nav.g[nb] = ng; nav.from[nb] = cur;
        const h = hfun(nb);
        if (h < bestH) { bestH = h; best = nb; }
        hpush(nav, ng + h, nb);
      }
    }
  }
  // reconstruct
  const cells = [];
  for (let c = best; c !== -1 && c !== s; c = nav.from[c]) cells.push(c);
  cells.reverse();
  const pts = cells.map((c) => ({ x: cellX(c), z: cellZ(c) }));
  if (reached) pts[pts.length - 1] = { x: gx, z: gz };
  // string-pull
  const out = [];
  let ax = sx, az = sz, i = 0;
  while (i < pts.length) {
    let far = i;
    for (let k = pts.length - 1; k > i; k--) {
      if (clearLine(nav, team, ax, az, pts[k].x, pts[k].z)) { far = k; break; }
    }
    out.push(pts[far]); ax = pts[far].x; az = pts[far].z; i = far + 1;
  }
  return out;
}

// reachability helper for tests: flood fill walkable terrain from a point
export function floodReach(nav, x, z) {
  const seen = new Uint8Array(N * N);
  const st = [cellOf(x, z)]; seen[st[0]] = 1;
  while (st.length) {
    const c = st.pop(), ci = c % N, cj = Math.floor(c / N);
    for (let d = 0; d < 4; d++) {
      const ni = ci + DIRS[d][0], nj = cj + DIRS[d][1];
      if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
      const nb = nj * N + ni;
      if (seen[nb] || nav.terr[nb]) continue;
      seen[nb] = 1; st.push(nb);
    }
  }
  return seen;
}
