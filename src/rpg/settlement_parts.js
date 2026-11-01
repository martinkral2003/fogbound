// FOGBOUND: HERO settlement building geometry. Each builder returns {geo (merged vertex-coloured), windows[], flames[], smoke[]} in the
// building's local frame: x = width (w), z = depth (d, FRONT/door at +z), y up from the ground. See content/settlement.js for the layout.
import * as THREE from 'three';
import { mergeColored } from '../models.js';

const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3(1, 1, 1);
const mat4 = (x, y, z, rx = 0, ry = 0, rz = 0) => m4.clone().compose(v3.set(x, y, z), q.setFromEuler(e.set(rx, ry, rz)), s3);
const boxG = new Map();
const bg = (w, h, d) => { const k = w + ',' + h + ',' + d; let g = boxG.get(k); if (!g) { g = new THREE.BoxGeometry(w, h, d); boxG.set(k, g); } return g; };

export class Parts {
  constructor() { this.p = []; this.windows = []; this.flames = []; this.smoke = []; }
  box(w, h, d, x, y, z, color, ry = 0, rx = 0, rz = 0) { this.p.push({ geo: bg(w, h, d), color, m: mat4(x, y, z, rx, ry, rz) }); return this; }
  cyl(rt, rb, h, x, y, z, color, seg = 8) { this.p.push({ geo: new THREE.CylinderGeometry(rt, rb, h, seg), color, m: mat4(x, y, z) }); return this; }
  cone(r, h, x, y, z, color, seg = 6) { this.p.push({ geo: new THREE.ConeGeometry(r, h, seg), color, m: mat4(x, y, z) }); return this; }
  // gable roof, ridge along x. y = eave height; ridge rises by h
  roof(w, d, h, ov, x, y, z, color, color2 = null) {
    const hw = w / 2 + ov, hd = d / 2 + ov * 0.8, t = 0.12;
    const mk = (pts, c) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); g.computeVertexNormals(); this.p.push({ geo: g, color: c, m: mat4(x, y, z) }); };
    const R = (sz) => [[-hw, 0, sz * hd], [hw, 0, sz * hd], [hw, h, 0], [-hw, h, 0]];
    for (const sz of [1, -1]) {
      const [a, b, c, d2] = R(sz), o = sz > 0 ? [a, b, c, a, c, d2] : [b, a, d2, b, d2, c];
      mk(o.flat(), sz > 0 ? color : (color2 || color));
      const dn = (p) => [p[0], p[1] - t, p[2]]; // underside so the roof has thickness
      const u = sz > 0 ? [dn(a), dn(c), dn(b), dn(a), dn(d2), dn(c)] : [dn(b), dn(d2), dn(a), dn(b), dn(c), dn(d2)];
      mk(u.flat(), 0x2a2018);
    }
    for (const sx of [1, -1]) { const x0 = sx * (w / 2 - 0.02); mk((sx > 0 ? [[x0, 0, -d / 2], [x0, 0, d / 2], [x0, h * 0.92 - 0.1, 0]] : [[x0, 0, d / 2], [x0, 0, -d / 2], [x0, h * 0.92 - 0.1, 0]]).flat(), 0x6a5238); }
    return this;
  }
  window(x, y, z, w, h, ry = 0) { this.windows.push({ x, y, z, w, h, ry }); return this; }
  flame(x, y, z, s = 1) { this.flames.push({ x, y, z, s }); return this; }
  smk(x, y, z) { this.smoke.push({ x, y, z }); return this; }
  build() { return { geo: mergeColored(this.p), windows: this.windows, flames: this.flames, smoke: this.smoke }; }
}

const WOOD = 0x6a4a2e, DARK = 0x3a2a1c, STONE = 0x6e7074, PLASTER = 0xb8a98a, ROOF = [0x5a3a2c, 0x4a4a52, 0x6a4a30, 0x3e4a3c];

// timber-framed house body: stone footing, plaster walls with a dark timber frame, door at +z
function body(P, w, d, h, wall = PLASTER, beams = DARK) {
  P.box(w + 0.3, 0.9, d + 0.3, 0, 0.45 - 0.4, 0, STONE);
  P.box(w, h, d, 0, h / 2 + 0.5, 0, wall);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.box(0.22, h + 0.2, 0.22, sx * (w / 2), h / 2 + 0.5, sz * (d / 2), beams);
  for (const y of [0.55, h + 0.5]) { P.box(w + 0.2, 0.16, 0.2, 0, y, d / 2, beams); P.box(w + 0.2, 0.16, 0.2, 0, y, -d / 2, beams); P.box(0.2, 0.16, d + 0.2, w / 2, y, 0, beams); P.box(0.2, 0.16, d + 0.2, -w / 2, y, 0, beams); }
  for (let i = 1; i < 3; i++) P.box(0.12, h, 0.14, -w / 2 + (w * i) / 3, h / 2 + 0.5, d / 2 + 0.02, beams);
  P.box(1.1, 1.9, 0.18, 0, 1.45, d / 2 + 0.04, 0x4a3220); P.box(1.3, 0.14, 0.24, 0, 2.45, d / 2 + 0.05, beams);
  P.box(0.1, 0.1, 0.1, 0.4, 1.4, d / 2 + 0.16, 0xc8a040);
}
export const BUILD = {
  house(w, d, h, o) {
    const P = new Parts(), hh = h - 1.8; body(P, w, d, hh * 0.78 + 0.5);
    const bh = hh * 0.78 + 0.5; P.roof(w, d, h - bh - 0.2, 0.55, 0, bh + 0.5, 0, ROOF[o.seed % 4], ROOF[(o.seed + 1) % 4]);
    P.box(0.7, 2.2, 0.7, w * 0.28, bh + 1.6, -d * 0.18, STONE).smk(w * 0.28, bh + 2.9, -d * 0.18);
    P.window(-w * 0.3, bh * 0.62, d / 2 + 0.07, 0.7, 0.7).window(w * 0.3, bh * 0.62, d / 2 + 0.07, 0.7, 0.7).window(w / 2 + 0.07, bh * 0.62, 0, 0.7, 0.7, Math.PI / 2);
    return P.build();
  },
  tavern(w, d, h) {
    const P = new Parts(); body(P, w, d, h * 0.6, 0xa89c80); const bh = h * 0.6 + 0.5;
    P.box(w + 0.5, 0.35, d + 0.5, 0, bh + 0.35, 0, WOOD); P.box(w - 0.4, h * 0.3, d - 0.4, 0, bh + 0.5 + h * 0.15, 0, 0xa89c80);
    P.roof(w, d, h * 0.42, 0.7, 0, bh + 0.5 + h * 0.3, 0, 0x4a3226, 0x4e3a2c);
    P.box(0.9, 3.2, 0.9, -w * 0.3, bh + 2.2, -d * 0.2, STONE).smk(-w * 0.3, bh + 3.9, -d * 0.2);
    P.box(0.1, 0.1, 1.6, w / 2 - 0.9, 3.4, d / 2 + 0.9, DARK); P.box(0.9, 0.7, 0.08, w / 2 - 0.9, 2.7, d / 2 + 1.6, 0x7a5a30).flame(w / 2 - 0.2, 3.3, d / 2 + 1.0, 0.7); // hanging sign + lantern
    for (let i = 0; i < 3; i++) P.window(-w * 0.32 + i * w * 0.32, 2.2, d / 2 + 0.07, 0.9, 0.8).window(-w * 0.32 + i * w * 0.32, bh + 1.5, d / 2 + 0.25, 0.9, 0.8);
    P.cyl(0.35, 0.35, 0.9, -w / 2 - 0.6, 0.5, d / 2 - 1.2, WOOD).cyl(0.35, 0.35, 0.9, -w / 2 - 0.6, 0.5, d / 2 - 2.1, WOOD);
    return P.build();
  },
  hall(w, d, h) {
    const P = new Parts(); body(P, w, d, h * 0.55, 0xb0a48a, 0x4a3426); const bh = h * 0.55 + 0.5;
    P.roof(w, d, h * 0.55, 0.9, 0, bh + 0.5, 0, 0x52403a, 0x4a3a34);
    for (const s of [-1, 1]) { P.box(0.5, 4.2, 0.5, s * (w / 2 - 0.5), 2.1, d / 2 + 0.7, 0x5a4636); P.box(0.7, 0.2, 0.7, s * (w / 2 - 0.5), 4.3, d / 2 + 0.7, 0x7a6a4a); P.flame(s * (w / 2 - 0.5), 4.7, d / 2 + 0.7, 0.8); }
    P.box(0.12, 2.4, 0.9, 0, h * 0.55 + 0.6, d / 2 + 0.1, 0x7a1c1c); // elder's banner
    P.window(-w * 0.3, 2.6, d / 2 + 0.07, 0.8, 1.0).window(w * 0.3, 2.6, d / 2 + 0.07, 0.8, 1.0);
    P.box(1.0, 2.6, 1.0, w * 0.3, bh + 2.2, -d * 0.2, STONE).smk(w * 0.3, bh + 3.8, -d * 0.2);
    return P.build();
  },
  smithy(w, d, h) {
    const P = new Parts(); P.box(w + 0.3, 0.7, d + 0.3, 0, 0.0, 0, STONE); P.box(w, 0.2, d, 0, 0.45, 0, 0x4a4640);
    for (const sx of [-1, 1]) P.box(0.4, h - 0.8, 0.4, sx * (w / 2 - 0.2), (h - 0.8) / 2 + 0.5, d / 2 - 0.2, WOOD);
    P.box(w, h - 0.8, 0.5, 0, (h - 0.8) / 2 + 0.5, -d / 2 + 0.25, 0x6a5a48); P.box(0.5, h - 0.8, d, -w / 2 + 0.25, (h - 0.8) / 2 + 0.5, 0, 0x6a5a48);
    P.roof(w, d, 1.5, 0.7, 0, h - 0.3, 0, 0x3e3a38, 0x403c3a);
    P.box(1.8, 1.4, 1.6, w / 2 - 1.4, 1.0, -d / 2 + 1.2, STONE); P.box(1.2, h + 1.2, 1.2, w / 2 - 1.4, (h + 1.2) / 2 + 0.5, -d / 2 + 0.9, STONE).smk(w / 2 - 1.4, h + 2.3, -d / 2 + 0.9);
    P.flame(w / 2 - 1.4, 1.8, -d / 2 + 1.9, 1.2); P.box(0.7, 0.5, 0.4, -1, 0.95, 0.3, 0x2a2a2e); P.box(0.4, 0.5, 0.4, -1, 0.5, 0.3, WOOD); P.box(0.9, 0.5, 0.4, 0.6, 0.8, d / 2 - 0.9, WOOD);
    P.box(0.08, 1.2, 0.08, -2, 1.2, 1.3, 0x5a5a60, 0, 0, 0.5); P.box(0.08, 1.2, 0.08, -2.4, 1.2, 1.3, 0x5a5a60, 0, 0, -0.4);
    return P.build();
  },
  hut(w, d, h) {
    const P = new Parts(); P.cyl(w * 0.62, w * 0.7, 0.8, 0, 0.0, 0, STONE, 8); P.cyl(w * 0.52, w * 0.56, h * 0.55, 0, h * 0.28 + 0.5, 0, 0x7a6a50, 8);
    P.cone(w * 0.85, h * 0.62, 0, h * 0.55 + 0.5 + h * 0.3, 0, 0x4a5a38, 8); P.box(1.0, 1.8, 0.2, 0, 1.4, w * 0.55, 0x3a2a1c);
    P.window(w * 0.38, 2.0, w * 0.4, 0.5, 0.6, 0.8).window(-w * 0.38, 2.0, w * 0.4, 0.5, 0.6, -0.8);
    P.cyl(0.55, 0.45, 0.6, w * 0.8, 0.5, w * 0.5, 0x2a2a2a).cyl(0.45, 0.45, 0.05, w * 0.8, 0.82, w * 0.5, 0x40e070).flame(w * 0.8, 1.1, w * 0.5, 0.8);
    for (let i = 0; i < 5; i++) P.box(0.05, 0.5, 0.05, -1.2 + i * 0.5, 2.7, w * 0.55 + 0.2, 0x5a7a3a);
    P.box(2.6, 0.08, 0.08, 0, 3.0, w * 0.56 + 0.2, WOOD);
    return P.build();
  },
  stall(w, d, h, o) {
    const P = new Parts(), c1 = o.style === 'yard' ? 0x7a2a2a : 0x2a5a4a;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.box(0.2, h, 0.2, sx * (w / 2 - 0.1), h / 2, sz * (d / 2 - 0.1), WOOD);
    for (let i = 0; i < 6; i++) P.box(w / 6, 0.08, d + 0.8, -w / 2 + w / 12 + (i * w) / 6, h + 0.1 + 0.0, 0.4, i % 2 ? 0xd8cfb4 : c1, 0, -0.18);
    P.box(w, 0.9, 0.6, 0, 0.5, -d / 2 + 0.5, WOOD).box(w - 0.2, 0.08, 0.7, 0, 1.0, -d / 2 + 0.55, 0x8a6a40);
    P.box(0.5, 0.5, 0.5, w * 0.3, 0.25, d * 0.2, 0x7a5a38).box(0.5, 0.35, 0.5, w * 0.3 + 0.6, 0.18, d * 0.2 + 0.2, 0x6a4a2e);
    if (o.style === 'yard') { P.box(0.1, 1.6, 0.1, -w / 2 - 0.6, 0.8, 0, WOOD, 0, 0, 0.0).box(0.8, 0.6, 0.08, -w / 2 - 0.6, 1.5, 0, 0x7a7a80); P.box(0.1, 1.4, 0.1, -w / 2 - 1.5, 0.7, 0.6, WOOD, 0, 0, 0.1); }
    P.flame(w / 2 - 0.1, h + 0.5, d / 2 - 0.1, 0.5);
    return P.build();
  },
  well() { const P = new Parts(); P.cyl(1.0, 1.1, 1.0, 0, 0.5, 0, STONE, 10).cyl(0.75, 0.75, 0.05, 0, 1.02, 0, 0x101820, 10); for (const s of [-1, 1]) P.box(0.14, 2.3, 0.14, s * 0.9, 1.9, 0, WOOD); P.box(2.3, 0.14, 0.14, 0, 3.0, 0, WOOD).roof(2.2, 1.6, 0.8, 0.3, 0, 3.0, 0, 0x5a3a2c).cyl(0.2, 0.17, 0.3, 0.3, 1.9, 0, WOOD); return P.build(); },
  board() { const P = new Parts(); for (const s of [-1, 1]) P.box(0.14, 2.6, 0.14, 0, 1.3, s * 0.85, WOOD); P.box(0.1, 1.5, 2.0, 0, 1.8, 0, 0x6a4a2e); for (let i = 0; i < 5; i++) P.box(0.02, 0.4, 0.3, 0.07, 2.1 - (i % 2) * 0.5, -0.6 + i * 0.3, i % 2 ? 0xd8cfae : 0xc0b690, 0.2 * i); P.roof(0.5, 2.2, 0.35, 0.1, 0, 2.55, 0, 0x4a3226); return P.build(); },
  bonfire() { const P = new Parts(); for (let i = 0; i < 10; i++) { const a = (i / 10) * 6.283; P.box(0.55, 0.4, 0.5, Math.cos(a) * 1.2, 0.2, Math.sin(a) * 1.2, STONE, -a); } for (let i = 0; i < 5; i++) { const a = i * 1.26; P.box(0.12, 1.3, 0.12, Math.cos(a) * 0.3, 0.7, Math.sin(a) * 0.3, 0x2a1c12, 0, Math.sin(a) * 0.5, Math.cos(a) * 0.5); } P.flame(0, 1.2, 0, 2.2); P.flame(0.3, 0.9, 0.2, 1.4); return P.build(); },
  tower(w, d, h) {
    const P = new Parts(); for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.box(0.34, h, 0.34, sx * (w / 2 - 0.17), h / 2, sz * (d / 2 - 0.17), WOOD);
    for (const y of [h * 0.35, h * 0.7]) { P.box(w, 0.14, 0.14, 0, y, d / 2 - 0.17, DARK).box(w, 0.14, 0.14, 0, y, -d / 2 + 0.17, DARK).box(0.14, 0.14, d, w / 2 - 0.17, y, 0, DARK).box(0.14, 0.14, d, -w / 2 + 0.17, y, 0, DARK); }
    P.box(w + 0.8, 0.22, d + 0.8, 0, h, 0, 0x5a4230); for (const s of [-1, 1]) { P.box(w + 0.8, 0.8, 0.12, 0, h + 0.6, s * (d / 2 + 0.34), 0x6a4a2e).box(0.12, 0.8, d + 0.8, s * (w / 2 + 0.34), h + 0.6, 0, 0x6a4a2e); }
    P.roof(w + 0.6, d + 0.6, 1.6, 0.4, 0, h + 2.2, 0, 0x4a3226); for (const s of [-1, 1]) P.box(0.12, 1.5, 0.12, s * (w / 2 + 0.2), h + 1.5, s * (d / 2 + 0.2), WOOD);
    P.flame(w / 2 + 0.55, h + 1.1, d / 2 + 0.55, 0.8);
    return P.build();
  },
  gate(w, d, h, o) {
    const P = new Parts(), main = o.style === 'main';
    for (const s of [-1, 1]) { P.box(0.8, h, 0.9, s * (w / 2 - 0.4), h / 2, 0, 0x5a4230); P.cone(0.5, 1.0, s * (w / 2 - 0.4), h + 0.5, 0, 0x4a3a2a, 4); }
    P.box(w, 0.7, 0.9, 0, h - 0.2, 0, 0x5a4230); if (main) { P.box(w - 1.4, 0.5, 0.2, 0, h - 1.3, 0.3, 0x3a2a1c); P.box(0.7, 1.0, 0.1, 0, h + 0.7, 0.5, 0x7a1c1c); }
    for (const s of [-1, 1]) P.flame(s * (w / 2 - 0.4), h * 0.6, 0.65, 0.8);
    return P.build();
  },
  palisade(w, d, h) {
    const P = new Parts(), n = Math.max(2, Math.round(w / 0.55)), step = w / n;
    for (let i = 0; i < n; i++) { const x = -w / 2 + step * (i + 0.5), hh = h * (0.88 + ((i * 7) % 5) * 0.035); P.cyl(0.2, 0.24, hh, x, hh / 2 - 0.2, 0, i % 2 ? 0x5a4630 : 0x65503a, 6); P.cone(0.21, 0.55, x, hh + 0.05, 0, 0x4a3828, 6); }
    P.box(w, 0.18, 0.3, 0, h * 0.55, d / 2 + 0.12, 0x3a2a1c);
    return P.build();
  },
};
