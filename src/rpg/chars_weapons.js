// FOGBOUND: HERO weapon / shield / torch models. Every weapon is built with the GRIP at the origin and the business end along +y;
// chars_gear.js mounts it in a hand and chars_anim.js swings the arm. No sim imports.
import * as THREE from 'three';
import { glowSpriteMat } from '../models.js';
import { box, sph, cyl, mat, mk } from './chars_body.js';

export const RARITY_COL = [0xe6e6e6, 0xf2d84a, 0x58d058, 0x5a9bff, 0xb070ff];
const METAL = [0x80684e, 0x9aa0a6, 0xc6ccd2, 0x565c6c, 0xb8a060];   // rusty, iron, steel, darksteel, ancient
const WOOD = 0x5a3e26, LEATHER = 0x4a3220;

export function metalOf(item) { return METAL[Math.max(0, Math.min(4, item && item.tier != null ? item.tier : 1))]; }
function emi(item) { const r = item && item.rarity | 0; return r >= 2 ? { emissive: RARITY_COL[r], ei: 0.03 + 0.035 * (r - 2) } : {}; }

function blade(g, len, wid, m, y0 = 0.1, thick = 0.012) {
  mk(box(thick, len, wid, 0, len / 2, 0), m, 0, y0, 0, g);
  mk(cyl(0, wid * 0.55, 0.12, 4, 0.06), m, 0, y0 + len + 0.01, 0, g).rotation.y = 0.78; // tip
}

export function makeWeapon(item) {
  const g = new THREE.Group(), kind = item ? item.kind : 'sword', col = metalOf(item), mm = mat(col, emi(item)), wood = mat(WOOD), lea = mat(LEATHER), gold = mat(0x9a7a30);
  const grip = (len = 0.22, y = -0.08) => mk(cyl(0.022, 0.022, len, 6, len / 2), lea, 0, y, 0, g);
  switch (kind) {
    case 'sword': grip(); blade(g, 0.82, 0.06, mm); mk(box(0.04, 0.025, 0.22), gold, 0, 0.1, 0, g); mk(sph(0.03, 5, 4), gold, 0, -0.1, 0, g); break;
    case 'dagger': grip(0.16, -0.05); blade(g, 0.34, 0.045, mm, 0.08, 0.01); mk(box(0.03, 0.02, 0.12), gold, 0, 0.08, 0, g); break;
    case 'twohand': grip(0.42, -0.2); blade(g, 1.2, 0.09, mm, 0.12, 0.016); mk(box(0.05, 0.03, 0.34), gold, 0, 0.12, 0, g); mk(sph(0.04, 5, 4), gold, 0, -0.22, 0, g); break;
    case 'axe':
      mk(cyl(0.025, 0.028, 0.95, 6, 0.4), wood, 0, -0.1, 0, g);
      mk(box(0.04, 0.2, 0.24, 0.03, 0, 0), mm, 0, 0.66, 0, g); mk(box(0.03, 0.12, 0.05, 0.02, 0, 0.12), mm, 0, 0.66, 0, g).rotation.x = 0.4; break;
    case 'mace':
      mk(cyl(0.025, 0.028, 0.7, 6, 0.3), wood, 0, -0.1, 0, g);
      mk(sph(0.1, 7, 6), mm, 0, 0.62, 0, g);
      for (let i = 0; i < 6; i++) { const a = i * 1.047; mk(box(0.14, 0.05, 0.02, 0.06, 0, 0), mm, 0, 0.62, 0, g).rotation.y = a; }
      break;
    case 'spear':
      mk(cyl(0.022, 0.026, 2.1, 6, 0.5), wood, 0, -0.5, 0, g);
      mk(cyl(0, 0.05, 0.28, 5, 0.14), mm, 0, 1.6, 0, g); mk(sph(0.03, 5, 4), mat(0x7a2020), 0, 1.5, 0, g); break;
    case 'staff': {
      mk(cyl(0.025, 0.03, 1.7, 6, 0.6), mat(0x3e2c20), 0, -0.25, 0, g);
      const orb = new THREE.Color(RARITY_COL[(item && item.rarity) | 0] || 0x7a6ad0);
      mk(sph(0.07, 7, 6), mat(0x8a7aff, { emissive: 0x6a5aff, ei: 1.1 }), 0, 1.5, 0, g);
      const s = new THREE.Sprite(glowSpriteMat(0x8a7aff, 0.8)); s.scale.set(0.5, 0.5, 1); s.position.y = 1.5; g.add(s); g.userData.glow = s; void orb;
      for (let i = 0; i < 3; i++) mk(box(0.012, 0.16, 0.02, 0.05, 0.1, 0), mat(0x3e2c20), 0, 1.38, 0, g).rotation.y = i * 2.09;
      break;
    }
    case 'bow': {   // held in the left hand, vertical, belly towards +x
      const arc = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.017, 4, 12, Math.PI), mat(item && item.tier >= 2 ? 0x6a4a30 : 0x8a6a40));
      arc.rotation.z = -Math.PI / 2; arc.position.y = 0; g.add(arc);
      const str = mk(cyl(0.004, 0.004, 0.92, 3), mat(0xdddddd), 0, 0, 0, g); str.userData.string = true; g.userData.string = str;
      mk(box(0.03, 0.14, 0.04), lea, 0, 0, 0, g);
      break;
    }
    case 'crossbow':
      mk(box(0.5, 0.06, 0.06, 0.2, 0, 0), wood, 0, 0, 0, g).rotation.z = -Math.PI / 2;
      { const arm = mk(box(0.04, 0.04, 0.5, 0, 0.42, 0), mat(0x3a2e24), 0, 0, 0, g); arm.rotation.z = 0; }
      mk(box(0.02, 0.02, 0.5, 0, 0.4, 0), mat(0xdddddd), 0, 0.02, 0, g);
      break;
    default: mk(cyl(0.02, 0.02, 0.4, 5, 0.2), wood, 0, 0, 0, g); // misc: a plain stick
  }
  g.userData.kind = kind; g.userData.long = kind === 'spear' || kind === 'twohand' || kind === 'staff';
  return g;
}

export function makeShield(item) {
  // face normal = +z (outer side of the left forearm); extents along x (width) and y (height)
  const g = new THREE.Group(), t = Math.max(0, Math.min(4, item && item.tier != null ? item.tier : 1)), m = mat(METAL[t], emi(item)), wood = mat(0x6a4a2c), s = 0.75 + t * 0.06;
  if (t === 0) { mk(cyl(0.22, 0.22, 0.04, 12), wood, 0, 0, 0, g).rotation.x = Math.PI / 2; }
  else if (t <= 2) { mk(box(0.4 * s, 0.52 * s, 0.04, 0, 0, 0), m, 0, 0, 0, g); mk(box(0.05, 0.34 * s, 0.05, 0, 0, 0), mat(0x7a3030), 0, 0, 0.02, g); mk(box(0.34 * s, 0.05, 0.05, 0, 0, 0), mat(0x7a3030), 0, 0.05, 0.02, g); }
  else { mk(box(0.5 * s, 0.78 * s, 0.05, 0, 0, 0), m, 0, 0, 0, g); mk(box(0.07, 0.56 * s, 0.07, 0, 0, 0), mat(0xb89a50), 0, 0, 0.02, g); }
  mk(sph(0.07, 6, 5), mat(0xb8a060), 0, 0, 0.05, g); // boss
  return g;
}

export function makeTorch(light) {
  const g = new THREE.Group();
  mk(cyl(0.025, 0.03, 0.5, 6, 0.2), mat(0x4a3220), 0, -0.05, 0, g);
  mk(cyl(0.05, 0.03, 0.12, 6, 0.06), mat(0x2a2220), 0, 0.42, 0, g);
  const fl = new THREE.Sprite(glowSpriteMat(0xffa040, 0.95)); fl.scale.set(0.5, 0.6, 1); fl.position.y = 0.58; g.add(fl); g.userData.flame = fl;
  if (light) { const l = new THREE.PointLight(0xffa850, 2.4, 17, 1.7); l.position.y = 0.6; g.add(l); g.userData.light = l; }
  return g;
}
