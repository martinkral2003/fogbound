// UNITS lane: spatial hash for units (rebuilt once per tick) and buildings (rebuilt when the building count changes / every 3 s). No sim imports.
const CS = 8, N = 60, OFF = 240;          // 8 m cells, covers +-240 m
const BCS = 16, BN = 30;                  // 16 m cells for buildings
const ci = (v, cs, n) => { const i = Math.floor((v + OFF) / cs); return i < 0 ? 0 : i >= n ? n - 1 : i; };

export function unitGrid(st) {
  let g = st._ug;
  if (!g) g = st._ug = { cells: Array.from({ length: N * N }, () => []), used: [], tick: -1, n: -1 };
  if (g.tick === st.tick && g.n === st.ents.length) return g;
  for (const i of g.used) g.cells[i].length = 0;
  g.used.length = 0;
  for (const e of st.ents) {
    if (!e.alive || e.garrison) continue;
    const i = ci(e.z, CS, N) * N + ci(e.x, CS, N), c = g.cells[i];
    if (!c.length) g.used.push(i);
    c.push(e);
  }
  g.tick = st.tick; g.n = st.ents.length;
  return g;
}
// callback form (no allocation). fn(e) for alive units within r of x,z; return true from fn to stop.
export function forNear(st, x, z, r, fn) {
  const g = unitGrid(st), r2 = r * r;
  const x0 = ci(x - r, CS, N), x1 = ci(x + r, CS, N), z0 = ci(z - r, CS, N), z1 = ci(z + r, CS, N);
  for (let j = z0; j <= z1; j++) for (let i = x0; i <= x1; i++) {
    const c = g.cells[j * N + i];
    for (let k = 0; k < c.length; k++) {
      const e = c[k];
      if (!e.alive || e.garrison) continue;
      const dx = e.x - x, dz = e.z - z;
      if (dx * dx + dz * dz <= r2 && fn(e)) return;
    }
  }
}
export function near(st, x, z, r, filter) {
  const out = [];
  forNear(st, x, z, r, (e) => { if (!filter || filter(e)) out.push(e); });
  return out;
}
export function bldGrid(st) {
  let g = st._bg;
  if (!g) g = st._bg = { cells: Array.from({ length: BN * BN }, () => []), used: [], n: -1, t: -99 };
  if (g.n === st.blds.length && st.t - g.t < 3) return g;
  for (const i of g.used) g.cells[i].length = 0;
  g.used.length = 0;
  for (const b of st.blds) {
    const rr = Math.max(b.w || 4, b.d || 4) * 0.75;
    const x0 = ci(b.x - rr, BCS, BN), x1 = ci(b.x + rr, BCS, BN), z0 = ci(b.z - rr, BCS, BN), z1 = ci(b.z + rr, BCS, BN);
    for (let j = z0; j <= z1; j++) for (let i = x0; i <= x1; i++) { const k = j * BN + i, c = g.cells[k]; if (!c.length) g.used.push(k); c.push(b); }
  }
  g.n = st.blds.length; g.t = st.t;
  return g;
}
// buildings whose footprint may touch the circle (x,z,r). fn(b); duplicates filtered with a per-call stamp.
let stamp = 1;
export function forNearBlds(st, x, z, r, fn) {
  const g = bldGrid(st), s = ++stamp;
  const x0 = ci(x - r, BCS, BN), x1 = ci(x + r, BCS, BN), z0 = ci(z - r, BCS, BN), z1 = ci(z + r, BCS, BN);
  for (let j = z0; j <= z1; j++) for (let i = x0; i <= x1; i++) {
    const c = g.cells[j * BN + i];
    for (let k = 0; k < c.length; k++) { const b = c[k]; if (b._s === s) continue; b._s = s; if (fn(b)) return; }
  }
}
// distance from point to a building's footprint (rotated rectangle), 0 if inside
export function bldDist(b, x, z) {
  const dx = x - b.x, dz = z - b.z, c = Math.cos(b.rot || 0), s = Math.sin(b.rot || 0);
  const lx = Math.abs(dx * c + dz * s), lz = Math.abs(-dx * s + dz * c);
  const ex = Math.max(0, lx - (b.w || 4) / 2), ez = Math.max(0, lz - (b.d || 4) / 2);
  return Math.hypot(ex, ez);
}
// distance between two entities edge to edge (units: radius, buildings: footprint)
export function gap(a, t) {
  if (t.kind === 'bld') return Math.max(0, bldDist(t, a.x, a.z) - (a.r || 0.5));
  return Math.max(0, Math.hypot(a.x - t.x, a.z - t.z) - (a.r || 0.5) - (t.r || 0.5));
}
