// FOGBOUND: DOMINION client: overlays driven by `view`: selection/hover rings, compact health + build bars, building ghosts (incl. wall lines),
// rally flags, order pings. All instanced; no per-frame allocation.
import * as THREE from 'three';
import { InstancedRig, rigMaterials, Rig } from './models_rts.js';
import { buildingModel } from './rmodel_blds.js';
import { wallModel } from './rmodel_walls.js';
import { ALL_DEFS } from './wdata.js';
import { def as bdef } from './bdata.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _c = new THREE.Color(), _r = new THREE.Vector3();
const LOOK = { necro: 'bone', orc: 'orc', demon: 'hell', cult: 'blood' };
const PING = { move: 0x60ff90, attack: 0xff5040, alert: 0xffa030, rally: 0xffe070, amove: 0xff9040, gather: 0xe8d070 };

function inst(scene, geo, mat, cap, order) {
  const im = new THREE.InstancedMesh(geo, mat, cap); im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
  im.frustumCulled = false; im.renderOrder = order; im.count = 0; scene.add(im); return im;
}
export function createOverlays(ctx) {
  const { scene, st, world } = ctx, mats = rigMaterials();
  const ringGeo = new THREE.RingGeometry(0.86, 1, 32).rotateX(-Math.PI / 2), thickGeo = new THREE.RingGeometry(0.76, 1, 32).rotateX(-Math.PI / 2);
  const rmat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, fog: false });
  const rings = inst(scene, ringGeo, rmat, 700, 3), rings2 = inst(scene, thickGeo, rmat, 200, 3);
  const quad = new THREE.PlaneGeometry(1, 1);
  const bmat = new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, fog: false });
  const barBg = inst(scene, quad, bmat, 500, 10), barFg = inst(scene, quad, bmat, 500, 11);
  const pingMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const pingRings = inst(scene, ringGeo, pingMat, 40, 4);
  // rally flag / marker rig
  const flagRig = (() => { const r = new Rig(); r.box(0.08, 2.2, 0.08, 0, 1.1, 0, 0x2a2018); r.box(0.04, 0.7, 1.0, 0, 1.8, 0.5, 0, { team: 1, part: 5, pv: [0, 2.1, 0] }); r.cone(0.12, 0.3, 0, 2.3, 0, 0xd8b24a, 4, { team: 0 }); return new InstancedRig(scene, r.build(), mats.unit, 8); })();
  const gRigs = new Map();
  const colTmp = new THREE.Color();
  let nR = 0, nR2 = 0, nB = 0;

  function ring(x, z, rad, c, thick, sx = 1, sz = 1, rot = 0) {
    const im = thick ? rings2 : rings, n = thick ? nR2 : nR; if (n >= im.instanceMatrix.count) return;
    _q.setFromAxisAngle(_up, -rot); _p.set(x, world.heightAt(x, z) + 0.16, z); _s.set(rad * sx, 1, rad * sz); _m.compose(_p, _q, _s);
    im.setMatrixAt(n, _m); im.instanceColor.array[n * 3] = c.r; im.instanceColor.array[n * 3 + 1] = c.g; im.instanceColor.array[n * 3 + 2] = c.b;
    if (thick) nR2++; else nR++;
  }
  function bar(x, y, z, w, f, cr, cg, cb, cam) {
    if (nB >= 499) return;
    _r.set(1, 0, 0).applyQuaternion(cam.quaternion);
    const h = w * 0.13;
    _p.set(x, y, z); _s.set(w + 0.06 * w, h + 0.03 * w, 1); _m.compose(_p, cam.quaternion, _s); barBg.setMatrixAt(nB, _m);
    barBg.instanceColor.array[nB * 3] = 0.03; barBg.instanceColor.array[nB * 3 + 1] = 0.03; barBg.instanceColor.array[nB * 3 + 2] = 0.04;
    f = Math.max(0.02, Math.min(1, f));
    _p.set(x - _r.x * (1 - f) * w / 2, y - _r.y * (1 - f) * w / 2, z - _r.z * (1 - f) * w / 2); _s.set(w * f, h, 1); _m.compose(_p, cam.quaternion, _s); barFg.setMatrixAt(nB, _m);
    barFg.instanceColor.array[nB * 3] = cr; barFg.instanceColor.array[nB * 3 + 1] = cg; barFg.instanceColor.array[nB * 3 + 2] = cb;
    nB++;
  }
  function hpCol(f, mine) { return mine ? [f > 0.5 ? 0.2 + (1 - f) * 1.4 : 0.9, f > 0.5 ? 0.85 : f * 1.5, 0.15] : [0.9, 0.2 + f * 0.1, 0.18]; }

  function ghostRig(g) {
    const key = g.type + '|' + (g.tier ?? '') + '|' + ctx.fkey(ctx.local);
    let e = gRigs.get(key);
    if (!e) {
      const wd = ALL_DEFS[g.type], bd = wd || bdef(g.type, ctx.local), f = ctx.fkey(ctx.local);
      const w = g.w || bd.w || 4, d = g.d || bd.d || 4, h = g.h || bd.h || 4;
      const m = wd && wd.wall ? wallModel(wd.wall.piece, g.tier ?? wd.wall.tier, LOOK[f], w, d, h, /cannon/.test(g.type) ? 'cannon' : /magic/.test(g.type) ? 'magic' : /ballista/.test(g.type) ? 'ballista' : /watch/.test(g.type) ? 'none' : 'arrow') : buildingModel(g.type, f, w, d, h);
      e = { rig: new InstancedRig(scene, m.geo, mats.ghost, 8) }; gRigs.set(key, e);
    }
    return e.rig;
  }

  function update(dt, t, view, cam) {
    nR = nR2 = nB = 0; flagRig.begin(); for (const e of gRigs.values()) e.rig.begin();
    const sel = view.selection, local = ctx.local;
    const col = ctx.teamCol;
    if (sel) for (const id of sel) {
      const e = st.byId.get(id); if (!e) continue;
      if (e.kind === 'bld') { const r = ctx.bldPos.get(id); if (!r || e.state === 'ruin') continue; ring(e.x, e.z, Math.max(e.w, e.d) * 0.62 + 0.8, (col[e.team] || ctx.neutralCol) || _c.setHex(0xe0c060), false, e.w / Math.max(e.w, e.d), e.d / Math.max(e.w, e.d), e.rot || 0); }
      else if (e.kind === 'unit') { const r = ctx.unitPos.get(id); if (!r || !e.alive) continue; const gen = e.general, rd = (e.r || 0.6) * (gen ? 2.1 : 1.6) + 0.3; ring(r.x, r.z, rd, colTmp.copy((col[e.team] || ctx.neutralCol)).lerp(_c.setHex(0xffffff), 0.35), gen); }
      else if (e.x !== undefined) ring(e.x, e.z, (e.r || 2) + 1, _c.setHex(0xe0c060), false);
    }
    if (view.hover) { const e = st.byId.get(view.hover); if (e && !(sel && sel.has(e.id))) { const hc = e.team === local ? 0x80ff90 : e.team == null || e.team < 0 ? 0xe0c060 : 0xff6050; if (e.kind === 'bld') ring(e.x, e.z, Math.max(e.w, e.d) * 0.62 + 0.8, _c.setHex(hc), false, e.w / Math.max(e.w, e.d), e.d / Math.max(e.w, e.d), e.rot || 0); else { const r = ctx.unitPos.get(e.id); if (r) ring(r.x, r.z, (e.r || 0.6) * 1.6 + 0.3, _c.setHex(hc), false); else if (e.x !== undefined) ring(e.x, e.z, (e.r || 2) + 1, _c.setHex(hc), false); } } }
    // bars
    const ck = ctx.camDist * 0.021;
    for (const [id, r] of ctx.unitPos) {
      const u = st.byId.get(id); if (!u || !u.alive || !(u.maxHp > 0)) continue;
      const hurt = u.hp < u.maxHp * 0.995, picked = (sel && sel.has(id)) || view.hover === id;
      if (!(picked || hurt || (u.general && u.team === local))) continue;
      if (ctx.camDist > 150 && !picked) continue;
      const c = hpCol(u.hp / u.maxHp, u.team === local), m = r.model && r.model.m;
      bar(r.x, r.y + (m ? m.top * m.scale : 2) + 0.55, r.z, ck * (u.general ? 1.5 : 1) * (0.7 + (u.r || 0.6)), u.hp / u.maxHp, c[0], c[1], c[2], cam);
    }
    for (const [id, r] of ctx.bldPos) {
      const b = st.byId.get(id); if (!b || b.state === 'ruin' || !(b.maxHp > 0)) continue;
      const building = b.state === 'building', hurt = b.hp < b.maxHp * 0.995, picked = (sel && sel.has(id)) || view.hover === id;
      if (!(picked || hurt || building)) continue;
      if (b.wall && !picked && b.hp > b.maxHp * 0.7) continue;
      const y = r.baseY + (b.h || 4) + 1.0;
      if (building) bar(b.x, y, b.z, ck * 2.6, b.progress || 0, 0.95, 0.75, 0.2, cam);
      else { const c = hpCol(b.hp / b.maxHp, b.team === local); bar(b.x, y, b.z, ck * (b.wall ? 2.0 : 3.2), b.hp / b.maxHp, c[0], c[1], c[2], cam); }
    }
    // ghosts
    const gs = view.ghosts;
    if (gs) for (let i = 0; i < gs.length && i < 140; i++) {
      const g = gs[i]; if (!g || !g.type) continue;
      const rg = ghostRig(g), k = rg.next(), y = world.heightAt(g.x, g.z);
      _q.setFromAxisAngle(_up, -(g.rot || 0)); _p.set(g.x, y - 0.05, g.z); _s.set(1, 1, 1); _m.compose(_p, _q, _s);
      rg.set(k, _m, 0, 0, 0, 0, g.ok === false ? 1 : 0.25, g.ok === false ? 0.15 : 1, g.ok === false ? 0.1 : 0.4, 0);
    }
    // rally flags
    const ra = view.rallies;
    if (ra) for (let i = 0; i < ra.length && i < 8; i++) { const q = ra[i]; _q.identity(); _p.set(q.x, world.heightAt(q.x, q.z), q.z); _s.set(1, 1, 1); _m.compose(_p, _q, _s); const k = flagRig.next(); const c = col[local] || col[0]; flagRig.set(k, _m, 0, 0.5, 0, 0, c.r, c.g, c.b, 0); }
    // pings
    let nP = 0; const pg = view.pings;
    if (pg) for (let i = 0; i < pg.length && nP < 38; i++) {
      const p = pg[i], age = p.age ?? p.t ?? 0, k = age / 1.2; if (k < 0 || k > 1) continue;
      _c.setHex(PING[p.kind] || 0xffffff); _c.multiplyScalar(1 - k);
      _q.identity(); _p.set(p.x, world.heightAt(p.x, p.z) + 0.2, p.z); const rr = 0.8 + 2.2 * Math.sqrt(k); _s.set(rr, 1, rr); _m.compose(_p, _q, _s);
      pingRings.setMatrixAt(nP, _m); pingRings.instanceColor.array[nP * 3] = _c.r; pingRings.instanceColor.array[nP * 3 + 1] = _c.g; pingRings.instanceColor.array[nP * 3 + 2] = _c.b; nP++;
    }
    for (const [im, n] of [[rings, nR], [rings2, nR2], [barBg, nB], [barFg, nB], [pingRings, nP]]) { im.count = n; im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; }
    flagRig.end(); for (const e of gRigs.values()) e.rig.end();
  }
  return { update };
}
