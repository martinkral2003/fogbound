// v0.5 demon horde models (DEMONS lane). Builders are looked up by makeUnitModel in models.js (DEMON_BUILDERS) after BUILDERS / SERVANT_BUILDERS.
// Demons are red/black skinned with curled horns, glowing eyes and fire: imps are tiny winged swarmers, hellhounds are burning wolves, brutes are hulking
// horned bruisers, warlocks are hooded fire-casters, hulks are charred siege giants with lava cracks, the Demon Lord is enormous with wings and a flame crown.
// MK = helpers exported from models.js (read lazily: models.js and this file import each other).
import * as THREE from 'three';
import { MK, glowMat } from './models.js';

const hum = (o) => MK.humanoid(o);
const flare = (color, op, sx, sy) => { const s = new THREE.Sprite(MK.glowSpriteMat(color, op)); s.scale.set(sx, sy ?? sx, 1); return s; };

// eyes: two emissive boxes + a soft glow at the face (humanoid head height = 1.85 * height, face towards +x)
function eyes(g, hy, color, spread = 0.09, glow = 0.55) {
  for (const s of [-1, 1]) g.add(MK.mesh(MK.BOX(0.05, 0.05, 0.05), glowMat(color, 1), 0.2, hy, s * spread));
  const f = flare(color, 0.8, glow); f.position.set(0.24, hy, 0); g.add(f);
}
// two curled horns on the head
function horns(g, hy, len, color = 0x1a1210, spread = 0.15, tilt = 0.55) {
  for (const s of [-1, 1]) {
    const h = MK.mesh(MK.CONE(0.06 * len + 0.02, 0.42 * len, 5), MK.lambert(color, { flat: true }), -0.03, hy + 0.2 + 0.1 * len, s * spread);
    h.rotation.x = s * tilt; h.rotation.z = 0.35; g.add(h);
  }
}
function tail(g, y, len = 0.7, color = 0x5a1410) {
  const t = MK.mesh(MK.BOX(len, 0.06, 0.06), MK.lambert(color, { flat: true }), -0.3 - len / 2, y, 0); t.rotation.z = 0.35; g.add(t);
  const tip = MK.mesh(MK.CONE(0.08, 0.2, 4), MK.lambert(0xff5a20, { emissive: 0xff4a10, ei: 1.2 }), -0.3 - len - 0.05, y + len * 0.3, 0); tip.rotation.z = Math.PI / 2 + 0.35; g.add(tip);
}
// bat-like wings: two angled dark panels with a glowing rim
function wings(g, y, sz, color = 0x2a0a0c) {
  for (const s of [-1, 1]) {
    const w = new THREE.Group(); w.position.set(-0.28, y, s * 0.18);
    const a = MK.mesh(MK.BOX(0.03, 0.7 * sz, 0.9 * sz), MK.lambert(color, { flat: true, opacity: 1 }), 0, 0.2 * sz, s * 0.45 * sz); a.rotation.x = s * 0.6; a.rotation.z = 0.15;
    const b = MK.mesh(MK.BOX(0.025, 0.04, 0.95 * sz), glowMat(0xff3a10, 0.55), 0, 0.55 * sz, s * 0.5 * sz); b.rotation.x = s * 0.6;
    w.add(a, b); g.add(w);
  }
}
// molten cracks across the torso
function cracks(g, w, height, n = 5) {
  for (let i = 0; i < n; i++) {
    const c = MK.mesh(MK.BOX(0.025, 0.2 + (i % 3) * 0.08, 0.05 + (i % 2) * 0.06), glowMat(0xff6a20, 0.95), 0.31 * w + 0.01, (0.95 + i * 0.13) * height, ((i * 37) % 11 - 5) * 0.045 * w);
    c.rotation.x = (i - 2) * 0.35; g.add(c);
  }
}
function spikes(g, y, w, n = 3, color = 0x1a1a1e) {
  for (const s of [-1, 1]) for (let i = 0; i < n; i++) {
    const p = MK.mesh(MK.CONE(0.06, 0.34, 4), MK.lambert(color, { flat: true }), -0.05 - i * 0.07, y + 0.12 + i * 0.02, s * (0.4 * w + 0.12));
    p.rotation.x = s * (0.9 + i * 0.25); g.add(p);
  }
}

export const DEMON_BUILDERS = {
  imp: () => {
    const g = hum({ head: 'head', skin: 0xb02a1c, cloth: 0x5a1410, pants: 0x3a0e0c, trim: 0x2a0a08, accent: 0xff6a20, weapon: 'dagger', bulk: 0.8, scale: 0.66, eyes: 0xffd040 });
    eyes(g, 1.85, 0xffd040, 0.08, 0.45); horns(g, 1.85, 0.8, 0x1a1210, 0.12, 0.5); tail(g, 0.95, 0.7); wings(g, 1.45, 0.8);
    return g;
  },
  hellhound: () => {
    const g = new THREE.Group();
    const w = MK.wolf(0x2a0e0c); g.add(w);
    for (const s of [-1, 1]) { const h = MK.mesh(MK.CONE(0.05, 0.3, 5), MK.lambert(0x1a1210, { flat: true }), 0.6, 1.12, s * 0.14); h.rotation.x = s * 0.45; h.rotation.z = 0.4; g.add(h); }
    const f1 = flare(0xff5a18, 0.85, 1.5, 1.1); f1.position.set(0.1, 1.15, 0); g.add(f1);
    const f2 = flare(0xff8a30, 0.7, 1.0, 0.9); f2.position.set(-0.5, 1.0, 0); g.add(f2);
    const f3 = flare(0xffc040, 0.9, 0.5); f3.position.set(0.82, 0.93, 0); g.add(f3);
    g.userData = Object.assign({}, w.userData, { top: 1.8, designScale: 1 });
    g.scale.setScalar(1.12);
    return g;
  },
  brute: () => {
    const g = hum({ head: 'horned', skin: 0x8a2418, cloth: 0x3a1410, pants: 0x241210, trim: 0x6a1a12, accent: 0xff5a20, weapon: 'club', bulk: 2.0, scale: 1.5, shoulder: 0x2a2a30, glow: 0xff5a20, eyes: 0xffa040 });
    eyes(g, 1.85, 0xffa040, 0.1, 0.6); horns(g, 1.85, 1.3, 0x1a1210, 0.2, 0.7); spikes(g, 1.6, 2.0, 3); cracks(g, 2.0, 1, 3);
    return g;
  },
  warlock: () => {
    const g = hum({ head: 'hood', skin: 0x7a2418, cloth: 0x2a0a1a, pants: 0x1c0812, trim: 0x6a2a3a, accent: 0xff6a20, weapon: 'staff', bulk: 1.0, scale: 1.15, cape: 0x1a0810, glow: 0xff5a20, eyes: 0xffa060, shoulder: 0x1a1a1e });
    eyes(g, 1.85, 0xffa060, 0.07, 0.5);
    const o = flare(0xff5a20, 0.8, 0.55); o.position.set(0.1, 2.35, 0.4); g.add(o);
    return g;
  },
  hulk: () => {
    const g = hum({ head: 'head', skin: 0x2a1614, cloth: 0x2a1a18, pants: 0x1c1210, trim: 0x401410, accent: 0xff4a10, weapon: 'club', bulk: 2.8, scale: 2.0, height: 0.95, shoulder: 0x3a3a3e, glow: 0xff4a10, eyes: 0xff7030 });
    eyes(g, 1.76, 0xff7030, 0.12, 0.8); horns(g, 1.76, 1.6, 0x0e0a0a, 0.22, 0.8); cracks(g, 2.8, 0.95, 6); spikes(g, 1.5, 2.8, 3);
    const f = flare(0xff4a10, 0.6, 2.4, 1.8); f.position.set(-0.3, 1.5, 0); g.add(f);
    return g;
  },
  demonlord: () => {
    const g = hum({ head: 'horned', skin: 0x5a1410, cloth: 0x1a0c10, pants: 0x120808, trim: 0x2a1014, accent: 0xff4a20, weapon: 'greatsword', bulk: 2.1, scale: 2.8, shoulder: 0x1a1a20, cape: 0x4a0808, glow: 0xff3a10, eyes: 0xff5a20 });
    eyes(g, 1.85, 0xff5a20, 0.11, 0.9); horns(g, 1.85, 2.3, 0x120c0c, 0.22, 0.75); spikes(g, 1.6, 2.1, 4); cracks(g, 2.1, 1, 6); wings(g, 1.7, 2.2, 0x1a0608); tail(g, 0.9, 1.1);
    const aura = flare(0xff3a10, 0.55, 3.4, 4.2); aura.position.set(-0.1, 1.5, 0); g.add(aura);
    const crown = flare(0xffa030, 0.8, 1.1, 1.3); crown.position.set(0, 2.45, 0); g.add(crown);
    return g;
  },
  // stationary gate entity: an empty shell, horde_view.js draws the portal arch
  demongate: () => { const g = new THREE.Group(); g.userData.top = 8; return g; },
};
