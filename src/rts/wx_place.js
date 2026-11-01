// WORLD lane: fair (4-fold rotational) site placement with walkability + reachability checks. Pure, deterministic.
import { TEMPLATES, MIN_SEP, HEART_CLEAR, TEMPLE_CLEAR, SITE_R } from './world_data.js';

export const rotK = (x, z, k) => { for (let i = 0; i < k; i++) { const t = x; x = -z; z = t; } return [x, z]; };

// 2 m flood fill from heart 0 over world.walkable; returns a predicate
export function reachMap(st) {
  const w = st.world, N = 200, H = 200, seen = new Uint8Array(N * N);
  const cx = (x) => Math.max(0, Math.min(N - 1, Math.floor((x + H) / 2)));
  const h0 = w.hearts[0];
  let sx = cx(h0.x + 6), sz = cx(h0.z + 6);
  const q = [sz * N + sx]; seen[q[0]] = 1;
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi] % N, j = (q[qi] / N) | 0;
    for (let d = 0; d < 4; d++) {
      const ni = i + (d === 0) - (d === 1), nj = j + (d === 2) - (d === 3);
      if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
      const k = nj * N + ni;
      if (seen[k] || !w.walkable(ni * 2 - H + 1, nj * 2 - H + 1)) continue;
      seen[k] = 1; q.push(k);
    }
  }
  return (x, z) => { const i = Math.floor((x + H) / 2), j = Math.floor((z + H) / 2); return i >= 0 && j >= 0 && i < N && j < N && seen[j * N + i] === 1; };
}

export function spotOk(st, reach, x, z, pad, ring, relaxed) {
  const w = st.world;
  if (Math.abs(x) > 184 || Math.abs(z) > 184) return false;
  if (!reach(x, z)) return false;
  for (const [dx, dz] of [[0, 0], [pad, 0], [-pad, 0], [0, pad], [0, -pad]]) if (!w.walkable(x + dx, z + dz)) return false;
  if (w.heightAt(x, z) < 0.9 || w.slopeAt(x, z) > (relaxed ? 0.85 : 0.5)) return false;
  for (const h of w.hearts) if (Math.hypot(x - h.x, z - h.z) < HEART_CLEAR) return false;
  const dc = Math.hypot(x, z);
  if (ring !== 'far' && ring !== 'axis' && dc < TEMPLE_CLEAR + 10) return false;
  if (dc < TEMPLE_CLEAR) return false;
  for (const n of st.nodes) if (Math.hypot(x - n.x, z - n.z) < 8) return false;
  for (const c of w.features.camps) if (Math.hypot(x - c.x, z - c.z) < 11) return false;
  return true;
}

// returns { sites: [{ti, k, x, z}] } placing every template 4 times (once per team frame), identical relative layout
export function placeAll(st, reach) {
  const placed = [];
  const clash = (x, z) => { for (const p of placed) if (Math.hypot(x - p.x, z - p.z) < MIN_SEP + (SITE_R[p.kind] || 5) * 0.5) return true; return false; };
  for (let ti = 0; ti < TEMPLATES.length; ti++) {
    const t = TEMPLATES[ti];
    if (t.kind === 'caravan') continue; // caravans are derived from village sites
    const pad = Math.min(3, (SITE_R[t.kind] || 4) * 0.4);
    let best = null, bestScore = 1e9;
    let relaxed = false;
    const tryAt = (x, z) => {
      const pts = [];
      for (let k = 0; k < 4; k++) {
        const [px, pz] = rotK(x, z, k);
        if (!spotOk(st, reach, px, pz, pad, t.ring, relaxed) || clash(px, pz)) return null;
        pts.push({ ti, k, kind: t.kind, x: px, z: pz });
      }
      for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) if (Math.hypot(pts[a].x - pts[b].x, pts[a].z - pts[b].z) < MIN_SEP) return null;
      return pts;
    };
    for (let pass = 0; pass < 2 && !best; pass++) {
    relaxed = pass === 1;
    for (let R = 0; R <= t.rad * (relaxed ? 4 : 2.2) && (!best || t.hill); R += 3) {
      const n = R === 0 ? 1 : Math.max(8, Math.round(R * 1.4));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + R * 0.7, x = t.x + Math.cos(a) * R, z = t.z + Math.sin(a) * R;
        const pts = tryAt(x, z);
        if (!pts) continue;
        const score = t.hill ? -st.world.heightAt(x, z) : R;
        if (score < bestScore) { bestScore = score; best = pts; }
        if (!t.hill) break;
      }
      if (best && !t.hill) break;
      if (t.hill && best && R > t.rad) break;
    }
    }
    if (best) for (const p of best) placed.push(p);
  }
  return placed;
}
