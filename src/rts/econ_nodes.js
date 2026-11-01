// ECON lane: resource node placement (fair per start region), regrowth and lookup helpers.
import * as Nav from './nav.js';
import { NODE_TYPES, REGION_SITES, CONTESTED_SITES, MINE_AMOUNT, NEUTRAL_LIMITS } from './econ_data.js';

const pass = (st, x, z) => st.world.walkable(x, z) && (typeof Nav.passable !== 'function' || Nav.passable(st, 0, x, z));
// 2 m flood fill of walkable ground from the first stronghold: nodes are only placed where workers can walk to
function reachGrid(st) {
  if (st._econReach) return st._econReach;
  const w = st.world, N = 200, g = new Uint8Array(N * N), key = (x, z) => Math.min(N - 1, Math.max(0, Math.round((z + 200) / 2))) * N + Math.min(N - 1, Math.max(0, Math.round((x + 200) / 2)));
  const q = [[w.hearts[0].x, w.hearts[0].z]]; g[key(q[0][0], q[0][1])] = 1;
  while (q.length) {
    const [x, z] = q.pop();
    for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) { const nx = x + dx, nz = z + dz, k = key(nx, nz); if (!g[k] && pass(st, nx, nz)) { g[k] = 1; q.push([nx, nz]); } }
  }
  return (st._econReach = { g, key });
}
function okSpot(st, x, z, minNode = 7) {
  const w = st.world;
  if (Math.abs(x) > 188 || Math.abs(z) > 188) return false;
  const rg = reachGrid(st); if (!rg.g[rg.key(x, z)]) return false;
  for (const [dx, dz] of [[0, 0], [2.5, 0], [-2.5, 0], [0, 2.5], [0, -2.5]]) if (!pass(st, x + dx, z + dz)) return false;
  for (const h of w.hearts) if (Math.hypot(x - h.x, z - h.z) < 15) return false;
  for (const n of st.nodes) if (Math.hypot(x - n.x, z - n.z) < minNode) return false;
  return true;
}
// spiral search for the nearest acceptable spot, optionally pulled toward prop `pts` first
function settle(st, x, z, pts, maxR = 22) {
  if (pts && pts.length) {
    let best = null, bd = 1e9;
    for (const p of pts) { const d = Math.hypot(p.x - x, p.z - z); if (d < 8 && d < bd && okSpot(st, p.x, p.z)) { bd = d; best = p; } }
    if (best) return { x: best.x, z: best.z, cluster: best };
  }
  if (okSpot(st, x, z)) return { x, z };
  for (let r = 3; r <= maxR; r += 3) {
    const n = Math.max(8, Math.round(r * 1.6));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (okSpot(st, px, pz)) return { x: px, z: pz };
    }
  }
  return null;
}
export function makeNode(st, rtype, x, z, amount, extra = {}) {
  const d = NODE_TYPES[rtype];
  const n = {
    id: st.nextId++, kind: 'node', rtype, res: d.res, name: d.name, amount, max: amount, x, z, y: st.world.heightAt(x, z), r: d.r,
    regrow: d.regrow, slots: d.slots, workers: 0, owner: -1, infinite: !!d.infinite, ...extra,
  };
  st.nodes.push(n); st.byId.set(n.id, n);
  return n;
}
// cluster props of given types in cell grid -> [{x,z,n}] (centroid, count), strongest first
function clusters(props, types, cell) {
  const m = new Map();
  for (const p of props) {
    if (!types.includes(p.t)) continue;
    const k = Math.floor(p.x / cell) + ',' + Math.floor(p.z / cell);
    let c = m.get(k); if (!c) m.set(k, c = { sx: 0, sz: 0, n: 0 });
    c.sx += p.x; c.sz += p.z; c.n++;
  }
  return [...m.values()].map((c) => ({ x: c.sx / c.n, z: c.sz / c.n, n: c.n })).sort((a, b) => b.n - a.n || a.x - b.x || a.z - b.z);
}
export function populateNodes(st) {
  const w = st.world;
  st.nodes.length = 0;
  const treeCl = clusters(w.props, ['deadtree', 'pine'], 14), cragCl = clusters(w.props, ['crag', 'rock'], 14), graveCl = clusters(w.props, ['grave'], 12);
  // 1) world gold mines (mine features keep their tier); obelisks / temple belong to the WORLD lane
  for (const f of w.features.nodes) if (f.type === 'mine') {
    const home = w.hearts.reduce((b, h, i) => (Math.hypot(f.x - h.x, f.z - h.z) < b.d ? { d: Math.hypot(f.x - h.x, f.z - h.z), i } : b), { d: 1e9, i: -1 });
    makeNode(st, 'mine', f.x, f.z, MINE_AMOUNT[f.tier || 1] || 4000, { tier: f.tier || 1, region: f.tier >= 3 ? -1 : home.i, contested: f.tier >= 3 });
  }
  // 2) per-region sites, laid out relative to each heart so all four lords get the same set
  const place = (list, contested) => {
    for (let ri = 0; ri < w.hearts.length; ri++) {
      const h = w.hearts[ri], ax = Math.atan2(-h.z, -h.x);
      for (const s of list) {
        const a = ax + s.ang, tx = h.x + Math.cos(a) * s.dist, tz = h.z + Math.sin(a) * s.dist;
        const cl = s.rtype === 'tree' ? treeCl : s.rtype === 'quarry' ? cragCl : null;
        const sp = settle(st, tx, tz, cl);
        if (!sp) continue;
        makeNode(st, s.rtype, sp.x, sp.z, s.amount, { region: contested ? -1 : ri, contested: !!contested, home: ri, dist: Math.hypot(sp.x - h.x, sp.z - h.z) });
      }
    }
  };
  place(REGION_SITES, false);
  place(CONTESTED_SITES, true);
  // 3) neutral extras from prop clusters (groves, crag outcrops, graveyards) away from hearts and existing nodes
  const far = (c, d) => w.hearts.every((h) => Math.hypot(c.x - h.x, c.z - h.z) > d) && st.nodes.every((n) => Math.hypot(c.x - n.x, c.z - n.z) > NEUTRAL_LIMITS.minSep);
  let k = 0;
  for (const c of treeCl) { if (k >= NEUTRAL_LIMITS.grove || c.n < 5) break; if (!far(c, 38)) continue; const sp = settle(st, c.x, c.z, null, 8); if (!sp) continue; makeNode(st, 'tree', sp.x, sp.z, Math.min(1800, 500 + c.n * 70), { region: -1, wild: true }); k++; }
  k = 0;
  for (const c of cragCl) { if (k >= NEUTRAL_LIMITS.quarry || c.n < 6) break; if (!far(c, 50)) continue; const sp = settle(st, c.x, c.z, null, 8); if (!sp) continue; makeNode(st, 'quarry', sp.x, sp.z, Math.min(2600, 900 + c.n * 60), { region: -1, wild: true }); k++; }
  k = 0;
  for (const c of graveCl) { if (k >= NEUTRAL_LIMITS.graveyard || c.n < 3) break; if (!far(c, 28)) continue; makeNode(st, 'graveyard', c.x, c.z, 1, { region: -1, wild: true }); k++; }
  // keep ids deterministic and positions snapped to terrain
  for (const n of st.nodes) n.y = w.heightAt(n.x, n.z);
  return st.nodes;
}
export function nodeSlotsFree(n) { return n.infinite || n.workers < n.slots; }
export function nodeUsable(n) { return n && !n.depleted && (n.infinite || n.amount > 0.5); }
// nearest usable node of resource `res` (or specific rtype) from (x,z); respects free slots unless ignoreSlots
export function findNode(st, x, z, res, opts = {}) {
  let best = null, bd = 1e9;
  for (const n of st.nodes) {
    if (n.res !== res || n.infinite || !nodeUsable(n)) continue;
    if (opts.rtype && n.rtype !== opts.rtype) continue;
    if (n.dangerT > st.t && n !== opts.prefer) continue;
    if (!opts.ignoreSlots && n.workers >= n.slots && n !== opts.prefer) continue;
    if (opts.maxDist && Math.hypot(n.x - x, n.z - z) > opts.maxDist) continue;
    const d = Math.hypot(n.x - x, n.z - z) + n.workers * 2.5 + (opts.avoidTeam != null && n.dangerTeam === opts.avoidTeam ? 40 : 0);
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}
// regrowth + depletion bookkeeping, called by Econ.update every tick
export function updateNodes(st, dt) {
  for (const n of st.nodes) {
    if (n.infinite) continue;
    if (n.regrow > 0 && n.amount < n.max) {
      n.amount = Math.min(n.max, n.amount + n.regrow * dt);
      if (n.depleted && n.amount >= Math.min(40, n.max * 0.1)) n.depleted = false;
    }
    if (n.amount <= 0.5 && !n.depleted) { n.amount = 0; n.depleted = true; }
  }
}
