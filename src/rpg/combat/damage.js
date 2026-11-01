// The damage pipeline: truce, friendly fire, i-frames, block/parry, armor, resists, shields, crits, lifesteal, poise, knockback.
import { killActor, emit } from '../core.js';
import { clamp, angDiff } from '../../util.js';
import { isHostile, truce, hasShield, ownerOf, critMul, sideOf } from './common.js';

export const PARRY_WINDOW = 0.2;
export const POISE_DECAY = 14;

// stagger an actor (interrupts whatever it is doing). force bypasses poise immunity / super armor (parry, guard break).
export function staggerActor(st, a, dur, force = false) {
  const cs = a.cs;
  if (!a.alive || cs.state === 'dead' || dur <= 0) return false;
  const mv = cs.move;
  if (!force && (cs.poiseImm > 0 || cs.state === 'stagger' || (mv && mv.superArmor && (cs.state === 'windup' || cs.state === 'active')))) return false;
  if (a.type === 'king') dur *= 0.5;
  cs.state = 'stagger'; cs.t = 0; cs.stagger = dur; cs.blocking = false; cs.charging = false;
  cs.hitSet = null; cs.spell = null; cs.drawT = 0; cs.move = null; cs.poise = 0; cs.buffer = 0;
  return true;
}

function maxPoise(a) {
  if (a.poiseMax) return a.poiseMax;
  if (a.type === 'king') return 1e9;
  return 32 + ((a.d && a.d.armor) || 0) * 0.5 + (a.kind === 'monster' ? 8 : 0);
}

export function applyDamage(st, src, tgt, amount, opts = {}) {
  if (!tgt || !tgt.alive || !(amount > 0)) return 0;
  if ((tgt.kind === 'npc' || tgt.essential || tgt.invulnerable) && !opts.hurtNpc) return 0;   // essential npcs ignore damage
  const source = opts.source || 'direct';
  if (src && src !== tgt && src.alive !== undefined) {
    if (!opts.force && !isHostile(st, src, tgt) && !(opts.friendly)) return 0;
    if (truce(st, src, tgt)) return 0;
  }
  const cs = tgt.cs;
  if (src && source !== 'dot' && src !== tgt) { if (src.kind === 'player' || src.kind === 'rival') src.combatUntil = st.t + 10; if (tgt.kind === 'player' || tgt.kind === 'rival') tgt.combatUntil = st.t + 10; }
  if (src && source !== 'dot' && !opts.ignoreInv && st.t < cs.inv) return 0;  // dodge i-frames
  const dtype = opts.dtype || 'physical';
  let blocked = false, parried = false, staggerDur = 0, guardBreak = false;
  const melee = source === 'melee';
  const blockable = opts.blockable ?? (melee || source === 'proj');
  // ---- block / parry
  if (blockable && !opts.ignoreBlock && cs.state === 'block' && src) {
    const fx = opts.fromX ?? src.x, fz = opts.fromZ ?? src.z;
    const ang = Math.atan2(fz - tgt.z, fx - tgt.x);
    const shield = hasShield(tgt);
    if (Math.abs(angDiff(tgt.yaw, ang)) <= (shield ? 1.4 : 1.1)) {
      const bk = (tgt.d && tgt.d.block) || null;
      const win = clamp(bk ? bk.parryWindow : PARRY_WINDOW, 0.1, 0.4);
      if (melee && !opts.unparryable && cs.blockT <= win && cs.parryOk) {
        parried = true;
        staggerActor(st, src, opts.heavy ? 1.1 : 1.25, true);
        if (src.cs) src.cs.poiseImm = 1.0;
        if (tgt.kind !== 'monster') tgt.stamina = Math.min(tgt.maxStamina, tgt.stamina + 8);
        emit(st, { type: 'block', actor: tgt.id, perfect: true, x: tgt.x, z: tgt.z });
        emit(st, { type: 'hit', src: src.id, tgt: tgt.id, amt: 0, dtype, crit: false, blocked: true, parried: true, x: tgt.x, z: tgt.z });
        cs.parryFlash = st.t;
        return 0;
      }
      blocked = true;
      const frac = clamp(bk ? bk.absorb : shield ? 0.9 : 0.55, 0.2, 0.97);
      let absorbed = amount * frac;
      if (tgt.kind !== 'monster') {
        const cost = absorbed * (bk ? bk.stamMul : shield ? 0.75 : 1.15) * (opts.heavy ? 1.5 : 1);
        if (tgt.stamina >= cost) { tgt.stamina -= cost; if (opts.heavy && !shield) staggerDur = 0.4; }
        else { absorbed *= tgt.stamina / Math.max(cost, 1e-6); tgt.stamina = 0; guardBreak = true; staggerDur = 0.9; }
        cs.stamPause = 1.0;
      }
      amount -= absorbed;
      emit(st, { type: 'block', actor: tgt.id, perfect: false, x: tgt.x, z: tgt.z });
    }
  }
  // ---- armor (physical only), resistances, vulnerability, absorb shield
  let dealt = amount;
  if (!opts.trueDamage) {
    if (dtype === 'physical' && !opts.ignoreArmor) dealt *= 1 - clamp(((tgt.d && tgt.d.armor) || 0) * (1 - (opts.pierce || 0)), 0, 75) / 100;
    dealt *= 1 - clamp((tgt.res && tgt.res[dtype]) || 0, -100, 90) / 100;
  }
  if (opts.crit) dealt *= opts.critMul || (src ? critMul(st, src) : 1.75);
  const vuln = tgt.status.find((s) => s.id === 'vuln'); if (vuln) dealt *= 1 + (vuln.power || 0.2);
  if (source === 'melee' || source === 'proj') dealt = Math.max(dealt, 1);
  const sh = tgt.status.find((s) => s.id === 'shield');
  if (sh && sh.power > 0 && dealt > 0) { const t = Math.min(sh.power, dealt); sh.power -= t; dealt -= t; }
  // a healthy hero cannot be one-shot by anything except the boss and the fog
  if (src && source !== 'zone' && src.type !== 'king' && tgt.hp > tgt.maxHp * 0.85 && dealt >= tgt.hp) dealt = tgt.hp - 1;
  dealt = Math.max(0, dealt);
  tgt.hp -= dealt;
  if (src) { tgt.lastHitBy = src.id; tgt.lastHitT = st.t; } tgt.alerted = true;
  if (dealt > 0 || blocked) emit(st, { type: 'hit', src: src ? src.id : 0, tgt: tgt.id, amt: dealt, dtype, crit: !!opts.crit, blocked, parried, x: tgt.x, z: tgt.z, source });
  // ---- lifesteal
  if (src && src.alive && dealt > 0 && !opts.noLeech && (melee || source === 'proj' || opts.leech)) {
    let ls = opts.leech ?? ((src.d && src.d.lifesteal) || 0); if (ls > 1) ls /= 100;
    if (ls > 0) src.hp = Math.min(src.maxHp, src.hp + dealt * ls);
  }
  if (tgt.hp <= 0) { killActor(st, tgt, src ? ownerOf(st, src) : null); return dealt; }
  // ---- poise, stagger, knockback
  if (staggerDur > 0) staggerActor(st, tgt, staggerDur, guardBreak);
  else if (!blocked && (opts.poise || opts.stagger)) {
    cs.poise = (cs.poise || 0) + (opts.poise || 0);
    if (opts.stagger || cs.poise >= maxPoise(tgt)) staggerActor(st, tgt, opts.stagger || 0.45);
  }
  if (opts.knock && tgt.type !== 'king' && !blocked) {
    const fx = opts.fromX ?? (src ? src.x : tgt.x), fz = opts.fromZ ?? (src ? src.z : tgt.z);
    const dx = tgt.x - fx, dz = tgt.z - fz, d = Math.hypot(dx, dz) || 1, k = opts.knock / (1 + Math.max(0, tgt.radius - 0.5) * 1.2);
    tgt.imp = { vx: (dx / d) * k, vz: (dz / d) * k, t: 0.2 };
  }
  return dealt;
}
export { sideOf };
