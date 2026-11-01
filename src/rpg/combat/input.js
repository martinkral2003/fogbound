// The combat state machine driven by the shared input struct: handleInput (decide), updateCombat (advance timers/phases), moveMul, combatInfo.
import { emit, recompute, removeActor } from '../core.js';
import * as Items from '../items.js';
import { clamp } from '../../util.js';
import { hasStatus, weaponOf, spendStamina, isHero, atkSpeed } from './common.js';
import { startMelee, meleeActive } from './melee.js';
import { MONSTER_MOVES, pickMove } from './monsters.js';
import { beginDraw, releaseDraw } from './ranged.js';
import { castSpell, finishCast } from './spells.js';
import { POISE_DECAY, staggerActor } from './damage.js';

export const DODGE = { cost: 20, inv: 0.36, dur: 0.5, speed: 9.5, impT: 0.3, cd: 0.55 };
const BLOCK_RELOCK = 0.6;

export function moveMul(a) {
  const cs = a.cs;
  switch (cs.state) {
    case 'windup': return cs.move && cs.move.heavy ? 0.3 : 0.45;
    case 'active': return 0.3;
    case 'recover': return 0.65;
    case 'block': return 0.55;
    case 'draw': return 0.5;
    case 'cast': return 0.4;
    case 'stagger': case 'dead': return 0;
    case 'dodge': return 0.15;
    default: return cs.charging ? 0.6 : 1;
  }
}

export function combatInfo(a) {
  const cs = a.cs, m = cs.move, att = cs.state === 'windup' || cs.state === 'active';
  const def = a.kind === 'monster' ? MONSTER_MOVES[a.type] : null;
  return {
    attacking: att || cs.state === 'draw' || cs.state === 'cast',
    windupLeft: cs.state === 'windup' ? Math.max(0, (m ? m.windup : 0) - cs.t) : cs.state === 'draw' ? Math.max(0, (cs.drawNeed || 0) - cs.drawT) : cs.state === 'cast' ? Math.max(0, (cs.dur || 0) - cs.t) : 0,
    reach: m && m.reach ? m.reach : def ? def.moves.basic.reach : weaponOf(a).reach,
    canBlock: a.alive && (a.kind === 'monster' ? !!(def && def.blocks) : true) && (cs.state === 'idle' || cs.state === 'block'),
    staggered: cs.state === 'stagger',
    state: cs.state, move: m ? m.id : null, heavy: !!(m && m.heavy), telegraph: !!cs.telegraph,
  };
}

export function startDodge(st, a, inp) {
  const cs = a.cs;
  if (st.t < (cs.dodgeCd || 0) || (a.kind !== 'monster' && a.stamina < 4)) return false;
  spendStamina(st, a, DODGE.cost * (a.perks && a.perks.dodgeCostPct ? 1 + a.perks.dodgeCostPct / 100 : 1));
  const ml = Math.hypot(inp.mx || 0, inp.mz || 0);
  const dx = ml > 0.1 ? inp.mx / ml : -Math.cos(a.yaw), dz = ml > 0.1 ? inp.mz / ml : -Math.sin(a.yaw);
  const sp = DODGE.speed * (a.stamina <= 0 ? 0.6 : 1);
  a.imp = { vx: dx * sp, vz: dz * sp, t: DODGE.impT };
  cs.state = 'dodge'; cs.t = 0; cs.kind = 'dodge'; cs.inv = st.t + DODGE.inv * (a.stamina <= 0 ? 0.5 : 1); cs.dodgeCd = st.t + DODGE.dur + DODGE.cd;
  cs.blocking = false; cs.charging = false; cs.move = null; cs.hitSet = null; cs.buffer = 0; cs.pending = null;
  emit(st, { type: 'dodge', actor: a.id, x: a.x, z: a.z });
  return true;
}

function useSlot(st, a, slot) {
  const q = a.quick[slot];
  if (!q) return;
  if (typeof q === 'string' && q.startsWith('spell:')) { castSpell(st, a, q.slice(6), { yaw: a.yaw, pitch: a.pitch, lockId: a.cs.lock }); return; }
  if (typeof Items.useQuick === 'function') Items.useQuick(st, a, slot); else Items.useItem(st, a, q);
  recompute(st, a);
}

export function handleInput(st, a, inp, dt) {
  const cs = a.cs;
  if (!a.alive || cs.state === 'dead' || a.kind === 'npc') return;
  const lock = inp.lockId ? st.byId.get(inp.lockId) : null;
  cs.lock = lock && lock.alive && lock.kind !== 'npc' ? lock.id : 0;
  // block edge bookkeeping (parry needs a fresh press)
  const blockEdge = !!inp.block && !cs.blockPrev; cs.blockPrev = !!inp.block;
  if (hasStatus(a, 'stun')) { cs.pending = null; cs.charging = false; if (cs.state === 'block') { cs.state = 'idle'; cs.t = 0; } return; }
  const st0 = cs.state, free = st0 === 'idle' || st0 === 'block';
  const lateRecover = st0 === 'recover' && cs.move && cs.t > cs.move.recover * 0.55;
  const mon = a.kind === 'monster', def = mon ? MONSTER_MOVES[a.type] : null;
  if (inp.attackPressed && !free && !mon) cs.buffer = 0.35;
  // dodge: from idle, block or the tail of a recover
  if (inp.dodge && !mon && (free || lateRecover || (st0 === 'draw'))) { startDodge(st, a, inp); return; }
  if (inp.slot >= 0 && (free || lateRecover)) useSlot(st, a, inp.slot);
  const w = weaponOf(a), ranged = !mon && !!w.ranged || (!mon && (w.kind === 'bow' || w.kind === 'crossbow'));
  if (!(free || lateRecover || st0 === 'draw')) { if (st0 !== 'cast') cs.blocking = false; if (st0 !== 'windup') cs.pending = null; if (st0 === 'draw') {/* handled below */} }
  // ---- ranged draw
  if (st0 === 'draw') {
    cs.drawT += dt * (cs.drawNeed ? 1 : 1);
    if (!inp.attack || cs.drawT > cs.drawNeed + 4) releaseDraw(st, a, w, !inp.attack);
    if (inp.block && cs.state === 'draw') { cs.state = 'idle'; cs.t = 0; cs.drawT = 0; }   // cancel the draw
    return;
  }
  if (!(free || lateRecover)) return;
  if (a.sheathed && (inp.attackPressed || inp.attack) && !mon) { a.sheathed = false; return; }
  if (a.sheathed) return;
  // ---- monsters: explicit moves
  if (mon) {
    if (inp.block && def && def.blocks && free) { if (cs.state !== 'block') { cs.state = 'block'; cs.t = 0; cs.blockT = 0; cs.parryOk = false; } cs.blocking = true; }
    else if (cs.state === 'block') { cs.state = 'idle'; cs.t = 0; cs.blocking = false; }
    if ((inp.attackPressed || inp.heavy || inp.move) && free) {
      const m = pickMove(st, a, inp);
      if (m) { cs.blocking = false; startMelee(st, a, false, m); }
    }
    return;
  }
  // ---- hero: block
  if (inp.block && a.stamina > 0 && (free || lateRecover) && !cs.pending && !cs.charging) {
    if (cs.state !== 'block') {
      cs.state = 'block'; cs.t = 0; cs.blockT = 0; cs.kind = 'block';
      cs.parryOk = blockEdge && st.t >= (cs.parryLock || 0);
      if (blockEdge) cs.parryLock = st.t + BLOCK_RELOCK;
    }
    cs.blocking = true; cs.blockT += dt;
    if (cs.blockT > 0.25) cs.parryOk = false;
    if (a.stamina <= 0) { cs.state = 'idle'; cs.blocking = false; }
    return;
  }
  if (cs.state === 'block') { cs.state = 'idle'; cs.t = 0; cs.blocking = false; cs.blockT = 0; }
  cs.blocking = false;
  const idle = cs.state === 'idle' || lateRecover;
  if (!idle) return;
  // ---- hero: attack
  if (ranged) {
    if ((inp.attackPressed || inp.attack) && !cs.drawBlock) { if (beginDraw(st, a, w)) cs.drawBlock = true; }
    if (!inp.attack) cs.drawBlock = false;
    return;
  }
  const consume = cs.buffer > 0 && st0 === 'idle'; if (consume) cs.buffer = 0;
  if (inp.heavy) { cs.pending = null; cs.charging = false; startMelee(st, a, true); return; }
  if (inp.attackPressed || consume) {
    if (inp.attack && !consume && isHero(a) && a.kind === 'player') { cs.pending = 0; return; }   // held: wait to see if this becomes a heavy
    cs.pending = null; startMelee(st, a, false); return;
  }
  if (cs.pending != null) {
    if (!inp.attack) { cs.pending = null; cs.charging = false; startMelee(st, a, false); return; }
    cs.pending += dt;
    if (cs.pending > 0.16) cs.charging = true;
    if (cs.pending > 0.4 && !cs.heavyReady) { cs.heavyReady = true; emit(st, { type: 'sfx', name: 'heavyReady', x: a.x, z: a.z, actor: a.id }); }
    if (cs.pending > 2.5) { cs.pending = null; cs.charging = false; cs.heavyReady = false; }
  } else { cs.charging = false; cs.heavyReady = false; }
}

export function updateCombat(st, a, dt) {
  const cs = a.cs;
  if (a.expireAt && st.t >= a.expireAt && a.alive) { a.alive = false; cs.state = 'dead'; removeActor(st, a); return; }
  if (a.owner && a.alive && !(st.byId.get(a.owner) && st.byId.get(a.owner).alive)) { a.alive = false; cs.state = 'dead'; removeActor(st, a); return; }
  if (!a.alive || cs.state === 'dead') return;
  cs.t += dt;
  if (cs.buffer > 0) cs.buffer -= dt;
  if (cs.comboT > 0) cs.comboT -= dt;
  if (cs.poiseImm > 0) cs.poiseImm -= dt;
  if (cs.poise > 0) cs.poise = Math.max(0, cs.poise - POISE_DECAY * dt);
  if (hasStatus(a, 'stun') && cs.state !== 'stagger' && cs.state !== 'dead') staggerActor(st, a, 0.3, true);
  const m = cs.move;
  switch (cs.state) {
    case 'windup':
      if (cs.t >= m.windup) { cs.state = 'active'; cs.t = 0; meleeActive(st, a); }
      break;
    case 'active':
      meleeActive(st, a);
      if (cs.t >= m.active) { cs.state = 'recover'; cs.t = 0; cs.comboT = 0.45 + m.recover; }
      break;
    case 'recover':
      if (cs.t >= (m ? m.recover : 0.2)) { cs.state = 'idle'; cs.t = 0; cs.move = null; cs.hitSet = null; }
      break;
    case 'stagger':
      if (cs.t >= cs.stagger) { cs.state = 'idle'; cs.t = 0; cs.stagger = 0; }
      break;
    case 'dodge':
      if (cs.t >= DODGE.dur) { cs.state = 'idle'; cs.t = 0; }
      break;
    case 'cast':
      if (cs.t >= cs.dur) finishCast(st, a);
      break;
    default: break;
  }
}
export { clamp, atkSpeed };
