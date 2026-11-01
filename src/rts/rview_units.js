// FOGBOUND: DOMINION client: unit layer. One InstancedRig per unit model (animated in the vertex shader), blob shadows, cargo, rank pips.
import * as THREE from 'three';
import { InstancedRig, rigMaterials, Rig } from './models_rts.js';
import { unitModel } from './rmodel_units.js';
import * as Units from './units.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
const CARGO = { gold: 0xe8c040, timber: 0x7a5a38, stone: 0x6a6a72, blood: 0xa01820, souls: 0x6fe8d0 };
const VET_COL = [0, 0, 0xb87840, 0xc0c4c8, 0xe8c040, 0x6fd0ff, 0xd070ff];

export function createUnitLayer(ctx) {
  const { scene, st, world } = ctx;
  const mats = rigMaterials(), rigs = new Map(), recs = new Map(), defs = new Map();
  // blob shadow + cargo + pip instanced helpers
  const shadowGeo = new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2);
  const shadows = new THREE.InstancedMesh(shadowGeo, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 700);
  shadows.frustumCulled = false; shadows.renderOrder = 1; scene.add(shadows);
  const teamRings = new THREE.InstancedMesh(new THREE.RingGeometry(0.78, 1, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: false }), 700);
  teamRings.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(700 * 3), 3); teamRings.frustumCulled = false; teamRings.renderOrder = 2; scene.add(teamRings);
  const cargoRig = (() => { const r = new Rig(); r.box(0.5, 0.32, 0.4, -0.28, 1.1, 0, 0, { team: 1 }); r.box(0.5, 0.06, 0.44, -0.28, 1.28, 0, 0x2a2018); return new InstancedRig(scene, r.build(), mats.unit, 32); })();
  const pipGeo = new THREE.OctahedronGeometry(0.1, 0).scale(1, 1.5, 1);
  const pips = new THREE.InstancedMesh(pipGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }), 600);
  pips.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(600 * 3), 3); pips.frustumCulled = false; pips.renderOrder = 6; scene.add(pips);
  const _c = new THREE.Color();

  function defOf(type) {
    let d = defs.get(type);
    if (d === undefined) { try { d = Units.def(type) || null; } catch (e) { d = null; } defs.set(type, d); }
    return d;
  }
  function rec(u) {
    let r = recs.get(u.id);
    if (!r) { r = { x: u.x, z: u.z, y: u.y ?? 0, face: u.face || 0, phase: Math.random() * 6, amp: 0, atk: 0, flash: 0, dying: 0, lx: u.x, lz: u.z, spd: 0, seenAt: 0, model: null }; recs.set(u.id, r); }
    return r;
  }
  function modelFor(u, r) {
    if (r.model && r.mt === u.type) return r.model;
    const d = defOf(u.type), f = u.team >= 0 && ctx.st.teams[u.team] ? ctx.fkey(u.team) : 'wild';
    const role = u.role || (d && d.role) || 'melee';
    const m = unitModel(u.type, role, f, d || (u.idx != null ? { idx: u.idx } : null));
    let rig = rigs.get(u.type + '|' + role + '|' + f);
    if (!rig) { rig = new InstancedRig(scene, m.geo, mats.unit, 24); rigs.set(u.type + '|' + role + '|' + f, rig); }
    r.model = { m, rig }; r.mt = u.type;
    return r.model;
  }
  function onEvent(e) {
    if (e.type === 'attack' || e.type === 'siege') { const s = recs.get(e.src); if (s) s.atk = Math.max(s.atk, 0.0001); }
    else if (e.type === 'hit') { const t = recs.get(e.tgt); if (t && e.amt > 0) t.flash = 1; }
    else if (e.type === 'cast') { const s = recs.get(e.caster); if (s) s.atk = Math.max(s.atk, 0.0001); }
  }
  let nShadow = 0, nPip = 0;
  function update(dt, t, alpha, view) {
    for (const rig of rigs.values()) rig.begin();
    cargoRig.begin(); nShadow = 0; nPip = 0;
    const local = ctx.local, pipC = pips.instanceColor.array, sel = view.selection;
    ctx.unitPos.clear();
    for (let i = 0; i < st.ents.length; i++) {
      const u = st.ents[i];
      if (u.kind && u.kind !== 'unit') continue;
      if (u.garrison) continue;
      const r = rec(u);
      if (!u.alive) { r.dying += dt; if (r.dying > 3.2) continue; } else r.dying = 0;
      if (u.team !== local && u.alive && !ctx.fog.visible(u.x, u.z)) continue;
      if (u.team !== local && !u.alive && !ctx.fog.visible(u.x, u.z)) continue;
      // smoothed position
      let tx, tz;
      if (u.ox !== undefined && u.oz !== undefined) { tx = u.ox + (u.x - u.ox) * alpha; tz = u.oz + (u.z - u.oz) * alpha; }
      else { tx = u.x; tz = u.z; }
      const dx = tx - r.x, dz = tz - r.z, dd = Math.hypot(dx, dz);
      if (dd > 6) { r.x = tx; r.z = tz; } else if (u.ox !== undefined) { r.x = tx; r.z = tz; } else { const k = 1 - Math.exp(-dt * 22); r.x += dx * k; r.z += dz * k; }
      const moved = Math.hypot(r.x - r.lx, r.z - r.lz); r.lx = r.x; r.lz = r.z;
      const sp = dt > 0 ? moved / dt : 0; r.spd += (sp - r.spd) * Math.min(1, dt * 10);
      const mdl = modelFor(u, r), M = mdl.m;
      const walking = u.alive && r.spd > 0.4;
      r.amp += ((walking ? Math.min(1, 0.45 + r.spd * 0.12) : 0) - r.amp) * Math.min(1, dt * 12);
      r.phase += r.spd * dt * (M.kind === 'siege' ? 1.5 : 4.4);
      if (u.alive) r.face += angDiff(r.face, u.face || 0) * Math.min(1, dt * 14);
      if (r.atk > 0) { r.atk += dt / (M.kind === 'siege' ? 1.1 : 0.42); if (r.atk >= 1) r.atk = 0; }
      r.flash = Math.max(0, r.flash - dt * 4);
      const gy = world.heightAt(r.x, r.z);
      let y = u.y !== undefined && u.layer === 'wall' ? u.y : (u.y !== undefined && Math.abs(u.y - gy) < 6 ? u.y : gy);
      r.gy = gy;
      if (M.fly) y += 2.4 + Math.sin(t * 2.2 + u.id) * 0.25;
      if (!ctx.inView(r.x, y + 1, r.z, 3.5)) continue;
      const vet = u.vet || 1, sc = M.scale * (1 + (vet - 1) * 0.012) * (u.sizeMul || 1);
      _q.setFromAxisAngle(_up, -r.face); _p.set(r.x, y, r.z); _s.set(sc, sc, sc); _m.compose(_p, _q, _s);
      const col = ctx.teamCol[u.team] || ctx.neutralCol, dth = u.alive ? 0 : Math.min(1, r.dying / 0.9);
      const idx = mdl.rig.next();
      mdl.rig.set(idx, _m, r.phase, r.amp, r.atk, dth, col.r, col.g, col.b, r.flash);
      r.y = y; ctx.unitPos.set(u.id, r);
      if (u.alive && ctx.camDist < 130) {
        if (u.general) { ctx.fx.spawnGlow(r.x, gy + 0.15, r.z, 0, 0, 0, dt * 1.6 + 0.001, 4.4 * sc, ctx.teamHex[u.team] || 0xffffff, 0, 0.3 + 0.08 * Math.sin(t * 3 + u.id)); if (Math.random() < dt * 5) ctx.fx.spawnGlow(r.x + (Math.random() - 0.5) * 2, gy + 0.2, r.z + (Math.random() - 0.5) * 2, 0, 1.4, 0, 1.2, 0.3, ctx.teamHex[u.team] || 0xffffff, 0, 0.8); }
        if (u.burnUntil > st.t) ctx.fx.emitter('fire', r.x, y + 0.7, r.z, 0.5, 0xff7a20, dt, u.id);
      }
      if (u.alive && u.carry && u.carry.amt > 0 && u.role === 'worker') { const ci = cargoRig.next(); const cc = _c.setHex(CARGO[u.carry.res] || 0x888888); cargoRig.set(ci, _m, 0, 0, 0, 0, cc.r, cc.g, cc.b, 0); }
      if (nShadow < 700) { _p.set(r.x, gy + 0.07, r.z); const sr = (u.r || 0.6) * 1.15 * (M.fly ? 0.7 : 1) * (dth > 0 ? 1 - dth * 0.5 : 1); _s.set(sr, 1, sr); _q.identity(); _m.compose(_p, _q, _s); shadows.setMatrixAt(nShadow, _m); _s.set(sr * 1.02, 1, sr * 1.02); _m.compose(_p, _q, _s); teamRings.setMatrixAt(nShadow, _m); const tc = teamRings.instanceColor.array; tc[nShadow * 3] = col.r; tc[nShadow * 3 + 1] = col.g; tc[nShadow * 3 + 2] = col.b; nShadow++; }
      if (vet >= 2 && u.alive && nPip < 560 && (sel.has(u.id) || ctx.camDist < 70)) {
        const cv = _c.setHex(VET_COL[Math.min(6, vet)]);
        for (let k = 0; k < vet - 1 && nPip < 599; k++) { _p.set(r.x + 0.0, y + M.top * sc * 0.9 + 0.35 + k * 0.17, r.z); _s.set(sc * 0.7, sc * 0.7, sc * 0.7); _q.identity(); _m.compose(_p, _q, _s); pips.setMatrixAt(nPip, _m); pipC[nPip * 3] = cv.r; pipC[nPip * 3 + 1] = cv.g; pipC[nPip * 3 + 2] = cv.b; nPip++; }
      }
    }
    for (const rig of rigs.values()) rig.end();
    cargoRig.end();
    shadows.count = nShadow; shadows.instanceMatrix.needsUpdate = true; teamRings.count = nShadow; teamRings.instanceMatrix.needsUpdate = true; teamRings.instanceColor.needsUpdate = true;
    pips.count = nPip; pips.instanceMatrix.needsUpdate = true; pips.instanceColor.needsUpdate = true;
    if ((ctx.frameN & 127) === 0) for (const id of recs.keys()) if (!st.byId.has(id)) { recs.delete(id); }
  }
  return { update, onEvent, recs, rigs, defOf };
}
