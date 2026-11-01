// FOGBOUND: DOMINION client: world layer. Resource nodes (groves, mines, quarries, wells), neutral sites + extra props (WorldX.extraProps), loot/relics,
// caravans, beacons/leylines glow, fog banks, the temple beam, plus projectiles/zones/bolts (rview_proj.js).
import * as THREE from 'three';
import { InstancedRig, rigMaterials } from './models_rts.js';
import { nodeModel, propModel } from './rmodel_world.js';
import { createProjLayer } from './rview_proj.js';
import * as WorldX from './world_x.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const NEUTRAL_TINT = [0.82, 0.8, 0.74];

export function createWorldLayer(ctx) {
  const { scene, st, world, wv } = ctx, mats = rigMaterials();
  const nodeRigs = new Map(), propRigs = new Map(), proj = createProjLayer(ctx);
  let props = [], propSig = '', propT = 99;
  const rigFor = (map, key, make) => { let e = map.get(key); if (!e) { const m = make(); e = { m, rig: new InstancedRig(scene, m.geo, mats.bld, 16) }; map.set(key, e); } return e; };
  // temple beam
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.4, 400, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xcffff0, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
  beam.visible = false; beam.renderOrder = 6; scene.add(beam);
  const beamCore = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.2, 400, 12, 1, true), beam.material.clone()); beamCore.material.opacity = 0.8; beamCore.visible = false; beamCore.renderOrder = 6; scene.add(beamCore);
  const caravanPrev = new Map();

  function refreshProps(dt) {
    propT += dt; if (propT < 1.5) return; propT = 0;
    let sig = st.neutral.length + ':'; for (const n of st.neutral) sig += (n.state ? n.state[0] : '') + (n.burn ? 1 : 0) + (n.revealed ? 1 : 0) + (n.relic ? 1 : 0) + '|';
    if (sig === propSig) return; propSig = sig;
    try { props = WorldX.extraProps(st) || []; } catch (e) { props = []; }
  }
  const hash = (id) => { let x = Math.imul(id * 2654435761 | 0, 0x9e3779b1) >>> 0; return (x >>> 8) / 16777216; };

  function update(dt, t, alpha, view) {
    refreshProps(dt);
    for (const e of nodeRigs.values()) e.rig.begin(); for (const e of propRigs.values()) e.rig.begin();
    const near = ctx.camDist < 120, fog = ctx.fog;
    // ---- resource nodes
    for (const n of st.nodes) {
      if (n.kind === 'node' || n.rtype) { /* ok */ } else continue;
      if (n.rtype === 'farm' || n.rtype === 'herd' && !(n.amount > 0)) continue;
      if (!fog.explored(n.x, n.z) || !ctx.inView(n.x, world.heightAt(n.x, n.z) + 2, n.z, (n.r || 4) + 5)) continue;
      const r = Math.round((n.r || 4) * 2) / 2, e = rigFor(nodeRigs, `${n.rtype}|${/cursed/i.test(n.name) ? 'c' : ''}|${r}`, () => nodeModel(n.rtype, n.name, r));
      const f = n.infinite || !(n.max > 0) ? 1 : Math.max(0, Math.min(1, n.amount / n.max)), sc = n.rtype === 'tree' ? 0.5 + 0.5 * f : n.rtype === 'mine' || n.rtype === 'quarry' ? 0.75 + 0.25 * f : 1;
      const gy = world.heightAt(n.x, n.z);
      _q.setFromAxisAngle(_up, hash(n.id) * 6.283); _p.set(n.x, gy - 0.05, n.z); _s.set(sc, sc, sc); _m.compose(_p, _q, _s);
      const i = e.rig.next(); e.rig.set(i, _m, 0, 0, 0, 0, NEUTRAL_TINT[0], NEUTRAL_TINT[1], NEUTRAL_TINT[2], 0);
      if (near && fog.visible(n.x, n.z) && e.m.emit) { const c = Math.cos(hash(n.id) * 6.283), s = Math.sin(hash(n.id) * 6.283); for (const em of e.m.emit) ctx.fx.emitter(em.kind, n.x + em.x * c - em.z * s, gy + em.y * sc, n.z + em.x * s + em.z * c, em.size, em.col, dt, n.id); }
    }
    // ---- extra props (huts, tents, pillars, altars...)
    for (let k = 0; k < props.length; k++) {
      const p = props[k];
      if (!ctx.inView(p.x, world.heightAt(p.x, p.z) + 2, p.z, 7 * (p.s || 1)) || !fog.explored(p.x, p.z)) continue;
      const e = rigFor(propRigs, p.t, () => propModel(p.t)), gy = world.heightAt(p.x, p.z), site = p.site ? st.byId.get(p.site) : null;
      const col = site && site.owner >= 0 ? ctx.teamCol[site.owner] : null, s = p.s || 1;
      _q.setFromAxisAngle(_up, p.r || 0); _p.set(p.x, gy - 0.05, p.z); _s.set(s, s, s); _m.compose(_p, _q, _s);
      const i = e.rig.next(); e.rig.set(i, _m, 0, 0, 0, 0, col ? col.r : NEUTRAL_TINT[0], col ? col.g : NEUTRAL_TINT[1], col ? col.b : NEUTRAL_TINT[2], 0);
      if (near && e.m.emit && e.m.emit.length && fog.visible(p.x, p.z)) { const c = Math.cos(p.r || 0), sn = Math.sin(p.r || 0); for (const em of e.m.emit) ctx.fx.emitter(em.kind, p.x + (em.x * c - em.z * sn) * s, gy + em.y * s, p.z + (em.x * sn + em.z * c) * s, em.size * s, em.col, dt, k); }
    }
    // ---- neutral sites: dynamic parts (loot piles, relics, caravans, temple, beacons, ley lines, fog banks)
    let temple = null;
    for (const n of st.neutral) {
      const vis = fog.visible(n.x, n.z), exp = fog.explored(n.x, n.z);
      if (n.kind === 'temple') temple = n;
      if (!exp || !ctx.inView(n.x, 0, n.z, (n.r || 6) + 6)) continue;
      const gy = world.heightAt(n.x, n.z);
      if (n.kind === 'pickup' || n.kind === 'caravan' || n.kind === 'temple') {
        const key = n.kind === 'temple' ? 'temple' : n.kind === 'caravan' ? 'wagon' : n.relic ? 'relic' : 'loot', e = rigFor(propRigs, key, () => propModel(key));
        let rot = hash(n.id) * 6.283;
        if (n.kind === 'caravan') { const pv = caravanPrev.get(n.id); if (pv) { const dx = n.x - pv.x, dz = n.z - pv.z; if (dx * dx + dz * dz > 1e-4) pv.rot = Math.atan2(dz, dx); rot = pv.rot; pv.x = n.x; pv.z = n.z; } else caravanPrev.set(n.id, { x: n.x, z: n.z, rot: 0 }); if (!vis) continue; }
        if (n.kind === 'caravan' && n.hidden) continue;
        _q.setFromAxisAngle(_up, -rot); _p.set(n.x, gy - 0.05, n.z); _s.set(1, 1, 1); _m.compose(_p, _q, _s);
        const tc = n.kind === 'temple' && st.temple && st.temple.holder >= 0 ? ctx.teamCol[st.temple.holder] : n.owner >= 0 ? ctx.teamCol[n.owner] : null;
        const i = e.rig.next(); e.rig.set(i, _m, 0, 0, 0, 0, tc ? tc.r : 0.85, tc ? tc.g : 0.85, tc ? tc.b : 0.8, 0);
        if (near && vis && e.m.emit) for (const em of e.m.emit) ctx.fx.emitter(em.kind, n.x + em.x, gy + em.y, n.z + em.z, em.size, em.col, dt, n.id);
      } else if (n.kind === 'beacon' && n.owner >= 0 && vis) { ctx.fx.emitter('fire', n.x, gy + 4.9, n.z, 2.2, ctx.teamHex[n.owner], dt, n.id); ctx.fx.emitter('glow', n.x, gy + 5.2, n.z, 3, ctx.teamHex[n.owner], dt, n.id); }
      else if (n.kind === 'leyline' && vis) { ctx.fx.emitter('glow', n.x, gy + 2.6, n.z, n.owner >= 0 ? 3.4 : 2, n.owner >= 0 ? ctx.teamHex[n.owner] : 0x6fa8ff, dt, n.id); }
      else if (n.kind === 'fogbank' && vis && Math.random() < dt * 3) { const a = Math.random() * 6.283, d = Math.sqrt(Math.random()) * (n.r || 14); ctx.fx.spawnSmoke(n.x + Math.cos(a) * d, gy + 1 + Math.random() * 1.5, n.z + Math.sin(a) * d, 0.5, 0.05, 0.2, 5, 7, 0xaab4bc, 0, 0.07, 0.8); }
      else if (n.kind === 'camp' && vis && near) ctx.fx.emitter('fire', n.x, gy + 0.3, n.z, 1.0, 0xff8030, dt, n.id);
      else if (n.kind === 'village' && vis && (n.burn || n.state === 'burned')) ctx.fx.emitter('smoke', n.x + (hash(n.id) - 0.5) * 6, gy + 1.5, n.z, 2.2, 0x2a2a2a, dt, n.id);
    }
    for (const e of nodeRigs.values()) e.rig.end(); for (const e of propRigs.values()) e.rig.end();
    // temple beam
    const T = st.temple, on = !!(T && T.beam && temple);
    beam.visible = beamCore.visible = on;
    if (on) {
      const pulse = 0.85 + 0.15 * Math.sin(t * 2.2), c = T.holder >= 0 ? ctx.teamHex[T.holder] : 0xcffff0;
      beam.position.set(temple.x, world.heightAt(temple.x, temple.z) + 200, temple.z); beamCore.position.copy(beam.position);
      beam.material.color.setHex(c); beamCore.material.color.setHex(c); beam.material.opacity = 0.36 * pulse; beamCore.material.opacity = 0.7 * pulse; beam.rotation.y = t * 0.3;
      if (Math.random() < dt * 14) ctx.fx.spawnGlow(temple.x + (Math.random() - 0.5) * 5, world.heightAt(temple.x, temple.z) + 2, temple.z + (Math.random() - 0.5) * 5, 0, 8 + Math.random() * 6, 0, 3, 0.7, c, 0, 0.9);
    }
    proj.update(dt, t);
  }
  function onEvent(e) { proj.onEvent(e); }
  return { update, onEvent, proj, get props() { return props; } };
}
