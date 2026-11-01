// v3 client module "dungeons_view" (WORLD CONTENT lane): scene objects for st.dungeons (and, via pois_view.js, st.pois). See src/V3.md.
// Each dungeon is a broken stone ring with a glowing entrance gate and themed props, merged into ONE static mesh (plus a few additive glow sprites).
// State read from the sim: d.state 'locked'|'open'|'cleared'. Only complexes near the camera are shown / animated.
import { lambert, glowSpriteMat, mergeColored } from './models.js';
import { DUNGEON } from './data.js';
import { createPoisView } from './pois_view.js';

const TAU = Math.PI * 2;
const SHOW_DIST = 300;

export function createView(ctx) {
  const { THREE, scene, camera, st, world } = ctx;
  const M = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
  const geos = {
    box: new THREE.BoxGeometry(1, 1, 1), cyl: new THREE.CylinderGeometry(1, 1, 1, 8), cone: new THREE.ConeGeometry(1, 1, 6), sph: new THREE.SphereGeometry(1, 7, 5),
    ring: new THREE.RingGeometry(0.985, 1, 64), disc: new THREE.CircleGeometry(1, 28), quad: new THREE.PlaneGeometry(1, 1),
  };
  const solid = lambert(0xffffff, { vc: true, flat: true });
  const rnd = (seed) => { let s = seed | 0 || 1; return () => ((s = (s * 1664525 + 1013904223) | 0) >>> 0) / 4294967296; };
  const recs = [];
  const root = new THREE.Group(); scene.add(root);

  function build(d) {
    const th = DUNGEON.themes[d.theme] || DUNGEON.themes.crypt, R = rnd(d.id * 7919), parts = [];
    const gy = (x, z) => world.heightAt(x, z);
    // part helper in world coordinates: size (w,h,d) box standing on the ground at (x,z), rotated about Y
    const box = (x, z, w, h, dd, col, ry = 0, lift = 0) => parts.push({ geo: geos.box, color: col, m: M(x, gy(x, z) + h / 2 + lift - 0.2, z, 0, ry, 0, w, h, dd) });
    const cyl = (x, z, r, h, col, tilt = 0, ry = 0) => parts.push({ geo: geos.cyl, color: col, m: M(x, gy(x, z) + h / 2 - 0.2, z, tilt, ry, 0, r, h, r) });
    const cone = (x, z, r, h, col, lift = 0) => parts.push({ geo: geos.cone, color: col, m: M(x, gy(x, z) + h / 2 + lift - 0.2, z, 0, 0, 0, r, h, r) });
    const blob = (x, z, r, col, sy = 0.6) => parts.push({ geo: geos.sph, color: col, m: M(x, gy(x, z) + r * sy * 0.5, z, 0, 0, 0, r, r * sy, r) });
    const stone = [0x5d6064, 0x686b6e, 0x54575b, 0x70726f];
    const sc = () => stone[Math.floor(R() * stone.length)];
    // entrance faces the island centre
    const ea = Math.atan2(-d.z, -d.x);
    // broken ring wall
    const nSeg = 12 + d.tier * 4;
    for (let i = 0; i < nSeg; i++) {
      const a = (i / nSeg) * TAU;
      let da = Math.abs(((a - ea + Math.PI * 3) % TAU) - Math.PI); da = Math.PI - da; // angular distance to the entrance
      if (da < 0.34) continue;                    // gap for the gate
      if (R() < 0.22) continue;                   // ruined gaps
      const x = d.x + Math.cos(a) * d.r, z = d.z + Math.sin(a) * d.r, h = 1.4 + R() * (2.6 + d.tier * 0.5);
      box(x, z, 4.6 * (0.8 + R() * 0.35), h, 1.4, sc(), a + Math.PI / 2);
      if (R() < 0.35) box(x + (R() - 0.5) * 3, z + (R() - 0.5) * 3, 1.0, 0.6 + R() * 0.8, 1.0, sc(), R() * 3, 0); // fallen block
    }
    // gate: two pillars, lintel, steps
    const gx = d.x + Math.cos(ea) * d.r, gz = d.z + Math.sin(ea) * d.r, tx = -Math.sin(ea), tz = Math.cos(ea);
    for (const s of [-1, 1]) { const px = gx + tx * 2.6 * s, pz = gz + tz * 2.6 * s; cyl(px, pz, 0.85, 6.5 + d.tier * 0.6, 0x6a6d70); cone(px, pz, 0.7, 1.4, 0x474a4d, 6.5 + d.tier * 0.6); }
    parts.push({ geo: geos.box, color: 0x595c60, m: M(gx, gy(gx, gz) + 6.2 + d.tier * 0.6, gz, 0, -ea, 0, 1.2, 0.9, 6.4) });
    box(gx - Math.cos(ea) * 1.6, gz - Math.sin(ea) * 1.6, 1.8, 0.3, 5.4, 0x4a4d50, -ea);
    // central dais where the guardian lairs
    parts.push({ geo: geos.cyl, color: 0x4b4e52, m: M(d.x, gy(d.x, d.z) + 0.1, d.z, 0, 0, 0, 6.5, 0.5, 6.5) });
    // themed props
    const prop = {
      crypt() {
        for (let i = 0; i < 12; i++) { const a = R() * TAU, r = 5 + R() * (d.r - 7); box(d.x + Math.cos(a) * r, d.z + Math.sin(a) * r, 0.9, 1.1 + R() * 0.8, 0.28, 0x8a8d88, R() * 0.8 - 0.4 + a, 0); }
        for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.8; cyl(d.x + Math.cos(a) * 9, d.z + Math.sin(a) * 9, 0.38, 4.6, 0x35433a); }
        for (let i = 0; i < 6; i++) { const a = R() * TAU, r = 3 + R() * 6; blob(d.x + Math.cos(a) * r, d.z + Math.sin(a) * r, 0.5 + R() * 0.5, 0xd9d4c0, 0.7); }
      },
      sunken() {
        for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU + R() * 0.3, r = d.r * 0.55; cyl(d.x + Math.cos(a) * r, d.z + Math.sin(a) * r, 0.9 + R() * 0.3, 4.5 + R() * 3, 0x587078, (R() - 0.5) * 0.3, 0); }
        for (let i = 0; i < 5; i++) { const a = R() * TAU, r = 4 + R() * 12; blob(d.x + Math.cos(a) * r, d.z + Math.sin(a) * r, 1.0 + R() * 1.2, 0x3a5a52, 0.5); }
        for (let i = 0; i < 3; i++) { const a = R() * TAU, r = d.r * 0.4; cone(d.x + Math.cos(a) * r, d.z + Math.sin(a) * r, 0.8, 3 + R() * 2, 0x4e6b70); }
      },
      forge() {
        for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.78, x = d.x + Math.cos(a) * 8.5, z = d.z + Math.sin(a) * 8.5; cyl(x, z, 0.5, 1.6, 0x3a3836); cyl(x, z, 0.85, 0.35, 0x55504a, 0, 0); parts.push({ geo: geos.cyl, color: 0x3a3836, m: M(x, gy(x, z) + 1.7, z, 0, 0, 0, 0.9, 0.3, 0.9) }); }
        box(d.x + 3, d.z - 7, 2.4, 1.0, 1.2, 0x2f2d2c); box(d.x + 3, d.z - 7, 1.4, 0.35, 0.7, 0x4a4743, 0, 1.0);
        cyl(d.x - 9, d.z + 3, 1.3, 9, 0x3d3a37); cyl(d.x - 9, d.z + 3, 1.6, 0.6, 0x2a2827, 0, 0);
        for (let i = 0; i < 8; i++) { const a = R() * TAU, r = 4 + R() * 10; box(d.x + Math.cos(a) * r, d.z + Math.sin(a) * r, 1.2, 0.5, 0.7, 0x3a3735, R() * 3); }
      },
      warren() {
        for (let i = 0; i < 8; i++) { const a = R() * TAU, r = 5 + R() * (d.r - 7); blob(d.x + Math.cos(a) * r, d.z + Math.sin(a) * r, 1.6 + R() * 1.4, 0x3b3128, 0.55); }
        for (let i = 0; i < 10; i++) { const a = R() * TAU, r = 3 + R() * 10; blob(d.x + Math.cos(a) * r, d.z + Math.sin(a) * r, 0.35 + R() * 0.4, 0xd6cfb4, 0.7); }
        for (let i = 0; i < 5; i++) { const a = R() * TAU, r = 6 + R() * 8; cone(d.x + Math.cos(a) * r, d.z + Math.sin(a) * r, 0.3, 2 + R() * 1.4, 0xe3dcc0); }
      },
    };
    (prop[d.theme] || prop.crypt)();
    const mesh = new THREE.Mesh(mergeColored(parts), solid);
    const g = new THREE.Group(); g.add(mesh);
    // dynamic bits
    const glow = [];
    const addGlow = (x, y, z, col, s, op = 0.9) => { const sp = new THREE.Sprite(glowSpriteMat(col, op)); sp.position.set(x, y, z); sp.scale.set(s, s, 1); g.add(sp); glow.push({ sp, s, ph: R() * 6 }); return sp; };
    // entrance portal
    const portal = new THREE.Mesh(geos.quad, new THREE.MeshBasicMaterial({ color: th.glow, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    portal.position.set(gx, gy(gx, gz) + 2.8 + d.tier * 0.3, gz); portal.rotation.y = -ea + Math.PI / 2; portal.scale.set(5, 5.4 + d.tier * 0.6, 1); g.add(portal);
    addGlow(gx, gy(gx, gz) + 3, gz, th.glow, 11);
    // themed fire / light
    const fl = d.theme === 'forge' ? 0xff7a28 : d.theme === 'warren' ? 0xc8a050 : th.glow;
    const nF = d.theme === 'crypt' ? 4 : d.theme === 'forge' ? 4 : 3;
    for (let i = 0; i < nF; i++) {
      const a = (i / nF) * TAU + (d.theme === 'crypt' ? 0.8 : 0.78), rr = d.theme === 'forge' ? 8.5 : d.theme === 'crypt' ? 9 : d.r * 0.55;
      const x = d.x + Math.cos(a) * rr, z = d.z + Math.sin(a) * rr;
      addGlow(x, gy(x, z) + (d.theme === 'crypt' ? 5 : d.theme === 'forge' ? 2.3 : 3.6), z, fl, 4.2, 0.85);
    }
    if (d.theme === 'sunken') {
      const w = new THREE.Mesh(geos.disc, new THREE.MeshBasicMaterial({ color: 0x2f8f88, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
      w.rotation.x = -Math.PI / 2; w.position.set(d.x, gy(d.x, d.z) + 0.65, d.z); w.scale.setScalar(6.2); g.add(w);
    }
    // ground ring in the state colour (grey locked, amber open, owner colour when cleared)
    const ringM = new THREE.MeshBasicMaterial({ color: 0x88868a, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false });
    const ring = new THREE.Mesh(geos.ring, ringM); ring.rotation.x = -Math.PI / 2; ring.position.set(d.x, gy(d.x, d.z) + 0.45, d.z); ring.scale.setScalar(d.r + 1); g.add(ring);
    root.add(g);
    return { d, g, glow, portal, ringM, state: '', th };
  }

  for (const d of st.dungeons || []) recs.push(build(d));

  function recolor(r) {
    const d = r.d;
    const cleared = d.state === 'cleared', open = d.state === 'open';
    r.ringM.color.setHex(cleared ? (d.by >= 0 && st.teams[d.by] ? st.teams[d.by].f.color : 0x66705f) : open ? 0xe0a030 : 0x88868a);
    r.ringM.opacity = cleared ? 0.55 : open ? 0.45 : 0.3;
    r.portal.visible = !cleared;
    r.state = d.state;
  }

  // pois live in their own module but share this view
  const pois = createPoisView(ctx);

  return {
    frame(st2, alpha, dt) {
      const t = performance.now() / 1000, cx = camera.position.x, cz = camera.position.z;
      for (const r of recs) {
        const d = r.d, near = Math.hypot(d.x - cx, d.z - cz) < SHOW_DIST;
        r.g.visible = near;
        if (!near) continue;
        if (r.state !== d.state) recolor(r);
        const cleared = d.state === 'cleared', open = d.state === 'open';
        for (const o of r.glow) {
          o.sp.visible = !cleared;
          const k = 0.8 + 0.2 * Math.sin(t * (2 + o.ph * 0.2) + o.ph);
          o.sp.scale.set(o.s * k * (open ? 1.15 : 0.9), o.s * k * (open ? 1.15 : 0.9), 1);
        }
        if (!cleared) r.portal.material.opacity = (open ? 0.5 : 0.3) + 0.12 * Math.sin(t * 2.4 + d.id);
      }
      if (pois) pois.frame(st2, alpha, dt);
    },
    handleEvents(events) {
      for (const e of events) {
        if (e.type === 'dungeonCleared') {
          const d = recs.find((r) => r.d.id === e.id);
          const col = e.team >= 0 && st.teams[e.team] ? st.teams[e.team].f.color : 0xffe9a0;
          if (d) { ctx.ringFx(e.x, e.z, d.d.r * 1.15, col, 1.6, 0.5, 1.5); if (ctx.wv && ctx.wv.beamFx) ctx.wv.beamFx(e.x, e.z, col, 2.2, 2.2, 55); }
        }
      }
      if (pois) pois.handleEvents(events);
    },
    dispose() { scene.remove(root); if (pois && pois.dispose) pois.dispose(); },
  };
}
export function createUi(ctx) { return null; }
