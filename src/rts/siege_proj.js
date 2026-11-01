// Shared projectiles for towers and siege weapons (WALLS+SIEGE lane). st.sproj = [{kind,x,y,z,...}], rendered by the client from st.sproj.
// fire(st, p): p = { kind:'arrow'|'cannonball'|'bolt'|'bolt_big'|'rock'|'firerock'|'flame'|'bomb', srcRef, team, from:{x,y,z}, to:{x,y,z}, speed, arc, dmg, splash, dtype, tgtId, siege, bldMul, unitMul, fire, hitsAir }
import { emit } from './core.js';
import * as Combat from './combat.js';
import * as Walls from './walls.js';
import { ignite } from './wall_fire.js';
import { allied } from './nav.js';

export function fire(st, p) {
  const f = p.from, t = p.to;
  const d = Math.hypot(t.x - f.x, t.z - f.z);
  const o = {
    kind: p.kind, x: f.x, y: f.y, z: f.z, sx: f.x, sy: f.y, sz: f.z, tx: t.x, ty: t.y, tz: t.z, t: 0, T: Math.max(0.12, d / (p.speed || 30)), arc: p.arc || 0,
    dmg: p.dmg, splash: p.splash || 0, dtype: p.dtype || 'physical', srcRef: p.srcRef, team: p.team, tgtId: p.tgtId || 0, siege: !!p.siege, bldMul: p.bldMul == null ? 1 : p.bldMul,
    unitMul: p.unitMul == null ? 1 : p.unitMul, fire: !!p.fire, hitsAir: p.hitsAir !== false, homing: p.homing !== false && !p.splash, minBld: p.minBld || 0,
  };
  (st.sproj || (st.sproj = [])).push(o);
  emit(st, { type: 'shot', kind: o.kind, x: f.x, y: f.y, z: f.z, tx: t.x, ty: t.y, tz: t.z, T: o.T, src: p.srcRef ? p.srcRef.id : 0 });
  return o;
}

export function update(st, dt) {
  const L = st.sproj; if (!L || !L.length) return;
  for (let i = L.length - 1; i >= 0; i--) {
    const p = L[i];
    if (p.homing && p.tgtId) { const e = st.byId.get(p.tgtId); if (e && e.alive !== false && e.hp > 0 && e.kind === 'unit') { p.tx = e.x; p.tz = e.z; p.ty = (e.y || 0) + 1; } }
    p.t += dt;
    const u = Math.min(1, p.t / p.T);
    p.x = p.sx + (p.tx - p.sx) * u; p.z = p.sz + (p.tz - p.sz) * u;
    p.y = p.sy + (p.ty - p.sy) * u + p.arc * 4 * u * (1 - u);
    if (u >= 1) { land(st, p); L.splice(i, 1); }
  }
}

const hostileTo = (st, team, t) => t !== team && !allied(st, team, t);
function hitUnit(st, p, e, amt) {
  if (p.fire) e.burnUntil = Math.max(e.burnUntil || 0, st.t + 4);
  Combat.damage(st, p.srcRef, e, amt * p.unitMul, { dtype: p.fire ? 'fire' : p.dtype, siege: p.siege });
}
function land(st, p) {
  const r = p.splash;
  const direct = p.tgtId ? st.byId.get(p.tgtId) : null;
  if (direct && direct.hp > 0 && direct.kind === 'unit' && direct.alive && (r === 0)) { hitUnit(st, p, direct, p.dmg); return; }
  if (direct && direct.kind === 'bld' && direct.hp > 0 && r === 0) { Walls.damageBld(st, p.srcRef, direct, p.dmg * p.bldMul, { siege: p.siege, fire: false }); if (p.fire) ignite(st, direct); return; }
  if (r <= 0) return; // arrow whose target died
  emit(st, { type: 'impact', kind: p.kind, x: p.tx, y: p.ty, z: p.tz, r });
  for (const e of st.ents) {
    if (!e.alive || e.hp <= 0 || !hostileTo(st, p.team, e.team)) continue;
    if (e.layer === 'wall' && p.kind === 'cannonball' && false) continue;
    const d = Math.hypot(e.x - p.tx, e.z - p.tz);
    if (d > r + (e.r || 0.5)) continue;
    hitUnit(st, p, e, p.dmg * (1 - 0.55 * Math.min(1, d / r)));
  }
  for (const b of st.blds) {
    if (b.hp <= 0 || b.state === 'ruin' || !hostileTo(st, p.team, b.team)) continue;
    const reach = r + Math.max(b.w, b.d) / 2 * 0.6;
    const d = Math.hypot(b.x - p.tx, b.z - p.tz);
    if (d > reach) continue;
    const fall = b.id === p.tgtId ? 1 : 1 - 0.6 * Math.min(1, d / reach);
    Walls.damageBld(st, p.srcRef, b, p.dmg * p.bldMul * fall, { siege: p.siege, state: b.state });
    if (p.fire) ignite(st, b);
  }
}
