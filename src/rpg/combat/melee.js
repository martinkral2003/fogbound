// Melee swings: per-weapon-kind feel, combo, heavy, hit detection (arc + hitSet), backstab, crits. Monster moves use the same code.
import { emit } from '../core.js';
import { clamp, angDiff } from '../../util.js';
import { applyDamage } from './damage.js';
import { addStatus } from './status.js';
import { isHostile, perk, weaponOf, slayerMul, HERO_DMG, mightMul, atkSpeed, critChance, spendStamina, rand, isHero } from './common.js';
import { monsterDamage } from './monsters.js';
import { fireMoveProjectile } from './ranged.js';
import { summonSkeletons } from './spells.js';

// base timings at speed 1 (seconds); arc = total swing arc in radians; poise = poise multiplier; reachAdd/lunge feel
export const WEAPON_KINDS = {
  fist:    { w: 0.22, a: 0.10, r: 0.26, arc: 1.9, poise: 0.6, dmg: 1, lunge: 1.5, backstab: 1.4 },
  torch:   { w: 0.26, a: 0.10, r: 0.28, arc: 1.8, poise: 0.7, dmg: 1, lunge: 1.5, backstab: 1.4, fire: true },
  dagger:  { w: 0.20, a: 0.10, r: 0.22, arc: 1.5, poise: 0.5, dmg: 1, lunge: 2.0, backstab: 3.0, crit: 0.10 },
  sword:   { w: 0.32, a: 0.14, r: 0.30, arc: 1.9, poise: 1.0, dmg: 1, lunge: 2.5, backstab: 2.0 },
  mace:    { w: 0.40, a: 0.16, r: 0.38, arc: 1.7, poise: 1.3, dmg: 1, lunge: 2.2, backstab: 1.8, pierce: 0.4 },
  axe:     { w: 0.42, a: 0.16, r: 0.38, arc: 2.1, poise: 1.4, dmg: 1, lunge: 2.4, backstab: 1.8 },
  spear:   { w: 0.36, a: 0.12, r: 0.32, arc: 0.7, poise: 0.9, dmg: 1, lunge: 4.0, backstab: 1.8, reachAdd: 0.3 },
  twohand: { w: 0.50, a: 0.18, r: 0.44, arc: 2.4, poise: 1.6, dmg: 1, lunge: 2.0, backstab: 1.8 },
  staff:   { w: 0.34, a: 0.12, r: 0.34, arc: 1.6, poise: 0.8, dmg: 0.6, lunge: 1.5, backstab: 1.4 },
};
export const kindDef = (k) => WEAPON_KINDS[k] || WEAPON_KINDS.sword;
const COMBO = [{ d: 1.0, w: 1.0, r: 1.0, knock: 0 }, { d: 1.05, w: 0.88, r: 1.0, knock: 0 }, { d: 1.3, w: 1.1, r: 1.3, knock: 4 }];

function heroMove(st, a, heavy) {
  const cs = a.cs, w = weaponOf(a), k = kindDef(w.kind), sp = atkSpeed(st, a) * clamp(w.speed || 1, 0.4, 3);
  const idx = heavy ? 0 : (cs.comboT > 0 ? ((cs.comboIdx || 0) + 1) % 3 : 0);
  if (!heavy) cs.comboIdx = idx;
  const c = heavy ? { d: 1.9, w: 1.7, r: 1.25, knock: 6 } : COMBO[idx];
  let cost = (w.stam ?? 10) * (heavy ? 2 : 1) * (!heavy && idx === 2 ? 1.25 : 1);
  // exhaustion: no stamina = weak and slow
  let fac = 1;
  if (a.stamina < cost) fac = 0.5 + 0.5 * clamp(a.stamina / cost, 0, 1);
  spendStamina(st, a, cost);
  const slowT = 1 + (1 - fac) * 1.2;
  return {
    id: heavy ? 'heavy' : 'light' + idx, heavy, idx, weapon: w.kind, weak: fac < 1,
    windup: (k.w * c.w * (heavy ? 1 : 1) / sp) * slowT, active: (k.a * (heavy ? 1.3 : 1)) / sp, recover: ((k.r * c.r * (heavy ? 1.1 : 1)) / sp) * slowT,
    reach: (w.reach || 1.5) + (k.reachAdd || 0) + 0.25, arc: k.arc * (heavy ? 1.15 : 1), dmgMul: c.d * k.dmg * fac,
    poise: 9 * k.poise * (heavy ? 3.2 : idx === 2 ? 1.8 : 1), knock: c.knock, lunge: k.lunge * (heavy ? 1.6 : 1), lungeT: 0.14, pierce: k.pierce || 0,
    stagger: heavy && k.poise >= 1.3 ? 0.55 : 0, telegraph: true, status: null, backstab: Math.max(k.backstab, w.backstab || 0), critBonus: k.crit || 0, dtype: w.dtype, fire: !!k.fire,
  };
}

export function startMelee(st, a, heavy = false, monsterMove = null) {
  const cs = a.cs;
  let m = monsterMove;
  if (!m) m = heroMove(st, a, heavy);
  else { m = { ...m, windup: m.windup, heavy: m.id !== 'basic', weapon: 'monster' }; }
  if (monsterMove && monsterMove.cd) (cs.moveCd || (cs.moveCd = {}))[monsterMove.id] = st.t + monsterMove.cd;
  cs.state = 'windup'; cs.t = 0; cs.kind = m.heavy ? 'heavy' : 'light'; cs.move = m; cs.dur = m.windup; cs.hitSet = null; cs.charging = false; cs.blocking = false;
  cs.comboT = 5; cs.buffer = 0; cs.telegraph = m.telegraph !== false; cs.reach = m.reach;
  emit(st, { type: 'swing', actor: a.id, kind: cs.kind, weapon: m.weapon, move: m.id, windup: m.windup, combo: m.idx || 0, telegraph: cs.telegraph });
}

function isUnaware(b) {
  if (b.alerted === true || b.lastHitBy) return false;
  if (b.ai && typeof b.ai === 'object') {
    const s = b.ai.state;
    if (b.ai.target || s === 'chase' || s === 'attack' || s === 'combat' || s === 'flee') return false;
  }
  return b.cs.state === 'idle' || b.cs.state === 'dead' ? true : false;
}

function baseDamage(st, a, m) {
  if (a.kind === 'monster') {
    return monsterDamage(a, m);
  }
  const w = weaponOf(a), pm = perk(st, a);
  return rand(st, w.dmg[0], w.dmg[1]) * ((a.d && a.d.dmgMul) || 1) * (1 + (pm.meleeDmgPct || 0) / 100) * m.dmgMul * HERO_DMG * mightMul(a);
}

function aimYawFor(st, a) {
  const cs = a.cs, t = cs.lock ? st.byId.get(cs.lock) : null;
  if (!t || !t.alive) return a.yaw;
  const dx = t.x - a.x, dz = t.z - a.z;
  if (Math.hypot(dx, dz) > (cs.move ? cs.move.reach : 2) + 4) return a.yaw;
  return a.yaw + clamp(angDiff(a.yaw, Math.atan2(dz, dx)), -0.45, 0.45);
}

function strike(st, a, b, m) {
  const cs = a.cs;
  let amt = baseDamage(st, a, m), crit = false, mult = 1;
  if (isHero(a)) {
    // sneak / backstab: unaware or hit from behind; dagger is the assassin's tool
    const behind = Math.abs(angDiff(b.yaw, Math.atan2(a.z - b.z, a.x - b.x))) > 2.1;
    const un = isUnaware(b);
    const bs = m.backstab || 1.5;
    if (un) mult = Math.max(mult, a.crouching ? bs * 1.25 : bs);
    if (behind && b.cs.state !== 'block') mult = Math.max(mult, 1 + (bs - 1) * 0.5);
    if (b.cs.state === 'stagger') mult = Math.max(mult, 1.4);                  // riposte on a staggered foe
    crit = st.rng() < critChance(a) + (m.critBonus || 0) || mult >= 1.9;
  }
  amt *= mult * (isHero(a) ? slayerMul(weaponOf(a), b) : 1);
  const dealt = applyDamage(st, a, b, amt, {
    dtype: m.dtype || (a.kind === 'monster' ? (MONSTER_DTYPE[a.type] || 'physical') : 'physical'), source: 'melee', crit, heavy: !!m.heavy, poise: m.poise, knock: m.knock, pierce: m.pierce,
    blockable: m.blockable, unparryable: m.unparryable, stagger: m.stagger, fromX: a.x, fromZ: a.z,
  });
  if (dealt > 0 && b.alive) {
    const s = m.status;
    if (s && st.rng() < (s.chance ?? 1)) addStatus(b, s.id, s.dur, s.power, a.id);
    if (m.fire && st.rng() < 0.3) addStatus(b, 'burn', 3, Math.max(2, dealt * 0.25), a.id);
    if (m.dtype === 'fire' && st.rng() < 0.3) addStatus(b, 'burn', 3, Math.max(2, dealt * 0.2), a.id);
    if (m.dtype === 'poison' && st.rng() < 0.4) addStatus(b, 'poison', 4, Math.max(1.5, dealt * 0.2), a.id);
  }
  return dealt;
}
const MONSTER_DTYPE = { ghoul: 'poison', bogBeast: 'poison', wraith: 'cold' };

// called every step while state === 'active'
export function meleeActive(st, a) {
  const cs = a.cs, m = cs.move;
  if (!m) return;
  if (!cs.hitSet) {
    cs.hitSet = new Set(); cs.aimYaw = aimYawFor(st, a);
    if (m.lunge) { a.imp = { vx: Math.cos(cs.aimYaw) * m.lunge, vz: Math.sin(cs.aimYaw) * m.lunge, t: m.lungeT || 0.15 }; }
    if (m.proj) { fireMoveProjectile(st, a, m); return; }
    if (m.summon) { summonSkeletons(st, a, m.summon, { life: 45, hostileSide: true }); return; }
  }
  if (m.proj || m.summon) return;
  const yaw = cs.aimYaw ?? a.yaw, hits = cs.hitSet;
  for (const b of st.actors) {
    if (cs.move !== m || cs.hitSet !== hits) break; // the swing was interrupted (parried/staggered) while resolving an earlier hit
    if (b === a || hits.has(b.id) || !isHostile(st, a, b)) continue;
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
    if (d > m.reach + b.radius) continue;
    if (!m.aoe) {
      const off = Math.abs(angDiff(yaw, Math.atan2(dz, dx)));
      if (off > m.arc / 2 + Math.atan2(b.radius, Math.max(d, 0.3))) continue;
    } else if (d > m.aoe + b.radius) continue;
    hits.add(b.id);
    strike(st, a, b, m);
  }
}
