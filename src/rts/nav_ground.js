// Ground-layer A* on the 2 m grid (binary heap, expansion cap, string-pulling). Used by nav.js / nav_wall.js.
export const N = 200, C = 2, H = 200;
const ROAD_COST = 0.65;

export const cellOf = (x, z) => {
  const i = Math.max(0, Math.min(N - 1, Math.floor((x + H) / C)));
  const j = Math.max(0, Math.min(N - 1, Math.floor((z + H) / C)));
  return j * N + i;
};
export const cellCenter = (idx) => ({ x: (idx % N) * C - H + C / 2, z: Math.floor(idx / N) * C - H + C / 2 });
const cellX = (idx) => (idx % N) * C - H + C / 2;
const cellZ = (idx) => Math.floor(idx / N) * C - H + C / 2;

const allied = (st, a, b) => {
  if (a === b) return true;
  const ta = st.teams[a], tb = st.teams[b];
  if (!ta || !tb) return false;
  return !!((ta.allies && ta.allies.includes(b)) || (ta.group != null && ta.group === tb.group));
};

// -1 impassable; else step cost multiplier. avoid = never path through enemy buildings.
export function cellCost(nav, st, idx, team, avoid) {
  if (nav.terr[idx]) return -1;
  const k = nav.bkind[idx];
  if (!k) return nav.road[idx] ? ROAD_COST : 1;
  const bt = nav.bteam[idx];
  const friend = bt === team || allied(st, team, bt);
  if (k === 3) return friend ? 1.1 : 3;
  if (friend) return k === 2 ? 1.2 : -1;
  if (bt < 0 || avoid) return -1;
  return nav.bcost[idx];
}

// flat per-team cost table for the current nav version (rebuilt lazily after nav.ver changes)
export function teamCost(nav, st, team, avoid) {
  const key = team * 2 + (avoid ? 1 : 0);
  const c = nav.tc[key];
  if (c && c.ver === nav.ver) return c.arr;
  const arr = c && c.arr ? c.arr : new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) arr[i] = (nav.terr[i] || nav.bkind[i]) ? cellCost(nav, st, i, team, avoid) : (nav.road[i] ? ROAD_COST : 1);
  nav.tc[key] = { ver: nav.ver, arr };
  return arr;
}
export function clearLine(nav, st, team, ax, az, bx, bz, avoid) {
  const n = Math.ceil(Math.hypot(bx - ax, bz - az)), tc = teamCost(nav, st, team, avoid);
  for (let k = 1; k <= n; k++) {
    const t = k / n;
    const c = tc[cellOf(ax + (bx - ax) * t, az + (bz - az) * t)];
    if (c < 0 || c > 1.3) return false;
  }
  return true;
}

function nearestOpen(nav, st, idx, team, avoid) {
  const bi = idx % N, bj = Math.floor(idx / N);
  for (let r = 1; r < 14; r++) {
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = bi + di, j = bj + dj;
        if (i < 0 || j < 0 || i >= N || j >= N) continue;
        const k = j * N + i;
        if (cellCost(nav, st, k, team, avoid) >= 0 && cellCost(nav, st, k, team, avoid) <= 2) return k;
      }
    }
  }
  return idx;
}

export function hpush(nav, f, v) {
  const k = nav.hk, vv = nav.hv;
  let i = k.length; k.push(f); vv.push(v);
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (k[p] <= k[i]) break;
    const tk = k[p]; k[p] = k[i]; k[i] = tk; const tv = vv[p]; vv[p] = vv[i]; vv[i] = tv; i = p;
  }
}
export function hpop(nav) {
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
      const tk = k[m]; k[m] = k[i]; k[i] = tk; const tv = vv[m]; vv[m] = vv[i]; vv[i] = tv; i = m;
    }
  }
  return top;
}
const DX = [1, -1, 0, 0, 1, 1, -1, -1], DZ = [0, 0, 1, -1, 1, -1, 1, -1], DC = [1, 1, 1, 1, 1.414, 1.414, 1.414, 1.414];

// returns an array of {x,z} waypoints (string-pulled) with .blocker (enemy bld id the route runs into, 0 if none) and .partial
export function astarGround(nav, st, team, sx, sz, gx, gz, o = {}) {
  const avoid = !!o.avoidWalls, maxExp = o.maxExp || 7000, tc = teamCost(nav, st, team, avoid);
  let s = cellOf(sx, sz), g = cellOf(gx, gz);
  if (cellCost(nav, st, s, team, avoid) < 0) s = nearestOpen(nav, st, s, team, avoid);
  if (cellCost(nav, st, g, team, avoid) < 0) g = nearestOpen(nav, st, g, team, avoid);
  const out = [];
  out.blocker = 0; out.partial = false;
  if (s === g) { out.push({ x: gx, z: gz, layer: 'ground' }); return out; }
  const gi = g % N, gj = Math.floor(g / N);
  const hfun = (idx) => {
    const dx = Math.abs((idx % N) - gi), dz = Math.abs(Math.floor(idx / N) - gj);
    return 1.35 * ((dx + dz) - 0.586 * Math.min(dx, dz));
  };
  const gen = ++nav.gen;
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
    const ci = cur % N, cj = (cur / N) | 0, cg = nav.g[cur];
    for (let d = 0; d < 8; d++) {
      const ni = ci + DX[d], nj = cj + DZ[d];
      if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
      const nb = nj * N + ni;
      if (nav.closed[nb] === gen) continue;
      const cc = tc[nb];
      if (cc < 0) continue;
      if (d >= 4) { const c1 = tc[cj * N + ni], c2 = tc[nj * N + ci]; if (c1 < 0 || c1 > 2 || c2 < 0 || c2 > 2) continue; }
      const ng = cg + DC[d] * cc;
      if (nav.stamp[nb] !== gen || ng < nav.g[nb]) {
        nav.stamp[nb] = gen; nav.g[nb] = ng; nav.from[nb] = cur;
        const h = hfun(nb);
        if (h < bestH) { bestH = h; best = nb; }
        hpush(nav, ng + h, nb);
      }
    }
  }
  nav.stats.exp += exp;
  const cells = [];
  for (let c = best; c !== -1 && c !== s; c = nav.from[c]) cells.push(c);
  cells.reverse();
  // cut at the first enemy building cell: approach point + blocker
  let cut = cells.length;
  for (let k = 0; k < cells.length; k++) {
    const c = cells[k];
    if (nav.bkind[c] === 1 || (nav.bkind[c] === 2 && !(nav.bteam[c] === team || allied(st, team, nav.bteam[c])))) { cut = k; out.blocker = nav.bld[c]; break; }
  }
  const pts = [];
  for (let k = 0; k < cut; k++) pts.push({ x: cellX(cells[k]), z: cellZ(cells[k]) });
  if (reached && !out.blocker && pts.length) pts[pts.length - 1] = { x: gx, z: gz };
  out.partial = !reached || !!out.blocker;
  let ax = sx, az = sz, i = 0;
  while (i < pts.length) {
    let far = i;
    for (let k = Math.min(pts.length - 1, i + 40); k > i; k--) if (clearLine(nav, st, team, ax, az, pts[k].x, pts[k].z, avoid)) { far = k; break; }
    out.push({ x: pts[far].x, z: pts[far].z, layer: 'ground' }); ax = pts[far].x; az = pts[far].z; i = far + 1;
  }
  return out;
}
