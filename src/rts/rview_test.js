// Visual test harness for the RTS renderer (rts-view-test.html). ?scene=base|army|sheet|blds|siege&cam=x,z,yaw,pitch,dist&sim=1&fog=0&n=extraUnits
import { createRts, step } from './core.js';
import * as Units from './units.js';
import * as Buildings from './buildings.js';
import * as Walls from './walls.js';
import * as Siege from './siege.js';
import * as Terr from './territory.js';
import { createRtsRenderer } from './render.js';
import { ROSTER } from './roster.js';
import { BUILDINGS } from './bdata.js';

const Q = new URLSearchParams(location.search);
const st = createRts({ seed: +(Q.get('seed') || 1337), humans: [0] });
Walls.ensureDefs && Walls.ensureDefs(); Siege.ensureUnits && Siege.ensureUnits();
const canvas = document.getElementById('gl');
const r = createRtsRenderer(canvas, st, 0);
const FK = ['necro', 'orc', 'demon', 'cult'];
const view = { cam: { x: 0, z: 0, yaw: 0, pitch: 0.96, dist: 70 }, selection: new Set(), hover: 0, ghosts: [], rallies: [], pings: [], drag: null, showTerritory: false, fogOn: Q.get('fog') !== '0' };
const scene = Q.get('scene') || 'base';
const hearts = st.world.hearts;
const mk = (type, team, x, z, rot = 0, o = {}) => { const b = Buildings.create(st, type, team, x, z, rot, { instant: true, ...o }); if (Walls.initPiece) Walls.initPiece(st, b); return b; };
const unit = (type, team, x, z, o = {}) => { try { return Units.spawn(st, type, team, x, z, o); } catch (e) { console.warn('spawn', type, e.message); return null; } };
const types = (f) => Object.values(ROSTER).filter((d) => d.faction === f);

function place(list, fn) { for (const p of list) fn(p); }
if (scene === 'base' || scene === 'baseNight') {
  const h = hearts[0], cx = h.x, cz = h.z;
  const pieces = Walls.rect(cx, cz, 9, 9, 0, { corner: 'arrow_tower', gate: 'gatehouse', gateDir: [1, 0] });
  const bs = pieces.map((p) => mk(p.type, 0, p.x, p.z, p.rot));
  const inside = [['barracks', -9, -9, 0], ['archery', 9, -10, 0], ['forge', -10, 10, 0], ['house', 8, 9, 0], ['house', 13, 5, 0], ['house', 3, 14, 0], ['storehouse', -3, 13, 0], ['sanctum', 12, -2, 0], ['soul_altar', -13, 0, 0], ['market', 0, -14, 0]];
  for (const [t, dx, dz, rot] of inside) if (BUILDINGS[t]) mk(t, 0, cx + dx, cz + dz, rot);
  const b2 = mk('barracks', 0, cx + 22, cz + 24, 0.3); b2.state = 'building'; b2.progress = 0.5; b2.hp = b2.maxHp * 0.5;
  const dm = bs.filter((b) => b.wall && b.wall.piece === 'wall'); dm.slice(0, 6).forEach((b, i) => { b.hp = b.maxHp * (0.12 + i * 0.12); });
  if (dm[8]) { dm[8].hp = 0; dm[8].state = 'ruin'; }
  const g = bs.find((b) => b.wall && b.wall.piece === 'gate' || b.type === 'gatehouse'); if (g) g.wall.open = true;
  for (let i = 0; i < 12; i++) unit(FK[0] + (i % 3 ? '_skeleton' : '_archer'), 0, cx - 6 + (i % 6) * 2, cz + 4 + Math.floor(i / 6) * 2);
  view.cam = { x: cx + 2, z: cz + 2, yaw: +(Q.get('yaw') || 0.5), pitch: 0.95, dist: 62 };
  const enemy = [['orc_grunt', -2, 28], ['orc_troll', 2, 30], ['orc_wolfrider', 5, 28]]; for (const [t, dx, dz] of enemy) unit(t, 1, cx + dx, cz + dz);
} else if (scene === 'sheet') {
  st.ents.length = 0; st.blds.length = 0; st.nodes.length = 0;
  const cx = -130, cz = 130;
  FK.forEach((f, row) => types(f).forEach((d, i) => unit(d.type, row, cx + i * 3.2 - 18, cz + row * 4 - 6, { face: 0 })));
  for (const u of st.ents) if (u.team >= 0 && Math.abs(u.z) > 30) { /* base crowd stays far away */ }
  view.cam = { x: cx, z: cz - 2, yaw: +(Q.get('yaw') || 0), pitch: 0.75, dist: +(Q.get('dist') || 28) };
} else if (scene === 'blds') {
  const names = Object.keys(BUILDINGS).filter((k) => !(BUILDINGS[k].wall));
  FK.forEach((f, row) => names.forEach((t, i) => { if (BUILDINGS[t].faction !== 'all' && BUILDINGS[t].faction !== f) return; mk(t, row, -90 + (i % 8) * 14, -40 + row * 20 + Math.floor(i / 8) * 0, 0); }));
  view.cam = { x: -40, z: -20, yaw: 0.2, pitch: 0.8, dist: 110 };
} else if (scene === 'siege') {
  st.ents.length = 0; st.blds.length = 0; st.nodes.length = 0;
  const cx = -130, cz = 130, names = Object.keys(Siege.SIEGE_DEFS);
  names.forEach((n, i) => { const f = FK.indexOf(n.split('_')[0]); unit(n, f, cx - 22 + (i % 7) * 7, cz - 6 + Math.floor(i / 7) * 9, { face: 0 }); });
  view.cam = { x: cx, z: cz, yaw: +(Q.get('yaw') || 0.4), pitch: 0.7, dist: +(Q.get('dist') || 34) };
} else if (scene === 'perf') {
  let walls = 0;
  for (let t = 0; t < 4; t++) {
    const h = hearts[t];
    for (const n of [5, 8, 11, 14, 17]) { for (const p of Walls.rect(h.x, h.z, n, n, 0, { corner: 'arrow_tower', gate: 'gatehouse' })) { if (walls >= 640) break; mk(p.type, t, p.x, p.z, p.rot); walls++; } }
    for (const [ty, dx, dz] of [['barracks', -9, -9], ['archery', 9, -10], ['forge', -10, 10], ['house', 8, 9], ['sanctum', 12, -2], ['market', 0, -14]]) if (BUILDINGS[ty]) mk(ty, t, h.x + dx, h.z + dz, 0);
    const ts = types(FK[t]).filter((d) => d.role !== 'general');
    for (let i = 0; i < 75; i++) { const d = ts[i % ts.length]; unit(d.type, t, h.x + (i % 15) * 2 - 14, h.z + 20 + Math.floor(i / 15) * 2.2); }
  }
  view.cam = { x: hearts[0].x, z: hearts[0].z + 10, yaw: 0.3, pitch: 0.9, dist: +(Q.get('dist') || 80) };
  console.log('walls', walls, 'ents', st.ents.length, 'blds', st.blds.length);
} else if (scene === 'wild') {
  const seen = new Set(); const keep = [];
  for (const u of st.ents) if (u.team < 0 && !seen.has(u.type)) { seen.add(u.type); keep.push(u); }
  st.ents.length = 0; st.blds.length = 0;
  keep.forEach((u, i) => { u.x = -130 + (i % 8) * 6 - 20; u.z = 130 + Math.floor(i / 8) * 8 - 4; u.y = st.world.heightAt(u.x, u.z); u.ox = u.x; u.oz = u.z; st.ents.push(u); });
  view.cam = { x: -130, z: 130, yaw: 0.3, pitch: 0.7, dist: 40 };
} else if (scene === 'army') {
  const cx = hearts[0].x + 20, cz = hearts[0].z + 20;
  let k = 0;
  FK.forEach((f, row) => { for (let i = 0; i < +(Q.get('n') || 12); i++) { const ts = types(f).filter((d) => d.role !== 'general'); const d = ts[i % ts.length]; unit(d.type, row, cx + (i % 10) * 2.3 - 10, cz + row * 7 + Math.floor(i / 10) * 2.3); k++; } });
  view.cam = { x: cx, z: cz + 8, yaw: 0, pitch: 0.9, dist: 50 };
}
if (Q.get('terr')) { Terr.recompute(st); view.showTerritory = true; }
if (Q.get('ghost')) { const h = hearts[0]; const gl = Walls.line(h.x + 24, h.z - 30, h.x + 24, h.z + 6, { type: 'wall', gateAt: 'mid' }); view.ghosts = gl.map((p, i) => ({ type: p.type, x: p.x, z: p.z, rot: p.rot, ok: i < gl.length - 2 })); view.ghosts.push({ type: 'barracks', x: h.x - 30, z: h.z + 22, rot: 0.3, ok: true }); view.rallies = [{ x: h.x + 14, z: h.z + 18 }]; view.pings = [{ x: h.x + 8, z: h.z + 26, age: 0.3, kind: 'move' }, { x: h.x + 2, z: h.z + 28, age: 0.5, kind: 'attack' }]; }
if (Q.get('selb')) { for (const b of st.blds) if (b.team === 0 && (b.type === 'keep' || b.type === 'barracks' || b.type === 'forge')) view.selection.add(b.id); view.hover = (st.blds.find((b) => b.type === 'sanctum') || {}).id || 0; }
const camQ = Q.get('cam'); if (camQ) { const [x, z, yaw, pitch, dist] = camQ.split(',').map(Number); Object.assign(view.cam, { x, z, yaw, pitch, dist }); }
if (Q.get('sel')) for (const u of st.ents) if (u.team === 0 && (u.id % 3 === 0)) view.selection.add(u.id);
const SPEED = +(Q.get('speed') || 1); const simOn = Q.get('sim') === '1'; let msAcc = 0, msN = 0; let acc = 0, last = performance.now(), frames = 0, fpsT = performance.now(), fps = 0;
r.fog.forceUpdate();
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (simOn) { acc += dt * SPEED; let n = 0; while (acc >= 1 / 30 && n++ < 16) { step(st, 1 / 30, {}); acc -= 1 / 30; } if (acc > 1 / 30) acc = 0; } else st.events.length = 0;
  r.handleEvents(st.events); st.events.length = 0;
  const t0 = performance.now(); r.frame(st, simOn ? acc * 30 : 1, dt, view); msAcc += performance.now() - t0; msN++;
  frames++; if (now - fpsT > 1000) { fps = frames * 1000 / (now - fpsT); frames = 0; fpsT = now; }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
window.T = { st, r, view, step: (n = 1) => { for (let i = 0; i < n; i++) step(st, 1 / 30, {}); }, fps: () => fps, info: () => ({ ms: +(msAcc / Math.max(1, msN)).toFixed(2),  calls: r.renderer.info.render.calls, tris: r.renderer.info.render.triangles, fps, ents: st.ents.length, blds: st.blds.length }), mk, unit };
