// FOGBOUND: HERO renderer. World view (src/worldview.js) + actors (chars.js) + camera. Sub-layers live in rfx.js, robjects.js,
// settlement_models.js, rzone.js, rplates.js. createRpgRenderer(canvas, st, game, opts) -> {frame, handleEvents, resize, wv, ...}
import * as THREE from 'three';
import { createWorldView } from '../worldview.js';
import { clamp, lerp, angDiff } from '../util.js';
import { createCharacter, setFirstPerson } from './chars.js';
import { createFx } from './rfx.js';
import { createObjects } from './robjects.js';
import { createSettlementView } from './settlement_models.js';
import { createZoneView } from './rzone.js';
import { createPlates } from './rplates.js';
import { createViewModel } from './viewmodel.js';

const CULL = 175, NEAR_ANIM = 70;

export function createRpgRenderer(canvas, st, game, opts = {}) {
  const world = st.world;
  const wv = createWorldView(canvas, world, { fov: 62, near: 0.12, far: 900, mist: 36, maxDpr: opts.maxDpr || 1.5 });
  const { scene, camera } = wv;
  camera.fov = 62; camera.updateProjectionMatrix();
  wv.resize();
  const recs = new Map();
  scene.add(camera);
  const vm = createViewModel(camera);
  let controls = null, tAcc = 0, frameN = 0, fpState = false, dmgFlash = 0, lastHp = -1;
  const focusPos = { x: 0, z: 0 };
  const objects = createObjects(wv, st), settlement = createSettlementView(wv, st), zone = createZoneView(wv, st), fx = createFx(wv, st, game), plates = createPlates(wv, st, game, canvas);

  function rec(a) {
    let r = recs.get(a.id);
    if (!r) {
      const ch = createCharacter(a, { light: false });
      scene.add(ch.obj);
      r = { ch, yaw: a.yaw, acc: 0, a };
      recs.set(a.id, r);
    }
    return r;
  }

  const _tip = new THREE.Vector3(), TRAIL = { fire: 0xff8a30, cold: 0x9fe0ff, lightning: 0xffee60, poison: 0x9be048, physical: 0xe8ecf0 };
  function trail(ch, a) {
    const w = ch.S.gear.weapon; if (!w || ch.S.sheathed || ch.S.gear.ranged) return;
    const len = { sword: 0.9, dagger: 0.4, twohand: 1.3, axe: 0.75, mace: 0.7, spear: 1.8, staff: 1.4 }[w.userData.kind] || 0.8, wi = a.equip.weapon;
    for (let i = 1; i <= 3; i++) { _tip.set(0, len * (i / 3), 0); w.localToWorld(_tip); wv.spawn(wv.glowP, _tip.x, _tip.y, _tip.z, 0, 0, 0, 0.16, 0.22, TRAIL[(wi && wi.dtype) || 'physical'] || 0xe8ecf0, 0, 0.7); }
  }
  function frame(st2, alpha, dt, simT, focus) {
    tAcc += dt; frameN++;
    const p = focus || st.player;
    const px = lerp(p.ox ?? p.x, p.x, alpha), py = lerp(p.oy ?? p.y, p.y, alpha), pz = lerp(p.oz ?? p.z, p.z, alpha);
    focusPos.x = px; focusPos.z = pz;
    // camera
    const dead = !p.alive;
    if (controls) {
      if (dead && !game.focus) { controls.cam.yaw += dt * 0.3; controls.cam.pitch += (-0.35 - controls.cam.pitch) * Math.min(1, dt * 2); } // orbit the fallen hero
      controls.placeCamera(camera, px, py, pz, dt, world, st.settlement ? st.settlement.buildings : null);
    }
    // shake (not in the calm first-person) + hit flash
    if (wv.shake > 0.001) camera.position.add(new THREE.Vector3((Math.random() - 0.5) * wv.shake * 0.5, (Math.random() - 0.5) * wv.shake * 0.5, (Math.random() - 0.5) * wv.shake * 0.5));
    camera.updateMatrixWorld();
    // world view: lighting etc.
    const phase = params_phase(st);
    const zs = zone.fogState(px, pz);
    wv.update(dt, { x: px, z: pz }, { phase, dread: 0.0, fogTint: zs.tint, fogDensityMul: zs.density, mistMul: zs.mist });
    wv.heroLight.position.set(px, py + 3.2, pz); const tq = p.equip && p.equip.offhand && p.equip.offhand.kind === 'torch'; wv.heroLight.intensity = 0.6 + wv.night * 1.8 + zs.amt * 0.4 + (tq ? 1.6 : 0); wv.heroLight.distance = tq ? 24 : 30;
    // first person: hide the head/torso of the focus character
    const fp = !!(controls && controls.cam.fp) && p.alive && p === st.player;
    vm.update(p, fp, dt, tAcc);
    // actors
    const dBudget = 0;
    void dBudget;
    for (const a of st.actors) {
      const dx = a.x - px, dz = a.z - pz, d = Math.hypot(dx, dz);
      let r = recs.get(a.id);
      if (d > CULL || (a.kind === 'monster' && !a.alive && simT - (a.diedAt || 0) > 8) || (a.kind !== 'player' && !a.alive && simT - (a.diedAt || 0) > 25)) { if (r) r.ch.obj.visible = false; continue; }
      if (!r) r = rec(a);
      const o = r.ch.obj; o.visible = true;
      const x = lerp(a.ox ?? a.x, a.x, alpha), y = lerp(a.oy ?? a.y, a.y, alpha), z = lerp(a.oz ?? a.z, a.z, alpha);
      o.position.set(x, y, z);
      const want = a.yaw; r.yaw += angDiff(r.yaw, want) * Math.min(1, dt * (a.cs && a.cs.state !== 'idle' ? 24 : 14)); o.rotation.y = -r.yaw;
      r.acc += dt;
      if (d < NEAR_ANIM || frameN % 3 === (a.id % 3)) { r.ch.update(a, { dt: r.acc, now: tAcc, simT, alpha }); r.acc = 0; }
      if (r.ch.kind === 'human' && a.cs.state === 'active' && d < 60) trail(r.ch, a);
      if (a.id === p.id && r.ch.kind === 'human' && fp !== r.fp) { r.fp = fp; setFirstPerson(r.ch, fp); }
      if (a.id !== p.id && r.fp) { r.fp = false; setFirstPerson(r.ch, false); }
    }
    for (const [id, r] of recs) if (!st.byId.has(id)) { r.ch.dispose(); recs.delete(id); }
    // layers
    objects.update(dt, tAcc, px, pz); settlement.update(dt, tAcc, px, pz); zone.update(dt, tAcc, px, pz, camera); fx.update(dt, tAcc, px, pz, camera);
    plates.update(dt, tAcc, recs, p, camera, controls ? controls.lockId : 0);
    // low HP / damage flash hooks
    const pl = st.player;
    if (pl) { if (lastHp >= 0 && pl.hp < lastHp - 0.5) dmgFlash = Math.min(1, dmgFlash + (lastHp - pl.hp) / pl.maxHp * 4 + 0.15); lastHp = pl.hp; }
    dmgFlash = Math.max(0, dmgFlash - dt * 2);
    fx.setVignette(dmgFlash, pl ? 1 - pl.hp / pl.maxHp : 0, zs.amt);
    wv.renderer.render(scene, camera);
  }

  function params_phase(s) {
    const q = new URLSearchParams(location.search);
    if (q.has('t')) return (Number(q.get('t')) / 24) % 1;
    return (0.03 + s.t / 2700) % 1;
  }
  function handleEvents(events) { fx.handleEvents(events, focusPos); objects.handleEvents(events); zone.handleEvents(events); }
  return {
    wv, scene, camera, frame, handleEvents, resize: wv.resize, recs, fx, objects, settlement, zone, plates, focusPos, vm,
    bindControls(c) { controls = c; },
    setFov(f) { camera.fov = f; camera.updateProjectionMatrix(); },
    dispose() { wv.dispose(); },
  };
}
