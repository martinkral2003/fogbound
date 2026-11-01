// FOGBOUND: HERO equipment visuals: applyGear(rig, actor) rebuilds armour overlays, helmet, weapon, shield/torch from actor.equip.
// Armour looks come from item.mat (cloth, leather, studded, mail, plate, dark) / item.cls and are tinted by rarity.
import * as THREE from 'three';
import { box, sph, cyl, mat, mk } from './chars_body.js';
import { makeWeapon, makeShield, makeTorch, RARITY_COL } from './chars_weapons.js';

const MAT_COL = { cloth: 0x6a5e4c, leather: 0x6a4a2c, studded: 0x5a4838, mail: 0x8a9298, plate: 0xa4abb2, dark: 0x3a3e4c };
function matOf(it) { return it ? (it.mat || (it.cls === 'heavy' ? 'plate' : it.cls === 'medium' ? 'mail' : /robe|vest|cowl|hood|cloth/i.test(it.name || '') ? 'cloth' : 'leather')) : null; }
function colOf(it) { return MAT_COL[matOf(it)] || 0x6a5e4c; }
function mm(it, color) { const r = it && it.rarity | 0; return mat(color, r >= 2 ? { emissive: RARITY_COL[r], ei: 0.12 + 0.1 * (r - 2) } : {}); }
const isMetal = (m) => m === 'mail' || m === 'plate' || m === 'dark';

function clear(list) { for (const o of list) { if (o.parent) o.parent.remove(o); } list.length = 0; }

export function applyGear(rig, a, opts = {}) {
  const eq = a.equip || {}, P = rig.parts, M = rig.mats, b = rig.b, W = rig.W;
  const gear = rig.gear || (rig.gear = { list: [], key: '', weapon: null, shield: null, torch: null });
  clear(gear.list);
  const add = (o, parent) => { parent.add(o); gear.list.push(o); return o; };
  // ---- reset base colours
  P.chest.material = P.waist.material = M.cloth; P.uppers[0].material = P.uppers[1].material = M.cloth;
  P.thighs[0].material = P.thighs[1].material = P.shins[0].material = P.shins[1].material = M.pants;
  P.feet[0].material = P.feet[1].material = M.dark; P.fores[0].material = P.fores[1].material = M.skin;
  P.hair.visible = true;
  // ---- chest
  const ch = eq.chest;
  if (ch) {
    const m = matOf(ch), c = mm(ch, colOf(ch));
    P.chest.material = P.waist.material = c; P.uppers[0].material = P.uppers[1].material = m === 'cloth' || m === 'leather' ? c : mm(ch, colOf(ch));
    if (m === 'leather' || m === 'studded') add(mk(box(0.31 * b, 0.1, W + 0.05, 0, 0.5, 0), mat(0x3a2a1c)), rig.torso);
    if (m === 'studded') for (let i = 0; i < 5; i++) add(mk(sph(0.018, 4, 3), mat(0xc0b090), 0.14 * b + 0.01, 0.12 + i * 0.1, -0.2 + (i % 2) * 0.4), rig.torso);
    if (isMetal(m)) {
      add(mk(box(0.3 * b, 0.46, W + 0.06, 0, 0.32, 0), mm(ch, colOf(ch) + 0x101010)), rig.torso);
      for (const s of [1, -1]) add(mk(sph(0.1 * b + 0.02, 6, 5, 0.8), mm(ch, colOf(ch)), 0, 0.57, (W / 2 + 0.07) * s), rig.torso);
      if (m !== 'mail') for (const s of [1, -1]) add(mk(box(0.07, 0.18, 0.11, 0.04, -0.08, 0), mm(ch, colOf(ch)), 0, 0.06, 0.1 * s), rig.torso);
      if (m === 'dark') add(mk(cyl(0.0, 0.05, 0.16, 4, 0.08), mat(0xb8a060), 0.17 * b, 0.5, 0), rig.torso);
    }
  } else if (rig.look.cloak) { /* cloak handled below */ }
  // ---- cloak
  if (rig.look.cloak || (ch && /cloak|mantle/i.test(ch.name || ''))) {
    const cl = add(mk(box(0.04, 0.95, W + 0.12, 0, -0.4, 0), mat(rig.look.cloak || 0x2a2a30), -0.16 * b, 0.62, 0), rig.torso); cl.rotation.z = 0.12; rig.cloak = cl;
  } else rig.cloak = null;
  // ---- legs
  const lg = eq.legs;
  if (lg) {
    const c = mm(lg, colOf(lg)), m = matOf(lg);
    P.thighs[0].material = P.thighs[1].material = c; if (m !== 'cloth') P.shins[0].material = P.shins[1].material = c;
    if (isMetal(m)) for (let i = 0; i < 2; i++) add(mk(sph(0.08 * b, 5, 4), mm(lg, colOf(lg)), 0.06, 0, 0), i ? rig.knR : rig.knL);
  }
  // ---- boots
  const bt = eq.boots;
  if (bt) {
    const c = mm(bt, matOf(bt) === 'cloth' ? 0x4a4036 : colOf(bt) - 0x101010);
    P.feet[0].material = P.feet[1].material = c;
    for (const kn of [rig.knL, rig.knR]) add(mk(box(0.16 * b, 0.2, 0.16 * b, 0, -0.34, 0), c), kn);
    if (isMetal(matOf(bt))) for (const kn of [rig.knL, rig.knR]) add(mk(box(0.1, 0.05, 0.1 * b, 0.12, -0.42, 0), c), kn);
  }
  // ---- gloves
  const gl = eq.hands;
  if (gl) {
    const c = mm(gl, matOf(gl) === 'cloth' ? 0x5a5040 : colOf(gl));
    for (const el of [rig.elL, rig.elR]) add(mk(box(0.12 * b, 0.15, 0.12 * b, 0, -0.2, 0), c), el);
    for (const h of [rig.handL, rig.handR]) add(mk(box(0.1, 0.11, 0.095, 0, -0.04, 0), c), h);
  }
  // ---- head
  const hd = eq.head;
  if (hd) {
    const m = matOf(hd), name = hd.name || '', c = mm(hd, colOf(hd));
    if (/hood|cowl|cap|coif/i.test(name) && (m === 'cloth' || m === 'leather')) {
      add(mk(sph(0.14, 7, 6, 1.05), c, -0.01, 0.11, 0), rig.head); P.hair.visible = false;
      if (/hood|cowl/i.test(name)) add(mk(cyl(0, 0.17, 0.3, 6, 0.15), c, -0.05, 0.16, 0), rig.head).rotation.z = 0.35;
    } else if (m === 'mail') { add(mk(sph(0.135, 7, 6, 1.1), c, -0.005, 0.1, 0), rig.head); P.hair.visible = false; }
    else if (m === 'plate' || m === 'dark') {
      add(mk(sph(0.14, 8, 7, 1.15), c, 0, 0.1, 0), rig.head); P.hair.visible = false;
      add(mk(box(0.06, 0.035, 0.2, 0.1, 0.12, 0), mat(0x101012)), rig.head);
      add(mk(box(0.1, 0.08, 0.02, 0.0, 0.2, 0), mat(0x7a2020), -0.02, 0, 0), rig.head);
      if (m === 'dark') for (const s of [1, -1]) { const hn = add(mk(cyl(0, 0.03, 0.26, 5, 0.13), mat(0xd8d0b8), 0, 0.2, 0.13 * s), rig.head); hn.rotation.x = -0.6 * s; }
    } else { add(mk(sph(0.14, 7, 6, 1.0), c, -0.005, 0.12, 0), rig.head); P.hair.visible = false; }
  }
  // ---- weapon / offhand
  if (gear.weapon) { gear.weapon.parent && gear.weapon.parent.remove(gear.weapon); gear.weapon = null; }
  if (gear.shield) { gear.shield.parent && gear.shield.parent.remove(gear.shield); gear.shield = null; }
  if (gear.torch) { gear.torch.parent && gear.torch.parent.remove(gear.torch); gear.torch = null; }
  const w = eq.weapon, oh = eq.offhand;
  gear.wKind = w ? w.kind : 'fists'; gear.twoHand = !!(w && (w.twoHanded || w.kind === 'staff')); gear.ranged = !!(w && (w.kind === 'bow' || w.kind === 'crossbow'));
  if (w) {
    const g = makeWeapon(w); gear.weapon = g; gear.weaponKind = w.kind;
    (w.kind === 'bow' ? rig.handL : rig.handR).add(g);
    g.rotation.z = -Math.PI / 2 + (w.kind === 'bow' ? 0 : 0.35);
    if (w.kind === 'spear' || w.kind === 'staff') g.rotation.z = -Math.PI / 2 + 0.9;
  }
  if (oh && oh.kind === 'shield' && !gear.twoHand) {
    const s = makeShield(oh); gear.shield = s; rig.elL.add(s); s.position.set(0, -0.14, 0.1 * (rig.b) + 0.04); s.rotation.y = 0;
  } else if (oh && oh.kind === 'torch' && !gear.twoHand) {
    const t = makeTorch(!!opts.light); gear.torch = t; rig.handL.add(t); t.rotation.z = -Math.PI / 2 + 0.3;
  }
  gear.sheathedKind = null;
  return gear;
}

// equipment signature: cheap change detection (uids + sheathed)
export function gearKey(a) {
  const eq = a.equip || {}; let k = a.sheathed ? 's' : 'd';
  for (const s in eq) k += '|' + (eq[s] ? eq[s].uid || eq[s].def || eq[s].name : '');
  return k;
}
