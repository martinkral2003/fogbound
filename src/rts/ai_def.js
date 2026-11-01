// AI lane: defence - wall ring with gates + towers (buildline), rebuild after breaches, wall upgrades, tower mix, garrison archers, alert state.
import { bdef, affordable, has, breaches } from './ai_info.js';
import { cnt, tryBuild, canBuild, pay } from './ai_build.js';
import { RES } from './consts.js';
import * as Walls from './walls.js';

const SEG = 3.9;
// our own ring generator (same geometry as Walls.ring); returns [{type,x,z,rot}]
function ringPieces(ai, cx, cz, r, towerType, wallType) {
  const n = Math.max(8, Math.round(6.2832 * r / SEG)), out = [];
  const g1 = Math.atan2(-cz, -cx), g2 = ai.gate2 ?? g1 + Math.PI * 0.5;
  const near = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  let i1 = 0, i2 = 0, b1 = 9, b2 = 9;
  for (let i = 0; i < n; i++) {
    const a = g1 + (i / n) * 6.2832;
    if (near(a, g1) < b1) { b1 = near(a, g1); i1 = i; }
    if (near(a, g2) < b2) { b2 = near(a, g2); i2 = i; }
  }
  for (let i = 0; i < n; i++) {
    const a = g1 + (i / n) * 6.2832;
    let t = wallType;
    if (i === i1 || i === i2) t = 'gate';
    else if (towerType && i % 8 === 4) t = towerType;
    out.push({ type: t, x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, rot: a + Math.PI / 2 });
  }
  return out;
}
function pieceCost(p) { const d = bdef(p.type); return (d && d.cost) || {}; }
function wallDefsReady() { return !!(bdef('wall') && bdef('gate') && bdef('palisade')); }

export function startWall(st, ai) {
  const s = ai.s, h = s.home;
  // second gate faces the nearest own-region resource cluster
  let best = null, bd = 1e9;
  for (const n of st.nodes) if (n.region === ai.team && n.res !== 'souls') { const d = Math.hypot(n.x - h.x, n.z - h.z); if (d < bd) { bd = d; best = n; } }
  ai.gate2 = best ? Math.atan2(best.z - h.z, best.x - h.x) : undefined;
  const R = ai.wallR || 30;
  const wallType = 'palisade';
  const pieces = ringPieces(ai, h.x, h.z, R, canBuild(st, ai, 'tower') ? 'tower' : null, wallType).filter((p) => st.world.walkable(p.x, p.z));
  // front (toward the map centre) first
  const toC = Math.atan2(-h.z, -h.x);
  pieces.sort((a, b) => Math.abs(angDiff(Math.atan2(a.z - h.z, a.x - h.x), toC)) - Math.abs(angDiff(Math.atan2(b.z - h.z, b.x - h.x), toC)));
  ai.wall = { pieces: pieces.map((p) => ({ ...p, tries: 0, done: false })), t: st.t, upgraded: 0 };
}
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

function wallBlds(s, st, ai) {
  if (ai.wbCache && st.t - ai.wbCache.t < 2.5) return ai.wbCache.list;
  const list = st.blds.filter((b) => b.team === ai.team && b.wall && b.state !== 'ruin');
  ai.wbCache = { t: st.t, list };
  return list;
}
function refreshPieces(st, ai) {
  const W = ai.wall, list = wallBlds(ai.s, st, ai);
  for (const p of W.pieces) {
    p.done = list.some((b) => Math.abs(b.x - p.x) < 1.8 && Math.abs(b.z - p.z) < 1.8);
  }
}
export function build(st, ai, cmds) {
  const s = ai.s, P = ai.P, m = s.t / 60;
  if (!wallDefsReady()) return;
  const wantWall = s.workers.length >= 12 && ready1(s, 'barracks') && s.t > P.wallAt * ai.D.delay * 0.9 && s.team.pop.mil >= 4 + (P.wallAt > 400 ? 6 : 0);
  if (wantWall && !ai.wall && st.t > 30) startWall(st, ai);
  if (ai.wall && st.t - (ai.lastWall || 0) > 4) {
    ai.lastWall = st.t;
    refreshPieces(st, ai);
    const todo = ai.wall.pieces.filter((p) => !p.done && p.tries < 3);
    if (todo.length) {
      // as many as the budget allows, in chunks (rebuilds after a breach come back here automatically)
      const chunk = [], c = {};
      for (const p of todo) {
        const pc = pieceCost(p);
        const need = { ...c }; for (const k of RES) need[k] = (need[k] || 0) + (pc[k] || 0);
        if (!affordable({ res: ai.bud }, need)) break;
        Object.assign(c, need); chunk.push(p);
        if (chunk.length >= 24) break;
      }
      const ws = s.workers.filter((u) => !ai.busy.has(u.id) && (!u.order || u.order.type === 'gather')).slice(0, 5);
      if (chunk.length >= Math.min(4, todo.length) && ws.length) {
        for (const k of RES) ai.bud[k] -= c[k] || 0;
        for (const p of chunk) p.tries++;
        for (const u of ws) ai.busy.add(u.id);
        cmds.push({ t: 'buildline', pieces: chunk.map((p) => ({ type: p.type, x: p.x, z: p.z, rot: p.rot })), workers: ws.map((u) => u.id) });
      }
    } else if (st.t - (ai.lastWallUp || 0) > 25 && s.team.res.stone > 250) {
      // upgrade palisades -> stone (cheap per piece)
      const ids = wallBlds(s, st, ai).filter((b) => b.wall.piece === 'palisade' && b.state === 'ready' && !b.wall.upT).slice(0, 12).map((b) => b.id);
      if (ids.length) { ai.lastWallUp = st.t; cmds.push({ t: 'wallUpgrade', ids, tier: 1 }); }
    }
  }
  towers(st, ai, cmds);
  garrison(st, ai, cmds);
}
const ready1 = (s, t) => s.bl[t] && s.bl[t].ready.length > 0;
// extra towers behind the wall line, mix by availability: arrow first, then cannon / magic / ballista
function towers(st, ai, cmds) {
  const s = ai.s, P = ai.P, h = s.home;
  if (st.t - (ai.lastTower || 0) < 14 || s.towers >= P.towers + Math.floor(s.t / 240) || s.workers.length < 12 || s.under.length > 3) return;
  const order = ['arrow_tower', 'cannon_tower', 'magic_tower', 'ballista_tower'];
  const counts = order.map((ty) => cnt(s, ty));
  // pick the available type with the lowest count weighted by preference
  let pick = null, best = 1e9;
  order.forEach((ty, i) => { if (canBuild(st, ai, ty) && counts[i] + i * 0.8 < best) { best = counts[i] + i * 0.8; pick = ty; } });
  if (!pick || s.team.pop.mil < 3) return;
  ai.lastTower = st.t;
  const toC = Math.atan2(-h.z, -h.x), R = ai.wallR || 30;
  const a = toC + (st.rng() * 2 - 1) * 1.5;
  tryBuild(st, ai, cmds, pick, { at: { r0: R - 7, r1: R - 3, pref: a, spread: 0.3 }, n: 2 });
}
// archers into towers lacking a garrison
function garrison(st, ai, cmds) {
  const s = ai.s;
  if (st.t - (ai.lastGar || 0) < 10 || s.byRole.ranged < 6) return;
  ai.lastGar = st.t;
  const idle = s.mil.filter((u) => u.role === 'ranged' && !u.garrison && (!u.order || u.order.type === 'hold') && Math.hypot(u.x - s.home.x, u.z - s.home.z) < 45);
  if (idle.length < 4) return;
  for (const type in s.bl) {
    const d = bdef(type);
    if (!d || !d.turret || !(d.garrison > 0)) continue;
    for (const b of s.bl[type].ready) {
      if (idle.length < 3) return;
      if ((b.garrison || []).length >= 2) continue;
      const g = idle.splice(0, 2);
      cmds.push({ t: 'garrison', ids: g.map((u) => u.id), bld: b.id });
    }
  }
}
// threat response state; the army module reads ai.alert
export function react(st, ai, cmds) {
  const s = ai.s;
  if (s.threat) {
    const a = ai.alert;
    ai.alert = { x: s.threat.x, z: s.threat.z, n: s.threat.n, power: s.threat.power, t: a ? a.t : st.t, last: st.t };
    if (!a || st.t - a.last > 20) ai.log.push([Math.round(st.t), 'alert', s.threat.n]);
  } else if (ai.alert && st.t - ai.alert.last > 12) ai.alert = null;
  // workers near the fight keep working unless the econ lane makes them flee; rebuild breaches is handled by the piece list
  if (has(Walls, 'breaches') && ai.wall && st.t - (ai.lastBreach || 0) > 20) {
    ai.lastBreach = st.t;
    const br = breaches(st, ai.team);
    ai.breachCount = br ? br.filter((b) => b.kind === 'gap').length : 0;
    if (ai.breachCount) for (const p of ai.wall.pieces) p.tries = Math.min(p.tries, 1);
  }
}
export { pay };
