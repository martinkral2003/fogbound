// v4 scene module "towns_view" (TOWNS lane): procedural villages, towns and the capital. createView(ctx) -> { frame(st, alpha, dt), handleEvents(events), dispose() }.
// Static geometry (houses, walls, stalls, citadel, roads) is merged into one vertex-coloured mesh per town (built lazily when the focus comes near, rebuilt when the town falls
// or is retaken); lights, smoke, fire and NPCs are dynamic. Layout comes from towns.js layoutOf(), shared with the sim. No model assets: Three primitives like models.js.
import { lambert, glowSpriteMat, mergeColored, softTexture, MK } from './models.js';
import { TOWN } from './data.js';
import { layoutOf } from './towns.js';
import { isNight } from './sim.js';

const TAU = Math.PI * 2;
const SHOW = 330;       // towns closer than this to the focus are drawn
const NPC_SHOW = 110;   // NPCs closer than this are drawn
const FX_NEAR = 170;    // smoke / fire / lamp glows only this close
const WOOD = [0x8a7050, 0x6e5a40, 0x9a8a68, 0x7a6850, 0x5e4a38];
const ROOF = [0x5a3a2a, 0x4a4038, 0x6a3a30, 0x3e4a3c, 0x5a4a30];
const STONE = [0x8a8780, 0x7d7a74, 0x908c84, 0x6f6d68];
const BANNER = 0x3a5aa8;

export function createView(ctx) {
  const { THREE, scene, st, world } = ctx;
  if (!st.towns || !st.towns.length) return null;
  const H = (x, z) => world.heightAt(x, z);
  const root = new THREE.Group(); root.name = 'towns'; scene.add(root);
  const solid = lambert(0xffffff, { vc: true, flat: true });
  const winMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const G = { box: new THREE.BoxGeometry(1, 1, 1), cyl: new THREE.CylinderGeometry(1, 1, 1, 8), cyl6: new THREE.CylinderGeometry(1, 1, 1, 6), cone: new THREE.ConeGeometry(1, 1, 6), pyr: new THREE.ConeGeometry(1, 1, 4), sph: new THREE.SphereGeometry(1, 7, 5) };
  G.pyr.rotateY(Math.PI / 4);
  const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const Q = new THREE.Quaternion(), E = new THREE.Euler(), M4 = new THREE.Matrix4(), S3 = new THREE.Vector3(), P3 = new THREE.Vector3();
  const rnd = (seed) => { let a = seed | 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

  // ------------------------------------------------------------ part builder (local frame: +x faces the front, origin on the ground)
  function Builder() {
    const main = [], win = [];
    let par = new THREE.Matrix4();
    const frame = (x, y, z, theta) => { par = new THREE.Matrix4().compose(P3.set(x, y, z), Q.setFromEuler(E.set(0, -theta, 0)), S3.set(1, 1, 1)); };
    const put = (list, geo, color, lx, ly, lz, sx, sy, sz, rx = 0, ry = 0, rz = 0) => {
      const loc = new THREE.Matrix4().compose(P3.set(lx, ly, lz), Q.setFromEuler(E.set(rx, ry, rz)), S3.set(sx, sy, sz));
      list.push({ geo, color, m: par.clone().multiply(loc) });
    };
    const api = {
      frame,
      box: (c, x, y, z, w, h, d, ry = 0, rz = 0, rx = 0) => put(main, G.box, c, x, y + h / 2, z, w, h, d, rx, ry, rz),
      cyl: (c, x, y, z, r, h, sides = 8) => put(main, sides === 6 ? G.cyl6 : G.cyl, c, x, y + h / 2, z, r, h, r),
      cone: (c, x, y, z, r, h) => put(main, G.cone, c, x, y + h / 2, z, r, h, r),
      pyr: (c, x, y, z, rx, h, rz) => put(main, G.pyr, c, x, y + h / 2, z, rx, h, rz),
      sph: (c, x, y, z, r, sy = 1) => put(main, G.sph, c, x, y + r * sy, z, r, r * sy, r),
      wbox: (c, x, y, z, w, h, d) => put(win, G.box, c, x, y + h / 2, z, w, h, d),
      tri: (geo, color) => main.push({ geo, color, m: new THREE.Matrix4() }),
    };
    api.api = api; api.main = main; api.win = win;
    return api;
  }

  // ------------------------------------------------------------ building models
  function house(b, h, burnt, ri) {
    const { box, pyr, cyl, wbox } = b, c = WOOD[h.c % 5], rc = ROOF[(h.c + ri) % 5];
    const hw = h.w, hd = h.d, y0 = H(h.x, h.z);
    b.frame(h.x, y0 - 1.1, h.z, h.rot);
    const collapsed = burnt && (h.c % 2 === 0);
    const wallC = burnt ? 0x2c2622 : c, hh = collapsed ? h.h * 0.55 : h.h;
    box(burnt ? 0x3a3632 : STONE[h.c % 4], 0, 0, 0, hd + 0.4, 1.4, hw + 0.4);                    // stone footing
    box(wallC, 0, 1.4, 0, hd, hh, hw);                                                            // walls
    if (!burnt) for (const s of [-1, 1]) box(0x4a3a2a, 0, 1.4, s * (hw / 2 + 0.03), hd + 0.1, 0.12, 0.08); // timber beam
    if (!burnt || !collapsed) pyr(burnt ? 0x1c1816 : rc, 0, 1.4 + hh, 0, hd * 0.62 + 0.5, burnt ? 1.0 : 1.5 + h.h * 0.22, hw * 0.62 + 0.5);
    box(burnt ? 0x1a1512 : 0x3a2a1a, hd / 2 + 0.04, 1.4, 0, 0.1, 1.55, 0.9);                      // door
    if (!burnt) {
      for (const s of [-0.28, 0.28]) wbox(0xffc060, hd / 2 + 0.05, 2.35, s * hw, 0.08, 0.55, 0.45);
      wbox(0xffb050, 0.0, 2.3, hw / 2 + 0.05, 0.5, 0.5, 0.08);
      if (h.c < 3) { cyl(0x6a6660, -hd * 0.22, 1.4 + hh - 0.4, hw * 0.2, 0.28, 2.0 + h.h * 0.2); }
    } else if (!collapsed) cyl(0x2a2622, -hd * 0.22, 1.4 + hh - 0.4, hw * 0.2, 0.28, 1.4);
    // per kind
    if (h.kind === 'inn') {
      box(c, 0, 1.4 + hh, 0, hd * 0.55, 1.2, hw * 0.55);
      box(0x3a2a1a, hd / 2 + 0.9, 3.6, hw * 0.46, 0.06, 0.08, 1.4);                                // sign arm
      box(burnt ? 0x2a2220 : 0xb89a50, hd / 2 + 1.6, 3.0, hw * 0.46, 0.08, 0.6, 0.9);
      if (!burnt) wbox(0xffd070, hd / 2 + 1.0, 2.4, hw * 0.46, 0.2, 0.3, 0.3);
    } else if (h.kind === 'smithy') {
      cyl(burnt ? 0x2a2622 : 0x5a5650, hd * 0.2, 1.4, -hw * 0.3, 0.6, 5.2);
      box(0x3a3836, hd / 2 + 1.2, 0, hw * 0.1, 0.8, 0.8, 0.7);                                    // anvil
      if (!burnt) wbox(0xff7a30, hd / 2 + 0.06, 1.7, -hw * 0.28, 0.08, 0.7, 0.8);                 // forge glow
    } else if (h.kind === 'chapel') {
      box(burnt ? 0x3a3632 : 0xa09c92, -hd * 0.3, 1.4, 0, hd * 0.4, hh + 4.2, hw * 0.4);
      pyr(burnt ? 0x1c1816 : 0x4a4038, -hd * 0.3, 1.4 + hh + 4.2, 0, hd * 0.3, 3.2, hw * 0.3);
      if (!burnt) { box(0xd8c060, -hd * 0.3, 1.4 + hh + 7.4, 0, 0.12, 1.2, 0.12); box(0xd8c060, -hd * 0.3, 1.4 + hh + 8.2, 0, 0.12, 0.12, 0.7); wbox(0xffd890, hd * 0.0, 2.6, 0, 0.1, 1.1, 0.5); }
    } else if (h.kind === 'tower') {
      cyl(burnt ? 0x3a3632 : STONE[h.c % 4], 0, 1.0, 0, 2.3, 9, 8);
      cyl(burnt ? 0x2a2622 : 0x6a6660, 0, 10.0, 0, 2.7, 0.7, 8);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; box(burnt ? 0x2a2622 : 0x6a6660, Math.cos(a) * 2.5, 10.7, Math.sin(a) * 2.5, 0.8, 0.7, 0.8); }
      if (!burnt) { cyl(0x3a2a1a, 0, 10.7, 0, 0.9, 0.4); wbox(0xffa040, 0, 9.0, 2.34, 0.4, 0.7, 0.08); }
    }
  }
  function stall(b, s, burnt) {
    const { box, cyl, wbox, sph } = b, y0 = H(s.x, s.z);
    b.frame(s.x, y0, s.z, s.rot + Math.PI); // front of the stall (counter) faces the plaza
    const awn = { merchant: [0xb04030, 0xe8dcc0], board: [0x4a4038, 0x4a4038], trainer: [0x3a5a80, 0xd8d0c0], smith: [0x4a3a30, 0x4a3a30], priest: [0xe8e4d8, 0xc8b050], merchant2: [0x3a7040, 0xe8dcc0] }[s.role] || [0x806040, 0xd0c0a0];
    if (burnt) { box(0x2a2420, 0, 0, 0, 1.2, 0.4, 2.2); return; }
    if (s.role === 'board') {
      for (const z of [-1.0, 1.0]) cyl(0x4a3a2a, 0, 0, z, 0.1, 2.6);
      box(0x6a5238, 0.05, 1.0, 0, 0.18, 1.5, 2.3);
      box(0xd8cfa8, 0.18, 1.25, -0.55, 0.04, 0.5, 0.45); box(0xc8c098, 0.18, 1.7, 0.1, 0.04, 0.45, 0.5); box(0xd8cfa8, 0.18, 1.1, 0.6, 0.04, 0.4, 0.35);
      box(0x4a3a2a, 0.05, 2.55, 0, 0.4, 0.2, 2.6);
      return;
    }
    if (s.role === 'trainer') {
      cyl(0x6a5030, 0.2, 0, -1.2, 0.18, 1.7); box(0x6a5030, 0.2, 1.3, -1.2, 0.18, 0.12, 1.0); sph(0xb09a60, 0.2, 1.75, -1.2, 0.3);   // dummy
      cyl(0x6a5030, 0.2, 0, 1.2, 0.18, 1.7); box(0x6a5030, 0.2, 1.3, 1.2, 0.18, 0.12, 1.0); sph(0xb09a60, 0.2, 1.75, 1.2, 0.3);
      box(0x5a4028, 0.6, 0, 0, 0.3, 1.3, 1.4); for (let i = 0; i < 3; i++) box(0xb8bcc4, 0.78, 0.3 + i * 0.35, -0.4 + i * 0.4, 0.05, 0.9, 0.08);
      return;
    }
    if (s.role === 'smith') {
      box(0x5a5650, 0, 0, 0, 1.4, 0.9, 1.4); wbox(0xff7a30, 0.0, 0.9, 0, 1.0, 0.1, 1.0); box(0x3a3836, 0.9, 0, 0.9, 0.5, 0.8, 0.4);
      cyl(0x4a4a48, -0.4, 0.9, 0, 0.3, 1.8);
      return;
    }
    // stall with counter and awning
    box(0x6a4a2a, 0.55, 0, 0, 0.9, 0.95, 2.4);
    for (const [x, z] of [[-0.5, -1.2], [-0.5, 1.2], [0.7, -1.2], [0.7, 1.2]]) cyl(0x4a3a2a, x, 0, z, 0.07, 2.4);
    for (let i = 0; i < 4; i++) box(awn[i % 2], 0.1, 2.35 - i * 0.02, -0.9 + i * 0.6, 1.5, 0.08, 0.6, 0, 0.18);
    box(0xc8b890, 0.7, 0.95, -0.5, 0.35, 0.3, 0.35); box(0x8a5a3a, 0.7, 0.95, 0.5, 0.3, 0.3, 0.5);
    if (s.role === 'merchant' || s.role === 'merchant2') { sph(0xc04030, 0.7, 1.25, 0.1, 0.12); sph(0xd8b030, 0.5, 1.25, 0.3, 0.12); sph(0x70a040, 0.8, 1.25, -0.1, 0.12); }
    if (s.role === 'priest') box(0xd8c060, 0.7, 1.0, 0, 0.1, 0.5, 0.1);
  }
  function lamp(b, l, burnt) {
    const { cyl, box, wbox } = b;
    b.frame(l.x, H(l.x, l.z) - 0.1, l.z, 0);
    cyl(burnt ? 0x2a2420 : 0x3a3228, 0, 0, 0, 0.09, burnt ? 1.2 : 2.6);
    if (!burnt) { box(0x2a2420, 0, 2.5, 0, 0.5, 0.12, 0.5); wbox(0xffc070, 0, 2.62, 0, 0.32, 0.4, 0.32); box(0x2a2420, 0, 3.02, 0, 0.5, 0.1, 0.5); }
  }
  function banner(b, bn, burnt) {
    const { cyl, box } = b;
    b.frame(bn.x, H(bn.x, bn.z) - 0.1, bn.z, bn.rot + Math.PI / 2);
    cyl(0x3a2a1a, 0, 0, 0, 0.09, burnt ? 2.0 : 5.4);
    if (!burnt) { box(BANNER, 0.05, 2.2, 0, 0.06, 2.8, 1.1); box(0xe8e0c0, 0.09, 3.9, 0, 0.04, 0.9, 0.12); box(0xe8e0c0, 0.09, 3.7, 0, 0.04, 0.12, 0.7); box(0x3a2a1a, 0, 5.3, 0, 0.14, 0.14, 1.3); }
  }
  function well(b, w, burnt, big) {
    const { cyl, box, pyr, sph } = b, y0 = H(w.x, w.z);
    b.frame(w.x, y0 - 0.2, w.z, 0);
    if (big) { // fountain with a statue
      cyl(0x8a8780, 0, 0, 0, 3.4, 0.9); cyl(0x2a4a60, 0, 0.7, 0, 3.0, 0.3); cyl(0x8a8780, 0, 0.8, 0, 0.9, 2.2); cyl(0x9a968c, 0, 3.0, 0, 0.5, 1.4); sph(0x9a968c, 0, 4.4, 0, 0.45);
      return;
    }
    cyl(0x6d6e70, 0, 0, 0, 1.5, 1.1); cyl(burnt ? 0x151a1c : 0x20384a, 0, 0.8, 0, 1.15, 0.35);
    if (!burnt) { for (const s of [-1, 1]) cyl(0x4a3a2a, 0, 0, s * 1.3, 0.12, 2.8); box(0x4a3a2a, 0, 2.8, 0, 0.3, 0.15, 3.1); pyr(0x5a3a2a, 0, 2.95, 0, 1.0, 0.9, 1.9); }
  }
  function citadel(b, c, burnt) {
    const { box, cyl, cone, pyr, wbox } = b, y0 = H(c.x, c.z);
    b.frame(c.x, y0 - 1.6, c.z, c.rot);
    const stone = burnt ? 0x3a3632 : 0x8a8a90, dark = burnt ? 0x2a2622 : 0x6a6a72;
    box(stone, 0, 0, 0, 21, 2.6, 21);                                  // terrace
    box(stone, 0, 2.6, 0, 15, burnt ? 9 : 14, 15);                      // keep
    for (let i = -3; i <= 3; i++) for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = sx ? sx * 7.6 : i * 2.1, z = sz ? sz * 7.6 : i * 2.1; if (!burnt || (i + 3) % 2) box(dark, x, 2.6 + (burnt ? 9 : 14), z, 1.1, 1.1, 1.1); }
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      cyl(stone, sx * 8, 0, sz * 8, 2.8, burnt ? 12 : 21);
      if (!burnt) { cyl(dark, sx * 8, 21, sz * 8, 3.2, 0.8); cone(0x4a4a60, sx * 8, 21.8, sz * 8, 3.2, 5.2); box(BANNER, sx * 8, 28, sz * 8, 0.08, 2.0, 1.1); wbox(0xffc060, sx * 8 + 2.8 * sx, 15, sz * 8, 0.1, 1.2, 0.5); }
    }
    if (!burnt) {
      pyr(0x3a3a50, 0, 16.6, 0, 6.2, 9.5, 6.2); cyl(0xd8c060, 0, 26.0, 0, 0.12, 4.5);
      box(BANNER, 0.1, 28.6, 0, 0.06, 2.4, 1.6); box(0xe8e0c0, 0.14, 29.4, 0, 0.04, 0.2, 1.2);
      box(0x2a2018, 7.6, 2.6, 0, 0.5, 4.2, 3.2);                                                    // great door
      wbox(0xffc060, 7.55, 8.0, -3.6, 0.1, 2.4, 0.9); wbox(0xffc060, 7.55, 8.0, 3.6, 0.1, 2.4, 0.9); wbox(0xffc060, 7.55, 11.5, 0, 0.1, 2.4, 0.9);
      for (let i = 0; i < 5; i++) box(stone, 8.4 + i * 0.1, 0, 0, 1.0, 0.45 * (5 - i) * 0.6, 4.6);  // steps
    }
  }

  // ---- walls
  function walls(b, t, burnt) {
    const lay = t.lay, w = lay.wall;
    if (!w) return;
    const cap = t.kind === 'capital', r = w.r, segLen = 5.0, n = Math.max(12, Math.round((TAU * r) / segLen)), ang = TAU / n;
    const col = cap ? (burnt ? 0x3a3632 : 0x8a8780) : (burnt ? 0x2a2420 : 0x6a5236), top = cap ? (burnt ? 0x2a2622 : 0x6f6d68) : (burnt ? 0x1a1614 : 0x7a6040);
    const gate = (a) => { for (const g of w.gates) { let d = Math.abs(((a - g + Math.PI) % TAU + TAU) % TAU - Math.PI); if (d < w.gateHalf) return true; } return false; };
    const gh = cap ? 6.4 : 5.0;
    for (let i = 0; i < n; i++) {
      const a = (i + 0.5) * ang, x = t.x + Math.cos(a) * r, z = t.z + Math.sin(a) * r;
      if (gate(a)) continue;
      if (burnt && (i % 3 === 1)) continue;
      const x0 = t.x + Math.cos(a - ang / 2) * r, z0 = t.z + Math.sin(a - ang / 2) * r, x1 = t.x + Math.cos(a + ang / 2) * r, z1 = t.z + Math.sin(a + ang / 2) * r;
      const y = Math.min(H(x0, z0), H(x1, z1), H(x, z)) - 1.3, hh = gh + 1.3 - (burnt ? 1.8 + (i % 3) : 0);
      b.frame(x, y, z, a + Math.PI / 2);
      if (cap) {
        b.api.box(col, 0, 0, 0, segLen + 0.5, hh, 1.8);
        if (!burnt) { b.api.box(top, 0, hh, 0, segLen + 0.5, 0.35, 2.2); for (let k = -1; k <= 1; k += 2) b.api.box(top, k * 1.6, hh + 0.35, 0.85, 1.1, 0.8, 0.5); }
      } else {
        b.api.box(col, 0, 0, 0, segLen + 0.4, hh, 0.7);
        if (!burnt) for (let k = -2; k <= 2; k++) b.api.cone(top, k * 1.0, hh, 0, 0.32, 1.0);
      }
    }
    // towers every ~8 segments and flanking the gates
    const tw = (a, big) => {
      const x = t.x + Math.cos(a) * r, z = t.z + Math.sin(a) * r, y = H(x, z) - 1.4, rad = cap ? 3.0 : 2.0, h = (cap ? 11.5 : 8.5) - (burnt ? 3 : 0);
      b.frame(x, y, z, a + Math.PI / 2);
      b.api.cyl(burnt ? 0x2a2622 : cap ? 0x7d7a74 : 0x5a4028, 0, 0, 0, rad, h);
      if (!burnt) { b.api.cyl(cap ? 0x6a6660 : 0x4a3420, 0, h, 0, rad + 0.3, 0.5); b.api.cone(cap ? 0x4a4a60 : 0x4a3a28, 0, h + 0.5, 0, rad + 0.4, cap ? 4.6 : 3.4); b.win.push({ geo: G.box, color: 0xffc060, m: new THREE.Matrix4().compose(V3(x + Math.cos(a) * rad * 0.95, y + h - 2.5, z + Math.sin(a) * rad * 0.95), Q.setFromEuler(E.set(0, -a, 0)), S3.set(0.12, 0.8, 0.5)) }); }
    };
    for (let i = 0; i < n; i += 8) { const a = i * ang; if (!gate(a) && !gate(a + ang)) tw(a); }
    for (const g of w.gates) {
      for (const s of [-1, 1]) tw(g + s * (w.gateHalf + 0.012), true);
      // gate arch beam + doors (open)
      const x = t.x + Math.cos(g) * r, z = t.z + Math.sin(g) * r, y = H(x, z);
      b.frame(x, y - 0.1, z, g + Math.PI / 2);
      const gw = Math.sin(w.gateHalf) * r * 2;
      if (!burnt) {
        b.api.box(cap ? 0x6f6d68 : 0x4a3420, 0, gh - 0.3, 0, gw + 1.2, 1.4, 2.0);
        for (const s of [-1, 1]) b.api.box(0x3a2a1a, s * (gw / 2 - 0.3), 0, 0.9, 0.5, gh - 1.0, 1.2);
        b.api.box(BANNER, 0, gh - 3.0, 1.05, 0.9, 2.2, 0.06);
      } else b.api.box(0x2a2622, 0, gh - 0.3, 0, gw + 1.0, 0.8, 1.6);
    }
  }

  // ---- roads as ribbons following the terrain
  function roads(b, lay, burnt) {
    const col = new THREE.Color(burnt ? 0x2e2822 : 0x6b5a44);
    for (const [x0, z0, x1, z1] of lay.roads) {
      const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(2, Math.ceil(L / 3)), dx = (x1 - x0) / L, dz = (z1 - z0) / L, nx = -dz, nz = dx;
      const pos = [], nor = [];
      for (let i = 0; i < n; i++) {
        const q = [i / n, (i + 1) / n];
        const p = q.map((t) => { const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t; return [[x + nx * 1.9, H(x + nx * 1.9, z + nz * 1.9) + 0.09, z + nz * 1.9], [x - nx * 1.9, H(x - nx * 1.9, z - nz * 1.9) + 0.09, z - nz * 1.9]]; });
        for (const k of [[p[0][0], p[0][1], p[1][0]], [p[0][1], p[1][1], p[1][0]]]) for (const v of k) { pos.push(...v); nor.push(0, 1, 0); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      b.api.tri(g, col.getHex());
    }
    // plaza disc
    const y = H(lay.well.x, lay.well.z);
    b.api.frame(lay.well.x, y - 0.35, lay.well.z, 0);
    b.api.cyl(burnt ? 0x3a3632 : 0x8a8478, 0, 0, 0, lay.pr, 0.5);
    b.api.cyl(burnt ? 0x2e2a26 : 0x7a746a, 0, 0.3, 0, lay.pr * 0.62, 0.25);
  }
  function village(b, t, burnt) { // no wall: a bonfire ring, hay, fences
    const lay = t.lay, rr = rnd(t.id * 31 + 5);
    b.api.frame(t.x, H(t.x, t.z) - 0.1, t.z, 0);
    if (!burnt) { for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; b.api.box(0x6a6860, Math.cos(a) * 1.1, 0, Math.sin(a) * 1.1, 0.5, 0.35, 0.5); } b.api.cyl(0x3a2a1a, 0, 0, 0, 0.4, 0.3); }
    for (let i = 0; i < 5; i++) {
      const a = rr() * TAU, d = lay.pr + 4 + rr() * lay.R * 0.5, x = t.x + Math.cos(a) * d, z = t.z + Math.sin(a) * d;
      if (lay.houses.some((h) => Math.hypot(h.x - x, h.z - z) < 5)) continue;
      b.api.frame(x, H(x, z), z, a);
      b.api.cyl(burnt ? 0x3a3020 : 0xc8b060, 0, 0, 0, 0.8, 1.0);
      if (i % 2) b.api.cyl(burnt ? 0x3a3020 : 0xc8b060, 1.2, 0, 0.3, 0.7, 0.9);
    }
  }

  // ------------------------------------------------------------ build one town
  function buildStatic(t, burnt) {
    const lay = layoutOf(st, t), b = Builder(), rr = rnd(t.id);
    roads(b, lay, burnt);
    well(b.api, lay.well, burnt, t.kind === 'capital');
    lay.houses.forEach((h, i) => house(b.api, h, burnt, i));
    lay.stalls.forEach((s) => stall(b.api, s, burnt));
    lay.lamps.forEach((l) => lamp(b.api, l, burnt));
    lay.banners.forEach((bn) => banner(b.api, bn, burnt));
    if (t.kind === 'village') village(b, t, burnt); else walls(b, t, burnt);
    if (lay.citadel) citadel(b.api, lay.citadel, burnt);
    const g = new THREE.Group();
    const m = new THREE.Mesh(mergeColored(b.main), solid); m.frustumCulled = false; g.add(m);
    if (b.win.length && !burnt) { const w = new THREE.Mesh(mergeColored(b.win), winMat); w.frustumCulled = false; g.add(w); }
    return g;
  }

  // ------------------------------------------------------------ dynamic bits
  const smokeMat = new THREE.SpriteMaterial({ map: softTexture(), color: 0x6a6660, transparent: true, opacity: 0.32, depthWrite: false });
  const ashMat = new THREE.SpriteMaterial({ map: softTexture(), color: 0x2a2624, transparent: true, opacity: 0.5, depthWrite: false });
  const lampMat = glowSpriteMat(0xffb868, 0.85), fireMat = glowSpriteMat(0xff7a28, 0.95);
  function iconTex(role) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d');
    x.fillStyle = 'rgba(10,8,6,0.78)'; x.beginPath(); x.arc(32, 32, 28, 0, TAU); x.fill();
    x.strokeStyle = role === 'board' ? '#d8c070' : role === 'trainer' ? '#80b8ff' : '#ffe070'; x.lineWidth = 3; x.stroke();
    x.fillStyle = x.strokeStyle; x.font = 'bold 34px serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(role === 'board' ? '!' : role === 'trainer' ? '⚔' : '$', 32, 34);
    const tex = new THREE.CanvasTexture(c); return tex;
  }
  const iconMats = {};
  const iconMat = (role) => iconMats[role] || (iconMats[role] = new THREE.SpriteMaterial({ map: iconTex(role), depthTest: false, transparent: true }));

  const LOOK = {
    merchant: { head: 'head', cloth: 0x7a3a2a, pants: 0x3a2a20, trim: 0xb89a50, weapon: 'none', scale: 1.15 },
    trainer: { head: 'helm', cloth: 0x4a5a6a, pants: 0x2a303a, trim: 0x8a909a, weapon: 'sword', scale: 1.2, shoulder: 0x6a727c },
    board: { head: 'hood', cloth: 0x2a4a78, pants: 0x20283a, trim: 0xe0d8b0, weapon: 'none', scale: 1.12 },
    smith: { head: 'head', cloth: 0x4a4038, pants: 0x2a2420, trim: 0x6a5a40, weapon: 'club', scale: 1.2, bulk: 1.2 },
    priest: { head: 'hood', cloth: 0xe0dccc, pants: 0xc8c4b0, trim: 0xd8b24a, weapon: 'none', scale: 1.15 },
    villager: { head: 'head', cloth: 0x6a5a40, pants: 0x3a3226, trim: 0x5a4a30, weapon: 'none', scale: 1.0 },
  };
  const VCOL = [0x6a5a40, 0x5a6a4a, 0x7a5a50, 0x50607a, 0x8a7a5a], SKIN = [0xc9a888, 0xb59878, 0xdcc0a0, 0x9a7a5a];
  function makeNpc(n) {
    const l = Object.assign({}, LOOK[n.role] || LOOK.villager);
    if (n.role === 'villager') { l.cloth = VCOL[n.look % 5]; l.pants = 0x30281e; if (n.look % 3 === 0) l.head = 'hood'; if (n.look % 2) l.scale = 0.95; l.weapon = n.look === 2 ? 'dagger' : 'none'; }
    l.skin = SKIN[n.look % 4]; l.accent = BANNER;
    const g = MK.humanoid(l);
    const pivot = new THREE.Group(); pivot.add(g);
    let icon = null;
    if (n.role === 'merchant' || n.role === 'board' || n.role === 'trainer') { icon = new THREE.Sprite(iconMat(n.role)); icon.scale.set(0.9, 0.9, 1); icon.position.y = 3.0; icon.renderOrder = 10; pivot.add(icon); }
    root.add(pivot);
    return { pivot, g, icon, ph: Math.random() * 6 };
  }

  const recs = [];
  for (const t of st.towns) {
    const lay = layoutOf(st, t);
    recs.push({ t, lay, g: null, sig: '', smoke: [], fires: [], lampSp: [], npcs: new Map(), age: 0, emitI: 0, sources: [] });
  }
  const dist = (a, b, c, d) => Math.hypot(a - c, b - d);

  function rebuild(r) {
    const t = r.t, burnt = t.state === 'fallen';
    if (r.g) { root.remove(r.g); r.g.traverse((o) => { if (o.isMesh) o.geometry.dispose(); }); }
    r.g = buildStatic(t, burnt); root.add(r.g);
    r.sig = burnt ? 'burnt' : 'ok';
    // dynamic sources
    for (const s of [...r.smoke, ...r.fires, ...r.lampSp]) { s.parent && s.parent.remove(s); }
    r.smoke = []; r.fires = []; r.lampSp = []; r.sources = [];
    const lay = r.lay;
    const sources = [], fireSrc = [];
    lay.houses.forEach((h, i) => {
      const y = H(h.x, h.z) + 1.4 + h.h + 1.4;
      if (burnt) { fireSrc.push({ x: h.x, y: y - 1.0, z: h.z, f: i % 3 !== 0 }); sources.push({ x: h.x, y, z: h.z, burnt: true }); }
      else if (h.c < 3 || h.kind === 'smithy') sources.push({ x: h.x - Math.cos(h.rot) * h.d * 0.22, y: y + 0.8, z: h.z - Math.sin(h.rot) * h.d * 0.22, burnt: false });
    });
    if (lay.wall && !burnt) for (const g of lay.wall.gates) for (const s of [-1, 1]) { const a = g + s * (lay.wall.gateHalf + 0.012); fireSrc.push({ x: t.x + Math.cos(a) * lay.wall.r, y: H(t.x + Math.cos(a) * lay.wall.r, t.z + Math.sin(a) * lay.wall.r) + (t.kind === 'capital' ? 12 : 9), z: t.z + Math.sin(a) * lay.wall.r, f: false, beacon: true }); }
    if (burnt && lay.citadel) { fireSrc.push({ x: lay.citadel.x, y: H(lay.citadel.x, lay.citadel.z) + 11, z: lay.citadel.z, f: true }); sources.push({ x: lay.citadel.x, y: H(lay.citadel.x, lay.citadel.z) + 12, z: lay.citadel.z, burnt: true }); }
    if (!burnt) fireSrc.push({ x: lay.well.x + (t.kind === 'village' ? 0 : 99999), y: H(lay.well.x, lay.well.z) + 0.8, z: lay.well.z, f: true, bonfire: t.kind === 'village' });
    r.fireSrc = fireSrc.filter((f) => Math.abs(f.x) < 5000);
    r.sources = sources;
    for (let i = 0; i < Math.min(sources.length, burnt ? 16 : 10); i++) { const s = new THREE.Sprite(burnt ? ashMat.clone() : smokeMat.clone()); s.visible = false; s.renderOrder = 5; root.add(s); r.smoke.push(s); s.userData = { age: Math.random() * 4, life: burnt ? 7 : 5.5, src: i % sources.length }; }
    for (const f of r.fireSrc) { const s = new THREE.Sprite(fireMat); s.visible = false; s.renderOrder = 6; root.add(s); s.userData = { f, ph: Math.random() * 6 }; r.fires.push(s); }
    for (const l of lay.lamps) { const s = new THREE.Sprite(lampMat); s.scale.set(2.6, 2.6, 1); s.position.set(l.x, H(l.x, l.z) + 2.6, l.z); s.visible = false; s.renderOrder = 6; root.add(s); r.lampSp.push(s); }
  }

  let buildCooldown = 0;
  const now = () => performance.now() / 1000;
  const npcInfo = {};

  function frame(st2, alpha, dt) {
    const f = ctx.focus || { x: 0, z: 0 }, tm = st.teams[ctx.localTeam], night = isNight(st), t = now();
    buildCooldown -= dt;
    lampMat.opacity = night ? 0.85 : 0.0;
    winMat.color.setScalar(night ? 1 : 0.55);
    const near = TOWN.activate;
    for (const r of recs) {
      const T = r.t, d = dist(T.x, T.z, f.x, f.z);
      const burnt = T.state === 'fallen', want = burnt ? 'burnt' : 'ok';
      const show = d < SHOW;
      if (!show) { if (r.g) r.g.visible = false; for (const s of r.smoke) s.visible = false; for (const s of r.fires) s.visible = false; for (const s of r.lampSp) s.visible = false; for (const [, v] of r.npcs) v.pivot.visible = false; continue; }
      if ((!r.g || r.sig !== want) && buildCooldown <= 0) { rebuild(r); buildCooldown = 0.05; }
      if (!r.g) continue;
      r.g.visible = true;
      const fxOn = d < FX_NEAR;
      // lamps
      for (const s of r.lampSp) s.visible = fxOn && night && !burnt;
      // fire sprites (bonfire, gate beacons when besieged, burning houses)
      for (const s of r.fires) {
        const q = s.userData.f, ph = s.userData.ph;
        let on = fxOn && (burnt ? q.f : q.beacon ? T.state === 'besieged' : q.bonfire);
        if (burnt && on) on = (st.t - T.fallT) < 600 || ((ph | 0) % 3 === 0);
        s.visible = on;
        if (!on) continue;
        const k = 0.85 + 0.25 * Math.sin(t * 9 + ph) + 0.1 * Math.sin(t * 17 + ph * 2);
        s.position.set(q.x, q.y + (q.beacon ? 0.3 : 0.2) + k * 0.15, q.z);
        const sz = (q.beacon ? 3.2 : burnt ? 3.6 : 2.4) * k; s.scale.set(sz, sz * 1.2, 1);
      }
      // smoke
      for (const s of r.smoke) {
        const u = s.userData;
        if (!fxOn) { s.visible = false; continue; }
        const src = r.sources[u.src % r.sources.length];
        if (!src) continue;
        u.age += dt;
        if (u.age > u.life) { u.age = 0; u.src = (u.src + 3 + ((Math.random() * 3) | 0)) % r.sources.length; }
        const k = u.age / u.life, rise = burnt ? 2.6 : 1.6;
        s.visible = burnt ? (T.state === 'fallen' && ((st.t - T.fallT) < 900 || u.src % 4 === 0)) : !burnt && T.state !== 'fallen';
        s.position.set(src.x + k * 3.2 + Math.sin(u.age * 0.9 + u.src) * 0.4, src.y + u.age * rise, src.z + k * 1.2);
        const sz = (burnt ? 3 : 1.4) + k * (burnt ? 9 : 4.5);
        s.scale.set(sz, sz, 1);
        s.material.opacity = (burnt ? 0.5 : 0.32) * (1 - k) * Math.min(1, u.age * 2);
      }
      // NPCs
      if (!tm) continue;
      for (const n of T.npcs) {
        let v = r.npcs.get(n.id);
        const dn = dist(n.x, n.z, f.x, f.z), vis = n.alive && dn < NPC_SHOW && (ctx.visibleNow ? ctx.visibleNow(n.x, n.z) || dn < 40 : true);
        if (!vis) { if (v) v.pivot.visible = false; continue; }
        if (!v) { v = makeNpc(n); r.npcs.set(n.id, v); }
        v.pivot.visible = true;
        const y = H(n.x, n.z);
        v.pivot.position.set(n.x, y, n.z);
        v.pivot.rotation.y = -n.a;
        const u = v.g.userData, sw = n.moving ? Math.sin(t * (n.fleeing ? 12 : 5.5) + v.ph) * (n.fleeing ? 0.9 : 0.55) : 0;
        u.legL.rotation.z = sw; u.legR.rotation.z = -sw; u.armL.rotation.z = -sw * 0.8; u.armR.rotation.z = sw * 0.8;
        if (n.fleeing) { u.armL.rotation.z = u.armR.rotation.z = -2.3; }
        if (v.icon) { v.icon.position.y = 3.0 + Math.sin(t * 2.5 + v.ph) * 0.12; v.icon.visible = !(n.role === 'trainer' && !T.services.trainer); }
      }
    }
  }

  function handleEvents(events) {
    for (const e of events) {
      if (e.type === 'townAttacked') { if (ctx.ringFx) ctx.ringFx(e.x, e.z, 40, 0xff4030, 1.6); if (ctx.burst) ctx.burst(e.x, H(e.x, e.z) + 6, e.z, 26, 6, 0xff5030, 1.2, 1.0, 9); }
      else if (e.type === 'townFallen') { if (ctx.ringFx) ctx.ringFx(e.x, e.z, 70, 0xff3010, 2.4); if (ctx.burst) ctx.burst(e.x, H(e.x, e.z) + 5, e.z, 60, 12, 0xff6a20, 2.0, 1.4, 14); }
      else if (e.type === 'townSaved' || e.type === 'townReclaimed') { if (ctx.ringFx) ctx.ringFx(e.x, e.z, 50, 0x80c0ff, 1.8); if (ctx.burst) ctx.burst(e.x, H(e.x, e.z) + 4, e.z, 40, 8, 0xb8d8ff, 1.6, 1.2, 10); }
    }
  }

  return {
    frame, handleEvents,
    dispose() {
      scene.remove(root);
      root.traverse((o) => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
    },
  };
}
