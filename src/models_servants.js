// v0.5 servant models (procedural). Builders are looked up by makeUnitModel in models.js (SERVANT_BUILDERS) after the old BUILDERS.
// Eight servants, each readable by silhouette and colour: knight (wide plate, red cape, shield), priest (pale robe, glowing staff), battle-mage (purple, fire orb),
// hound (wolf), archer (green hood, bow), golem (huge grey stone, glowing core), imp-tamer (dark horned, violet tome), berserker (bare-chested, horned, big axe).
// MK = helpers exported from models.js (read lazily: models.js and this file import each other).
import * as THREE from 'three';
import { MK } from './models.js';

const hum = (o) => MK.humanoid(o);
const lam = (c, o) => MK.lambert(c, o);

function glowOn(g, color, size, y, op = 0.6) {
  const gl = new THREE.Sprite(MK.glowSpriteMat(color, op)); gl.scale.set(size, size, 1); gl.position.y = y; g.add(gl);
}
// a small ghost: translucent body, trailing cone, glowing eyes
function spirit() {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0xb89cff, transparent: true, opacity: 0.78, emissive: 0x7a50d0, emissiveIntensity: 0.9, depthWrite: false });
  const head = new THREE.Mesh(MK.SPH(0.3, 7, 6), bodyMat); head.position.y = 1.0; g.add(head);
  const tail = new THREE.Mesh(MK.CONE(0.3, 0.9, 6), bodyMat); tail.position.y = 0.5; tail.rotation.x = Math.PI; g.add(tail);
  g.add(MK.mesh(MK.BOX(0.05, 0.07, 0.07), lam(0xffffff, { emissive: 0xffffff, ei: 1.5 }), 0.26, 1.03, 0.1));
  g.add(MK.mesh(MK.BOX(0.05, 0.07, 0.07), lam(0xffffff, { emissive: 0xffffff, ei: 1.5 }), 0.26, 1.03, -0.1));
  glowOn(g, 0xb08cff, 1.9, 0.9, 0.7);
  g.userData = { kind: 'wisp', top: 1.7, designScale: 1 };
  return g;
}
function wisp() {
  const g = new THREE.Group();
  g.add(MK.mesh(MK.SPH(0.34, 7, 6), lam(0xffa040, { emissive: 0xff6a10, ei: 1.8 }), 0, 1.0, 0));
  g.add(MK.mesh(MK.CONE(0.28, 0.8, 6), lam(0xff6a20, { emissive: 0xff4010, ei: 1.4 }), 0, 1.65, 0));
  glowOn(g, 0xff8a30, 2.2, 1.1, 0.8);
  g.userData = { kind: 'wisp', top: 2.2, designScale: 1 };
  return g;
}

export const SERVANT_BUILDERS = {
  // ---- the eight servants; `a` = team accent colour on the tabard stripe
  knight: (a) => hum({ head: 'helm', cloth: 0x7a7e86, pants: 0x50555c, trim: 0xb0b4bc, accent: a, weapon: 'shieldsword', bulk: 1.45, scale: 1.2, cape: 0x7a1a1a, shoulder: 0xc0c4cc, skin: 0xc9a888 }),
  priest: (a) => hum({ head: 'hood', cloth: 0xe8e0c8, pants: 0xb8a888, trim: 0xd8b24a, accent: a, weapon: 'staff', scale: 1.0, skin: 0xc9a888, cape: 0xcfc4a0, glow: 0xfff0b0 }),
  battlemage: (a) => hum({ head: 'hood', cloth: 0x3a2a5a, pants: 0x241a3a, trim: 0xff8a30, accent: a, weapon: 'fire', scale: 1.08, skin: 0xc9a888, cape: 0x2a1a44, glow: 0xff7a2a, shoulder: 0x5a4a7a }),
  warhound: () => { const w = MK.wolf(0x8a7050); w.scale.setScalar(0.95); return w; },
  ranger: (a) => hum({ head: 'hood', cloth: 0x3a5030, pants: 0x2a3a22, trim: 0x6a5a40, accent: a, weapon: 'bow', scale: 0.98, bulk: 0.92, skin: 0xc9a888, cape: 0x2a3a22 }),
  golem: (a) => {
    const g = hum({ head: 'helm', skin: 0x8a8a80, cloth: 0x7c7c74, pants: 0x62625c, trim: 0x9a9a92, accent: a, weapon: 'boulder', bulk: 2.4, scale: 1.45, shoulder: 0x94948c, eyes: 0xffb040 });
    glowOn(g, 0xffa040, 1.1, 1.5, 0.55); // glowing core
    return g;
  },
  summoner: (a) => hum({ head: 'horned', cloth: 0x3a1a5a, pants: 0x241238, trim: 0x4a3a60, accent: a, weapon: 'tome', cape: 0x2a1040, scale: 1.08, shoulder: 0x4a2a6a, glow: 0xc08cff, skin: 0xb8a8c0 }),
  berserk: (a) => hum({ head: 'horned', skin: 0xb88468, cloth: 0x6a2a1a, pants: 0x3a2a1e, trim: 0x70604a, accent: a, weapon: 'axe', bulk: 1.3, scale: 1.14, shoulder: 0x7a5a3a }),
  spirit,
  // ---- town militia and legacy summons
  shieldman: (a) => hum({ head: 'helm', cloth: 0x4a4030, pants: 0x2a2218, trim: 0x8a8a90, accent: a, weapon: 'shieldsword', bulk: 1.25, scale: 1.05, skin: 0xb59878, shoulder: 0x6a5a40 }),
  captain: (a) => hum({ head: 'mask', cloth: 0x3a2a4a, pants: 0x241e30, trim: 0xd8b24a, accent: a, weapon: 'sword', bulk: 1.2, scale: 1.25, cape: 0x5a1a2a, shoulder: 0xd8b24a, skin: 0xb59878 }),
  spiritwolf: () => { const w = MK.wolf(0x7ad0ff); glowOn(w, 0x7ad0ff, 2.2, 0.9, 0.7); return w; },
  flamewisp: wisp,
};

// ---- look (levels / evolutions are gone: every servant looks like its type) --------------------------------------
export const lookOf = () => 0;
export const applyLook = (g) => g;
