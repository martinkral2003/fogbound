// Bows / crossbows (hold to draw, release to shoot), monster projectiles, and the projectile stepper (gravity, actors, statics, terrain).
import { emit } from '../core.js';
import * as Items from '../items.js';
import { clamp, angDiff } from '../../util.js';
import { applyDamage } from './damage.js';
import { addStatus } from './status.js';
import { isHostile, perk, weaponOf, slayerMul, HERO_DMG, mightMul, atkSpeed, critChance, spendStamina, rand, sideOf, ownerOf } from './common.js';
import { monsterDamage } from './monsters.js';
import { projHit } from './spells.js';

export const GRAVITY = 16;
export const BOW_DEFAULT = { bow: { draw: 0.9, projSpeed: 42 }, crossbow: { draw: 1.3, projSpeed: 58 } };

// ---------------------------------------------------------------- aiming
export function nearestHostileInCone(st, a, maxD, cone) {
  let best = null, bs = 1e9;
  for (const b of st.actors) {
    if (!isHostile(st, a, b)) continue;
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
    if (d > maxD) continue;
    const off = Math.abs(angDiff(a.yaw, Math.atan2(dz, dx)));
    if (off > cone) continue;
    const s = d + off * 8;
    if (s < bs) { bs = s; best = b; }
  }
  return best;
}
// ballistic pitch to hit (tx,ty,tz) from (ox,oy,oz) at speed v with gravity g (low arc); null if out of range
export function ballisticPitch(ox, oy, oz, tx, ty, tz, v, g) {
  const D = Math.hypot(tx - ox, tz - oz), dy = ty - oy;
  if (g <= 0) return Math.atan2(dy, Math.max(D, 0.01));
  const k = v * v * v * v - g * (g * D * D + 2 * dy * v * v);
  if (k < 0) return Math.PI / 4;
  return Math.atan((v * v - Math.sqrt(k)) / (g * Math.max(D, 0.01)));
}
// {yaw,pitch} for a shot: lock/auto target gets a ballistic solution (yaw limited like magnetism), otherwise the raw look direction
export function aimShot(st, a, speed, g, tgt) {
  const ox = a.x + Math.cos(a.yaw) * 0.5, oy = a.y + a.height * 0.8 * (a.scale || 1), oz = a.z + Math.sin(a.yaw) * 0.5;
  let yaw = a.yaw, pitch = a.pitch || 0;
  if (tgt && tgt.alive) {
    const tx = tgt.x, tz = tgt.z, ty = tgt.y + tgt.height * (tgt.scale || 1) * 0.6;
    const want = Math.atan2(tz - oz, tx - ox);
    yaw = a.yaw + clamp(angDiff(a.yaw, want), -0.5, 0.5);
    pitch = ballisticPitch(ox, oy, oz, tx, ty, tz, speed, g);
  }
  return { yaw, pitch, ox, oy, oz };
}
export function aimTarget(st, a, maxD = 30) {
  const lock = a.cs.lock ? st.byId.get(a.cs.lock) : null;
  if (lock && lock.alive && isHostile(st, a, lock)) return lock;
  if (a.kind !== 'player') return nearestHostileInCone(st, a, maxD, 0.6);
  return null;
}

export function spawnProj(st, o) {
  const p = { id: st.nextId++, kind: 'arrow', owner: 0, side: null, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, g: GRAVITY, r: 0.3, life: 4, dmg: 1, dtype: 'physical', crit: false, color: 0xe0e0d0, born: st.t, ...o };
  st.projs.push(p);
  return p;
}
function launch(st, a, speed, g, tgt, o) {
  const s = aimShot(st, a, speed, g, tgt), c = Math.cos(s.pitch);
  return spawnProj(st, { owner: a.id, side: sideOf(st, a), x: s.ox, y: s.oy, z: s.oz, vx: Math.cos(s.yaw) * c * speed, vy: Math.sin(s.pitch) * speed, vz: Math.sin(s.yaw) * c * speed, g, ...o });
}
export function fireMoveProjectile(st, a, m) {
  const pr = m.proj, tgt = aimTarget(st, a, 30);
  emit(st, { type: 'shoot', actor: a.id, x: a.x, z: a.z });
  launch(st, a, pr.speed, pr.g ?? (pr.dtype === 'cold' ? 0 : 7), tgt, {
    kind: pr.dtype === 'cold' ? 'bolt' : 'arrow', dmg: monsterDamage(a, m), dtype: pr.dtype, color: pr.color, r: 0.35, life: 3.5, status: m.status, mon: true,
  });
}

// ---------------------------------------------------------------- bow draw / release (heroes)
export function findAmmo(a, w) {
  if (typeof Items.ammoFor === 'function') return Items.ammoFor(a);
  const kind = (w.item && w.item.ammoKind) || (w.kind === 'crossbow' ? 'bolt' : 'arrow');
  return a.inv.find((q) => (q.kind === kind || q.ammoKind === kind) && (q.qty || 1) > 0) || null;
}
export function drawTime(st, a, w) {
  const base = (w.ranged && w.ranged.draw) || BOW_DEFAULT[w.kind]?.draw || 0.9;
  return clamp(base / (atkSpeed(st, a) * (1 + (perk(st, a).drawSpeedPct || 0) / 100)), 0.25, 3);
}
export function beginDraw(st, a, w) {
  const cs = a.cs;
  if (a.kind !== 'monster' && !findAmmo(a, w)) { if (a.kind === 'player') emit(st, { type: 'msg', actor: a.id, text: 'No ammunition.' }); return false; }
  cs.state = 'draw'; cs.t = 0; cs.drawT = 0; cs.drawNeed = drawTime(st, a, w); cs.kind = 'draw'; cs.move = null; cs.blocking = false; cs.hitSet = null;
  emit(st, { type: 'swing', actor: a.id, kind: 'draw', weapon: w.kind, windup: cs.drawNeed, telegraph: true });
  return true;
}
// release the string: power 0..1
export function releaseDraw(st, a, w, force = false) {
  const cs = a.cs, need = cs.drawNeed || 0.9;
  let power = clamp(cs.drawT / need, 0, 1);
  const xbow = w.kind === 'crossbow';
  cs.state = 'idle'; cs.t = 0; cs.drawT = 0;
  if (power < 0.3 || (xbow && power < 1 && !force)) return false;     // too early: loose nothing, keep the arrow
  if (xbow) power = 1;
  let ammo = null;
  if (a.kind !== 'monster') { ammo = findAmmo(a, w); if (!ammo) return false; ammo = typeof Items.consumeAmmo === 'function' ? Items.consumeAmmo(a) : (Items.removeFromInventory(a, ammo.uid, 1), ammo); if (!ammo) return false; }
  const pm = perk(st, a);
  const spd = ((w.ranged && w.ranged.projSpeed) || BOW_DEFAULT[w.kind]?.projSpeed || 42) * (0.55 + 0.45 * power);
  let dmg = rand(st, w.dmg[0], w.dmg[1]) * ((a.d && a.d.dmgMul) || 1) * (1 + (pm.bowDmgPct || 0) / 100) * (0.35 + 0.65 * power) * HERO_DMG * mightMul(a);
  if (ammo) dmg += (ammo.dmgAdd || ammo.bonusDmg || 0) * power;
  const crit = st.rng() < critChance(a) * (0.5 + 0.5 * power);
  const tgt = aimTarget(st, a, 40);
  spendStamina(st, a, 5);
  emit(st, { type: 'shoot', actor: a.id, x: a.x, z: a.z });
  launch(st, a, spd, GRAVITY, tgt, { kind: xbow ? 'bolt' : 'arrow', dmg, dtype: (ammo && ammo.dtype) || w.dtype || 'physical', crit, power, life: 5, r: 0.28, slay: w, status: ammo && ammo.status ? ammo.status : null });
  cs.state = 'recover'; cs.t = 0; cs.dur = 0.3; cs.move = { recover: 0.28 / atkSpeed(st, a), active: 0, windup: 0, noHit: true };
  return true;
}

// ---------------------------------------------------------------- projectile stepping
function hitStatic(st, x, y, z) {
  const l = st.grid.get(Math.floor(x / 8) * 4096 + Math.floor(z / 8));
  if (!l) return false;
  const gy = st.world.heightAt(x, z);
  for (const s of l) {
    if (s.t === 'c') {
      if (Math.hypot(x - s.x, z - s.z) < s.r && y < gy + 2.8) return true;
    } else {
      const dx = x - s.x, dz = z - s.z, lx = dx * s.c + dz * s.s, lz = -dx * s.s + dz * s.c;
      if (Math.abs(lx) < s.w / 2 && Math.abs(lz) < s.d / 2 && y < gy + 4) return true;
    }
  }
  return false;
}

export function stepProjectiles(st, dt) {
  const w = st.world;
  for (const p of st.projs) {
    if (p.dead) continue;
    const spd = Math.hypot(p.vx, p.vy, p.vz), n = Math.max(1, Math.ceil((spd * dt) / 0.6)), h = dt / n;
    const src = st.byId.get(p.owner) || null;
    for (let i = 0; i < n && !p.dead; i++) {
      p.vy -= p.g * h;
      p.x += p.vx * h; p.y += p.vy * h; p.z += p.vz * h;
      for (const b of st.actors) {
        if (!b.alive || b.id === p.owner || b.kind === 'npc') continue;
        if (src ? !isHostile(st, src, b) : sideOf(st, b) === p.side) continue;
        if (b.cs.state === 'dead') continue;
        const dx = b.x - p.x, dz = b.z - p.z, rr = b.radius + p.r;
        if (dx * dx + dz * dz > rr * rr) continue;
        const top = b.y + b.height * (b.scale || 1);
        if (p.y < b.y - 0.15 || p.y > top + 0.15) continue;
        p.dead = true; p.hitId = b.id;
        if (p.spell) projHit(st, p, b, src);
        else {
          const head = p.y > b.y + (top - b.y) * 0.82 && p.kind === 'arrow' && !p.mon;
          const crit = p.crit || head;
          const dealt = applyDamage(st, src, b, p.dmg * (head ? 1.25 : 1) * (p.slay ? slayerMul(p.slay, b) : 1), { dtype: p.dtype, source: 'proj', crit, poise: 8 + (p.power || 0) * 10, knock: p.mon ? 0 : 2 + (p.power || 0) * 2, fromX: p.x - p.vx * 0.1, fromZ: p.z - p.vz * 0.1 });
          if (dealt > 0 && p.status && b.alive && st.rng() < (p.status.chance ?? 1)) addStatus(b, p.status.id, p.status.dur, p.status.power, p.owner);
        }
        break;
      }
      if (p.dead) break;
      if (p.y < w.heightAt(p.x, p.z) || hitStatic(st, p.x, p.y, p.z)) {
        p.dead = true;
        if (p.spell) projHit(st, p, null, src);
      }
    }
    if (!p.dead && (st.t - p.born > p.life || !w.walkable(p.x, p.z) && p.y < 0)) { p.dead = true; if (p.spell && p.aoe) projHit(st, p, null, src); }
  }
  if (st.projs.length) st.projs = st.projs.filter((p) => !p.dead);
}
export { ownerOf };

export function isBlockedPoint(st, x, z, rad = 0.4) {
  const l = st.grid.get(Math.floor(x / 8) * 4096 + Math.floor(z / 8));
  if (!l) return false;
  for (const s of l) {
    if (s.t === 'c') { if (Math.hypot(x - s.x, z - s.z) < s.r + rad) return true; }
    else {
      const dx = x - s.x, dz = z - s.z, lx = dx * s.c + dz * s.s, lz = -dx * s.s + dz * s.c;
      if (Math.abs(lx) < s.w / 2 + rad && Math.abs(lz) < s.d / 2 + rad) return true;
    }
  }
  return false;
}
