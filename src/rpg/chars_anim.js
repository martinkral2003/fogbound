// FOGBOUND: HERO procedural animation for the chars_body rig. pose targets are computed from the actor's combat state (cs) and movement,
// then smoothed. Attack swings are keyframed on the sim's own windup/active/recover timings so telegraphs match the hit frames.
import { clamp, lerp } from '../util.js';

const KEYS = ['rS', 'rA', 'rE', 'lS', 'lA', 'lE', 'tY', 'tZ', 'tX', 'hY', 'hX', 'tL', 'tR', 'kL', 'kR', 'drop', 'lean'];
// swing keyframes: [cock, end] partial poses (missing keys = idle value)
const SW = {
  light0: [{ rS: 2.5, rA: 0.5, rE: 0.7, tY: 0.55, tZ: -0.05 }, { rS: 0.9, rA: -0.3, rE: 0.25, tY: -0.65, tZ: 0.12 }],
  light1: [{ rS: 1.2, rA: -0.5, rE: 0.5, tY: -0.65 }, { rS: 1.5, rA: 1.0, rE: 0.15, tY: 0.75, tZ: 0.1 }],
  light2: [{ rS: 3.0, rA: 0.15, rE: 1.2, tZ: -0.18, kL: -0.2 }, { rS: 0.7, rA: 0.0, rE: 0.2, tZ: 0.4, kL: -0.5 }],
  heavy:  [{ rS: 3.3, rA: 0.2, rE: 1.6, tZ: -0.32, tL: -0.2, tR: -0.2, kL: -0.5, kR: -0.5, drop: -0.1 }, { rS: 0.45, rA: 0, rE: 0.1, tZ: 0.55, tL: 0.6, tR: -0.3, kL: -0.9, drop: -0.28 }],
  thrust: [{ rS: 1.15, rA: 0.1, rE: 2.1, tY: 0.5, tZ: -0.05 }, { rS: 1.55, rA: 0, rE: 0.05, tY: -0.35, tZ: 0.25, tL: 0.6, tR: -0.4, kL: -0.5 }],
};

function idlePose(P, a, g) {
  const sheathed = a.sheathed || !g || g.wKind === 'fists';
  P.rS = sheathed ? 0.06 : 0.3; P.rE = sheathed ? 0.12 : 0.55; P.rA = 0.08;
  P.lS = 0.1; P.lE = 0.3; P.lA = 0.08;
  if (g && !a.sheathed) {
    if (g.ranged) { if (g.wKind === 'bow') { P.lS = 1.1; P.lE = 0.3; P.rS = 0.2; P.rE = 0.5; } else { P.rS = 1.35; P.rE = 0.55; P.lS = 1.45; P.lE = 0.5; } }
    else if (g.twoHand) { P.rS = 0.55; P.rE = 0.9; P.lS = 0.7; P.lE = 0.9; }
    else if (g.shield) { P.lS = 0.7; P.lE = 1.1; }
    else if (g.torch) { P.lS = 0.6; P.lE = 1.0; }
  }
}
const ease = (p) => p * p * (3 - 2 * p);

export function swingKey(g, mv) {
  const id = mv && mv.id ? String(mv.id) : 'light0';
  const kind = (g && g.wKind) || (mv && mv.weapon);
  if (kind === 'spear' || (kind === 'dagger' && id !== 'light1')) return 'thrust';
  if (id === 'heavy') return 'heavy';
  if (id.startsWith('light')) return id;
  return id === 'basic' || id === 'lunge' || id === 'pounce' ? 'light0' : id === 'slam' || id === 'overhead' ? 'heavy' : 'light0';
}

export function targetPose(P, a, g, ctx) {
  const cs = a.cs, st = cs.state;
  idlePose(P, a, g);
  P.tY = P.tZ = P.tX = P.hY = P.hX = P.tL = P.tR = P.kL = P.kR = P.drop = P.lean = 0;
  P.rate = 12; P.walk = true;
  if (ctx.crouch) { P.drop = -0.34; P.tZ = 0.22; P.kL = P.kR = -0.7; P.lean = 1; }
  if (!ctx.ground) { P.walk = false; P.tL = 0.5; P.tR = -0.2; P.kL = -0.9; P.kR = -0.5; P.rA = P.lA = 0.7; P.rS = 0.5; P.lS = 0.5; }
  const mv = cs.move;
  if (st === 'windup' || st === 'active' || st === 'recover') {
    const key = swingKey(g, mv), [c, e] = SW[key] || SW.light0, w = mv ? mv.windup || 0.4 : 0.4, ac = mv ? mv.active || 0.12 : 0.12, rc = mv ? mv.recover || 0.4 : 0.4;
    const base = { rS: P.rS, rA: P.rA, rE: P.rE, tY: 0, tZ: 0, tL: 0, tR: 0, kL: 0, kR: 0, drop: 0 };
    const bv = (k) => (base[k] !== undefined ? base[k] : 0);
    const mix = (A, B, p) => { for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) P[k] = lerp(A[k] !== undefined ? A[k] : bv(k), B[k] !== undefined ? B[k] : bv(k), p); };
    if (st === 'windup') mix(base, c, ease(clamp(cs.t / w, 0, 1)));
    else if (st === 'active') mix(c, e, 1 - Math.pow(1 - clamp(cs.t / ac, 0, 1), 2));
    else mix(e, base, ease(clamp(cs.t / rc, 0, 1)));
    P.rate = st === 'windup' ? 30 : 60; P.walk = !(key === 'heavy' || key === 'light2');
    if (g && g.twoHand) { P.lS = P.rS * 0.9; P.lE = P.rE; P.lA = -P.rA * 0.4; }
    if (g && g.wKind === 'fists') P.rE = Math.max(P.rE, 0.3);
    P.lunge = st === 'active' ? 1 : 0;
  } else if (cs.pending != null && cs.charging && (st === 'idle' || st === 'recover')) {
    // holding the attack button: the heavy swing winds up (hold > 0.4 s for the full charge)
    const p = ease(clamp(cs.pending / 0.4, 0, 1)), c = SW.heavy[0];
    for (const k in c) P[k] = lerp(P[k] || 0, c[k], p);
    if (g && g.twoHand) { P.lS = P.rS * 0.9; P.lE = P.rE; }
    P.rate = 18; P.walk = false;
  } else if (st === 'block') {
    P.rS = 1.2; P.rE = 1.7; P.lS = 1.15; P.lE = 1.65; P.lA = -0.2; P.rA = 0.15; P.tY = 0.3; P.tZ = 0.08; P.kL = -0.2; P.rate = 22;
    if (g && g.shield) { P.rS = 0.6; P.rE = 1.0; }
  } else if (st === 'dodge') { P.rate = 30; P.walk = false; P.roll = true; }
  else if (st === 'stagger') { P.tZ = -0.45; P.hX = -0.3; P.rA = P.lA = 0.9; P.rS = 0.3; P.lS = 0.4; P.kL = P.kR = -0.3; P.rate = 40; P.walk = false; }
  else if (st === 'draw') {
    const p = clamp(cs.drawT / Math.max(0.2, cs.drawNeed || 0.9), 0, 1); P.draw = p; P.walk = true;
    if (g && g.wKind === 'crossbow') { P.rS = 1.5; P.rE = 0.4; P.lS = 1.55; P.lE = 0.3; P.tY = 0.1; }
    else { P.lS = 1.55; P.lE = 0.05; P.lA = 0; P.rS = 1.5; P.rA = 0; P.rE = lerp(0.3, 2.3, p); P.tY = 0.5; P.hY = -0.35; P.tZ = 0.05; }
    P.rate = 25;
  } else if (st === 'cast') {
    const p = clamp(cs.t / Math.max(0.2, cs.dur || 0.5), 0, 1);
    P.tY = lerp(0.3, -0.2, p); P.rate = 25;
    if (g && g.wKind === 'staff') { P.rS = lerp(1.2, 2.3, ease(Math.min(1, p * 1.5))); P.rE = 0.4; P.lS = 1.3; P.lE = 0.4; }
    else { P.rS = lerp(0.9, 1.65, ease(p)); P.rE = lerp(1.4, 0.1, ease(p)); P.lS = lerp(1.3, 0.9, p); P.lE = 0.5; P.lA = 0.5; P.tZ = -0.05; }
  }
  if (a.ai && a.ai.state === 'dead') P.walk = false;
  return P;
}

export function applyPose(rig, P, cur, dt, ctx) {
  const k = 1 - Math.exp(-(P.rate || 12) * dt);
  for (const key of KEYS) cur[key] = lerp(cur[key] || 0, P[key] || 0, k);
  const ph = ctx.phase, sp = ctx.speedN; // sp: 0 idle .. 1 walk .. ~2.6 sprint
  const amp = P.walk ? clamp(sp, 0, 1.4) : 0, run = clamp((sp - 1) / 1.5, 0, 1);
  const sL = Math.sin(ph), sR = Math.sin(ph + Math.PI);
  const A = (0.42 + 0.55 * run) * amp;
  const t = ctx.now;
  const breathe = Math.sin(t * 1.9 + ctx.seed) * 0.012;
  let thL = sL * A, thR = sR * A, knL = -Math.max(0, Math.cos(ph)) * (0.5 + 0.9 * run) * amp - 0.04, knR = -Math.max(0, Math.cos(ph + Math.PI)) * (0.5 + 0.9 * run) * amp - 0.04;
  if (cur.lean) { thL += 0.9 * cur.lean; thR += 0.9 * cur.lean; knL += -1.3 * cur.lean; knR += -1.3 * cur.lean; }
  rig.hipL.rotation.z = thL + cur.tL; rig.hipR.rotation.z = thR + cur.tR;
  rig.knL.rotation.z = knL + cur.kL; rig.knR.rotation.z = knR + cur.kR;
  rig.hips.position.y = 0.92 + cur.drop + Math.abs(Math.cos(ph)) * 0.035 * amp * (1 + run) - (cur.lean ? 0.12 : 0);
  rig.torso.rotation.y = cur.tY + Math.sin(ph) * 0.12 * amp; rig.torso.rotation.z = cur.tZ + run * 0.16 + breathe; rig.torso.rotation.x = cur.tX;
  rig.head.rotation.y = cur.hY - cur.tY * 0.5; rig.head.rotation.z = cur.hX - cur.tZ * 0.4 + breathe * 2;
  const swayA = A * 0.75, ar = 0.18;
  const walkArm = P.walk && !(ctx.cs === 'windup' || ctx.cs === 'active') ? 1 : 0;
  rig.shR.rotation.z = cur.rS + (walkArm * sL * swayA * (P.rS > 1 ? 0 : 1)); rig.shL.rotation.z = cur.lS + (walkArm * sR * swayA * (P.lS > 1 ? 0 : 1));
  rig.shR.rotation.x = cur.rA + breathe; rig.shL.rotation.x = -(cur.lA + breathe);
  rig.elR.rotation.z = cur.rE + (cur.rE < 1 ? 0 : 0); rig.elL.rotation.z = cur.lE;
  void ar;
  if (cur.draw !== undefined || P.draw !== undefined) { /* handled by chars.js (arrow + string) */ }
}
