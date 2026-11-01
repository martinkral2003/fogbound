// Procedural low-poly models. Everything is built from primitives; geometries/materials are cached.
// Convention: models face +x in local space; Y is up; origin is on the ground.
import * as THREE from 'three';
import { SERVANT_BUILDERS, applyLook, lookOf } from './models_servants.js';
import { DEMON_BUILDERS } from './models_demons.js'; // v0.5 DEMONS lane

const geoCache = new Map();
const matCache = new Map();

export function lambert(color, o = {}) {
  const k = `L${color}|${o.flat ? 1 : 0}|${o.emissive || 0}|${o.opacity ?? 1}|${o.vc ? 1 : 0}`;
  let m = matCache.get(k);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, flatShading: !!o.flat, vertexColors: !!o.vc });
    if (o.emissive) { m.emissive = new THREE.Color(o.emissive); m.emissiveIntensity = o.ei ?? 1; }
    if (o.opacity !== undefined && o.opacity < 1) { m.transparent = true; m.opacity = o.opacity; m.depthWrite = false; }
    matCache.set(k, m);
  }
  return m;
}
export function glowMat(color, opacity = 1) {
  const k = `G${color}|${opacity}`;
  let m = matCache.get(k);
  if (!m) { m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }); matCache.set(k, m); }
  return m;
}

function geo(key, make) { let g = geoCache.get(key); if (!g) { g = make(); geoCache.set(key, g); } return g; }
const BOX = (w, h, d) => geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const CYL = (rt, rb, h, s = 8) => geo(`c${rt},${rb},${h},${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s));
const SPH = (r, w = 8, h = 6) => geo(`s${r},${w},${h}`, () => new THREE.SphereGeometry(r, w, h));
const CONE = (r, h, s = 8) => geo(`k${r},${h},${s}`, () => new THREE.ConeGeometry(r, h, s));

function mesh(g, m, x = 0, y = 0, z = 0) { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); return o; }

// part list -> one merged vertex-coloured geometry
export function mergeColored(parts) {
  const pos = [], nor = [], col = [];
  for (const p of parts) {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
    if (p.m) g.applyMatrix4(p.m);
    const pa = g.attributes.position, na = g.attributes.normal, c = new THREE.Color(p.color);
    for (let i = 0; i < pa.count; i++) {
      pos.push(pa.getX(i), pa.getY(i), pa.getZ(i)); nor.push(na.getX(i), na.getY(i), na.getZ(i)); col.push(c.r, c.g, c.b);
    }
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}
const M = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
  const m = new THREE.Matrix4();
  m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
  return m;
};
const P = (g, color, m) => ({ geo: g, color, m });

// ---------------------------------------------------------------- humanoids
const humanoidCache = new Map();
function limbGeo(w, h, d, color) {
  return geo(`limb${w},${h},${d},${color}`, () => mergeColored([P(BOX(w, h, d), color, M(0, -h / 2, 0))]));
}

function humanoid(o) {
  const {
    skin = 0xc9bfa0, cloth = 0x3a3a40, pants = 0x2a2a2e, trim = 0x777777, accent = 0xffffff, bulk = 1, height = 1, head = 'head', weapon = 'sword',
    cape = null, scale = 1, shoulder = null, glow = null, eyes = 0x101010, skeleton = false,
  } = o;
  const g = new THREE.Group();
  const w = bulk;
  const parts = [];
  // torso + belt
  parts.push(P(BOX(0.6 * w, 0.78 * height, 0.36 * w), cloth, M(0, 1.2 * height, 0)));
  parts.push(P(BOX(0.64 * w, 0.1, 0.4 * w), trim, M(0, 0.86 * height, 0)));
  parts.push(P(BOX(0.12, 0.2, 0.02), accent, M(0.2 * w, 1.35 * height, 0))); // team tabard stripe
  if (shoulder) {
    parts.push(P(SPH(0.2 * w, 6, 5), shoulder, M(0, 1.55 * height, 0.38 * w)));
    parts.push(P(SPH(0.2 * w, 6, 5), shoulder, M(0, 1.55 * height, -0.38 * w)));
  }
  if (skeleton) {
    for (let i = 0; i < 4; i++) parts.push(P(BOX(0.04, 0.03, 0.46 * w), 0xd8d2bc, M(0.19 * w, (1.0 + i * 0.16) * height, 0)));
  }
  // head
  const hy = 1.85 * height;
  switch (head) {
    case 'skull':
      parts.push(P(SPH(0.2, 7, 6), 0xe2dcc6, M(0.0, hy, 0)));
      parts.push(P(BOX(0.16, 0.1, 0.2), 0xd0c9b0, M(0.1, hy - 0.16, 0)));
      parts.push(P(BOX(0.04, 0.07, 0.07), eyes, M(0.19, hy + 0.02, 0.08)));
      parts.push(P(BOX(0.04, 0.07, 0.07), eyes, M(0.19, hy + 0.02, -0.08)));
      break;
    case 'hood':
      parts.push(P(SPH(0.16, 6, 5), skin, M(0.04, hy - 0.02, 0)));
      parts.push(P(CONE(0.3, 0.55, 7), cloth, M(-0.04, hy + 0.12, 0, 0, 0, 0.15)));
      parts.push(P(BOX(0.04, 0.05, 0.14), eyes, M(0.2, hy, 0)));
      break;
    case 'orc':
      parts.push(P(BOX(0.34, 0.32, 0.34), skin, M(0.02, hy, 0)));
      parts.push(P(BOX(0.12, 0.08, 0.32), 0x2a3a22, M(0.2, hy + 0.1, 0)));
      parts.push(P(BOX(0.05, 0.14, 0.04), 0xe8e0c0, M(0.18, hy - 0.2, 0.1, 0.2, 0, 0)));
      parts.push(P(BOX(0.05, 0.14, 0.04), 0xe8e0c0, M(0.18, hy - 0.2, -0.1, -0.2, 0, 0)));
      break;
    case 'helm':
      parts.push(P(SPH(0.21, 7, 6), trim, M(0, hy, 0)));
      parts.push(P(BOX(0.06, 0.05, 0.3), 0x15151a, M(0.17, hy, 0)));
      break;
    case 'horned':
      parts.push(P(SPH(0.21, 7, 6), trim, M(0, hy, 0)));
      parts.push(P(BOX(0.06, 0.05, 0.3), 0x15151a, M(0.17, hy, 0)));
      parts.push(P(CONE(0.05, 0.4, 5), 0xe8e0c0, M(0, hy + 0.2, 0.25, 0.6, 0, 0)));
      parts.push(P(CONE(0.05, 0.4, 5), 0xe8e0c0, M(0, hy + 0.2, -0.25, -0.6, 0, 0)));
      break;
    case 'crown':
      parts.push(P(SPH(0.2, 7, 6), skin, M(0, hy, 0)));
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; parts.push(P(CONE(0.04, 0.2, 4), 0xd8b24a, M(Math.cos(a) * 0.17, hy + 0.27, Math.sin(a) * 0.17))); }
      parts.push(P(BOX(0.04, 0.05, 0.14), eyes, M(0.19, hy, 0)));
      break;
    case 'mask':
      parts.push(P(SPH(0.19, 7, 6), cloth, M(0, hy, 0)));
      parts.push(P(BOX(0.05, 0.1, 0.24), 0x111111, M(0.17, hy + 0.0, 0)));
      parts.push(P(BOX(0.05, 0.04, 0.3), accent, M(0.16, hy + 0.08, 0)));
      break;
    default:
      parts.push(P(SPH(0.19, 7, 6), skin, M(0, hy, 0)));
      parts.push(P(BOX(0.04, 0.05, 0.14), eyes, M(0.17, hy + 0.02, 0)));
  }
  if (cape) parts.push(P(BOX(0.06, 0.95 * height, 0.62 * w), cape, M(-0.22 * w, 1.15 * height, 0, 0, 0, 0.12)));
  const body = mesh(mergeColored(parts), lambert(0xffffff, { vc: true, flat: true }));
  body.position.y = 0; g.add(body);

  const legGeo = limbGeo(0.2 * w, 0.82 * height, 0.2 * w, pants);
  const legL = new THREE.Group(), legR = new THREE.Group();
  legL.position.set(0, 0.82 * height, 0.16 * w); legR.position.set(0, 0.82 * height, -0.16 * w);
  const lm = lambert(0xffffff, { vc: true, flat: true });
  legL.add(new THREE.Mesh(legGeo, lm)); legR.add(new THREE.Mesh(legGeo, lm));
  g.add(legL, legR);
  const armGeo = limbGeo(0.16 * w, 0.72 * height, 0.16 * w, skeleton ? 0xd8d2bc : cloth);
  const armL = new THREE.Group(), armR = new THREE.Group();
  armL.position.set(0, 1.55 * height, 0.4 * w); armR.position.set(0, 1.55 * height, -0.4 * w);
  armL.add(new THREE.Mesh(armGeo, lm)); armR.add(new THREE.Mesh(armGeo, lm));
  g.add(armL, armR);

  // weapons
  const wgrp = new THREE.Group();
  const hand = (-0.72 * height);
  switch (weapon) {
    case 'sword':
      wgrp.add(mesh(BOX(0.07, 0.95, 0.04), lambert(0xc4c8cc, { flat: true }), 0, hand - 0.4, 0));
      wgrp.add(mesh(BOX(0.06, 0.06, 0.24), lambert(0x6a4a2a), 0, hand + 0.03, 0));
      armR.add(wgrp); break;
    case 'rustsword':
      wgrp.add(mesh(BOX(0.07, 0.85, 0.04), lambert(0x8a8478, { flat: true }), 0, hand - 0.35, 0));
      wgrp.add(mesh(BOX(0.06, 0.06, 0.22), lambert(0x4a3a2a), 0, hand + 0.03, 0));
      armR.add(wgrp); break;
    case 'axe':
      wgrp.add(mesh(CYL(0.035, 0.035, 1.1, 5), lambert(0x5a3e24), 0, hand - 0.45, 0));
      wgrp.add(mesh(BOX(0.34, 0.34, 0.06), lambert(0x9aa0a6, { flat: true }), 0.12, hand - 0.9, 0));
      armR.add(wgrp); break;
    case 'club':
      wgrp.add(mesh(CYL(0.09, 0.05, 1.2, 6), lambert(0x6a4a2a), 0, hand - 0.5, 0));
      wgrp.add(mesh(SPH(0.16, 6, 5), lambert(0x5a3e24), 0, hand - 1.1, 0));
      armR.add(wgrp); break;
    case 'dagger':
      wgrp.add(mesh(BOX(0.05, 0.5, 0.03), lambert(0xd0d4d8, { flat: true }), 0, hand - 0.25, 0));
      armR.add(wgrp);
      { const d2 = mesh(BOX(0.05, 0.4, 0.03), lambert(0xd0d4d8, { flat: true }), 0, hand - 0.2, 0); armL.add(d2); }
      break;
    case 'spear':
      wgrp.add(mesh(CYL(0.03, 0.03, 1.9, 5), lambert(0x6a4a2a), 0, hand - 0.3, 0));
      wgrp.add(mesh(CONE(0.07, 0.3, 5), lambert(0xc4c8cc), 0, hand - 1.3, 0));
      armR.add(wgrp); break;
    case 'staff': {
      const st = new THREE.Group();
      st.add(mesh(CYL(0.04, 0.045, 2.3, 6), lambert(0x3a2c22), 0, 1.15, 0));
      st.add(mesh(SPH(0.14, 7, 6), lambert(accent, { emissive: accent, ei: 1.2 }), 0, 2.4, 0));
      st.add(mesh(SPH(0.3, 8, 6), glowMat(accent, 0.25), 0, 2.4, 0));
      st.position.set(0.15, 0, -0.5 * w); st.rotation.z = -0.08; g.add(st);
      armR.rotation.z = 0.0; break;
    }
    case 'bow': {
      const bw = new THREE.Group();
      const arc = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.025, 4, 10, Math.PI), lambert(0x6a4a2a));
      arc.rotation.z = -Math.PI / 2; arc.rotation.y = Math.PI / 2; bw.add(arc);
      bw.add(mesh(CYL(0.006, 0.006, 1.0, 3), lambert(0xdddddd), 0, 0, 0));
      bw.position.set(0.2, hand + 0.25, 0); armR.add(bw); break;
    }
    case 'crossbow': {
      const cb = new THREE.Group();
      cb.add(mesh(BOX(0.7, 0.07, 0.07), lambert(0x4a3a2a), 0.2, 0, 0));
      cb.add(mesh(BOX(0.06, 0.06, 0.7), lambert(0x6a5a40), 0.5, 0, 0));
      cb.position.set(0.0, hand + 0.1, 0); armR.add(cb); break;
    }
    case 'fire':
      armR.add(mesh(SPH(0.16, 6, 5), lambert(0xff7a2a, { emissive: 0xff5a10, ei: 1.5 }), 0, hand - 0.05, 0));
      armR.add(mesh(SPH(0.32, 8, 6), glowMat(0xff7a2a, 0.3), 0, hand - 0.05, 0));
      break;
    case 'censer':
      wgrp.add(mesh(CYL(0.01, 0.01, 0.7, 3), lambert(0x666666), 0, hand - 0.35, 0));
      wgrp.add(mesh(SPH(0.14, 6, 5), lambert(0x9a7a30, { emissive: 0xff7020, ei: 0.8 }), 0, hand - 0.78, 0));
      armR.add(wgrp); break;
    case 'shieldsword': {
      wgrp.add(mesh(BOX(0.07, 0.8, 0.04), lambert(0xc4c8cc, { flat: true }), 0, hand - 0.35, 0));
      wgrp.add(mesh(BOX(0.06, 0.06, 0.22), lambert(0x6a4a2a), 0, hand + 0.03, 0));
      armR.add(wgrp);
      const sh = mesh(CYL(0.42, 0.42, 0.07, 10), lambert(0x6a5a40, { flat: true }), 0.2, hand + 0.05, 0.12); sh.rotation.z = Math.PI / 2; armL.add(sh);
      armL.add(mesh(SPH(0.1, 6, 5), lambert(accent, { emissive: accent, ei: 0.6 }), 0.26, hand + 0.05, 0.12));
      break;
    }
    case 'greatsword':
      wgrp.add(mesh(BOX(0.13, 1.6, 0.05), lambert(0xb4b8c0, { flat: true }), 0, hand - 0.7, 0));
      wgrp.add(mesh(BOX(0.08, 0.08, 0.44), lambert(0x6a4a2a), 0, hand + 0.03, 0));
      wgrp.add(mesh(BOX(0.05, 0.05, 0.05), lambert(accent, { emissive: accent, ei: 1.2 }), 0, hand - 1.45, 0));
      armR.add(wgrp); break;
    case 'tome':
      armL.add(mesh(BOX(0.3, 0.05, 0.38), lambert(0x3a2a40), 0.22, hand + 0.12, 0.05));
      armL.add(mesh(BOX(0.26, 0.055, 0.32), lambert(accent, { emissive: accent, ei: 0.9 }), 0.22, hand + 0.15, 0.05));
      break;
    case 'boulder':
      armR.add(mesh(SPH(0.55, 7, 6), lambert(0x77797a, { flat: true }), 0.15, hand - 0.1, 0));
      break;
    case 'keg': {
      armL.add(mesh(CYL(0.2, 0.2, 0.34, 8), lambert(0x6a4a2a), 0.1, hand + 0.1, 0.0));
      break;
    }
  }
  if (glow) {
    const gl = new THREE.Sprite(glowSpriteMat(glow));
    gl.scale.set(0.5, 0.5, 1); gl.position.set(0.2, hy, 0); g.add(gl);
  }
  g.scale.setScalar(scale);
  g.userData = { legL, legR, armL, armR, body, bulk: w, height, kind: 'humanoid', hasBow: weapon === 'bow' || weapon === 'crossbow' || weapon === 'fire' || weapon === 'staff', staff: weapon === 'staff', top: 2.4 * height * scale, designScale: scale };
  return g;
}

const spriteMats = new Map();
let glowTex = null;
function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}
export function glowSpriteMat(color, opacity = 0.9) {
  const k = `${color}|${opacity}`;
  let m = spriteMats.get(k);
  if (!m) { m = new THREE.SpriteMaterial({ map: glowTexture(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity }); spriteMats.set(k, m); }
  return m;
}
export const softTexture = glowTexture;

// ---------------------------------------------------------------- animals / monsters
function wolf(color = 0x5a5650) {
  const g = new THREE.Group();
  const parts = [
    P(BOX(1.0, 0.45, 0.4), color, M(0, 0.72, 0)), P(BOX(0.4, 0.35, 0.32), color, M(0.62, 0.86, 0)), P(BOX(0.26, 0.16, 0.18), 0x3a3834, M(0.9, 0.8, 0)),
    P(BOX(0.08, 0.16, 0.06), color, M(0.55, 1.1, 0.12)), P(BOX(0.08, 0.16, 0.06), color, M(0.55, 1.1, -0.12)), P(BOX(0.5, 0.1, 0.12), color, M(-0.7, 0.8, 0, 0, 0, 0.5)),
    P(BOX(0.05, 0.05, 0.05), 0xff4020, M(0.78, 0.92, 0.1)), P(BOX(0.05, 0.05, 0.05), 0xff4020, M(0.78, 0.92, -0.1)),
  ];
  g.add(new THREE.Mesh(mergeColored(parts), lambert(0xffffff, { vc: true, flat: true })));
  const lg = limbGeo(0.12, 0.55, 0.12, color), lm = lambert(0xffffff, { vc: true, flat: true });
  const legs = [];
  for (const [x, z] of [[0.38, 0.14], [0.38, -0.14], [-0.38, 0.14], [-0.38, -0.14]]) { const l = new THREE.Group(); l.position.set(x, 0.55, z); l.add(new THREE.Mesh(lg, lm)); g.add(l); legs.push(l); }
  g.userData = { kind: 'quad', legs, top: 1.4 };
  return g;
}

function bogbeast() {
  const g = new THREE.Group();
  const parts = [
    P(SPH(1.1, 8, 6), 0x3d4a2c, M(0, 1.1, 0, 0, 0, 0, 1.2, 0.95, 1)), P(SPH(0.55, 7, 5), 0x4a5a34, M(1.0, 1.5, 0)), P(SPH(0.7, 6, 5), 0x2c3a24, M(-0.4, 1.7, 0.2)),
    P(BOX(0.1, 0.1, 0.1), 0xd8ff60, M(1.45, 1.65, 0.2)), P(BOX(0.1, 0.1, 0.1), 0xd8ff60, M(1.45, 1.65, -0.2)),
    P(CONE(0.12, 0.7, 5), 0x5a6a44, M(0.2, 2.2, 0.5, 0.3, 0, 0)), P(CONE(0.12, 0.7, 5), 0x5a6a44, M(-0.3, 2.3, -0.4, -0.3, 0, 0)), P(CONE(0.1, 0.6, 5), 0x5a6a44, M(0.6, 2.0, -0.2, -0.2, 0, 0)),
  ];
  g.add(new THREE.Mesh(mergeColored(parts), lambert(0xffffff, { vc: true, flat: true })));
  const al = limbGeo(0.3, 1.3, 0.3, 0x3d4a2c), lm = lambert(0xffffff, { vc: true, flat: true });
  const armL = new THREE.Group(), armR = new THREE.Group();
  armL.position.set(0.5, 1.5, 1.0); armR.position.set(0.5, 1.5, -1.0); armL.add(new THREE.Mesh(al, lm)); armR.add(new THREE.Mesh(al, lm));
  g.add(armL, armR);
  const legL = new THREE.Group(), legR = new THREE.Group();
  const ll = limbGeo(0.4, 0.8, 0.4, 0x2c3a24);
  legL.position.set(0, 0.8, 0.5); legR.position.set(0, 0.8, -0.5); legL.add(new THREE.Mesh(ll, lm)); legR.add(new THREE.Mesh(ll, lm)); g.add(legL, legR);
  g.userData = { kind: 'humanoid', legL, legR, armL, armR, top: 3.2 };
  return g;
}

function wraith() {
  const g = new THREE.Group();
  const cloak = new THREE.Mesh(CONE(0.7, 2.3, 8), new THREE.MeshLambertMaterial({ color: 0x4a5878, transparent: true, opacity: 0.72, emissive: 0x2a3a60, emissiveIntensity: 0.8, depthWrite: false }));
  cloak.position.y = 1.5; cloak.rotation.z = 0; cloak.scale.set(1, 1, 1);
  g.add(cloak);
  g.add(mesh(SPH(0.22, 7, 6), lambert(0x1a1e2c), 0, 2.45, 0));
  g.add(mesh(BOX(0.05, 0.06, 0.18), glowMat(0x9fd0ff), 0.2, 2.47, 0));
  const gl = new THREE.Sprite(glowSpriteMat(0x7fa0ff, 0.5)); gl.scale.set(2.4, 3.2, 1); gl.position.y = 1.7; g.add(gl);
  const arm = new THREE.Group(); arm.position.set(0.1, 2.0, 0); arm.add(mesh(CONE(0.1, 0.9, 5), lambert(0x4a5878), 0.5, 0, 0)); arm.children[0].rotation.z = -Math.PI / 2; g.add(arm);
  g.userData = { kind: 'wraith', cloak, armR: arm, top: 3 };
  return g;
}

// ---------------------------------------------------------------- the registry
const TEAM_ACCENT = 0xffffff;
const cache = new Map();

const BUILDERS = {
  // heroes
  // v0.4 hero backgrounds (human look, each with its own silhouette and colour)
  soldier: (a) => humanoid({ head: 'helm', skin: 0xc9a98a, cloth: 0x59606a, pants: 0x30343c, trim: 0x8a8f98, accent: a, weapon: 'shieldsword', cape: 0x7a1e22, scale: 1.25, bulk: 1.25, shoulder: 0x9aa0aa }),
  hunter: (a) => humanoid({ head: 'hood', skin: 0xc9a98a, cloth: 0x3f5a30, pants: 0x3a2e20, trim: 0x6a5a3a, accent: a, weapon: 'bow', cape: 0x2c4022, scale: 1.2, bulk: 0.9 }),
  mage: (a) => humanoid({ head: 'hood', skin: 0xd8c0a8, cloth: 0x3a4a9a, pants: 0x22285a, trim: 0xc8b878, accent: a, weapon: 'staff', cape: 0x2a3070, scale: 1.25, glow: 0x9fb4ff, height: 1.05 }),
  outlaw: (a) => humanoid({ head: 'mask', skin: 0xb59878, cloth: 0x4a3a2c, pants: 0x1e1a16, trim: 0xd9a441, accent: a, weapon: 'dagger', cape: 0x5a2c1a, scale: 1.15, bulk: 0.85 }),
  necro: (a) => humanoid({ head: 'hood', cloth: 0x1c2a2c, pants: 0x14201f, trim: 0x394a48, accent: a, weapon: 'staff', cape: 0x0f1c1d, scale: 1.25, skin: 0xbfc9b8, shoulder: 0x2a3a3a, glow: 0x4fe3c1 }),
  orc: (a) => humanoid({ head: 'orc', skin: 0x5f8a45, cloth: 0x4a3a2a, pants: 0x30281e, trim: 0x6b5a45, accent: a, weapon: 'axe', bulk: 1.5, scale: 1.3, shoulder: 0x7a7a80, cape: 0x6a2a1a }),
  bandit: (a) => humanoid({ head: 'mask', cloth: 0x3a3228, pants: 0x241e18, trim: 0x6a5a40, accent: a, weapon: 'dagger', cape: 0x2a3550, scale: 1.2, skin: 0xb59878 }),
  cult: (a) => humanoid({ head: 'hood', cloth: 0x7a1830, pants: 0x4a1020, trim: 0xd8b24a, accent: a, weapon: 'fire', cape: 0x5a1226, scale: 1.25, skin: 0xcdb8a0, shoulder: 0xd8b24a }),
  // servants
  lair: () => { const g = new THREE.Group(); g.userData.top = 5; return g; }, // invisible shell: the lair spire is drawn by raids_view.js
  skeleton: (a) => humanoid({ head: 'skull', cloth: 0x5a5a50, pants: 0xd8d2bc, trim: 0x403a30, accent: a, weapon: 'rustsword', skeleton: true, scale: 1.0 }),
  skelarcher: (a) => humanoid({ head: 'skull', cloth: 0x4a4a42, pants: 0xd8d2bc, trim: 0x403a30, accent: a, weapon: 'bow', skeleton: true, scale: 1.0 }),
  grunt: (a) => humanoid({ head: 'orc', skin: 0x6a924a, cloth: 0x553d2a, pants: 0x30281e, trim: 0x70604a, accent: a, weapon: 'axe', bulk: 1.35, scale: 1.1 }),
  berserker: (a) => humanoid({ head: 'orc', skin: 0x7a9a42, cloth: 0x6a2a1a, pants: 0x30281e, trim: 0x70604a, accent: a, weapon: 'club', bulk: 1.25, scale: 1.05, shoulder: 0x4a3a2a }),
  thug: (a) => humanoid({ head: 'mask', cloth: 0x4a3c2c, pants: 0x2a2218, trim: 0x6a5a40, accent: a, weapon: 'sword', scale: 1.0, skin: 0xb59878 }),
  crossbow: (a) => humanoid({ head: 'hood', cloth: 0x3a3a2c, pants: 0x2a2a20, trim: 0x6a5a40, accent: a, weapon: 'crossbow', scale: 1.0, skin: 0xb59878 }),
  zealot: (a) => humanoid({ head: 'hood', cloth: 0x8a2438, pants: 0x4a1424, trim: 0xd8b24a, accent: a, weapon: 'censer', scale: 1.0, skin: 0xcdb8a0 }),
  flagellant: (a) => humanoid({ head: 'mask', cloth: 0xb8a890, pants: 0x8a7a64, trim: 0xd8b24a, accent: a, weapon: 'keg', scale: 0.95, skin: 0xcdb8a0 }),
  // monsters
  ghoul: () => humanoid({ head: 'head', skin: 0x7d8a76, cloth: 0x4a5244, pants: 0x3a4236, trim: 0x2a3026, weapon: 'dagger', bulk: 0.9, height: 1.0, scale: 1.0, eyes: 0xd8ff60 }),
  wolf: () => wolf(0x5a5650),
  bogbeast: () => bogbeast(),
  wraith: () => wraith(),
  troll: () => humanoid({ head: 'orc', skin: 0x6e7660, cloth: 0x5a4a3a, pants: 0x4a3e30, trim: 0x403a30, weapon: 'club', bulk: 2.0, scale: 1.7, shoulder: 0x555a50 }),
  cryptknight: () => humanoid({ head: 'helm', cloth: 0x2c3036, pants: 0x20242a, trim: 0x4a525a, weapon: 'sword', skeleton: false, bulk: 1.3, scale: 1.35, cape: 0x151a22, shoulder: 0x4a525a, glow: 0x7fb0ff }),
  drownedking: () => humanoid({ head: 'crown', skin: 0x7a9a96, cloth: 0x203840, pants: 0x182c34, trim: 0x2a4a50, weapon: 'spear', bulk: 1.8, scale: 2.5, cape: 0x14262c, shoulder: 0x3a6a70, glow: 0x6fe8d0, eyes: 0x80ffe0 }),
};

export function makeUnitModel(model, accent = TEAM_ACCENT, look = 0) {
  const b = BUILDERS[model] || SERVANT_BUILDERS[model] || DEMON_BUILDERS[model] || BUILDERS.skeleton;
  const g = b(accent);
  return look ? applyLook(g, look, accent) : g;
}
export { lookOf };
// helpers for models_servants.js
export const MK = { humanoid, P, M, BOX, CYL, SPH, CONE, mesh, lambert, mergeColored, wolf, glowSpriteMat };

// ---------------------------------------------------------------- buildings & world objects
function stoneMat(c = 0x6b6e70) { return lambert(c, { flat: true }); }

function addGlow(g, x, y, z, color, size = 1.6, op = 0.8) {
  const s = new THREE.Sprite(glowSpriteMat(color, op)); s.scale.set(size, size, 1); s.position.set(x, y, z); s.userData.glow = true; g.add(s); return s;
}

const BLD = {
  forge(d, a) {
    const g = new THREE.Group();
    const parts = [
      P(BOX(4.2, 0.7, 4.2), 0x55585c, M(0, -0.1, 0)), P(BOX(3.6, 1.0, 3.2), 0x62666a, M(0, 0.6, 0.2)),
      P(BOX(1.5, 3.6, 1.5), 0x4a4d52, M(-1.0, 2.2, -0.9)), P(BOX(1.7, 0.3, 1.7), 0x3a3d42, M(-1.0, 4.1, -0.9)),
      P(BOX(0.8, 0.5, 1.4), 0x2c2e32, M(1.1, 1.35, 0.6)), P(BOX(0.4, 0.5, 0.5), 0x2c2e32, M(1.1, 1.0, 0.6)),
      P(BOX(0.2, 2.6, 0.2), 0x4a3828, M(1.9, 1.6, 1.8)), P(BOX(0.2, 2.6, 0.2), 0x4a3828, M(-1.9, 1.6, 1.8)),
      P(BOX(4.3, 0.2, 0.3), 0x5a4630, M(0, 2.9, 1.8)), P(BOX(1.4, 0.18, 0.9), a, M(1.0, 2.7, 1.85)),
    ];
    g.add(new THREE.Mesh(mergeColored(parts), lambert(0xffffff, { vc: true, flat: true })));
    g.add(mesh(SPH(0.4, 6, 5), lambert(0xff7a20, { emissive: 0xff5a10, ei: 1.6 }), -1.0, 1.35, -0.2));
    addGlow(g, -1.0, 1.5, -0.1, 0xff8030, 4.2, 0.85); addGlow(g, -1.0, 4.4, -0.9, 0xff9040, 2.2, 0.6);
    g.userData.top = 4.6; return g;
  },
  spikes(d, a) {
    const g = new THREE.Group();
    const parts = [P(BOX(2.0, 0.12, 2.0), 0x3a2e22, M(0, 0.04, 0))];
    for (let i = 0; i < 9; i++) parts.push(P(CONE(0.12, 0.9, 4), 0x9a9ea2, M(((i % 3) - 1) * 0.6, 0.5, (Math.floor(i / 3) - 1) * 0.6)));
    g.add(new THREE.Mesh(mergeColored(parts), lambert(0xffffff, { vc: true, flat: true })));
    g.userData.top = 1.2; return g;
  },
  snare(d, a) {
    const g = new THREE.Group();
    const parts = [];
    for (let i = 0; i < 6; i++) { const an = (i / 6) * Math.PI * 2; parts.push(P(CONE(0.1, 0.8, 4), 0x6a5238, M(Math.cos(an) * 0.9, 0.35, Math.sin(an) * 0.9, Math.sin(an) * 0.3, 0, -Math.cos(an) * 0.3))); }
    parts.push(P(geo('torusSn', () => new THREE.TorusGeometry(0.85, 0.07, 4, 12)), 0xb09a70, M(0, 0.25, 0, Math.PI / 2, 0, 0)));
    g.add(new THREE.Mesh(mergeColored(parts), lambert(0xffffff, { vc: true, flat: true })));
    g.userData.top = 1.0; return g;
  },
  firepit(d, a) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(mergeColored([P(geo('torusFp', () => new THREE.TorusGeometry(1.0, 0.3, 5, 10)), 0x5a5d60, M(0, 0.25, 0, Math.PI / 2, 0, 0)), P(CYL(0.85, 0.85, 0.1, 8), 0x2a2220, M(0, 0.12, 0))]), lambert(0xffffff, { vc: true, flat: true })));
    g.add(mesh(SPH(0.5, 6, 4), lambert(0xff6a20, { emissive: 0xff4a10, ei: 1.4 }), 0, 0.2, 0));
    addGlow(g, 0, 0.5, 0, 0xff7a30, 2.8, 0.7);
    g.userData.top = 1.2; return g;
  },
  alarm(d, a) {
    const g = new THREE.Group();
    const parts = [P(CYL(0.06, 0.08, 1.7, 5), 0x4a3828, M(0, 0.85, 0)), P(BOX(1.3, 0.07, 0.07), 0x4a3828, M(0, 1.6, 0))];
    for (const x of [-0.5, 0, 0.5]) { parts.push(P(CYL(0.012, 0.012, 0.45, 3), 0x888070, M(x, 1.35, 0))); parts.push(P(BOX(0.07, 0.4, 0.07), 0xd8d2bc, M(x, 1.0, 0, 0, 0, 0.1))); }
    parts.push(P(SPH(0.14, 5, 4), 0xe2dcc6, M(0, 1.85, 0)));
    g.add(new THREE.Mesh(mergeColored(parts), lambert(0xffffff, { vc: true, flat: true })));
    g.userData.top = 2.1; return g;
  },
  wall(d, a) {
    const g = new THREE.Group();
    const parts = [P(BOX(d.w, 3.6, d.d), 0x6a6d70, M(0, 0.3, 0))];
    for (let i = 0; i < 4; i++) parts.push(P(BOX(0.7, 0.5, d.d + 0.1), 0x74777a, M(-d.w / 2 + 0.55 + i * 1.0, 2.35, 0)));
    for (let i = 0; i < 6; i++) parts.push(P(BOX(0.5 + (i % 2) * 0.3, 0.3, d.d + 0.04), 0x585b5e, M(-d.w / 2 + 0.4 + i * 0.7, 0.6 + (i % 3) * 0.5, 0)));
    g.add(new THREE.Mesh(mergeColored(parts), lambert(0xffffff, { vc: true, flat: true })));
    g.userData.top = 2.6; return g;
  },
  gate(d, a) {
    const g = new THREE.Group();
    const parts = [
      P(BOX(0.9, 4.0, d.d + 0.4), 0x626568, M(-d.w / 2 + 0.45, 0.5, 0)), P(BOX(0.9, 4.0, d.d + 0.4), 0x626568, M(d.w / 2 - 0.45, 0.5, 0)),
      P(BOX(d.w, 0.8, d.d + 0.2), 0x6e7174, M(0, 2.4, 0)), P(BOX(d.w - 1.6, 1.8, 0.25), 0x4a3a2a, M(0, 0.9, 0)),
      P(BOX(0.4, 0.2, 0.4), a, M(-d.w / 2 + 0.45, 2.7, 0)), P(BOX(0.4, 0.2, 0.4), a, M(d.w / 2 - 0.45, 2.7, 0)),
    ];
    for (let i = 0; i < 5; i++) parts.push(P(BOX(0.1, 1.7, 0.3), 0x2a2a2e, M(-1.2 + i * 0.6, 0.9, 0)));
    g.add(new THREE.Mesh(mergeColored(parts), lambert(0xffffff, { vc: true, flat: true })));
    addGlow(g, -d.w / 2 + 0.45, 3.1, 0.5, 0xffa040, 1.4, 0.7); addGlow(g, d.w / 2 - 0.45, 3.1, 0.5, 0xffa040, 1.4, 0.7);
    g.userData.top = 3.4; return g;
  },
  tower(d, a) {
    const g = new THREE.Group();
    const parts = [P(CYL(1.35, 1.6, 6.5, 8), 0x6d7073, M(0, 2.0, 0)), P(CYL(1.8, 1.55, 0.9, 8), 0x7a7d80, M(0, 5.6, 0)), P(CYL(1.65, 1.65, 0.1, 8), a, M(0, 5.2, 0))];
    for (let i = 0; i < 8; i++) { const an = (i / 8) * Math.PI * 2; parts.push(P(BOX(0.55, 0.6, 0.55), 0x7a7d80, M(Math.cos(an) * 1.6, 6.3, Math.sin(an) * 1.6))); }
    parts.push(P(CONE(0.15, 0.5, 4), 0x3a3a3e, M(0, 6.2, 0)));
    g.add(new THREE.Mesh(mergeColored(parts), lambert(0xffffff, { vc: true, flat: true })));
    addGlow(g, 0, 6.5, 0, 0xffa040, 2.4, 0.85);
    g.userData.top = 7; return g;
  },
  ballista(d, a) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(mergeColored([P(CYL(1.6, 1.8, 1.2, 8), 0x62666a, M(0, 0.1, 0)), P(CYL(1.2, 1.4, 1.6, 8), 0x6d7073, M(0, 1.5, 0)), P(CYL(1.3, 1.3, 0.1, 8), a, M(0, 2.35, 0))]), lambert(0xffffff, { vc: true, flat: true })));
    const arm = new THREE.Group(); arm.position.y = 2.7;
    arm.add(mesh(BOX(2.6, 0.18, 0.28), lambert(0x4a3a2a), 0.4, 0, 0));
    arm.add(mesh(BOX(0.25, 0.25, 3.2), lambert(0x5a4630), 0.5, 0, 0));
    arm.add(mesh(CONE(0.1, 0.9, 5), lambert(0xc4c8cc), 1.9, 0, 0)); arm.children[2].rotation.z = -Math.PI / 2;
    g.add(arm); g.userData.turret = arm; g.userData.top = 4; return g;
  },
  watch(d, a) {
    const g = new THREE.Group();
    const parts = [];
    for (const [x, z] of [[-0.7, -0.7], [0.7, -0.7], [0.7, 0.7], [-0.7, 0.7]]) parts.push(P(CYL(0.11, 0.14, 7, 5), 0x4a3828, M(x * 0.8, 2.5, z * 0.8)));
    parts.push(P(BOX(2.2, 0.2, 2.2), 0x5a4630, M(0, 5.8, 0)));
    parts.push(P(BOX(1.8, 0.7, 0.1), 0x5a4630, M(0, 6.3, 0.95))); parts.push(P(BOX(1.8, 0.7, 0.1), 0x5a4630, M(0, 6.3, -0.95)));
    parts.push(P(BOX(0.4, 0.14, 0.4), a, M(0, 6.15, 0)));
    g.add(new THREE.Mesh(mergeColored(parts), lambert(0xffffff, { vc: true, flat: true })));
    g.add(mesh(SPH(0.28, 6, 5), lambert(0xffb040, { emissive: 0xff8020, ei: 1.5 }), 0, 6.55, 0));
    addGlow(g, 0, 6.6, 0, 0xffa040, 3.2, 0.9);
    g.userData.top = 7.5; return g;
  },
  banner(d, a) {
    const g = new THREE.Group();
    g.add(mesh(CYL(0.07, 0.09, 6.2, 6), lambert(0x3a2c20), 0, 2.6, 0));
    const cloth = mesh(BOX(0.05, 2.0, 1.3), lambert(a, { emissive: a, ei: 0.35 }), 0, 4.9, 0.7);
    g.add(cloth); g.userData.cloth = cloth;
    g.add(mesh(CONE(0.16, 0.5, 5), lambert(0xc8b060), 0, 5.9, 0));
    g.add(mesh(CYL(0.6, 0.8, 0.6, 7), stoneMat(), 0, -0.1, 0));
    g.userData.top = 6.5; return g;
  },
  waypoint(d, a) { // rune circle: stone disc, four standing stones, glowing ring + floating shard
    const g = new THREE.Group();
    const parts = [P(CYL(1.45, 1.6, 0.3, 10), 0x55595d, M(0, 0.1, 0)), P(CYL(1.1, 1.15, 0.12, 10), 0x3c4046, M(0, 0.3, 0))];
    for (let i = 0; i < 4; i++) {
      const an = i * Math.PI / 2 + Math.PI / 4, x = Math.cos(an) * 1.25, z = Math.sin(an) * 1.25;
      parts.push(P(BOX(0.32, 1.5 + (i % 2) * 0.35, 0.32), 0x6d7075, M(x, 1.0 + (i % 2) * 0.17, z, 0, -an, 0.06 * (i % 2 ? 1 : -1))));
      parts.push(P(BOX(0.38, 0.1, 0.38), a, M(x, 1.8 + (i % 2) * 0.35, z, 0, -an, 0)));
    }
    g.add(new THREE.Mesh(mergeColored(parts), lambert(0xffffff, { vc: true, flat: true })));
    const ring = mesh(geo('wpring', () => new THREE.RingGeometry(0.62, 0.82, 32)), glowMat(a, 0.85).clone(), 0, 0.4, 0);
    ring.rotation.x = -Math.PI / 2; g.add(ring); g.userData.ring = ring;
    const ring2 = mesh(geo('wpring2', () => new THREE.RingGeometry(0.2, 0.3, 24)), glowMat(0xffffff, 0.55), 0, 0.41, 0);
    ring2.rotation.x = -Math.PI / 2; g.add(ring2);
    const shard = mesh(geo('oct1', () => new THREE.OctahedronGeometry(1.0)), lambert(a, { emissive: a, ei: 1.5, flat: true }), 0, 1.5, 0);
    shard.scale.set(0.22, 0.38, 0.22); g.add(shard); g.userData.crystal = shard; g.userData.bob = true;
    addGlow(g, 0, 1.2, 0, a, 3.4, 0.7);
    g.userData.top = 2.4; return g;
  },
  heart(d, a) {
    const g = new THREE.Group();
    const parts = [P(BOX(7.4, 1.6, 7.4), 0x55585c, M(0, -0.2, 0)), P(BOX(5.6, 1.4, 5.6), 0x62656a, M(0, 1.1, 0)), P(BOX(3.8, 1.2, 3.8), 0x6d7075, M(0, 2.3, 0)), P(BOX(2.6, 0.2, 2.6), 0x3c3f44, M(0, 3.0, 0)), P(BOX(0.18, 0.18, 6.0), a, M(3.2, 0.55, 0)), P(BOX(0.18, 0.18, 6.0), a, M(-3.2, 0.55, 0)), P(BOX(6.0, 0.18, 0.18), a, M(0, 0.55, 3.2)), P(BOX(6.0, 0.18, 0.18), a, M(0, 0.55, -3.2)), P(BOX(0.9, 0.9, 0.9), 0x55585c, M(0, 3.45, 0, 0, 0.4, 0))];
    for (const [x, z] of [[-3.3, -3.3], [3.3, -3.3], [3.3, 3.3], [-3.3, 3.3]]) { parts.push(P(CYL(0.35, 0.45, 3.4, 6), 0x4a4d52, M(x, 1.7, z))); parts.push(P(BOX(0.9, 0.3, 0.9), a, M(x, 3.3, z))); }
    g.add(new THREE.Mesh(mergeColored(parts), lambert(0xffffff, { vc: true, flat: true })));
    const crystal = mesh(geo('oct1', () => new THREE.OctahedronGeometry(1.0)), lambert(a, { emissive: a, ei: 1.4, flat: true }), 0, 4.7, 0);
    crystal.scale.set(0.9, 1.5, 0.9); g.add(crystal); g.userData.crystal = crystal;
    addGlow(g, 0, 4.7, 0, a, 8, 0.7);
    for (const [x, z] of [[-3.3, -3.3], [3.3, -3.3], [3.3, 3.3], [-3.3, 3.3]]) addGlow(g, x, 3.7, z, 0xffa040, 2.6, 0.9);
    g.userData.top = 7; return g;
  },
};

// research-gated towers: the stone tower with a burning brazier / a frost crystal on top
BLD.brazier = (d, a) => {
  const g = BLD.tower(d, a);
  g.add(mesh(CYL(0.7, 0.45, 0.5, 8), lambert(0x3a2c22), 0, 7.2, 0));
  g.add(mesh(SPH(0.55, 7, 6), lambert(0xff7a20, { emissive: 0xff5a10, ei: 1.6 }), 0, 7.7, 0));
  addGlow(g, 0, 7.8, 0, 0xff7a20, 4.2, 0.95);
  g.userData.top = 8.4; return g;
};
BLD.frostspire = (d, a) => {
  const g = BLD.tower(d, a);
  const oct = geo('oct1', () => new THREE.OctahedronGeometry(1.0));
  const c = mesh(oct, lambert(0x8fd8ff, { emissive: 0x5fb0ff, ei: 1.5, flat: true }), 0, 8.0, 0); c.scale.set(0.55, 1.2, 0.55); g.add(c);
  addGlow(g, 0, 8.0, 0, 0x7fd0ff, 4.0, 0.9);
  g.userData.top = 9; return g;
};

export function makeBuildingModel(type, def, accent) {
  if (def.model === 'hidden') { const g = new THREE.Group(); g.userData.top = 1; return g; } // sim-only structure (the town view draws the walls)
  const dark = def.model === 'darkwall' || def.model === 'darktower'; // the invaders' fortress: the same shapes in dark, reddish stone
  const fn = BLD[dark ? def.model.slice(4) : def.model] || BLD.wall;
  const g = fn(def, accent);
  if (dark) g.traverse((o) => { if (o.isMesh && o.material && o.material.color) { o.material = o.material.clone(); o.material.color.multiply(new THREE.Color(0x8a6a66)); } });
  return g;
}

export function makeNodeModel(type, accent = 0x888888) {
  const g = new THREE.Group();
  if (type === 'mine') {
    const parts = [];
    for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; parts.push(P(SPH(1.6 + (i % 3) * 0.3, 6, 5), 0x5a5a5e, M(Math.cos(a) * 3, 0.8, Math.sin(a) * 3, 0, 0, 0, 1, 0.8, 1))); }
    parts.push(P(BOX(1.4, 2.2, 0.3), 0x2a241c, M(0, 1.0, -2.6))); parts.push(P(BOX(0.25, 2.6, 0.35), 0x5a4630, M(-0.85, 1.2, -2.7))); parts.push(P(BOX(0.25, 2.6, 0.35), 0x5a4630, M(0.85, 1.2, -2.7))); parts.push(P(BOX(2.2, 0.25, 0.35), 0x5a4630, M(0, 2.5, -2.7)));
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.3; parts.push(P(geo('oct06', () => new THREE.OctahedronGeometry(0.4)), 0xe8c040, M(Math.cos(a) * 1.6, 0.3, Math.sin(a) * 1.6 + 0.6))); }
    g.add(new THREE.Mesh(mergeColored(parts), lambert(0xffffff, { vc: true, flat: true })));
    addGlow(g, 0, 1.2, 1.0, 0xffd860, 5, 0.6);
  } else if (type === 'obelisk') {
    g.add(mesh(CYL(2.6, 3.0, 0.5, 8), stoneMat(0x5a5d60), 0, 0.1, 0));
    const ob = mesh(CYL(0.4, 0.9, 6, 4), stoneMat(0x6a6e72), 0, 3.3, 0); ob.rotation.y = Math.PI / 4; g.add(ob);
    g.add(mesh(CONE(0.42, 0.9, 4), stoneMat(0x7a7e82), 0, 6.7, 0));
    const orb = mesh(SPH(0.35, 7, 6), lambert(0x88ccff, { emissive: 0x66aaff, ei: 1.5 }), 0, 7.6, 0); orb.userData.orb = true; g.add(orb); g.userData.orb = orb;
    addGlow(g, 0, 7.6, 0, 0x88ccff, 4, 0.8);
  }
  // ownership ring (recoloured at runtime)
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.93, 1.0, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.25; g.add(ring); g.userData.ring = ring;
  return g;
}

export function makeChestModel() {
  const g = new THREE.Group();
  g.add(mesh(BOX(1.1, 0.6, 0.7), lambert(0x6a4a2a, { flat: true }), 0, 0.3, 0));
  const lid = mesh(CYL(0.35, 0.35, 1.1, 8, 1), lambert(0x7a5a34, { flat: true }), 0, 0.62, 0); lid.rotation.x = Math.PI / 2; lid.rotation.z = 0; g.add(lid);
  g.add(mesh(BOX(1.14, 0.12, 0.74), lambert(0xc8a040), 0, 0.45, 0));
  g.add(mesh(BOX(0.14, 0.2, 0.08), lambert(0xe8c860, { emissive: 0xa08020 }), 0.0, 0.5, 0.38));
  addGlow(g, 0, 0.8, 0, 0xffd860, 3.2, 0.55);
  return g;
}

export function makeShrineModel(kind) {
  const col = kind === 'heal' ? 0x70ff90 : kind === 'might' ? 0xff6040 : 0x60c0ff;
  const g = new THREE.Group();
  g.add(mesh(CYL(1.4, 1.6, 0.4, 8), stoneMat(0x5a5d60), 0, 0.2, 0));
  g.add(mesh(CYL(0.25, 0.35, 1.8, 6), stoneMat(0x6a6e72), 0, 1.2, 0));
  const orb = mesh(geo('oct3', () => new THREE.OctahedronGeometry(0.45)), lambert(col, { emissive: col, ei: 1.5, flat: true }), 0, 2.5, 0); g.add(orb); g.userData.orb = orb;
  addGlow(g, 0, 2.5, 0, col, 4, 0.7);
  g.userData.color = col;
  return g;
}

export function makeItemModel(slot, tier) {
  const cols = [0xd0d0d0, 0x5a9bff, 0xf2c84a, 0xf2c84a, 0xf2c84a]; // v0.5: item tier 0..2 = white / blue / gold
  const g = new THREE.Group();
  if (slot === 'weapon') {
    g.add(mesh(BOX(0.12, 1.0, 0.04), lambert(cols[tier], { emissive: cols[tier], ei: 0.5 }), 0, 0.5, 0)); g.children[0].rotation.z = 0.9;
    g.add(mesh(BOX(0.4, 0.07, 0.07), lambert(0x6a4a2a), 0.12, 0.2, 0)); g.children[1].rotation.z = 0.9;
  } else {
    g.add(mesh(BOX(0.6, 0.55, 0.3), lambert(cols[tier], { emissive: cols[tier], ei: 0.5, flat: true }), 0, 0.4, 0));
  }
  addGlow(g, 0, 0.6, 0, cols[tier], 2.4, 0.9);
  g.rotation.y = 0; g.userData.item = true;
  return g;
}

export function makeKegModel() {
  const g = new THREE.Group();
  g.add(mesh(CYL(0.45, 0.45, 0.8, 8), lambert(0x6a4a2a), 0, 0.4, 0));
  g.add(mesh(CYL(0.47, 0.47, 0.08, 8), lambert(0x333333), 0, 0.25, 0)); g.add(mesh(CYL(0.47, 0.47, 0.08, 8), lambert(0x333333), 0, 0.6, 0));
  addGlow(g, 0, 0.95, 0, 0xffb040, 1.2, 1.0);
  return g;
}

// props for instancing: returns { geometry } with baked vertex colours
export const PROP_GEOS = {
  grass: () => mergeColored([
    P(CONE(0.09, 0.8, 3), 0x6a7a44, M(0, 0.4, 0, 0, 0, 0.15)), P(CONE(0.08, 0.65, 3), 0x7a8a50, M(0.12, 0.32, 0.05, 0.1, 0, -0.2)),
    P(CONE(0.08, 0.7, 3), 0x5a6a3a, M(-0.1, 0.35, -0.08, -0.15, 0, 0.1)), P(CONE(0.07, 0.55, 3), 0x84944f, M(0.02, 0.28, 0.14, 0.2, 0, 0.05)),
    P(CONE(0.07, 0.6, 3), 0x6c7c46, M(-0.06, 0.3, 0.1, 0.25, 0, -0.1)),
  ]),
  flower: () => mergeColored([
    P(CYL(0.02, 0.02, 0.6, 3), 0x4a6a3a, M(0, 0.3, 0)), P(SPH(0.09, 5, 4), 0xe8d870, M(0, 0.62, 0)),
    P(CYL(0.02, 0.02, 0.5, 3), 0x4a6a3a, M(0.18, 0.25, 0.1)), P(SPH(0.08, 5, 4), 0xf0f0e8, M(0.18, 0.52, 0.1)),
    P(CYL(0.02, 0.02, 0.55, 3), 0x4a6a3a, M(-0.14, 0.27, -0.1)), P(SPH(0.08, 5, 4), 0xb890e0, M(-0.14, 0.57, -0.1)),
    P(CONE(0.08, 0.5, 3), 0x5a7a40, M(0.05, 0.25, -0.16, 0.2, 0, 0.1)),
  ]),
  fern: () => mergeColored(Array.from({ length: 6 }, (_, i) => {
    const a = (i / 6) * Math.PI * 2;
    return P(CONE(0.11, 1.0, 3), i % 2 ? 0x4c7442 : 0x3e6638, M(Math.cos(a) * 0.3, 0.36, Math.sin(a) * 0.3, Math.sin(a) * 0.95, 0, -Math.cos(a) * 0.95));
  })),
  bush: () => mergeColored([
    P(SPH(0.62, 6, 5), 0x3a5232, M(0, 0.42, 0, 0, 0, 0, 1.2, 0.8, 1.1)), P(SPH(0.45, 6, 5), 0x46623a, M(0.5, 0.35, 0.2)), P(SPH(0.4, 6, 5), 0x344a2c, M(-0.45, 0.3, -0.2)),
    P(SPH(0.07, 4, 3), 0xc84a4a, M(0.3, 0.7, 0.3)), P(SPH(0.07, 4, 3), 0xc84a4a, M(-0.2, 0.62, 0.35)),
  ]),
  mushroom: () => mergeColored([
    P(CYL(0.07, 0.09, 0.4, 5), 0xd8d0b8, M(0, 0.2, 0)), P(SPH(0.24, 6, 4), 0xc04a3a, M(0, 0.42, 0, 0, 0, 0, 1, 0.6, 1)),
    P(CYL(0.05, 0.07, 0.28, 5), 0xd8d0b8, M(0.34, 0.14, 0.12)), P(SPH(0.17, 6, 4), 0xd8c070, M(0.34, 0.3, 0.12, 0, 0, 0, 1, 0.6, 1)),
    P(CYL(0.04, 0.06, 0.2, 5), 0xd8d0b8, M(-0.22, 0.1, -0.2)), P(SPH(0.12, 6, 4), 0x9a6ac0, M(-0.22, 0.22, -0.2, 0, 0, 0, 1, 0.6, 1)),
  ]),
  log: () => mergeColored([
    P(CYL(0.28, 0.32, 3.0, 6), 0x4a3826, M(0, 0.3, 0, 0, 0, Math.PI / 2)), P(CYL(0.1, 0.1, 0.9, 4), 0x3a2c1e, M(0.4, 0.75, 0, 0, 0, 0.7)),
    P(CYL(0.2, 0.2, 0.05, 6), 0x7a6444, M(1.5, 0.3, 0, 0, 0, Math.PI / 2)),
  ]),
  crag: () => mergeColored([
    P(CYL(0.5, 1.5, 6.5, 5), 0x5a5855, M(0, 3.1, 0, 0.06, 0.3, 0.05)), P(CYL(0.3, 1.0, 4.2, 5), 0x66645f, M(1.3, 2.0, 0.6, -0.1, 0.9, -0.08)),
    P(CYL(0.25, 0.9, 3.0, 5), 0x4e4c4a, M(-1.1, 1.4, -0.5, 0.12, 0.2, 0.15)), P(geo('ico1', () => new THREE.IcosahedronGeometry(1, 0)), 0x5f5d5a, M(0.4, 0.4, 1.4, 0.3, 0.6, 0.1, 1.2, 0.8, 1)),
  ]),
  rubble: () => mergeColored([
    P(BOX(0.7, 0.4, 0.5), 0x66696c, M(0, 0.2, 0, 0.1, 0.5, 0.2)), P(BOX(0.4, 0.3, 0.4), 0x5a5d60, M(0.6, 0.15, 0.3, 0.3, 0.2, 0)),
    P(BOX(0.5, 0.25, 0.3), 0x70737a, M(-0.4, 0.12, -0.4, 0, 1.0, 0.3)), P(BOX(0.25, 0.5, 0.25), 0x62656a, M(-0.1, 0.25, 0.5, 0.2, 0.3, 0.4)),
  ]),
  deadtree: () => mergeColored([
    P(CYL(0.12, 0.28, 3.2, 5), 0x3a3029, M(0, 1.6, 0)), P(CYL(0.05, 0.1, 1.6, 4), 0x3a3029, M(0.5, 2.5, 0, 0, 0, -0.9)), P(CYL(0.04, 0.09, 1.4, 4), 0x3a3029, M(-0.4, 2.8, 0.2, 0.3, 0, 0.8)),
    P(CYL(0.04, 0.08, 1.2, 4), 0x3a3029, M(0.1, 3.3, -0.4, -0.7, 0, 0.2)), P(CYL(0.03, 0.06, 0.9, 4), 0x3a3029, M(0.9, 3.0, 0, 0, 0, -1.2)),
  ]),
  pine: () => mergeColored([
    P(CYL(0.14, 0.2, 1.4, 5), 0x3a2c22, M(0, 0.7, 0)), P(CONE(1.5, 2.2, 7), 0x233b2d, M(0, 2.0, 0)), P(CONE(1.2, 2.0, 7), 0x2a4533, M(0, 3.2, 0)), P(CONE(0.8, 1.8, 7), 0x31503a, M(0, 4.3, 0)),
  ]),
  rock: () => mergeColored([P(geo('ico1', () => new THREE.IcosahedronGeometry(1, 0)), 0x5f6061, M(0, 0.35, 0, 0.3, 0.6, 0.1, 1.2, 0.8, 1.0)), P(geo('ico1', () => new THREE.IcosahedronGeometry(1, 0)), 0x6c6d6e, M(0.8, 0.15, 0.4, 0.8, 0.1, 0.4, 0.55, 0.45, 0.5))]),
  grave: () => mergeColored([P(BOX(0.7, 1.1, 0.18), 0x6a6d64, M(0, 0.5, 0, 0, 0, 0.06)), P(CYL(0.35, 0.35, 0.18, 8), 0x6a6d64, M(0, 1.05, 0, Math.PI / 2, 0, 0.06)), P(BOX(0.9, 0.12, 1.5), 0x44473f, M(0.0, 0.05, 0.9))]),
  pillar: () => mergeColored([P(BOX(1.5, 0.5, 1.5), 0x62666a, M(0, 0.2, 0)), P(CYL(0.55, 0.65, 3.4, 8), 0x72767a, M(0, 2.1, 0)), P(BOX(1.2, 0.3, 1.2), 0x686c70, M(0, 3.9, 0, 0, 0.3, 0.1)), P(BOX(0.7, 0.9, 0.7), 0x5a5e62, M(1.4, 0.4, 0.6, 0.2, 0.4, 0.5))]),
  bones: () => mergeColored([P(BOX(0.9, 0.08, 0.1), 0xcfc9b0, M(0, 0.1, 0, 0, 0.5, 0)), P(BOX(0.7, 0.08, 0.1), 0xcfc9b0, M(0.2, 0.12, 0.2, 0, -0.7, 0)), P(SPH(0.2, 6, 5), 0xd8d2bc, M(-0.3, 0.2, -0.2)), P(BOX(0.5, 0.07, 0.09), 0xcfc9b0, M(0.1, 0.1, -0.35, 0, 1.2, 0))]),
  reed: () => mergeColored([P(CONE(0.07, 1.8, 3), 0x5b6a3a, M(0, 0.9, 0, 0, 0, 0.12)), P(CONE(0.07, 1.5, 3), 0x66763f, M(0.18, 0.75, 0.1, 0.1, 0, -0.15)), P(CONE(0.07, 2.1, 3), 0x4e5c32, M(-0.15, 1.0, -0.1, -0.1, 0, 0.08)), P(CYL(0.05, 0.05, 0.5, 4), 0x4a3a2a, M(0.1, 1.9, 0.0))]),
  stump: () => mergeColored([P(CYL(0.4, 0.55, 0.9, 7), 0x4a3828, M(0, 0.4, 0)), P(CYL(0.3, 0.3, 0.05, 7), 0x6a5a40, M(0, 0.87, 0))]),
};
