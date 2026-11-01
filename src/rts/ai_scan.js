// AI lane: periodic world scan -> ai.s snapshot (own state, visible enemies, threats). Fair: enemies only count when near own units/buildings.
import { nodeRes } from './ai_info.js';

const CELL = 24;
const key = (cx, cz) => (cx + 64) * 256 + (cz + 64);
export const operational = (b) => b.state === 'ready' || b.state === 'upgrading' || b.state === 'burning';
const power = (u) => (u.hp || 0) * Math.max(1, (u.atk && u.atk.dmg) || 5) / Math.max(0.4, (u.atk && u.atk.cd) || 1);

export function scan(st, ai) {
  const id = ai.team, team = st.teams[id];
  const s = { t: st.t, team, keep: null, bl: {}, under: [], workers: [], idleW: [], mil: [], gens: [], deadGens: [], byRole: {}, gath: {}, nodeLoad: {}, queued: { mil: 0, work: 0, gen: 0 }, qBy: {},
    damaged: [], enemy: [], enemyW: [], enemyBlds: [], neutral: [], threat: null, power: 0, ePower: 0, eRoles: {}, wallPieces: 0, towers: 0 };
  const seen = new Set();
  const mark = (x, z) => { const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) seen.add(key(cx + a, cz + b)); };
  for (const b of st.blds) {
    if (b.team !== id || b.state === 'ruin') continue;
    const list = s.bl[b.type] || (s.bl[b.type] = { ready: [], build: [] });
    if (b.state === 'building') { list.build.push(b); s.under.push(b); } else if (operational(b)) list.ready.push(b);
    if (b.type === 'keep') s.keep = b;
    if (b.wall) { s.wallPieces++; if (b.wall.piece === 'tower') s.towers++; }
    else if (/tower/.test(b.type)) s.towers++;
    if (b.hp < b.maxHp * 0.75 && b.state !== 'building') s.damaged.push(b);
    if (b.queue && b.queue.length) { s.qBy[b.id] = b.queue.length; for (const e of b.queue) if (e.kind === 'unit' && s.queued[e.pcat] !== undefined) s.queued[e.pcat] += e.pcost || 0; }
    mark(b.x, b.z);
  }
  for (const gid of team.generals) { const g = st.byId.get(gid); if (g && !g.alive) s.deadGens.push(g); }
  for (const e of st.ents) {
    if (!e.alive || e.team !== id) continue;
    mark(e.x, e.z);
    if (e.role === 'worker') {
      s.workers.push(e);
      const o = e.order;
      if (!o) s.idleW.push(e);
      else if (o.type === 'gather') {
        const n = st.byId.get(o.node);
        if (n) { const r = nodeRes(n); s.gath[r] = (s.gath[r] || 0) + 1; s.nodeLoad[n.id] = (s.nodeLoad[n.id] || 0) + 1; }
      }
    } else if (e.role === 'general' || e.general) s.gens.push(e);
    else {
      s.mil.push(e); s.byRole[e.role] = (s.byRole[e.role] || 0) + 1;
      if (e.role !== 'siege') s.power += power(e);
    }
  }
  s.popFree = team.popMax - (team.pop.mil + team.pop.work + s.queued.mil + s.queued.work);
  // enemies near our stuff
  const hx = s.keep ? s.keep.x : team.base.x, hz = s.keep ? s.keep.z : team.base.z;
  s.home = { x: hx, z: hz };
  let tn = 0, tx = 0, tz = 0, tp = 0;
  for (const e of st.ents) {
    if (!e.alive || e.team === id) continue;
    if (!seen.has(key(Math.floor(e.x / CELL), Math.floor(e.z / CELL)))) continue;
    if (e.team < 0 || e.team > 3 || !st.teams[e.team]) { if (!(e.def && e.def.passive) && !/^wx_|^wild_/.test(e.type) && !(e.atk && e.atk.dmg <= 0)) s.neutral.push(e); continue; }
    if (!st.teams[e.team].alive) continue;
    s.enemy.push(e);
    s.eRoles[e.role] = (s.eRoles[e.role] || 0) + 1;
    if (e.role === 'worker') s.enemyW.push(e); else s.ePower += power(e);
    if (e.role !== 'worker' && Math.hypot(e.x - hx, e.z - hz) < 55) { tn++; tx += e.x; tz += e.z; tp += power(e); }
  }
  for (const b of st.blds) {
    if (b.team === id || b.state === 'ruin' || !st.teams[b.team] || !seen.has(key(Math.floor(b.x / CELL), Math.floor(b.z / CELL)))) continue;
    ai.knownB.add(b.id);
  }
  for (const bid of ai.knownB) { const b = st.byId.get(bid); if (!b || b.state === 'ruin') ai.knownB.delete(bid); else s.enemyBlds.push(b); }
  // threats also include enemy structures with attack inside our borders (not handled), so only units
  if (tn) s.threat = { x: tx / tn, z: tz / tn, n: tn, power: tp };
  ai.s = s;
  return s;
}
export const unitPower = power;
