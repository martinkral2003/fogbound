// Scripted fighters for tools/rpg-combat-test.js. cfg: {def:'none'|'block'|'parry'|'dodge', skill (0..1 chance to react), heavy (0..1), gap (s between swings), kite, cast, hold}
import * as Combat from '../src/rpg/combat.js';
import { MONSTER_MOVES } from '../src/rpg/combat/monsters.js';
import { st } from './rpg-combat-lib.js';

const face = (a, t) => Math.atan2(t.z - a.z, t.x - a.x);
const dist = (a, t) => Math.hypot(t.x - a.x, t.z - a.z);
const B = (a) => a.bot || (a.bot = { gap: 0, reacted: null, dodged: null, blockHold: 0, decide: 0, prevBlock: false });

export function fighter(tgtFn, cfg = {}) {
  return (a) => {
    const t = tgtFn(); const b = B(a);
    if (!t || !t.alive) return {};
    const d = dist(a, t), yaw = face(a, t), info = Combat.combatInfo(a), ti = Combat.combatInfo(t);
    const out = { yaw, lockId: t.id, mx: 0, mz: 0 };
    const reach = (info.reach || 2) + t.radius * 0.5;
    const towards = (s = 1) => { out.mx = Math.cos(yaw) * s; out.mz = Math.sin(yaw) * s; };
    b.gap -= 1 / 30;
    // ---- defence
    if (cfg.def && cfg.def !== 'none') {
      const threat = ti.attacking && d < ti.reach + 1.4 + (a.radius || 0);
      const mv = t.cs.move;
      if (threat && mv && b.reacted !== mv) { b.reacted = mv; b.willReact = st.rng() < (cfg.skill ?? 1); }
      if (threat && b.willReact) {
        if (cfg.def === 'block') { out.block = a.stamina > 0; b.blockHold = 0.35; }
        else if (cfg.def === 'parry') {
          if (ti.windupLeft <= 0.15 || t.cs.state === 'active' || b.blockHold > 0) { out.block = true; b.blockHold = 0.3; }
        } else if (cfg.def === 'dodge') {
          if (ti.windupLeft <= 0.19 && b.dodged !== mv && info.canBlock !== false) { out.dodge = true; b.dodged = mv; const s = Math.atan2(out.mz || 0, out.mx || 0); out.mx = Math.cos(yaw + 1.57); out.mz = Math.sin(yaw + 1.57); }
        }
      } else if (b.blockHold > 0) { b.blockHold -= 1 / 30; if (cfg.def !== 'parry' || b.blockHold > 0.12) out.block = cfg.def !== 'dodge'; }
      if (out.block || out.dodge) { if (out.block && !a.cs.blockPrev && !b.prevBlock) b.prevBlock = true; return out; }
    }
    b.prevBlock = false;
    // ---- ranged kiter
    if (cfg.kite) {
      if (d < cfg.kite) { out.mx = -Math.cos(yaw); out.mz = -Math.sin(yaw); out.sprint = true; }
      else if (d > cfg.kite + 8) towards();
      const need = a.cs.drawNeed || 1;
      if (a.cs.state === 'draw') out.attack = a.cs.drawT < need;
      else if (a.cs.state === 'idle' && a.cs.t > 0.05) { out.attack = true; out.attackPressed = true; }
      if (ti.attacking && d < ti.reach + 1.5 && ti.windupLeft < 0.2 && cfg.dodge !== false) out.dodge = true;
      return out;
    }
    // ---- caster
    if (cfg.cast) {
      if (d < 5) { out.mx = -Math.cos(yaw); out.mz = -Math.sin(yaw); } else if (d > 12) towards();
      if (a.cs.state === 'idle' && d < 18 && a.mana >= 12) out.slot = cfg.cast;
      return out;
    }
    // ---- melee approach / attack
    if (d > reach * 0.88) towards(); else if (cfg.circle) { out.mx = Math.cos(yaw + 1.57) * 0.5; out.mz = Math.sin(yaw + 1.57) * 0.5; }
    const punish = cfg.aggr || !cfg.def || cfg.def === 'none' || (ti.state === 'recover' && t.cs.move && t.cs.move.recover - t.cs.t > 0.5) || ti.state === 'stagger' || (ti.state === 'idle' && st.rng() < 0.1);
    if (d <= reach && b.gap <= 0 && a.cs.state === 'idle' && cfg.noAttack !== true && punish) {
      if (a.kind === 'monster') {
        const def = MONSTER_MOVES[a.type];
        out.attackPressed = true;
        if (def && st.rng() < (cfg.heavy ?? 0.35)) out.heavy = true;
        b.gap = cfg.gap ?? 0.1;
      } else if (st.rng() < (cfg.heavy ?? 0)) { out.heavy = true; b.gap = cfg.gap ?? 0.15; }
      else { out.attackPressed = true; b.gap = cfg.gap ?? 0.12; }
    }
    return out;
  };
}
// monsters: attack from their move's preferred range, ranged ones hold position
export function monsterBrain(tgtFn, cfg = {}) {
  return (a) => {
    const t = tgtFn(); if (!t || !t.alive) return {};
    const def = MONSTER_MOVES[a.type], b = B(a), d = dist(a, t), yaw = face(a, t);
    const out = { yaw, mx: 0, mz: 0 };
    const range = def.range;
    if (d > range * 0.85) { out.mx = Math.cos(yaw); out.mz = Math.sin(yaw); }
    b.gap -= 1 / 30;
    if (d <= range && a.cs.state === 'idle' && b.gap <= 0) {
      out.attackPressed = true;
      if (st.rng() < 0.3) out.heavy = true;
      b.gap = cfg.gap ?? 0.2;
    }
    return out;
  };
}
