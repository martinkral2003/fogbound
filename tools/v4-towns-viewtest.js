// Smoke test of src/towns_view.js under Node with the vendored three.js and a stubbed DOM: node tools/v4-towns-viewtest.js
import { register } from 'node:module';
const lib = new URL('../lib/three.module.min.js', import.meta.url).href;
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(s,c,n){ if(s==='three') return {url:${JSON.stringify(lib)},shortCircuit:true}; return n(s,c); }`));
const noop = () => {};
const ctx2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (k === 'createRadialGradient' || k === 'createLinearGradient' ? () => ({ addColorStop: noop }) : noop)), set: (t, k, v) => { t[k] = v; return true; } });
globalThis.document = { createElement: () => ({ width: 64, height: 64, getContext: () => ctx2d, style: {}, appendChild: noop }), body: { appendChild: noop } };

const THREE = await import('three');
const { createGame, step } = await import('../src/sim.js');
const { createView } = await import('../src/towns_view.js');
const T = await import('../src/towns.js');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };

const st = createGame({ seed: 3, humans: [0] });
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(50, 1.6, 0.1, 900);
let rings = 0, bursts = 0;
const focus = { x: 0, z: 0 };
const view = createView({ THREE, scene, camera, st, world: st.world, localTeam: 0, wv: {}, ringFx: () => rings++, burst: () => bursts++, focus, visibleNow: () => true });
ok(!!view, 'createView returns a view');
for (const t of st.towns) {
  focus.x = t.x; focus.z = t.z;
  const t0 = performance.now();
  for (let i = 0; i < 5; i++) view.frame(st, 0, 1 / 30);
  const ms = performance.now() - t0;
  let tris = 0, objs = 0; scene.traverse((o) => { if (o.isMesh && o.visible) { objs++; tris += (o.geometry.attributes.position.count / 3) | 0; } });
  console.log(`${t.kind} ${t.name}: build+5 frames ${ms.toFixed(0)} ms, visible meshes ${objs}, tris ${tris}`);
  ok(objs >= 1 && tris > 200, t.name + ' has geometry');
}
// fall + reclaim rebuilds
const cap = T.capitalOf(st);
focus.x = cap.x; focus.z = cap.z;
view.frame(st, 0, 1 / 30);
T.setTownState(st, cap.id, 'besieged'); T.setTownState(st, cap.id, 'fallen');
view.handleEvents([{ type: 'townFallen', town: cap.id, x: cap.x, z: cap.z }, { type: 'townAttacked', town: cap.id, x: cap.x, z: cap.z }, { type: 'townSaved', town: cap.id, x: cap.x, z: cap.z }]);
for (let i = 0; i < 6; i++) view.frame(st, 0, 1 / 30);
ok(rings >= 3 && bursts >= 3, 'event handlers fire effects');
T.setTownState(st, cap.id, 'safe');
for (let i = 0; i < 6; i++) view.frame(st, 0, 1 / 30);
// NPCs appear near a town
let humans = 0; scene.traverse((o) => { if (o.userData && o.userData.legL) humans++; });
ok(humans > 0, 'NPC models exist (' + humans + ')');
const t0 = performance.now(); for (let i = 0; i < 120; i++) view.frame(st, 0, 1 / 60);
const per = (performance.now() - t0) / 120;
console.log('frame ms', per.toFixed(3));
ok(per < 3, 'frame cost small');
view.dispose();
console.log(fails ? fails + ' FAILED' : 'view smoke test passed');
process.exit(fails ? 1 : 0);
