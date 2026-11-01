// FOGBOUND: DOMINION territory / influence (BUILDINGS lane). Coarse 4 m grid, adapted from the warlord mode's recomputeInfluence.
// st.terr = {N, C, H, str:[Float32Array x4], owner:Int8Array (-1 none/contested), ver, dirty, cells[]}
import { def } from './bdata.js';

const H = 200, C = 4, N = 100;
export const TERR = { H, C, N };

export function ensure(st) {
  if (!st.terr) st.terr = { N, C, H, str: [0, 1, 2, 3].map(() => new Float32Array(N * N)), owner: new Int8Array(N * N).fill(-1), ver: 0, dirty: true, cells: [0, 0, 0, 0] };
  return st.terr;
}
export function markDirty(st) { ensure(st).dirty = true; }

// sites that hold influence (neutral structures captured by a team: owner>=0); radius from the neutral's `influence` or 20
function siteRadius(n) { return n.influence || 20; }

export function recompute(st) {
  const T = ensure(st);
  for (const a of T.str) a.fill(0);
  const add = (team, x, z, R) => {
    if (team < 0 || team > 3 || !(R > 0)) return;
    const i0 = Math.max(0, Math.floor((x - R + H) / C)), i1 = Math.min(N - 1, Math.floor((x + R + H) / C));
    const j0 = Math.max(0, Math.floor((z - R + H) / C)), j1 = Math.min(N - 1, Math.floor((z + R + H) / C));
    const arr = T.str[team];
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const d = Math.hypot(i * C - H + C / 2 - x, j * C - H + C / 2 - z);
      if (d < R) { const s = 1 - d / R, k = j * N + i; if (s > arr[k]) arr[k] = s; }
    }
  };
  for (const b of st.blds) {
    if (b.state === 'ruin' || b.state === 'building' || b.hp <= 0) continue;
    const r = b.influence != null ? b.influence : def(b.type).influence;
    if (r > 0) add(b.team, b.x, b.z, r);
  }
  for (const n of st.neutral || []) if (n.owner >= 0) add(n.owner, n.x, n.z, siteRadius(n));
  T.cells.fill(0);
  for (let k = 0; k < N * N; k++) {
    let best = -1, bs = 0.02, second = 0;
    for (let t = 0; t < 4; t++) {
      const s = T.str[t][k];
      if (s > bs) { second = bs > 0.02 ? bs : 0; bs = s; best = t; } else if (s > second) second = s;
    }
    const o = best >= 0 && bs - second < 0.03 && second > 0.02 ? -1 : best;
    T.owner[k] = o;
    if (o >= 0) T.cells[o]++;
  }
  T.ver++; T.dirty = false;
}
export function update(st) { const T = ensure(st); if (T.dirty) recompute(st); }

const cell = (v) => Math.max(0, Math.min(N - 1, Math.floor((v + H) / C)));
// owner team of the point (-1 unowned/contested)
export function ownerAt(st, x, z) { const T = ensure(st); if (T.dirty) recompute(st); return T.owner[cell(z) * N + cell(x)]; }
// influence strength 0-1 of one team at a point
export function strengthAt(st, team, x, z) { const T = ensure(st); if (T.dirty) recompute(st); return T.str[team][cell(z) * N + cell(x)]; }
// Buildings.influenceAt: {owner, str[4]}
export function influenceAt(st, x, z) {
  const T = ensure(st); if (T.dirty) recompute(st);
  const k = cell(z) * N + cell(x);
  return { owner: T.owner[k], str: [T.str[0][k], T.str[1][k], T.str[2][k], T.str[3][k]] };
}
export function cellsOwned(st, team) { const T = ensure(st); if (T.dirty) recompute(st); return T.cells[team] || 0; }
