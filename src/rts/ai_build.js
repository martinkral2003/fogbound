// AI lane: building placement + build commands (budgeted, deterministic through st.rng).
import { bdef, bdefs, resolveB, affordable, safe, canPlace } from './ai_info.js';
import * as Buildings from './buildings.js';
import { RES } from './consts.js';

// budget payment; unless `free`, resources earmarked by ai.save (a pending research/age-up) are left alone
export const pay = (ai, c, free = true) => {
  if (!c) return true;
  const sv = !free && ai.save && ai.saveUntil > ai.s.t && ai.s.team.pop.mil >= 10 ? ai.save : null; // army first; saving only once we have a core force
  for (const r of RES) if ((c[r] || 0) > 0 && (ai.bud[r] || 0) - (sv ? sv[r] || 0 : 0) < c[r]) return false;
  for (const r of RES) ai.bud[r] -= c[r] || 0;
  return true;
};
export const cnt = (s, type) => { const l = s.bl[type]; return l ? l.ready.length + l.build.length : 0; };
export const ready = (s, type) => { const l = s.bl[type]; return l ? l.ready.length : 0; };

// can this team start `type` now? (age, prerequisites, limit); returns the def or null
export function canBuild(st, ai, type) {
  const d = type && bdef(type);
  if (!d) return null;
  const team = ai.s.team, s = ai.s;
  if ((d.age || 1) > (team.age || 1)) return null;
  const fk = team.faction.key;
  if (d.faction && d.faction !== 'all' && d.faction !== fk) return null;
  for (const n of d.needs || []) if (!ready(s, n) && !(team.tech && team.tech[n])) return null;
  if (d.limit && cnt(s, type) >= d.limit) return null;
  return d;
}
// workers that can be pulled to build: nearest first, skipping builders already busy
function pickBuilders(st, ai, x, z, n) {
  const w = ai.s.workers.filter((u) => !ai.busy.has(u.id)).filter((u) => !u.order || u.order.type === 'gather' || u.order.type === 'return').filter((u) => !(u.carry && u.carry.amt > 6));
  w.sort((a, b) => (a.x - x) ** 2 + (a.z - z) ** 2 - ((b.x - x) ** 2 + (b.z - z) ** 2));
  return w.slice(0, n);
}
// keep resource nodes and the walking lanes keep<->node open (workers get stuck behind buildings)
function lanesBlocked(st, ai, x, z, rad) {
  const k = ai.s.home;
  for (const n of st.nodes) {
    if (n.infinite || !n.slots || Math.hypot(n.x - k.x, n.z - k.z) > 75 || (n.region !== undefined && n.region !== -1 && n.region !== ai.team)) continue;
    if (Math.hypot(n.x - x, n.z - z) < rad + (n.r || 3) + 3) return true;
    const dx = n.x - k.x, dz = n.z - k.z, L2 = dx * dx + dz * dz;
    if (L2 < 4) continue;
    const t = Math.max(0, Math.min(1, ((x - k.x) * dx + (z - k.z) * dz) / L2));
    if (t > 0.08 && Math.hypot(k.x + dx * t - x, k.z + dz * t - z) < rad + 2.2) return true;
  }
  return false;
}
const realPlace = () => Object.keys(bdefs()).length > 12 && typeof Buildings.canPlace === "function";
function clear(st, ai, x, z, rad) {
  const w = st.world;
  if (!ai.free && lanesBlocked(st, ai, x, z, rad)) return false;
  if (realPlace()) { // the buildings lane validates ground/territory/overlap; we only keep walking lanes between buildings
    for (const b of st.blds) if (b.state !== 'ruin' && !b.wall && Math.hypot(b.x - x, b.z - z) < rad + Math.max(b.w, b.d) * 0.5 + 1.2) return false;
    return true;
  }
  if (!w.walkable(x, z) || !w.walkable(x + rad, z) || !w.walkable(x - rad, z) || !w.walkable(x, z + rad) || !w.walkable(x, z - rad)) return false;
  for (const b of st.blds) if (b.state !== 'ruin' && Math.hypot(b.x - x, b.z - z) < rad + Math.max(b.w, b.d) * 0.5 + 1.8) return false;
  for (const n of st.nodes) if (Math.hypot(n.x - x, n.z - z) < rad + (n.r || 3) + 2) return false;
  const k = st.teams[ai.team].keep;
  if (k && Math.abs(w.heightAt(x, z) - w.heightAt(k.x, k.z)) > 9) return false;
  return true;
}
// find a spot around (cx,cz): radius band [r0,r1], optional preferred angle (+- spread)
export function findSpot(st, ai, type, cx, cz, r0, r1, pref, spread = Math.PI, tries = 40) {
  const d = bdef(type) || { w: 5, d: 5 };
  const rad = Math.max(d.w, d.d) * 0.5;
  for (let i = 0; i < tries; i++) {
    const wide = i >= tries * 0.5; // second half: any direction, a bit further out
    const a = (pref === undefined || wide ? st.rng() * 6.283 : pref + (st.rng() * 2 - 1) * spread);
    const r = r0 + (r1 * (wide ? 1.5 : 1) - r0) * Math.sqrt(st.rng());
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    if (!clear(st, ai, x, z, rad)) continue;
    if (canPlace(st, ai.team, type, x, z, a) !== null) continue;
    return { x, z, rot: Math.atan2(cz - z, cx - x) };
  }
  return null;
}
// issue a build command for `type`. opts: {at:{x,z,r0,r1,pref,spread}, n workers, force}
export function tryBuild(st, ai, cmds, type, opts = {}) {
  const s = ai.s;
  if (st.rng() < ai.D.skip && !opts.force) return false;
  const d = canBuild(st, ai, type);
  if (!d) return false;
  if (!affordable({ res: ai.bud }, d.cost || {}) && !opts.force) return false;
  const k = s.home, at = opts.at || {};
  ai.free = !!opts.nearNode;
  const sp = findSpot(st, ai, type, at.x ?? k.x, at.z ?? k.z, at.r0 ?? 12, at.r1 ?? 28, at.pref, at.spread, at.tries || 40);
  if (!sp) { ai.noSpot[type] = st.t; return false; }
  const ws = pickBuilders(st, ai, sp.x, sp.z, opts.n || 2);
  if (!ws.length) return false;
  pay(ai, d.cost);
  cmds.push({ t: 'build', type, x: sp.x, z: sp.z, rot: sp.rot, workers: ws.map((u) => u.id) });
  for (const u of ws) ai.busy.add(u.id); // do not reuse these workers this round
  ai.lastBuild = st.t;
  ai.nBuilt[type] = (ai.nBuilt[type] || 0) + 1;
  return true;
}
export { resolveB };
