// FLOW: coarse 4 m navigation grid + A* for rival heroes (and long monster returns). Pure sim, no DOM/Three.
const C = 4, N = 100, HALF = 200;
const cache = new WeakMap();

function build(world) {
  const open = new Uint8Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = i * C - HALF + C / 2, z = j * C - HALF + C / 2;
    let ok = world.walkable(x, z) && world.slopeAt(x, z) < 0.95;
    if (ok) for (const [dx, dz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) if (!world.walkable(x + dx, z + dz)) { ok = false; break; }
    open[j * N + i] = ok ? 1 : 0;
  }
  // components (4-neighbour flood fill)
  const comp = new Int16Array(N * N).fill(-1); let nc = 0; const sizes = [];
  for (let s = 0; s < N * N; s++) {
    if (!open[s] || comp[s] >= 0) continue;
    const stack = [s]; comp[s] = nc; let n = 0;
    while (stack.length) {
      const c = stack.pop(); n++;
      const ci = c % N, cj = (c / N) | 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = ci + di, nj = cj + dj; if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
        const nb = nj * N + ni; if (!open[nb] || comp[nb] >= 0) continue; comp[nb] = nc; stack.push(nb);
      }
    }
    sizes.push(n); nc++;
  }
  let main = 0; for (let k = 1; k < sizes.length; k++) if (sizes[k] > sizes[main]) main = k;
  return { open, comp, main, heap: null };
}
export function getNav(st) { let n = cache.get(st.world); if (!n) { n = build(st.world); cache.set(st.world, n); } return n; }
const cellOf = (x, z) => ({ i: Math.max(0, Math.min(N - 1, Math.floor((x + HALF) / C))), j: Math.max(0, Math.min(N - 1, Math.floor((z + HALF) / C))) });
const centre = (i, j) => [i * C - HALF + C / 2, j * C - HALF + C / 2];

// nearest open cell of the main land mass to (x,z)
export function snap(st, x, z, onlyMain = true) {
  const nav = getNav(st), { i, j } = cellOf(x, z);
  for (let r = 0; r < 14; r++) {
    let best = null, bd = 1e9;
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
      const k = nj * N + ni; if (!nav.open[k] || (onlyMain && nav.comp[k] !== nav.main)) continue;
      const [cx, cz] = centre(ni, nj), d = Math.hypot(cx - x, cz - z); if (d < bd) { bd = d; best = [cx, cz]; }
    }
    if (best) return best;
  }
  return null;
}

function staticHit(st, x, z, pad) {
  const l = st.grid.get(Math.floor(x / 8) * 4096 + Math.floor(z / 8)); if (!l) return false;
  for (const o of l) { if (o.t === 'c') { if (Math.hypot(x - o.x, z - o.z) < o.r + pad) return true; } else if (Math.hypot(x - o.x, z - o.z) < Math.hypot(o.w, o.d) / 2 + pad) return true; }
  return false;
}
function lineClear(world, x0, z0, x1, z1, st) {
  const d = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(d / 1.0);
  for (let k = 1; k <= n; k++) {
    const t = k / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
    if (!world.walkable(x, z) || world.slopeAt(x, z) > 0.85) return false;
    if (st && staticHit(st, x, z, 0.7)) return false;
  }
  return true;
}
export { lineClear };

// returns [[x,z],...] waypoints (not including the start), or null
function segNear(x0, z0, x1, z1, c) {
  const dx = x1 - x0, dz = z1 - z0, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((c.x - x0) * dx + (c.z - z0) * dz) / l2));
  return Math.hypot(x0 + dx * t - c.x, z0 + dz * t - c.z) < c.r;
}
export function findPath(st, x0, z0, x1, z1, avoidAll) {
  const avoid = (avoidAll || []).filter((c) => Math.hypot(c.x - x0, c.z - z0) > c.r && Math.hypot(c.x - x1, c.z - z1) > c.r);
  const hitsAvoid = (ax, az, bx, bz) => avoid.some((c) => segNear(ax, az, bx, bz, c));
  const nav = getNav(st), w = st.world;
  if (!hitsAvoid(x0, z0, x1, z1) && lineClear(w, x0, z0, x1, z1, st) && Math.hypot(x1 - x0, z1 - z0) < 40) return [[x1, z1]];
  const s = snap(st, x0, z0), g = snap(st, x1, z1);
  if (!s || !g) return null;
  const a = cellOf(s[0], s[1]), b = cellOf(g[0], g[1]);
  const start = a.j * N + a.i, goal = b.j * N + b.i;
  const gS = new Float32Array(N * N).fill(1e9), from = new Int32Array(N * N).fill(-1), closed = new Uint8Array(N * N);
  const heap = []; // [f, idx] binary heap
  const push = (f, k) => { heap.push([f, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  gS[start] = 0; push(0, start);
  let found = false, exp = 0;
  while (heap.length && exp++ < 4000) {
    const [, k] = pop(); if (closed[k]) continue; closed[k] = 1;
    if (k === goal) { found = true; break; }
    const ci = k % N, cj = (k / N) | 0, [cx, cz] = centre(ci, cj), ch = w.heightAt(cx, cz);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ni = ci + di, nj = cj + dj; if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
      const nk = nj * N + ni; if (!nav.open[nk] || closed[nk]) continue;
      if (di && dj && (!nav.open[cj * N + ni] || !nav.open[nj * N + ci])) continue;
      const [nx, nz] = centre(ni, nj), dh = Math.abs(w.heightAt(nx, nz) - ch);
      if (dh > 2.6) continue;
      let pen = 0; for (const c of avoid) { const dd = Math.hypot(nx - c.x, nz - c.z); if (dd < c.r + 4) pen += (c.r + 4 - dd) * 5; }
      const g = gS[k] + (di && dj ? 1.414 : 1) * C * (1 + dh * 0.5) + pen;
      if (g >= gS[nk]) continue;
      gS[nk] = g; from[nk] = k;
      const [tx, tz] = centre(b.i, b.j); push(g + Math.hypot(nx - tx, nz - tz), nk);
    }
  }
  if (!found) return null;
  const pts = []; for (let k = goal; k !== start && k >= 0; k = from[k]) pts.push(centre(k % N, (k / N) | 0));
  pts.reverse(); pts.push([x1, z1]);
  // string-pull: drop waypoints that are reachable in a straight line
  const out = []; let cx = x0, cz = z0, idx = 0;
  while (idx < pts.length) {
    let far = idx;
    for (let k = pts.length - 1; k > idx; k--) if (!hitsAvoid(cx, cz, pts[k][0], pts[k][1]) && lineClear(w, cx, cz, pts[k][0], pts[k][1], st)) { far = k; break; }
    out.push(pts[far]); cx = pts[far][0]; cz = pts[far][1]; idx = far + 1;
  }
  return out;
}
