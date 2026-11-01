// Wall-top layer for nav.js: a graph of walkable wall pieces (walls, corners, towers, gates, gatehouses, stairs, ladders),
// links between the ground and the wall-top (stairs, ladders, gatehouse stairs, siege-tower docks), and layer-aware routing.
import { astarGround, hpush, hpop } from './nav_ground.js';

export const empty = () => ({ nodes: [], links: [], comp: [], byId: new Map() });
const operational = (b) => b.hp > 0 && (b.state === 'ready' || b.state === 'upgrading' || b.state === 'burning');
const LINK_PIECES = { stairs: 1, ladder: 1, gatehouse: 1 };

function alliedT(st, a, b) {
  if (a === b) return true;
  const ta = st.teams[a], tb = st.teams[b];
  return !!(ta && tb && ((ta.allies && ta.allies.includes(b)) || (ta.group != null && ta.group === tb.group)));
}
function segDist(a, b) { // distance between two 2D segments (end points + closest point sampling; exact enough for axis-near pieces)
  let best = 1e9;
  const ends = [[a.ax, a.az], [a.bx, a.bz], [b.ax, b.az], [b.bx, b.bz]];
  const test = (px, pz, s) => {
    const dx = s.bx - s.ax, dz = s.bz - s.az, l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((px - s.ax) * dx + (pz - s.az) * dz) / l2));
    return Math.hypot(px - (s.ax + dx * t), pz - (s.az + dz * t));
  };
  best = Math.min(test(ends[0][0], ends[0][1], b), test(ends[1][0], ends[1][1], b), test(ends[2][0], ends[2][1], a), test(ends[3][0], ends[3][1], a));
  return best;
}

export function build(st, nav) {
  const W = { nodes: [], links: [], comp: [], byId: new Map() };
  for (const b of st.blds) {
    if (!b.wall || !b.wall.walkable || !operational(b)) continue;
    const r = b.rot || 0, c = Math.cos(r), s = Math.sin(r), h = b.w / 2;
    const n = { b, id: b.id, x: b.x, z: b.z, team: b.team, hgt: b.wall.height || 4, dx: c, dz: s, ax: b.x - c * h, az: b.z - s * h, bx: b.x + c * h, bz: b.z + s * h, adj: [] };
    W.byId.set(b.id, W.nodes.length); W.nodes.push(n);
  }
  const hash = new Map();
  const key = (i, j) => i * 4096 + j;
  W.nodes.forEach((n, k) => { const kk = key(Math.floor(n.x / 8), Math.floor(n.z / 8)); (hash.get(kk) || hash.set(kk, []).get(kk)).push(k); });
  W.nodes.forEach((a, ka) => {
    const ci = Math.floor(a.x / 8), cj = Math.floor(a.z / 8);
    for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
      const lst = hash.get(key(i, j)); if (!lst) continue;
      for (const kb of lst) {
        if (kb <= ka) continue;
        const b = W.nodes[kb];
        const lad = a.b.wall.piece === 'ladder' || b.b.wall.piece === 'ladder';
        if (!lad && !alliedT(st, a.team, b.team)) continue;
        if (segDist(a, b) <= (a.b.d + b.b.d) / 2 + 0.55) { a.adj.push(kb); b.adj.push(ka); }
      }
    }
  });
  // components
  W.comp = new Array(W.nodes.length).fill(-1);
  let cid = 0;
  for (let k = 0; k < W.nodes.length; k++) {
    if (W.comp[k] >= 0) continue;
    const stack = [k]; W.comp[k] = cid;
    while (stack.length) { const q = stack.pop(); for (const m of W.nodes[q].adj) if (W.comp[m] < 0) { W.comp[m] = cid; stack.push(m); } }
    cid++;
  }
  // links ground <-> wall-top
  for (const n of W.nodes) {
    const p = n.b.wall.piece;
    if (!LINK_PIECES[p]) continue;
    const h = n.b.w / 2 + (p === 'ladder' ? 0.9 : 1.4);
    const gx = p === 'gatehouse' ? n.x : n.x - n.dx * h, gz = p === 'gatehouse' ? n.z : n.z - n.dz * h;
    W.links.push({ kind: p, team: n.team, gx, gz, node: W.byId.get(n.id), tx: n.x, tz: n.z, dx: n.dx, dz: n.dz });
  }
  for (const d of nav.dock) {
    const k = W.byId.get(d.piece);
    if (k === undefined) continue;
    W.links.push({ kind: 'dock', team: d.team, gx: d.gx, gz: d.gz, node: k, tx: W.nodes[k].x, tz: W.nodes[k].z, dx: 0, dz: 0 });
  }
  nav.wall = W;
}

const canUp = (st, l, team) => l.team === team || alliedT(st, l.team, team);
function nearestNode(W, x, z, maxD, comp) {
  let best = -1, bd = maxD;
  for (let k = 0; k < W.nodes.length; k++) {
    if (comp !== undefined && W.comp[k] !== comp) continue;
    const n = W.nodes[k];
    const d = Math.hypot(n.x - x, n.z - z) - n.b.w * 0.35;
    if (d < bd) { bd = d; best = k; }
  }
  return best;
}
// a ground unit asked to go to a point that lies on top of a friendly wall piece means "climb up there"
function nodeUnder(st, W, x, z, team) {
  for (let k = 0; k < W.nodes.length; k++) {
    const n = W.nodes[k];
    if (Math.abs(n.x - x) > 4 || Math.abs(n.z - z) > 4 || !alliedT(st, n.team, team)) continue;
    const dx = x - n.x, dz = z - n.z, lx = Math.abs(dx * n.dx + dz * n.dz), lz = Math.abs(-dx * n.dz + dz * n.dx);
    if (lx <= n.b.w / 2 + 0.2 && lz <= n.b.d / 2 + 0.2) return k;
  }
  return -1;
}
// Dijkstra over the wall-top graph; returns node index list from..to or null
function wallRoute(W, from, to) {
  if (from === to) return [from];
  const dist = new Map([[from, 0]]), prev = new Map(), done = new Set(), heap = { hk: [], hv: [] };
  const gt = W.nodes[to];
  hpush(heap, 0, from);
  while (heap.hk.length) {
    const cur = hpop(heap);
    if (done.has(cur)) continue;
    done.add(cur);
    if (cur === to) break;
    const a = W.nodes[cur];
    for (const m of a.adj) {
      if (done.has(m)) continue;
      const b = W.nodes[m], nd = dist.get(cur) + Math.hypot(a.x - b.x, a.z - b.z);
      if (nd < (dist.get(m) ?? 1e9)) { dist.set(m, nd); prev.set(m, cur); hpush(heap, nd + Math.hypot(b.x - gt.x, b.z - gt.z), m); }
    }
  }
  if (!done.has(to)) return null;
  const out = [to];
  for (let c = to; prev.has(c);) { c = prev.get(c); out.push(c); }
  return out.reverse();
}
const plen = (pts, sx, sz) => { let l = 0, x = sx, z = sz; for (const p of pts) { l += Math.hypot(p.x - x, p.z - z); x = p.x; z = p.z; } return l; };
const wpts = (W, route, skipFirst) => route.slice(skipFirst ? 1 : 0).map((k) => ({ x: W.nodes[k].x, z: W.nodes[k].z, layer: 'wall' }));
function finish(res, blocker, partial, layer) { res.blocker = blocker; res.partial = partial; res.goalLayer = layer; return res; }

export function route(st, nav, unit, sl, x, z, o) {
  const W = nav.wall, team = unit.team, sx = unit.x, sz = unit.z;
  const gopt = { avoidWalls: o.avoidWalls };
  let start = -1, goal = -1;
  if (W.nodes.length) {
    if (sl === 'wall') start = unit.wallNode !== undefined && W.nodes[W.byId.get(unit.wallNode)] ? W.byId.get(unit.wallNode) : nearestNode(W, sx, sz, 5);
    if (o.layer === 'wall' || (!o.layer && sl === 'wall')) goal = nearestNode(W, x, z, 4.5);
    if (!o.layer && sl === 'ground') goal = nodeUnder(st, W, x, z, team);
    if (o.toBld && W.byId.has(o.toBld)) goal = W.byId.get(o.toBld);
    if (o.layer === 'ground') goal = -1;
  }
  const dirG = () => { const p = astarGround(nav, st, team, sx, sz, x, z, gopt); return finish(p, p.blocker, p.partial, 'ground'); };
  if (sl === 'wall' && start < 0) { // fell off / lost: behave as ground
    const p = dirG(); return p;
  }
  if (sl === 'ground' && goal < 0) return dirG();
  if (sl === 'wall' && goal >= 0 && W.comp[start] === W.comp[goal]) {
    const r = wallRoute(W, start, goal);
    if (r) { const pts = wpts(W, r, true); pts.push({ x, z, layer: 'wall' }); return finish(pts, 0, false, 'wall'); }
  }
  if (sl === 'ground' && goal >= 0) { // ground -> wall-top through a link
    let best = null;
    const cands = W.links.filter((l) => canUp(st, l, team) && W.comp[l.node] === W.comp[goal]).map((l) => ({ l, s: Math.hypot(l.gx - sx, l.gz - sz) + Math.hypot(l.tx - x, l.tz - z) })).sort((a, b) => a.s - b.s).slice(0, 2);
    for (const c of cands) {
      const p1 = astarGround(nav, st, team, sx, sz, c.l.gx, c.l.gz, gopt);
      if (p1.partial) continue;
      const r = wallRoute(W, c.l.node, goal);
      if (!r) continue;
      const total = plen(p1, sx, sz) + c.s;
      if (!best || total < best.total) best = { total, p1, r, l: c.l };
    }
    if (best) {
      const pts = best.p1.slice();
      pts.push({ x: best.l.gx, z: best.l.gz, layer: 'ground' });
      pts.push(...wpts(W, best.r, false).map((w, i) => (i === 0 ? { ...w, climb: true } : w)));
      pts.push({ x, z, layer: 'wall' });
      return finish(pts, 0, false, 'wall');
    }
    return dirG();
  }
  // wall -> ground: walk to the best way down
  const down = W.links.filter((l) => W.comp[l.node] === W.comp[start]).map((l) => ({ l, s: Math.hypot(l.tx - sx, l.tz - sz) + Math.hypot(l.gx - x, l.gz - z) })).sort((a, b) => a.s - b.s).slice(0, 2);
  let best = null;
  for (const c of down) {
    const r = wallRoute(W, start, c.l.node); if (!r) continue;
    const p2 = astarGround(nav, st, team, c.l.gx, c.l.gz, x, z, gopt);
    const total = c.s + plen(p2, c.l.gx, c.l.gz) * 0.5 + (p2.partial ? 200 : 0);
    if (!best || total < best.total) best = { total, r, l: c.l, p2 };
  }
  if (!best) return finish([{ x, z, layer: 'ground', climb: true, fall: true }], 0, true, 'ground'); // jump down
  const pts = wpts(W, best.r, true);
  pts.push({ x: best.l.gx, z: best.l.gz, layer: 'ground', climb: true });
  pts.push(...best.p2);
  return finish(pts, best.p2.blocker, best.p2.partial, 'ground');
}

// y of a unit: ground height, plus wall height when it is on the wall-top layer (stairs ramp up along their length)
export function heightFor(st, u) {
  const g = st.world.heightAt(u.x, u.z);
  if (u.layer !== 'wall') return g;
  const W = st.nav && st.nav.wall;
  if (!W || !W.nodes.length) return g;
  let k = u.wallNode !== undefined ? W.byId.get(u.wallNode) : undefined;
  let n = k !== undefined ? W.nodes[k] : null;
  if (!n || Math.hypot(n.x - u.x, n.z - u.z) > n.b.w * 0.5 + 1.6) { k = nearestNode(W, u.x, u.z, 3.5); n = k >= 0 ? W.nodes[k] : null; }
  if (!n) return g;
  u.wallNode = n.id;
  if (n.b.wall.piece === 'stairs') {
    const t = Math.max(0, Math.min(1, ((u.x - n.x) * n.dx + (u.z - n.z) * n.dz + n.b.w / 2) / n.b.w));
    return g + n.hgt * t;
  }
  return g + n.hgt;
}
