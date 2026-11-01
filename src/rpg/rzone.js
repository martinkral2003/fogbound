// FOGBOUND: HERO the Dread Fog zone. A glowing ground ring + a faint wall of red mist at st.zone.r, a dashed ring at the next circle,
// and fogState(px,pz) which tells the world view how red/thick the fog is for the viewer (it ramps as you cross the edge).
import * as THREE from 'three';
import { clamp, TAU } from '../util.js';
import { softTexture } from '../models.js';

const SEG = 192;
function gradTex() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 128, 0, 0);
  g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.18, 'rgba(255,255,255,0.55)'); g.addColorStop(0.6, 'rgba(255,255,255,0.18)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 128);
  x.globalCompositeOperation = 'destination-in';
  const h = x.createLinearGradient(0, 0, 64, 0); h.addColorStop(0, 'rgba(255,255,255,0.35)'); h.addColorStop(0.4, 'rgba(255,255,255,1)'); h.addColorStop(0.6, 'rgba(255,255,255,0.5)'); h.addColorStop(1, 'rgba(255,255,255,0.35)');
  x.fillStyle = h; x.fillRect(0, 0, 64, 128);
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.repeat.set(36, 1);
  return t;
}

export function createZoneView(wv, st) {
  const { scene } = wv, world = st.world;
  const tex = gradTex();
  // wall: two rows of SEG+1 vertices, rebuilt when the radius changes
  const wallGeo = new THREE.BufferGeometry();
  const pos = new Float32Array((SEG + 1) * 2 * 3), uv = new Float32Array((SEG + 1) * 2 * 2), idx = [];
  for (let i = 0; i <= SEG; i++) { uv.set([i / SEG, 0, i / SEG, 1], i * 4); }
  for (let i = 0; i < SEG; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  wallGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); wallGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); wallGeo.setIndex(idx);
  const wallMat = new THREE.MeshBasicMaterial({ map: tex, color: 0xc02a30, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const wall = new THREE.Mesh(wallGeo, wallMat); wall.frustumCulled = false; wall.renderOrder = 3; scene.add(wall);
  // ground ring: a chain of glow points hugging the terrain
  const NP = 320, ringPos = new Float32Array(NP * 3), nextPos = new Float32Array(NP * 3);
  const mkPts = (arr, color, size, op) => {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const m = new THREE.PointsMaterial({ map: softTexture(), color, size, sizeAttenuation: true, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const p = new THREE.Points(g, m); p.frustumCulled = false; p.renderOrder = 4; scene.add(p); return p;
  };
  const ring = mkPts(ringPos, 0xff4a30, 2.4, 0.9), next = mkPts(nextPos, 0xfff0c0, 1.3, 0.55);
  let lastR = -1, lastC = '', lastNR = -1, pulse = 0;
  function build(r, cx, cz, arr, geo, lift, top) {
    for (let i = 0; i < NP; i++) { const a = (i / NP) * TAU, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r; arr.set([x, Math.max(0.2, world.heightAt(x, z)) + lift, z], i * 3); }
    geo.attributes.position.needsUpdate = true;
  }
  function buildWall(r, cx, cz) {
    for (let i = 0; i <= SEG; i++) {
      const a = (i / SEG) * TAU, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r, y = Math.max(0, world.heightAt(x, z));
      pos.set([x, y - 3, z, x, y + 46, z], i * 6);
    }
    wallGeo.attributes.position.needsUpdate = true;
  }
  const _fs = { tint: { color: 0x5a0e12, amt: 0 }, density: 1, mist: 1, amt: 0 };
  function fogState(px, pz) {
    const z = st.zone; if (!z) { _fs.amt = 0; _fs.tint.amt = 0; _fs.density = 1; _fs.mist = 1; return _fs; }
    const d = Math.hypot(px - z.cx, pz - z.cz), out = clamp((d - z.r) / 14, 0, 1), pre = clamp(1 - (z.r - d) / 45, 0, 1) * (d < z.r ? 1 : 0);
    _fs.amt = out; _fs.tint.amt = out * 0.9 + pre * 0.1; _fs.density = 1 + out * 2.4 + pre * 0.25; _fs.mist = 1 + out * 1.4 + pre * 0.4;
    return _fs;
  }
  function update(dt, now, px, pz, camera) {
    const z = st.zone; if (!z) { wall.visible = ring.visible = next.visible = false; return; }
    wall.visible = ring.visible = true;
    if (Math.abs(z.r - lastR) > 0.25 || lastC !== z.cx + ',' + z.cz) {
      lastR = z.r; lastC = z.cx + ',' + z.cz; build(z.r, z.cx, z.cz, ringPos, ring.geometry, 0.5); buildWall(z.r, z.cx, z.cz);
    }
    const tr = z.toR !== undefined ? z.toR : z.r;
    next.visible = tr < z.r - 1 && z.state !== 'shrinking';
    if (next.visible && Math.abs(tr - lastNR) > 0.25) { lastNR = tr; build(tr, z.cx, z.cz, nextPos, next.geometry, 0.4); }
    tex.offset.x = now * 0.02; tex.offset.y = 0;
    pulse = Math.max(0, pulse - dt);
    const near = clamp(1 - Math.abs(Math.hypot(px - z.cx, pz - z.cz) - z.r) / 90, 0, 1);
    wallMat.opacity = 0.34 + 0.12 * Math.sin(now * 1.3) + near * 0.25 + pulse * 0.3;
    ring.material.opacity = 0.65 + 0.25 * Math.sin(now * 2.1) + pulse * 0.2; ring.material.size = 2.1 + 0.6 * Math.sin(now * 2.7) + pulse;
    // embers drifting off the edge when you are near it
    if (near > 0.15 && Math.random() < dt * 40 * near) {
      const a = Math.atan2(pz - z.cz, px - z.cx) + (Math.random() - 0.5) * 0.5, x = z.cx + Math.cos(a) * z.r, zz = z.cz + Math.sin(a) * z.r;
      wv.spawn(wv.glowP, x + (Math.random() - 0.5) * 3, world.heightAt(x, zz) + 0.5, zz + (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 0.5, 2 + Math.random() * 3, (Math.random() - 0.5) * 0.5, 1.6, 0.9, 0xff5030, 0, 0.8);
    }
  }
  function handleEvents(events) { for (const e of events) if (e.type === 'zone') pulse = 2.5; }
  return { update, handleEvents, fogState, wall, ring };
}
