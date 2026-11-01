// FOGBOUND: DOMINION client: projectiles (st.projs unit shots + st.sproj tower/siege shots), spell bolts / lightning beams, magic zones (st.zones).
import * as THREE from 'three';
import { InstancedRig, rigMaterials, Rig } from './models_rts.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _d = new THREE.Vector3(), _x = new THREE.Vector3(1, 0, 0), _c = new THREE.Color();
const SCHOOL = { necromancy: 0x4fe3c1, warmagic: 0xff9a30, infernal: 0xff3a22, blood: 0xc43bd6 };
const SPELL_COL = { lightning: 0xbfd8ff, storm: 0x9fb8ff, bone_bolt: 0x4fe3c1, storm_bolt: 0xffd860, hell_bolt: 0xff4a20, blood_bolt: 0xc43bd6, dark: 0xb060ff, fire: 0xff8a30 };
export const ZONE_COL = { plague: 0x7cc04a, totem: 0xff9a30, storm: 0x9fb8ff, hellfire: 0xff4a20, aura: 0xc0c0ff, gate: 0xff3a22, bloodrain: 0xc01828, sanctuary: 0xfff0b0, prison: 0xb060ff, flame: 0xff7a20, telegraph: 0xff3030, fire: 0xff7a20 };
const KIND_MODEL = { arrow: 'arrow', spear: 'spear', bolt: 'bolt', bolt_big: 'bolt_big', cannonball: 'ball', bomb: 'bomb', rock: 'rock', boulder: 'rock', firerock: 'fireball', hellfire: 'fireball', fire: 'fireball', flame: null, dark: 'orb', lightning: 'orb' };
const KIND_COL = { dark: 0xb060ff, lightning: 0xbfd8ff, hellfire: 0xff4a20, fire: 0xff7a20, firerock: 0xff8a30, flame: 0xff7a20 };

function projRig(k) {
  const r = new Rig();
  switch (k) {
    case 'arrow': r.box(0.9, 0.035, 0.035, 0, 0, 0, 0x8a7a58); r.cone(0.05, 0.16, 0.5, 0, 0, 0xc4c8cc, 4, { rz: -1.5708 }); r.box(0.18, 0.1, 0.01, -0.4, 0, 0, 0xe0e0e0); break;
    case 'spear': r.box(1.5, 0.045, 0.045, 0, 0, 0, 0x6a5238); r.cone(0.07, 0.3, 0.8, 0, 0, 0xc4c8cc, 4, { rz: -1.5708 }); break;
    case 'bolt': r.box(0.8, 0.07, 0.07, 0, 0, 0, 0x5a4830); r.cone(0.08, 0.28, 0.5, 0, 0, 0xaab0b4, 4, { rz: -1.5708 }); break;
    case 'bolt_big': r.box(2.2, 0.14, 0.14, 0, 0, 0, 0x4a3a28); r.cone(0.16, 0.6, 1.4, 0, 0, 0xaab0b4, 4, { rz: -1.5708 }); r.box(0.4, 0.3, 0.02, -1.0, 0, 0, 0x3a3a3a); break;
    case 'ball': r.sph(0.34, 0, 0, 0, 0x2a2a2e, { w: 8, h: 6 }); break;
    case 'bomb': r.sph(0.3, 0, 0, 0, 0x1c1c20, { w: 7, h: 5 }); r.sph(0.1, 0, 0.32, 0, 0xff8030, { team: 2, w: 4, h: 3 }); break;
    case 'rock': r.sph(0.55, 0, 0, 0, 0x6a665e, { sx: 1.1, sy: 0.9, w: 6, h: 5 }); r.box(0.4, 0.4, 0.4, 0.3, 0.2, 0.1, 0x55524a, { ry: 0.6, rx: 0.5 }); break;
    case 'fireball': r.sph(0.5, 0, 0, 0, 0xff7a20, { team: 2, w: 8, h: 6 }); r.sph(0.28, 0, 0, 0, 0xffd070, { team: 2, w: 6, h: 4 }); break;
    default: r.sph(0.3, 0, 0, 0, 0xffffff, { team: 2, w: 7, h: 5 });
  }
  return r.build();
}

export function createProjLayer(ctx) {
  const { scene, st, wv } = ctx, mats = rigMaterials(), rigs = new Map(), prev = new WeakMap();
  function rigOf(k) { let r = rigs.get(k); if (!r) { r = new InstancedRig(scene, projRig(k), mats.unit, 32); rigs.set(k, r); } return r; }
  const fx = ctx.fx;
  // beams
  const beams = [], BMAX = 48, SEG = 10;
  const bGeo = new THREE.BufferGeometry(), bPos = new Float32Array(BMAX * SEG * 6), bCol = new Float32Array(BMAX * SEG * 6);
  bGeo.setAttribute('position', new THREE.BufferAttribute(bPos, 3).setUsage(THREE.DynamicDrawUsage)); bGeo.setAttribute('color', new THREE.BufferAttribute(bCol, 3).setUsage(THREE.DynamicDrawUsage));
  const lines = new THREE.LineSegments(bGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); lines.frustumCulled = false; lines.renderOrder = 6; scene.add(lines);
  // zones: ground discs + rings (instanced)
  const discGeo = new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2), ringGeo = new THREE.RingGeometry(0.92, 1, 40).rotateX(-Math.PI / 2);
  const zmat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: false });
  const mk = (g, n) => { const im = new THREE.InstancedMesh(g, zmat, n); im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3); im.frustumCulled = false; im.count = 0; im.renderOrder = 3; scene.add(im); return im; };
  const discs = mk(discGeo, 60), zrings = mk(ringGeo, 60);

  const schoolOf = (spell) => { const s = String(spell || ''); for (const k in SCHOOL) if (s.includes(k)) return SCHOOL[k]; for (const k in SPELL_COL) if (s.includes(k)) return SPELL_COL[k]; return 0xc0a0ff; };
  function addBeam(x0, y0, z0, x1, y1, z1, col, dur = 0.28) { if (beams.length < BMAX) beams.push({ x0, y0, z0, x1, y1, z1, col, t: 0, dur }); }
  function onEvent(e) {
    if (e.type === 'bolt') {
      const y0 = e.sky ? ctx.world.heightAt(e.x1, e.z1) + 30 : ctx.world.heightAt(e.x0, e.z0) + (e.y0 ?? 6), y1 = ctx.world.heightAt(e.x1, e.z1) + 1.2, col = schoolOf(e.spell);
      addBeam(e.x0, y0, e.z0, e.x1, y1, e.z1, col);
      fx.burst(e.x1, y1, e.z1, 8, 4, col, 0.4, 0.4, 2); wv.addFlash(0.4, col, e.x1, y1 + 2, e.z1);
    } else if (e.type === 'weather' && e.kind === 'lightning') {
      const y1 = ctx.world.heightAt(e.x, e.z) + 1; addBeam(e.x + (Math.random() - 0.5) * 8, y1 + 55, e.z + (Math.random() - 0.5) * 8, e.x, y1, e.z, 0xcfe0ff, 0.35);
      wv.addFlash(1.2, 0xcfe0ff, e.x, y1 + 6, e.z); wv.addShake(0.25); fx.burst(e.x, y1, e.z, 14, 6, 0xcfe0ff, 0.5, 0.5, 6); fx.puff(e.x, y1, e.z, 3, 1, 0x555555, 1.4, 1, 1);
    } else if (e.type === 'shot') {
      if (/cannon|bomb|hellfire/.test(e.kind || '') && ctx.inView(e.x, e.y || 0, e.z, 10)) { fx.puff(e.x, (e.y || 0) + 0.3, e.z, 5, 1.2, 0x8a8a84, 1.6, 1.2, 0.7); fx.burst(e.x, (e.y || 0) + 0.3, e.z, 8, 7, 0xffb050, 0.3, 0.4, 2); wv.addShake(0.08); }
      else if (e.kind === 'flame' && ctx.inView(e.x, e.y || 0, e.z, 10)) fx.burst(e.x, (e.y || 0) + 0.3, e.z, 3, 5, 0xff8a30, 0.4, 0.5, -2);
    } else if (e.type === 'impact') {
      const gy = ctx.world.heightAt(e.x, e.z), col = e.spell ? schoolOf(e.spell) : 0, r = e.r || e.splash || 2;
      if (!ctx.inView(e.x, gy, e.z, r + 6)) return;
      const k = e.kind || '';
      if (/cannon|bomb|rock|boulder|hellfire|fire/.test(k) || (!e.spell && r >= 2)) { fx.puff(e.x, gy + 0.5, e.z, 6, r * 0.8, 0x6a6258, 2, 1.5, 1.2); fx.burst(e.x, gy + 0.6, e.z, 12, 6, /fire|hell/.test(k) ? 0xff8a30 : 0xd8c8a0, 0.6, 0.35, 10); fx.ring(e.x, e.z, r, /fire|hell/.test(k) ? 0xff9a40 : 0xe0d0a8, 0.45); wv.addShake(0.12); }
      if (col) { fx.ring(e.x, e.z, r, col, 0.6, 1.4); fx.burst(e.x, gy + 0.8, e.z, 14, 4, col, 0.7, 0.45, -1); wv.addFlash(0.3, col, e.x, gy + 3, e.z); }
    } else if (e.type === 'fx' && e.kind === 'explosion') {
      const gy = ctx.world.heightAt(e.x, e.z); fx.puff(e.x, gy + 0.5, e.z, 8, (e.r || 3), 0x5a5248, 2, 1.6, 1.4); fx.burst(e.x, gy + 0.6, e.z, 14, 7, 0xffa040, 0.7, 0.5, 8); fx.ring(e.x, e.z, e.r || 3, 0xffb060, 0.5); wv.addShake(0.15);
    } else if (e.type === 'neutral' && (e.what === 'meteor' || e.what === 'comet')) {
      const gy = ctx.world.heightAt(e.x, e.z), col = e.what === 'comet' ? 0x6fe8d0 : 0xff7a20;
      addBeam(e.x - 30, gy + 80, e.z - 20, e.x, gy + 1, e.z, col, 0.6); fx.puff(e.x, gy + 1, e.z, 14, 6, 0x4a4238, 3, 2.4, 2); fx.burst(e.x, gy + 1, e.z, 30, 10, col, 1.0, 0.7, 8); fx.ring(e.x, e.z, 12, col, 1.0, 2); wv.addShake(0.5); wv.addFlash(0.8, col, e.x, gy + 5, e.z);
    }
  }
  function drawBeams(dt) {
    let n = 0;
    for (let i = beams.length - 1; i >= 0; i--) { const b = beams[i]; b.t += dt; if (b.t >= b.dur) beams.splice(i, 1); }
    for (const b of beams) {
      const k = 1 - b.t / b.dur; _c.setHex(b.col).multiplyScalar(0.4 + 0.8 * k);
      let px = b.x0, py = b.y0, pz = b.z0;
      const len = Math.hypot(b.x1 - b.x0, b.z1 - b.z0, b.y1 - b.y0), jit = Math.min(1.6, len * 0.05);
      for (let s = 1; s <= SEG; s++) {
        const u = s / SEG, nx = b.x0 + (b.x1 - b.x0) * u + (s < SEG ? (Math.random() - 0.5) * jit : 0), ny = b.y0 + (b.y1 - b.y0) * u + (s < SEG ? (Math.random() - 0.5) * jit * 0.5 : 0), nz = b.z0 + (b.z1 - b.z0) * u + (s < SEG ? (Math.random() - 0.5) * jit : 0), o = n * 6;
        bPos[o] = px; bPos[o + 1] = py; bPos[o + 2] = pz; bPos[o + 3] = nx; bPos[o + 4] = ny; bPos[o + 5] = nz;
        bCol[o] = bCol[o + 3] = _c.r; bCol[o + 1] = bCol[o + 4] = _c.g; bCol[o + 2] = bCol[o + 5] = _c.b; n++; px = nx; py = ny; pz = nz;
        if (s % 2 === 0) fx.spawnGlow(nx, ny, nz, 0, 0, 0, 0.22, 0.55 + k * 0.4, b.col, 0, 0.8 * k);
      }
    }
    bGeo.setDrawRange(0, n * 2); bGeo.attributes.position.needsUpdate = true; bGeo.attributes.color.needsUpdate = true;
  }
  let nz = 0, nr = 0;
  function zoneDraw(z, dt, t) {
    const gy = ctx.world.heightAt(z.x, z.z), col = ZONE_COL[z.kind] || (z.team >= 0 ? ctx.teamHex[z.team] : 0xc0c0ff), age = st.t - (z.born || 0), left = (z.until || st.t + 1) - st.t;
    const fade = Math.min(1, age * 2, Math.max(0, left * 1.5)), r = z.r || 4;
    if (nz < 59) { _c.setHex(col).multiplyScalar((z.kind === 'telegraph' ? 0.35 + 0.25 * Math.sin(t * 9) : 0.16) * fade); _p.set(z.x, gy + 0.18, z.z); _s.set(r, 1, r); _q.identity(); _m.compose(_p, _q, _s); discs.setMatrixAt(nz, _m); discs.instanceColor.array.set([_c.r, _c.g, _c.b], nz * 3); nz++; }
    if (nr < 59) { _c.setHex(col).multiplyScalar(0.8 * fade); _p.set(z.x, gy + 0.22, z.z); _s.set(r, 1, r); _m.compose(_p, _q, _s); zrings.setMatrixAt(nr, _m); zrings.instanceColor.array.set([_c.r, _c.g, _c.b], nr * 3); nr++; }
    const k = z.kind, n = Math.ceil(dt * r * r * 0.5 * fade);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, d = Math.sqrt(Math.random()) * r, x = z.x + Math.cos(a) * d, zz = z.z + Math.sin(a) * d, y = ctx.world.heightAt(x, zz);
      if (k === 'plague') fx.spawnSmoke(x, y + 0.4, zz, 0.2, 0.5, 0.1, 2.2, 2.2, 0x7cc04a, -0.05, 0.28, 1.4);
      else if (k === 'hellfire' || k === 'fire' || k === 'flame') { if (Math.random() < 0.5) fx.emitter('fire', x, y, zz, 0.9, ZONE_COL[k], dt * 6, i); }
      else if (k === 'bloodrain') fx.spawnGlow(x, y + 12, zz, 0, -16, 0, 0.7, 0.18, 0xc01828, 0, 0.8);
      else if (k === 'sanctuary' || k === 'aura' || k === 'totem') fx.spawnGlow(x, y + 0.2, zz, 0, 1.2, 0, 1.3, 0.28, col, 0, 0.6);
      else if (k === 'storm') fx.spawnSmoke(x, y + 13, zz, 0.5, 0, 0.2, 2.4, 4, 0x2a3040, 0, 0.5, 0.6);
      else if (k === 'gate' || k === 'prison') fx.spawnGlow(x, y + 0.3, zz, 0, 2, 0, 1.0, 0.3, col, 0, 0.7);
    }
  }
  function update(dt, t) {
    for (const r of rigs.values()) r.begin();
    const draw = (p, defaultT) => {
      let pv = prev.get(p);
      if (!pv) { pv = { x: p.sx ?? p.x, y: p.sy ?? p.y, z: p.sz ?? p.z, dx: p.tx - p.x, dy: 0, dz: p.tz - p.z }; prev.set(p, pv); }
      const dx = p.x - pv.x, dy = p.y - pv.y, dz = p.z - pv.z;
      if (dx * dx + dy * dy + dz * dz > 1e-5) { pv.dx = dx; pv.dy = dy; pv.dz = dz; }
      pv.x = p.x; pv.y = p.y; pv.z = p.z;
      if (!ctx.inView(p.x, p.y, p.z, 3) || (p.team !== ctx.local && !ctx.fog.visible(p.x, p.z))) return;
      const km = KIND_MODEL[p.kind], col = KIND_COL[p.kind] || (p.kind && /_bolt$/.test(p.kind) ? schoolOf(p.kind) : 0xffffff);
      const isMagic = !km || km === 'orc' || km === 'orb' || km === 'fireball';
      if (km !== null) {
        const rig = rigOf(km || (/_bolt$/.test(p.kind) ? 'orb' : /^bolt/.test(p.kind) ? 'bolt' : 'arrow')), i = rig.next();
        _d.set(pv.dx, pv.dy, pv.dz); if (_d.lengthSq() < 1e-9) _d.set(1, 0, 0); _d.normalize(); _q.setFromUnitVectors(_x, _d); _p.set(p.x, p.y, p.z); _s.set(1, 1, 1); _m.compose(_p, _q, _s);
        const tc = ctx.teamCol[p.team] || ctx.teamCol[0];
        rig.set(i, _m, 0, 0, 0, 0, (isMagic ? _c.setHex(col) : tc).r, (isMagic ? _c : tc).g, (isMagic ? _c : tc).b, 0);
      }
      const k = p.kind || '';
      if (/cannon|bomb/.test(k)) { if (Math.random() < 0.7) fx.spawnSmoke(p.x, p.y, p.z, 0, 0.2, 0, 0.9, 0.5, 0x888880, 0, 0.5, 1); }
      else if (/fire|hell|flame/.test(k)) { fx.spawnGlow(p.x, p.y, p.z, (Math.random() - 0.5) * 0.4, 0.3, (Math.random() - 0.5) * 0.4, 0.45, 0.8, 0xff8a30, -0.5, 0.9); if (Math.random() < 0.5) fx.spawnSmoke(p.x, p.y, p.z, 0, 0.6, 0, 1.1, 0.7, 0x2a2a2a, 0, 0.4, 1); fx.spawnGlow(p.x, p.y, p.z, 0, 0, 0, 0.05, 2.4, 0xff7a20, 0, 0.35); }
      else if (isMagic) { fx.spawnGlow(p.x, p.y, p.z, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, 0.4, 0.6, col, 0, 0.8); fx.spawnGlow(p.x, p.y, p.z, 0, 0, 0, 0.05, 2.0, col, 0, 0.3); }
      else if (/arrow|bolt|spear/.test(k) && Math.random() < 0.15) fx.spawnGlow(p.x, p.y, p.z, 0, 0, 0, 0.18, 0.18, 0xe8e8e8, 0, 0.25);
    };
    for (const p of st.projs) draw(p);
    if (st.sproj) for (const p of st.sproj) draw(p);
    for (const r of rigs.values()) r.end();
    nz = 0; nr = 0;
    for (const z of st.zones || []) if (ctx.inView(z.x, 0, z.z, (z.r || 4) + 4) && (z.until === undefined || z.until > st.t - 0.5)) zoneDraw(z, dt, t);
    discs.count = nz; zrings.count = nr; for (const im of [discs, zrings]) { im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; }
    drawBeams(dt);
  }
  return { update, onEvent, addBeam };
}
