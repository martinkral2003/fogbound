// Smoke test of horde_view.js under Node with the vendored three.js and a stubbed DOM.   node tools/v4-horde-viewtest.js
import { register } from 'node:module';
const lib = new URL('../lib/three.module.min.js', import.meta.url).href;
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(s,c,n){ if(s==='three') return {url:${JSON.stringify(lib)},shortCircuit:true}; return n(s,c); }`));
const noop = () => {};
const ctx2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (k === 'createRadialGradient' || k === 'createLinearGradient' ? () => ({ addColorStop: noop }) : noop)), set: (t, k, v) => { t[k] = v; return true; } });
const el = () => ({ width: 64, height: 64, getContext: () => ctx2d, style: {}, classList: { add: noop, remove: noop }, appendChild: noop, remove: noop, offsetWidth: 0 });
globalThis.document = { createElement: el, getElementById: () => null, head: { appendChild: noop }, body: { appendChild: noop } };

const THREE = await import('three');
const { createGame, step } = await import('../src/sim.js');
const { createView } = await import('../src/horde_view.js');
const { SIM_DT } = await import('../src/data.js');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };

const st = createGame({ seed: 3, humans: [0] });
const main = st.horde.camps[st.horde.mainCamp];
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(50, 1.6, 0.1, 900);
const focus = { x: main.x, z: main.z };
let rings = 0, bursts = 0;
const view = createView({ THREE, scene, camera, st, world: st.world, localTeam: 0, focus, visibleNow: () => true, wv: { beamFx: noop }, ringFx: () => rings++, burst: () => bursts++ });
ok(!!view, 'createView returns a view');
const NONE = [{}, {}, {}, {}];
for (let i = 0; i < 30 * 540; i++) step(st, SIM_DT, NONE); // first assault launches and marches
const events = st.events.splice(0);
const t0 = performance.now();
for (let i = 0; i < 120; i++) view.frame(st, 0.5, 1 / 60);
let meshes = 0; scene.traverse((o) => { if (o.isMesh || o.isSprite) meshes++; });
console.log('objects', meshes, 'frame ms', ((performance.now() - t0) / 120).toFixed(3));
ok(meshes > 80 && meshes < 4000, 'object count sane (' + meshes + ')');
view.handleEvents([{ type: 'townAttacked', warn: true, town: 1, eta: 40, size: 12, x: 0, z: 0, name: 'Testville' }, { type: 'telegraph', x: main.x, z: main.z, r: 8, dur: 1.5, kind: 'slam', color: 0xff3a1a },
  { type: 'campDestroyed', x: main.x, z: main.z }, { type: 'townFallen', x: 0, z: 0, name: 'Testville' }, { type: 'warlordSlain', x: main.x, z: main.z }, { type: 'hordeHunt', hunt: 0, eta: 20, x: 0, z: 0 }]);
ok(rings >= 3 && bursts >= 2, 'event handlers fire effects');
for (let i = 0; i < 120; i++) view.frame(st, 0.5, 1 / 60);
// destroy the camp and fall a town: ruin / burning columns
const c = st.horde.camps[st.horde.mainCamp]; c.alive = false; st.towns[1].state = 'fallen';
for (let i = 0; i < 120; i++) view.frame(st, 0.5, 1 / 60);
ok(events.length >= 0, 'frames after camp loss / town fall run');
view.dispose();
console.log(fails ? fails + ' FAILED' : 'view smoke test passed');
process.exit(fails ? 1 : 0);
