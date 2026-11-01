// FOGBOUND: DOMINION client: humanoid / beast / flyer rig builders (units). Faces +x; right hand = +z. Pivots: hip y=0.72, shoulder y=1.28.
import { Rig } from './models_rts.js';

export const PAL = {
  necro: { skin: 0xd6d0b8, cloth: 0x273234, pants: 0x1c2628, trim: 0x8fa09a, metal: 0x6a7678, glow: 0x4fe3c1, bone: 0xd8d2bc, dark: 0x101618 },
  orc: { skin: 0x5f8a45, cloth: 0x6a4a32, pants: 0x3a2e22, trim: 0x8a7a5a, metal: 0x77777a, glow: 0xe8742a, bone: 0xe0d8b8, dark: 0x201810 },
  demon: { skin: 0x8a2c24, cloth: 0x2a1c20, pants: 0x1c1216, trim: 0x5a3a3a, metal: 0x2e2a30, glow: 0xff5a20, bone: 0xc8b8a0, dark: 0x0e0a0c },
  cult: { skin: 0xcdb8a0, cloth: 0x8a1c34, pants: 0x4a1424, trim: 0xd8b24a, metal: 0x8a8a90, glow: 0xc43bd6, bone: 0xe8e0d0, dark: 0x180c12 },
};
export const pal = (f) => PAL[f] || PAL.necro;

const SH = [0, 1.28, 0.33]; // right shoulder pivot
const SHL = [0, 1.28, -0.33];

// ---- heads (centre y ~1.58)
function head(r, kind, p, o) {
  const y = 1.58 * (o.h || 1) + (o.hy || 0), sk = o.skin ?? p.skin;
  switch (kind) {
    case 'skull': r.sph(0.17, 0.02, y, 0, p.bone); r.box(0.14, 0.07, 0.16, 0.1, y - 0.12, 0, p.bone); r.box(0.04, 0.05, 0.05, 0.16, y + 0.02, 0.07, p.glow, { team: 2 }); r.box(0.04, 0.05, 0.05, 0.16, y + 0.02, -0.07, p.glow, { team: 2 }); break;
    case 'hood': r.sph(0.14, 0.04, y - 0.01, 0, p.dark); r.cone(0.26, 0.5, -0.03, y + 0.06, 0, o.cloth ?? p.cloth, 7, { rz: 0.14 }); r.box(0.03, 0.04, 0.1, 0.17, y, 0, p.glow, { team: 2 }); break;
    case 'orc': r.box(0.3, 0.28, 0.32, 0.03, y, 0, sk); r.box(0.12, 0.07, 0.3, 0.2, y + 0.1, 0, p.dark); r.box(0.05, 0.14, 0.04, 0.17, y - 0.18, 0.1, p.bone, { rx: 0.2 }); r.box(0.05, 0.14, 0.04, 0.17, y - 0.18, -0.1, p.bone, { rx: -0.2 }); r.box(0.03, 0.04, 0.05, 0.19, y + 0.03, 0.08, 0xff3010, { team: 2 }); r.box(0.03, 0.04, 0.05, 0.19, y + 0.03, -0.08, 0xff3010, { team: 2 }); break;
    case 'helm': r.sph(0.2, 0, y, 0, o.metal ?? p.metal); r.box(0.05, 0.05, 0.28, 0.17, y, 0, 0x101012); r.box(0.04, 0.2, 0.05, 0, y + 0.22, 0, 0, { team: 1 }); break;
    case 'horned': r.sph(0.2, 0, y, 0, o.metal ?? p.metal); r.box(0.05, 0.05, 0.28, 0.17, y, 0, 0x101012); r.cone(0.05, 0.4, 0, y + 0.2, 0.22, p.bone, 5, { rx: 0.6 }); r.cone(0.05, 0.4, 0, y + 0.2, -0.22, p.bone, 5, { rx: -0.6 }); break;
    case 'demon': r.sph(0.18, 0.02, y, 0, sk); r.box(0.12, 0.08, 0.2, 0.14, y - 0.1, 0, sk, { shade: 0.8 }); r.cone(0.05, 0.38, -0.02, y + 0.22, 0.14, p.dark, 5, { rx: 0.45, rz: 0.2 }); r.cone(0.05, 0.38, -0.02, y + 0.22, -0.14, p.dark, 5, { rx: -0.45, rz: 0.2 });
      r.box(0.03, 0.04, 0.05, 0.17, y + 0.03, 0.07, p.glow, { team: 2 }); r.box(0.03, 0.04, 0.05, 0.17, y + 0.03, -0.07, p.glow, { team: 2 }); break;
    case 'mask': r.sph(0.17, 0, y, 0, o.cloth ?? p.cloth); r.box(0.05, 0.22, 0.2, 0.15, y, 0, 0xe8e0d0); r.box(0.06, 0.03, 0.14, 0.16, y + 0.03, 0, p.glow, { team: 2 }); break;
    case 'crown': r.sph(0.18, 0, y, 0, sk); for (let i = 0; i < 5; i++) { const a = i / 5 * 6.283; r.cone(0.035, 0.18, Math.cos(a) * 0.15, y + 0.24, Math.sin(a) * 0.15, 0xd8b24a, 4, { team: 2 }); } break;
    case 'hat': r.cyl(0.32, 0.32, 0.03, 0, y + 0.14, 0, p.dark, 10); r.cyl(0.14, 0.17, 0.2, 0, y + 0.26, 0, p.dark, 8); r.sph(0.15, 0.03, y - 0.02, 0, sk); break;
    default: r.sph(0.17, 0.02, y, 0, sk); r.box(0.03, 0.04, 0.1, 0.16, y + 0.02, 0, 0x101010);
  }
}
// ---- weapons held in the right hand (part 3, swings with the arm). hand ~ (0.08, 0.72, 0.33)
const arm = { part: 3, pv: SH };
function weapon(r, kind, p, o) {
  const hx = 0.1, hy = 0.78, hz = 0.33;
  switch (kind) {
    case 'sword': r.box(0.05, 0.8, 0.09, hx + 0.12, hy + 0.4, hz, 0xc4c8cc, { ...arm, rz: -0.55 }); r.box(0.06, 0.06, 0.26, hx, hy, hz, p.trim, arm); break;
    case 'rust': r.box(0.05, 0.7, 0.09, hx + 0.12, hy + 0.36, hz, 0x8a7a60, { ...arm, rz: -0.55 }); break;
    case 'axe': r.box(0.05, 0.95, 0.05, hx + 0.1, hy + 0.35, hz, 0x5a4028, { ...arm, rz: -0.35 }); r.box(0.1, 0.34, 0.26, hx + 0.3, hy + 0.7, hz, 0x9a9a9e, { ...arm, rz: -0.35 }); break;
    case 'club': r.cyl(0.06, 0.13, 0.8, hx + 0.2, hy + 0.3, hz, 0x5a4028, 6, { ...arm, rz: -0.6 }); r.cone(0.04, 0.12, hx + 0.38, hy + 0.55, hz + 0.1, 0xb0b0b0, 4, { ...arm, rz: -1.2 }); break;
    case 'mace': r.box(0.05, 0.7, 0.05, hx + 0.1, hy + 0.3, hz, 0x4a3a2a, { ...arm, rz: -0.4 }); r.sph(0.14, hx + 0.26, hy + 0.7, hz, 0x6a6a70, { ...arm, w: 6, h: 4 }); break;
    case 'spear': r.box(0.04, 1.9, 0.04, hx + 0.4, hy + 0.5, hz, 0x6a5238, { ...arm, rz: -1.15 }); r.cone(0.06, 0.28, hx + 1.2, hy + 1.2, hz, 0xc4c8cc, 4, { ...arm, rz: -1.15 - 0 }); break;
    case 'staff': r.box(0.05, 1.7, 0.05, hx, hy + 0.3, hz, 0x4a3a2a, arm); r.sph(0.11, hx, hy + 1.2, hz, p.glow, { ...arm, team: 2, w: 6, h: 4 }); r.cone(0.07, 0.2, hx, hy + 1.4, hz, p.trim, 4, arm); break;
    case 'scythe': r.box(0.04, 1.6, 0.04, hx, hy + 0.3, hz, 0x4a3a2a, arm); r.box(0.5, 0.05, 0.06, hx + 0.22, hy + 1.1, hz, 0xaab4b8, { ...arm, rz: 0.15 }); break;
    case 'censer': r.box(0.03, 0.5, 0.03, hx + 0.1, hy, hz, 0x777777, { ...arm, rz: -0.3 }); r.sph(0.1, hx + 0.12, hy - 0.3, hz, p.trim, { ...arm, w: 6, h: 4 }); r.sph(0.06, hx + 0.12, hy - 0.3, hz, p.glow, { ...arm, team: 2, w: 5, h: 4 }); break;
    case 'keg': r.cyl(0.17, 0.17, 0.3, 0.12, 0.95, 0.25, 0x5a3a22, 8, { part: 3, pv: SH, rx: 1.57 }); r.sph(0.05, 0.12, 1.15, 0.25, 0xff6020, { part: 3, pv: SH, team: 2, w: 4, h: 3 }); break;
    case 'whip': r.box(0.02, 0.02, 0.8, hx + 0.1, hy - 0.2, hz, 0x3a2a20, { ...arm, ry: 0.3 }); break;
    case 'greatsword': r.box(0.07, 1.25, 0.14, hx + 0.2, hy + 0.55, hz, 0x9aa4a8, { ...arm, rz: -0.5 }); r.box(0.07, 0.07, 0.4, hx, hy, hz, p.trim, arm); break;
    case 'tool': r.box(0.05, 0.7, 0.05, hx + 0.1, hy + 0.2, hz, 0x5a4028, { ...arm, rz: -0.5 }); r.box(0.08, 0.22, 0.22, hx + 0.32, hy + 0.5, hz, 0x8a8a8e, { ...arm, rz: -0.5 }); break;
    default: break;
  }
}
// left-hand items (part 4)
function offhand(r, kind, p, o) {
  const a = { part: 4, pv: SHL };
  switch (kind) {
    case 'shield': r.box(0.07, 0.62, 0.5, 0.2, 1.0, -0.4, p.metal, a); r.box(0.08, 0.3, 0.2, 0.22, 1.0, -0.4, 0, { ...a, team: 1 }); break;
    case 'round': r.cyl(0.32, 0.32, 0.07, 0.2, 1.0, -0.4, 0x6a4a30, 10, { ...a, rz: 1.57 }); r.cone(0.07, 0.1, 0.25, 1.0, -0.4, p.metal, 5, { ...a, rz: -1.57 }); break;
    case 'bow': r.box(0.04, 1.1, 0.04, 0.2, 1.0, -0.4, 0x6a4a28, { ...a, rx: 0 }); r.box(0.01, 1.05, 0.01, 0.16, 1.0, -0.4, 0xd8d0b0, a); break;
    case 'crossbow': r.box(0.5, 0.06, 0.08, 0.3, 1.05, 0.25, 0x4a3a28, { part: 3, pv: SH }); r.box(0.05, 0.05, 0.5, 0.5, 1.05, 0.25, 0x5a4a30, { part: 3, pv: SH }); break;
    case 'book': r.box(0.05, 0.28, 0.2, 0.2, 0.95, -0.38, p.trim, a); r.box(0.06, 0.2, 0.14, 0.21, 0.95, -0.38, p.glow, { ...a, team: 2 }); break;
    case 'torch': r.box(0.04, 0.5, 0.04, 0.12, 1.0, -0.36, 0x4a3828, a); r.sph(0.09, 0.12, 1.28, -0.36, 0xff9a30, { ...a, team: 2, w: 5, h: 4 }); break;
    default: break;
  }
}

// o: skin cloth pants trim metal head weapon off bulk h cape shoulder skeleton robe banner tabard glow armor(0..1) horns hunch
export function humanoid(f, o = {}) {
  const p = pal(f), r = new Rig(), b = o.bulk || 1, hh = o.h || 1;
  const cloth = o.cloth ?? p.cloth, pants = o.pants ?? p.pants, metal = o.metal ?? p.metal, sk = o.skin ?? p.skin;
  const legc = o.skeleton ? p.bone : pants;
  if (o.robe) {
    r.cone(0.5 * b, 1.15 * hh, 0, 0.58 * hh, 0, cloth, 8, { part: 0 }); r.cyl(0.25 * b, 0.34 * b, 0.62, 0, 1.05 * hh, 0, cloth, 8);
    r.box(0.04, 1.1, 0.12, 0.34 * b, 0.62, 0, 0, { team: 1 });
  } else {
    r.box(0.17 * b, 0.74, 0.17 * b, 0, 0.36, 0.13 * b, legc, { part: 1, pv: [0, 0.72, 0.13 * b] });
    r.box(0.17 * b, 0.74, 0.17 * b, 0, 0.36, -0.13 * b, legc, { part: 2, pv: [0, 0.72, -0.13 * b] });
    r.box(0.2 * b, 0.1, 0.2 * b, 0.04, 0.05, 0.13 * b, o.boots ?? p.dark, { part: 1, pv: [0, 0.72, 0.13 * b] });
    r.box(0.2 * b, 0.1, 0.2 * b, 0.04, 0.05, -0.13 * b, o.boots ?? p.dark, { part: 2, pv: [0, 0.72, -0.13 * b] });
    r.box(0.34 * b, 0.62 * hh, 0.5 * b, 0, 1.03, 0, o.skeleton ? p.cloth : cloth);
    r.box(0.38 * b, 0.09, 0.54 * b, 0, 0.78, 0, p.trim);
    if (o.skeleton) for (let i = 0; i < 4; i++) r.box(0.04, 0.03, 0.46, 0.18 * b, 0.9 + i * 0.13, 0, p.bone);
    if (o.armor) { r.box(0.38 * b, 0.4, 0.54 * b, 0.02, 1.12, 0, metal); }
    if (o.tabard !== false) r.box(0.03, 0.46, 0.26, 0.18 * b + 0.01, 1.05, 0, 0, { team: 1 });
  }
  // arms
  const armc = o.skeleton ? p.bone : (o.sleeve ?? cloth);
  r.box(0.12 * b, 0.56, 0.12 * b, 0, 1.0, 0.33 * b, armc, { part: 3, pv: [0, 1.28, 0.33 * b] });
  r.box(0.12 * b, 0.56, 0.12 * b, 0, 1.0, -0.33 * b, armc, { part: 4, pv: [0, 1.28, -0.33 * b] });
  r.box(0.1 * b, 0.1, 0.1 * b, 0.02, 0.7, 0.33 * b, sk, { part: 3, pv: [0, 1.28, 0.33 * b] });
  r.box(0.1 * b, 0.1, 0.1 * b, 0.02, 0.7, -0.33 * b, sk, { part: 4, pv: [0, 1.28, -0.33 * b] });
  if (o.shoulder) { r.sph(0.16 * b, 0, 1.34, 0.33 * b, o.shoulder, { part: 3, pv: SH, sy: 0.7, w: 6, h: 4 }); r.sph(0.16 * b, 0, 1.34, -0.33 * b, o.shoulder, { part: 4, pv: SHL, sy: 0.7, w: 6, h: 4 }); }
  if (o.pauldronTeam) { r.sph(0.15 * b, 0, 1.36, 0.33 * b, 0, { part: 3, pv: SH, sy: 0.6, team: 1, w: 6, h: 4 }); r.sph(0.15 * b, 0, 1.36, -0.33 * b, 0, { part: 4, pv: SHL, sy: 0.6, team: 1, w: 6, h: 4 }); }
  head(r, o.head || 'plain', p, o);
  weapon(r, o.weapon || 'sword', p, o);
  offhand(r, o.off, p, o);
  if (o.cape) r.box(0.05, 1.0, 0.55 * b, -0.22 * b, 1.0, 0, o.cape, { part: 5, pv: [-0.2, 1.4, 0] });
  if (o.banner) { r.box(0.04, 2.1, 0.04, -0.32, 1.5, 0, 0x3a2c20); r.box(0.03, 0.55, 0.38, -0.32, 2.35, 0.2, 0, { team: 1, part: 5, pv: [-0.32, 2.6, 0] }); r.cone(0.07, 0.2, -0.32, 2.62, 0, 0xd8b24a, 4); }
  if (o.horns) { r.cone(0.05, 0.3, 0, 1.62, 0.2, p.bone, 5, { rx: 0.7 }); r.cone(0.05, 0.3, 0, 1.62, -0.2, p.bone, 5, { rx: -0.7 }); }
  if (o.backpack) r.box(0.22, 0.4, 0.34, -0.26, 1.05, 0, 0x5a4028);
  if (o.hunch) r.sph(0.28, -0.1, 1.3, 0, cloth, { sy: 0.8 });
  return r;
}

// four-legged beast (wolf/hound/warg/mount). o: color, belly, size, horns, mane, glow
export function quad(f, o = {}) {
  const p = pal(f), r = new Rig(), c = o.color ?? 0x5a5650, s = o.size || 1;
  r.box(1.0 * s, 0.46 * s, 0.42 * s, 0, 0.78 * s, 0, c); r.box(0.42 * s, 0.34 * s, 0.34 * s, 0.62 * s, 0.98 * s, 0, c, { rz: -0.2 });
  r.box(0.3 * s, 0.17 * s, 0.2 * s, 0.9 * s, 0.9 * s, 0, o.muzzle ?? 0x3a3834); r.box(0.5 * s, 0.1 * s, 0.14 * s, -0.7 * s, 0.9 * s, 0, c, { rz: 0.5, part: 5, pv: [-0.55 * s, 0.9 * s, 0] });
  r.box(0.07 * s, 0.16 * s, 0.06 * s, 0.55 * s, 1.2 * s, 0.12 * s, c); r.box(0.07 * s, 0.16 * s, 0.06 * s, 0.55 * s, 1.2 * s, -0.12 * s, c);
  r.box(0.05, 0.05, 0.05, 0.8 * s, 1.04 * s, 0.09 * s, o.glow ?? 0xff4020, { team: 2 }); r.box(0.05, 0.05, 0.05, 0.8 * s, 1.04 * s, -0.09 * s, o.glow ?? 0xff4020, { team: 2 });
  if (o.horns) { r.cone(0.04, 0.3, 0.55 * s, 1.3 * s, 0.14 * s, p.bone, 5, { rx: 0.4 }); r.cone(0.04, 0.3, 0.55 * s, 1.3 * s, -0.14 * s, p.bone, 5, { rx: -0.4 }); }
  if (o.ribs) for (let i = 0; i < 4; i++) r.box(0.04, 0.03, 0.46 * s, -0.2 * s + i * 0.18 * s, 0.8 * s, 0, p.bone, { shade: 0.95 });
  const legs = [[0.38, 0.15, 1], [0.38, -0.15, 2], [-0.38, 0.15, 2], [-0.38, -0.15, 1]];
  for (const [x, z, pt] of legs) r.box(0.12 * s, 0.6 * s, 0.12 * s, x * s, 0.3 * s, z * s, c, { part: pt, pv: [x * s, 0.6 * s, z * s], shade: 0.9 });
  if (o.rider) { // rider seat on the back
    const rd = humanoid(f, { ...o.rider, rider: true });
    mergeShift(r, rd, 0, 0.62 * s, 0);
  }
  if (o.saddle !== false) r.box(0.3 * s, 0.07, 0.46 * s, -0.02, 1.03 * s, 0, 0, { team: 1 });
  return r;
}
// append another rig's vertices shifted, legs of a seated rider stripped is not needed (hidden inside the mount)
function mergeShift(dst, src, dx, dy, dz) {
  for (let i = 0; i < src.pos.length; i += 3) dst.pos.push(src.pos[i] + dx, src.pos[i + 1] + dy, src.pos[i + 2] + dz);
  for (let i = 0; i < src.piv.length; i += 3) dst.piv.push(src.piv[i] + dx, src.piv[i + 1] + dy, src.piv[i + 2] + dz);
  for (const k of ['nor', 'col', 'part', 'team']) for (const v of src[k]) dst[k].push(v);
}
export { mergeShift };

// flyer (imp): small body, bat wings (part 9), tail
export function flyer(f, o = {}) {
  const p = pal(f), r = new Rig(), c = o.skin ?? p.skin;
  r.sph(0.3, 0, 1.0, 0, c, { sy: 1.2 }); r.sph(0.2, 0.18, 1.45, 0, c); r.cone(0.04, 0.24, 0.1, 1.68, 0.12, p.dark, 5, { rx: 0.4 }); r.cone(0.04, 0.24, 0.1, 1.68, -0.12, p.dark, 5, { rx: -0.4 });
  r.box(0.03, 0.04, 0.05, 0.34, 1.48, 0.08, p.glow, { team: 2 }); r.box(0.03, 0.04, 0.05, 0.34, 1.48, -0.08, p.glow, { team: 2 });
  r.box(0.6, 0.04, 0.04, -0.4, 0.8, 0, c, { rz: 0.5 }); r.cone(0.06, 0.2, -0.72, 0.62, 0, p.dark, 4, { rz: 2.3 });
  for (const s of [1, -1]) {
    r.box(0.5, 0.03, 0.9, -0.1, 1.2, 0.5 * s, o.wing ?? p.dark, { part: 9, pv: [0, 1.15, 0.08 * s], shade: 1 });
    r.box(0.5, 0.04, 0.05, -0.1, 1.22, 0.9 * s, p.bone, { part: 9, pv: [0, 1.15, 0.08 * s] });
    r.box(0.04, 0.5, 0.14, 0.1, 0.62, 0.15 * s, c, { part: 1 + (s > 0 ? 0 : 1), pv: [0, 0.8, 0.15 * s] });
  }
  r.box(0.04, 0.2, 0.3, 0.3, 1.05, 0, 0, { team: 1 });
  return r;
}
