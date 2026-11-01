// FOGBOUND: HERO world objects: containers (chest, crate, corpse, shrine, lore stone), ground items with rarity beams, offering beams.
import * as THREE from 'three';
import * as MD from '../models.js';
import { box, cyl, sph, mat, mk } from './chars_body.js';
import { makeWeapon, RARITY_COL } from './chars_weapons.js';

const SHOW = 85;
const beamTex = (() => {
  let t = null;
  return () => {
    if (t) return t;
    const c = document.createElement('canvas'); c.width = 32; c.height = 128; const x = c.getContext('2d');
    let g = x.createLinearGradient(0, 0, 32, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 32, 128); x.globalCompositeOperation = 'destination-in';
    g = x.createLinearGradient(0, 0, 0, 128); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.6, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,1)');
    x.fillStyle = g; x.fillRect(0, 0, 32, 128); t = new THREE.CanvasTexture(c); return t;
  };
})();
const BEAM_H = [1.6, 3, 4.5, 6.5, 9], BEAM_W = [0.45, 0.6, 0.7, 0.85, 1.0], BEAM_OP = [0.25, 0.45, 0.55, 0.7, 0.85];
const bGeo = new THREE.PlaneGeometry(1, 1); bGeo.translate(0, 0.5, 0);
const dGeo = new THREE.PlaneGeometry(1, 1); dGeo.rotateX(-Math.PI / 2);
const bMats = [], dMats = [];

function beamFor(rar, h = 0, w = 0) {
  const col = RARITY_COL[rar];
  const bm = bMats[rar] ||= new THREE.MeshBasicMaterial({ map: beamTex(), color: col, transparent: true, opacity: BEAM_OP[rar], blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const dm = dMats[rar] ||= new THREE.MeshBasicMaterial({ map: MD.softTexture(), color: col, transparent: true, opacity: 0.5 + rar * 0.08, blending: THREE.AdditiveBlending, depthWrite: false });
  const g = new THREE.Group(), beam = new THREE.Group();
  const a = new THREE.Mesh(bGeo, bm), b = new THREE.Mesh(bGeo, bm); b.rotation.y = Math.PI / 2; beam.add(a, b);
  beam.scale.set(w || BEAM_W[rar], h || BEAM_H[rar], w || BEAM_W[rar]);
  const disc = new THREE.Mesh(dGeo, dm); disc.scale.setScalar(1.6 + rar * 0.4); g.add(beam, disc);
  return { g, beam, disc, rar };
}

function chestModel(c) {
  const g = new THREE.Group(), t = c.tier || 1, wood = mat(t >= 3 ? 0x4a3020 : 0x6a4a2a), band = mat(t >= 3 ? 0xc8a040 : t === 2 ? 0x7a7e84 : 0x4a3a28);
  mk(box(1.0, 0.5, 0.64, 0, 0.25, 0), wood, 0, 0, 0, g);
  const lid = new THREE.Group(); lid.position.set(0, 0.5, -0.32); g.add(lid);
  mk(cyl(0.32, 0.32, 1.0, 8, 0), wood, 0, 0, 0.32, lid).rotation.z = Math.PI / 2;
  mk(box(1.04, 0.1, 0.68, 0, 0.2, 0), band, 0, 0, 0, g); mk(box(0.1, 0.62, 0.7, 0.35, 0.3, 0), band, 0, 0, 0, g); mk(box(0.1, 0.62, 0.7, -0.35, 0.3, 0), band, 0, 0, 0, g);
  if (c.locked) mk(box(0.1, 0.14, 0.06, 0, 0.5, 0.35), mat(0xe8c860, { emissive: 0xa08020 }), 0, 0, 0, g);
  const rar = Math.min(4, t + 1), bm = beamFor(Math.min(4, t), 3 + t * 1.2, 0.5); g.add(bm.g);
  g.userData = { lid, beam: bm, rar };
  return g;
}
function crateModel(c) {
  const g = new THREE.Group(), w = mat(0x7a5a38), b = mat(0x4a3622), offering = /offering/i.test(c.name || '');
  mk(box(0.9, 0.8, 0.9, 0, 0.4, 0), w, 0, 0, 0, g);
  for (const s of [-1, 1]) mk(box(0.96, 0.08, 0.1, 0, 0.7, 0.4 * s), b, 0, 0, 0, g);
  mk(box(0.1, 0.84, 0.96, 0.4, 0.4, 0), b, 0, 0, 0, g); mk(box(0.1, 0.84, 0.96, -0.4, 0.4, 0), b, 0, 0, 0, g);
  if (offering) { g.scale.setScalar(1.5); mk(box(0.5, 0.06, 0.5, 0, 0.85, 0), mat(0xd8b24a, { emissive: 0xd8b24a, ei: 0.8 }), 0, 0, 0, g); }
  const bm = beamFor(offering ? 4 : 2, offering ? 60 : 3.5, offering ? 2.2 : 0.55); g.add(bm.g); g.userData = { beam: bm, offering };
  return g;
}
function corpseModel() {
  const g = new THREE.Group();
  mk(box(1.1, 0.14, 0.5, 0, 0.07, 0), mat(0x3a302a), 0, 0, 0, g);
  const s = mk(sph(0.1, 5, 4), mat(0xbfc8d0, { emissive: 0x90a8c0, ei: 0.8 }), 0, 0.55, 0, g);
  const gl = new THREE.Sprite(MD.glowSpriteMat(0x9fc0e0, 0.8)); gl.scale.set(0.9, 0.9, 1); gl.position.y = 0.55; g.add(gl);
  g.userData = { wisp: s, glow: gl }; return g;
}
function loreModel() {
  const g = new THREE.Group();
  mk(box(0.8, 1.7, 0.35, 0, 0.85, 0), mat(0x6a7078), 0, 0, 0, g).rotation.z = 0.05;
  mk(box(0.5, 0.06, 0.02, 0.0, 1.2, 0.18), mat(0x9fd0ff, { emissive: 0x6aa8ff, ei: 1.2 }), 0, 0, 0, g);
  mk(box(0.4, 0.05, 0.02, 0.0, 0.95, 0.18), mat(0x9fd0ff, { emissive: 0x6aa8ff, ei: 1.0 }), 0, 0, 0, g);
  const gl = new THREE.Sprite(MD.glowSpriteMat(0x7ab8ff, 0.6)); gl.scale.set(2.2, 2.2, 1); gl.position.y = 1.2; g.add(gl);
  return g;
}

function itemModel(it) {
  const k = it.kind, g = new THREE.Group();
  if (it.slot === 'weapon' && k !== 'bow' && k !== 'crossbow') { const w = makeWeapon(it); w.rotation.z = Math.PI / 2; w.position.y = 0.12; w.rotation.x = 0.3; w.scale.setScalar(0.8); g.add(w); }
  else if (k === 'bow' || k === 'crossbow') { const w = makeWeapon(it); w.rotation.z = Math.PI / 2; w.rotation.x = Math.PI / 2; w.position.y = 0.1; w.scale.setScalar(0.8); g.add(w); }
  else if (k === 'potion') { mk(cyl(0.07, 0.09, 0.2, 7, 0.1), mat(it.color || 0xc03a3a, { emissive: 0x602020, ei: 0.8 }), 0, 0, 0, g); mk(cyl(0.035, 0.035, 0.08, 6, 0.24), mat(0x6a4a2a), 0, 0, 0, g); }
  else if (k === 'scroll') { mk(cyl(0.04, 0.04, 0.4, 6, 0), mat(0xe0d4a8), 0, 0.08, 0, g).rotation.z = Math.PI / 2; }
  else if (k === 'arrow' || k === 'bolt') { mk(box(0.5, 0.02, 0.02), mat(0xd8d0b0), 0, 0.05, 0, g); mk(box(0.4, 0.02, 0.02), mat(0xd8d0b0), 0, 0.05, 0.08, g); }
  else if (it.slot === 'shield' || k === 'shield') mk(cyl(0.25, 0.25, 0.05, 10, 0.04), mat(0x8a8e94), 0, 0, 0, g).rotation.x = 0.2;
  else if (it.slot) { mk(box(0.4, 0.14, 0.32, 0, 0.08, 0), mat(0x6a5a48), 0, 0, 0, g); mk(box(0.3, 0.1, 0.24, 0, 0.17, 0), mat(0x8a8070), 0, 0, 0, g); }
  else mk(box(0.22, 0.2, 0.22, 0, 0.1, 0), mat(0x7a6a50), 0, 0, 0, g);
  return g;
}

export function createObjects(wv, st) {
  const { scene } = wv, world = st.world;
  const cRecs = new Map(), iRecs = new Map();
  function contRec(c) {
    let r = cRecs.get(c.id); if (r) return r;
    let g;
    if (c.kind === 'chest') g = chestModel(c); else if (c.kind === 'crate') g = crateModel(c); else if (c.kind === 'corpse') g = corpseModel();
    else if (c.kind === 'shrine') g = MD.makeShrineModel(c.effect || (c.extra && c.extra.effect) || 'heal'); else if (c.kind === 'lore') g = loreModel(); else g = crateModel(c);
    g.position.set(c.x, world.heightAt(c.x, c.z), c.z); g.rotation.y = (c.id * 1.7) % 6.28;
    scene.add(g); r = { g, c }; cRecs.set(c.id, r); return r;
  }
  function itemRec(it) {
    let r = iRecs.get(it.id); if (r) return r;
    const rar = Math.max(0, Math.min(4, (it.item && it.item.rarity) | 0)), g = new THREE.Group(), body = itemModel(it.item || {});
    g.add(body); const bm = beamFor(rar); g.add(bm.g);
    g.position.set(it.x, world.heightAt(it.x, it.z) + 0.05, it.z); g.rotation.y = (it.id * 2.3) % 6.28;
    scene.add(g); r = { g, body, beam: bm, rar, it }; iRecs.set(it.id, r); return r;
  }
  let acc = 0;
  function update(dt, now, px, pz) {
    acc += dt;
    for (const c of st.containers) {
      const near = Math.hypot(c.x - px, c.z - pz) < SHOW;
      if (c.removed || !near) { const r = cRecs.get(c.id); if (r) { if (c.removed) { scene.remove(r.g); cRecs.delete(c.id); } else r.g.visible = false; } continue; }
      const r = contRec(c), u = r.g.userData; r.g.visible = true;
      if (c.kind === 'chest') { u.lid.rotation.x = c.opened ? -1.25 : 0; u.beam.g.visible = !c.opened; }
      else if (c.kind === 'crate') u.beam.g.visible = !c.opened;
      else if (c.kind === 'corpse') { const has = c.items && c.items.length > 0; r.g.visible = true; u.glow.visible = u.wisp.visible = has; if (has) u.wisp.position.y = 0.55 + Math.sin(now * 2 + c.id) * 0.08; }
      else if (c.kind === 'shrine') { const o = r.g.userData.orb; if (o) { o.rotation.y = now * 1.5; o.position.y = 2.5 + Math.sin(now * 2 + c.id) * 0.2; const ready = !(c.readyAt > st.t) && !(c.extra && c.extra.readyAt > st.t); o.visible = ready; } }
      const bm = u.beam; if (bm && bm.g.visible) { const p = 0.5 + 0.5 * Math.sin(now * 2.2 + c.id); bm.disc.scale.setScalar((1.6 + bm.rar * 0.4) * (0.92 + 0.16 * p)); if (u.offering && Math.random() < dt * 8) wv.spawn(wv.glowP, c.x + (Math.random() - 0.5) * 2, world.heightAt(c.x, c.z) + 0.5, c.z + (Math.random() - 0.5) * 2, 0, 3 + Math.random() * 4, 0, 1.6, 0.8, 0xd8b24a, 0, 0.9); }
    }
    const live = new Set();
    for (const it of st.groundItems) {
      live.add(it.id);
      const near = Math.hypot(it.x - px, it.z - pz) < 60;
      let r = iRecs.get(it.id);
      if (!near) { if (r) r.g.visible = false; continue; }
      if (!r) r = itemRec(it);
      r.g.visible = true; const p = 0.5 + 0.5 * Math.sin(now * 2.2 + it.id * 1.7);
      r.body.position.y = 0.12 + Math.sin(now * 2 + it.id) * 0.04; r.body.rotation.y = now * 0.8;
      r.beam.disc.scale.setScalar((1.6 + r.rar * 0.4) * (0.92 + 0.16 * p));
      if (r.rar >= 2 && Math.random() < dt * (r.rar - 1) * 1.6) wv.spawn(wv.glowP, it.x + (Math.random() - 0.5) * 0.5, world.heightAt(it.x, it.z) + 0.2, it.z + (Math.random() - 0.5) * 0.5, 0, 1 + Math.random(), 0, 1, 0.25, RARITY_COL[r.rar], 0, 0.9);
    }
    for (const [id, r] of iRecs) if (!live.has(id)) { scene.remove(r.g); iRecs.delete(id); }
  }
  function handleEvents() {}
  return { update, handleEvents, cRecs, iRecs };
}
