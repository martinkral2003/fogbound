// FOGBOUND: HERO input + third-person camera. createRpgControls(canvas, game) where game = {st, ui(), paused(), world}.
// Produces the sim input struct (README) and the camera pose. Edges (attackPressed, dodge, interact, slot, heavy) live for ONE sim step:
// the main loop calls clearEdges() after each step. Look: pointer lock (mouse), V first person, Tab lock-on, Q cycles the lock target.
import { clamp, angDiff, TAU } from '../util.js';

const PITCH_MIN = -1.25, PITCH_MAX = 1.05;
export function createRpgControls(canvas, game) {
  const keys = new Set();
  const input = { mx: 0, mz: 0, yaw: 0, pitch: 0, sprint: false, crouch: false, jump: false, attack: false, attackPressed: false, heavy: false, block: false, dodge: false, interact: false, slot: -1, lockId: 0, cmds: [] };
  const cam = { yaw: 0, pitch: -0.18, dist: 3.6, wantDist: 3.6, fp: false, shoulder: 0.55, curDist: 3.6, sens: 0.0024, invertY: false, fov: 62 };
  const S = { facing: 0, faceInit: false, lock: 0, attackDown: false, attackT: 0, heavyEdge: false, crouch: false, locked: false, hintT: 0, lastAim: 0 };
  const ui = () => (game.ui ? game.ui() : null);
  const modal = () => { const u = ui(); return !!(u && u.isModalOpen && u.isModalOpen()) || !!(game.paused && game.paused()); };
  const player = () => game.st.player;
  const st = () => game.st;
  let locked = false;

  // ------------------------------------------------------------ lock-on
  function candidates() {
    const p = player(); if (!p) return [];
    const out = [];
    for (const a of st().actors) {
      if (!a.alive || a === p || a.kind === 'npc' || a.owner === p.id || a.hostile === false) continue;
      const dx = a.x - p.x, dz = a.z - p.z, d = Math.hypot(dx, dz);
      if (d > 25) continue;
      const off = angDiff(cam.yaw, Math.atan2(dz, dx));
      out.push({ a, d, off });
    }
    return out;
  }
  function lockNext(dir = 0) {
    const c = candidates().filter((q) => Math.abs(q.off) < 1.25 || S.lock);
    if (!c.length) { S.lock = 0; return; }
    if (!S.lock || !dir) { c.sort((u, v) => u.d + Math.abs(u.off) * 6 - (v.d + Math.abs(v.off) * 6)); S.lock = c[0].a.id; return; }
    c.sort((u, v) => u.off - v.off);
    const i = c.findIndex((q) => q.a.id === S.lock);
    S.lock = c[(i + 1 + c.length) % c.length].a.id;
  }
  const lockTarget = () => { const t = S.lock ? st().byId.get(S.lock) : null; return t && t.alive ? t : null; };

  // ------------------------------------------------------------ events
  function queue(cmd) { input.cmds.push(cmd); }
  function lockPointer() { if (document.pointerLockElement === canvas || modal()) return; try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* needs a user gesture */ } }
  function onKey(e) {
    if (e.type === 'keyup') { keys.delete(e.code); return; }
    const u = ui();
    if (u && u.keyHandler && u.keyHandler(e)) { e.preventDefault(); return; }
    if (modal() || e.repeat) { if (!e.repeat && /^(Tab|Space|ControlLeft)$/.test(e.code)) e.preventDefault(); return; }
    keys.add(e.code);
    switch (e.code) {
      case 'KeyV': cam.fp = !cam.fp; break;
      case 'Tab': e.preventDefault(); if (S.lock) S.lock = 0; else lockNext(0); break;
      case 'KeyQ': if (S.lock) lockNext(1); break;
      case 'KeyC': S.crouch = !S.crouch; break;
      case 'KeyE': case 'KeyF': input.interact = true; break;
      case 'KeyR': queue({ t: 'sheathe' }); break;
      case 'Space': input.jump = true; e.preventDefault(); break;
      case 'ControlLeft': case 'ControlRight': input.dodge = true; e.preventDefault(); break;
      default: { const m = /^Digit([1-8])$/.exec(e.code); if (m) input.slot = +m[1] - 1; }
    }
  }
  function onMouseDown(e) {
    if (modal()) return;
    if (!locked) lockPointer();
    if (e.button === 0) { input.attack = true; input.attackPressed = true; S.attackDown = true; S.attackT = 0; }
    else if (e.button === 2) input.block = true;
    else if (e.button === 1) { e.preventDefault(); if (S.lock) lockNext(1); }
  }
  function onMouseUp(e) {
    if (e.button === 0 && S.attackDown) { S.attackDown = false; input.attack = false; if (S.attackT > 0.4) S.heavyEdge = true; }
    else if (e.button === 2) input.block = false;
  }
  function onMove(e) {
    if (!locked || modal() || S.lock) return;
    cam.yaw += e.movementX * cam.sens; cam.pitch = clamp(cam.pitch - e.movementY * cam.sens * (cam.invertY ? -1 : 1), PITCH_MIN, PITCH_MAX);
  }
  function onWheel(e) { if (modal()) return; cam.wantDist = clamp(cam.wantDist + Math.sign(e.deltaY) * 0.35, 2.2, 7); }
  function onLockChange() {
    const was = locked; locked = document.pointerLockElement === canvas;
    if (was && !locked && !modal()) { const u = ui(); if (u && u.open && !(game.noPauseOnUnlock && game.noPauseOnUnlock())) u.open('pause'); }
  }
  const prevent = (e) => e.preventDefault();
  const onBlur = () => { keys.clear(); input.attack = input.block = false; S.attackDown = false; };
  window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKey); window.addEventListener('blur', onBlur);
  canvas.addEventListener('mousedown', onMouseDown); window.addEventListener('mouseup', onMouseUp); window.addEventListener('mousemove', onMove);
  canvas.addEventListener('wheel', onWheel, { passive: true }); canvas.addEventListener('contextmenu', prevent);
  document.addEventListener('pointerlockchange', onLockChange);

  // ------------------------------------------------------------ per-frame
  function update(dt) {
    const p = player();
    if (!p) return;
    if (modal() && document.pointerLockElement === canvas) document.exitPointerLock();
    const busy = modal();
    const k = (c) => (!busy && keys.has(c) ? 1 : 0);
    const f = k('KeyW') - k('KeyS'), s = k('KeyD') - k('KeyA');
    const lt = lockTarget();
    if (S.lock && !lt) S.lock = 0;
    if (lt && Math.hypot(lt.x - p.x, lt.z - p.z) > 38) S.lock = 0;
    // camera follows the lock target
    if (lt) {
      const want = Math.atan2(lt.z - p.z, lt.x - p.x), d = Math.hypot(lt.x - p.x, lt.z - p.z);
      cam.yaw += angDiff(cam.yaw, want) * Math.min(1, dt * 7);
      cam.pitch += (clamp(-0.12 - (d < 4 ? 0.12 : 0), PITCH_MIN, 0.1) - cam.pitch) * Math.min(1, dt * 4);
      cam.wantDist = Math.max(cam.wantDist, clamp(3.4 + d * 0.12, 3.4, 6));
    }
    const sin = Math.sin(cam.yaw), cos = Math.cos(cam.yaw);
    let mx = cos * f - sin * s, mz = sin * f + cos * s; // forward = (cos,sin), right = (-sin,cos)
    const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
    input.mx = busy ? 0 : mx; input.mz = busy ? 0 : mz;
    input.sprint = !busy && (keys.has('ShiftLeft') || keys.has('ShiftRight')) && ml > 0.01;
    input.crouch = !busy && S.crouch;
    if (busy) input.attack = input.block = false;
    // facing / aim
    const cs = p.cs, combat = input.attack || input.block || cs.state === 'windup' || cs.state === 'active' || cs.state === 'draw' || cs.state === 'cast' || cs.state === 'recover' || S.attackDown;
    if (!S.faceInit) { S.facing = p.yaw; cam.yaw = p.yaw; S.faceInit = true; }
    if (lt) S.facing = Math.atan2(lt.z - p.z, lt.x - p.x);
    else if (cam.fp || combat) S.facing += angDiff(S.facing, cam.yaw) * Math.min(1, dt * (combat ? 30 : 20));
    else if (ml > 0.1) S.facing += angDiff(S.facing, Math.atan2(mz, mx)) * Math.min(1, dt * 13);
    S.facing = ((S.facing + Math.PI) % TAU + TAU) % TAU - Math.PI;
    input.yaw = S.facing;
    input.pitch = cam.pitch;
    input.lockId = S.lock;
    if (S.attackDown) S.attackT += dt;
    if (S.heavyEdge) { input.heavy = true; S.heavyEdge = false; }
    if (busy) { input.attackPressed = input.jump = input.dodge = input.interact = input.heavy = false; input.slot = -1; }
    cam.dist = cam.wantDist;
  }
  function clearEdges() { input.attackPressed = false; input.heavy = false; input.dodge = false; input.interact = false; input.jump = false; input.slot = -1; input.cmds = []; }

  // camera placement from the interpolated player position. Terrain / buildings pull the camera in so it never goes underground.
  const tmp = { x: 0, y: 0, z: 0 };
  function placeCamera(camera, px, py, pz, dt, world, buildings) {
    const cp = Math.cos(cam.pitch), spp = Math.sin(cam.pitch), cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
    const dx = cy * cp, dy = spp, dz = sy * cp;
    if (cam.fp) {
      const ex = px + cy * 0.14, ey = py + 1.62, ez = pz + sy * 0.14;
      camera.position.set(ex, Math.max(ey, world.heightAt(ex, ez) + 0.5), ez);
      camera.lookAt(ex + dx * 10, ey + dy * 10, ez + dz * 10);
      return;
    }
    const rx = -sy, rz = cy, sh = cam.shoulder * (S.lock ? 0.6 : 1);
    const pvx = px + rx * sh, pvy = py + 1.55, pvz = pz + rz * sh;
    let dist = cam.dist, hit = dist;
    for (let t = 0.5; t <= dist + 0.3; t += 0.3) {
      const x = pvx - dx * t, y = pvy - dy * t, z = pvz - dz * t;
      if (y < world.heightAt(x, z) + 0.35 || insideBuilding(x, y, z, buildings)) { hit = Math.max(0.6, t - 0.4); break; }
    }
    cam.curDist += (hit - cam.curDist) * Math.min(1, dt * (hit < cam.curDist ? 22 : 4));
    const d = Math.min(cam.curDist, hit < cam.curDist ? hit : cam.curDist);
    tmp.x = pvx - dx * d; tmp.y = pvy - dy * d; tmp.z = pvz - dz * d;
    tmp.y = Math.max(tmp.y, world.heightAt(tmp.x, tmp.z) + 0.35);
    camera.position.set(tmp.x, tmp.y, tmp.z);
    camera.lookAt(pvx + dx * 6, pvy + dy * 6 - 0.15, pvz + dz * 6);
  }
  function insideBuilding(x, y, z, bl) {
    if (!bl) return false;
    for (const b of bl) {
      if (b.solid === false || y > (b.h || 6) + 1) continue;
      const ddx = x - b.x, ddz = z - b.z; if (Math.abs(ddx) > 12 || Math.abs(ddz) > 12) continue;
      const c = Math.cos(b.rot || 0), s = Math.sin(b.rot || 0), lx = ddx * c + ddz * s, lz = -ddx * s + ddz * c;
      if (Math.abs(lx) < b.w / 2 && Math.abs(lz) < b.d / 2) return true;
    }
    return false;
  }
  function dispose() {
    window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey); window.removeEventListener('blur', onBlur);
    canvas.removeEventListener('mousedown', onMouseDown); window.removeEventListener('mouseup', onMouseUp); window.removeEventListener('mousemove', onMove);
    canvas.removeEventListener('wheel', onWheel); canvas.removeEventListener('contextmenu', prevent); document.removeEventListener('pointerlockchange', onLockChange);
    if (document.pointerLockElement === canvas) document.exitPointerLock();
  }
  return { input, cam, keys, queue, update, clearEdges, placeCamera, lockTarget, lockNext, lockPointer, dispose, state: S, get locked() { return locked; }, get lockId() { return S.lock; },
    get firstPerson() { return cam.fp; }, setFirstPerson(v) { cam.fp = !!v; } };
}
