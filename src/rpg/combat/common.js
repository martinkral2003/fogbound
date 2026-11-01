// Shared helpers for the combat modules (sides, hostility, truce rules, weapon stats, stamina). No DOM/Three.
import * as Skills from '../skills.js';
import * as Quests from '../quests.js';
import { clamp } from '../../util.js';

export const HERO_DMG = 0.85;   // global tuning knob for hero weapon damage (duels should last ~15-25 s)
export const isHero = (a) => a.kind === 'player' || a.kind === 'rival';

// perkMods cached per tick (they can be expensive to build)
export function perk(st, a) {
  if (a._pmT === st.tick && a._pm) return a._pm;
  let pm = {};
  try { pm = (Skills.perkMods && Skills.perkMods(a)) || {}; } catch (e) { pm = {}; }
  a._pm = pm; a._pmT = st.tick;
  return pm;
}

// side: heroes are their own side, monsters share one, npcs another; summons belong to their owner
export function sideOf(st, a) {
  if (a.owner) { const o = st.byId.get(a.owner); if (o && o !== a) return sideOf(st, o); }
  if (a.kind === 'monster') return 'M';
  if (a.kind === 'npc') return 'N';
  return a.id;
}
export function ownerOf(st, a) { return a && a.owner ? st.byId.get(a.owner) || a : a; }
export function isHostile(st, a, b) {
  if (!a || !b || a === b || !a.alive || !b.alive) return false;
  const sa = sideOf(st, a), sb = sideOf(st, b);
  if (sa === sb || sa === 'N' || sb === 'N') return false;
  return true;
}

export function inSettlement(st, x, z) {
  const s = st.settlement;
  if (!s) return false;
  if (typeof Quests.inSettlement === 'function') { try { return !!Quests.inSettlement(st, x, z); } catch (e) { /* fall through */ } }
  return s.r ? Math.hypot(x - s.x, z - s.z) < s.r : false;
}
// hero-vs-hero damage is disabled during the calm and inside the safe settlement
export function truce(st, src, tgt) {
  if (!src || !tgt) return false;
  const ss = sideOf(st, src), ts = sideOf(st, tgt);
  if (typeof ss !== 'number' || typeof ts !== 'number' || ss === ts) return false;
  if (st.match && st.match.calmUntil && st.t < st.match.calmUntil) return true;
  if (st.settlement && st.settlement.safe && (inSettlement(st, src.x, src.z) || inSettlement(st, tgt.x, tgt.z))) return true;
  return false;
}

const FIST = { dmg: [2, 4], speed: 1, reach: 1.3, stam: 6, dtype: 'physical', kind: 'fist' };
export function weaponOf(a) {
  const it = a.equip && a.equip.weapon;
  const w = (a.d && a.d.weapon) || it || FIST;
  return {
    dmg: w.dmg || (it && it.dmg) || FIST.dmg, speed: w.speed || (it && it.speed) || 1, reach: w.reach || (it && it.reach) || FIST.reach,
    stam: w.stam ?? (it && it.stam) ?? FIST.stam, dtype: w.dtype || (it && it.dtype) || 'physical', kind: w.kind || (it && it.kind) || 'fist',
    ranged: w.ranged || (it && it.ranged) || null, slayer: w.slayer || (it && it.slayer) || null, item: it || null,
  };
}
export const hasShield = (a) => !!(a.equip && a.equip.offhand && (a.equip.offhand.kind === 'shield' || a.equip.offhand.block));
export const hasStatus = (a, id) => a.status.some((s) => s.id === id);
export const getStatus = (a, id) => a.status.find((s) => s.id === id);

// stamina: monsters never run dry; spending pauses regen briefly
export function spendStamina(st, a, amt) {
  if (a.kind === 'monster') return;
  amt *= (a.d && a.d.staminaCostMul) || 1;
  a.stamina = Math.max(0, a.stamina - amt);
  a.cs.stamPause = 0.8;
}
export function atkSpeed(st, a) {
  let s = (a.d && a.d.atkSpeed) || 1;
  const h = getStatus(a, 'haste'); if (h) s *= h.power >= 1 ? h.power : 1 + h.power;
  if (hasStatus(a, 'slow')) s *= 0.85;
  return clamp(s, 0.5, 2.5);
}
export function critChance(a) { let c = (a.d && a.d.critChance) ?? 0.05; if (c > 1) c /= 100; return clamp(c, 0, 0.9); }
export function critMul(st, a) { return (a.d && a.d.critMul) || 1.75; }
export function mightMul(a) { const m = getStatus(a, 'might'); return m ? (m.power >= 1 ? m.power : 1 + m.power) : 1; }
export function aimDir(yaw, pitch = 0) { const c = Math.cos(pitch); return { x: Math.cos(yaw) * c, y: Math.sin(pitch), z: Math.sin(yaw) * c }; }
export const rand = (st, lo, hi) => lo + (hi - lo) * st.rng();
export const bodyY = (a, f = 0.6) => a.y + a.height * (a.scale || 1) * f;

const GROUPS = { undead: ['skeleton', 'skelArcher', 'ghoul', 'wraith', 'crypt', 'king'], beast: ['wolf', 'bogBeast', 'troll'], orc: ['orcRaider'], monster: null };
// +% damage multiplier from a unique's slayer field vs a victim
export function slayerMul(w, victim) {
  if (!w || !w.slayer || victim.kind !== 'monster') return 1;
  let m = 1;
  for (const [g, v] of Object.entries(w.slayer)) if (g === 'monster' || g === victim.type || (GROUPS[g] && GROUPS[g].includes(victim.type))) m += +v || 0;
  return m;
}
