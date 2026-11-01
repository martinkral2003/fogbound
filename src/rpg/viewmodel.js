// FOGBOUND: HERO first-person viewmodel: a forearm + the equipped weapon (and shield / torch / bow) hanging on the camera,
// animated from the same combat state (cs) as the third-person rig so the wind-up telegraph stays readable.
import * as THREE from 'three';
import { box, mat, mk } from './chars_body.js';
import { makeWeapon, makeShield, makeTorch } from './chars_weapons.js';
import { swingKey } from './chars_anim.js';
import { clamp, lerp } from '../util.js';

// per swing: cock / end poses of the weapon hand: [x, y, z, rx, ry, rz] in camera space (blade along +y)
const SW = {
  light0: [[0.5, 0.0, -0.45, -0.3, 0, -1.1], [-0.25, -0.35, -0.55, -0.9, 0, 1.0]],
  light1: [[-0.3, -0.25, -0.5, -0.5, 0, 1.2], [0.55, -0.1, -0.5, -0.5, 0, -1.0]],
  light2: [[0.3, 0.35, -0.3, 0.5, 0, -0.2], [0.05, -0.35, -0.7, -1.3, 0, 0]],
  heavy: [[0.35, 0.55, -0.2, 0.9, 0, -0.1], [0.0, -0.5, -0.75, -1.6, 0, 0]],
  thrust: [[0.35, -0.3, -0.1, -1.3, 0, -0.1], [0.12, -0.1, -0.95, -1.5, 0, 0]],
};
const IDLE = [0.34, -0.38, -0.55, -0.45, 0, -0.12], BLOCK = [0.02, -0.12, -0.5, -0.15, 0, 0.3], CAST = [0.2, -0.15, -0.65, -1.4, 0, 0];
const ease = (p) => p * p * (3 - 2 * p), D = 1.55;

export function createViewModel(camera) {
  const root = new THREE.Group(), hand = new THREE.Group(), off = new THREE.Group();
  root.add(hand, off); root.visible = false; camera.add(root);
  const skin = mat(0xc2a080), sleeve = mat(0x4a4234);
  // forearms hang from the hand pivot toward the bottom-right of the screen
  const arm = new THREE.Group(); mk(box(0.1, 0.1, 0.8, 0, 0, 0.4), sleeve, 0, 0, 0, arm); mk(box(0.09, 0.09, 0.14, 0, 0, 0.02), skin, 0, 0, 0, arm); arm.rotation.set(0.5, -0.35, 0); hand.add(arm);
  const arm2 = new THREE.Group(); mk(box(0.1, 0.1, 0.8, 0, 0, 0.4), sleeve, 0, 0, 0, arm2); mk(box(0.09, 0.09, 0.14, 0, 0, 0.02), skin, 0, 0, 0, arm2); arm2.rotation.set(0.5, 0.35, 0); off.add(arm2);
  let key = '', weapon = null, side = null, wk = '';
  const pose = [0, 0, 0, 0, 0, 0], cur = [...IDLE];
  function mount(a) {
    const eq = a.equip || {}, w = eq.weapon, oh = eq.offhand, k = (w ? (w.uid || w.def || w.name) : '') + '|' + (oh ? (oh.uid || oh.def || oh.name) : '') + '|' + (a.sheathed ? 1 : 0);
    if (k === key) return; key = k;
    if (weapon) weapon.removeFromParent(); if (side) side.removeFromParent(); weapon = side = null;
    wk = w ? w.kind : 'fists';
    if (w && !a.sheathed) { weapon = makeWeapon(w); weapon.scale.setScalar(1.05); (w.kind === 'bow' ? off : hand).add(weapon); if (w.kind === 'bow') weapon.rotation.set(0, 0, 0); }
    if (oh && !a.sheathed && !(w && w.twoHanded)) { side = oh.kind === 'shield' ? makeShield(oh) : oh.kind === 'torch' ? makeTorch(false) : null; if (side) { off.add(side); side.position.set(0.0, 0.05, 0.2); side.rotation.set(0, oh.kind === 'shield' ? Math.PI : 0, 0); } }
  }
  function update(a, active, dt, now) {
    root.visible = active && a.alive;
    if (!root.visible) return;
    mount(a);
    const cs = a.cs, mv = cs.move, g = { wKind: wk }, k = swingKey(g, mv);
    let tgt = IDLE;
    const sp = Math.hypot(a.vx || 0, a.vz || 0);
    if (cs.state === 'windup' || cs.state === 'active' || cs.state === 'recover') {
      const [c, e] = SW[k] || SW.light0, w = mv ? mv.windup || 0.4 : 0.4, ac = mv ? mv.active || 0.12 : 0.12, rc = mv ? mv.recover || 0.4 : 0.4;
      const mix = (A, B, p) => { for (let i = 0; i < 6; i++) pose[i] = lerp(A[i], B[i], p); };
      if (cs.state === 'windup') mix(IDLE, c, ease(clamp(cs.t / w, 0, 1))); else if (cs.state === 'active') mix(c, e, 1 - Math.pow(1 - clamp(cs.t / ac, 0, 1), 2)); else mix(e, IDLE, ease(clamp(cs.t / rc, 0, 1)));
      tgt = pose;
    } else if (cs.pending != null && cs.charging && (cs.state === 'idle' || cs.state === 'recover')) { const p = ease(clamp(cs.pending / 0.4, 0, 1)), c = SW.heavy[0]; for (let i = 0; i < 6; i++) pose[i] = lerp(IDLE[i], c[i], p); tgt = pose;
    } else if (cs.state === 'block') tgt = BLOCK;
    else if (cs.state === 'cast') tgt = CAST;
    else if (cs.state === 'draw') { for (let i = 0; i < 6; i++) pose[i] = IDLE[i]; pose[0] = 0.3; pose[2] = -0.5; tgt = pose; }
    else if (cs.state === 'stagger') { for (let i = 0; i < 6; i++) pose[i] = IDLE[i]; pose[1] = -0.7; pose[3] = 0.4; tgt = pose; }
    else if (cs.state === 'dodge') { for (let i = 0; i < 6; i++) pose[i] = IDLE[i]; pose[1] = -0.6; pose[0] = 0.5; tgt = pose; }
    const kk = 1 - Math.exp(-(cs.state === 'windup' || cs.state === 'active' ? 38 : 14) * dt);
    for (let i = 0; i < 6; i++) cur[i] = lerp(cur[i], tgt[i], kk);
    const bob = a.moving ? Math.sin(now * (a.sprinting ? 12 : 8)) * 0.012 * Math.min(1, sp / 3) : Math.sin(now * 1.8) * 0.004;
    hand.position.set(cur[0] * D, (cur[1] + bob) * D, cur[2] * D); hand.rotation.set(cur[3], cur[4], cur[5]);
    off.position.set(-0.34 * D, (-0.36 + bob) * D, -0.5 * D); off.rotation.set(-0.25, 0, 0.1);
    if (wk === 'bow' || wk === 'crossbow') { off.position.set(-0.05 * D, -0.2 * D, -0.6 * D); if (weapon && wk === 'bow') { weapon.rotation.set(0, 0, 0); } }
    arm2.visible = !!side || wk === 'bow' || wk === 'crossbow' || cs.state === 'block';
  }
  return { root, update, dispose() { root.removeFromParent(); } };
}
