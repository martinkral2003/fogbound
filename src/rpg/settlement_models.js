// FOGBOUND: HERO settlement view (Harrowmere): meshes for st.settlement.buildings, lit windows, torch / bonfire glow, chimney smoke.
import * as THREE from 'three';
import { glowSpriteMat, mergeColored } from '../models.js';
import { BUILD } from './settlement_parts.js';

const SHOW = 170;
export function createSettlementView(wv, st) {
  const { scene } = wv, world = st.world, S = st.settlement;
  const recs = [], flames = [], smokers = [];
  const bodyMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
  const winMat = new THREE.MeshBasicMaterial({ color: 0xffc070, side: THREE.DoubleSide, fog: true });
  const glowCache = glowSpriteMat(0xff9030, 0.95);
  const winPlane = new THREE.PlaneGeometry(1, 1);
  let bonfireLight = null, tavernLight = null, built = false;

  function build() {
    built = true;
    if (!S || !S.buildings) return;
    S.buildings.forEach((b, i) => {
      const fn = BUILD[b.type]; if (!fn) return;
      const out = fn(b.w, b.d, b.h, { style: b.style, seed: i });
      const g = new THREE.Group(), mesh = new THREE.Mesh(out.geo, bodyMat); g.add(mesh);
      if (out.windows.length) {
        const parts = out.windows.map((w) => { const m = new THREE.Matrix4().compose(new THREE.Vector3(w.x, w.y, w.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, w.ry, 0)), new THREE.Vector3(w.w, w.h, 1)); return { geo: winPlane, color: 0xffffff, m }; });
        const wg = mergeColored(parts); wg.deleteAttribute('normal'); g.add(new THREE.Mesh(wg, winMat));
      }
      const y0 = Math.min(world.heightAt(b.x, b.z), world.heightAt(b.x + b.w / 3, b.z), world.heightAt(b.x - b.w / 3, b.z));
      g.position.set(b.x, b.type === 'palisade' || b.type === 'gate' || b.type === 'tower' ? world.heightAt(b.x, b.z) : y0, b.z); g.rotation.y = -(b.rot || 0);
      for (const f of out.flames) { const s = new THREE.Sprite(glowCache); s.position.set(f.x, f.y, f.z); s.scale.set(0.9 * f.s * 1.4, 1.2 * f.s * 1.4, 1); s.userData = { s: f.s, ph: Math.random() * 6 }; g.add(s); flames.push({ s, g }); }
      for (const f of out.smoke) smokers.push({ g, x: f.x, y: f.y, z: f.z, b });
      scene.add(g); recs.push({ g, b });
      if (b.type === 'bonfire') { bonfireLight = new THREE.PointLight(0xff9a40, 3.2, 34, 1.5); bonfireLight.position.set(b.x, g.position.y + 2.2, b.z); scene.add(bonfireLight); }
      if (b.type === 'tavern') { tavernLight = new THREE.PointLight(0xffb060, 1.4, 16, 1.6); tavernLight.position.set(b.x - Math.sin(b.rot || 0) * (b.d / 2 + 1.2), g.position.y + 2.6, b.z + Math.cos(b.rot || 0) * (b.d / 2 + 1.2)); scene.add(tavernLight); }
    });
  }
  function update(dt, now, px, pz) {
    if (!built && S) build();
    if (!S) return;
    const dS = Math.hypot(px - S.x, pz - S.z), near = dS < SHOW + 30;
    for (const r of recs) r.g.visible = near && Math.hypot(r.b.x - px, r.b.z - pz) < SHOW;
    if (!near) { if (bonfireLight) bonfireLight.intensity = 0; if (tavernLight) tavernLight.intensity = 0; return; }
    const lit = Math.min(1, 0.35 + wv.night * 0.9 + (wv.dreadMix || 0) * 0.3);
    winMat.color.setRGB(0.5 + 0.5 * lit, 0.36 + 0.34 * lit, 0.16 + 0.14 * lit).multiplyScalar(0.55 + lit * 0.7);
    const fk = Math.max(0, 1 - dS / 160);
    if (bonfireLight) bonfireLight.intensity = (2.6 + Math.sin(now * 13) * 0.35 + Math.sin(now * 31) * 0.2) * fk * (0.9 + wv.night * 0.5);
    if (tavernLight) tavernLight.intensity = (1.2 + Math.sin(now * 9 + 1) * 0.15) * fk * (0.6 + wv.night * 0.9);
    for (const f of flames) {
      if (!f.g.visible) continue;
      const u = f.s.userData, k = 1 + Math.sin(now * 14 + u.ph) * 0.1 + Math.sin(now * 23 + u.ph * 2) * 0.07;
      f.s.scale.set(1.26 * u.s * k, 1.68 * u.s * k * (1 + Math.sin(now * 9 + u.ph) * 0.1), 1);
    }
    // chimney smoke + bonfire embers
    for (const s of smokers) {
      if (!s.g.visible || Math.hypot(s.b.x - px, s.b.z - pz) > 70 || Math.random() > dt * 2.2) continue;
      const c = Math.cos(-(s.b.rot || 0)), sn = Math.sin(-(s.b.rot || 0)), wx = s.b.x + s.x * c + s.z * sn, wz = s.b.z - s.x * sn + s.z * c;
      wv.spawn(wv.smokeP, wx, s.g.position.y + s.y, wz, 0.25 + Math.random() * 0.3, 1.0 + Math.random() * 0.6, 0.1, 3.5, 0.9, 0x6a6a6a, -0.05, 0.35);
    }
    if (S.bonfire && dS < 100 && Math.random() < dt * 25) { const a = Math.random() * 6.28; wv.spawn(wv.glowP, S.bonfire.x + Math.cos(a) * 0.5, world.heightAt(S.bonfire.x, S.bonfire.z) + 1.3, S.bonfire.z + Math.sin(a) * 0.5, (Math.random() - 0.5) * 0.8, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 0.8, 1.6, 0.25, 0xffa040, 0, 0.9); }
  }
  return { update, recs };
}
