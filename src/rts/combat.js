// FOGBOUND: DOMINION combat (UNITS lane): damage model, melee/ranged/splash attacks, projectiles, buffs/status effects, veterancy.
// Exports: damage, update, command, gainXp, vetBonus, addBuff, addStatus, projectile, splash, xpValue, heal.
// Projectiles live in st.projs: {id,kind,team,src,tgt,sx,sy,sz,x,y,z,tx,tz,t,T,arc,dmg,dtype,splash,siege,onhit,pierce}; kinds: arrow bolt spear fire dark lightning boulder.
import { emit, killEnt, killBld } from './core.js';
import { forNear, forNearBlds, gap } from './units_grid.js';
import { recalc, applyMods, vetBonus, VET_XP } from './units_stats.js';
import { validT, canHit, effRange, acquire, onHurt } from './orders_target.js';
import * as Abil from './combat_abilities.js';
import * as Gen from './generals.js';

export { vetBonus };
const PSPD = { arrow: 30, bolt: 36, spear: 22, fire: 20, dark: 17, lightning: 45, boulder: 15 };
const ARMOR_F = { physical: 1, siege: 1, fire: 0.5, cold: 0.5, lightning: 0.5, dark: 0.5, poison: 0 };

export function xpValue(t) {
  if (t.kind === 'bld') return Math.min(40, (t.maxHp || 500) / 80);
  const d = t.def;
  if (d.xpValue != null) return d.xpValue;
  const c = d.cost || {};
  const v = ((c.gold || 0) + (c.timber || 0) * 0.7 + (c.blood || 0) * 0.5 + (c.souls || 0) * 3) / 8 * Math.max(1, d.popCost || 1);
  return t.general ? 40 + t.lvl * 15 : Math.max(2, v);
}
export function gainXp(st, u, amt) {
  if (!u || !u.alive || !(amt > 0)) return;
  if (u.general) return Gen.gainXp(st, u, amt);
  u.xp += amt;
  let up = false;
  while (u.vet < 6 && u.xp >= VET_XP[u.vet]) { u.vet++; up = true; }
  if (up) { u.lvl = u.vet; recalc(st, u); u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.15); emit(st, { type: 'levelup', unit: u.id, lvl: u.vet }); }
}
export function heal(st, u, amt) { if (u.alive && u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + amt); }

// ---------------------------------------------------------------- damage
export function damage(st, src, tgt, amount, o = {}) {
  if (!tgt || tgt.hp <= 0 || !(amount > 0)) return 0;
  const dtype = o.dtype || 'physical';
  let a = amount, dealt;
  if (tgt.kind === 'bld') {
    if (tgt.state === 'ruin') return 0;
    const siege = o.siege || dtype === 'siege';
    let m = siege ? (tgt.armorSiege != null ? tgt.armorSiege : 1) : (o.bldMul != null ? o.bldMul : tgt.wall ? 0.22 : 0.4);
    if (dtype === 'fire' && !siege) m *= 1.6;
    if (!siege && tgt.armor) m *= 1 - Math.min(0.6, tgt.armor * 0.03);
    a *= m;
    tgt.hp -= a; tgt.lastHit = st.t; dealt = a;
    if (o.fire || dtype === 'fire') { tgt.burnUntil = Math.max(tgt.burnUntil || 0, st.t + 3); }
    emit(st, { type: 'hit', src: src ? src.id : 0, tgt: tgt.id, amt: dealt, dtype, crit: false, x: tgt.x, z: tgt.z });
    if (tgt.hp <= 0) killBld(st, tgt, src);
    return dealt;
  }
  if (tgt.inv > 0 || tgt.untargetable || !tgt.alive) return 0;
  const res = tgt.def.res ? tgt.def.res[dtype === 'siege' ? 'physical' : dtype] || 0 : 0;
  let arm = tgt.armor * (ARMOR_F[dtype] != null ? ARMOR_F[dtype] : 0.5);
  if (o.pierce) arm *= 1 - o.pierce;
  a *= (1 - arm / 100) * (1 - res) * (tgt.mod ? tgt.mod.take : 1);
  if (tgt.shield > 0) { const s = Math.min(tgt.shield, a); tgt.shield -= s; a -= s; }
  if (!o.dot) a = Math.max(a > 0 ? 1 : 0, a);
  dealt = a;
  tgt.hp -= a;
  if (src && !o.dot) onHurt(st, tgt, src);
  if (a > 0) emit(st, { type: 'hit', src: src ? src.id : 0, tgt: tgt.id, amt: dealt, dtype, crit: !!o.crit, x: tgt.x, z: tgt.z });
  if (tgt.hp <= 0 && tgt.alive) {
    const k = src && src.kind === 'unit' && src.alive ? src : o.srcUnit && o.srcUnit.alive ? o.srcUnit : null;
    if (k) { k.kills++; gainXp(st, k, xpValue(tgt)); if (k.team >= 0) Gen.shareXp(st, k, xpValue(tgt)); }
    killEnt(st, tgt, src);
  }
  return dealt;
}
// area damage around (x,z): enemies of `team`; falloff 0..1 (edge damage fraction loss). returns hits
export function splash(st, src, team, x, z, radius, amount, o = {}, skip = null) {
  let n = 0;
  const fo = o.falloff == null ? 0.5 : o.falloff;
  const list = [];
  forNear(st, x, z, radius + 1.5, (e) => { if (e.team !== team && e !== skip && e.hp > 0 && (o.air !== false || !e.fly || o.hitAir)) list.push(e); return false; });
  for (const e of list) {
    const d = Math.max(0, Math.hypot(e.x - x, e.z - z) - e.r);
    if (d > radius) continue;
    damage(st, src, e, amount * (1 - fo * d / radius), o); n++;
    if (o.after) o.after(e);
  }
  if (o.bld !== false) {
    const bl = [];
    forNearBlds(st, x, z, radius + 6, (b) => { if (b.team !== team && b !== skip && b.hp > 0 && b.state !== 'ruin' && !b.trap && b.team >= 0) bl.push(b); return false; });
    for (const b of bl) if (gap({ x, z, r: 0 }, b) <= radius) damage(st, src, b, amount * (o.bldMul != null ? 1 : 1), o);
  }
  return n;
}
// ---------------------------------------------------------------- buffs & status
export function addBuff(st, u, idOrObj, dur, mods) {
  if (!u || !u.alive) return null;
  const b = typeof idOrObj === 'object' ? Object.assign({}, idOrObj) : Object.assign({ id: idOrObj }, mods);
  if (dur != null) b.t = dur; else if (b.dur != null && b.t == null) b.t = b.dur;
  if (!(b.t > 0)) return null;
  const ex = u.buffs.findIndex((x) => x.id === b.id);
  if (ex >= 0) { b.acc = u.buffs[ex].acc || 0; u.buffs[ex] = b; } else u.buffs.push(b);
  applyMods(u);
  return b;
}
export function removeBuff(st, u, id) { const i = u.buffs.findIndex((x) => x.id === id); if (i >= 0) { u.buffs.splice(i, 1); applyMods(u); } }
export function addStatus(st, u, kind, dur, power = 0, src = null) {
  if (!u || !u.alive || u.inv > 0) return;
  const boss = u.def.boss ? 0.25 : 1;
  const sid = src ? src.id : 0;
  switch (kind) {
    case 'stun': u.stun = Math.max(u.stun, dur * boss); break;
    case 'slow': addBuff(st, u, { id: 'slow', spd: Math.max(0.2, 1 - power) }, dur * boss); break;
    case 'root': addBuff(st, u, { id: 'root', spd: 0 }, dur * boss); break;
    case 'burn': if ((u.def.res.fire || 0) < 1) addBuff(st, u, { id: 'burn', dps: power, dtype: 'fire', src: sid }, dur); break;
    case 'poison': if ((u.def.res.poison || 0) < 1) addBuff(st, u, { id: 'poison', dps: power, dtype: 'poison', src: sid }, dur); break;
    case 'silence': u.silence = st.t + dur; break;
    default: break;
  }
}
function tickBuffs(st, u, dt) {
  let ch = false;
  for (let i = u.buffs.length - 1; i >= 0; i--) {
    const b = u.buffs[i];
    const gone = b.until != null ? st.t >= b.until : (b.t -= dt) <= 0;        // Magic buffs carry an absolute `until`
    if (b.dps) {
      b.acc = (b.acc || 0) + dt;
      if (b.acc >= 0.5) { b.acc -= 0.5; const s = b.src ? st.byId.get(b.src) : null; damage(st, s && s.kind === 'unit' ? s : null, u, b.dps * 0.5, { dtype: b.dtype || 'poison', dot: true, srcUnit: s }); if (!u.alive) return; }
    }
    if (gone) { u.buffs.splice(i, 1); ch = true; }
  }
  if (ch) applyMods(u);
}
// ---------------------------------------------------------------- attacks
function bonusVs(u, t) {
  let m = 1;
  const b = u.atk.bonus;
  if (b && t.tags) for (const k in b) if (t.tags[k] && b[k] > m) m = b[k];
  return m;
}
export function projectile(st, p) {
  const T = Math.max(0.05, p.dist / (p.speed || PSPD[p.kind] || 25));
  const o = Object.assign({ id: (st.projSeq = (st.projSeq || 0) + 1), kind: 'arrow', t: 0, T, arc: p.kind === 'arrow' || p.kind === 'spear' || p.kind === 'boulder' ? Math.min(5, p.dist * 0.12) : 0.3 }, p);
  st.projs.push(o);
  return o;
}
function attack(st, u, t) {
  const A = u.atk, m = u.mod;
  let dmg = A.dmg * m.dmg * bonusVs(u, t);
  if (u.def.berserk) dmg *= 1 + 0.5 * (1 - u.hp / u.maxHp);
  const ranged = !!A.projectile && A.range >= 3;
  if (t.kind === 'unit') {
    if (!ranged && t.layer === 'wall' && u.layer !== 'wall') dmg *= 0.7;
    const hd = (u.y || 0) - (t.y || 0);
    dmg *= 1 + Math.max(-0.1, Math.min(0.15, hd * 0.03));
  }
  const dt = A.dtype;
  if (u.silence > st.t && ranged && u.role === 'caster') return false;
  emit(st, { type: 'attack', src: u.id, tgt: t.id, ranged, dtype: dt, x: u.x, z: u.z });
  if (ranged) {
    const dist = Math.hypot(t.x - u.x, t.z - u.z);
    projectile(st, { kind: A.projectile, team: u.team, src: u.id, tgt: t.id, sx: u.x, sy: (u.y || 0) + 1.3, sz: u.z, x: u.x, y: (u.y || 0) + 1.3, z: u.z, tx: t.x, tz: t.z, dist, dmg, dtype: dt, splash: A.splash || 0, siege: dt === 'siege', onhit: A.onhit, pierce: A.pierce });
  } else {
    hit(st, u, t, dmg, dt, A);
    if (A.splash) splash(st, u, u.team, t.x, t.z, A.splash, dmg * 0.6, { dtype: dt, bld: false, falloff: 0.4 }, t);
  }
  return true;
}
function hit(st, src, t, dmg, dtype, A) {
  damage(st, src, t, dmg, { dtype, pierce: A.pierce, siege: dtype === 'siege', srcUnit: src });
  if (A.onhit && t.kind === 'unit' && t.alive) for (const k in A.onhit) addStatus(st, t, k, A.onhit[k].dur, A.onhit[k].dps || A.onhit[k].power || 0, src);
}
function updateProjs(st, dt) {
  const P = st.projs;
  for (let i = P.length - 1; i >= 0; i--) {
    const p = P[i];
    p.t += dt;
    const t = st.byId.get(p.tgt), live = validT(t);
    if (live) { p.tx = t.x; p.tz = t.z; }
    const k = Math.min(1, p.t / p.T), ty = live ? (t.y || 0) + (t.kind === 'bld' ? (t.h || 3) * 0.5 : 1) : st.world.heightAt(p.tx, p.tz);
    p.x = p.sx + (p.tx - p.sx) * k; p.z = p.sz + (p.tz - p.sz) * k;
    p.y = p.sy + (ty - p.sy) * k + p.arc * 4 * k * (1 - k);
    if (k < 1) continue;
    P[i] = P[P.length - 1]; P.pop();
    const src = st.byId.get(p.src), su = src && src.kind === 'unit' && src.alive ? src : null;
    if (live) {
      damage(st, su, t, p.dmg, { dtype: p.dtype, pierce: p.pierce, siege: p.siege, srcUnit: su });
      if (p.onhit && t.kind === 'unit' && t.alive) for (const kk in p.onhit) addStatus(st, t, kk, p.onhit[kk].dur, p.onhit[kk].dps || 0, su);
    }
    if (p.splash) splash(st, su, p.team, p.tx, p.tz, p.splash, p.dmg * 0.7, { dtype: p.dtype, siege: p.siege, falloff: 0.5 }, live ? t : null);
    emit(st, { type: 'impact', kind: p.kind, x: p.tx, z: p.tz, dtype: p.dtype, splash: p.splash });
  }
}
function garrisonShoot(st, u) {
  if (u.atk.range < 5 || !u.atk.projectile) return null;
  const b = st.byId.get(u.garrison);
  if (!b || b.hp <= 0) return null;
  let t = u.tgt ? st.byId.get(u.tgt) : null;
  if (!validT(t) || t.team === u.team || gap(u, t) > effRange(u) + 3) { t = ((st.tick + u.id) & 3) === 0 ? acquire(st, u, u.atk.range + 4, 0) : null; u.tgt = t ? t.id : 0; }
  return t;
}
export function command(st, teamId, cmd) { return false; }
export function update(st, dt) {
  updateProjs(st, dt);
  for (const u of st.ents) {
    if (!u.alive) continue;
    if (u.stun > 0) u.stun -= dt;
    if (u.ttl !== undefined && (u.ttl -= dt) <= 0) { killEnt(st, u, null); continue; }
    if (u.buffs.length) { tickBuffs(st, u, dt); if (!u.alive) continue; }
    if (u.buffs.length !== (u.nb | 0)) { applyMods(u); u.nb = u.buffs.length; }              // buffs added/removed by other lanes
    if (u.siegeCtl) { if (u.atkCd > 0) u.atkCd -= dt; Abil.update(st, u, dt); continue; }
    if (u.mod.regen > 0 && u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + u.mod.regen * dt);
    if (u.charm && st.t > u.charm.until) Abil.endCharm(st, u);
    if (u.inv > 0) u.inv -= dt;
    Abil.update(st, u, dt);
    if (!u.alive) continue;
    if (u.atkCd > 0) u.atkCd -= dt * u.mod.as;
    if (u.stun > 0 || u.atkCd > 0) continue;
    let t = null;
    if (u.garrison) t = garrisonShoot(st, u);
    else if (u.tgt) {
      t = st.byId.get(u.tgt);
      if (!validT(t) || t.team === u.team || !canHit(u, t)) { u.tgt = 0; t = null; }
    }
    if (!t || u.moving && u.atk.range < 3) continue;
    if (gap(u, t) > effRange(u) + 0.35) continue;
    if (attack(st, u, t)) { u.atkCd = u.atk.cd; u.face = Math.atan2(t.z - u.z, t.x - u.x); u.lastAtk = st.t; }
  }
}
