// FLOW: shared helpers for monster and rival AI (input building, combat-state queries, steering).
import * as Combat from './combat.js';

export function blank(a) {
  return { mx: 0, mz: 0, yaw: a ? a.yaw : 0, pitch: 0, sprint: false, crouch: false, jump: false, attack: false, attackPressed: false, heavy: false, block: false, dodge: false, interact: false, slot: -1, lockId: 0, cmds: [] };
}
export const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const distXZ = (a, x, z) => Math.hypot(a.x - x, a.z - z);
export const yawTo = (a, x, z) => Math.atan2(z - a.z, x - a.x);
export const isHero = (a) => a.kind === 'player' || a.kind === 'rival';

// normalized combat info (works with or without Combat.combatInfo)
export function cinfo(a) {
  if (Combat.combatInfo) { try { const i = Combat.combatInfo(a); if (i) return i; } catch (e) { /* fall through */ } }
  const s = a.cs ? a.cs.state : 'idle';
  const w = a.d && a.d.weapon;
  return { attacking: s === 'windup' || s === 'active', windupLeft: s === 'windup' ? Math.max(0, 0.35 - a.cs.t) : 0, reach: w ? w.reach || 1.6 : 1.6, canBlock: s === 'idle' || s === 'block', staggered: s === 'stagger' };
}
export function monsterMoves(type) {
  const M = Combat.MONSTER_MOVES; if (!M || !M[type]) return null;
  const mv = M[type].moves; return mv ? Object.keys(mv).map((k) => ({ id: k, ...mv[k] })) : null;
}
// day length 480 s as in the warlord mode; night is the last 40% of the day (rpg clients may override with st.night)
export function isNight(st) { if (typeof st.night === 'boolean') return st.night; const p = (st.t / 480) % 1; return p > 0.6; }

// steer a (via input) toward a point; returns remaining distance. Slides along obstacles through core's collision; detours when stuck.
export function steer(st, a, inp, x, z, speed = 1) {
  const ai = a.ai, d = distXZ(a, x, z);
  if (d < 0.25) return d;
  let ang = yawTo(a, x, z);
  if (ai) {
    ai.stuckT = (ai.stuckT || 0);
    const moved = Math.hypot(a.x - (ai.lx ?? a.x), a.z - (ai.lz ?? a.z));
    ai.chk = (ai.chk || 0) + 1;
    if (ai.chk >= 8) { // every ~0.27 s
      ai.stuckT = moved < 0.35 && speed > 0.3 ? ai.stuckT + 1 : Math.max(0, ai.stuckT - 1);
      ai.lx = a.x; ai.lz = a.z; ai.chk = 0;
      if (ai.stuckT > 2 && !ai.detourT) { ai.detourN = (ai.detourN || 0) + 1; ai.detourT = 0.8 + 0.5 * Math.min(6, ai.detourN); ai.detourSign = ai.detourN % 2 ? 1 : -1; ai.pathAge = 99; }
    }
    if (ai.detourT > 0) { ai.detourT -= 1 / 30; ang += ai.detourSign * 1.4; if (ai.detourT <= 0) { ai.detourT = 0; ai.stuckT = 0; if (moved > 1) ai.detourN = 0; } }
  }
  inp.mx = Math.cos(ang) * speed; inp.mz = Math.sin(ang) * speed;
  return d;
}
export function face(a, inp, x, z) { inp.yaw = yawTo(a, x, z); }
export function hpFrac(a) { return a.maxHp > 0 ? a.hp / a.maxHp : 0; }
