// FOGBOUND: DOMINION building placement validation (BUILDINGS lane). canPlace -> null | reason. Affordability is checked separately (Buildings.canAfford).
import { def, fkeyOf } from './bdata.js';
import * as Terr from './territory.js';
import * as Tech from './tech.js';

export const MAX_BLDS = 160; // non-wall, non-ruin buildings per team
const PTS = [[0, 0], [1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];

// oriented-box overlap (SAT); boxes {x,z,rot,w,d}; shrink m on every side so touching pieces are legal
export function obbOverlap(a, b, shrink = 0.08) {
  const ac = Math.cos(a.rot), as = Math.sin(a.rot), bc = Math.cos(b.rot), bs = Math.sin(b.rot);
  const axes = [[ac, as], [-as, ac], [bc, bs], [-bs, bc]];
  const ah = [a.w / 2 - shrink, a.d / 2 - shrink], bh = [b.w / 2 - shrink, b.d / 2 - shrink];
  const dx = b.x - a.x, dz = b.z - a.z;
  for (const [ax, az] of axes) {
    const ra = ah[0] * Math.abs(ax * ac + az * as) + ah[1] * Math.abs(-ax * as + az * ac);
    const rb = bh[0] * Math.abs(ax * bc + az * bs) + bh[1] * Math.abs(-ax * bs + az * bc);
    if (Math.abs(dx * ax + dz * az) > ra + rb) return false;
  }
  return true;
}
const countType = (st, team, pred) => { let n = 0; for (const b of st.blds) if (b.team === team && b.state !== 'ruin' && pred(b)) n++; return n; };

export function canPlace(st, teamId, type, x, z, rot = 0, opts = {}) {
  const team = st.teams[teamId], d = def(type, team);
  if (!team || !team.alive) return 'Cannot build';
  if (!d || !d.cost) return 'Unknown building';
  if (d.faction !== 'all' && d.faction !== fkeyOf(team)) return 'Not available to your faction';
  if (d.age > Tech.ageOf(team)) return 'Requires ' + Tech.AGE_NAMES[d.age];
  for (const n of d.needs) {
    if (Tech.TECHS[n]) { if (!team.tech[n]) return 'Requires ' + Tech.TECHS[n].name; }
    else if (!countType(st, teamId, (b) => b.type === n && b.state !== 'building')) return 'Requires ' + def(n, team).name;
  }
  if (d.limit && countType(st, teamId, (b) => b.type === type) >= d.limit) return def(type, team).name + ' limit reached (' + d.limit + ')';
  if (type === 'keep') { if (!opts.allowKeep) return 'Cannot build a second keep'; }
  if (!d.wall && !d.turret && countType(st, teamId, (b) => !b.wall && !b.turret) >= MAX_BLDS) return 'Building limit';
  const w = st.world;
  let hmin = 99, hmax = -99;
  const c = Math.cos(rot), s = Math.sin(rot);
  for (const [px, pz] of PTS) {
    const lx = (px * d.w) / 2, lz = (pz * d.d) / 2, wx = x + lx * c - lz * s, wz = z + lx * s + lz * c;
    if (!w.walkable(wx, wz) || w.heightAt(wx, wz) < 0.9) return 'Bad ground';
    const h = w.heightAt(wx, wz); hmin = Math.min(hmin, h); hmax = Math.max(hmax, h);
  }
  if (hmax - hmin > (d.maxSlope || (Math.max(d.w, d.d) > 6 ? 2.4 : 1.7))) return 'Too steep';
  if (!opts.noTerritory) {
    const own = Terr.ownerAt(st, x, z);
    if (own !== teamId) {
      const edgeOk = d.border && (own === -1) && Terr.strengthAt(st, teamId, x, z) > 0.02;
      if (!edgeOk) return 'Outside your territory';
    }
  }
  const probe = { x, z, rot, w: d.w, d: d.d };
  const R = Math.hypot(d.w, d.d) / 2;
  for (const b of st.blds) {
    if (b.state === 'ruin' || (opts.ignore && opts.ignore.has && opts.ignore.has(b.id))) continue;
    if (Math.hypot(b.x - x, b.z - z) > Math.hypot(b.w, b.d) / 2 + R + 1) continue;
    const bd = def(b.type);
    if (bd.noBlock || d.noBlock) continue;
    if (obbOverlap(probe, b)) return d.stack && b.wall && d.stack(b) ? null : 'Blocked';
  }
  const rr = Math.max(d.w, d.d) / 2 + 0.8;
  for (const n of st.nodes) if (n.kind === 'node' && Math.hypot(n.x - x, n.z - z) < (n.r || 1.5) + rr && !d.farmOnNode) return 'Too close to a resource';
  for (const n of st.neutral || []) if (Math.hypot(n.x - x, n.z - z) < (n.r || 3) + rr - 1 && n.blocks !== false) return 'Blocked';
  if (d.canPlace) { const r = d.canPlace(st, teamId, x, z, rot, d); if (r) return r; }
  return null;
}
