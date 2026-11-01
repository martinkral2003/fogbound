// AI lane: worker management - node choice balancing the 5 resources, drop-off buildings near nodes, repair, market trade.
import { nodeRes, nodeLeft, bdef } from './ai_info.js';
import { tryBuild, cnt, canBuild } from './ai_build.js';

const STOCK = { timber: 500, stone: 420, gold: 420, blood: 350 };
const DROP = { timber: 'storehouse', stone: 'storehouse', blood: 'granary', gold: 'tithe_house' };

function weights(ai, s) {
  const m = s.t / 60, r = s.team.res;
  const base = m < 1.5 ? { timber: 5, stone: 1.2, gold: 2.5, blood: 1.5 } : { timber: 3, stone: 3, gold: 4.2, blood: 1.5 };
  const w = {};
  for (const k in base) w[k] = base[k] * Math.max(0.25, Math.min(1.7, 1.7 - (r[k] || 0) / STOCK[k]));
  if (r.blood > 700) w.blood *= 0.25; if (r.timber > 900) w.timber *= 0.4;
  // blood upkeep: when it trends low we need more
  if (s.team.pop.mil > 10 && r.blood < 150) w.blood *= 1.6;
  if ((r.gold || 0) < 60) w.gold *= 2.2; // gold buys workers and soldiers: never starve
  return w;
}
const ownedNear = (s, n, r) => { for (const type in s.bl) for (const b of s.bl[type].ready) if (Math.hypot(b.x - n.x, b.z - n.z) < r) return true; return false; };
// candidate gather sources: world nodes + own ready farms
function sources(st, ai) {
  const s = ai.s, out = [];
  const id = ai.team;
  for (const n of st.nodes) {
    if (n.infinite || n.depleted || nodeLeft(n) < 1 || !n.slots || st.t - (ai.badNode[n.id] ?? -999) < 45) continue;
    if (n.region !== undefined && n.region !== -1 && n.region !== id && !n.contested) continue; // someone else's home region
    if (n.dangerTeam !== undefined && n.dangerTeam !== id && n.dangerTeam >= 0 && st.t - (n.dangerT || 0) < 30) continue;
    if (Math.hypot(n.x - s.home.x, n.z - s.home.z) > 62 && !ownedNear(s, n, 26)) continue; // far nodes only behind an outpost
    out.push(n);
  }
  for (const type in s.bl) if (/farm/.test(type)) for (const b of s.bl[type].ready) out.push({ id: b.id, x: b.x, z: b.z, res: 'blood', slots: 5, workers: 0, farm: true });
  return out;
}
function storageDist(s, st, ai, n, res) {
  let best = 1e9;
  for (const type in s.bl) {
    const d = bdef(type);
    if (!d || !(d.store || []).includes(res)) continue;
    for (const b of s.bl[type].ready) best = Math.min(best, Math.hypot(b.x - n.x, b.z - n.z));
  }
  return best;
}
// workers on a node with foes near it are pulled off and the node is avoided for a while
function danger(st, ai) {
  const s = ai.s;
  if (!s.neutral.length && !s.enemy.length) return;
  const foes = s.neutral.concat(s.enemy.filter((e) => e.role !== 'worker'));
  const seen = new Set();
  for (const u of s.workers) {
    const o = u.order;
    if (!o || o.type !== 'gather' || seen.has(o.node)) continue;
    seen.add(o.node);
    const n = st.byId.get(o.node);
    if (!n || n.kind === 'bld') continue;
    if (foes.some((f) => Math.hypot(f.x - n.x, f.z - n.z) < 24) && Math.hypot(n.x - s.home.x, n.z - s.home.z) > 28) {
      ai.badNode[n.id] = st.t;
      if (n.res === 'gold' || Math.hypot(n.x - s.home.x, n.z - s.home.z) < 55) { const nf = s.neutral.filter((f) => Math.hypot(f.x - n.x, f.z - n.z) < 24); if (nf.length) ai.clearReq = { x: n.x, z: n.z, t: st.t, n: nf.length }; }
    }
  }
  for (const u of s.workers) { const o = u.order; if (o && o.type === 'gather' && st.t - (ai.badNode[o.node] ?? -999) < 40 && !s.idleW.includes(u)) s.idleW.push(u); }
}
export function assign(st, ai, cmds, maxN = 6) {
  const s = ai.s, W = s.workers.length;
  if (!W) return;
  danger(st, ai);
  const w = weights(ai, s), src = sources(st, ai), load = { ...s.nodeLoad }, gath = { ...s.gath };
  const sd = (ai.sdCache && st.t - ai.sdCache.t < 8) ? ai.sdCache.m : (ai.sdCache = { t: st.t, m: new Map() }).m;
  let tot = 0; for (const k in w) tot += w[k];
  const idle = s.idleW.filter((u) => !ai.busy.has(u.id)).slice(0, maxN);
  const moved = {};
  // rebalance: one non-idle worker from the most over-supplied resource to the neediest, rarely
  if (!idle.length && st.t - (ai.lastRebal || 0) > 5 && W >= 8) {
    ai.lastRebal = st.t;
    let over = null, under = null, ov = 0.8, un = -1.0;
    for (const k in w) { const diff = (gath[k] || 0) - (w[k] / tot) * W; if (diff > ov) { ov = diff; over = k; } if (diff < un) { un = diff; under = k; } }
    if (over && under) {
      const u = s.workers.find((q) => q.order && q.order.type === 'gather' && !ai.busy.has(q.id) && (() => { const n = st.byId.get(q.order.node); return n && nodeRes(n) === over && !(q.carry && q.carry.amt > 5); })());
      if (u) { idle.push(u); gath[over]--; }
    }
  }
  for (const u of idle) {
    let bestR = null, bs = -1e9;
    for (const k in w) {
      const deficit = (w[k] / tot) * W - (gath[k] || 0);
      if (deficit > bs && src.some((n) => n.res === k && Math.max(n.workers || 0, load[n.id] || 0) < n.slots)) { bs = deficit; bestR = k; }
    }
    if (!bestR) bestR = src.length ? nodeRes(src[0]) : null;
    if (!bestR) continue;
    let best = null, bsc = 1e9;
    for (const n of src) {
      if (n.res !== bestR) continue;
      const l = Math.max(n.workers || 0, load[n.id] || 0);
      if (l >= n.slots) continue;
      let d = sd.get(n.id + bestR);
      if (d === undefined) { d = storageDist(s, st, ai, n, bestR); sd.set(n.id + bestR, d); }
      const sc = Math.hypot(n.x - u.x, n.z - u.z) * 0.6 + Math.min(d, 90) * 1.5 + l * 4 + (d > 38 ? 60 : 0);
      if (sc < bsc) { bsc = sc; best = n; }
    }
    if (!best) continue;
    load[best.id] = (load[best.id] || 0) + 1; gath[bestR] = (gath[bestR] || 0) + 1;
    (moved[best.id] || (moved[best.id] = { n: best, ids: [] })).ids.push(u.id);
  }
  for (const k of Object.keys(moved)) cmds.push({ t: 'order', ids: moved[k].ids, order: { type: 'gather', node: moved[k].n.id } });
}
// storehouse / granary / tithe house next to nodes that are far from any drop-off
export function dropoffs(st, ai, cmds) {
  const s = ai.s;
  if (st.t - (ai.lastDrop || 0) < 12 || s.under.length > 3) return;
  const sd = new Map();
  let target = null, tr = null, worst = 0;
  for (const n of st.nodes) {
    if (n.infinite || n.depleted || !n.slots) continue;
    const res = nodeRes(n), ty = DROP[res];
    if (!ty || !canBuild(st, ai, ty)) continue;
    if ((s.nodeLoad[n.id] || 0) < 2 && !(res === 'gold' && Math.hypot(n.x - s.home.x, n.z - s.home.z) < 120 && n.region === ai.team)) continue;
    const d = storageDist(s, st, ai, n, res);
    if (d > 20 && d > worst) { worst = d; target = n; tr = ty; }
  }
  if (!target) return;
  ai.lastDrop = st.t;
  const a = Math.atan2(s.home.z - target.z, s.home.x - target.x);
  if (!tryBuild(st, ai, cmds, tr, { at: { x: target.x, z: target.z, r0: 6, r1: 18, pref: a, spread: 2.4, tries: 120 }, n: 2, nearNode: true })) ai.lastDrop = st.t - 8;
}
export function repairs(st, ai, cmds) {
  const s = ai.s;
  if (!s.damaged.length || s.threat) return;
  const idle = s.idleW.filter((u) => !ai.busy.has(u.id));
  if (idle.length < 1) return;
  const b = s.damaged.reduce((a, c) => (a.hp / a.maxHp < c.hp / c.maxHp ? a : c));
  const ids = idle.slice(0, 3).map((u) => u.id);
  for (const id of ids) ai.busy.add(id);
  cmds.push({ t: 'repair', ids, bld: b.id });
}
export function trade(st, ai, cmds) {
  const s = ai.s, r = s.team.res;
  if (!s.bl.market || !s.bl.market.ready.length || st.t - (ai.lastTrade || 0) < 12) return;
  const want = ['gold', 'stone', 'timber'].filter((k) => r[k] < 150).sort((a, b) => r[a] - r[b])[0];
  const give = ['blood', 'timber', 'stone', 'gold'].filter((k) => k !== want && r[k] > (k === 'blood' ? 650 : 900)).sort((a, b) => r[b] - r[a])[0];
  if (want && give) { ai.lastTrade = st.t; cmds.push({ t: 'trade', give, get: want, amount: Math.min(400, Math.floor(r[give] - (give === "blood" ? 450 : 600))) }); }
}
export { cnt };
