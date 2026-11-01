// UNITS lane: target validity, auto-acquire (threats > workers > buildings; siege units prefer buildings), engagement movement, neutral (camp/wildlife) AI.
import { forNear, forNearBlds, gap } from './units_grid.js';
import { stepMove } from './units_move.js';

export const validT = (t) => !!t && (t.kind === 'bld' ? t.hp > 0 && t.state !== 'ruin' : t.alive && !t.garrison && t.hp > 0);
export const enemyOf = (u, t) => t.team !== u.team;
export function canHit(u, t) {
  if (t.kind === 'bld') return true;
  if (t.fly && u.atk.range < 5 && !u.fly) return false;      // melee cannot reach fliers
  if (t.untargetable || t.inv > 0) return false;
  return true;
}
export function effRange(u) { return u.atk.range * (u.layer === 'wall' ? 1.25 : 1) + (u.mod ? u.mod.rng || 0 : 0); }
export function curTarget(st, u) {
  if (!u.tgt) return null;
  const t = st.byId.get(u.tgt);
  if (!validT(t) || !enemyOf(u, t) || !canHit(u, t)) { u.tgt = 0; return null; }
  const lim = u.vision * 1.6 + 8;
  if ((t.x - u.x) ** 2 + (t.z - u.z) ** 2 > lim * lim + (t.kind === 'bld' ? 400 : 0)) { u.tgt = 0; return null; }
  return t;
}
const armedBld = (b) => !!(b.atk || b.turret || (b.wall && (b.wall.piece === 'tower' || b.wall.piece === 'gatehouse')));
function bldOk(u, b, allowAll) {
  if (b.team === u.team || b.team < 0 || b.hp <= 0 || b.state === 'ruin' || b.trap) return false;
  if (u.neutral) return false;
  if (u.role === 'siege') return true;
  if (armedBld(b)) return true;
  if (!allowAll) return false;
  return !(b.wall && b.wall.piece !== 'gate');                // attack-move: non-wall buildings only
}
// best enemy within radius (centre distance); bld: 0 never, 1 armed-only/siege, 2 attack-move (any non-wall)
export function acquire(st, u, radius, bld = 1) {
  let best = null, bs = 1e9;
  const siege = u.role === 'siege';
  forNear(st, u.x, u.z, radius, (e) => {
    if (e.team === u.team || e.hp <= 0 || !canHit(u, e)) return false;
    if (u.neutral && e.team < 0) return false;
    const d = Math.hypot(e.x - u.x, e.z - u.z) - e.r;
    if (e.hidden && d > 4) return false;
    let s = d + (e.role === 'worker' ? 10 : 0) + (siege ? 25 : 0) + (e.tgt === u.id ? -5 : 0) + (u.tgt === e.id ? -4 : 0);
    if (e.role === 'caster' || e.role === 'ranged') s -= 1;
    if (s < bs) { bs = s; best = e; }
    return false;
  });
  if (bld > 0 && !u.neutral) {
    forNearBlds(st, u.x, u.z, radius, (b) => {
      if (!bldOk(u, b, bld > 1)) return false;
      const d = gap(u, b);
      if (d > radius) return false;
      const s = d + (siege ? 0 : armedBld(b) ? 6 : 20) + (u.tgt === b.id ? -4 : 0);
      if (s < bs) { bs = s; best = b; }
      return false;
    });
  }
  return best;
}
// move into weapon range of t (or stand and face it). returns true when in range this tick.
export function engage(st, u, t, dt) {
  const g = gap(u, t);
  if (g <= effRange(u)) {
    u.moving = false;
    u.face = Math.atan2(t.z - u.z, t.x - u.x);
    return true;
  }
  stepMove(st, u, t.x, t.z, dt, { arrive: 0.05 });
  return false;
}
// shared fight step: keep / (re)acquire a target and engage it. returns true when a target is being handled (caller must not walk its route).
export function fight(st, u, dt, radius, bld, from, leash) {
  let t = curTarget(st, u);
  if (t && from && Math.hypot(t.x - from.x, t.z - from.z) > leash) { t = null; u.tgt = 0; }
  if (!t || ((st.tick + u.id) & 7) === 0) {
    let n = acquire(st, u, radius, bld);
    if (n && from && Math.hypot(n.x - from.x, n.z - from.z) > leash) n = null;
    if (n) t = n;
  }
  if (!t && u.blockedBy && st.t - u.blockT < 0.5 && !u.neutral) {
    const b = st.byId.get(u.blockedBy);
    if (b && b.kind === 'bld' && b.team !== u.team && b.team >= 0 && validT(b)) t = b;
  }
  if (!t) { u.tgt = 0; return false; }
  u.tgt = t.id;
  engage(st, u, t, dt);
  return true;
}

// ---------------------------------------------------------------- neutral units: camp aggro, leash, return home and heal
export function neutralAI(st, u, dt) {
  const home = u.home, d = u.def;
  const dh = Math.hypot(u.x - home.x, u.z - home.z);
  u.anchored = false;
  if (d.passive) {                                   // wildlife: flee when hurt, otherwise graze near home
    if (u.hurtT && st.t - u.hurtT < 5) {
      const a = st.byId.get(u.hurtBy);
      if (a) { const ang = Math.atan2(u.z - a.z, u.x - a.x); stepMove(st, u, u.x + Math.cos(ang) * 12, u.z + Math.sin(ang) * 12, dt, { straight: true }); }
      return;
    }
    wander(st, u, dt, home, 7);
    return;
  }
  if (u.nstate === 'return') {
    u.tgt = 0;
    u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.1 * dt);
    if (stepMove(st, u, home.x, home.z, dt, { arrive: 1.5 })) { u.nstate = 'idle'; u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.3); }
    return;
  }
  let t = curTarget(st, u);
  if (t && (dh > u.leash || (t.x - home.x) ** 2 + (t.z - home.z) ** 2 > (u.leash + 8) ** 2)) { u.nstate = 'return'; u.tgt = 0; return; }
  if (!t && ((st.tick + u.id) & 7) === 0 && u.aggro > 0) t = acquire(st, u, u.aggro * (u.aggroMul || 1), 0);
  if (!t) { u.tgt = 0; u.nstate = 'idle'; if (dh > 2) stepMove(st, u, home.x, home.z, dt, { arrive: 1 }); else if (d.role === 'beast') wander(st, u, dt, home, 4); return; }
  u.tgt = t.id; u.nstate = 'chase';
  engage(st, u, t, dt);
}
function wander(st, u, dt, home, rad) {
  if (!u.wT || st.t > u.wT) {
    u.wT = st.t + 4 + st.rng() * 8;
    const a = st.rng() * 6.283, r = st.rng() * rad;
    u.wx = home.x + Math.cos(a) * r; u.wz = home.z + Math.sin(a) * r;
  }
  if (u.wx != null && st.world.walkable(u.wx, u.wz)) stepMove(st, u, u.wx, u.wz, dt, { arrive: 0.8, speed: u.speed * 0.4, straight: true });
}
// called by Combat.damage: remember the attacker, rally camp mates
export function onHurt(st, tgt, src) {
  if (!src || tgt.kind !== 'unit') return;
  tgt.hurtBy = src.id; tgt.hurtT = st.t;
  if (tgt.neutral && src.team >= 0 && !tgt.def.passive) {
    forNear(st, tgt.x, tgt.z, 14, (e) => {
      if (e.neutral && e !== tgt && !e.def.passive && !e.tgt && Math.hypot(e.home.x - tgt.home.x, e.home.z - tgt.home.z) < 18) { e.tgt = src.id; e.nstate = 'chase'; }
      return false;
    });
    if (!tgt.tgt) { tgt.tgt = src.id; tgt.nstate = 'chase'; }
  }
}
