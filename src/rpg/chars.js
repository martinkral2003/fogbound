// FOGBOUND: HERO characters. createCharacter(actor, opts) -> {obj, top, update(a, ctx), dispose()}.
// Heroes/rivals/NPCs use the jointed human rig (chars_body/gear/anim); monsters reuse the models.js builders at human-ish scale.
import * as THREE from 'three';
import * as MD from '../models.js';
import { clamp, angDiff } from '../util.js';
import { buildRig, LOOKS, box, cyl, sph, mat, mk } from './chars_body.js';
import { applyGear, gearKey } from './chars_gear.js';
import { targetPose, applyPose } from './chars_anim.js';

const HAIR = { grey: 0x9a9a90, black: 0x151515, red: 0x8a3a20, brown: 0x4a3322, blond: 0xc8a860, white: 0xd8d8d0 };
function hairOf(s) { for (const k in HAIR) if (String(s || '').includes(k)) return HAIR[k]; return null; }
function shade(hex, f) { const c = new THREE.Color(hex); c.multiplyScalar(f); return c.getHex(); }

// pick a LOOKS entry + colour variation for an actor
export function lookFor(a) {
  let base = a.kind === 'player' ? 'player' : a.kind === 'rival' ? (a.archetype || 'warrior') : (a.role === 'smith' || a.npcId === 'brannoch' ? 'smith' : a.npcId === 'vessa' ? 'alchemist' : a.npcId === 'maren' ? 'priest' : a.role === 'fence' || a.role === 'general' ? 'merchant' : 'villager');
  const L = { ...(LOOKS[base] || LOOKS.villager) };
  const h = (a.id * 2654435761) >>> 0, v = 0.82 + ((h >> 3) % 40) / 100;
  if (a.kind === 'rival') { const c = new THREE.Color(L.cloth); c.offsetHSL((((h >> 5) % 100) / 100 - 0.5) * 0.25, 0, 0); L.cloth = c.getHex(); L.skin = shade(L.skin, v); if ((h >> 9) % 3 === 0) L.cloak = shade(L.cloth, 0.55); }
  if (a.look) {
    if (a.look.tint) L.cloth = parseInt(String(a.look.tint).replace('#', ''), 16) || L.cloth;
    const hc = hairOf(a.look.hair); if (hc !== null) L.hair = hc;
    L.bald = /bald|shaved/.test(a.look.hair || ''); L.outfit = a.look.outfit; L.prop = a.look.prop;
  }
  L.scale = a.kind === 'player' ? 1 : 0.97 + ((h >> 7) % 8) / 100;
  return L;
}

// outfit extras for NPCs: long skirt/robe, apron, props in hand
function dress(rig, L, gear) {
  const o = L.outfit || '';
  if (/robe|dress/.test(o)) mk(box(0.3 * rig.b, 0.62, rig.W * 0.95, 0, -0.31, 0), mat(L.cloth), 0, -0.06, 0, rig.hips);
  if (/apron/.test(o)) mk(box(0.04, 0.55, 0.36, 0.14, -0.12, 0), mat(0x6a5a44), 0, 0, 0, rig.torso).position.y = 0.4;
  if (/hood/.test(o)) mk(cyl(0, 0.17, 0.3, 6, 0.15), mat(L.cloth), -0.05, 0.16, 0, rig.head).rotation.z = 0.35;
  const pr = L.prop;
  if (pr && !gear.weapon) {
    const g = new THREE.Group();
    if (pr === 'hammer') { mk(cyl(0.025, 0.025, 0.5, 6, 0.2), mat(0x5a3e26), 0, 0, 0, g); mk(box(0.12, 0.1, 0.1, 0, 0.5, 0), mat(0x6a6e72), 0, 0, 0, g); }
    else if (pr === 'tankard') { mk(cyl(0.05, 0.045, 0.12, 8, 0.06), mat(0x8a6a30), 0, 0, 0, g); }
    else if (pr === 'vial') { mk(cyl(0.025, 0.03, 0.1, 6, 0.05), mat(0x6af0a0, { emissive: 0x30d070, ei: 0.8 }), 0, 0, 0, g); }
    else if (pr === 'staff') { mk(cyl(0.025, 0.03, 1.6, 6, 0.55), mat(0x3e2c20), 0, 0, 0, g); mk(sph(0.06, 6, 5), mat(0xd8c070, { emissive: 0xd8b24a, ei: 0.7 }), 0, 1.4, 0, g); }
    else if (pr === 'sword') { mk(box(0.012, 0.8, 0.05, 0, 0.45, 0), mat(0x9aa0a6), 0, 0, 0, g); }
    g.rotation.z = pr === 'tankard' || pr === 'vial' ? 0 : -Math.PI / 2 + 0.5; rig.handR.add(g); gear.prop = g;
  }
}

function humanChar(a, opts) {
  const L = lookFor(a), rig = buildRig(L, { sash: a.kind === 'rival' });
  if (L.bald) rig.parts.hair.visible = false;
  rig.root.scale.setScalar(L.scale * (a.scale || 1));
  const holder = new THREE.Group(); holder.add(rig.root);
  const gear = applyGear(rig, a, { light: opts.light });
  dress(rig, L, gear);
  const arrow = mk(box(0.012, 0.7, 0.012, 0, 0.35, 0), mat(0xd8d0b0), 0, 0, 0, rig.handR); arrow.rotation.z = -Math.PI / 2; arrow.visible = false;
  const S = { rig, gear, key: gearKey(a), cur: {}, phase: (a.id * 1.7) % 6, seed: a.id, headHidden: false, arrow, sheathed: null, rollT: 0, dieT: 0, kind: 'human', work: L.prop === 'hammer' };
  S.gearBase = { head: rig.head };
  mountWeapon(S, a);
  return { obj: holder, top: 1.95 * L.scale, kind: 'human', S };
}

function mountWeapon(S, a) {
  const g = S.gear, w = g.weapon; if (!w) { S.sheathed = !!a.sheathed; return; }
  const sheathed = !!a.sheathed;
  if (sheathed === S.sheathed) return;
  S.sheathed = sheathed;
  const k = w.userData.kind;
  if (sheathed) {
    S.rig.back.add(w); w.position.set(0, 0, 0);
    w.rotation.set(0, 0, k === 'bow' ? 1.2 : k === 'spear' || k === 'staff' ? 0.15 : 0.45); w.position.y = k === 'dagger' ? -0.2 : 0.1;
    if (k === 'dagger') { S.rig.hipMount.add(w); w.position.set(0, 0, 0); w.rotation.set(0, 0, 1.6); }
  } else {
    (k === 'bow' ? S.rig.handL : S.rig.handR).add(w); w.position.set(0, 0, 0); w.rotation.set(0, 0, -Math.PI / 2 + (k === 'bow' ? 0 : 0.35));
    if (k === 'spear' || k === 'staff') w.rotation.z = -Math.PI / 2 + 0.9;
  }
}

function monsterChar(a) {
  const model = MD.makeUnitModel(a.model || 'skeleton', 0xffffff);
  const ds = model.userData.designScale || 1, base = (ds <= 1.05 ? 0.9 : 1 + (ds - 1) * 0.72) * (a.scale || 1) * (a.model === 'wolf' || a.model === 'bogbeast' || a.model === 'wraith' ? 0.95 : 1);
  model.scale.setScalar(base);
  const holder = new THREE.Group(); holder.add(model);
  return { obj: holder, top: (model.userData.top || 2.4) / (ds || 1) * base, kind: 'monster', S: { model, base, amp: 0, phase: 0, u: model.userData } };
}

function animMonster(S, a, ctx) {
  const m = S.model, u = S.u, cs = a.cs;
  const sp = Math.hypot(a.vx || 0, a.vz || 0);
  S.amp += ((sp > 0.3 ? 1 : 0) - S.amp) * Math.min(1, ctx.dt * 10);
  S.phase += sp * ctx.dt * 2.4;
  const ph = S.phase, amp = S.amp, now = ctx.now;
  let atk = 0, windp = 0;
  if (cs.state === 'windup') { windp = clamp(cs.t / Math.max(0.1, (cs.move && cs.move.windup) || 0.5), 0, 1); atk = windp * windp; }
  else if (cs.state === 'active') atk = 1 + clamp(cs.t / 0.15, 0, 1);
  else if (cs.state === 'recover') atk = Math.max(0, 1 - cs.t / Math.max(0.2, (cs.move && cs.move.recover) || 0.5)) * 2;
  if (u.kind === 'humanoid') {
    const s = Math.sin(ph);
    u.legL.rotation.z = s * 0.85 * amp; u.legR.rotation.z = -s * 0.85 * amp; u.armL.rotation.z = -s * 0.6 * amp; u.armR.rotation.z = s * 0.6 * amp;
    m.position.y = Math.abs(s) * 0.07 * amp;
    if (atk > 0) { u.armR.rotation.z = atk < 1 ? -0.3 - atk * 2.2 : 1.1 + (2 - atk) * 0.2 - (atk > 1.1 ? 0 : 0); u.armL.rotation.z = u.armR.rotation.z * 0.6; m.rotation.z = atk < 1 ? -0.18 * atk : 0.25 * (2 - atk) * 0.5; } else m.rotation.z = 0;
    if (cs.state === 'stagger') m.rotation.z = -0.35;
  } else if (u.kind === 'quad') {
    const s = Math.sin(ph * 1.3) * 0.9 * amp;
    u.legs[0].rotation.z = s; u.legs[3].rotation.z = s; u.legs[1].rotation.z = -s; u.legs[2].rotation.z = -s;
    m.position.y = Math.abs(Math.sin(ph * 1.3)) * 0.08 * amp;
    m.rotation.z = atk > 0 ? (atk < 1 ? 0.35 * atk : -0.3 * (2 - atk)) : 0;
  } else if (u.kind === 'wraith') {
    m.position.y = 0.5 + Math.sin(now * 2.2 + a.id) * 0.25; u.cloak.rotation.z = Math.sin(now * 3 + a.id) * 0.06;
    if (atk > 0) u.armR.rotation.z = -atk * 1.2;
  }
  m.scale.setScalar(S.base * (a.hitT > 0 ? 1.06 : 1));
}

export function createCharacter(a, opts = {}) {
  const c = a.kind === 'monster' ? monsterChar(a) : humanChar(a, opts);
  c.id = a.id; c.px = a.x; c.pz = a.z; c.vyaw = a.yaw;
  c.update = function (act, ctx) {
    if (c.kind === 'monster') { animMonster(c.S, act, ctx); return; }
    const S = c.S, rig = S.rig, cs = act.cs;
    const key = gearKey(act);
    if (key !== S.key) { S.key = key; S.sheathed = null; const g = applyGear(rig, act, { light: opts.light }); S.gear = g; if (act.look) dress(rig, lookFor(act), g); mountWeapon(S, act); if (S.fpOn) setFirstPerson(c, true); }
    else mountWeapon(S, act);
    // locomotion measured from the sim velocity, relative to facing (backwards steps reverse the cycle)
    const vx = act.vx || 0, vz = act.vz || 0, sp = Math.hypot(vx, vz), fwd = vx * Math.cos(act.yaw) + vz * Math.sin(act.yaw);
    S.phase += (fwd < -0.25 * sp ? -1 : 1) * sp * ctx.dt * 3.0;
    const P = targetPose({}, act, S.gear, { crouch: act.crouching, ground: act.onGround !== false });
    const speedN = act.moving ? sp / 3.6 : 0;
    const cx = { phase: S.phase, speedN, now: ctx.now, seed: S.seed, cs: cs.state };
    applyPose(rig, P, S.cur, ctx.dt, cx);
    // dodge roll: tumble the hips around the roll axis
    if (P.roll) {
      const d = cs.dur || 0.45, p = clamp(cs.t / Math.max(0.2, d), 0, 1), imp = act.imp;
      let ang = 0, axis = 'z';
      if (imp && (imp.vx || imp.vz)) { const f = imp.vx * Math.cos(act.yaw) + imp.vz * Math.sin(act.yaw), l = -imp.vx * Math.sin(act.yaw) + imp.vz * Math.cos(act.yaw); if (Math.abs(f) >= Math.abs(l)) { axis = 'z'; ang = Math.sign(f) * p * Math.PI * 2 * -1; } else { axis = 'x'; ang = Math.sign(l) * p * Math.PI * 2 * 1; } } else ang = -p * Math.PI * 2;
      rig.hips.rotation.set(0, 0, 0); rig.hips.rotation[axis] = ang * -1 * -1;
      rig.hips.position.y = 0.55; rig.hipL.rotation.z = rig.hipR.rotation.z = 1.4; rig.knL.rotation.z = rig.knR.rotation.z = -2.0; rig.torso.rotation.z = 0.5;
      rig.shR.rotation.z = rig.shL.rotation.z = 1.3; rig.elR.rotation.z = rig.elL.rotation.z = 1.9;
    } else rig.hips.rotation.set(0, 0, 0);
    S.arrow.visible = P.draw !== undefined && S.gear.wKind === 'bow';
    if (a_isDead(act)) {
      S.dieT = clamp((ctx.simT - (act.diedAt || ctx.simT)) / 0.7, 0, 1);
      const e = 1 - Math.pow(1 - S.dieT, 3);
      rig.root.rotation.set(0, 0, e * 1.5); rig.root.position.y = 0.1 * e; rig.hips.position.y = 0.92 - 0.2 * e;
      rig.shL.rotation.x = -0.9 * e; rig.shR.rotation.x = 0.9 * e; rig.shL.rotation.z = rig.shR.rotation.z = 0.2 * e;
    } else { rig.root.rotation.set(0, 0, 0); rig.root.position.y = 0; }
    // torch flicker
    const t = S.gear.torch; if (t) { const f = 0.9 + Math.sin(ctx.now * 17 + S.seed) * 0.08 + Math.sin(ctx.now * 29) * 0.05; t.userData.flame.scale.set(0.5 * f, 0.6 * f, 1); if (t.userData.light) t.userData.light.intensity = 2.2 * f; }
    const gl = S.gear.weapon && S.gear.weapon.userData.glow; if (gl) gl.material.opacity = 0.6 + Math.sin(ctx.now * 3) * 0.2;
    // NPC at work: hammering / stirring
    if (act.kind === 'npc' && act.act === 'work' && !act.moving) { const w = Math.sin(ctx.now * 6 + S.seed); rig.shR.rotation.z = 1.0 + Math.max(0, w) * 1.1; rig.elR.rotation.z = 1.0 - Math.max(0, w) * 0.6; rig.torso.rotation.z = 0.12 + w * 0.05; }
    if (cs.state === 'block' && cs.parryOk) rig.root.scale.setScalar(rig.root.scale.x);
    c.obj.scale.setScalar(act.hitT > 0 ? 1.03 : 1);
  };
  c.dispose = function () { c.obj.removeFromParent(); };
  return c;
}
function a_isDead(a) { return !a.alive || a.cs.state === 'dead'; }
export { angDiff };

// first person: hide the head/torso so the camera sits inside the body and only arms, legs and the weapon are seen
export function setFirstPerson(c, on) {
  if (c.kind !== 'human') return;
  const { rig, gear } = c.S, P = rig.parts; c.S.fpOn = on;
  rig.head.visible = !on; P.chest.visible = P.waist.visible = P.neck.visible = !on; rig.shL.visible = rig.shR.visible = !on;
  for (const o of gear.list) if (o.parent === rig.torso) o.visible = !on;
  if (rig.cloak) rig.cloak.visible = !on;
}
