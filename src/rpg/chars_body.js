// FOGBOUND: HERO character rig. A human-scale (about 1.8 m) jointed low-poly body: hips, torso, head, 2-bone arms and legs.
// Convention (same as models.js): the model faces +x, y is up, +z is the character's LEFT. Limb joints swing about local z
// (positive = forward). Used for the player, rival heroes and NPCs; monsters keep the models.js builders.
import * as THREE from 'three';
import { lambert } from '../models.js';

const gc = new Map();
export function box(w, h, d, ox = 0, oy = 0, oz = 0) {
  const k = `${w},${h},${d},${ox},${oy},${oz}`;
  let g = gc.get(k);
  if (!g) { g = new THREE.BoxGeometry(w, h, d); g.translate(ox, oy, oz); gc.set(k, g); }
  return g;
}
export function sph(r, ws = 8, hs = 6, sy = 1) {
  const k = `s${r},${ws},${hs},${sy}`;
  let g = gc.get(k);
  if (!g) { g = new THREE.SphereGeometry(r, ws, hs); if (sy !== 1) g.scale(1, sy, 1); gc.set(k, g); }
  return g;
}
export function cyl(rt, rb, h, seg = 8, oy = 0) {
  const k = `c${rt},${rb},${h},${seg},${oy}`;
  let g = gc.get(k);
  if (!g) { g = new THREE.CylinderGeometry(rt, rb, h, seg); g.translate(0, oy, 0); gc.set(k, g); }
  return g;
}
export const mat = (c, o = {}) => lambert(c, { flat: true, ...o });
export function mk(g, m, x = 0, y = 0, z = 0, parent = null) {
  const o = new THREE.Mesh(g, m); o.position.set(x, y, z); if (parent) parent.add(o); return o;
}

export const LOOKS = {
  player:   { skin: 0xc9a98a, cloth: 0x55503e, pants: 0x3a352c, hair: 0x2a2018, trim: 0x8a6a2a, build: 1.0 },
  warrior:  { skin: 0xc2a080, cloth: 0x4a3c34, pants: 0x30292a, hair: 0x241a12, trim: 0x8a5a2a, build: 1.08 },
  brute:    { skin: 0xb48c6c, cloth: 0x5a3a2c, pants: 0x2c2420, hair: 0x4a3020, trim: 0x7a3a22, build: 1.2 },
  ranger:   { skin: 0xc8b090, cloth: 0x3c4a34, pants: 0x2c3228, hair: 0x5a4028, trim: 0x6a7a3a, build: 0.96 },
  mage:     { skin: 0xd0c0b0, cloth: 0x36345a, pants: 0x24243c, hair: 0xb8b8c0, trim: 0x7a6ad0, build: 0.9 },
  rogue:    { skin: 0xb89c80, cloth: 0x2c2c32, pants: 0x1e1e22, hair: 0x121212, trim: 0x5a5a62, build: 0.95 },
  villager: { skin: 0xd0b090, cloth: 0x6a5a40, pants: 0x4a4030, hair: 0x6a4a2a, trim: 0x9a8a60, build: 1.0 },
  merchant: { skin: 0xc8a888, cloth: 0x7a3a3a, pants: 0x3a2a2a, hair: 0x3a2a1a, trim: 0xd8b24a, build: 1.05 },
  smith:    { skin: 0xb88c6c, cloth: 0x3a342e, pants: 0x2a2622, hair: 0x201810, trim: 0x8a6a4a, build: 1.2 },
  alchemist:{ skin: 0xc0b49a, cloth: 0x3a5a46, pants: 0x28362e, hair: 0x9a9a8a, trim: 0xa8d868, build: 0.92 },
  priest:   { skin: 0xd0bca4, cloth: 0xd8d0b8, pants: 0xa09880, hair: 0xc8c0b0, trim: 0xd8b24a, build: 0.95 },
};

// returns {root, hips, torso, head, shL, shR, elL, elR, hipL, hipR, knL, knR, handL, handR, parts:{...}, look}
export function buildRig(lookIn = {}, opts = {}) {
  const look = { ...LOOKS.player, ...lookIn };
  const b = look.build, W = 0.5 * b, D = 0.27 * (0.5 + b / 2);
  const skin = mat(look.skin), cloth = mat(look.cloth), pants = mat(look.pants), hair = mat(look.hair), trim = mat(look.trim), dark = mat(0x1c1a18), eye = mat(0x101010);
  const root = new THREE.Group();
  const hips = new THREE.Group(); hips.position.y = 0.92; root.add(hips);
  const pelvis = mk(box(0.3 * b, 0.2, 0.4 * b, 0, -0.02, 0), pants, 0, 0, 0, hips);
  mk(box(0.32 * b, 0.07, 0.42 * b, 0, 0.08, 0), trim, 0, 0, 0, hips); // belt
  // legs
  const legs = [];
  for (const s of [1, -1]) {
    const hp = new THREE.Group(); hp.position.set(0, -0.06, 0.1 * b * s); hips.add(hp);
    const thigh = mk(box(0.17 * b, 0.46, 0.17 * b, 0, -0.23, 0), pants, 0, 0, 0, hp);
    const kn = new THREE.Group(); kn.position.y = -0.46; hp.add(kn);
    const shin = mk(box(0.14 * b, 0.44, 0.14 * b, 0, -0.22, 0), pants, 0, 0, 0, kn);
    const foot = mk(box(0.27, 0.09, 0.13 * b, 0.06, -0.04, 0), dark, 0, -0.44, 0, kn);
    legs.push({ hp, kn, thigh, shin, foot });
  }
  // torso
  const torso = new THREE.Group(); torso.position.y = 0.08; hips.add(torso);
  const chest = mk(box(0.27 * b + 0.04, 0.6, W + 0.04, 0, 0.3, 0), cloth, 0, 0, 0, torso);
  const waist = mk(box(0.24 * b, 0.12, W * 0.9, 0, 0.02, 0), cloth, 0, 0, 0, torso);
  mk(box(0.06, 0.2, 0.02, 0.14 * b, 0.3, 0), trim, 0, 0, 0, torso).visible = !!opts.sash;
  const neck = mk(cyl(0.05, 0.06, 0.1, 6, 0.05), skin, 0, 0.6, 0, torso);
  // head
  const head = new THREE.Group(); head.position.y = 0.7; torso.add(head);
  const skull = mk(sph(0.115, 8, 7, 1.12), skin, 0, 0.1, 0, head);
  const hairM = mk(sph(0.122, 8, 6, 0.95), hair, -0.012, 0.135, 0, head);
  mk(box(0.04, 0.025, 0.05, 0.1, 0.11, 0.045), eye, 0, 0, 0, head); mk(box(0.04, 0.025, 0.05, 0.1, 0.11, -0.045), eye, 0, 0, 0, head);
  mk(box(0.04, 0.05, 0.03, 0.12, 0.07, 0), skin, 0, 0, 0, head); // nose
  // arms
  const arms = [];
  for (const s of [1, -1]) {
    const sh = new THREE.Group(); sh.position.set(0, 0.54, (W / 2 + 0.07) * s); torso.add(sh);
    const upper = mk(box(0.115 * b, 0.3, 0.115 * b, 0, -0.15, 0), cloth, 0, 0, 0, sh);
    const el = new THREE.Group(); el.position.y = -0.3; sh.add(el);
    const fore = mk(box(0.1 * b, 0.27, 0.1 * b, 0, -0.135, 0), skin, 0, 0, 0, el);
    const hand = new THREE.Group(); hand.position.y = -0.28; el.add(hand);
    mk(box(0.09, 0.1, 0.085, 0, -0.04, 0), skin, 0, 0, 0, hand);
    arms.push({ sh, el, hand, upper, fore });
  }
  // back mount for sheathed weapons / quiver, cloak anchor
  const back = new THREE.Group(); back.position.set(-0.17 * b, 0.35, 0); torso.add(back);
  const hipMount = new THREE.Group(); hipMount.position.set(0, -0.02, 0.27 * b); hips.add(hipMount);
  return {
    root, hips, torso, head, back, hipMount, look, b, W,
    hipL: legs[0].hp, knL: legs[0].kn, hipR: legs[1].hp, knR: legs[1].kn,
    shL: arms[0].sh, elL: arms[0].el, handL: arms[0].hand, shR: arms[1].sh, elR: arms[1].el, handR: arms[1].hand,
    parts: { pelvis, chest, waist, neck, skull, hair: hairM, thighs: [legs[0].thigh, legs[1].thigh], shins: [legs[0].shin, legs[1].shin], feet: [legs[0].foot, legs[1].foot], uppers: [arms[0].upper, arms[1].upper], fores: [arms[0].fore, arms[1].fore] },
    mats: { skin, cloth, pants, hair, trim, dark },
  };
}
