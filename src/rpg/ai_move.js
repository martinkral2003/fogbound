// FLOW: rival movement helpers: A*-path following with a per-tick budget, sprint hysteresis, interaction.
import { findPath, snap } from './flow/nav.js';
import { dist, distXZ, yawTo, steer } from './ai_util.js';
import { groupPower, power } from './ai_fight.js';

// camps (and the king) that would crush this hero: path around them. refreshed every few seconds.
function dangerZones(st, a) {
  const ai = a.ai; if (ai.avoidT > st.t) return ai.avoid;
  ai.avoidT = st.t + 4; const me = power(a).p, out = [];
  for (const c of st.flow.camps) {
    const ms = []; for (const id of c.mons) { const m = st.byId.get(id); if (m && m.alive) ms.push(m); }
    if (ms.length && groupPower(ms, a).p > me * 0.5) out.push({ x: c.x, z: c.z, r: 17 });
  }
  const k = st.byId.get(st.flow.boss);
  if (k && k.alive && !(st.zone && st.zone.stage >= 3) && a.lvl < 6) out.push({ x: k.x, z: k.z, r: 24 });
  ai.avoid = out; return out;
}

export function moveTo(st, a, inp, x, z, opts = {}) {
  const ai = a.ai, d = distXZ(a, x, z);
  const speed = opts.speed ?? 1;
  if (d > 9) {
    const moved = !ai.pathGoal || Math.hypot(ai.pathGoal[0] - x, ai.pathGoal[1] - z) > 8;
    ai.pathAge = (ai.pathAge || 0) + 1 / 30;
    if ((moved || ai.pathAge > 7 || (ai.stuckT > 4 && ai.pathAge > 1.5)) && st.flow.pathBudget > 0 && (ai.pathCd || 0) <= st.t) {
      st.flow.pathBudget--; ai.pathCd = st.t + 0.8;
      const p = findPath(st, a.x, a.z, x, z, dangerZones(st, a));
      ai.path = p; ai.pathGoal = [x, z]; ai.pathAge = 0; ai.stuckT = 0;
      if (!p) { const s = snap(st, x, z); if (s) ai.pathGoal = [x, z]; }
    }
    if (ai.path && ai.path.length) {
      while (ai.path.length > 1 && Math.hypot(ai.path[0][0] - a.x, ai.path[0][1] - a.z) < 3) ai.path.shift();
      const wp = ai.path[0];
      if (ai.path.length === 1 && Math.hypot(wp[0] - a.x, wp[1] - a.z) < 1.5) ai.path = null;
      else { steer(st, a, inp, wp[0], wp[1], speed); inp.yaw = yawTo(a, wp[0], wp[1]); sprint(a, inp, opts.sprint ?? d > 20); return d; }
    }
  } else ai.path = null;
  steer(st, a, inp, x, z, speed); inp.yaw = yawTo(a, x, z);
  sprint(a, inp, opts.sprint ?? d > 20);
  return d;
}

export function sprint(a, inp, want) {
  const ai = a.ai;
  if (a.stamina < a.maxStamina * 0.12) ai.tired = true; else if (a.stamina > a.maxStamina * 0.5) ai.tired = false;
  inp.sprint = !!want && !ai.tired && (inp.mx || inp.mz) && a.cs.state === 'idle';
}

// try to open / pick up the loot target when close enough. returns true while interacting.
export function interactWith(st, a, inp, cand) {
  const ai = a.ai, d = distXZ(a, cand.x, cand.z);
  if (d > 2.1) return false;
  inp.yaw = yawTo(a, cand.x, cand.z); inp.mx = inp.mz = 0;
  ai.intT = (ai.intT || 0) - 1 / 30;
  if (ai.intT <= 0) {
    inp.interact = true; ai.intT = 0.45;
    const id = cand.target.id; ai.tries[id] = (ai.tries[id] || 0) + 1;
    if (ai.tries[id] > 4) ai.ignore[id] = st.t + 90;
  }
  return true;
}
export { dist };
